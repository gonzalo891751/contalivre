/**
 * Auditoría E2E — devoluciones en el puente del costo de ventas (DEF-A02).
 *
 * En inventario permanente el plan de cuentas base no trae `costComponent`,
 * así que el puente clasificaba por el único criterio disponible: débito a
 * existencias = compra, crédito = consumo. Con ese criterio:
 *
 *  - la devolución AL PROVEEDOR (crédito a Mercaderías contra Proveedores) se
 *    contaba como costo de ventas, y
 *  - el reingreso al costo de una devolución DE UN CLIENTE (débito a
 *    Mercaderías contra CMV) se contaba como compra.
 *
 * El ESP y el ER quedaban bien, pero el puente difería y la compuerta de
 * publicación bloqueaba estados correctos, culpando a "bajas/ajustes de
 * inventario" inexistentes.
 *
 * Lo que NO debe cambiar: una salida de existencias contra una cuenta de
 * resultado distinta del costo (un siniestro) tiene que seguir exponiéndose.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const acc = (
    id: string, code: string, name: string,
    kind: Account['kind'], statementGroup: Account['statementGroup'],
    section: Account['section'] = 'CURRENT'
): Account => ({
    id, code, name, kind, section, group: name, statementGroup,
    parentId: null, level: 2,
    normalSide: kind === 'ASSET' || kind === 'EXPENSE' ? 'DEBIT' : 'CREDIT',
    isContra: false, isHeader: false,
})

const ACCOUNTS: Account[] = [
    acc('caja', '1.1.01.01', 'Caja', 'ASSET', 'CASH_AND_BANKS'),
    acc('mercaderias', '1.1.04.01', 'Mercaderías', 'ASSET', 'INVENTORIES'),
    acc('proveedores', '2.1.01.01', 'Proveedores', 'LIABILITY', 'TRADE_PAYABLES'),
    acc('capital', '3.1.01', 'Capital social', 'EQUITY', 'CAPITAL'),
    acc('ventas', '4.1.01', 'Ventas', 'INCOME', 'SALES', 'OPERATING'),
    acc('cmv', '4.3.01', 'Costo mercaderías vendidas', 'EXPENSE', 'COGS', 'COST'),
    acc('siniestros', '4.7.05', 'Siniestros', 'EXPENSE', 'OTHER_EXPENSES', 'OTHER'),
]

let seq = 0
const entry = (date: string, lines: JournalEntry['lines'], memo = 'mov'): JournalEntry => ({
    id: `e${++seq}`, date, memo, status: 'POSTED', lines,
} as JournalEntry)

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

const makeInput = (entries: JournalEntry[]): ReportingInput =>
    ({ context: CTX, entries, openingBalances: new Map(), accounts: ACCOUNTS }) as unknown as ReportingInput

describe('puente del costo de ventas con devoluciones (inventario permanente)', () => {
    it('la devolución al proveedor resta de las compras y no infla el costo', () => {
        const s = buildStatements(makeInput([
            entry('2025-01-10', [
                { accountId: 'caja', debit: 1000, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 1000 },
            ]),
            entry('2025-02-01', [
                { accountId: 'mercaderias', debit: 700, credit: 0 },
                { accountId: 'proveedores', debit: 0, credit: 700 },
            ]),
            // devolución al proveedor: sale mercadería, NO hay costo
            entry('2025-02-15', [
                { accountId: 'proveedores', debit: 100, credit: 0 },
                { accountId: 'mercaderias', debit: 0, credit: 100 },
            ]),
            entry('2025-03-01', [
                { accountId: 'cmv', debit: 400, credit: 0 },
                { accountId: 'mercaderias', debit: 0, credit: 400 },
            ]),
        ]))
        const b = s.costOfSales

        expect(b.purchases.amount).toBe(700)
        expect(b.purchaseReturns.amount).toBe(100)
        expect(b.goodsAvailableForSale.amount).toBe(600)
        expect(b.closingInventory.amount).toBe(200)
        expect(b.costOfSales.amount).toBe(400)
        expect(b.costOfSalesPerIncomeStatement).toBe(400)
        expect(b.validations.every(v => v.passed)).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'cmv-puente')?.passed).toBe(true)
    })

    it('el reingreso al costo de una devolución de cliente reduce el costo, no es una compra', () => {
        const s = buildStatements(makeInput([
            entry('2025-01-10', [
                { accountId: 'caja', debit: 1000, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 1000 },
            ]),
            entry('2025-02-01', [
                { accountId: 'mercaderias', debit: 700, credit: 0 },
                { accountId: 'caja', debit: 0, credit: 700 },
            ]),
            entry('2025-03-01', [
                { accountId: 'cmv', debit: 400, credit: 0 },
                { accountId: 'mercaderias', debit: 0, credit: 400 },
            ]),
            // devolución de un cliente: la mercadería vuelve, a su costo
            entry('2025-03-20', [
                { accountId: 'mercaderias', debit: 90, credit: 0 },
                { accountId: 'cmv', debit: 0, credit: 90 },
            ]),
        ]))
        const b = s.costOfSales

        expect(b.purchases.amount).toBe(700)
        expect(b.goodsAvailableForSale.amount).toBe(700)
        expect(b.closingInventory.amount).toBe(390)
        expect(b.costOfSales.amount).toBe(310)
        expect(b.costOfSalesPerIncomeStatement).toBe(310)
        expect(b.validations.every(v => v.passed)).toBe(true)
    })

    it('una salida contra otra cuenta de resultado sigue exponiendo la diferencia', () => {
        const s = buildStatements(makeInput([
            entry('2025-01-10', [
                { accountId: 'caja', debit: 1000, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 1000 },
            ]),
            entry('2025-02-01', [
                { accountId: 'mercaderias', debit: 700, credit: 0 },
                { accountId: 'caja', debit: 0, credit: 700 },
            ]),
            entry('2025-03-01', [
                { accountId: 'cmv', debit: 500, credit: 0 },
                { accountId: 'mercaderias', debit: 0, credit: 500 },
            ]),
            entry('2025-06-01', [
                { accountId: 'siniestros', debit: 80, credit: 0 },
                { accountId: 'mercaderias', debit: 0, credit: 80 },
            ]),
        ]))
        const b = s.costOfSales

        expect(b.costOfSales.amount).toBe(580)
        expect(b.costOfSalesPerIncomeStatement).toBe(500)
        expect(b.validations.find(v => v.id === 'cmv-er')?.passed).toBe(false)
        expect(s.validation.checks.find(c => c.id === 'cmv-puente')?.passed).toBe(false)
    })
})
