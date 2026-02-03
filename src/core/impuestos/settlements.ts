import type { EntryLine } from '../models'
import type { TaxPaymentMethod, TaxSettlementDirection, TaxType } from './types'

const SETTLEMENT_EPSILON = 0.01

export function buildTaxSettlementObligationId(params: {
    tax: TaxType
    periodKey: string
    direction: TaxSettlementDirection
    jurisdiction?: string
    sourceTaxEntryId?: string
}): string {
    const base = `${params.tax}:${params.periodKey}:${params.direction}:${params.jurisdiction || 'GENERAL'}`
    return params.sourceTaxEntryId ? `${base}:${params.sourceTaxEntryId}` : base
}

export function computeTaxSettlementRemaining(amountTotal: number, amountSettled: number): number {
    const remaining = amountTotal - amountSettled
    return remaining > SETTLEMENT_EPSILON ? remaining : 0
}

export function buildTaxSettlementEntryLines(input: {
    direction: TaxSettlementDirection
    amount: number
    obligationAccountId: string
    splits: Array<{ accountId: string; amount: number }>
    method: TaxPaymentMethod | string
    memoBase: string
}): EntryLine[] {
    const actionLabel = input.direction === 'RECEIVABLE' ? 'Cobro' : 'Pago'
    const obligationLine: EntryLine = input.direction === 'RECEIVABLE'
        ? {
            accountId: input.obligationAccountId,
            debit: 0,
            credit: input.amount,
            description: `Aplicacion ${input.memoBase}`,
        }
        : {
            accountId: input.obligationAccountId,
            debit: input.amount,
            credit: 0,
            description: `Cancelacion ${input.memoBase}`,
        }

    const splitLines = input.splits.map(split => ({
        accountId: split.accountId,
        debit: input.direction === 'RECEIVABLE' ? split.amount : 0,
        credit: input.direction === 'PAYABLE' ? split.amount : 0,
        description: `${actionLabel} ${input.method}`,
    }))

    return [obligationLine, ...splitLines]
}
