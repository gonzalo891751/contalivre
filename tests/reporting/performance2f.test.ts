/**
 * Fase 2F (§17) — Performance del motor canónico con 10k y 100k asientos.
 *
 * Mide la construcción del bundle completo (todas las matrices y anexos 2E/2F)
 * y fija budgets. No es un microbenchmark exacto (depende del runner) pero
 * detecta regresiones de orden de magnitud. Se salta con SKIP_PERF=1.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: '2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'deudores', code: '1.1.02', name: 'Deudores', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    makeAccount({ id: 'merc', code: '1.1.04', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES' }),
    makeAccount({ id: 'rodados', code: '1.2.01', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Rodados' }),
    makeAccount({ id: 'amort', code: '1.2.02', name: 'Amort. rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT', annexGroup: 'Rodados' }),
    makeAccount({ id: 'prov', code: '2.1.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'CMV', kind: 'EXPENSE', statementGroup: 'COGS' }),
    makeAccount({ id: 'gastos', code: '4.3.01', name: 'Gastos', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    makeAccount({ id: 'ig', code: '4.9.01', name: 'IG', kind: 'EXPENSE', statementGroup: 'INCOME_TAX' }),
]

/** Genera N asientos variados y balanceados a lo largo del año */
function generateEntries(n: number): JournalEntry[] {
    const entries: JournalEntry[] = []
    const pairs: [string, string][] = [
        ['deudores', 'ventas'], ['cmv', 'merc'], ['gastos', 'caja'],
        ['merc', 'prov'], ['caja', 'deudores'], ['ig', 'caja'],
    ]
    for (let i = 0; i < n; i++) {
        const [d, h] = pairs[i % pairs.length]
        const month = String((i % 12) + 1).padStart(2, '0')
        const day = String((i % 28) + 1).padStart(2, '0')
        const amount = 100 + (i % 900)
        entries.push({
            id: `e${i}`, entryNumber: i + 1, date: `2025-${month}-${day}`, memo: `op ${i}`,
            status: 'POSTED', createdAt: `2025-${month}-${day}`, updatedAt: `2025-${month}-${day}`,
            lines: [{ accountId: d, debit: amount, credit: 0 }, { accountId: h, debit: 0, credit: amount }],
        } as unknown as JournalEntry)
    }
    // aporte inicial para que el PN no quede negativo
    entries.push({ id: 'ap', entryNumber: 0, date: '2025-01-01', memo: 'aporte', status: 'POSTED', createdAt: '2025-01-01', updatedAt: '2025-01-01', lines: [{ accountId: 'caja', debit: n * 1000, credit: 0 }, { accountId: 'capital', debit: 0, credit: n * 1000 }] } as unknown as JournalEntry)
    return entries
}

function measure(n: number): number {
    const input: ReportingInput = { context: CTX, entries: generateEntries(n), openingBalances: new Map(), accounts: ACCOUNTS }
    const t0 = performance.now()
    const statements = buildStatements(input)
    buildCashFlows(input, statements)
    const ms = performance.now() - t0
    // sanity: el bundle se construyó bien
    expect(statements.balanceSheet.equationDifference).toBe(0)
    expect(statements.equityMatrix.closingRow.total).toBe(statements.balanceSheet.equity.amount)
    return ms
}

const RUN = process.env.SKIP_PERF !== '1'

describe.skipIf(!RUN)('Fase 2F — performance del motor (10k / 100k)', () => {
    it('10.000 asientos: bundle completo < 1.500 ms', () => {
        const ms = measure(10_000)
        console.log(`[perf] 10k asientos → bundle en ${ms.toFixed(0)} ms`)
        expect(ms).toBeLessThan(1500)
    })

    it('100.000 asientos: bundle completo < 12.000 ms (escala ~lineal)', () => {
        const ms = measure(100_000)
        console.log(`[perf] 100k asientos → bundle en ${ms.toFixed(0)} ms`)
        expect(ms).toBeLessThan(12_000)
    })
})
