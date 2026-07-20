/**
 * Fase 2F (§11) — Moneda extranjera con detalle operativo reconciliado.
 * El detalle (cantidad, cotización, fuente, fecha) enriquece la nota; el
 * Diario sigue siendo la fuente del saldo. La diferencia entre la medición
 * contable y la implícita (cantidad × cotización) se EXPONE, no se oculta.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ForeignCurrencyDetail, ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 800
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return { id: `w${seq}`, entryNumber: seq, date, memo: `a${seq}`, status: 'POSTED', lines, createdAt: date, updatedAt: date } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'usd', code: '1.1.05', name: 'Banco USD', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', currency: 'USD', monetaryClassification: 'MONETARY' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]

const input = (entries: JournalEntry[], details?: ForeignCurrencyDetail[]): ReportingInput =>
    ({ context: CTX, entries, openingBalances: new Map(), accounts: ACCOUNTS, foreignCurrencyDetails: details })

const BUY_USD = entry('2025-02-01', [{ accountId: 'usd', debit: 150000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 150000 }])

describe('Fase 2F — moneda extranjera reconciliada', () => {
    it('con detalle operativo que reconcilia: cantidad, cotización, fuente y diferencia 0', () => {
        const s = buildStatements(input([BUY_USD], [
            { ledgerAccountId: 'usd', currency: 'USD', quantity: 100, rate: 1500, rateType: 'Oficial', rateSource: 'Manual', rateDate: '2025-12-31' },
        ]))
        const fx = s.foreignCurrency
        expect(fx.applicable).toBe(true)
        expect(fx.reconciled).toBe(true)
        const row = fx.rows[0]
        expect(row.quantityStatus).toBe('CALCULATED')
        expect(row.quantity).toBe(100)
        expect(row.rate).toBe(1500)
        expect(row.rateSource).toBe('Manual')
        expect(row.impliedMeasurement).toBe(150000)
        expect(row.measurement).toBe(150000)
        expect(row.reconciliationDifference).toBe(0)
        expect(fx.note).toContain('reconcilia con la medición contable')
    })

    it('con detalle que NO reconcilia: la diferencia se EXPONE (el Diario manda)', () => {
        const s = buildStatements(input([BUY_USD], [
            // 100 USD × 1490 = 149.000, pero el Diario dice 150.000 ⇒ diferencia +1.000
            { ledgerAccountId: 'usd', currency: 'USD', quantity: 100, rate: 1490, rateType: 'Oficial', rateSource: 'DolarAPI', rateDate: '2025-12-30' },
        ]))
        const fx = s.foreignCurrency
        expect(fx.reconciled).toBe(false)
        const row = fx.rows[0]
        expect(row.impliedMeasurement).toBe(149000)
        expect(row.measurement).toBe(150000) // el saldo del Diario NO se toca
        expect(row.reconciliationDifference).toBe(1000)
        expect(fx.note).toContain('se exponen')
    })

    it('sin detalle operativo: cantidad/cotización insuficientes (comportamiento 2E)', () => {
        const s = buildStatements(input([BUY_USD]))
        const fx = s.foreignCurrency
        expect(fx.applicable).toBe(true)
        expect(fx.reconciled).toBe(false)
        expect(fx.rows[0].quantityStatus).toBe('INSUFFICIENT_INFORMATION')
        expect(fx.rows[0].measurement).toBe(150000)
        expect(fx.note).toContain('información insuficiente')
    })

    it('no reconcilia una cuenta cuyo detalle es de otra moneda (no se mezcla)', () => {
        const s = buildStatements(input([BUY_USD], [
            { ledgerAccountId: 'usd', currency: 'EUR', quantity: 100, rate: 1500 },
        ]))
        expect(s.foreignCurrency.rows[0].quantityStatus).toBe('INSUFFICIENT_INFORMATION')
    })
})
