import { describe, it, expect } from 'vitest'
import { buildTaxSettlementEntryLines, computeTaxSettlementRemaining } from './settlements'

describe('tax settlements', () => {
    it('builds a payable entry with splits', () => {
        const lines = buildTaxSettlementEntryLines({
            direction: 'PAYABLE',
            amount: 1500,
            obligationAccountId: 'ivaAPagar',
            splits: [{ accountId: 'bank', amount: 1500 }],
            method: 'VEP',
            memoBase: 'IVA 2025-01',
        })

        expect(lines[0]).toMatchObject({ accountId: 'ivaAPagar', debit: 1500, credit: 0 })
        expect(lines[1]).toMatchObject({ accountId: 'bank', debit: 0, credit: 1500 })
    })

    it('builds a receivable entry with splits', () => {
        const lines = buildTaxSettlementEntryLines({
            direction: 'RECEIVABLE',
            amount: 800,
            obligationAccountId: 'ivaAFavor',
            splits: [{ accountId: 'bank', amount: 800 }],
            method: 'TRANSFERENCIA',
            memoBase: 'IVA 2025-01',
        })

        expect(lines[0]).toMatchObject({ accountId: 'ivaAFavor', debit: 0, credit: 800 })
        expect(lines[1]).toMatchObject({ accountId: 'bank', debit: 800, credit: 0 })
    })

    it('calculates remaining when there are partial settlements', () => {
        const remaining = computeTaxSettlementRemaining(1000, 250)
        expect(remaining).toBeCloseTo(750, 2)
    })
})
