/**
 * ReportingBundle — Fase 2C, §5.2.
 *
 * ÚNICA capa de consulta para la página Estados, el PDF y las exportaciones.
 * Devuelve TODO lo que la UI necesita (estados, EFE, notas, indicadores,
 * análisis, comparativo, validación, metadatos) desde el motor canónico y el
 * mismo ReportingContext: nadie recalcula cifras aguas arriba.
 *
 * Regla arquitectónica (verificada por tests/acceptance/no-legacy-engines):
 * ninguna página nueva debe importar utils/resultsStatement, core/statements
 * ni domain/reports para OBTENER cifras de estados. Todo sale de acá.
 */

import { db } from '../storage/db'
import { getExercise } from '../accounting/application/contextService'
import { getSystemMeta } from '../accounting/application/contextService'
import {
    APP_VERSION,
    ACCOUNTING_ENGINE_VERSION,
    CURRENT_SCHEMA_VERSION,
    NORMATIVE_BASELINE,
} from '../accounting/migration/versions'
import { loadReportingInput } from './loadStatements'
import { buildStatements } from './engine/buildStatements'
import { buildCashFlows } from './engine/buildCashFlow'
import { buildNotes, type StatementNote } from './engine/buildNotes'
import { buildMetricsCatalog } from './metrics/metrics'
import {
    horizontalBalanceSheet,
    horizontalIncomeStatement,
    verticalBalanceSheet,
    verticalIncomeStatement,
} from './metrics/analysis'
import { reexpressCashFlow } from './engine/cashFlowInflation'
import type { MetricCatalogEntry, HorizontalAnalysisRow, VerticalAnalysisRow } from './metrics/types'
import type { CashFlowStatement2B, StatementsBundle } from './domain/types'

const COMMIT_SHA: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_COMMIT_SHA) || 'desconocido'
const BUILD_DATE: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_BUILD_DATE) || 'desconocida'

/** Estado de publicación del reporte (§5.3) */
export type ReportStatus =
    | 'LOADING'
    | 'DRAFT'          // hay borradores en el ejercicio (informativo; no bloquea reportes)
    | 'BLOCKED'        // validación con checks en rojo: no publicable
    | 'VALIDATED'      // todos los invariantes pasan

export interface ReportMetadata {
    companyId: string
    companyLegalName: string
    companyTaxId?: string
    exerciseLabel: string
    exerciseStatus: string
    periodStart: string
    periodEnd: string
    currency: string
    unit: string
    normative: string
    jurisdiction: string
    appVersion: string
    engineVersion: string
    schemaVersion: number
    commit: string
    buildDate: string
    /** versión del reporte = hash corto del contexto + contenido */
    reportVersion: string
    generatedAt: string
    hasComparative: boolean
    status: ReportStatus
}

export interface ReportingBundleAnalysis {
    verticalBalanceSheet: VerticalAnalysisRow[]
    verticalIncomeStatement: VerticalAnalysisRow[]
    horizontalBalanceSheet: HorizontalAnalysisRow[]
    horizontalIncomeStatement: HorizontalAnalysisRow[]
}

export interface ReportingBundle {
    statements: StatementsBundle
    /** EFE en moneda de cierre (null si faltan índices para reexpresar) */
    cashFlowRestated: {
        direct: CashFlowStatement2B
        indirect: CashFlowStatement2B
        blockers: string[]
    } | null
    notes: StatementNote[]
    metrics: MetricCatalogEntry[]
    analysis: ReportingBundleAnalysis
    metadata: ReportMetadata
}

export interface LoadReportingBundleOptions {
    withComparative?: boolean
    /** set de índices para el EFE en moneda de cierre (opcional) */
    inflationIndexes?: Map<string, number>
}

function hashString(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(16)
}

/**
 * Carga integral y única para un ejercicio (año calendario del selector).
 */
export async function loadReportingBundle(
    year: number,
    options: LoadReportingBundleOptions = {}
): Promise<ReportingBundle> {
    const input = await loadReportingInput(year)

    if (options.withComparative) {
        const prevInput = await loadReportingInput(year - 1)
        if (prevInput.entries.length > 0 || prevInput.openingBalances.size > 0) {
            input.comparative = buildStatements(prevInput)
        }
    }

    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    statements.cashFlowDirect = cashFlows.direct
    statements.cashFlowIndirect = cashFlows.indirect
    statements.validation = cashFlows.validation

    // EFE en moneda de cierre (Fase 2C, §9): solo si se aportan índices
    let cashFlowRestated: ReportingBundle['cashFlowRestated'] = null
    if (options.inflationIndexes && options.inflationIndexes.size > 0) {
        cashFlowRestated = reexpressCashFlow(input, statements, options.inflationIndexes)
    }

    const notes = buildNotes(input, statements)
    const metrics = buildMetricsCatalog(statements, input.accounts, input.comparative ?? null)
    const analysis: ReportingBundleAnalysis = {
        verticalBalanceSheet: verticalBalanceSheet(statements),
        verticalIncomeStatement: verticalIncomeStatement(statements),
        horizontalBalanceSheet: horizontalBalanceSheet(statements),
        horizontalIncomeStatement: horizontalIncomeStatement(statements),
    }

    // ── Metadatos ────────────────────────────────────────────
    const [company, exercise, meta, hasDrafts] = await Promise.all([
        db.companies.toCollection().first(),
        getExercise(input.context.exerciseId),
        getSystemMeta().catch(() => null),
        db.entries.where('date').between(input.context.periodStart, input.context.periodEnd, true, true)
            .filter(e => e.status === 'DRAFT').count(),
    ])

    const canPublish = statements.validation.canPublish
    const status: ReportStatus = !canPublish ? 'BLOCKED' : hasDrafts > 0 ? 'DRAFT' : 'VALIDATED'

    const contentSignature = hashString(JSON.stringify({
        ctx: input.context,
        assets: statements.balanceSheet.totalAssets.amount,
        equity: statements.balanceSheet.equity.amount,
        net: statements.incomeStatement.netIncome.amount,
        entries: input.entries.length,
    }))

    const metadata: ReportMetadata = {
        companyId: input.context.companyId,
        companyLegalName: company?.legalName ?? 'Empresa ContaLivre',
        companyTaxId: company?.taxId,
        exerciseLabel: input.context.exerciseLabel,
        exerciseStatus: exercise?.status ?? 'OPEN',
        periodStart: input.context.periodStart,
        periodEnd: input.context.periodEnd,
        currency: company?.currency ?? 'ARS',
        unit: 'Pesos ($)',
        normative: NORMATIVE_BASELINE,
        jurisdiction: company?.jurisdiction ?? 'AR',
        appVersion: meta?.appVersion ?? APP_VERSION,
        engineVersion: ACCOUNTING_ENGINE_VERSION,
        schemaVersion: meta?.schemaVersion ?? CURRENT_SCHEMA_VERSION,
        commit: COMMIT_SHA,
        buildDate: BUILD_DATE,
        reportVersion: contentSignature,
        generatedAt: new Date().toISOString(),
        hasComparative: !!input.comparative,
        status,
    }

    return { statements, cashFlowRestated, notes, metrics, analysis, metadata }
}
