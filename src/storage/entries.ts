import { db, generateId } from './db'
import type { JournalEntry, EntryLine } from '../core/models'
import { validateEntry } from '../core/validation'

/**
 * Obtiene todos los asientos ordenados por fecha
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
 * Crea un nuevo asiento
 */
export async function createEntry(
    entry: Omit<JournalEntry, 'id'>
): Promise<JournalEntry> {
    const newEntry: JournalEntry = {
        ...entry,
        id: generateId(),
    }

    // Validar antes de guardar
    const validation = validateEntry(newEntry)
    if (!validation.ok) {
        throw new Error(validation.errors.join('\n'))
    }

    await db.entries.add(newEntry)
    return newEntry
}

/**
 * Actualiza un asiento existente
 */
export async function updateEntry(
    id: string,
    updates: Partial<Omit<JournalEntry, 'id'>>
): Promise<JournalEntry> {
    const existing = await db.entries.get(id)
    if (!existing) {
        throw new Error('Asiento no encontrado')
    }

    const updated: JournalEntry = { ...existing, ...updates }

    // Validar antes de guardar
    const validation = validateEntry(updated)
    if (!validation.ok) {
        throw new Error(validation.errors.join('\n'))
    }

    await db.entries.put(updated)
    return updated
}

/**
 * Elimina un asiento
 */
export async function deleteEntry(id: string): Promise<void> {
    await db.entries.delete(id)
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
 * Elimina TODOS los asientos (Reiniciar ejercicio)
 */
export async function resetExercise(): Promise<{ deletedEntries: number }> {
    const count = await db.entries.count()
    await db.entries.clear()
    return { deletedEntries: count }
}

/**
 * Obtiene la fecha actual en formato ISO
 */
export function getTodayISO(): string {
    return new Date().toISOString().split('T')[0]
}
