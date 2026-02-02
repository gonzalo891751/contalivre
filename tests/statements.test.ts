import { describe, it, expect } from 'vitest'
import { computeLedger } from '../src/core/ledger'
import { computeTrialBalance } from '../src/core/balance'
import { computeStatements } from '../src/core/statements'
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
        id: 'muebles',
        code: '1.2.01.03',
        name: 'Muebles y útiles',
        kind: 'ASSET',
        section: 'NON_CURRENT',
        group: 'Bienes de uso',
        statementGroup: 'PPE',
        parentId: null,
        level: 3,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'amort_muebles',
        code: '1.2.01.93',
        name: 'Amort. acum. Muebles',
        kind: 'ASSET',
        section: 'NON_CURRENT',
        group: 'Bienes de uso',
        statementGroup: 'PPE',
        parentId: null,
        level: 3,
        normalSide: 'CREDIT',
        isContra: true,
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
        name: 'Costo mercaderías',
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
    {
        id: 'sueldos',
        code: '6.1.01',
        name: 'Sueldos',
        kind: 'EXPENSE',
        section: 'ADMIN',
        group: 'Gastos de administración',
        statementGroup: 'ADMIN_EXPENSES',
        parentId: null,
        level: 2,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    },
    {
        id: 'amort_gasto',
        code: '6.1.07',
        name: 'Amortizaciones',
        kind: 'EXPENSE',
        section: 'ADMIN',
        group: 'Gastos de administración',
        statementGroup: 'ADMIN_EXPENSES',
        parentId: null,
        level: 2,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    },
]

describe('computeStatements', () => {
    it('should generate both balance sheet and income statement', () => {
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
        const trialBalance = computeTrialBalance(ledger, testAccounts)
        const statements = computeStatements(trialBalance, testAccounts)

        expect(statements.balanceSheet).toBeDefined()
        expect(statements.incomeStatement).toBeDefined()
    })

    it('should calculate gross profit correctly', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-16',
                memo: 'Venta',
                lines: [
                    { accountId: 'caja', debit: 5000, credit: 0 },
                    { accountId: 'ventas', debit: 0, credit: 5000 },
                ],
            },
            {
                id: 'e3',
                date: '2024-01-17',
                memo: 'Costo',
                lines: [
                    { accountId: 'cmv', debit: 2000, credit: 0 },
                    { accountId: 'caja', debit: 0, credit: 2000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const trialBalance = computeTrialBalance(ledger, testAccounts)
        const statements = computeStatements(trialBalance, testAccounts)

        // Sales: 5000, COGS: 2000, Gross Profit: 3000
        expect(statements.incomeStatement.sales.netTotal).toBe(5000)
        expect(statements.incomeStatement.cogs.netTotal).toBe(-2000)
        expect(statements.incomeStatement.grossProfit).toBe(3000)
    })

    it('should calculate net income with operating expenses', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-16',
                memo: 'Ventas',
                lines: [
                    { accountId: 'caja', debit: 8000, credit: 0 },
                    { accountId: 'ventas', debit: 0, credit: 8000 },
                ],
            },
            {
                id: 'e3',
                date: '2024-01-17',
                memo: 'Sueldos',
                lines: [
                    { accountId: 'sueldos', debit: 3000, credit: 0 },
                    { accountId: 'caja', debit: 0, credit: 3000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const trialBalance = computeTrialBalance(ledger, testAccounts)
        const statements = computeStatements(trialBalance, testAccounts)

        // Sales 8000, No COGS, Gross 8000, Admin 3000, Net 5000
        expect(statements.incomeStatement.grossProfit).toBe(8000)
        expect(statements.incomeStatement.adminExpenses.netTotal).toBe(-3000)
        expect(statements.incomeStatement.netIncome).toBe(5000)
    })

    it('should net contra accounts in balance sheet (depreciation)', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 5000, credit: 0 },
                    { accountId: 'muebles', debit: 5000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-31',
                memo: 'Amortización',
                lines: [
                    { accountId: 'amort_gasto', debit: 500, credit: 0 },
                    { accountId: 'amort_muebles', debit: 0, credit: 500 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const trialBalance = computeTrialBalance(ledger, testAccounts)
        const statements = computeStatements(trialBalance, testAccounts)

        // PPE should net: Muebles 5000 - Amort 500 = 4500
        const ppeAccounts = statements.balanceSheet.nonCurrentAssets.accounts
        const muebles = ppeAccounts.find((a) => a.account.id === 'muebles')
        const amort = ppeAccounts.find((a) => a.account.id === 'amort_muebles')

        expect(muebles?.balance).toBe(5000)
        expect(amort?.balance).toBe(-500) // Contra account as negative
        expect(amort?.isContra).toBe(true)

        // Net total of non-current assets
        expect(statements.balanceSheet.nonCurrentAssets.netTotal).toBe(4500)
    })

    it('should have balanced balance sheet with net income', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-16',
                memo: 'Venta',
                lines: [
                    { accountId: 'caja', debit: 2000, credit: 0 },
                    { accountId: 'ventas', debit: 0, credit: 2000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const trialBalance = computeTrialBalance(ledger, testAccounts)
        const statements = computeStatements(trialBalance, testAccounts)

        // Assets: 12000 (cash)
        // Liabilities: 0
        // Equity: 10000 (capital) + 2000 (net income) = 12000
        expect(statements.balanceSheet.totalAssets).toBe(12000)
        expect(statements.balanceSheet.totalEquity).toBe(12000)
        expect(statements.balanceSheet.isBalanced).toBe(true)
    })

    it('should calculate loss correctly', () => {
        const entries: JournalEntry[] = [
            {
                id: 'e1',
                date: '2024-01-15',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 10000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 10000 },
                ],
            },
            {
                id: 'e2',
                date: '2024-01-16',
                memo: 'Venta pequeña',
                lines: [
                    { accountId: 'caja', debit: 1000, credit: 0 },
                    { accountId: 'ventas', debit: 0, credit: 1000 },
                ],
            },
            {
                id: 'e3',
                date: '2024-01-17',
                memo: 'Gastos altos',
                lines: [
                    { accountId: 'sueldos', debit: 3000, credit: 0 },
                    { accountId: 'caja', debit: 0, credit: 3000 },
                ],
            },
        ]

        const ledger = computeLedger(entries, testAccounts)
        const trialBalance = computeTrialBalance(ledger, testAccounts)
        const statements = computeStatements(trialBalance, testAccounts)

        // Income: 1000, Expenses: 3000, Net: -2000 (loss)
        expect(statements.incomeStatement.netIncome).toBe(-2000)
    })
})
