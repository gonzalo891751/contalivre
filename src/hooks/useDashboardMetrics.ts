/**
 * useDashboardMetrics — Fase 2F (§14): el Dashboard deriva TODAS sus cifras
 * financieras del motor canónico (loadReportingBundle), igual que Estados.
 *
 * Ya NO usa core/statements, core/ledger ni core/balance: activo, pasivo, PN,
 * efectivo, liquidez y composición salen del mismo ReportingBundle, de modo
 * que Inicio y Estados muestran exactamente los mismos totales. Solo la
 * detección de setup y la actividad reciente usan una consulta liviana.
 */

import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import type { Account, JournalEntry, StatementGroup } from '../core/models'
import type { ReportLine } from '../reporting/domain/types'
import { usePeriodYear } from './usePeriodYear'
import { useReportingBundle } from './useReportingBundle'

interface ChartDataPoint {
    name: string
    value: number
    color: string
}

interface RecentActivity {
    id: string
    date: string
    concept: string
    amount: number
}

export interface DashboardMetrics {
    isLoading: boolean
    hasCOA: boolean
    unmappedCount: number
    isSetupComplete: boolean
    hasEntries: boolean
    totals: {
        cash: number
        inventories: number
        assetsCurrent: number
        assetsNonCurrent: number
        assetsTotal: number
        liabilitiesCurrent: number
        liabilitiesNonCurrent: number
        liabilitiesTotal: number
        equity: number
    }
    kpis: {
        workingCapital: number
        currentRatio: number
        acidTest: number
        solvencyRatio: number
        equityRatio: number
    }
    charts: {
        equation: Array<{
            name: string
            activoCorriente: number
            activoNoCorriente: number
            pasivoCorriente: number
            pasivoNoCorriente: number
            pn: number
        }>
        assetsComposition: ChartDataPoint[]
        liabilitiesComposition: ChartDataPoint[]
    }
    recentActivity: RecentActivity[]
}

const CHART_COLORS: Record<string, string> = {
    CASH_AND_BANKS: '#10B981', TRADE_RECEIVABLES: '#3B82F6', OTHER_RECEIVABLES: '#6366F1',
    TAX_CREDITS: '#8B5CF6', INVENTORIES: '#F59E0B', PPE: '#EF4444', INTANGIBLES: '#EC4899',
    INVESTMENTS: '#14B8A6', TRADE_PAYABLES: '#F97316', TAX_LIABILITIES: '#DC2626',
    PAYROLL_LIABILITIES: '#7C3AED', LOANS: '#DB2777', OTHER_PAYABLES: '#0EA5E9',
    DEFERRED_INCOME: '#64748B', OTHER: '#94A3B8',
}

const GROUP_LABELS: Record<string, string> = {
    CASH_AND_BANKS: 'Caja y Bancos', TRADE_RECEIVABLES: 'Créditos', OTHER_RECEIVABLES: 'Otros Créditos',
    TAX_CREDITS: 'Créditos Fiscales', INVENTORIES: 'Bienes de Cambio', PPE: 'Bienes de Uso',
    INTANGIBLES: 'Intangibles', INVESTMENTS: 'Inversiones', TRADE_PAYABLES: 'Proveedores',
    TAX_LIABILITIES: 'Deudas Fiscales', PAYROLL_LIABILITIES: 'Deudas Laborales', LOANS: 'Préstamos',
    OTHER_PAYABLES: 'Otras Deudas', DEFERRED_INCOME: 'Ingresos Diferidos', OTHER: 'Otros',
}

const EMPTY_METRICS: DashboardMetrics = {
    isLoading: true, hasCOA: false, unmappedCount: 0, isSetupComplete: false, hasEntries: false,
    totals: { cash: 0, inventories: 0, assetsCurrent: 0, assetsNonCurrent: 0, assetsTotal: 0, liabilitiesCurrent: 0, liabilitiesNonCurrent: 0, liabilitiesTotal: 0, equity: 0 },
    kpis: { workingCapital: 0, currentRatio: 0, acidTest: 0, solvencyRatio: 0, equityRatio: 0 },
    charts: { equation: [], assetsComposition: [], liabilitiesComposition: [] },
    recentActivity: [],
}

function computeUnmappedCount(entries: JournalEntry[], accounts: Account[]): number {
    const ids = new Set(accounts.map(a => a.id))
    const codes = new Set(accounts.map(a => a.code))
    let count = 0
    for (const entry of entries) {
        for (const line of entry.lines) {
            if (!line.accountId) continue
            if (!ids.has(line.accountId) && !codes.has(line.accountId)) count++
        }
    }
    return count
}

/** Suma por statementGroup los importes de las cuentas (level 2) de una sección canónica */
function compositionByGroup(section: ReportLine, groupOf: Map<string, StatementGroup | null>): ChartDataPoint[] {
    const totals = new Map<string, number>()
    const walk = (l: ReportLine) => {
        if (l.level === 2 && l.accountIds.length === 1) {
            const g = groupOf.get(l.accountIds[0]) ?? 'OTHER'
            totals.set(g, (totals.get(g) ?? 0) + Math.abs(l.amount))
        }
        for (const c of l.children ?? []) walk(c)
    }
    walk(section)
    return [...totals.entries()]
        .filter(([, v]) => v > 0)
        .map(([g, v]) => ({ name: GROUP_LABELS[g] ?? g, value: Math.round(v * 100) / 100, color: CHART_COLORS[g] ?? CHART_COLORS.OTHER }))
        .sort((a, b) => b.value - a.value)
}

function sumGroup(section: ReportLine, groupOf: Map<string, StatementGroup | null>, group: StatementGroup): number {
    let total = 0
    const walk = (l: ReportLine) => {
        if (l.level === 2 && l.accountIds.length === 1 && groupOf.get(l.accountIds[0]) === group) total += Math.abs(l.amount)
        for (const c of l.children ?? []) walk(c)
    }
    walk(section)
    return total
}

export function useDashboardMetrics(): DashboardMetrics {
    const { year, start: periodStart, end: periodEnd } = usePeriodYear()
    const { bundle, loading } = useReportingBundle(year)
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(
        () => db.entries.where('date').between(periodStart, periodEnd, true, true).reverse().toArray(),
        [periodStart, periodEnd])

    return useMemo(() => {
        if (loading || !bundle || !accounts || !entries) return EMPTY_METRICS

        const hasCOA = accounts.length > 0
        const hasEntries = entries.length > 0
        const unmappedCount = computeUnmappedCount(entries, accounts)
        const isSetupComplete = hasCOA && unmappedCount === 0

        const groupOf = new Map(accounts.map(a => [a.id, a.statementGroup]))
        const bs = bundle.statements.balanceSheet

        const totals = {
            cash: sumGroup(bs.currentAssets, groupOf, 'CASH_AND_BANKS'),
            inventories: sumGroup(bs.currentAssets, groupOf, 'INVENTORIES'),
            assetsCurrent: bs.currentAssets.amount,
            assetsNonCurrent: bs.nonCurrentAssets.amount,
            assetsTotal: bs.totalAssets.amount,
            liabilitiesCurrent: bs.currentLiabilities.amount,
            liabilitiesNonCurrent: bs.nonCurrentLiabilities.amount,
            liabilitiesTotal: bs.totalLiabilities.amount,
            equity: bs.equity.amount,
        }

        const charts = {
            equation: [
                { name: 'Activo', activoCorriente: totals.assetsCurrent, activoNoCorriente: totals.assetsNonCurrent, pasivoCorriente: 0, pasivoNoCorriente: 0, pn: 0 },
                { name: 'Origen', activoCorriente: 0, activoNoCorriente: 0, pasivoCorriente: totals.liabilitiesCurrent, pasivoNoCorriente: totals.liabilitiesNonCurrent, pn: totals.equity },
            ],
            assetsComposition: [...compositionByGroup(bs.currentAssets, groupOf), ...compositionByGroup(bs.nonCurrentAssets, groupOf)].sort((a, b) => b.value - a.value),
            liabilitiesComposition: [...compositionByGroup(bs.currentLiabilities, groupOf), ...compositionByGroup(bs.nonCurrentLiabilities, groupOf)].sort((a, b) => b.value - a.value),
        }

        const kpis = {
            workingCapital: totals.assetsCurrent - totals.liabilitiesCurrent,
            currentRatio: totals.liabilitiesCurrent > 0 ? totals.assetsCurrent / totals.liabilitiesCurrent : 0,
            acidTest: totals.liabilitiesCurrent > 0 ? (totals.assetsCurrent - totals.inventories) / totals.liabilitiesCurrent : 0,
            solvencyRatio: totals.liabilitiesTotal > 0 ? totals.assetsTotal / totals.liabilitiesTotal : 0,
            equityRatio: totals.assetsTotal > 0 ? totals.equity / totals.assetsTotal : 0,
        }

        const recentActivity: RecentActivity[] = entries.slice(0, 5).map(entry => ({
            id: entry.id,
            date: formatDate(entry.date),
            concept: entry.memo || 'Sin concepto',
            amount: entry.lines.reduce((sum, line) => sum + line.debit, 0),
        }))

        return { isLoading: false, hasCOA, unmappedCount, isSetupComplete, hasEntries, totals, kpis, charts, recentActivity }
    }, [bundle, loading, accounts, entries])
}

function formatDate(isoDate: string): string {
    try {
        return new Date(isoDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
    } catch {
        return isoDate
    }
}
