import Dexie, { type EntityTable } from 'dexie'
import type { Account, JournalEntry } from '../core/models'

/**
 * Configuración de la aplicación
 */
export interface Settings {
    id: string
    seedVersion: number
    lastUpdated: string
}

/**
 * Base de datos IndexedDB usando Dexie
 * 
 * Version 2: Added unique constraint on account code, new account fields
 */
class ContableDatabase extends Dexie {
    accounts!: EntityTable<Account, 'id'>
    entries!: EntityTable<JournalEntry, 'id'>
    settings!: EntityTable<Settings, 'id'>

    constructor() {
        super('EntrenadorContable')

        // Version 1: Original schema
        this.version(1).stores({
            accounts: 'id, code, name, type',
            entries: 'id, date, memo',
            settings: 'id',
        })

        // Version 2: Unique code constraint + new account fields for hierarchy
        this.version(2).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
        }).upgrade(async tx => {
            // Migration: Add default values for new fields to existing accounts
            const accounts = tx.table('accounts')
            await accounts.toCollection().modify(account => {
                // Map old 'type' to new 'kind'
                if (!account.kind) {
                    const typeToKind: Record<string, string> = {
                        'Activo': 'ASSET',
                        'Pasivo': 'LIABILITY',
                        'PatrimonioNeto': 'EQUITY',
                        'Ingreso': 'INCOME',
                        'Gasto': 'EXPENSE',
                    }
                    account.kind = typeToKind[account.type] || 'ASSET'
                }
                // Set defaults for new fields
                if (account.parentId === undefined) account.parentId = null
                if (account.level === undefined) account.level = account.code.split('.').length - 1
                if (account.normalSide === undefined) {
                    account.normalSide = ['ASSET', 'EXPENSE'].includes(account.kind) ? 'DEBIT' : 'CREDIT'
                }
                if (account.isContra === undefined) account.isContra = false
                if (account.isHeader === undefined) account.isHeader = false
                if (account.section === undefined) account.section = 'CURRENT'
                if (account.group === undefined) account.group = ''
                if (account.statementGroup === undefined) account.statementGroup = null
            })
        })
    }
}

export const db = new ContableDatabase()

/**
 * Genera un ID único
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Limpia cuentas duplicadas por código (mantiene la más antigua)
 */
export async function cleanupDuplicateAccounts(): Promise<number> {
    const accounts = await db.accounts.orderBy('code').toArray()
    const seen = new Map<string, string>() // code -> first id
    const toDelete: string[] = []

    for (const account of accounts) {
        if (seen.has(account.code)) {
            // This is a duplicate - mark for deletion
            toDelete.push(account.id)
        } else {
            seen.set(account.code, account.id)
        }
    }

    if (toDelete.length > 0) {
        await db.accounts.bulkDelete(toDelete)
        console.log(`🧹 Cleaned up ${toDelete.length} duplicate accounts`)
    }

    return toDelete.length
}

/**
 * Verifica si hay duplicados por código
 */
export async function hasDuplicateCodes(): Promise<boolean> {
    const accounts = await db.accounts.toArray()
    const codes = accounts.map(a => a.code)
    return new Set(codes).size !== codes.length
}
