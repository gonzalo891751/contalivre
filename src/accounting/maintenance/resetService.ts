/**
 * resetService — Fase 2D (§6): restablecimiento total de ContaLivre.
 *
 * Deja la aplicación como recién instalada. TRANSACCIONAL: vacía todas las
 * tablas Dexie en una sola transacción (si algo falla, no queda a medias),
 * limpia el localStorage propio y regenera el estado de instalación limpia
 * (empresa por defecto + systemMeta con nueva identidad de instalación).
 *
 * IMPORTANTE: este servicio NO genera el respaldo. La UI DEBE exigir y
 * verificar un respaldo satisfactorio ANTES de invocarlo; si el respaldo
 * falla, no se debe continuar.
 */

import { db } from '../../storage/db'
import { getDefaultCompany, getSystemMeta } from '../application/contextService'
import { appendAuditEvent } from '../audit/auditLog'
import { LOCAL_ACTOR } from '../domain/types'

/** Prefijos de claves de localStorage propias de la app */
const LOCAL_STORAGE_PREFIXES = ['contalivre.', 'inventario.']

export interface ResetResult {
    clearedTables: number
    clearedRecords: number
    newInstallationId: string
}

function clearOwnLocalStorage(): void {
    try {
        const keys: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && LOCAL_STORAGE_PREFIXES.some(p => k.startsWith(p))) keys.push(k)
        }
        keys.forEach(k => localStorage.removeItem(k))
    } catch {
        // localStorage no disponible (p.ej. en tests): se ignora
    }
}

/**
 * Restablece la base a estado de instalación limpia y devuelve un resumen.
 * No borra selectivamente: vacía TODO. El respaldo es responsabilidad de la UI.
 */
export async function resetApplication(actorId = LOCAL_ACTOR): Promise<ResetResult> {
    let clearedRecords = 0

    await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
            clearedRecords += await table.count()
            await table.clear()
        }
    })

    clearOwnLocalStorage()

    // Estado de instalación limpia: se regeneran de forma perezosa.
    await getDefaultCompany()
    const meta = await getSystemMeta()

    // Primer evento auditado en la base ya limpia.
    await appendAuditEvent({
        eventType: 'APP_RESET',
        entityType: 'database',
        entityId: 'reset',
        actorId,
        reason: 'Restablecimiento total de ContaLivre a estado de instalación limpia',
        metadata: { clearedRecords, clearedTables: db.tables.length },
    })

    return { clearedTables: db.tables.length, clearedRecords, newInstallationId: meta.installationId }
}
