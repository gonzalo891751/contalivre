import { db, generateId } from './db'
import type { Account, AccountKind } from '../core/models'
import { getDefaultNormalSide } from '../core/models'

/**
 * Obtiene todas las cuentas ordenadas por código
 */
export async function getAllAccounts(): Promise<Account[]> {
    return db.accounts.orderBy('code').toArray()
}

/**
 * Obtiene una cuenta por ID
 */
export async function getAccountById(id: string): Promise<Account | undefined> {
    return db.accounts.get(id)
}

/**
 * Obtiene una cuenta por código
 */
export async function getAccountByCode(code: string): Promise<Account | undefined> {
    return db.accounts.where('code').equals(code).first()
}

/**
 * Genera el siguiente código disponible para un padre dado
 */
export async function generateNextCode(parentId: string | null): Promise<string> {
    if (!parentId) {
        // Root level - find max root code
        // We look for accounts with no parent AND simple integer codes to be safe?
        // Actually, let's just look at top-level accounts.
        const roots = await db.accounts.filter(a => a.parentId === null).toArray()

        // Extract numeric part of code if possible
        const maxCode = roots
            .map(a => parseInt(a.code) || 0)
            .reduce((max, n) => Math.max(max, n), 0)

        return String(maxCode + 1)
    }

    const parent = await db.accounts.get(parentId)
    if (!parent) {
        throw new Error('Cuenta padre no encontrada')
    }

    // Robust strategy: Find ALL accounts that start with "parentCode."
    // This covers children even if parentId is wrong (though that shouldn't happen),
    // but mainly it's the standard way to find occupied slots in the hierarchy.
    const prefix = `${parent.code}.`
    const descendants = await db.accounts
        .filter(a => a.code.startsWith(prefix))
        .toArray()

    // Filter only direct children (one segment more than parent)
    const parentSegments = parent.code.split('.').length
    const children = descendants.filter(a => a.code.split('.').length === parentSegments + 1)

    if (children.length === 0) {
        return `${prefix}01`
    }

    // Parse suffixes
    const usedSuffixes = new Set<number>()
    let maxSuffix = 0

    for (const child of children) {
        const parts = child.code.split('.')
        const lastPart = parts[parts.length - 1]
        const num = parseInt(lastPart)
        if (!isNaN(num)) {
            usedSuffixes.add(num)
            if (num > maxSuffix) maxSuffix = num
        }
    }

    // specific logic: User wants to fill gaps? 
    // "Si hay huecos: usar el primero libre"
    let nextSuffix = 1
    while (usedSuffixes.has(nextSuffix)) {
        nextSuffix++
    }

    // Format with 2 digits usually, unless existing children use more?
    // Let's assume 2 digits as standard unless we see chaos.
    // user example: "1.2.01.91" -> implies 2 digits.
    return `${prefix}${String(nextSuffix).padStart(2, '0')}`
}

/**
 * Crea una nueva cuenta
 */
export async function createAccount(
    accountData: Omit<Account, 'id' | 'level'> & { parentId: string | null }
): Promise<Account> {
    // Verificar código único
    const existing = await getAccountByCode(accountData.code)
    if (existing) {
        throw new Error(`Ya existe una cuenta con el código "${accountData.code}"`)
    }

    // Calcular nivel
    const level = accountData.code.split('.').length - 1

    const newAccount: Account = {
        ...accountData,
        id: generateId(),
        level,
        normalSide: accountData.normalSide || getDefaultNormalSide(accountData.kind),
        isContra: accountData.isContra || false,
        isHeader: accountData.isHeader || false,
    }

    await db.accounts.add(newAccount)
    return newAccount
}

/**
 * Actualiza una cuenta existente
 */
export async function updateAccount(
    id: string,
    updates: Partial<Omit<Account, 'id'>>
): Promise<Account> {
    const existing = await db.accounts.get(id)
    if (!existing) {
        throw new Error('Cuenta no encontrada')
    }

    // Si cambia el código, verificar que sea único
    if (updates.code && updates.code !== existing.code) {
        const withSameCode = await getAccountByCode(updates.code)
        if (withSameCode) {
            throw new Error(`Ya existe una cuenta con el código "${updates.code}"`)
        }
    }

    // Recalcular nivel si cambia el código
    let level = existing.level
    if (updates.code) {
        level = updates.code.split('.').length - 1
    }

    const updated: Account = { ...existing, ...updates, level }
    await db.accounts.put(updated)
    return updated
}

/**
 * Elimina una cuenta
 */
export async function deleteAccount(id: string): Promise<void> {
    // Verificar que no tenga hijos
    const children = await db.accounts.where('parentId').equals(id).count()
    if (children > 0) {
        throw new Error(
            `No se puede eliminar la cuenta porque tiene ${children} subcuenta(s). ` +
            'Eliminá primero las subcuentas.'
        )
    }

    // Verificar que no tenga asientos asociados
    const entries = await db.entries.toArray()
    const hasEntries = entries.some((entry) =>
        entry.lines.some((line) => line.accountId === id)
    )

    if (hasEntries) {
        throw new Error(
            'No se puede eliminar la cuenta porque tiene asientos asociados. ' +
            'Eliminá primero los asientos que la usan.'
        )
    }

    await db.accounts.delete(id)
}

/**
 * Busca cuentas por nombre o código
 */
export async function searchAccounts(query: string): Promise<Account[]> {
    const normalizedQuery = query.toLowerCase().trim()
    if (!normalizedQuery) {
        return getAllAccounts()
    }

    const all = await db.accounts.toArray()
    return all
        .filter(
            (account) =>
                account.name.toLowerCase().includes(normalizedQuery) ||
                account.code.toLowerCase().includes(normalizedQuery)
        )
        .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Obtiene cuentas imputables (no son header)
 */
export async function getPostableAccounts(): Promise<Account[]> {
    const all = await db.accounts.toArray()
    return all
        .filter(account => !account.isHeader)
        .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Obtiene cuentas por tipo
 */
export async function getAccountsByKind(kind: AccountKind): Promise<Account[]> {
    return db.accounts.where('kind').equals(kind).sortBy('code')
}

/**
 * Obtiene los hijos de una cuenta
 */
export async function getChildren(parentId: string): Promise<Account[]> {
    return db.accounts.where('parentId').equals(parentId).sortBy('code')
}

/**
 * Verifica si una cuenta tiene hijos
 */
export async function hasChildren(id: string): Promise<boolean> {
    const count = await db.accounts.where('parentId').equals(id).count()
    return count > 0
}

// ============================================================================
// Bulk Operations for Import
// ============================================================================

/**
 * Delete all accounts from the database
 */
export async function deleteAllAccounts(): Promise<void> {
    await db.accounts.clear()
}

/**
 * Get a map of code -> account for all existing accounts
 */
export async function getAccountCodeMap(): Promise<Map<string, Account>> {
    const all = await db.accounts.toArray()
    return new Map(all.map(a => [a.code, a]))
}

/**
 * Bulk create accounts (for import)
 * Resolves parent IDs based on code hierarchy
 */
export async function bulkCreateAccounts(
    accountsData: (Omit<Account, 'id'> & { _parentCode?: string | null })[]
): Promise<Account[]> {
    // Sort by code to ensure parents are created before children
    const sorted = [...accountsData].sort((a, b) => a.code.localeCompare(b.code))

    // Map to track code -> id for resolving parent relationships
    const codeToId = new Map<string, string>()

    // Also get existing accounts for parent resolution
    const existingMap = await getAccountCodeMap()
    existingMap.forEach((acc, code) => codeToId.set(code, acc.id))

    const newAccounts: Account[] = []

    for (const data of sorted) {
        // Resolve parentId from parentCode
        let parentId: string | null = null
        const parentCode = data._parentCode

        if (parentCode && codeToId.has(parentCode)) {
            parentId = codeToId.get(parentCode)!
        }

        // If no explicit parent code, try to infer from code structure
        if (!parentId && data.code.includes('.')) {
            const parts = data.code.split('.')
            const inferredParentCode = parts.slice(0, -1).join('.')
            if (codeToId.has(inferredParentCode)) {
                parentId = codeToId.get(inferredParentCode)!
            }
        }

        const level = data.code.split('.').length - 1

        const newAccount: Account = {
            ...data,
            id: generateId(),
            level,
            parentId,
            normalSide: data.normalSide || getDefaultNormalSide(data.kind),
            isContra: data.isContra || false,
            isHeader: data.isHeader ?? level < 2,
        }

        // Remove the temporary _parentCode field
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (newAccount as any)._parentCode

        codeToId.set(newAccount.code, newAccount.id)
        newAccounts.push(newAccount)
    }

    // Bulk add all accounts
    await db.accounts.bulkAdd(newAccounts)

    return newAccounts
}

/**
 * Replace all accounts with new ones (atomic operation)
 */
export async function replaceAllAccounts(
    accountsData: (Omit<Account, 'id'> & { _parentCode?: string | null })[]
): Promise<{ created: number }> {
    return await db.transaction('rw', db.accounts, async () => {
        // Clear all existing accounts
        await db.accounts.clear()

        // Create new accounts
        const created = await bulkCreateAccounts(accountsData)

        return { created: created.length }
    })
}

/**
 * Merge accounts: add new ones, optionally update existing
 */
export async function mergeAccounts(
    accountsData: (Omit<Account, 'id'> & { _parentCode?: string | null })[],
    updateExisting: boolean = false
): Promise<{ created: number; updated: number; skipped: number }> {
    const existingMap = await getAccountCodeMap()

    const toCreate: (Omit<Account, 'id'> & { _parentCode?: string | null })[] = []
    const toUpdate: { id: string; data: Partial<Account> }[] = []
    let skipped = 0

    for (const data of accountsData) {
        const existing = existingMap.get(data.code)

        if (existing) {
            if (updateExisting) {
                // Update existing account
                toUpdate.push({
                    id: existing.id,
                    data: {
                        name: data.name,
                        kind: data.kind,
                        section: data.section,
                    }
                })
            } else {
                skipped++
            }
        } else {
            toCreate.push(data)
        }
    }

    // Create new accounts
    let createdCount = 0
    if (toCreate.length > 0) {
        const created = await bulkCreateAccounts(toCreate)
        createdCount = created.length
    }

    // Update existing accounts
    let updatedCount = 0
    for (const { id, data } of toUpdate) {
        await db.accounts.update(id, data)
        updatedCount++
    }

    return {
        created: createdCount,
        updated: updatedCount,
        skipped,
    }
}

