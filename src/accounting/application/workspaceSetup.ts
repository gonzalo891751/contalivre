/**
 * Preparación de una empresa de práctica la primera vez que se abre.
 *
 * La base de una empresa nueva está vacía: acá se carga el plan de cuentas que
 * corresponde a su tipo (comercial o sin fines de lucro), se identifica la
 * entidad (denominación, CUIT ficticio y tipo de ente) y, si se pidió, se
 * carga el caso de práctica con dos ejercicios.
 */

import { db } from '../../storage/db'
import { loadSeedDataIfNeeded } from '../../storage/seed'
import { getActiveWorkspace, updateWorkspace, type Workspace } from '../../storage/workspaces'
import { getDefaultCompany } from './contextService'
import { loadPracticeCase, PRACTICE_SECOND_YEAR, PRACTICE_TAX_ID } from '../fixtures/practiceCases'

export async function seedActiveWorkspaceChart(): Promise<void> {
    const ws = getActiveWorkspace()
    await loadSeedDataIfNeeded(ws.entityKind === 'SIN_FINES_DE_LUCRO' ? 'ESFL' : 'COMERCIAL')
}

let finalizing: Promise<void> | null = null

/** Idempotente y a prueba de doble montaje (StrictMode): una sola ejecución */
export function finalizeActiveWorkspace(): Promise<void> {
    if (!finalizing) finalizing = doFinalize(getActiveWorkspace()).finally(() => { finalizing = null })
    return finalizing
}

async function doFinalize(ws: Workspace): Promise<void> {
    if (ws.initializedAt) return
    const company = await getDefaultCompany()
    await db.companies.put({
        ...company,
        legalName: ws.name,
        taxId: company.taxId || PRACTICE_TAX_ID,
        entityKind: ws.entityKind,
        updatedAt: new Date().toISOString(),
    })
    if (ws.start === 'EJEMPLO' && await db.entries.count() === 0) {
        await loadPracticeCase(ws.entityKind === 'SIN_FINES_DE_LUCRO' ? 'SIN_FINES_DE_LUCRO' : 'COMERCIAL')
        try {
            localStorage.setItem('contalivre_period_year', JSON.stringify({
                year: PRACTICE_SECOND_YEAR, start: `${PRACTICE_SECOND_YEAR}-01-01`, end: `${PRACTICE_SECOND_YEAR}-12-31`,
            }))
        } catch { /* sin almacenamiento local: queda el año por defecto */ }
    }
    updateWorkspace(ws.id, { initializedAt: new Date().toISOString() })
}

/** Cambia el tipo de ente de la empresa ABIERTA (registro + identidad del ente) */
export async function setActiveEntityKind(entityKind: Workspace['entityKind']): Promise<void> {
    const ws = getActiveWorkspace()
    updateWorkspace(ws.id, { entityKind })
    const company = await getDefaultCompany()
    await db.companies.put({ ...company, entityKind, updatedAt: new Date().toISOString() })
}
