import { describe, it, expect } from 'vitest'
import { buildTaxObligationRecord, computeTaxObligationStatus, upsertObligationByUniqueKey } from './obligations'
import { buildTaxObligationKey, type TaxObligationRecord } from './types'

describe('tax obligations', () => {
    it('creates obligation when amount due is greater than zero', () => {
        const obligation = buildTaxObligationRecord({
            taxType: 'IVA',
            taxPeriod: '2025-01',
            jurisdiction: 'NACIONAL',
            dueDate: '2025-02-18',
            amountDue: 1000,
        })

        expect(obligation).not.toBeNull()
        expect(obligation?.amountDue).toBe(1000)
        expect(obligation?.status).toBe('PENDING')
    })

    it('sets PARTIAL status for partial payments', () => {
        const status = computeTaxObligationStatus(1000, 250)
        expect(status).toBe('PARTIAL')
    })

    it('sets PAID status for full payments', () => {
        const status = computeTaxObligationStatus(1000, 1000)
        expect(status).toBe('PAID')
    })

    it('upserts by uniqueKey without duplicating', () => {
        const uniqueKey = buildTaxObligationKey('IIBB', '2025-02', 'CORRIENTES')
        const existing: TaxObligationRecord[] = [
            {
                id: 'ob-1',
                uniqueKey,
                taxType: 'IIBB',
                taxPeriod: '2025-02',
                jurisdiction: 'CORRIENTES',
                dueDate: '2025-03-15',
                amountDue: 800,
                status: 'PENDING',
                createdAt: '2025-02-01',
                updatedAt: '2025-02-01',
            },
        ]

        const next = {
            ...existing[0],
            id: 'ob-2',
            amountDue: 1200,
            updatedAt: '2025-02-10',
        }

        const result = upsertObligationByUniqueKey(existing, next)
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('ob-2')
        expect(result[0].amountDue).toBe(1200)
    })
})
