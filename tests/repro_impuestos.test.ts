import { describe, it, expect } from 'vitest'
import { computeIVATotalsFromEntries, applyIVACarry } from '../src/core/impuestos/iva'
import type { JournalEntry } from '../src/core/models'

describe('IVA Audit Reproduction', () => {
    // Accounts
    const accounts = {
        ivaDF: '2.1.03.01',
        ivaCF: '1.1.03.01',
        retencionSufrida: '1.1.03.07',
        percepcionSufrida: '1.1.03.08',
        ivaAFavor: '1.1.03.06',
        ivaAPagar: '2.1.03.04'
    }

    const accountIds = {
        ivaDFId: accounts.ivaDF,
        ivaCFId: accounts.ivaCF,
        retencionSufridaId: accounts.retencionSufrida,
        percepcionIVASufridaId: accounts.percepcionSufrida
    }

    it('Scenario 1: Month 1 generates IVA Balance in Favor', () => {
        // DF = 1000, CF = 1200 => Balance = -200 (Favor)
        const entries: JournalEntry[] = [
            {
                id: '1', date: '2026-01-10', memo: 'Venta', lines: [
                    { accountId: accounts.ivaDF, credit: 1000, debit: 0, description: 'DF' }
                ]
            } as JournalEntry,
            {
                id: '2', date: '2026-01-15', memo: 'Compra', lines: [
                    { accountId: accounts.ivaCF, debit: 1200, credit: 0, description: 'CF' }
                ]
            } as JournalEntry
        ]

        const result = computeIVATotalsFromEntries(entries, accountIds)
        
        expect(result.debitoFiscal).toBe(1000)
        expect(result.creditoFiscal).toBe(1200)
        expect(result.saldo).toBe(-200) // Negative means Asset (Favor)
    })

    it('Scenario 2: Month 2 has DF > CF, applies carry when prev month is closed', () => {
        // Month 1 left a balance of -200 in account 1.1.03.06 (IVA a Favor)
        // Month 2: DF = 2000, CF = 1500 => Period Result = 500 (Payable)
        // Expected with carry-forward: 500 - 200 = 300 Payable
        // Expected (fixed): 300 Payable

        const entriesM2: JournalEntry[] = [
             {
                id: '3', date: '2026-02-10', memo: 'Venta', lines: [
                    { accountId: accounts.ivaDF, credit: 2000, debit: 0, description: 'DF' }
                ]
            } as JournalEntry,
            {
                id: '4', date: '2026-02-15', memo: 'Compra', lines: [
                    { accountId: accounts.ivaCF, debit: 1500, credit: 0, description: 'CF' }
                ]
            } as JournalEntry
        ]

        const baseTotals = computeIVATotalsFromEntries(entriesM2, accountIds)
        const result = applyIVACarry(baseTotals, { carryIvaFavor: 200, carryAvailable: true })

        expect(result.debitoFiscal).toBe(2000)
        expect(result.creditoFiscal).toBe(1500)
        expect(result.saldo).toBe(300)
        expect(result.ivaFavorAnteriorAplicado).toBe(200)
    })

    it('Scenario 3: Month 2 ignores carry when prev month is not closed', () => {
        const entriesM2: JournalEntry[] = [
            {
                id: '3', date: '2026-02-10', memo: 'Venta', lines: [
                    { accountId: accounts.ivaDF, credit: 2000, debit: 0, description: 'DF' }
                ]
            } as JournalEntry,
            {
                id: '4', date: '2026-02-15', memo: 'Compra', lines: [
                    { accountId: accounts.ivaCF, debit: 1500, credit: 0, description: 'CF' }
                ]
            } as JournalEntry
        ]

        const baseTotals = computeIVATotalsFromEntries(entriesM2, accountIds)
        const result = applyIVACarry(baseTotals, { carryIvaFavor: 200, carryAvailable: false })

        expect(result.saldo).toBe(500)
        expect(result.ivaFavorAnterior).toBe(0)
    })

    it('Scenario 4: Payments on Account (Retenciones) are deducted', () => {
        // DF = 1000, CF = 0, Ret = 100 => Saldo = 900
        const entries: JournalEntry[] = [
            {
                id: '1', date: '2026-01-10', memo: 'Venta', lines: [
                    { accountId: accounts.ivaDF, credit: 1000, debit: 0, description: 'DF' }
                ]
            } as JournalEntry,
            {
                id: '2', date: '2026-01-15', memo: 'Cobro con Retencion', lines: [
                    { accountId: accounts.retencionSufrida, debit: 100, credit: 0, description: 'Retencion' }
                ]
            } as JournalEntry
        ]

        const result = computeIVATotalsFromEntries(entries, accountIds)
        
        expect(result.retencionesSufridas).toBe(100)
        expect(result.pagosACuenta).toBe(100)
        expect(result.saldo).toBe(900)
    })
})
