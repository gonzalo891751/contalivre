/**
 * Ledger Balance Computation - Pure Functions
 *
 * Transforms journal entries into account balances and movements.
 */

import type { Account, JournalEntry } from '../models';

/**
 * Single movement in the ledger (mayorización)
 */
export interface LedgerMovement {
    entryId: string;
    date: string;
    memo: string;
    debit: number;
    credit: number;
    balance: number;
    description?: string;
}

/**
 * Account balance summary with movements
 */
export interface AccountBalance {
    accountId: string;
    balance: number;
    movements: LedgerMovement[];
    lastMovementDate?: string;
    totalDebit: number;
    totalCredit: number;
}

/**
 * Compute balances for all accounts from journal entries
 *
 * @param entries - All journal entries
 * @param accounts - All accounts (needed for normalSide)
 * @param closingDate - Optional date filter (YYYY-MM-DD)
 * @returns Map of accountId -> AccountBalance
 */
export function computeBalances(
    entries: JournalEntry[],
    accounts: Account[],
    closingDate?: string
): Map<string, AccountBalance> {
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const balanceMap = new Map<string, AccountBalance>();

    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    // Process each entry
    for (const entry of sortedEntries) {
        // Skip entries after closing date
        if (closingDate && entry.date > closingDate) {
            continue;
        }

        // Process each line
        for (const line of entry.lines) {
            if (!line.accountId) continue;

            // Get or create account balance
            let accBalance = balanceMap.get(line.accountId);
            if (!accBalance) {
                accBalance = {
                    accountId: line.accountId,
                    balance: 0,
                    movements: [],
                    totalDebit: 0,
                    totalCredit: 0,
                };
                balanceMap.set(line.accountId, accBalance);
            }

            // Update totals
            accBalance.totalDebit += line.debit;
            accBalance.totalCredit += line.credit;

            // Calculate running balance based on normalSide
            const account = accountMap.get(line.accountId);
            const netMovement = line.debit - line.credit;

            if (account?.normalSide === 'DEBIT') {
                // For DEBIT accounts (ASSET, EXPENSE): positive debit increases balance
                accBalance.balance += netMovement;
            } else {
                // For CREDIT accounts (LIABILITY, EQUITY, INCOME): positive credit increases balance
                accBalance.balance -= netMovement;
            }

            // Add movement
            accBalance.movements.push({
                entryId: entry.id,
                date: entry.date,
                memo: entry.memo,
                debit: line.debit,
                credit: line.credit,
                balance: accBalance.balance,
                description: line.description || entry.memo,
            });

            // Update last movement date
            accBalance.lastMovementDate = entry.date;
        }
    }

    return balanceMap;
}

/**
 * Get balance for a single account
 */
export function getAccountBalance(
    accountId: string,
    balances: Map<string, AccountBalance>
): number {
    return balances.get(accountId)?.balance || 0;
}

/**
 * Get movements for a single account
 */
export function getAccountMovements(
    accountId: string,
    balances: Map<string, AccountBalance>
): LedgerMovement[] {
    return balances.get(accountId)?.movements || [];
}

/**
 * Filter balances by account IDs
 */
export function filterBalancesByAccounts(
    balances: Map<string, AccountBalance>,
    accountIds: string[]
): Map<string, AccountBalance> {
    const filtered = new Map<string, AccountBalance>();
    for (const id of accountIds) {
        const balance = balances.get(id);
        if (balance) {
            filtered.set(id, balance);
        }
    }
    return filtered;
}

/**
 * Get accounts with non-zero balances
 */
export function getNonZeroBalances(
    balances: Map<string, AccountBalance>
): Map<string, AccountBalance> {
    const filtered = new Map<string, AccountBalance>();
    for (const [id, balance] of balances.entries()) {
        if (balance.balance !== 0) {
            filtered.set(id, balance);
        }
    }
    return filtered;
}
