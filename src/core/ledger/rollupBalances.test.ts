import { describe, expect, it } from 'vitest'
import type { Account } from '../models'
import {
    buildAccountHierarchy,
    computeRollupTotals,
    defaultPresentationPredicate,
    getPresentationAccountId,
} from './rollupBalances'

const baseAccount = (overrides: Partial<Account>): Account => ({
    id: 'x',
    code: '0',
    name: 'Account',
    kind: 'ASSET',
    section: 'NON_CURRENT',
    group: 'PPE',
    statementGroup: 'PPE',
    parentId: null,
    level: 0,
    normalSide: 'DEBIT',
    isContra: false,
    isHeader: false,
    ...overrides,
})

describe('rollupBalances', () => {
    it('rolls up direct totals to ancestors and selects presentation account', () => {
        const accounts: Account[] = [
            baseAccount({ id: 'root', code: '1', name: 'Assets', isHeader: true }),
            baseAccount({ id: 'ppe', code: '1.2.01', name: 'PPE', parentId: 'root', isHeader: true }),
            baseAccount({ id: 'vehicles', code: '1.2.01.04', name: 'Vehicles', parentId: 'ppe' }),
            baseAccount({ id: 'toyota', code: '1.2.01.04.01', name: 'Toyota', parentId: 'vehicles' }),
        ]

        const directTotals = new Map([
            ['toyota', { totalDebit: 100, totalCredit: 0 }],
        ])

        const hierarchy = buildAccountHierarchy(accounts)
        const rollup = computeRollupTotals(accounts, directTotals, hierarchy)

        expect(rollup.get('vehicles')?.totalDebit).toBe(100)
        expect(rollup.get('ppe')?.totalDebit).toBe(100)
        expect(rollup.get('root')?.totalDebit).toBe(100)

        const presentationId = getPresentationAccountId(
            'toyota',
            hierarchy,
            defaultPresentationPredicate
        )

        expect(presentationId).toBe('vehicles')
    })

    it('falls back to code-derived parents when parentId is missing', () => {
        const accounts: Account[] = [
            baseAccount({ id: 'root', code: '1', name: 'Assets', isHeader: true }),
            baseAccount({ id: 'vehicles', code: '1.2.01.04', name: 'Vehicles', parentId: null }),
            baseAccount({ id: 'toyota', code: '1.2.01.04.01', name: 'Toyota', parentId: null }),
        ]

        const directTotals = new Map([
            ['toyota', { totalDebit: 50, totalCredit: 0 }],
        ])

        const hierarchy = buildAccountHierarchy(accounts)
        const rollup = computeRollupTotals(accounts, directTotals, hierarchy)

        expect(rollup.get('vehicles')?.totalDebit).toBe(50)
    })
})
