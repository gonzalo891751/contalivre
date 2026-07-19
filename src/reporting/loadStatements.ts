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
import { getExercise, exerciseIdForYear } from '../accounting/application/contextService'
import { buildStatements } from './engine/buildStatements'
import { buildCashFlows } from './engine/buildCashFlow'
import type { ReportingInput, StatementsBundle } from './domain/types'

export async function loadReportingInput(year: number): Promise<ReportingInput> {
    const ctx = await resolveContextForYear(year)
    const exercise = await getExercise(exerciseIdForYear(year))
    const [entries, openingBalances, accounts, allocationRules] = await Promise.all([
        getEntriesForContext(ctx),
        getOpeningBalances(ctx),
        db.accounts.toArray(),
        db.expenseAllocationRules.toArray(),
    ])
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
    }
}

export interface LoadStatementsOptions {
    /** adjunta comparativo del ejercicio anterior (derivado con el mismo motor) */
    withComparative?: boolean
}

export async function loadStatementsForYear(
    year: number,
    options: LoadStatementsOptions = {}
): Promise<StatementsBundle> {
    const input = await loadReportingInput(year)

    if (options.withComparative) {
        const prevInput = await loadReportingInput(year - 1)
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
