import { describe, expect, it } from 'vitest'
import type { Account } from '../src/core/models'
import { computeLedger } from '../src/core/ledger'
import { computeRollupTrialBalance } from '../src/core/balance'
import { computeStatements } from '../src/core/statements'
import { normalizeReturnSplitAccountsForCounterparty } from '../src/storage/bienes'

const mkAccount = (account: Account): Account => account

describe('devoluciones - normalizacion de cuentas header', () => {
    it('purchase_return normaliza split en 2.1.01.01 (header) a subcuenta del proveedor', async () => {
        const accounts: Account[] = [
            mkAccount({
                id: 'prov-header',
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
                isHeader: true,
            }),
        ]

        const splits = [{ accountId: 'prov-header', amount: 396800, method: 'DEVOLUCION' }]
        const normalized = await normalizeReturnSplitAccountsForCounterparty({
            accounts,
            splits,
            counterpartyName: 'MAYORISTA S.A.',
            counterpartyKind: 'supplier',
            parentControlAccountCode: '2.1.01.01',
            findOrCreateChildAccountId: async () => 'prov-mayorista',
        })

        expect(normalized[0].accountId).toBe('prov-mayorista')
    })

    it('sale_return normaliza split en 1.1.02.01 (header) a subcuenta del cliente', async () => {
        const accounts: Account[] = [
            mkAccount({
                id: 'deud-header',
                code: '1.1.02.01',
                name: 'Deudores por ventas',
                kind: 'ASSET',
                section: 'CURRENT',
                group: 'Créditos por ventas',
                statementGroup: 'TRADE_RECEIVABLES',
                parentId: null,
                level: 3,
                normalSide: 'DEBIT',
                isContra: false,
                isHeader: true,
            }),
        ]

        const splits = [{ accountId: 'deud-header', amount: 60500, method: 'DEVOLUCION' }]
        const normalized = await normalizeReturnSplitAccountsForCounterparty({
            accounts,
            splits,
            counterpartyName: 'Kiosco Don Tito',
            counterpartyKind: 'customer',
            parentControlAccountCode: '1.1.02.01',
            findOrCreateChildAccountId: async () => 'deud-kiosco',
        })

        expect(normalized[0].accountId).toBe('deud-kiosco')
    })

    it('rechaza split en header si no hay tercero para resolver subcuenta', async () => {
        const accounts: Account[] = [
            mkAccount({
                id: 'deud-header',
                code: '1.1.02.01',
                name: 'Deudores por ventas',
                kind: 'ASSET',
                section: 'CURRENT',
                group: 'Creditos por ventas',
                statementGroup: 'TRADE_RECEIVABLES',
                parentId: null,
                level: 3,
                normalSide: 'DEBIT',
                isContra: false,
                isHeader: true,
            }),
        ]

        await expect(
            normalizeReturnSplitAccountsForCounterparty({
                accounts,
                splits: [{ accountId: 'deud-header', amount: 100, method: 'DEVOLUCION' }],
                counterpartyName: '',
                counterpartyKind: 'customer',
                parentControlAccountCode: '1.1.02.01',
            })
        ).rejects.toThrow('cuenta madre')
    })

    it('con subcuenta postable, TB conserva la linea y ESP cierra', () => {
        const accounts: Account[] = [
            {
                id: 'caja',
                code: '1.1.01.01',
                name: 'Caja',
                kind: 'ASSET',
                section: 'CURRENT',
                group: 'Caja',
                statementGroup: 'CASH_AND_BANKS',
                parentId: null,
                level: 3,
                normalSide: 'DEBIT',
                isContra: false,
                isHeader: false,
            },
            {
                id: 'deud-header',
                code: '1.1.02.01',
                name: 'Deudores por ventas',
                kind: 'ASSET',
                section: 'CURRENT',
                group: 'Créditos',
                statementGroup: 'TRADE_RECEIVABLES',
                parentId: null,
                level: 3,
                normalSide: 'DEBIT',
                isContra: false,
                isHeader: true,
            },
            {
                id: 'deud-kiosco',
                code: '1.1.02.01.01',
                name: 'Kiosco Don Tito',
                kind: 'ASSET',
                section: 'CURRENT',
                group: 'Créditos',
                statementGroup: 'TRADE_RECEIVABLES',
                parentId: 'deud-header',
                level: 4,
                normalSide: 'DEBIT',
                isContra: false,
                isHeader: false,
            },
            {
                id: 'iva-df',
                code: '2.1.03.01',
                name: 'IVA Débito Fiscal',
                kind: 'LIABILITY',
                section: 'CURRENT',
                group: 'Fiscales',
                statementGroup: 'TAX_LIABILITIES',
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
                level: 3,
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
                group: 'Ingresos',
                statementGroup: 'SALES',
                parentId: null,
                level: 3,
                normalSide: 'CREDIT',
                isContra: false,
                isHeader: false,
            },
            {
                id: 'devol-ventas',
                code: '4.8.06',
                name: 'Devoluciones sobre ventas',
                kind: 'INCOME',
                section: 'OPERATING',
                group: 'Ingresos',
                statementGroup: 'SALES',
                parentId: null,
                level: 3,
                normalSide: 'DEBIT',
                isContra: true,
                isHeader: false,
            },
        ]

        const entries = [
            {
                id: 'e1',
                date: '2025-01-01',
                memo: 'Aporte',
                lines: [
                    { accountId: 'caja', debit: 1000, credit: 0 },
                    { accountId: 'capital', debit: 0, credit: 1000 },
                ],
            },
            {
                id: 'e2',
                date: '2025-01-02',
                memo: 'Venta cta cte',
                lines: [
                    { accountId: 'deud-kiosco', debit: 121, credit: 0 },
                    { accountId: 'ventas', debit: 0, credit: 100 },
                    { accountId: 'iva-df', debit: 0, credit: 21 },
                ],
            },
            {
                id: 'e3',
                date: '2025-01-05',
                memo: 'Devolución parcial',
                lines: [
                    { accountId: 'devol-ventas', debit: 50, credit: 0 },
                    { accountId: 'iva-df', debit: 10.5, credit: 0 },
                    { accountId: 'deud-kiosco', debit: 0, credit: 60.5 },
                ],
            },
        ]

        const ledger = computeLedger(entries, accounts)
        const trial = computeRollupTrialBalance(ledger, accounts)
        const statements = computeStatements(trial, accounts)

        expect(trial.rows.some(row => row.account.id === 'deud-header')).toBe(false)
        expect(trial.rows.some(row => row.account.id === 'deud-kiosco')).toBe(true)
        expect(Math.abs(statements.balanceSheet.totalAssets - statements.balanceSheet.totalLiabilitiesAndEquity)).toBeLessThanOrEqual(0.01)
        expect(statements.balanceSheet.isBalanced).toBe(true)
    })
})
