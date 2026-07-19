/**
 * Fase 2E (§9): anexo de gastos por función.
 * - funciones estructurales (mapping explícito > derivación por rubro);
 * - reglas versionadas de distribución con suma exacta 100 % en centavos;
 * - reglas inválidas ⇒ cuenta sin función (nunca reparto silencioso);
 * - COGS e INCOME_TAX excluidos (no duplican CMV ni IG);
 * - conciliación anexo = gastos del ER; unmapped bloquea la validación.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { deriveResultFunction, ruleIsValid } from '../../src/reporting/engine/expensesByFunction'
import { makeAccount } from '../accounting/helpers'
import type { Account, ExpenseAllocationRule, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

let seq = 400
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return {
        id: `g${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines, createdAt: date, updatedAt: date,
    } as unknown as JournalEntry
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'CMV', kind: 'EXPENSE', statementGroup: 'COGS' }),
    makeAccount({ id: 'sueldos', code: '4.3.01', name: 'Sueldos', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'publicidad', code: '4.3.10', name: 'Publicidad', kind: 'EXPENSE', statementGroup: 'SELLING_EXPENSES' }),
    makeAccount({ id: 'alquileres', code: '4.3.20', name: 'Alquileres', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'intereses', code: '4.4.01', name: 'Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES' }),
    makeAccount({ id: 'ig', code: '4.9.01', name: 'Impuesto a las ganancias', kind: 'EXPENSE', statementGroup: 'INCOME_TAX' }),
    // gasto sin statementGroup ni resultFunction ⇒ sin función
    makeAccount({ id: 'gasto-huerfano', code: '4.7.99', name: 'Gasto sin mapping', kind: 'EXPENSE', statementGroup: null }),
    // mapping explícito pisa la derivación por rubro
    makeAccount({ id: 'flete', code: '4.3.30', name: 'Fletes', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', resultFunction: 'SELLING' }),
]

const RULE_ALQUILERES: ExpenseAllocationRule = {
    id: 'rule-alq-1', accountId: 'alquileres', validFrom: '2025-01-01',
    allocations: [
        { function: 'ADMINISTRATION', percentage: 60 },
        { function: 'SELLING', percentage: 40 },
    ],
    reason: 'Superficie ocupada por cada área',
    createdBy: 'test', createdAt: '2025-01-01T00:00:00Z', version: 1,
}

function makeInput(entries: JournalEntry[], rules: ExpenseAllocationRule[] = []): ReportingInput {
    return { context: CTX, entries, openingBalances: new Map(), accounts: ACCOUNTS, allocationRules: rules }
}

const BASE_ENTRIES = [
    entry('2025-01-05', [{ accountId: 'caja', debit: 10000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 10000 }]),
    entry('2025-02-01', [{ accountId: 'caja', debit: 2000, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 2000 }]),
    entry('2025-03-01', [{ accountId: 'sueldos', debit: 300, credit: 0 }, { accountId: 'caja', debit: 0, credit: 300 }]),
    entry('2025-03-02', [{ accountId: 'publicidad', debit: 150, credit: 0 }, { accountId: 'caja', debit: 0, credit: 150 }]),
    entry('2025-03-03', [{ accountId: 'intereses', debit: 80, credit: 0 }, { accountId: 'caja', debit: 0, credit: 80 }]),
    entry('2025-03-04', [{ accountId: 'cmv', debit: 900, credit: 0 }, { accountId: 'caja', debit: 0, credit: 900 }]),
    entry('2025-03-05', [{ accountId: 'ig', debit: 50, credit: 0 }, { accountId: 'caja', debit: 0, credit: 50 }]),
]

describe('Fase 2E — anexo de gastos por función', () => {
    it('deriva la función estructuralmente y el mapping explícito tiene prioridad', () => {
        const byId = new Map(ACCOUNTS.map(a => [a.id, a]))
        expect(deriveResultFunction(byId.get('sueldos')!)).toBe('ADMINISTRATION')
        expect(deriveResultFunction(byId.get('publicidad')!)).toBe('SELLING')
        expect(deriveResultFunction(byId.get('intereses')!)).toBe('FINANCIAL')
        expect(deriveResultFunction(byId.get('flete')!)).toBe('SELLING')     // explícito pisa ADMIN
        expect(deriveResultFunction(byId.get('gasto-huerfano')!)).toBeNull()
    })

    it('matriz básica: asignación 100 % por función, CMV e IG excluidos, concilia con el ER', () => {
        const s = buildStatements(makeInput(BASE_ENTRIES))
        const m = s.expensesByFunction

        expect(m.rows.map(r => r.accountId)).not.toContain('cmv')
        expect(m.rows.map(r => r.accountId)).not.toContain('ig')

        const sueldos = m.rows.find(r => r.accountId === 'sueldos')!
        expect(sueldos.cells.ADMINISTRATION).toBe(300)
        expect(sueldos.source).toBe('DERIVED')

        expect(m.totals.byFunction.ADMINISTRATION).toBe(300)
        expect(m.totals.byFunction.SELLING).toBe(150)
        expect(m.totals.byFunction.FINANCIAL).toBe(80)
        expect(m.totals.total).toBe(530)

        expect(m.validations.find(v => v.id === 'gastos-fn-er')?.passed).toBe(true)
        expect(m.validations.find(v => v.id === 'gastos-fn-unmapped')?.passed).toBe(true)
        expect(s.validation.checks.find(c => c.id === 'gastos-funcion')?.passed).toBe(true)
    })

    it('regla versionada 60/40: reparto exacto en centavos, fila suma el total', () => {
        const entries = [...BASE_ENTRIES,
            entry('2025-04-01', [{ accountId: 'alquileres', debit: 100.01, credit: 0 }, { accountId: 'caja', debit: 0, credit: 100.01 }])]
        const s = buildStatements(makeInput(entries, [RULE_ALQUILERES]))
        const alq = s.expensesByFunction.rows.find(r => r.accountId === 'alquileres')!

        expect(alq.source).toBe('RULE')
        expect(alq.ruleId).toBe('rule-alq-1')
        const sum = (alq.cells.ADMINISTRATION ?? 0) + (alq.cells.SELLING ?? 0)
        expect(Math.round(sum * 100)).toBe(Math.round(alq.total * 100)) // exacto en centavos
        expect(alq.total).toBe(100.01)
        expect(alq.cells.SELLING).toBe(40)            // 40 % de 100.01 = 40.004 → 40.00
        expect(alq.cells.ADMINISTRATION).toBe(60.01)  // residuo al mayor porcentaje
        expect(s.expensesByFunction.validations.every(v => v.passed)).toBe(true)
    })

    it('regla inválida (no suma 100): la cuenta queda sin función y la validación falla', () => {
        const badRule: ExpenseAllocationRule = {
            ...RULE_ALQUILERES, id: 'rule-alq-bad',
            allocations: [{ function: 'ADMINISTRATION', percentage: 60 }, { function: 'SELLING', percentage: 30 }],
        }
        expect(ruleIsValid(badRule)).toBe(false)
        const entries = [...BASE_ENTRIES,
            entry('2025-04-01', [{ accountId: 'alquileres', debit: 100, credit: 0 }, { accountId: 'caja', debit: 0, credit: 100 }])]
        const s = buildStatements(makeInput(entries, [badRule]))
        // La cuenta cae a su derivación estructural (ADMIN) pero la regla inválida se reporta
        const check = s.expensesByFunction.validations.find(v => v.id === 'gastos-fn-unmapped')!
        expect(check.passed).toBe(false)
        expect(check.detail).toContain('rule-alq-bad')
    })

    it('gasto sin función: expuesto en unmapped y bloquea la validación consolidada', () => {
        const entries = [...BASE_ENTRIES,
            entry('2025-05-01', [{ accountId: 'gasto-huerfano', debit: 70, credit: 0 }, { accountId: 'caja', debit: 0, credit: 70 }])]
        const s = buildStatements(makeInput(entries))
        const m = s.expensesByFunction
        expect(m.unmappedExpenses).toHaveLength(1)
        expect(m.unmappedExpenses[0].accountId).toBe('gasto-huerfano')
        expect(m.unmappedExpenses[0].total).toBe(70)
        expect(s.validation.checks.find(c => c.id === 'gastos-funcion')?.passed).toBe(false)
        // La conciliación con el ER sigue cerrando (unmapped integra el total del anexo)
        expect(m.validations.find(v => v.id === 'gastos-fn-er')?.passed).toBe(true)
    })

    it('comparativo: totales del anexo del ejercicio anterior con el mismo motor', () => {
        const prev = buildStatements(makeInput([
            entry('2025-03-01', [{ accountId: 'sueldos', debit: 200, credit: 0 }, { accountId: 'caja', debit: 0, credit: 200 }]),
        ]))
        const input = makeInput(BASE_ENTRIES)
        input.comparative = prev
        const s = buildStatements(input)
        const sueldos = s.expensesByFunction.rows.find(r => r.accountId === 'sueldos')!
        expect(sueldos.comparativeTotal).toBe(200)
        expect(s.expensesByFunction.totals.comparativeTotal).toBe(200)
    })
})
