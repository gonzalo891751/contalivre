/**
 * Amortizaciones Storage
 * 
 * Persistence layer for the amortization calculator using Dexie/IndexedDB.
 */

import { db } from './db'
import type { AmortizationState } from '../core/amortizaciones/types'
import { createInitialState } from '../core/amortizaciones/types'

const STATE_ID = 'amortizaciones-state'

/**
 * Load amortization state from storage
 */
export async function loadAmortizationState(): Promise<AmortizationState> {
    try {
        const state = await db.amortizationState.where('id').equals(STATE_ID).first()
        if (state) {
            return state as AmortizationState
        }
    } catch (error) {
        console.warn('Error loading amortization state:', error)
    }

    // Return initial state if none exists
    return createInitialState()
}

/**
 * Save amortization state to storage
 */
export async function saveAmortizationState(state: AmortizationState): Promise<void> {
    try {
        const stateToSave = {
            ...state,
            id: STATE_ID,
            lastUpdated: new Date().toISOString(),
        }
        await db.amortizationState.put(stateToSave)
    } catch (error) {
        console.error('Error saving amortization state:', error)
        throw error
    }
}

/**
 * Clear amortization state (reset to initial)
 */
export async function clearAmortizationState(): Promise<void> {
    try {
        await db.amortizationState.where('id').equals(STATE_ID).delete()
    } catch (error) {
        console.error('Error clearing amortization state:', error)
        throw error
    }
}
