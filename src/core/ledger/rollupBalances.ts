import type { Account, Ledger } from '../models'
import { calculateBalance } from '../ledger'

export interface DirectTotals {
    totalDebit: number
    totalCredit: number
}

export interface RollupTotals {
    accountId: string
    totalDebit: number
    totalCredit: number
    balance: number
    hasDirectMovements: boolean
    hasDescendantMovements: boolean
}

export interface AccountHierarchy {
    accountsById: Map<string, Account>
    accountsByCode: Map<string, Account>
    parentById: Map<string, string | null>
    childrenById: Map<string, string[]>
    ancestorsById: Map<string, string[]>
}

export type PresentationPredicate = (account: Account, parent: Account | null) => boolean

export const defaultPresentationPredicate: PresentationPredicate = (_account, parent) => {
    if (!parent) return true
    return parent.isHeader
}

function deriveParentIdFromCode(account: Account, accountsByCode: Map<string, Account>): string | null {
    const code = (account.code || '').trim()
    const segments = code.split('.').filter(Boolean)
    if (segments.length <= 1) return null
    const parentCode = segments.slice(0, -1).join('.')
    return accountsByCode.get(parentCode)?.id ?? null
}

export function buildAccountHierarchy(accounts: Account[]): AccountHierarchy {
    const accountsById = new Map<string, Account>()
    const accountsByCode = new Map<string, Account>()

    for (const account of accounts) {
        accountsById.set(account.id, account)
        if (account.code) {
            accountsByCode.set(account.code, account)
        }
    }

    const parentById = new Map<string, string | null>()
    for (const account of accounts) {
        let parentId = account.parentId
        if (parentId && !accountsById.has(parentId)) {
            parentId = null
        }
        if (!parentId) {
            parentId = deriveParentIdFromCode(account, accountsByCode)
        }
        parentById.set(account.id, parentId ?? null)
    }

    const childrenById = new Map<string, string[]>()
    for (const account of accounts) {
        childrenById.set(account.id, [])
    }
    for (const account of accounts) {
        const parentId = parentById.get(account.id)
        if (parentId && childrenById.has(parentId)) {
            childrenById.get(parentId)!.push(account.id)
        }
    }

    const ancestorsById = new Map<string, string[]>()
    for (const account of accounts) {
        const ancestors: string[] = []
        let currentId = account.id
        const visited = new Set<string>()
        while (currentId) {
            if (visited.has(currentId)) break
            visited.add(currentId)
            const parentId = parentById.get(currentId)
            if (!parentId) break
            ancestors.push(parentId)
            currentId = parentId
        }
        ancestorsById.set(account.id, ancestors)
    }

    return {
        accountsById,
        accountsByCode,
        parentById,
        childrenById,
        ancestorsById,
    }
}

export function getPresentationAccountId(
    accountId: string,
    hierarchy: AccountHierarchy,
    predicate: PresentationPredicate = defaultPresentationPredicate
): string {
    let currentId = accountId
    const visited = new Set<string>()

    while (currentId) {
        if (visited.has(currentId)) break
        visited.add(currentId)
        const account = hierarchy.accountsById.get(currentId)
        if (!account) break
        const parentId = hierarchy.parentById.get(currentId) ?? null
        const parent = parentId ? hierarchy.accountsById.get(parentId) ?? null : null
        if (predicate(account, parent)) {
            return currentId
        }
        if (!parentId) break
        currentId = parentId
    }

    return accountId
}

export function getDirectTotalsFromLedger(ledger: Ledger): Map<string, DirectTotals> {
    const totals = new Map<string, DirectTotals>()
    for (const [accountId, la] of ledger.entries()) {
        totals.set(accountId, {
            totalDebit: la.totalDebit,
            totalCredit: la.totalCredit,
        })
    }
    return totals
}

export function computeRollupTotals(
    accounts: Account[],
    directTotals: Map<string, DirectTotals>,
    hierarchy: AccountHierarchy = buildAccountHierarchy(accounts)
): Map<string, RollupTotals> {
    const rollup = new Map<string, RollupTotals>()

    for (const account of accounts) {
        const direct = directTotals.get(account.id) ?? { totalDebit: 0, totalCredit: 0 }
        const hasDirect = direct.totalDebit !== 0 || direct.totalCredit !== 0
        rollup.set(account.id, {
            accountId: account.id,
            totalDebit: direct.totalDebit,
            totalCredit: direct.totalCredit,
            balance: 0,
            hasDirectMovements: hasDirect,
            hasDescendantMovements: false,
        })
    }

    for (const account of accounts) {
        const direct = directTotals.get(account.id)
        if (!direct) continue
        if (direct.totalDebit === 0 && direct.totalCredit === 0) continue

        const ancestors = hierarchy.ancestorsById.get(account.id) ?? []
        for (const ancestorId of ancestors) {
            const target = rollup.get(ancestorId)
            if (!target) continue
            target.totalDebit += direct.totalDebit
            target.totalCredit += direct.totalCredit
            target.hasDescendantMovements = true
        }
    }

    for (const account of accounts) {
        const entry = rollup.get(account.id)
        if (!entry) continue
        entry.balance = calculateBalance(account, entry.totalDebit, entry.totalCredit)
    }

    return rollup
}
