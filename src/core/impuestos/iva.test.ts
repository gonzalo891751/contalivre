import { describe, it, expect } from 'vitest'
import { computeIVATotalsFromEntries, applyIVACarry } from './iva'
import type { JournalEntry } from '../models'

describe('computeIVATotalsFromEntries', () => {
    it('nets IVA DF/CF with returns and keeps sign', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2025-01-05',
                memo: 'Venta',
                lines: [{ accountId: 'ivaDF', debit: 0, credit: 30240 }],
            },
            {
                id: 'e2',
                date: '2025-01-10',
                memo: 'Devolucion venta',
                lines: [{ accountId: 'ivaDF', debit: 5040, credit: 0 }],
            },
            {
                id: 'e3',
                date: '2025-01-12',
                memo: 'Compra',
                lines: [{ accountId: 'ivaCF', debit: 12000, credit: 0 }],
            },
            {
                id: 'e4',
                date: '2025-01-15',
                memo: 'Devolucion compra',
                lines: [{ accountId: 'ivaCF', debit: 0, credit: 2000 }],
            },
            {
                id: 'e5',
                date: '2025-01-20',
                memo: 'Retencion sufrida',
                lines: [{ accountId: 'retSuf', debit: 1000, credit: 0 }],
            },
            {
                id: 'e6',
                date: '2025-01-22',
                memo: 'Percepcion sufrida',
                lines: [{ accountId: 'percSuf', debit: 500, credit: 0 }],
            },
        ]

        const totals = computeIVATotalsFromEntries(entries, {
            ivaDFId: 'ivaDF',
            ivaCFId: 'ivaCF',
            retencionSufridaId: 'retSuf',
            percepcionIVASufridaId: 'percSuf',
        })

        expect(totals.debitoFiscal).toBe(25200)
        expect(totals.creditoFiscal).toBe(10000)
        expect(totals.pagosACuenta).toBe(1500)
        expect(totals.saldo).toBe(13700)
    })

    it('calculates IVA DF neto as credit minus debit', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2025-01-05',
                memo: 'Venta',
                lines: [{ accountId: 'ivaDF', debit: 0, credit: 30240 }],
            },
            {
                id: 'e2',
                date: '2025-01-12',
                memo: 'Devolucion',
                lines: [{ accountId: 'ivaDF', debit: 1890, credit: 0 }],
            },
        ]

        const totals = computeIVATotalsFromEntries(entries, {
            ivaDFId: 'ivaDF',
        })

        expect(totals.debitoFiscal).toBe(28350)
    })
})

describe('applyIVACarry', () => {
    it('applies carry to a payable position', () => {
        const base = {
            debitoFiscal: 2000,
            creditoFiscal: 1500,
            pagosACuenta: 0,
            saldo: 500,
        }

        const totals = applyIVACarry(base, { carryIvaFavor: 200, carryAvailable: true })

        expect(totals.ivaFavorAnterior).toBe(200)
        expect(totals.ivaFavorAnteriorAplicado).toBe(200)
        expect(totals.ivaAPagar).toBe(300)
        expect(totals.saldo).toBe(300)
    })

    it('keeps saldo a favor when carry exceeds payable', () => {
        const base = {
            debitoFiscal: 2000,
            creditoFiscal: 1500,
            pagosACuenta: 0,
            saldo: 500,
        }

        const totals = applyIVACarry(base, { carryIvaFavor: 700, carryAvailable: true })

        expect(totals.ivaFavorAnteriorAplicado).toBe(500)
        expect(totals.ivaAPagar).toBe(0)
        expect(totals.ivaAFavorFinal).toBe(200)
        expect(totals.saldo).toBe(-200)
    })

    it('combines carry with new saldo a favor', () => {
        const base = {
            debitoFiscal: 1000,
            creditoFiscal: 1500,
            pagosACuenta: 0,
            saldo: -500,
        }

        const totals = applyIVACarry(base, { carryIvaFavor: 200, carryAvailable: true })

        expect(totals.ivaAFavorDelMes).toBe(500)
        expect(totals.ivaAFavorFinal).toBe(700)
        expect(totals.saldo).toBe(-700)
    })
})
