/**
 * Fase 2H §H8 — Contenido del anexo de moneda extranjera.
 *
 * En la entrega parcial sólo se había corregido la accesibilidad (la pestaña
 * quedaba deshabilitada). Acá se completa el CONTENIDO exigido por §9:
 * clasificación corriente/no corriente, totales por naturaleza y diferencias de
 * cambio del ejercicio.
 *
 * Regla que se mantiene: no se inventa nada. Sin detalle operativo, cantidad y
 * cotización quedan como "información insuficiente"; sin cuentas mapeadas a la
 * nota de diferencias de cambio, el importe NO se informa como cero.
 */

import { describe, it, expect } from 'vitest'
import { buildForeignCurrency } from '../../src/reporting/engine/foreignCurrency'
import type { Account } from '../../src/core/models'
import type { NormalizedTrialBalance, ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1',
    exerciseId: 'ex-2026',
    exerciseLabel: 'Ejercicio 2026',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: 'CURRENT',
        group: 'Test',
        statementGroup: null,
        parentId: null,
        level: 3,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
        ...partial,
    } as Account
}

function tb(rows: Array<{ accountId: string; code: string; name: string; closing?: number; periodDebit?: number; periodCredit?: number }>): NormalizedTrialBalance {
    return {
        rows: rows.map(r => ({
            accountId: r.accountId,
            code: r.code,
            name: r.name,
            kind: 'ASSET',
            isContra: false,
            opening: 0,
            periodDebit: r.periodDebit ?? 0,
            periodCredit: r.periodCredit ?? 0,
            closing: r.closing ?? 0,
            entryIds: ['e1'],
            unknownAccount: false,
        })),
        totalPeriodDebit: 0,
        totalPeriodCredit: 0,
        totalOpeningDebit: 0,
        totalOpeningCredit: 0,
        isBalanced: true,
    } as NormalizedTrialBalance
}

const build = (accounts: Account[], rows: Parameters<typeof tb>[0], details?: ReportingInput['foreignCurrencyDetails']) =>
    buildForeignCurrency(
        { context: CTX, entries: [], openingBalances: new Map(), accounts, foreignCurrencyDetails: details } as unknown as ReportingInput,
        tb(rows)
    )

const CAJA_USD = account({ id: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', kind: 'ASSET', currency: 'USD', section: 'CURRENT' })
const DEUDA_USD = account({ id: 'deuda-usd', code: '2.2.01.10', name: 'Préstamo en USD', kind: 'LIABILITY', currency: 'USD', section: 'NON_CURRENT' })

describe('Fase 2H §H8 — clasificación corriente / no corriente', () => {
    it('clasifica cada partida y no la infiere por el nombre', () => {
        const d = build(
            [CAJA_USD, DEUDA_USD],
            [
                { accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 },
                { accountId: 'deuda-usd', code: '2.2.01.10', name: 'Préstamo en USD', closing: -300000 },
            ]
        )

        const caja = d.rows.find(r => r.accountId === 'caja-usd')!
        const deuda = d.rows.find(r => r.accountId === 'deuda-usd')!
        expect(caja.currentClassification).toBe('CURRENT')
        expect(deuda.currentClassification).toBe('NON_CURRENT')
    })

    it('el mapping explícito manda sobre la sección', () => {
        const raro = account({
            id: 'x', code: '1.1.09.99', name: 'Cuenta especial', kind: 'ASSET',
            currency: 'EUR', section: 'CURRENT', currentClassification: 'NON_CURRENT',
        })
        const d = build([raro], [{ accountId: 'x', code: '1.1.09.99', name: 'Cuenta especial', closing: 5000 }])
        expect(d.rows[0].currentClassification).toBe('NON_CURRENT')
    })
})

describe('Fase 2H §H8 — totales por naturaleza', () => {
    it('separa activos, pasivos y posición neta', () => {
        const d = build(
            [CAJA_USD, DEUDA_USD],
            [
                { accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 },
                { accountId: 'deuda-usd', code: '2.2.01.10', name: 'Préstamo en USD', closing: -300000 },
            ]
        )

        expect(d.totals.assets).toBe(100000)
        expect(d.totals.liabilities).toBe(300000)
        expect(d.totals.net).toBe(-200000)
    })
})

describe('Fase 2H §H8 — diferencias de cambio', () => {
    const DIFF = account({
        id: 'dif', code: '4.6.03', name: 'Diferencia de cambio', kind: 'INCOME',
        section: 'FINANCIAL', notesGroup: 'Diferencias de cambio',
    })

    it('informa el resultado neto cuando hay cuentas mapeadas a la nota', () => {
        const d = build(
            [CAJA_USD, DIFF],
            [
                { accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 },
                { accountId: 'dif', code: '4.6.03', name: 'Diferencia de cambio', periodCredit: 45000, periodDebit: 5000 },
            ]
        )

        expect(d.exchangeDifferences.status).toBe('CALCULATED')
        // Ganancia neta = 45.000 − 5.000
        expect(d.exchangeDifferences.total).toBe(40000)
        expect(d.exchangeDifferences.accountIds).toContain('dif')
    })

    it('sin cuentas mapeadas NO informa cero: declara información insuficiente', () => {
        const d = build([CAJA_USD], [{ accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 }])

        expect(d.exchangeDifferences.status).toBe('INSUFFICIENT_INFORMATION')
        expect(d.exchangeDifferences.accountIds).toHaveLength(0)
        expect(d.exchangeDifferences.detail).toContain('Diferencias de cambio')
    })

    it('identifica las cuentas por mapping, nunca por su nombre', () => {
        // Cuenta llamada "Diferencia de cambio" pero SIN la nota asignada.
        const sinMapping = account({
            id: 'trampa', code: '4.6.99', name: 'Diferencia de cambio', kind: 'INCOME', section: 'FINANCIAL',
        })
        const d = build(
            [CAJA_USD, sinMapping],
            [
                { accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 },
                { accountId: 'trampa', code: '4.6.99', name: 'Diferencia de cambio', periodCredit: 99999 },
            ]
        )
        expect(d.exchangeDifferences.status).toBe('INSUFFICIENT_INFORMATION')
    })
})

describe('Fase 2H §H8 — no se inventan datos', () => {
    it('sin detalle operativo, cantidad y cotización quedan insuficientes', () => {
        const d = build([CAJA_USD], [{ accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 }])

        expect(d.rows[0].quantityStatus).toBe('INSUFFICIENT_INFORMATION')
        expect(d.rows[0].quantity).toBeUndefined()
        expect(d.rows[0].rate).toBeUndefined()
        // La medición sigue siendo la del Diario.
        expect(d.rows[0].measurement).toBe(100000)
    })

    it('con detalle operativo expone la diferencia contra el Diario en vez de ocultarla', () => {
        const d = build(
            [CAJA_USD],
            [{ accountId: 'caja-usd', code: '1.1.01.10', name: 'Caja USD', closing: 100000 }],
            [{ ledgerAccountId: 'caja-usd', currency: 'USD', quantity: 100, rate: 900, rateSource: 'BNA', rateDate: '2026-12-31' }] as ReportingInput['foreignCurrencyDetails']
        )

        expect(d.rows[0].quantityStatus).toBe('CALCULATED')
        expect(d.rows[0].impliedMeasurement).toBe(90000)
        // 100.000 del Diario contra 90.000 implícitos: la diferencia se expone.
        expect(d.rows[0].reconciliationDifference).toBe(10000)
        expect(d.reconciled).toBe(false)
    })

    it('sin partidas en divisa el anexo no es aplicable y no inventa totales', () => {
        const soloPesos = account({ id: 'caja', code: '1.1.01.01', name: 'Caja', kind: 'ASSET', currency: 'ARS' })
        const d = build([soloPesos], [{ accountId: 'caja', code: '1.1.01.01', name: 'Caja', closing: 500000 }])

        expect(d.applicable).toBe(false)
        expect(d.rows).toHaveLength(0)
        expect(d.totals.assets).toBe(0)
        expect(d.totals.net).toBe(0)
        expect(Object.is(d.totals.net, -0)).toBe(false)
    })
})
