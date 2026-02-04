/**
 * Company Profile Storage API
 * CRUD operations for company profile in Dexie/IndexedDB
 */

import { db } from './db'
import type { CompanyProfile } from '../core/companyProfile/types'

const DEFAULT_ID = 'default'

/**
 * Get the company profile (singleton)
 */
export async function getCompanyProfile(): Promise<CompanyProfile | null> {
    const profile = await db.companyProfile.get(DEFAULT_ID)
    return profile ?? null
}

/**
 * Create or update the company profile
 */
export async function upsertCompanyProfile(profile: Partial<CompanyProfile>): Promise<void> {
    const now = new Date().toISOString()
    const existing = await db.companyProfile.get(DEFAULT_ID)

    if (existing) {
        // Update existing
        await db.companyProfile.update(DEFAULT_ID, {
            ...profile,
            id: DEFAULT_ID,
            updatedAt: now,
        })
    } else {
        // Create new
        await db.companyProfile.add({
            ...profile,
            id: DEFAULT_ID,
            legalName: profile.legalName ?? '',
            cuit: profile.cuit ?? '',
            createdAt: now,
            updatedAt: now,
        } as CompanyProfile)
    }
}

/**
 * Delete the company profile (reset)
 */
export async function deleteCompanyProfile(): Promise<void> {
    await db.companyProfile.delete(DEFAULT_ID)
}
