/**
 * Cierre: AxI + Valuación - Storage
 *
 * Persistence layer for the Cierre Valuación module using Dexie/IndexedDB.
 */

import { db } from './db';
import type { CierreValuacionState } from '../core/cierre-valuacion/types';
import { createInitialState } from '../core/cierre-valuacion/types';

const STATE_ID = 'cierre-valuacion-state';

/**
 * Load cierre valuación state from storage
 */
export async function loadCierreValuacionState(): Promise<CierreValuacionState> {
    try {
        const state = await db.cierreValuacionState.where('id').equals(STATE_ID).first();
        if (state) {
            return state as CierreValuacionState;
        }
    } catch (error) {
        console.warn('Error loading cierre valuación state:', error);
    }

    // Return initial state if none exists
    return createInitialState();
}

/**
 * Save cierre valuación state to storage
 */
export async function saveCierreValuacionState(state: CierreValuacionState): Promise<void> {
    try {
        const stateToSave = {
            ...state,
            id: STATE_ID,
            lastUpdated: new Date().toISOString(),
        };
        await db.cierreValuacionState.put(stateToSave);
    } catch (error) {
        console.error('Error saving cierre valuación state:', error);
        throw error;
    }
}

/**
 * Clear cierre valuación state (reset to initial)
 */
export async function clearCierreValuacionState(): Promise<void> {
    try {
        await db.cierreValuacionState.where('id').equals(STATE_ID).delete();
    } catch (error) {
        console.error('Error clearing cierre valuación state:', error);
        throw error;
    }
}
