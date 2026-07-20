/**
 * Fase 2E (§10): determinación del costo de ventas.
 * - puente comercial EI + compras − EF = CMV, conciliado con ER y ESP;
 * - diferencia expuesta (sin plug) cuando hay bajas de inventario a otras cuentas;
 * - apertura formal integra la existencia inicial;
 * - servicios: sin existencias forzadas; sin datos: NOT_APPLICABLE;
 * - comparativo con el mismo motor.
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

let seq = 500
function entry(
    date: string,
    lines: { accountId: string; debit: number; credit: number }[],
    extra: Partial<JournalEntry> = {}
): JournalEntry {
    seq += 1
    return {
        id: `c${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines, createdAt: date, updatedAt: date, ...extra,
    } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'mercaderias', code: '1.1.04', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'CMV', kind: 'EXPENSE', statementGroup: 'COGS' }),
    makeAccount({ id: 'honorarios', code: '4.2.02', name: 'Costo de servicios prestados', kind: 'EXPENSE', statementGroup: 'COGS' }),
    makeAccount({ id: 'siniestros', code: '4.7.05', name: 'Siniestros', kind: 'EXPENSE', statementGroup: 'OTHER_EXPENSES' }),
]

function makeInput(entries: JournalEntry[], opening: [string, { debit: number; credit: number }][] = []): ReportingInput {
    return { context: CTX, entries, openingBalances: new Map(opening), accounts: ACCOUNTS }
}

describe('Fase 2E — determinación del costo de ventas', () => {
    it('puente comercial: EI + compras − EF = CMV, conciliado con ER y ESP', () => {
        const s = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'mercaderias', debit: 700, credit: 0 }, { accountId: 'caja', debit: 0, credit: 700 }]),
            entry('2025-03-01', [{ accountId: 'caja', debit: 900, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 900 }]),
            entry('2025-03-01', [{ accountId: 'cmv', debit: 550, credit: 0 }, { accountId: 'mercaderias', debit: 0, credit: 550 }]),
        ], [
            ['mercaderias', { debit: 200, credit: 0 }],
            ['caja', { debit: 300, credit: 0 }],
            ['capital', { debit: 0, credit: 500 }],
        ]))
        const b = s.costOfSales

        expect(b.mode).toBe('COMMERCIAL')
        expect(b.openingInventory.amount).toBe(200)
        expect(b.purchases.amount).toBe(700)
        expect(b.goodsAvailableForSale.amount).toBe(900)
        expect(b.closingInventory.amount).toBe(350)   // 200 + 700 − 550
        expect(b.costOfSales.amount).toBe(550)
        expect(b.costOfSalesPerIncomeStatement).toBe(550)
        expect(b.validations.every(v => v.passed)).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'cmv-puente')?.passed).toBe(true)
        // costos incorporables: sin categoría estructural separada ⇒ no un cero fingido
        expect(b.incorporableCosts.amount).toBeNull()
        expect(b.incorporableCosts.status).toBe('NOT_APPLICABLE')
    })

    it('bajas de inventario a otras cuentas: la diferencia se EXPONE, sin plug', () => {
        const s = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'mercaderias', debit: 700, credit: 0 }, { accountId: 'caja', debit: 0, credit: 700 }]),
            entry('2025-03-01', [{ accountId: 'cmv', debit: 500, credit: 0 }, { accountId: 'mercaderias', debit: 0, credit: 500 }]),
            // siniestro: salida de mercaderías que NO es CMV
            entry('2025-06-01', [{ accountId: 'siniestros', debit: 80, credit: 0 }, { accountId: 'mercaderias', debit: 0, credit: 80 }]),
        ], [['caja', { debit: 700, credit: 0 }], ['capital', { debit: 0, credit: 700 }]]))
        const b = s.costOfSales

        expect(b.costOfSales.amount).toBe(580)          // por el puente (todas las salidas)
        expect(b.costOfSalesPerIncomeStatement).toBe(500)
        const check = b.validations.find(v => v.id === 'cmv-er')!
        expect(check.passed).toBe(false)
        expect(check.detail).toContain('sin componente de costo mapeado')
        expect(s.validation.checks.find(c => c.id === 'cmv-puente')?.passed).toBe(false)
        // El resto del puente sigue siendo aritméticamente consistente
        expect(b.validations.find(v => v.id === 'cmv-ef-esp')?.passed).toBe(true)
    })

    it('la apertura formal integra la existencia inicial (no compras)', () => {
        const s = buildStatements(makeInput([
            entry('2025-01-01', [
                { accountId: 'caja', debit: 300, credit: 0 },
                { accountId: 'mercaderias', debit: 200, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 500 },
            ], { sourceModule: 'closing', sourceType: 'apertura' }),
            entry('2025-03-01', [{ accountId: 'cmv', debit: 150, credit: 0 }, { accountId: 'mercaderias', debit: 0, credit: 150 }]),
        ]))
        const b = s.costOfSales
        expect(b.openingInventory.amount).toBe(200)
        expect(b.purchases.amount).toBe(0)
        expect(b.closingInventory.amount).toBe(50)
        expect(b.costOfSales.amount).toBe(150)
        expect(b.validations.every(v => v.passed)).toBe(true)
    })

    it('empresa de servicios: costo desde el ER, sin existencias forzadas', () => {
        const s = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'caja', debit: 1000, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 1000 }]),
            entry('2025-02-15', [{ accountId: 'honorarios', debit: 400, credit: 0 }, { accountId: 'caja', debit: 0, credit: 400 }]),
        ]))
        const b = s.costOfSales
        expect(b.mode).toBe('SERVICES')
        expect(b.openingInventory.status).toBe('NOT_APPLICABLE')
        expect(b.openingInventory.amount).toBeNull()
        expect(b.closingInventory.amount).toBeNull()
        expect(b.costOfSales.amount).toBe(400)
        expect(b.costOfSales.status).toBe('CALCULATED')
    })

    it('sin bienes de cambio ni costo: NOT_APPLICABLE', () => {
        const s = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'capital', debit: 0, credit: 500 }]),
        ]))
        expect(s.costOfSales.mode).toBe('NOT_APPLICABLE')
        expect(s.costOfSales.costOfSales.amount).toBeNull()
    })

    it('comparativo: componentes del puente del ejercicio anterior', () => {
        const prev = buildStatements(makeInput([
            entry('2025-02-01', [{ accountId: 'mercaderias', debit: 400, credit: 0 }, { accountId: 'caja', debit: 0, credit: 400 }]),
            entry('2025-03-01', [{ accountId: 'cmv', debit: 250, credit: 0 }, { accountId: 'mercaderias', debit: 0, credit: 250 }]),
        ], [['caja', { debit: 400, credit: 0 }], ['capital', { debit: 0, credit: 400 }]]))
        const input = makeInput([
            entry('2025-02-01', [{ accountId: 'mercaderias', debit: 100, credit: 0 }, { accountId: 'caja', debit: 0, credit: 100 }]),
            entry('2025-03-01', [{ accountId: 'cmv', debit: 90, credit: 0 }, { accountId: 'mercaderias', debit: 0, credit: 90 }]),
        ], [['mercaderias', { debit: 150, credit: 0 }], ['capital', { debit: 0, credit: 150 }]])
        input.comparative = prev
        const s = buildStatements(input)
        expect(s.costOfSales.costOfSales.comparativeAmount).toBe(250)
        expect(s.costOfSales.closingInventory.comparativeAmount).toBe(150)
    })
})
