/**
 * Adaptador Dexie → motor de reporting (única puerta de carga).
 *
 * Todos los consumidores (UI, PDF, XLSX, indicadores) deben obtener el
 * StatementsBundle desde acá: mismo contexto, mismo modelo, mismas cifras.
 */

import { db } from '../storage/db'
import {
    getEntriesForContext,
    getOpeningBalances,
    resolveContextForYear,
} from '../accounting/reporting/reportingContext'
import { DEFAULT_COMPANY_ID } from '../accounting/migration/migrateV17'
import { getExercise } from '../accounting/application/contextService'
import { buildStatements } from './engine/buildStatements'
import { buildCashFlows } from './engine/buildCashFlow'
import { loadForeignCurrencyDetails } from './loadForeignCurrency'
import type { ReportingInput, StatementsBundle } from './domain/types'

/**
 * Opciones de carga (Fase 2K §5): `companyId` selecciona la entidad del grupo.
 * Omitirlo mantiene el comportamiento histórico (empresa por defecto).
 */
export interface LoadReportingInputOptions {
    companyId?: string
}

export async function loadReportingInput(
    year: number,
    options: LoadReportingInputOptions = {}
): Promise<ReportingInput> {
    const ctx = await resolveContextForYear(year, { companyId: options.companyId })
    const exercise = await getExercise(ctx.exerciseId)
    // Los módulos operativos (moneda extranjera, fichas de bienes de uso) todavía
    // no llevan dimensión de empresa. Para la empresa por defecto se cargan tal
    // como siempre; para otra entidad del grupo se informa SIN ese detalle en
    // lugar de atribuirle posiciones y fichas que no son suyas.
    const isDefaultCompany = ctx.companyId === DEFAULT_COMPANY_ID
    const [entries, openingBalances, accounts, allocationRules, allDisclosures, foreignCurrencyDetails, fixedAssetFichas] = await Promise.all([
        getEntriesForContext(ctx),
        getOpeningBalances(ctx),
        db.accounts.toArray(),
        db.expenseAllocationRules.toArray(),
        db.manualDisclosures.where('exerciseId').equals(ctx.exerciseId).toArray(),
        isDefaultCompany ? loadForeignCurrencyDetails(ctx.periodEnd) : Promise.resolve([]),
        // Fichas de bienes de uso (Fase 2J §8): permiten reexpresar la
        // depreciación bien por bien en vez de con el promedio de la clase.
        isDefaultCompany ? db.fixedAssets.toArray().catch(() => []) : Promise.resolve([]),
    ])
    // vigentes = las que ninguna otra reemplaza
    const superseded = new Set(allDisclosures.map(d => d.supersedesId).filter(Boolean))
    const manualDisclosures = allDisclosures.filter(d => !superseded.has(d.id))
    return {
        context: {
            companyId: ctx.companyId,
            exerciseId: ctx.exerciseId,
            exerciseLabel: exercise?.name ?? `Ejercicio ${year}`,
            periodStart: ctx.periodStart,
            periodEnd: ctx.periodEnd,
        },
        entries,
        openingBalances,
        accounts,
        allocationRules,
        manualDisclosures,
        foreignCurrencyDetails,
        fixedAssetFichas,
    }
}

export interface LoadStatementsOptions extends LoadReportingInputOptions {
    /** adjunta comparativo del ejercicio anterior (derivado con el mismo motor) */
    withComparative?: boolean
}

export async function loadStatementsForYear(
    year: number,
    options: LoadStatementsOptions = {}
): Promise<StatementsBundle> {
    const input = await loadReportingInput(year, options)

    if (options.withComparative) {
        const prevInput = await loadReportingInput(year - 1, options)
        if (prevInput.entries.length > 0 || prevInput.openingBalances.size > 0) {
            input.comparative = buildStatements(prevInput)
        }
    }

    const bundle = buildStatements(input)
    const cashFlows = buildCashFlows(input, bundle)
    bundle.cashFlowDirect = cashFlows.direct
    bundle.cashFlowIndirect = cashFlows.indirect
    bundle.validation = cashFlows.validation
    return bundle
}
