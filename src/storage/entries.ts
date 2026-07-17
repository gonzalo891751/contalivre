/**
 * storage/entries.ts — capa de compatibilidad (Fase 2A)
 *
 * Este archivo YA NO escribe en la tabla de asientos: delega todo en el
 * servicio único de contabilización (src/accounting). Se conserva la firma
 * de las funciones históricas para no romper a los consumidores mientras
 * migran a la API nueva.
 *
 * - createEntry: valida TODO (cuentas existentes/imputables/activas, importes
 *   finitos, partida doble, ejercicio/período abiertos) y contabiliza.
 * - updateEntry: solo borradores (manuales) o regeneración auditada de
 *   asientos de módulos operativos.
 * - deleteEntry: solo borradores o baja auditada en cascada de operaciones.
 */

import { db } from './db'
import type { JournalEntry, EntryLine } from '../core/models'
import {
    deleteDraftEntry,
    postNewEntry,
    postOperation,
    replaceOperationEntry,
    resetJournal,
    updateDraftEntry,
    voidOperationEntry,
} from '../accounting/application/journalService'
import { contentDiscriminator } from '../accounting/domain/idempotency'

/**
 * Obtiene todos los asientos ordenados por fecha.
 * Preferir getEntriesForContext(ctx) de src/accounting para reportes.
 */
export async function getAllEntries(): Promise<JournalEntry[]> {
    return db.entries.orderBy('date').reverse().toArray()
}

/**
 * Obtiene un asiento por ID
 */
export async function getEntryById(id: string): Promise<JournalEntry | undefined> {
    return db.entries.get(id)
}

/**
 * Crea y contabiliza un asiento a través del servicio único.
 *
 * Fase 2C (idempotencia explícita, ACC-011): si el asiento tiene origen
 * completo (sourceModule + sourceType + sourceId) y no trae clave propia,
 * se enruta por postOperation con una clave derivada
 * `companyId|module|type|sourceId|accountingEventType`, donde
 * accountingEventType distingue cada hecho contable de la operación (el
 * accountingEventType explícito de metadata, o el hash del contenido de las
 * líneas). Reintentar el mismo asiento NO duplica; los asientos distintos de
 * la misma operación conservan claves distintas.
 * Lanza PostingError con mensajes concretos si la validación falla.
 */
export async function createEntry(
    entry: Omit<JournalEntry, 'id'>
): Promise<JournalEntry> {
    const hasSource = !!(entry.sourceModule && entry.sourceType && entry.sourceId)

    if (hasSource && !entry.idempotencyKey) {
        const accountingEventType =
            (entry.metadata?.accountingEventType as string | undefined) ?? contentDiscriminator(entry.lines)
        const { entry: posted } = await postOperation({
            date: entry.date,
            memo: entry.memo,
            lines: entry.lines,
            sourceModule: entry.sourceModule!,
            sourceType: entry.sourceType!,
            sourceId: entry.sourceId!,
            accountingEventType,
            metadata: entry.metadata,
            createdAt: entry.createdAt,
        })
        return posted
    }

    return postNewEntry({
        date: entry.date,
        memo: entry.memo,
        lines: entry.lines,
        sourceModule: entry.sourceModule,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        idempotencyKey: entry.idempotencyKey,
    })
}

/**
 * Actualiza un asiento existente.
 * - Borradores: edición libre (validación estructural).
 * - Asientos de módulos operativos: regeneración auditada (ENTRY_REPLACED).
 * - Asientos manuales contabilizados: rechazado; corresponde reversión.
 */
export async function updateEntry(
    id: string,
    updates: Partial<Omit<JournalEntry, 'id'>>
): Promise<JournalEntry> {
    const existing = await db.entries.get(id)
    if (!existing) {
        throw new Error('Asiento no encontrado')
    }
    if (existing.status === 'DRAFT') {
        return updateDraftEntry(id, updates)
    }
    return replaceOperationEntry(id, updates)
}

/**
 * Elimina un asiento.
 * - Borradores: eliminación directa (auditada).
 * - Asientos de módulos: baja auditada en cascada (ENTRY_VOIDED).
 * - Asientos manuales contabilizados: rechazado; corresponde reversión.
 * Si el asiento fue generado por moneda extranjera (sourceModule='fx'),
 * se desvincula del movimiento origen para mantener consistencia bidireccional.
 */
export async function deleteEntry(id: string): Promise<void> {
    const entry = await db.entries.get(id)
    if (!entry) return

    if (entry.status === 'DRAFT') {
        await deleteDraftEntry(id)
    } else {
        await voidOperationEntry(id)
    }

    if (entry.sourceModule === 'fx' && entry.sourceId) {
        try {
            const movement = await db.fxMovements.get(entry.sourceId)
            if (movement) {
                const remaining = (movement.linkedJournalEntryIds || []).filter(eid => eid !== id)
                await db.fxMovements.update(movement.id, {
                    linkedJournalEntryIds: remaining,
                    journalStatus: remaining.length === 0 ? 'missing' : movement.journalStatus,
                    journalMissingReason: remaining.length === 0 ? 'entry_deleted' : undefined,
                    updatedAt: new Date().toISOString(),
                })
            }
        } catch {
            // Non-critical: if fx cleanup fails, the reconciliation tab will catch it
        }
    }
}

/**
 * Obtiene asientos por rango de fechas
 */
export async function getEntriesByDateRange(
    startDate: string,
    endDate: string
): Promise<JournalEntry[]> {
    return db.entries
        .where('date')
        .between(startDate, endDate, true, true)
        .reverse()
        .toArray()
}

/**
 * Cuenta el total de asientos
 */
export async function countEntries(): Promise<number> {
    return db.entries.count()
}

/**
 * Obtiene el último asiento creado
 */
export async function getLastEntry(): Promise<JournalEntry | undefined> {
    const entries = await db.entries.orderBy('date').reverse().limit(1).toArray()
    return entries[0]
}

/**
 * Crea una línea de asiento vacía
 */
export function createEmptyLine(): EntryLine {
    return {
        accountId: '',
        debit: 0,
        credit: 0,
        description: '',
    }
}

/**
 * Elimina TODOS los asientos (Reiniciar ejercicio). Auditado.
 */
export async function resetExercise(): Promise<{ deletedEntries: number }> {
    return resetJournal()
}

/**
 * Obtiene la fecha actual en formato ISO
 */
export function getTodayISO(): string {
    return getLocalDateISO()
}

/**
 * Obtiene la fecha local en formato ISO (YYYY-MM-DD)
 */
export function getLocalDateISO(d: Date = new Date()): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}
