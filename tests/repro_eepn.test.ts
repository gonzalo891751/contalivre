import { describe, it, expect } from 'vitest'
import { computeEEPN } from '../src/core/eepn/compute'
import type { Account, JournalEntry } from '../src/core/models'

// Helper to create minimal Account
function mkAccount(id: string, code: string, name: string, kind: string): Account {
    return {
        id,
        code,
        name,
        kind: kind as Account['kind'],
        section: 'CURRENT',
        group: '',
        statementGroup: '' as any,
        parentId: null,
        level: 3,
        normalSide: kind === 'EQUITY' ? 'CREDIT' : kind === 'ASSET' ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        allowOppositeBalance: false,
    } as Account
}

describe('EEPN Motor - Fix Swallowed Entry + Saldo Cierre', () => {
    // Shared accounts for tests
    const accounts: Account[] = [
        mkAccount('1', '1.1.01.01', 'Caja', 'ASSET'),
        mkAccount('2', '2.1.06.01', 'Honorarios a Pagar', 'LIABILITY'),
        mkAccount('3', '3.3.02', 'Resultado del ejercicio', 'EQUITY'),
        mkAccount('4', '3.1.01', 'Capital Social', 'EQUITY'),
        mkAccount('5', '3.3.01', 'Resultados No Asignados', 'EQUITY'),
    ]

    it('should NOT swallow fee payment against 3.3.02 — EEPN cierre = 2500', () => {
        const periodStart = '2024-01-01'
        const periodEnd = '2024-12-31'

        const entries: JournalEntry[] = [
            // Prior year: Credit 3.3.02 1000
            {
                id: 'e0',
                date: '2023-12-31',
                memo: 'Resultado 2023',

                lines: [
                    { id: 'i0a', accountId: '1', debit: 1000, credit: 0 },
                    { id: 'i0b', accountId: '3', debit: 0, credit: 1000 },
                ],
            },
            // In-period: Debit 3.3.02 500 (fee payment to liability)
            {
                id: 'e1',
                date: '2024-04-01',
                memo: 'Honorarios Directores',

                lines: [
                    { id: 'i1a', accountId: '3', debit: 500, credit: 0 },
                    { id: 'i1b', accountId: '2', debit: 0, credit: 500 },
                ],
            },
        ] as unknown as JournalEntry[]

        const netIncomeFromER = 2000
        const pnFromBalance = 2500 // 1000 - 500 + 2000

        const result = computeEEPN({
            accounts,
            entries,
            periodStart,
            periodEnd,
            netIncomeFromER,
            pnFromBalance,
        } as any)

        // Key assertion: pnCierre must equal pnFromBalance (no swallowed entry)
        expect(result.pnCierre).toBe(pnFromBalance)
        expect(result.reconciliation.matchesBalance).toBe(true)
        expect(Math.abs(result.reconciliation.balanceDiff)).toBeLessThan(0.01)

        // The fee payment should be in OTROS_MOVIMIENTOS, not RESULTADO_EJERCICIO
        const otrosRow = result.rows.find(r => r.type === 'OTROS_MOVIMIENTOS')
        expect(otrosRow).toBeDefined()
        const otrosTotal = otrosRow!.total
        expect(otrosTotal).toBe(-500)

        // Resultado del ejercicio row should have netIncomeFromER
        const resultadoRow = result.rows.find(r => r.type === 'RESULTADO_EJERCICIO')
        expect(resultadoRow).toBeDefined()
        expect(resultadoRow!.total).toBe(2000)
    })

    it('should reconcile in pre-cierre scenario (no refundición) using vertical sum', () => {
        const periodStart = '2024-01-01'
        const periodEnd = '2024-12-31'

        const entries: JournalEntry[] = [
            // Opening: Capital 10000
            {
                id: 'e0',
                date: '2023-12-31',
                memo: 'Capital inicial',

                lines: [
                    { id: 'i0a', accountId: '1', debit: 10000, credit: 0 },
                    { id: 'i0b', accountId: '4', debit: 0, credit: 10000 },
                ],
            },
        ] as unknown as JournalEntry[]

        // No in-period entries, but ER shows a result of 5000
        const netIncomeFromER = 5000
        // Balance includes 4.* result: 10000 (capital) + 5000 (result) = 15000
        const pnFromBalance = 15000

        const result = computeEEPN({
            accounts,
            entries,
            periodStart,
            periodEnd,
            netIncomeFromER,
            pnFromBalance,
        } as any)

        // pnInicio = 10000 (from capital)
        expect(result.pnInicio).toBe(10000)

        // pnCierre should be 15000 (inicio + resultado via vertical sum)
        expect(result.pnCierre).toBe(15000)
        expect(result.reconciliation.matchesBalance).toBe(true)
    })

    it('should include RECPAM row in output', () => {
        const result = computeEEPN({
            accounts,
            entries: [
                {
                    id: 'e0',
                    date: '2023-12-31',
                    memo: 'Capital',
    
                    lines: [
                        { id: 'i0a', accountId: '1', debit: 1000, credit: 0 },
                        { id: 'i0b', accountId: '4', debit: 0, credit: 1000 },
                    ],
                },
            ] as unknown as JournalEntry[],
            periodStart: '2024-01-01',
            periodEnd: '2024-12-31',
        } as any)

        const recpamRow = result.rows.find(r => r.type === 'RECPAM')
        expect(recpamRow).toBeDefined()
        expect(recpamRow!.label).toContain('RECPAM')
        expect(recpamRow!.total).toBe(0) // defaults to 0
    })

    it('should classify refundición entry as RESULTADO_EJERCICIO', () => {
        const accounts2 = [
            ...accounts,
            mkAccount('6', '4.1.01', 'Ventas', 'INCOME' as any),
            mkAccount('7', '5.1.01', 'CMV', 'EXPENSE' as any),
        ]

        const entries: JournalEntry[] = [
            // Opening capital
            {
                id: 'e0',
                date: '2023-12-31',
                memo: 'Capital',

                lines: [
                    { id: 'i0a', accountId: '1', debit: 1000, credit: 0 },
                    { id: 'i0b', accountId: '4', debit: 0, credit: 1000 },
                ],
            },
            // Refundición/Cierre: Debit 4.* Credit 5.* Net to 3.3.02
            {
                id: 'e-cierre',
                date: '2024-12-31',
                memo: 'Asiento de cierre',

                lines: [
                    { id: 'c1', accountId: '6', debit: 3000, credit: 0 },  // Debit Ventas
                    { id: 'c2', accountId: '7', debit: 0, credit: 1000 },  // Credit CMV
                    { id: 'c3', accountId: '3', debit: 0, credit: 2000 },  // Credit Resultado (net)
                ],
            },
        ] as unknown as JournalEntry[]

        const result = computeEEPN({
            accounts: accounts2,
            entries,
            periodStart: '2024-01-01',
            periodEnd: '2024-12-31',
        } as any)

        // The cierre entry should be classified as RESULTADO_EJERCICIO
        const resultadoRow = result.rows.find(r => r.type === 'RESULTADO_EJERCICIO')
        expect(resultadoRow).toBeDefined()
        expect(resultadoRow!.total).toBe(2000)
    })
})
