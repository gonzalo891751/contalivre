/**
 * Asset Accounts Helper
 *
 * Handles automatic creation of asset and contra (accumulated depreciation) accounts
 * for fixed assets based on category.
 */

import { db } from '../storage/db'
import { createAccount, generateNextCode, getAccountByCode } from '../storage/accounts'
import type { Account } from '../core/models'
import {
    CATEGORY_ACCOUNT_CODES,
    type FixedAssetCategory,
} from '../core/fixedAssets/types'

export interface AssetAccountPair {
    assetAccountId: string
    contraAccountId: string
}

/**
 * Find or create asset + contra accounts for a fixed asset
 * Returns IDs of both accounts
 */
export async function ensureAssetAccounts(
    category: FixedAssetCategory,
    assetName: string
): Promise<AssetAccountPair> {
    const codes = CATEGORY_ACCOUNT_CODES[category]

    // Get parent accounts by code
    const assetParent = await getAccountByCode(codes.asset)
    const contraParent = await getAccountByCode(codes.contra)

    if (!assetParent) {
        throw new Error(`Cuenta padre de activo no encontrada: ${codes.asset} (${codes.name}). Verificar Plan de Cuentas.`)
    }
    if (!contraParent) {
        throw new Error(`Cuenta padre de amort. acumulada no encontrada: ${codes.contra} (${codes.contraName}). Verificar Plan de Cuentas.`)
    }

    // Generate codes for the specific asset
    const assetCode = await generateNextCode(assetParent.id)
    const contraCode = await generateNextCode(contraParent.id)

    // Create asset account
    const assetAccount = await createAccount({
        code: assetCode,
        name: assetName,
        kind: 'ASSET',
        section: 'NON_CURRENT',
        group: codes.name,
        statementGroup: 'PPE',
        parentId: assetParent.id,
        normalSide: 'DEBIT',
        isContra: false,
        isHeader: false,
    })

    // Create contra account (accumulated depreciation)
    const contraAccount = await createAccount({
        code: contraCode,
        name: `Amort. Acum. ${assetName}`,
        kind: 'ASSET',
        section: 'NON_CURRENT',
        group: codes.contraName,
        statementGroup: 'PPE',
        parentId: contraParent.id,
        normalSide: 'CREDIT',
        isContra: true,
        isHeader: false,
    })

    return {
        assetAccountId: assetAccount.id,
        contraAccountId: contraAccount.id,
    }
}

/**
 * Find existing postable accounts under a category's parent codes
 * Used when user wants to manually select accounts
 */
export async function findAccountsForCategory(
    category: FixedAssetCategory
): Promise<{ assetAccounts: Account[]; contraAccounts: Account[] }> {
    const codes = CATEGORY_ACCOUNT_CODES[category]
    const allAccounts = await db.accounts.toArray()

    const assetAccounts = allAccounts.filter(
        a => a.code.startsWith(codes.asset + '.') && !a.isHeader
    )
    const contraAccounts = allAccounts.filter(
        a => a.code.startsWith(codes.contra + '.') && !a.isHeader
    )

    return { assetAccounts, contraAccounts }
}

/**
 * Get all parent account options for asset accounts
 * Used in manual account selection mode
 */
export async function getAssetParentAccounts(): Promise<Account[]> {
    const parentCodes = new Set(
        Object.values(CATEGORY_ACCOUNT_CODES).map(c => c.asset)
    )

    const accounts = await db.accounts.toArray()
    return accounts.filter(a => parentCodes.has(a.code))
}

/**
 * Get all parent account options for contra (amort. acum.) accounts
 */
export async function getContraParentAccounts(): Promise<Account[]> {
    const parentCodes = new Set(
        Object.values(CATEGORY_ACCOUNT_CODES).map(c => c.contra)
    )

    const accounts = await db.accounts.toArray()
    return accounts.filter(a => parentCodes.has(a.code))
}

/**
 * Check if category parent accounts exist in the chart of accounts
 */
export async function validateCategoryParentsExist(
    category: FixedAssetCategory
): Promise<{ valid: boolean; missingAsset?: string; missingContra?: string }> {
    const codes = CATEGORY_ACCOUNT_CODES[category]

    const assetParent = await getAccountByCode(codes.asset)
    const contraParent = await getAccountByCode(codes.contra)

    if (!assetParent && !contraParent) {
        return {
            valid: false,
            missingAsset: `${codes.asset} (${codes.name})`,
            missingContra: `${codes.contra} (${codes.contraName})`,
        }
    }

    if (!assetParent) {
        return {
            valid: false,
            missingAsset: `${codes.asset} (${codes.name})`,
        }
    }

    if (!contraParent) {
        return {
            valid: false,
            missingContra: `${codes.contra} (${codes.contraName})`,
        }
    }

    return { valid: true }
}
