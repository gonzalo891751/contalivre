import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { computeTrialBalance } from '../core/balance'
import { computeStatements } from '../core/statements'
import type { Account, JournalEntry, StatementGroup, BalanceSheet } from '../core/models'
import { usePeriodYear } from './usePeriodYear'

// Chart colors consistent with ContaLivre brand
const CHART_COLORS = {
    CASH_AND_BANKS: '#3B82F6',     // Blue
    TRADE_RECEIVABLES: '#10B981',  // Green
    INVENTORIES: '#F59E0B',        // Amber
    PPE: '#8B5CF6',                // Violet
    OTHER: '#94A3B8',              // Slate
    TRADE_PAYABLES: '#EF4444',     // Red
    TAX_LIABILITIES: '#F97316',    // Orange
    LOANS: '#6366F1',              // Indigo
    PAYROLL_LIABILITIES: '#EC4899', // Pink
}

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

    // Totals by category
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

    // KPI ratios
    kpis: {
        workingCapital: number
        currentRatio: number
        acidTest: number
        solvencyRatio: number
        equityRatio: number
    }

    // Chart data
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

    // Recent activity
    recentActivity: RecentActivity[]
}

/**
 * Computes how many journal lines reference non-existent accounts
 */
function computeUnmappedCount(entries: JournalEntry[], accounts: Account[]): number {
    const accountIds = new Set(accounts.map(a => a.id))
    const accountCodes = new Set(accounts.map(a => a.code))

    let count = 0
    for (const entry of entries) {
        for (const line of entry.lines) {
            // Skip empty lines
            if (!line.accountId) continue
            // Check by ID first, then by code
            if (!accountIds.has(line.accountId) && !accountCodes.has(line.accountId)) {
                count++
            }
        }
    }
    return count
}

/**
 * Extract total for a specific statementGroup from a section
 */
function extractByGroup(section: { accounts: Array<{ account: Account; balance: number }> }, group: StatementGroup): number {
    return section.accounts
        .filter(a => a.account.statementGroup === group)
        .reduce((sum, a) => sum + Math.abs(a.balance), 0)
}

/**
 * Build composition chart data from section accounts
 */
function buildCompositionData(
    balanceSheet: BalanceSheet,
    sections: Array<'currentAssets' | 'nonCurrentAssets' | 'currentLiabilities' | 'nonCurrentLiabilities'>,
    colorMap: Record<string, string>
): ChartDataPoint[] {
    const groupTotals = new Map<string, number>()

    for (const sectionKey of sections) {
        const section = balanceSheet[sectionKey]
        for (const { account, balance } of section.accounts) {
            const group = account.statementGroup || 'OTHER'
            const current = groupTotals.get(group) || 0
            groupTotals.set(group, current + Math.abs(balance))
        }
    }

    // Map statementGroup to readable Spanish labels
    const labels: Record<string, string> = {
        CASH_AND_BANKS: 'Caja y Bancos',
        TRADE_RECEIVABLES: 'Créditos',
        OTHER_RECEIVABLES: 'Otros Créditos',
        TAX_CREDITS: 'Créditos Fiscales',
        INVENTORIES: 'Bienes de Cambio',
        PPE: 'Bienes de Uso',
        INTANGIBLES: 'Intangibles',
        INVESTMENTS: 'Inversiones',
        TRADE_PAYABLES: 'Proveedores',
        TAX_LIABILITIES: 'Deudas Fiscales',
        PAYROLL_LIABILITIES: 'Deudas Laborales',
        LOANS: 'Préstamos',
        OTHER_PAYABLES: 'Otras Deudas',
        DEFERRED_INCOME: 'Ingresos Diferidos',
        OTHER: 'Otros',
    }

    const result: ChartDataPoint[] = []

    for (const [group, value] of groupTotals.entries()) {
        if (value > 0) {
            result.push({
                name: labels[group] || group,
                value: Math.round(value * 100) / 100,
                color: colorMap[group] || CHART_COLORS.OTHER,
            })
        }
    }

    // Sort by value descending
    result.sort((a, b) => b.value - a.value)

    return result
}

/**
 * Custom hook that provides all dashboard metrics
 */
export function useDashboardMetrics(): DashboardMetrics {
    const { start: periodStart, end: periodEnd } = usePeriodYear()
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.where('date').between(periodStart, periodEnd, true, true).reverse().toArray(), [periodStart, periodEnd])

    return useMemo(() => {
        // Loading state
        if (!accounts || !entries) {
            return {
                isLoading: true,
                hasCOA: false,
                unmappedCount: 0,
                isSetupComplete: false,
                hasEntries: false,
                totals: {
                    cash: 0,
                    inventories: 0,
                    assetsCurrent: 0,
                    assetsNonCurrent: 0,
                    assetsTotal: 0,
                    liabilitiesCurrent: 0,
                    liabilitiesNonCurrent: 0,
                    liabilitiesTotal: 0,
                    equity: 0,
                },
                kpis: {
                    workingCapital: 0,
                    currentRatio: 0,
                    acidTest: 0,
                    solvencyRatio: 0,
                    equityRatio: 0,
                },
                charts: {
                    equation: [],
                    assetsComposition: [],
                    liabilitiesComposition: [],
                },
                recentActivity: [],
            }
        }

        // Setup state
        const hasCOA = accounts.length > 0
        const hasEntries = entries.length > 0
        const unmappedCount = computeUnmappedCount(entries, accounts)
        const isSetupComplete = hasCOA && unmappedCount === 0

        // Compute financial data
        let totals = {
            cash: 0,
            inventories: 0,
            assetsCurrent: 0,
            assetsNonCurrent: 0,
            assetsTotal: 0,
            liabilitiesCurrent: 0,
            liabilitiesNonCurrent: 0,
            liabilitiesTotal: 0,
            equity: 0,
        }

        let charts = {
            equation: [] as Array<{
                name: string
                activoCorriente: number
                activoNoCorriente: number
                pasivoCorriente: number
                pasivoNoCorriente: number
                pn: number
            }>,
            assetsComposition: [] as ChartDataPoint[],
            liabilitiesComposition: [] as ChartDataPoint[],
        }

        if (hasCOA && hasEntries) {
            const ledger = computeLedger(entries, accounts)
            const trialBalance = computeTrialBalance(ledger, accounts)
            const statements = computeStatements(trialBalance, accounts)
            const { balanceSheet } = statements

            // Extract totals
            const assetsNonCurrent = balanceSheet.nonCurrentAssets.netTotal
            const liabilitiesNonCurrent = balanceSheet.nonCurrentLiabilities.netTotal

            totals = {
                cash: extractByGroup(balanceSheet.currentAssets, 'CASH_AND_BANKS'),
                inventories: extractByGroup(balanceSheet.currentAssets, 'INVENTORIES'),
                assetsCurrent: balanceSheet.currentAssets.netTotal,
                assetsNonCurrent,
                assetsTotal: balanceSheet.totalAssets,
                liabilitiesCurrent: balanceSheet.currentLiabilities.netTotal,
                liabilitiesNonCurrent,
                liabilitiesTotal: balanceSheet.totalLiabilities,
                equity: balanceSheet.totalEquity,
            }

            // Equation chart data (for segmented stacked bar)
            charts.equation = [
                {
                    name: 'Activo',
                    activoCorriente: totals.assetsCurrent,
                    activoNoCorriente: assetsNonCurrent,
                    pasivoCorriente: 0,
                    pasivoNoCorriente: 0,
                    pn: 0,
                },
                {
                    name: 'Origen',
                    activoCorriente: 0,
                    activoNoCorriente: 0,
                    pasivoCorriente: totals.liabilitiesCurrent,
                    pasivoNoCorriente: liabilitiesNonCurrent,
                    pn: totals.equity,
                },
            ]

            // Composition charts
            charts.assetsComposition = buildCompositionData(
                balanceSheet,
                ['currentAssets', 'nonCurrentAssets'],
                CHART_COLORS
            )

            charts.liabilitiesComposition = buildCompositionData(
                balanceSheet,
                ['currentLiabilities', 'nonCurrentLiabilities'],
                CHART_COLORS
            )
        }

        // KPI calculations
        const workingCapital = totals.assetsCurrent - totals.liabilitiesCurrent
        const currentRatio = totals.liabilitiesCurrent > 0
            ? totals.assetsCurrent / totals.liabilitiesCurrent
            : 0
        const acidTest = totals.liabilitiesCurrent > 0
            ? (totals.assetsCurrent - totals.inventories) / totals.liabilitiesCurrent
            : 0
        const solvencyRatio = totals.liabilitiesTotal > 0
            ? totals.assetsTotal / totals.liabilitiesTotal
            : 0
        const equityRatio = totals.assetsTotal > 0
            ? totals.equity / totals.assetsTotal
            : 0

        // Recent activity (last 5 entries)
        const recentActivity: RecentActivity[] = entries.slice(0, 5).map(entry => {
            const totalAmount = entry.lines.reduce((sum, line) => sum + line.debit, 0)
            return {
                id: entry.id,
                date: formatDate(entry.date),
                concept: entry.memo || 'Sin concepto',
                amount: totalAmount,
            }
        })

        return {
            isLoading: false,
            hasCOA,
            unmappedCount,
            isSetupComplete,
            hasEntries,
            totals,
            kpis: {
                workingCapital,
                currentRatio,
                acidTest,
                solvencyRatio,
                equityRatio,
            },
            charts,
            recentActivity,
        }
    }, [accounts, entries])
}

/**
 * Format ISO date to short Spanish format
 */
function formatDate(isoDate: string): string {
    try {
        const date = new Date(isoDate)
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
        })
    } catch {
        return isoDate
    }
}
