import { describe, it, expect } from 'vitest'

// Mock types
type Account = { id: string; code: string; name: string; isHeader: boolean }
type TaxSettlementObligation = {
    id: string
    tax: 'RET_DEPOSITAR'
    direction: 'PAYABLE'
    amountTotal: number
    amountSettled: number
    amountRemaining: number
    periodKey: string
    status: 'PENDING'
}
type RegisterTaxPaymentInput = {
    paidAt: string
    method: 'VEP'
    amount: number
    splits: { accountId: string; amount: number }[]
}

// Mock of the problematic function logic (simplified from src/storage/impuestos.ts)
async function buildTaxSettlementEntryPreviewMock(
    obligation: TaxSettlementObligation,
    input: RegisterTaxPaymentInput,
    accounts: Account[]
) {
    // Logic from resolveTaxLiabilityAccountId -> resolveMappedAccountId
    const resolveTaxLiabilityAccountIdMock = (tax: string) => {
        if (tax === 'RET_DEPOSITAR') {
            const fallback = accounts.find(acc => acc.code === '2.1.03.03' && !acc.isHeader)
            if (fallback) {
                return { accountId: fallback.id, label: 'Retenciones a depositar' }
            }
            // Simulate missing account (neither mapped nor found by fallback)
            return {
                accountId: null,
                label: 'Retenciones a depositar',
                missingAccountCode: '2.1.03.03',
                missingMappingKey: 'retencionPracticada',
            }
        }
        return { accountId: 'some-id', label: 'Other' }
    }

    const accountResult = resolveTaxLiabilityAccountIdMock(obligation.tax)
    const { accountId: obligationAccountId, label } = accountResult

    if (!obligationAccountId) {
        return {
            error: `Falta cuenta del pasivo (${label}). Codigo esperado 2.1.03.03. Mapping retencionPracticada.`,
            missingAccountLabel: label,
            missingAccountCode: '2.1.03.03',
            missingMappingKey: 'retencionPracticada',
        }
    }

    return { success: true }
}

describe('Pagos Bug Reproduction', () => {
    it('Should return error (not throw) when Liability Account is missing', async () => {
        const obligation: TaxSettlementObligation = {
            id: 'obl-1',
            tax: 'RET_DEPOSITAR',
            direction: 'PAYABLE',
            amountTotal: 1000,
            amountSettled: 0,
            amountRemaining: 1000,
            periodKey: '2026-02',
            status: 'PENDING'
        }

        const input: RegisterTaxPaymentInput = {
            paidAt: '2026-02-20',
            method: 'VEP',
            amount: 1000,
            splits: [{ accountId: 'caja-id', amount: 1000 }]
        }

        // Empty accounts list simulates missing fallbacks
        const accounts: Account[] = []

        const result = await buildTaxSettlementEntryPreviewMock(obligation, input, accounts)

        expect(result).toHaveProperty('error')
        expect(result.error).toContain('Falta cuenta del pasivo (Retenciones a depositar)')
        expect(result).toHaveProperty('missingAccountLabel', 'Retenciones a depositar')
        expect(result).toHaveProperty('missingAccountCode', '2.1.03.03')
        expect(result).toHaveProperty('missingMappingKey', 'retencionPracticada')
    })

    it('Resolves liability by fallback code when account exists', async () => {
        const obligation: TaxSettlementObligation = {
            id: 'obl-2',
            tax: 'RET_DEPOSITAR',
            direction: 'PAYABLE',
            amountTotal: 1000,
            amountSettled: 0,
            amountRemaining: 1000,
            periodKey: '2026-02',
            status: 'PENDING'
        }

        const input: RegisterTaxPaymentInput = {
            paidAt: '2026-02-20',
            method: 'VEP',
            amount: 1000,
            splits: [{ accountId: 'caja-id', amount: 1000 }]
        }

        const accounts: Account[] = [{
            id: 'acc-ret',
            code: '2.1.03.03',
            name: 'Retenciones a depositar',
            isHeader: false
        }]

        const result = await buildTaxSettlementEntryPreviewMock(obligation, input, accounts)

        expect(result).not.toHaveProperty('error')
    })
})
