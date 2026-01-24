/**
 * useAccountOverrides Hook
 *
 * Manages account classification overrides for RT6 automation.
 */

import { useCallback } from 'react';
import type { AccountOverride } from '../core/cierre-valuacion/types';
import type { MonetaryClass } from '../core/cierre-valuacion/monetary-classification';

export interface UseAccountOverridesResult {
    overrides: Record<string, AccountOverride>;
    setOverride: (accountId: string, patch: Partial<AccountOverride>) => void;
    clearOverride: (accountId: string) => void;
    getOverride: (accountId: string) => AccountOverride | undefined;
}

/**
 * Hook to manage account overrides
 *
 * @param overrides - Current overrides from state
 * @param onUpdate - Callback to update state
 * @returns Override management functions
 */
export function useAccountOverrides(
    overrides: Record<string, AccountOverride>,
    onUpdate: (newOverrides: Record<string, AccountOverride>) => void
): UseAccountOverridesResult {
    const setOverride = useCallback(
        (accountId: string, patch: Partial<AccountOverride>) => {
            const existing = overrides[accountId] || {};
            const updated = { ...existing, ...patch };

            onUpdate({
                ...overrides,
                [accountId]: updated,
            });
        },
        [overrides, onUpdate]
    );

    const clearOverride = useCallback(
        (accountId: string) => {
            const newOverrides = { ...overrides };
            delete newOverrides[accountId];
            onUpdate(newOverrides);
        },
        [overrides, onUpdate]
    );

    const getOverride = useCallback(
        (accountId: string): AccountOverride | undefined => {
            return overrides[accountId];
        },
        [overrides]
    );

    return {
        overrides,
        setOverride,
        clearOverride,
        getOverride,
    };
}

/**
 * Helper: Mark account as validated
 */
export function markAsValidated(
    accountId: string,
    overrides: Record<string, AccountOverride>,
    onUpdate: (newOverrides: Record<string, AccountOverride>) => void
): void {
    const existing = overrides[accountId] || {};
    onUpdate({
        ...overrides,
        [accountId]: { ...existing, validated: true },
    });
}

/**
 * Helper: Toggle monetary classification
 */
export function toggleMonetaryClass(
    accountId: string,
    currentClass: MonetaryClass,
    overrides: Record<string, AccountOverride>,
    onUpdate: (newOverrides: Record<string, AccountOverride>) => void
): void {
    const newClass: MonetaryClass = currentClass === 'MONETARY' ? 'NON_MONETARY' : 'MONETARY';
    const existing = overrides[accountId] || {};
    onUpdate({
        ...overrides,
        [accountId]: { ...existing, classification: newClass },
    });
}
