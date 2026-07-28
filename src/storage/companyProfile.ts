/**
 * Company Profile Storage API
 * CRUD operations for company profile in Dexie/IndexedDB
 */

import { db } from './db'
import { getDefaultCompany } from '../accounting/application/contextService'
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

    await syncCompanyIdentity(profile)
}

/**
 * Propaga la identidad de la ficha a la entidad contable (Fase 2I, DEF-A11).
 *
 * Convivían dos identidades: el registro `companies`, creado con la
 * denominación por defecto "Empresa ContaLivre", que es el que leen los
 * metadatos de los estados y de los snapshots publicados, y el perfil de
 * empresa, que sólo alimentaba la pantalla y el PDF. La ficha nunca tocaba el
 * primero, así que los estados salían a nombre de una empresa que no existe.
 *
 * La ficha pasa a ser la fuente única: al guardarla se actualiza la entidad
 * contable. No se toca ningún otro campo de `companies`.
 */
async function syncCompanyIdentity(profile: Partial<CompanyProfile>): Promise<void> {
    const legalName = profile.legalName?.trim()
    if (!legalName) return
    try {
        const company = await getDefaultCompany()
        if (company.legalName === legalName && (!profile.cuit || company.taxId === profile.cuit)) return
        await db.companies.update(company.id, {
            legalName,
            ...(profile.cuit ? { taxId: profile.cuit } : {}),
            updatedAt: new Date().toISOString(),
        })
    } catch {
        // La ficha se guarda igual: la identidad contable se reintenta al
        // próximo guardado y la reparación de arranque la vuelve a alinear.
    }
}

/**
 * Delete the company profile (reset)
 */
export async function deleteCompanyProfile(): Promise<void> {
    await db.companyProfile.delete(DEFAULT_ID)
}
