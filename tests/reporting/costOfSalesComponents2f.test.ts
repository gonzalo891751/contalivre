/**
 * Fase 2F (§10) — Componentes estructurados del costo de ventas.
 * Puente ampliado con compras, devoluciones/bonificaciones, costos de
 * adquisición (fletes), otros incorporables y bajas anormales AISLADAS del
 * CMV. Sin mapping se preserva el modelo perpetuo 2E. Jamás se infiere por
 * nombre; las pérdidas anormales se exponen como diferencia real.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 700
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return { id: `k${seq}`, entryNumber: seq, date, memo: `a${seq}`, status: 'POSTED', lines, createdAt: date, updatedAt: date } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'merc', code: '1.1.04', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'CMV', kind: 'EXPENSE', statementGroup: 'COGS' }),
    // contra-cuentas con costComponent estructural (jamás por nombre). No son
    // COGS: no contaminan el CMV del ER (el costo sale del registro perpetuo).
    makeAccount({ id: 'devol', code: '2.9.01', name: 'Proveedores por devolución', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES', costComponent: 'PURCHASE_RETURNS' }),
    makeAccount({ id: 'fletes', code: '2.9.02', name: 'Fletes a pagar (activados al inventario)', kind: 'LIABILITY', statementGroup: 'OTHER_PAYABLES', costComponent: 'ACQUISITION_COST' }),
    makeAccount({ id: 'siniestro', code: '4.7.05', name: 'Siniestros', kind: 'EXPENSE', statementGroup: 'OTHER_EXPENSES', costComponent: 'ABNORMAL_LOSS' }),
]

const input = (entries: JournalEntry[], opening: [string, { debit: number; credit: number }][] = []): ReportingInput =>
    ({ context: CTX, entries, openingBalances: new Map(opening), accounts: ACCOUNTS })

describe('Fase 2F — componentes del costo de ventas', () => {
    it('puente ampliado: compras, devoluciones, fletes, baja anormal aislada, concilia con ER', () => {
        const s = buildStatements(input([
            // compra a inventario
            entry('2025-02-01', [{ accountId: 'merc', debit: 1000, credit: 0 }, { accountId: 'caja', debit: 0, credit: 1000 }]),
            // flete activado al inventario (contra ACQUISITION_COST)
            entry('2025-02-05', [{ accountId: 'merc', debit: 100, credit: 0 }, { accountId: 'fletes', debit: 0, credit: 100 }]),
            // devolución de compra (contra PURCHASE_RETURNS): sale de inventario
            entry('2025-02-10', [{ accountId: 'devol', debit: 150, credit: 0 }, { accountId: 'merc', debit: 0, credit: 150 }]),
            // costo de la venta
            entry('2025-03-01', [{ accountId: 'cmv', debit: 500, credit: 0 }, { accountId: 'merc', debit: 0, credit: 500 }]),
            // siniestro: baja anormal (contra ABNORMAL_LOSS): sale de inventario, NO es CMV
            entry('2025-06-01', [{ accountId: 'siniestro', debit: 80, credit: 0 }, { accountId: 'merc', debit: 0, credit: 80 }]),
        ], [['merc', { debit: 200, credit: 0 }], ['capital', { debit: 0, credit: 200 }]]))
        const b = s.costOfSales

        expect(b.mode).toBe('COMMERCIAL')
        expect(b.openingInventory.amount).toBe(200)
        expect(b.purchases.amount).toBe(1000)
        expect(b.purchaseReturns.amount).toBe(150)
        expect(b.purchaseReturns.status).toBe('CALCULATED')
        expect(b.acquisitionCosts.amount).toBe(100)
        // disponibles = 200 + 1000 − 150 + 100 = 1150
        expect(b.goodsAvailableForSale.amount).toBe(1150)
        // EF = 200 + (1000+100) − (150+500+80) = 570
        expect(b.closingInventory.amount).toBe(570)
        // baja anormal aislada
        expect(b.abnormalLosses.amount).toBe(80)
        expect(b.abnormalLosses.status).toBe('CALCULATED')
        // CMV = 1150 − 570 − 80 = 500 = CMV del ER
        expect(b.costOfSales.amount).toBe(500)
        expect(b.costOfSalesPerIncomeStatement).toBe(500)
        // ahora SÍ concilia (la baja anormal no ensucia el CMV)
        expect(b.validations.find(v => v.id === 'cmv-er')?.passed).toBe(true)
        expect(b.validations.every(v => v.passed)).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'cmv-puente')?.passed).toBe(true)
    })

    it('sin componentes mapeados: modelo perpetuo 2E intacto (compras/CMV, componentes N/A)', () => {
        const s = buildStatements(input([
            entry('2025-02-01', [{ accountId: 'merc', debit: 700, credit: 0 }, { accountId: 'caja', debit: 0, credit: 700 }]),
            entry('2025-03-01', [{ accountId: 'cmv', debit: 550, credit: 0 }, { accountId: 'merc', debit: 0, credit: 550 }]),
        ], [['merc', { debit: 200, credit: 0 }], ['capital', { debit: 0, credit: 200 }]]))
        const b = s.costOfSales
        expect(b.purchases.amount).toBe(700)
        expect(b.purchaseReturns.status).toBe('NOT_APPLICABLE')
        expect(b.acquisitionCosts.status).toBe('NOT_APPLICABLE')
        expect(b.abnormalLosses.status).toBe('NOT_APPLICABLE')
        expect(b.goodsAvailableForSale.amount).toBe(900)
        expect(b.costOfSales.amount).toBe(550)
        expect(b.validations.every(v => v.passed)).toBe(true)
    })
})
