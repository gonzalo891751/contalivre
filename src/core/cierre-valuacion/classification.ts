/**
 * Cierre: AxI + Valuación - Classification Utilities
 *
 * Logic for deriving Group and Rubro from Account Codes (Plan de Cuentas).
 * Source of Truth: The Account Code Hierarchy (1.x, 2.x, 3.x, 4.x).
 */

import { Account } from '../models'; // Assuming models are re-exported or available
import { GrupoContable } from './types';

export type ExtendedGrupo = GrupoContable | 'RESULTADOS';

/**
 * Derives the Accounting Group from the Account Code.
 * 1.* -> ACTIVO
 * 2.* -> PASIVO
 * 3.* -> PN
 * 4.* -> RESULTADOS
 * Others -> ACTIVO (fallback)
 */
export interface AccountMetadata {
    group: ExtendedGrupo;
    subGroup: 'CORRIENTE' | 'NO_CORRIENTE' | 'NA';
    rubroCode: string; // The parent header code (e.g. 1.1.01)
    isContra: boolean;
    hasContraPattern: boolean; // If code ends in .90 or similar standard (fallback if Account object missing)
}

/**
 * Derives the Accounting Group from the Account Code.
 * 1.* -> ACTIVO
 * 2.* -> PASIVO
 * 3.* -> PN
 * 4.* -> RESULTADOS
 * Others -> ACTIVO (fallback)
 */
export function getGroupFromCode(code: string): ExtendedGrupo {
    if (!code) return 'ACTIVO';

    // Normalize code just in case
    const cleanCode = code.trim();
    if (cleanCode.startsWith('1')) return 'ACTIVO';
    if (cleanCode.startsWith('2')) return 'PASIVO';
    if (cleanCode.startsWith('3')) return 'PN';
    if (cleanCode.startsWith('4')) return 'RESULTADOS';
    if (cleanCode.startsWith('5')) return 'RESULTADOS'; // 5 sometimes used for Expenses/Income separation

    // Fallback for unexpected codes (e.g. legacy imports)
    return 'ACTIVO';
}

/**
 * Derives SubGroup (Corriente / No Corriente) from strict prefixes.
 * - 1.1 / 2.1: CORRIENTE
 * - 1.2 / 2.2: NO_CORRIENTE
 * - Others: NA
 */
export function getSubgroupFromCode(code: string): 'CORRIENTE' | 'NO_CORRIENTE' | 'NA' {
    const c = code.trim();
    if (c.startsWith('1.1') || c.startsWith('2.1')) return 'CORRIENTE';
    if (c.startsWith('1.2') || c.startsWith('2.2')) return 'NO_CORRIENTE';
    return 'NA';
}

/**
 * Normalizes account metadata from a code + optional account object.
 * This is the source of truth for "Repairing" legacy data.
 */
export function getAccountMetadata(code: string, account?: Account): AccountMetadata {
    const group = getGroupFromCode(code);
    const subGroup = getSubgroupFromCode(code);

    // Rubro derivation:
    // If we have an Account object, the 'parent' is the Rubro.
    // If not, we infer strict 3-level depth for Rubros (e.g. 1.1.01)
    let rubroCode = '';
    if (account && account.parentId) {
        // This assumes parent is the Rubro. 
        // For now, we don't have easy access to parent's code without a lookup.
        // fallback to string manipulation below.
    }

    // Heuristic: Rubro is usually the first 3 parts (e.g. 1.1.01)
    // If code is shorter, it might BE the rubro.
    const parts = code.split('.');
    if (parts.length >= 3) {
        rubroCode = parts.slice(0, 3).join('.');
    } else if (parts.length === 2) {
        rubroCode = code; // 1.1
    } else {
        rubroCode = code; // Fallback
    }

    const hasContraPattern = code.endsWith('.90') || code.endsWith('.91') || code.endsWith('.92');
    const isContra = account ? account.isContra : hasContraPattern;

    return {
        group,
        subGroup,
        rubroCode,
        isContra,
        hasContraPattern
    };
}

/**
 * Gets the Rubro (Header) nodes for a specific Group.
 * Rubros are defined as:
 * - Matching Group Prefix
 * - isHeader = true
 * - NOT the root itself (e.g. '1' or '1.0' should be excluded if they exist as accounts)
 * - Typically 2 or 3 levels deep (1.1 or 1.1.01)
 */
export function getRubrosByGroup(group: ExtendedGrupo, allAccounts: Account[]): Account[] {
    const prefix = getGroupPrefix(group);

    const rubros = allAccounts.filter(acc => {
        // Must match prefix
        if (!acc.code.startsWith(prefix)) return false;

        // Must be a header
        if (!acc.isHeader) return false;

        // Exclude root group nodes if they exist as accounts (length 1)
        // e.g. Code "1" is the Group itself, not a Rubro.
        if (acc.code.length <= 1) return false;

        // Exclude huge trees if we only want "Direct Rubros" (optional)
        // For now, allow any header inside the group.
        return true;
    });

    return rubros.sort((a, b) => a.code.localeCompare(b.code));
}

function getGroupPrefix(group: ExtendedGrupo): string {
    switch (group) {
        case 'ACTIVO': return '1';
        case 'PASIVO': return '2';
        case 'PN': return '3';
        case 'RESULTADOS': return '4';
        default: return '1';
    }
}

/**
 * Filters leaf accounts (imputable) that belong to a specific Rubro prefix.
 * Strict logic: Account Code MUST start with rubroPrefix + '.' (child)
 * OR be exactly the prefix (unlikely for leaf).
 */
export function getAccountsByRubroPrefix(rubroPrefix: string, allAccounts: Account[]): Account[] {
    if (!rubroPrefix) return [];

    return allAccounts.filter(acc => {
        // Must not be a header (must be imputable)
        if (acc.isHeader) return false;

        // Strict hierarchy check:
        // A child must start with "Parent."
        // e.g. Parent=1.1.01, Child=1.1.01.01
        return acc.code.startsWith(rubroPrefix + '.') || acc.code === rubroPrefix;
    });
}
