/**
 * Notas y Anexos Storage Service
 * Persists narratives, expense allocations, and cost overrides per company + period
 */

import type { ExpenseAllocation, NotasAnexosState } from '../core/notas-anexos/types'

// ============================================
// Types
// ============================================

interface StoredNarrative {
    noteNumber: number
    text: string
}

interface StoredExpenseAllocation {
    accountCode: string
    costPct: number
    adminPct: number
    commercialPct: number
    isManual: boolean
}

interface StoredCostOverride {
    componentId: string
    value: number
}

interface StoredData {
    narratives: StoredNarrative[]
    expenseAllocations: StoredExpenseAllocation[]
    costOverrides: StoredCostOverride[]
    updatedAt: string
    version: number
}

const STORAGE_VERSION = 1
const STORAGE_PREFIX = 'notas-anexos'

// ============================================
// Storage Functions
// ============================================

function getStorageKey(empresaId: string, periodKey: string): string {
    return `${STORAGE_PREFIX}:${empresaId}:${periodKey}`
}

/**
 * Save state for a specific company and period
 */
export function saveNotasAnexosState(
    empresaId: string,
    periodKey: string,
    state: NotasAnexosState
): void {
    const key = getStorageKey(empresaId, periodKey)

    const data: StoredData = {
        narratives: Array.from(state.narratives.entries()).map(([noteNumber, text]) => ({
            noteNumber,
            text,
        })),
        expenseAllocations: Array.from(state.expenseAllocations.entries()).map(
            ([accountCode, alloc]) => ({
                accountCode,
                costPct: alloc.costPct,
                adminPct: alloc.adminPct,
                commercialPct: alloc.commercialPct,
                isManual: alloc.isManual,
            })
        ),
        costOverrides: Array.from(state.costOverrides.entries()).map(([componentId, value]) => ({
            componentId,
            value,
        })),
        updatedAt: new Date().toISOString(),
        version: STORAGE_VERSION,
    }

    localStorage.setItem(key, JSON.stringify(data))
}

/**
 * Load state for a specific company and period
 * Returns null if no data exists
 */
export function loadNotasAnexosState(
    empresaId: string,
    periodKey: string
): NotasAnexosState | null {
    const key = getStorageKey(empresaId, periodKey)
    const stored = localStorage.getItem(key)

    if (!stored) return null

    try {
        const data: StoredData = JSON.parse(stored)

        if (data.version !== STORAGE_VERSION) {
            console.warn('Notas anexos data version mismatch, clearing old data')
            localStorage.removeItem(key)
            return null
        }

        const narratives = new Map<number, string>()
        for (const n of data.narratives) {
            narratives.set(n.noteNumber, n.text)
        }

        const expenseAllocations = new Map<string, ExpenseAllocation & { isManual: boolean }>()
        for (const a of data.expenseAllocations) {
            expenseAllocations.set(a.accountCode, {
                costPct: a.costPct,
                adminPct: a.adminPct,
                commercialPct: a.commercialPct,
                isManual: a.isManual,
            })
        }

        const costOverrides = new Map<string, number>()
        for (const o of data.costOverrides) {
            costOverrides.set(o.componentId, o.value)
        }

        return {
            narratives,
            expenseAllocations,
            costOverrides,
        }
    } catch (e) {
        console.error('Error loading notas anexos state:', e)
        return null
    }
}

/**
 * Clear state for a specific company and period
 */
export function clearNotasAnexosState(empresaId: string, periodKey: string): void {
    const key = getStorageKey(empresaId, periodKey)
    localStorage.removeItem(key)
}

/**
 * Check if state exists for a specific company and period
 */
export function hasNotasAnexosState(empresaId: string, periodKey: string): boolean {
    const key = getStorageKey(empresaId, periodKey)
    return localStorage.getItem(key) !== null
}

/**
 * Get period key from fiscal year (end of year)
 */
export function getPeriodKey(fiscalYear: number): string {
    return `${fiscalYear}-12-31`
}
