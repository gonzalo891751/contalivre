/** Impacto antes/después de ajustes pendientes del papel de trabajo. */

import { toCents } from '../../accounting/domain/money'
import type { Account } from '../../core/models'
import type { StatementsBundle } from '../domain/types'
import type { ClosingWorkPaper } from './closingWorkPaperTypes'

export interface ClosingImpactSnapshot {
    assets: number
    liabilities: number
    equity: number
    result: number
    recpam: number
    cash: number
}

export interface ClosingImpact {
    before: ClosingImpactSnapshot
    adjustments: ClosingImpactSnapshot
    after: ClosingImpactSnapshot
    adjustmentCount: number
    equationDifferenceBefore: number
    equationDifferenceAfter: number
    pendingIds: string[]
}

export function buildClosingImpact(
    statements: StatementsBundle,
    accounts: Account[],
    paper: ClosingWorkPaper | null,
    currentRecpam = 0,
): ClosingImpact {
    const before: ClosingImpactSnapshot = {
        assets: statements.balanceSheet.totalAssets.amount,
        liabilities: statements.balanceSheet.totalLiabilities.amount,
        equity: statements.balanceSheet.equity.amount,
        result: statements.incomeStatement.netIncome.amount,
        recpam: currentRecpam,
        cash: statements.cashFlowDirect?.closingCash.amount ?? 0,
    }
    const deltaCents = { assets: 0, liabilities: 0, equity: 0, result: 0, recpam: 0, cash: 0 }
    const byId = new Map(accounts.map(account => [account.id, account]))
    const pending = (paper?.adjustments ?? []).filter(adjustment =>
        ['CALCULADO', 'PROPUESTO', 'APROBADO'].includes(adjustment.status))
    for (const adjustment of pending) {
        for (const line of adjustment.lines) {
            const account = byId.get(line.accountId)
            if (!account) continue
            const netDebit = toCents(line.debit) - toCents(line.credit)
            switch (account.kind) {
                case 'ASSET':
                    deltaCents.assets += netDebit
                    if (account.statementGroup === 'CASH_AND_BANKS') deltaCents.cash += netDebit
                    break
                case 'LIABILITY': deltaCents.liabilities -= netDebit; break
                case 'EQUITY': deltaCents.equity -= netDebit; break
                case 'INCOME': deltaCents.result -= netDebit; break
                case 'EXPENSE': deltaCents.result -= netDebit; break
            }
            if (adjustment.kind === 'INFLACION' && (account.kind === 'INCOME' || account.kind === 'EXPENSE')) {
                deltaCents.recpam -= netDebit
            }
        }
    }
    // Todo resultado pendiente impacta también el patrimonio del cierre.
    deltaCents.equity += deltaCents.result
    const adjustments = mapFromCents(deltaCents)
    const after = addSnapshots(before, adjustments)
    return {
        before,
        adjustments,
        after,
        adjustmentCount: pending.length,
        equationDifferenceBefore: round2(before.assets - before.liabilities - before.equity),
        equationDifferenceAfter: round2(after.assets - after.liabilities - after.equity),
        pendingIds: pending.map(adjustment => adjustment.id),
    }
}

function mapFromCents(value: Record<keyof ClosingImpactSnapshot, number>): ClosingImpactSnapshot {
    return {
        assets: value.assets / 100,
        liabilities: value.liabilities / 100,
        equity: value.equity / 100,
        result: value.result / 100,
        recpam: value.recpam / 100,
        cash: value.cash / 100,
    }
}

function addSnapshots(a: ClosingImpactSnapshot, b: ClosingImpactSnapshot): ClosingImpactSnapshot {
    return {
        assets: round2(a.assets + b.assets),
        liabilities: round2(a.liabilities + b.liabilities),
        equity: round2(a.equity + b.equity),
        result: round2(a.result + b.result),
        recpam: round2(a.recpam + b.recpam),
        cash: round2(a.cash + b.cash),
    }
}

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}
