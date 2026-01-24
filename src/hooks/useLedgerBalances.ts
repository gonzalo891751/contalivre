/**
 * useLedgerBalances Hook
 *
 * React hook to compute and cache ledger balances from journal entries.
 */

import { useMemo } from 'react';
import type { JournalEntry, Account } from '../core/models';
import { computeBalances, type AccountBalance } from '../core/ledger/computeBalances';

export interface UseLedgerBalancesOptions {
    closingDate?: string;
    periodId?: string; // For future filtering by period
}

export interface UseLedgerBalancesResult {
    byAccount: Map<string, AccountBalance>;
    totals: {
        totalAccounts: number;
        totalNonZero: number;
        totalDebit: number;
        totalCredit: number;
    };
    loading: boolean;
}

/**
 * Hook to compute ledger balances from entries
 *
 * @param allEntries - All journal entries (from db.entries)
 * @param allAccounts - All accounts (from db.accounts)
 * @param options - Optional filters (closingDate, periodId)
 * @returns Computed balances by account
 */
export function useLedgerBalances(
    allEntries: JournalEntry[] | undefined,
    allAccounts: Account[] | undefined,
    options: UseLedgerBalancesOptions = {}
): UseLedgerBalancesResult {
    const { closingDate } = options;

    const byAccount = useMemo(() => {
        if (!allEntries || !allAccounts) {
            return new Map<string, AccountBalance>();
        }

        return computeBalances(allEntries, allAccounts, closingDate);
    }, [allEntries, allAccounts, closingDate]);

    const totals = useMemo(() => {
        let totalDebit = 0;
        let totalCredit = 0;
        let totalNonZero = 0;

        for (const balance of byAccount.values()) {
            totalDebit += balance.totalDebit;
            totalCredit += balance.totalCredit;
            if (balance.balance !== 0) {
                totalNonZero++;
            }
        }

        return {
            totalAccounts: byAccount.size,
            totalNonZero,
            totalDebit,
            totalCredit,
        };
    }, [byAccount]);

    const loading = !allEntries || !allAccounts;

    return {
        byAccount,
        totals,
        loading,
    };
}
