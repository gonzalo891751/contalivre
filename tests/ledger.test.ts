import { describe, it, expect } from 'vitest'
import { computeLedger, postEntryToLedger, createEmptyLedger, calculateBalance } from '../src/core/ledger'
import type { Account, JournalEntry } from '../src/core/models'

// Updated test accounts with new model fields
const testAccounts: Account[] = [
    {
        id: 'caja',
        code: '1.1.01.01',
        name: 'Caja',
        kind: 'ASSET',
        section: 'CURRENT',
        group: 'Caja y Bancos',
        statementGroup: 'CASH_AND_BANKS',
        parentId: null,
        level: 3,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'bancos',
        code: '1.1.01.02',
        name: 'Bancos',
        kind: 'ASSET',
        section: 'CURRENT',
        group: 'Caja y Bancos',
        statementGroup: 'CASH_AND_BANKS',
        parentId: null,
        level: 3,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'proveedores',
        code: '2.1.01.01',
        name: 'Proveedores',
        kind: 'LIABILITY',
        section: 'CURRENT',
        group: 'Deudas comerciales',
        statementGroup: 'TRADE_PAYABLES',
        parentId: null,
        level: 3,
        normalSide: 'CREDIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'capital',
        code: '3.1.01',
        name: 'Capital',
        kind: 'EQUITY',
        section: 'CURRENT',
        group: 'Capital',
        statementGroup: 'CAPITAL',
        parentId: null,
        level: 2,
        normalSide: 'CREDIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'ventas',
        code: '4.1.01',
        name: 'Ventas',
        kind: 'INCOME',
        section: 'OPERATING',
        group: 'Ingresos operativos',
        statementGroup: 'SALES',
        parentId: null,
        level: 2,
        normalSide: 'CREDIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'cmv',
        code: '5.1.01',
        name: 'Costo de mercaderías',
        kind: 'EXPENSE',
        section: 'COST',
        group: 'Costo de ventas',
        statementGroup: 'COGS',
        parentId: null,
        level: 2,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    },
]

describe('computeLedger', () => {
    it('should compute empty ledger for no entries', () => {
        const ledger = computeLedger([], testAccounts)

        expect(ledger.size).toBe(testAccounts.length)

        const caja = ledger.get('caja')
        expect(caja?.movements).toHaveLength(0)
        expect(caja?.totalDebit).toBe(0)
        expect(caja?.totalCredit).toBe(0)
        expect(caja?.balance).toBe(0)
    })

    it('should compute ledger with single entry', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte inicial',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)

        const caja = ledger.get('caja')
        expect(caja?.totalDebit).toBe(10000)
        expect(caja?.totalCredit).toBe(0)
        expect(caja?.balance).toBe(10000) // ASSET with DEBIT normalSide

        const capital = ledger.get('capital')
        expect(capital?.totalDebit).toBe(0)
        expect(capital?.totalCredit).toBe(10000)
        expect(capital?.balance).toBe(10000) // EQUITY with CREDIT normalSide
    })

    it('should accumulate multiple entries correctly', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte inicial',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-16',
                memo: 'Pago a proveedores',
                lines: [
                    { accountId: 'proveedores', debit: 2000, credit: 0 },
                    { accountId: 'caja', debit: 0, credit: 2000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)

        const caja = ledger.get('caja')
        expect(caja?.totalDebit).toBe(10000)
        expect(caja?.totalCredit).toBe(2000)
        expect(caja?.balance).toBe(8000)
        expect(caja?.movements).toHaveLength(2)
    })

    it('should calculate correct balance by normalSide', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Compra a crédito',
                lines: [
                    { accountId: 'cmv', debit: 5000, credit: 0 },
                    { accountId: 'proveedores', debit: 0, credit: 5000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)

        // EXPENSE: normalSide DEBIT, balance = debit - credit
        const cmv = ledger.get('cmv')
        expect(cmv?.balance).toBe(5000)

        // LIABILITY: normalSide CREDIT, balance = credit - debit
        const proveedores = ledger.get('proveedores')
        expect(proveedores?.balance).toBe(5000)
    })
})

describe('calculateBalance', () => {
    it('should calculate debit balance for ASSET accounts', () => {
        const account = testAccounts.find((a) => a.id === 'caja')!
        expect(calculateBalance(account, 1000, 200)).toBe(800)
    })

    it('should calculate credit balance for LIABILITY accounts', () => {
        const account = testAccounts.find((a) => a.id === 'proveedores')!
        expect(calculateBalance(account, 200, 1000)).toBe(800)
    })

    it('should calculate credit balance for INCOME accounts', () => {
        const account = testAccounts.find((a) => a.id === 'ventas')!
        expect(calculateBalance(account, 0, 5000)).toBe(5000)
    })

    it('should calculate debit balance for EXPENSE accounts', () => {
        const account = testAccounts.find((a) => a.id === 'cmv')!
        expect(calculateBalance(account, 3000, 0)).toBe(3000)
    })
})

describe('postEntryToLedger', () => {
    it('should add entry to existing ledger', () => {
        let ledger = createEmptyLedger()

        const entry1: JournalEntry = {
            id: 'e1',
            date: '2024-01-15',
            memo: 'First',
            lines: [
                { accountId: 'caja', debit: 1000, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 1000 },
            ],
        }

        ledger = postEntryToLedger(entry1, ledger, testAccounts)
        expect(ledger.get('caja')?.totalDebit).toBe(1000)

        const entry2: JournalEntry = {
            id: 'e2',
            date: '2024-01-16',
            memo: 'Second',
            lines: [
                { accountId: 'caja', debit: 500, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 500 },
            ],
        }

        ledger = postEntryToLedger(entry2, ledger, testAccounts)
        expect(ledger.get('caja')?.totalDebit).toBe(1500)
        expect(ledger.get('caja')?.movements).toHaveLength(2)
    })
})
