/**
 * ESP Comparative Data Storage Service
 * Persists imported comparative balances per company + year
 */

// ============================================
// Types
// ============================================
export interface ESPComparativeRecord {
    accountCode: string
    accountName: string
    accountId?: string
    amount: number
    originalCode: string
    originalName: string
    matchMethod: 'code' | 'exact' | 'synonym' | 'fuzzy' | 'manual'
    confidence: 'alta' | 'media' | 'baja'
}

interface StoredData {
    records: ESPComparativeRecord[]
    importedAt: string
    version: number
}

const STORAGE_VERSION = 1
const STORAGE_PREFIX = 'esp:comparativo'

// ============================================
// Storage Functions
// ============================================

function getStorageKey(empresaId: string, year: number): string {
    return `${STORAGE_PREFIX}:${empresaId}:${year}`
}

/**
 * Save comparative data for a specific company and year
 */
export function saveESPComparative(
    empresaId: string,
    year: number,
    records: ESPComparativeRecord[]
): void {
    const key = getStorageKey(empresaId, year)
    const data: StoredData = {
        records,
        importedAt: new Date().toISOString(),
        version: STORAGE_VERSION
    }
    localStorage.setItem(key, JSON.stringify(data))
}

/**
 * Load comparative data for a specific company and year
 * Returns null if no data exists
 */
export function loadESPComparative(
    empresaId: string,
    year: number
): ESPComparativeRecord[] | null {
    const key = getStorageKey(empresaId, year)
    const stored = localStorage.getItem(key)

    if (!stored) return null

    try {
        const data: StoredData = JSON.parse(stored)
        if (data.version !== STORAGE_VERSION) {
            // Handle version migration if needed
            console.warn('ESP comparative data version mismatch, clearing old data')
            localStorage.removeItem(key)
            return null
        }
        return data.records
    } catch (e) {
        console.error('Error loading ESP comparative data:', e)
        return null
    }
}

/**
 * Clear comparative data for a specific company and year
 */
export function clearESPComparative(empresaId: string, year: number): void {
    const key = getStorageKey(empresaId, year)
    localStorage.removeItem(key)
}

/**
 * Check if comparative data exists for a specific company and year
 */
export function hasESPComparative(empresaId: string, year: number): boolean {
    const key = getStorageKey(empresaId, year)
    return localStorage.getItem(key) !== null
}

/**
 * Get metadata about stored comparative (import date, record count)
 */
export function getESPComparativeMetadata(
    empresaId: string,
    year: number
): { importedAt: string; recordCount: number } | null {
    const key = getStorageKey(empresaId, year)
    const stored = localStorage.getItem(key)

    if (!stored) return null

    try {
        const data: StoredData = JSON.parse(stored)
        return {
            importedAt: data.importedAt,
            recordCount: data.records.length
        }
    } catch {
        return null
    }
}

/**
 * Convert stored records to a lookup Map by account code
 * Useful for quick access when rendering comparative columns
 */
export function createComparativeLookup(
    records: ESPComparativeRecord[]
): Map<string, number> {
    const lookup = new Map<string, number>()
    for (const record of records) {
        if (record.accountCode) {
            lookup.set(record.accountCode, record.amount)
        }
    }
    return lookup
}
