/**
 * Mapping Storage
 * 
 * Handles persistence of account-to-taxonomy mappings in localStorage.
 * Also provides utilities for syncing mappings to Dexie account records.
 */

import type { StatementGroup } from '../../core/models'

// ============================================================================
// Types
// ============================================================================

export type Confidence = 'high' | 'medium' | 'low'

export interface MappingEntry {
    /** The mapped StatementGroup, or null if unmapped */
    taxonomyId: StatementGroup | null
    /** Confidence level from auto-detection */
    confidence: Confidence | null
    /** Whether this is a contra account */
    contra: boolean
    /** Whether to include in KPI calculations */
    includeInKpis: boolean
}

export interface MappingConfig {
    /** Schema version for future migrations */
    version: 1
    /** ISO timestamp of last update */
    updatedAt: string
    /** Coverage percentage (0-100) */
    coverage: number
    /** Account ID -> Mapping entry */
    entries: Record<string, MappingEntry>
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'contalivre:mapping:v1'

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Load mapping configuration from localStorage
 */
export function loadMapping(): MappingConfig | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null

        const parsed = JSON.parse(raw)

        // Validate version
        if (parsed.version !== 1) {
            console.warn('Mapping config version mismatch, ignoring stored data')
            return null
        }

        return parsed as MappingConfig
    } catch (error) {
        console.error('Error loading mapping config:', error)
        return null
    }
}

/**
 * Save mapping configuration to localStorage
 */
export function saveMapping(config: MappingConfig): void {
    try {
        config.updatedAt = new Date().toISOString()
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch (error) {
        console.error('Error saving mapping config:', error)
        throw new Error('No se pudo guardar la configuración de mapeo')
    }
}

/**
 * Clear mapping configuration from localStorage
 * Called when starting a new exercise
 */
export function clearMapping(): void {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
        console.error('Error clearing mapping config:', error)
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new empty mapping config
 */
export function createEmptyMappingConfig(): MappingConfig {
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        coverage: 0,
        entries: {},
    }
}

/**
 * Create or update a mapping entry
 */
export function createMappingEntry(
    taxonomyId: StatementGroup | null,
    confidence: Confidence | null = null,
    contra: boolean = false,
    includeInKpis: boolean = true
): MappingEntry {
    return {
        taxonomyId,
        confidence,
        contra,
        includeInKpis,
    }
}

/**
 * Calculate coverage percentage from mapping entries
 * Coverage = mapped leaf accounts / total leaf accounts
 */
export function calculateCoverage(
    entries: Record<string, MappingEntry>,
    leafAccountIds: string[]
): number {
    if (leafAccountIds.length === 0) return 100

    let mappedCount = 0
    for (const id of leafAccountIds) {
        if (entries[id]?.taxonomyId) {
            mappedCount++
        }
    }

    return Math.round((mappedCount / leafAccountIds.length) * 100)
}

/**
 * Get statistics about mapping entries
 */
export function getMappingStats(entries: Record<string, MappingEntry>): {
    total: number
    mapped: number
    unmapped: number
    highConfidence: number
    mediumConfidence: number
    lowConfidence: number
    contraCount: number
} {
    let mapped = 0
    let unmapped = 0
    let highConfidence = 0
    let mediumConfidence = 0
    let lowConfidence = 0
    let contraCount = 0

    for (const entry of Object.values(entries)) {
        if (entry.taxonomyId) {
            mapped++
            if (entry.confidence === 'high') highConfidence++
            else if (entry.confidence === 'medium') mediumConfidence++
            else if (entry.confidence === 'low') lowConfidence++
        } else {
            unmapped++
        }
        if (entry.contra) contraCount++
    }

    return {
        total: Object.keys(entries).length,
        mapped,
        unmapped,
        highConfidence,
        mediumConfidence,
        lowConfidence,
        contraCount,
    }
}
