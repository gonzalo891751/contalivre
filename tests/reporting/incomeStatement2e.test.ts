/**
 * Fase 2E (§5): Estado de Resultados completo.
 * - resultado antes del impuesto como subtotal explícito;
 * - impuesto SOLO desde mapping estructural INCOME_TAX (jamás por nombre);
 * - estados NOT_APPLICABLE / INSUFFICIENT_INFORMATION / CALCULATED;
 * - puente: antes del impuesto − IG = operaciones que continúan = neto;
 * - conciliación ER = EEPN preservada.
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

let seq = 0
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return {
        id: `e${seq}`, entryNumber: seq, date, memo: `asiento ${seq}`,
        status: 'POSTED', lines,
        createdAt: date, updatedAt: date,
    } as unknown as JournalEntry
}

const BASE_ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'CMV', kind: 'EXPENSE', statementGroup: 'COGS' }),
    makeAccount({ id: 'gastos-adm', code: '4.3.01', name: 'Gastos de administración', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'intereses', code: '4.4.01', name: 'Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES' }),
]

const TAX_ACCOUNT = makeAccount({
    id: 'ig', code: '4.9.01', name: 'Impuesto a las ganancias', kind: 'EXPENSE', statementGroup: 'INCOME_TAX',
})
// Cuenta con nombre engañoso pero SIN mapping de impuesto: no debe usarse como IG
const TRAP_ACCOUNT = makeAccount({
    id: 'trampa-ig', code: '4.9.99', name: 'Provisión impuesto ganancias IG', kind: 'EXPENSE', statementGroup: 'OTHER_EXPENSES',
})

function input(accounts: Account[], entries: JournalEntry[]): ReportingInput {
    return { context: CTX, entries, openingBalances: new Map(), accounts }
}

const OPERATING_ENTRIES = [
    entry('2025-01-10', [{ accountId: 'caja', debit: 1000, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 1000 }]),
    entry('2025-02-10', [{ accountId: 'cmv', debit: 400, credit: 0 }, { accountId: 'caja', debit: 0, credit: 400 }]),
    entry('2025-03-10', [{ accountId: 'gastos-adm', debit: 100, credit: 0 }, { accountId: 'caja', debit: 0, credit: 100 }]),
    entry('2025-04-10', [{ accountId: 'intereses', debit: 50, credit: 0 }, { accountId: 'caja', debit: 0, credit: 50 }]),
]

describe('Fase 2E — ER completo', () => {
    it('con mapping INCOME_TAX: impuesto CALCULATED y puente exacto', () => {
        const entries = [...OPERATING_ENTRIES,
            entry('2025-12-30', [{ accountId: 'ig', debit: 90, credit: 0 }, { accountId: 'caja', debit: 0, credit: 90 }])]
        const s = buildStatements(input([...BASE_ACCOUNTS, TAX_ACCOUNT], entries))
        const er = s.incomeStatement

        expect(er.grossProfit.amount).toBe(600)          // 1000 − 400
        expect(er.operatingResult.amount).toBe(500)      // 600 − 100
        expect(er.preTaxResult.amount).toBe(450)         // 500 − 50 intereses
        expect(er.incomeTaxStatus).toBe('CALCULATED')
        expect(er.incomeTax.amount).toBe(90)
        expect(er.continuingResult.amount).toBe(360)
        expect(er.netIncome.amount).toBe(360)

        const bridge = s.validation.checks.find(c => c.id === 'er-pretax')
        expect(bridge?.passed).toBe(true)
    })

    it('sin mapping y con actividad: INSUFFICIENT_INFORMATION (no $0 calculado); el nombre no se infiere', () => {
        const entries = [...OPERATING_ENTRIES,
            entry('2025-12-30', [{ accountId: 'trampa-ig', debit: 90, credit: 0 }, { accountId: 'caja', debit: 0, credit: 90 }])]
        const s = buildStatements(input([...BASE_ACCOUNTS, TRAP_ACCOUNT], entries))
        const er = s.incomeStatement

        expect(er.incomeTaxStatus).toBe('INSUFFICIENT_INFORMATION')
        expect(er.incomeTax.amount).toBe(0)
        expect(er.incomeTax.accountIds).toEqual([])
        // La cuenta con nombre "impuesto" va a Otros (por su mapping real), nunca a IG
        expect(er.otherResults.accountIds).toContain('trampa-ig')
        expect(er.preTaxResult.amount).toBe(360)  // 450 − 90 de otros egresos
        expect(er.netIncome.amount).toBe(360)
    })

    it('ejercicio sin actividad de resultados: NOT_APPLICABLE', () => {
        const entries = [entry('2025-01-05', [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'capital', debit: 0, credit: 500 }])]
        const s = buildStatements(input(BASE_ACCOUNTS, entries))
        expect(s.incomeStatement.incomeTaxStatus).toBe('NOT_APPLICABLE')
        expect(s.incomeStatement.netIncome.amount).toBe(0)
    })

    it('cuenta mapeada a INCOME_TAX sin devengamiento: CALCULATED con importe 0 legítimo', () => {
        const s = buildStatements(input([...BASE_ACCOUNTS, TAX_ACCOUNT], [...OPERATING_ENTRIES]))
        expect(s.incomeStatement.incomeTaxStatus).toBe('CALCULATED')
        expect(s.incomeStatement.incomeTax.amount).toBe(0)
        expect(s.incomeStatement.continuingResult.amount).toBe(450)
    })

    it('el resultado del ER (post impuesto) sigue conciliando con el EEPN y con el ESP', () => {
        const entries = [
            entry('2025-01-02', [{ accountId: 'caja', debit: 2000, credit: 0 }, { accountId: 'capital', debit: 0, credit: 2000 }]),
            ...OPERATING_ENTRIES,
            entry('2025-12-30', [{ accountId: 'ig', debit: 90, credit: 0 }, { accountId: 'caja', debit: 0, credit: 90 }]),
        ]
        const s = buildStatements(input([...BASE_ACCOUNTS, TAX_ACCOUNT], entries))
        for (const id of ['er-eepn', 'eepn-esp', 'equation', 'er-pretax']) {
            expect(s.validation.checks.find(c => c.id === id)?.passed, id).toBe(true)
        }
        expect(s.equityStatement.periodResult.amount).toBe(360)
    })

    it('el comparativo se espeja también en los nuevos subtotales', () => {
        const prev = buildStatements(input([...BASE_ACCOUNTS, TAX_ACCOUNT], [
            entry('2025-01-10', [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 500 }]),
            entry('2025-12-30', [{ accountId: 'ig', debit: 40, credit: 0 }, { accountId: 'caja', debit: 0, credit: 40 }]),
        ]))
        const current = input([...BASE_ACCOUNTS, TAX_ACCOUNT], [...OPERATING_ENTRIES,
            entry('2025-12-30', [{ accountId: 'ig', debit: 90, credit: 0 }, { accountId: 'caja', debit: 0, credit: 90 }])])
        current.comparative = prev
        const s = buildStatements(current)
        expect(s.incomeStatement.preTaxResult.comparativeAmount).toBe(500)
        expect(s.incomeStatement.incomeTax.comparativeAmount).toBe(40)
        expect(s.incomeStatement.netIncome.comparativeAmount).toBe(460)
    })
})
