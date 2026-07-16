/**
 * Journal Repository — Fase 2A
 *
 * ÚNICO archivo autorizado a escribir en la tabla `entries` de Dexie.
 * Ningún otro módulo debe invocar db.entries.add/put/update/delete/clear:
 * está prohibido por regla ESLint (no-restricted-syntax) y verificado por
 * el test arquitectónico tests/accounting/architecture.test.ts.
 *
 * Este repositorio NO valida reglas de negocio: eso es responsabilidad del
 * servicio de aplicación (journalService). Aquí solo hay persistencia cruda,
 * pensada para ser llamada exclusivamente desde src/accounting/application.
 */

import { db } from '../../storage/db'
import type { JournalEntry } from '../../core/models'

// La regla no-restricted-syntax está desactivada para este archivo en
// eslint.config.js: es el único punto de escritura autorizado.

export async function insertEntryRecord(entry: JournalEntry): Promise<void> {
    await db.entries.add(entry)
}

export async function putEntryRecord(entry: JournalEntry): Promise<void> {
    await db.entries.put(entry)
}

export async function updateEntryRecord(id: string, changes: Partial<JournalEntry>): Promise<void> {
    await db.entries.update(id, changes)
}

export async function deleteEntryRecord(id: string): Promise<void> {
    await db.entries.delete(id)
}

export async function clearAllEntryRecords(): Promise<void> {
    await db.entries.clear()
}

// ── Lecturas (libres para cualquier módulo, preferir estas helpers) ──

export async function getEntryRecord(id: string): Promise<JournalEntry | undefined> {
    return db.entries.get(id)
}

export async function findEntryByIdempotencyKey(key: string): Promise<JournalEntry | undefined> {
    return db.entries.where('idempotencyKey').equals(key).first()
}

/** Máximo entryNumber asignado en un ejercicio (para numeración secuencial) */
export async function getMaxEntryNumber(companyId: string, exerciseId: string): Promise<number> {
    const entries = await db.entries
        .where('[companyId+exerciseId]')
        .equals([companyId, exerciseId])
        .toArray()
    let max = 0
    for (const e of entries) {
        if (typeof e.entryNumber === 'number' && e.entryNumber > max) max = e.entryNumber
    }
    return max
}
