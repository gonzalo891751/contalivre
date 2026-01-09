import { describe, it, expect } from 'vitest'
import { computeLedger } from '../src/core/ledger'
import { computeTrialBalance } from '../src/core/balance'
import type { Account, JournalEntry } from '../src/core/models'

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
        id: 'mercaderias',
        code: '1.1.04.01',
        name: 'Mercaderías',
        kind: 'ASSET',
        section: 'CURRENT',
        group: 'Bienes de cambio',
        statementGroup: 'INVENTORIES',
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
    // Header account - should be excluded from trial balance
    {
        id: 'header_activo',
        code: '1',
        name: 'ACTIVO',
        kind: 'ASSET',
        section: 'CURRENT',
        group: 'Activo',
        statementGroup: null,
        parentId: null,
        level: 0,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: true,
    },
]

describe('computeTrialBalance', () => {
    it('should return balanced trial balance for valid entries', () => {
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
                memo: 'Compra',
                lines: [
                    { accountId: 'mercaderias', debit: 3000, credit: 0 },
                    { accountId: 'caja', debit: 0, credit: 3000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const balance = computeTrialBalance(ledger, testAccounts)

        expect(balance.isBalanced).toBe(true)
        expect(balance.totalSumDebit).toBe(balance.totalSumCredit)
        expect(balance.totalBalanceDebit).toBe(balance.totalBalanceCredit)
    })

    it('should exclude header accounts from trial balance', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 5000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 5000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const balance = computeTrialBalance(ledger, testAccounts)

        // Header account should not appear
        expect(balance.rows.some((r) => r.account.id === 'header_activo')).toBe(false)
        expect(balance.rows.length).toBe(2) // Only caja and capital
    })

    it('should have correct sums for each account', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 5000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 5000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const balance = computeTrialBalance(ledger, testAccounts)

        const cajaRow = balance.rows.find((r) => r.account.id === 'caja')
        expect(cajaRow?.sumDebit).toBe(5000)
        expect(cajaRow?.sumCredit).toBe(0)
        expect(cajaRow?.balanceDebit).toBe(5000)
        expect(cajaRow?.balanceCredit).toBe(0)

        const capitalRow = balance.rows.find((r) => r.account.id === 'capital')
        expect(capitalRow?.sumDebit).toBe(0)
        expect(capitalRow?.sumCredit).toBe(5000)
        expect(capitalRow?.balanceDebit).toBe(0)
        expect(capitalRow?.balanceCredit).toBe(5000)
    })

    it('should only include accounts with movements', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Solo caja y capital',
                lines: [
                    { accountId: 'caja', debit: 1000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 1000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const balance = computeTrialBalance(ledger, testAccounts)

        // Only 2 accounts should appear (caja and capital)
        expect(balance.rows.length).toBe(2)
        expect(balance.rows.some((r) => r.account.id === 'caja')).toBe(true)
        expect(balance.rows.some((r) => r.account.id === 'capital')).toBe(true)
        expect(balance.rows.some((r) => r.account.id === 'mercaderias')).toBe(false)
    })

    it('should calculate totals correctly', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Multiple accounts',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-16',
                memo: 'Compra',
                lines: [
                    { accountId: 'mercaderias', debit: 2000, credit: 0 },
                    { accountId: 'proveedores', debit: 0, credit: 2000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const balance = computeTrialBalance(ledger, testAccounts)

        expect(balance.totalSumDebit).toBe(12000)
        expect(balance.totalSumCredit).toBe(12000)
        expect(balance.isBalanced).toBe(true)
    })
})
