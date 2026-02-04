/**
 * useCompanyProfile Hook
 * Reactive hook for company profile data with Dexie live query
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useState } from 'react'
import { db } from '../storage/db'
import { upsertCompanyProfile } from '../storage/companyProfile'
import type { CompanyProfile } from '../core/companyProfile/types'
import { isProfileConfigured } from '../core/companyProfile/types'

interface UseCompanyProfileResult {
    /** The company profile data (null if not loaded or not exists) */
    profile: CompanyProfile | null
    /** Whether the hook is still loading */
    isLoading: boolean
    /** Whether the profile has minimum required data */
    isConfigured: boolean
    /** Error if any occurred */
    error: Error | null
    /** Save/update the profile */
    save: (data: Partial<CompanyProfile>) => Promise<void>
    /** Whether a save operation is in progress */
    isSaving: boolean
}

/**
 * Hook to access and manage company profile data
 * Uses Dexie's live query for reactive updates
 */
export function useCompanyProfile(): UseCompanyProfileResult {
    const [error, setError] = useState<Error | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Live query for reactive updates
    const profile = useLiveQuery(
        () => db.companyProfile.get('default'),
        [],
        undefined // Default to undefined while loading
    )

    const isLoading = profile === undefined

    const save = useCallback(async (data: Partial<CompanyProfile>) => {
        setIsSaving(true)
        setError(null)
        try {
            await upsertCompanyProfile(data)
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Error al guardar')
            setError(error)
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [])

    return {
        profile: profile ?? null,
        isLoading,
        isConfigured: isProfileConfigured(profile),
        error,
        save,
        isSaving,
    }
}

export default useCompanyProfile
