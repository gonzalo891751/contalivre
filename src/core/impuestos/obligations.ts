import type { TaxObligationRecord, TaxObligationStatus, TaxType } from './types'
import { buildTaxObligationKey, generateTaxId } from './types'

const STATUS_EPSILON = 0.01

export function computeTaxObligationStatus(amountDue: number, amountPaid: number): TaxObligationStatus {
    if (amountDue <= 0) return 'NOT_APPLICABLE'
    if (amountPaid <= 0) return 'PENDING'
    if (amountPaid + STATUS_EPSILON < amountDue) return 'PARTIAL'
    return 'PAID'
}

export function buildTaxObligationRecord(input: {
    taxType: TaxType
    taxPeriod: string
    jurisdiction?: string
    dueDate: string
    amountDue: number
    createdAt?: string
}): TaxObligationRecord | null {
    if (input.amountDue <= 0) return null

    const now = input.createdAt || new Date().toISOString()
    const jurisdiction = input.jurisdiction || 'GENERAL'

    return {
        id: generateTaxId('taxob'),
        uniqueKey: buildTaxObligationKey(input.taxType, input.taxPeriod, jurisdiction),
        taxType: input.taxType,
        taxPeriod: input.taxPeriod,
        jurisdiction,
        dueDate: input.dueDate,
        amountDue: input.amountDue,
        status: computeTaxObligationStatus(input.amountDue, 0),
        createdAt: now,
        updatedAt: now,
    }
}

export function upsertObligationByUniqueKey(
    existing: TaxObligationRecord[],
    next: TaxObligationRecord
): TaxObligationRecord[] {
    const idx = existing.findIndex(item => item.uniqueKey === next.uniqueKey)
    if (idx === -1) return [...existing, next]

    const updated = [...existing]
    updated[idx] = { ...updated[idx], ...next }
    return updated
}
