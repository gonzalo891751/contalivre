/**
 * Fase 2G — Disposición de bienes de uso y flujo bruto (EFE-001, spec §5.1, §17.1-3).
 *
 * HITO 2 corrigió el defecto: el flujo BRUTO de la venta se expone en inversión
 * y el resultado se elimina del operativo (directo e indirecto). Estas pruebas
 * fueron `it.fails` en HITO 1 (documentando el defecto) y ahora son verdes.
 * Regresión permanente de EFE-001.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'ppe', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'ganancia-venta', code: '4.5.01', name: 'Resultado por venta de bienes de uso', kind: 'INCOME', statementGroup: 'OTHER_INCOME', section: 'OPERATING' }),
    makeAccount({ id: 'perdida-venta', code: '4.6.01', name: 'Pérdida por venta de bienes de uso', kind: 'EXPENSE', statementGroup: 'OTHER_EXPENSES', section: 'OPERATING' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]

let seq = 0
function entry(date: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return { id: `d${seq}`, entryNumber: seq, date, memo: `venta ${seq}`, status: 'POSTED', lines, createdAt: date, updatedAt: date } as unknown as JournalEntry
}

function run(opening: Map<string, { debit: number; credit: number }>, entries: JournalEntry[]) {
    const input: ReportingInput = { context: CTX, entries, openingBalances: opening, accounts: ACCOUNTS }
    const statements = buildStatements(input)
    const flows = buildCashFlows(input, statements)
    return flows
}

describe('Fase 2G — disposición de PPE: flujo bruto en inversión (EFE-001)', () => {
    it('venta con ganancia: cobro bruto 30.000 en inversión, ganancia fuera de operativo', () => {
        const flows = run(
            new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]),
            [entry('2025-06-10', [
                { accountId: 'caja', debit: 30000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 20000 },
                { accountId: 'ganancia-venta', debit: 0, credit: 10000 },
            ])],
        )
        // Flujo bruto de la venta (RT 54 párr. 656): 30.000 entra en inversión
        expect(flows.direct.investing.amount).toBe(30000)
        // La ganancia (10.000) NO es un flujo operativo
        expect(flows.direct.operating.amount).toBe(0)
        // El indirecto elimina la ganancia del resultado (pertenece a inversión)
        expect(flows.indirect.operating.amount).toBe(0)
        expect(flows.indirect.investing.amount).toBe(30000)
        // Conciliaciones intactas
        expect(flows.direct.netChange.amount).toBe(30000)
        expect(flows.validation.checks.find(c => c.id === 'efe-metodos')!.passed).toBe(true)
    })

    it('venta con pérdida: cobro bruto 15.000 en inversión, pérdida fuera de operativo', () => {
        const flows = run(
            new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]),
            [entry('2025-06-10', [
                { accountId: 'caja', debit: 15000, credit: 0 },
                { accountId: 'perdida-venta', debit: 5000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 20000 },
            ])],
        )
        expect(flows.direct.investing.amount).toBe(15000)
        expect(flows.direct.operating.amount).toBe(0)
        expect(flows.indirect.operating.amount).toBe(0)
        expect(flows.indirect.investing.amount).toBe(15000)
        expect(flows.direct.netChange.amount).toBe(15000)
        expect(flows.validation.checks.find(c => c.id === 'efe-metodos')!.passed).toBe(true)
    })

    it('venta a valor contable (sin resultado): 30.000 en inversión ya funciona hoy', () => {
        const flows = run(
            new Map([['ppe', { debit: 30000, credit: 0 }], ['capital', { debit: 0, credit: 30000 }]]),
            [entry('2025-06-10', [
                { accountId: 'caja', debit: 30000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 30000 },
            ])],
        )
        expect(flows.direct.investing.amount).toBe(30000)
        expect(flows.direct.operating.amount).toBe(0)
        expect(flows.direct.netChange.amount).toBe(30000)
        expect(flows.validation.checks.find(c => c.id === 'efe-metodos')!.passed).toBe(true)
    })
})
