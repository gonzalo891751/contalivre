/**
 * Fase 2H §H5 — Bases de distribución de gastos por función.
 *
 * La Fase 2E ya repartía por porcentajes fijos con control exacto al 100 %. Lo
 * que faltaba, y se agrega acá, son las BASES: el usuario carga el valor de un
 * inductor por función (empleados, m², horas, unidades) y el porcentaje se
 * deriva, de modo que suma 100 por construcción.
 *
 * Invariantes que se fijan:
 *  - la suma de las funciones de una cuenta es EXACTAMENTE su saldo contable;
 *  - la distribución no modifica el asiento ni duplica el gasto;
 *  - una regla manual que no suma 100 se rechaza y la cuenta queda sin función.
 */

import { describe, it, expect } from 'vitest'
import {
    buildExpensesByFunction,
    effectivePercentages,
    ruleIsValid,
    basisOf,
} from '../../src/reporting/engine/expensesByFunction'
import type { Account, ExpenseAllocationRule } from '../../src/core/models'
import type { IncomeStatement2B, NormalizedTrialBalance, ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1',
    exerciseId: 'ex-2026',
    exerciseLabel: 'Ejercicio 2026',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
}

function account(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name'>): Account {
    return {
        kind: 'EXPENSE',
        section: 'ADMIN',
        group: 'Gastos',
        statementGroup: 'ADMIN_EXPENSES',
        parentId: null,
        level: 2,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
        ...partial,
    } as Account
}

function trialBalance(rows: { accountId: string; code: string; name: string; closing: number }[]): NormalizedTrialBalance {
    return {
        rows: rows.map(r => ({
            accountId: r.accountId,
            code: r.code,
            name: r.name,
            kind: 'EXPENSE',
            isContra: false,
            opening: 0,
            periodDebit: r.closing,
            periodCredit: 0,
            closing: r.closing,
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

/** ER mínimo: el anexo sólo lo usa para el control de conciliación. */
const EMPTY_ER = {
    adminExpenses: { children: [] },
    sellingExpenses: { children: [] },
    financialResults: { children: [] },
    otherResults: { children: [] },
} as unknown as IncomeStatement2B

function rule(partial: Partial<ExpenseAllocationRule> & Pick<ExpenseAllocationRule, 'accountId' | 'allocations'>): ExpenseAllocationRule {
    return {
        id: 'r1',
        validFrom: '2026-01-01',
        reason: 'prueba',
        createdBy: 'test',
        createdAt: '2026-01-01T00:00:00Z',
        version: 1,
        status: 'ACTIVE',
        ...partial,
    }
}

function build(accounts: Account[], rows: Parameters<typeof trialBalance>[0], rules: ExpenseAllocationRule[]) {
    const input = { context: CTX, entries: [], openingBalances: new Map(), accounts, allocationRules: rules } as unknown as ReportingInput
    return buildExpensesByFunction(input, trialBalance(rows), EMPTY_ER)
}

const ALQUILER = account({ id: 'a1', code: '4.5.03', name: 'Alquileres' })
const ROW = [{ accountId: 'a1', code: '4.5.03', name: 'Alquileres', closing: 100000 }]

describe('Fase 2H §H5 — porcentaje manual', () => {
    it('prorrateo 60/40', () => {
        const matrix = build([ALQUILER], ROW, [rule({
            accountId: 'a1',
            basis: 'MANUAL_PERCENTAGE',
            allocations: [
                { function: 'SELLING', percentage: 60 },
                { function: 'ADMINISTRATION', percentage: 40 },
            ],
        })])

        const row = matrix.rows[0]
        expect(row.cells.SELLING).toBe(60000)
        expect(row.cells.ADMINISTRATION).toBe(40000)
        expect(row.source).toBe('RULE')
    })

    it('prorrateo 80/20', () => {
        const matrix = build([ALQUILER], ROW, [rule({
            accountId: 'a1',
            allocations: [
                { function: 'SELLING', percentage: 80 },
                { function: 'ADMINISTRATION', percentage: 20 },
            ],
        })])

        expect(matrix.rows[0].cells.SELLING).toBe(80000)
        expect(matrix.rows[0].cells.ADMINISTRATION).toBe(20000)
    })

    it('una regla que no suma 100 se rechaza y la cuenta queda sin función', () => {
        const bad = rule({
            accountId: 'a1',
            allocations: [
                { function: 'SELLING', percentage: 60 },
                { function: 'ADMINISTRATION', percentage: 30 },
            ],
        })
        expect(ruleIsValid(bad)).toBe(false)

        const matrix = build([ALQUILER], ROW, [bad])
        // Cae a la derivación estructural del rubro, no se aplica la regla rota.
        expect(matrix.rows[0].source).not.toBe('RULE')
    })

    it('una regla sin base declarada se trata como porcentaje manual', () => {
        const legacy = rule({
            accountId: 'a1',
            allocations: [{ function: 'ADMINISTRATION', percentage: 100 }],
        })
        expect(basisOf(legacy)).toBe('MANUAL_PERCENTAGE')
        expect(ruleIsValid(legacy)).toBe(true)
    })
})

describe('Fase 2H §H5 — bases por inductor', () => {
    it('distribuye sueldos por cantidad de empleados', () => {
        const matrix = build([ALQUILER], ROW, [rule({
            accountId: 'a1',
            basis: 'EMPLOYEES',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 3 },
                { function: 'SELLING', percentage: 0, driverValue: 5 },
                { function: 'PRODUCTION', percentage: 0, driverValue: 12 },
            ],
        })])

        const row = matrix.rows[0]
        // 3 / 20 = 15 %, 5 / 20 = 25 %, 12 / 20 = 60 %
        expect(row.cells.ADMINISTRATION).toBe(15000)
        expect(row.cells.SELLING).toBe(25000)
        expect(row.cells.PRODUCTION).toBe(60000)
        expect(row.basis).toBe('EMPLOYEES')
    })

    it('distribuye alquiler por superficie', () => {
        const matrix = build([ALQUILER], ROW, [rule({
            accountId: 'a1',
            basis: 'SURFACE',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 150 },
                { function: 'PRODUCTION', percentage: 0, driverValue: 350 },
            ],
        })])

        expect(matrix.rows[0].cells.ADMINISTRATION).toBe(30000)
        expect(matrix.rows[0].cells.PRODUCTION).toBe(70000)
    })

    it('el porcentaje derivado suma 100 aunque el inductor no sea redondo', () => {
        const r = rule({
            accountId: 'a1',
            basis: 'HOURS',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 1 },
                { function: 'SELLING', percentage: 0, driverValue: 1 },
                { function: 'PRODUCTION', percentage: 0, driverValue: 1 },
            ],
        })
        const effective = effectivePercentages(r)
        const sum = effective.reduce((s, e) => s + e.percentage, 0)
        expect(sum).toBeCloseTo(100, 10)

        // Y el reparto en centavos cierra EXACTO contra el saldo.
        const matrix = build([ALQUILER], ROW, [r])
        const assigned = Object.values(matrix.rows[0].cells).reduce((s, v) => s + (v ?? 0), 0)
        expect(assigned).toBe(100000)
    })

    it('unidades producidas y base personalizada también derivan el porcentaje', () => {
        for (const basis of ['UNITS_PRODUCED', 'CUSTOM'] as const) {
            const matrix = build([ALQUILER], ROW, [rule({
                accountId: 'a1',
                basis,
                basisLabel: basis === 'CUSTOM' ? 'kg despachados' : undefined,
                allocations: [
                    { function: 'PRODUCTION', percentage: 0, driverValue: 750 },
                    { function: 'SELLING', percentage: 0, driverValue: 250 },
                ],
            })])
            expect(matrix.rows[0].cells.PRODUCTION, basis).toBe(75000)
            expect(matrix.rows[0].cells.SELLING, basis).toBe(25000)
        }
    })

    it('una base cuyo inductor suma cero es inválida', () => {
        const bad = rule({
            accountId: 'a1',
            basis: 'EMPLOYEES',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 0 },
                { function: 'SELLING', percentage: 0, driverValue: 0 },
            ],
        })
        expect(ruleIsValid(bad)).toBe(false)
        expect(effectivePercentages(bad)).toEqual([])
    })

    it('un inductor negativo es inválido', () => {
        expect(ruleIsValid(rule({
            accountId: 'a1',
            basis: 'SURFACE',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: -10 },
                { function: 'PRODUCTION', percentage: 0, driverValue: 100 },
            ],
        }))).toBe(false)
    })
})

describe('Fase 2H §H5 — trazabilidad y controles', () => {
    it('cada asignación informa base, valor del inductor, porcentaje e importe', () => {
        const matrix = build([ALQUILER], ROW, [rule({
            accountId: 'a1',
            basis: 'EMPLOYEES',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 1 },
                { function: 'PRODUCTION', percentage: 0, driverValue: 3 },
            ],
        })])

        const trace = matrix.rows[0].allocationTrace!
        expect(trace).toHaveLength(2)

        const admin = trace.find(t => t.function === 'ADMINISTRATION')!
        expect(admin.driverValue).toBe(1)
        expect(admin.percentage).toBeCloseTo(25, 10)
        expect(admin.amount).toBe(25000)

        // El control: lo asignado es exactamente el saldo contable.
        expect(trace.reduce((s, t) => s + t.amount, 0)).toBe(matrix.rows[0].total)
    })

    it('la suma de funciones = saldo de la cuenta (invariante del motor)', () => {
        // Importe que no divide exacto: fuerza el residuo de redondeo.
        const rows = [{ accountId: 'a1', code: '4.5.03', name: 'Alquileres', closing: 100.01 }]
        const matrix = build([ALQUILER], rows, [rule({
            accountId: 'a1',
            basis: 'EMPLOYEES',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 1 },
                { function: 'SELLING', percentage: 0, driverValue: 1 },
                { function: 'PRODUCTION', percentage: 0, driverValue: 1 },
            ],
        })])

        const assigned = Object.values(matrix.rows[0].cells).reduce((s, v) => s + (v ?? 0), 0)
        expect(assigned).toBe(100.01)

        const rowCheck = matrix.validations.find(v => v.id === 'gastos-fn-row-a1')!
        expect(rowCheck.passed).toBe(true)
    })

    it('la asignación no duplica el gasto: el total del anexo es el saldo, no su múltiplo', () => {
        const matrix = build([ALQUILER], ROW, [rule({
            accountId: 'a1',
            basis: 'EMPLOYEES',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 0, driverValue: 2 },
                { function: 'SELLING', percentage: 0, driverValue: 2 },
            ],
        })])
        expect(matrix.totals.total).toBe(100000)
    })

    it('la asignación estructural (sin regla) informa 100 % en una sola función', () => {
        const matrix = build([ALQUILER], ROW, [])
        const trace = matrix.rows[0].allocationTrace!
        expect(trace).toHaveLength(1)
        expect(trace[0].function).toBe('ADMINISTRATION')
        expect(trace[0].percentage).toBe(100)
        expect(matrix.rows[0].basis).toBeUndefined()
    })
})
