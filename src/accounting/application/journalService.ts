/**
 * Servicio único de contabilización — Fase 2A
 *
 * ÚNICA puerta de entrada para crear, modificar, contabilizar, revertir o
 * eliminar asientos. Ningún módulo debe escribir en la tabla `entries`
 * directamente (regla ESLint + test arquitectónico).
 *
 * Ciclo de vida:
 *   DRAFT (editable, no impacta libros)
 *     → POSTED (inmutable, numerado, en Diario/Mayor/Balance)
 *       → REVERSED (se conserva; un asiento inverso enlazado lo neutraliza)
 *
 * Política de dos niveles, documentada en el informe de fase:
 * - Asientos manuales: ciclo estricto. Un POSTED manual no se edita ni se
 *   elimina; solo se revierte.
 * - Asientos generados por módulos operativos (sourceModule presente): la
 *   edición o baja de la operación de origen regenera o retira su asiento
 *   mediante comandos auditados (replaceOperationEntry / voidOperationEntry),
 *   con validación completa y bloqueo en períodos cerrados. Es una decisión
 *   transitoria para no romper los flujos operativos existentes; la
 *   unificación total por reversión queda como deuda para Fase 2B.
 */

import { db, generateId } from '../../storage/db'
import type { EntryLine, JournalEntry } from '../../core/models'
import type {
    EntryDraftInput,
    OperationPostingInput,
    PostingResult,
} from '../domain/types'
import { LOCAL_ACTOR, PostingError } from '../domain/types'
import { roundMoney } from '../domain/money'
import { buildIdempotencyKey } from '../domain/idempotency'
import { validateDraftStructure, validateForPosting } from '../validation/validatePosting'
import {
    deleteEntryRecord,
    clearAllEntryRecords,
    findEntryByIdempotencyKey,
    getEntryRecord,
    getMaxEntryNumber,
    insertEntryRecord,
    putEntryRecord,
    updateEntryRecord,
} from '../repositories/journalRepository'
import { appendAuditEvent } from '../audit/auditLog'
import {
    DEFAULT_COMPANY_ID,
    ensureExerciseForDate,
    getPeriodForDate,
} from './contextService'
import { SCHEMA_VERSION } from '../migration/migrateV17'
import { inWriteTx } from './txUtils'

/**
 * Tablas que un módulo operativo debe incluir en su transacción Dexie cuando
 * envuelve llamadas a este servicio (operación + asiento atómicos).
 */
export const JOURNAL_TX_TABLES = [
    db.entries,
    db.accounts,
    db.exercises,
    db.periods,
    db.companies,
    db.auditLog,
    db.systemMeta,
]

const POSTING_TABLES = JOURNAL_TX_TABLES

function nowISO(): string {
    return new Date().toISOString()
}

/** Normaliza líneas: redondeo central y limpieza de campos numéricos */
function normalizeLines(lines: EntryDraftInput['lines']): EntryLine[] {
    return lines.map(l => ({
        ...l,
        debit: Number.isFinite(l.debit) ? roundMoney(l.debit) : l.debit,
        credit: Number.isFinite(l.credit) ? roundMoney(l.credit) : l.credit,
    }))
}

// ─────────────────────────────────────────────────────────────
// Borradores
// ─────────────────────────────────────────────────────────────

export async function createDraftEntry(input: EntryDraftInput): Promise<JournalEntry> {
    const actorId = input.actorId ?? LOCAL_ACTOR
    const draft: JournalEntry = {
        id: generateId(),
        date: input.date,
        memo: input.memo,
        lines: normalizeLines(input.lines),
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        metadata: input.metadata as Record<string, unknown>,
        status: 'DRAFT',
        companyId: DEFAULT_COMPANY_ID,
        createdAt: nowISO(),
        createdBy: actorId,
        schemaVersion: SCHEMA_VERSION,
    }

    const validation = validateDraftStructure(draft)
    if (!validation.ok) {
        throw new PostingError(validation.errors)
    }

    await inWriteTx([db.entries, db.auditLog], async () => {
        await insertEntryRecord(draft)
        await appendAuditEvent({
            eventType: 'DRAFT_CREATED',
            entityType: 'journalEntry',
            entityId: draft.id,
            companyId: draft.companyId,
            actorId,
            after: draft,
        })
    })
    return draft
}

export async function updateDraftEntry(
    id: string,
    updates: Partial<Pick<JournalEntry, 'date' | 'memo' | 'lines' | 'metadata'>>,
    actorId = LOCAL_ACTOR
): Promise<JournalEntry> {
    const existing = await getEntryRecord(id)
    if (!existing) throw new Error(`El asiento ${id} no existe`)
    if (existing.status !== 'DRAFT') {
        throw new PostingError([
            `El asiento N° ${existing.entryNumber ?? id} está contabilizado y no puede editarse. Para corregirlo, revertilo y creá uno nuevo.`,
        ])
    }

    const updated: JournalEntry = {
        ...existing,
        ...updates,
        lines: updates.lines ? normalizeLines(updates.lines) : existing.lines,
        updatedAt: nowISO(),
        updatedBy: actorId,
    }
    const validation = validateDraftStructure(updated)
    if (!validation.ok) throw new PostingError(validation.errors)

    await inWriteTx([db.entries, db.auditLog], async () => {
        await putEntryRecord(updated)
        await appendAuditEvent({
            eventType: 'DRAFT_UPDATED',
            entityType: 'journalEntry',
            entityId: id,
            companyId: existing.companyId,
            actorId,
            before: existing,
            after: updated,
        })
    })
    return updated
}

export async function deleteDraftEntry(id: string, actorId = LOCAL_ACTOR): Promise<void> {
    const existing = await getEntryRecord(id)
    if (!existing) return
    if (existing.status !== 'DRAFT') {
        throw new PostingError([
            `El asiento N° ${existing.entryNumber ?? id} está contabilizado y no puede eliminarse. Para anularlo, usá "Revertir".`,
        ])
    }
    await inWriteTx([db.entries, db.auditLog], async () => {
        await deleteEntryRecord(id)
        await appendAuditEvent({
            eventType: 'DRAFT_DELETED',
            entityType: 'journalEntry',
            entityId: id,
            companyId: existing.companyId,
            actorId,
            before: existing,
        })
    })
}

// ─────────────────────────────────────────────────────────────
// Contabilización
// ─────────────────────────────────────────────────────────────

interface PostContext {
    exerciseId: string
    periodId: string
}

/** Resuelve y valida ejercicio/período/cuentas; lanza PostingError si falla */
async function validateAndResolveContext(entry: JournalEntry, actorId: string): Promise<PostContext> {
    // Fecha estructuralmente válida es prerrequisito para resolver contexto
    const structural = validateDraftStructure(entry)
    if (!structural.ok) {
        await auditRejection(entry, structural.errors, actorId)
        throw new PostingError(structural.errors)
    }

    const exercise = await ensureExerciseForDate(entry.date, { actorId })
    const period = await getPeriodForDate(entry.date, exercise.id)
    if (!period) {
        const errors = [`No existe un período contable para la fecha ${entry.date} en el ejercicio "${exercise.name}"`]
        await auditRejection(entry, errors, actorId)
        throw new PostingError(errors)
    }

    const accounts = await db.accounts.toArray()
    const accountsById = new Map(accounts.map(a => [a.id, a]))

    const errors = validateForPosting(entry, { accountsById, exercise, period })
    if (errors.length > 0) {
        await auditRejection(entry, errors, actorId)
        throw new PostingError(errors)
    }

    return { exerciseId: exercise.id, periodId: period.id }
}

async function auditRejection(entry: JournalEntry, errors: string[], actorId: string): Promise<void> {
    try {
        await appendAuditEvent({
            eventType: 'POSTING_REJECTED',
            entityType: 'journalEntry',
            entityId: entry.id ?? 'sin-id',
            companyId: entry.companyId ?? DEFAULT_COMPANY_ID,
            actorId,
            reason: errors.join(' | '),
            metadata: { date: entry.date, memo: entry.memo },
        })
    } catch {
        // el audit de rechazo nunca debe enmascarar el error original
    }
}

/**
 * Contabiliza un borrador existente: valida todo, asigna número secuencial,
 * marca POSTED y lo vuelve inmutable. Operación atómica.
 */
export async function postDraft(id: string, actorId = LOCAL_ACTOR): Promise<JournalEntry> {
    const existing = await getEntryRecord(id)
    if (!existing) throw new Error(`El asiento ${id} no existe`)
    if (existing.status === 'POSTED' || existing.status === 'REVERSED') {
        return existing // idempotente: ya contabilizado
    }

    const ctx = await validateAndResolveContext(existing, actorId)

    let posted: JournalEntry | undefined
    await inWriteTx(POSTING_TABLES, async () => {
        const companyId = existing.companyId ?? DEFAULT_COMPANY_ID
        const nextNumber = (await getMaxEntryNumber(companyId, ctx.exerciseId)) + 1
        posted = {
            ...existing,
            companyId,
            exerciseId: ctx.exerciseId,
            periodId: ctx.periodId,
            status: 'POSTED',
            entryNumber: nextNumber,
            postedAt: nowISO(),
            postedBy: actorId,
            schemaVersion: SCHEMA_VERSION,
        }
        await putEntryRecord(posted)
        await appendAuditEvent({
            eventType: 'ENTRY_POSTED',
            entityType: 'journalEntry',
            entityId: id,
            companyId,
            exerciseId: ctx.exerciseId,
            actorId,
            after: posted,
        })
    })
    return posted!
}

/**
 * Crea y contabiliza un asiento en un solo paso (flujo de módulos operativos
 * y compatibilidad con el antiguo createEntry). Validación completa.
 */
export async function postNewEntry(input: EntryDraftInput & {
    id?: string
    idempotencyKey?: string
    createdAt?: string
}): Promise<JournalEntry> {
    const { entry } = await postNewEntryInternal(input)
    return entry
}

async function postNewEntryInternal(input: EntryDraftInput & {
    id?: string
    idempotencyKey?: string
    createdAt?: string
}): Promise<{ entry: JournalEntry; duplicate: boolean }> {
    const actorId = input.actorId ?? LOCAL_ACTOR
    const candidate: JournalEntry = {
        id: input.id ?? generateId(),
        date: input.date,
        memo: input.memo,
        lines: normalizeLines(input.lines),
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        metadata: input.metadata as Record<string, unknown>,
        idempotencyKey: input.idempotencyKey,
        status: 'POSTED',
        companyId: DEFAULT_COMPANY_ID,
        createdAt: input.createdAt ?? nowISO(),
        createdBy: actorId,
        schemaVersion: SCHEMA_VERSION,
    }

    const ctx = await validateAndResolveContext(candidate, actorId)

    let posted: JournalEntry | undefined
    let duplicate = false
    await inWriteTx(POSTING_TABLES, async () => {
        // Restricción lógica de unicidad de la clave de idempotencia
        if (candidate.idempotencyKey) {
            const dup = await findEntryByIdempotencyKey(candidate.idempotencyKey)
            if (dup) {
                posted = dup
                duplicate = true
                return
            }
        }
        const nextNumber = (await getMaxEntryNumber(DEFAULT_COMPANY_ID, ctx.exerciseId)) + 1
        posted = {
            ...candidate,
            exerciseId: ctx.exerciseId,
            periodId: ctx.periodId,
            entryNumber: nextNumber,
            postedAt: nowISO(),
            postedBy: actorId,
        }
        await insertEntryRecord(posted)
        await appendAuditEvent({
            eventType: 'ENTRY_POSTED',
            entityType: 'journalEntry',
            entityId: posted.id,
            companyId: DEFAULT_COMPANY_ID,
            exerciseId: ctx.exerciseId,
            actorId,
            after: posted,
        })
    })
    return { entry: posted!, duplicate }
}

/**
 * Contabilización idempotente de una operación de módulo.
 * Repetir la misma operación con la misma clave NO duplica el asiento:
 * devuelve el existente con idempotentHit = true.
 */
export async function postOperation(input: OperationPostingInput): Promise<PostingResult> {
    const idempotencyKey = input.idempotencyKey ?? buildIdempotencyKey({
        companyId: DEFAULT_COMPANY_ID,
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        accountingEventType: input.accountingEventType,
    })

    const existing = await findEntryByIdempotencyKey(idempotencyKey)
    if (existing) {
        await appendAuditEvent({
            eventType: 'POSTING_REJECTED',
            entityType: 'journalEntry',
            entityId: existing.id,
            companyId: existing.companyId ?? DEFAULT_COMPANY_ID,
            exerciseId: existing.exerciseId,
            actorId: input.actorId ?? LOCAL_ACTOR,
            reason: 'Operación repetida: la clave de idempotencia ya tiene un asiento contabilizado',
            metadata: { idempotencyKey, intent: 'duplicate-attempt' },
        })
        return { entry: existing, idempotentHit: true }
    }

    const { entry, duplicate } = await postNewEntryInternal({ ...input, idempotencyKey })
    return { entry, idempotentHit: duplicate }
}

// ─────────────────────────────────────────────────────────────
// Reversión
// ─────────────────────────────────────────────────────────────

export interface ReverseEntryOptions {
    date?: string          // por defecto, la fecha del original
    reason: string
    actorId?: string
}

/**
 * Revierte un asiento contabilizado: crea un asiento nuevo con Debe y Haber
 * invertidos, enlaza ambos y marca el original como REVERSED. El original
 * permanece consultable. No puede revertirse dos veces.
 */
export async function reverseEntry(id: string, options: ReverseEntryOptions): Promise<JournalEntry> {
    const actorId = options.actorId ?? LOCAL_ACTOR
    const original = await getEntryRecord(id)
    if (!original) throw new Error(`El asiento ${id} no existe`)
    if (original.status === 'DRAFT') {
        throw new PostingError(['Un borrador no se revierte: puede editarse o eliminarse directamente.'])
    }
    if (original.status === 'REVERSED' || original.reversalEntryId) {
        const existingReversal = original.reversalEntryId
            ? await getEntryRecord(original.reversalEntryId)
            : undefined
        if (existingReversal) return existingReversal
        throw new PostingError([`El asiento N° ${original.entryNumber ?? id} ya fue revertido.`])
    }
    if (!options.reason || options.reason.trim() === '') {
        throw new PostingError(['La reversión requiere un motivo.'])
    }

    const reversalDate = options.date ?? original.date
    const reversal: JournalEntry = {
        id: generateId(),
        date: reversalDate,
        memo: `Reversión de asiento N° ${original.entryNumber ?? original.id}: ${original.memo}`,
        lines: original.lines.map(l => ({
            ...l,
            debit: l.credit,
            credit: l.debit,
        })),
        sourceModule: original.sourceModule,
        sourceType: 'reversal',
        sourceId: original.id,
        metadata: { reversalOf: original.id },
        status: 'POSTED',
        companyId: original.companyId ?? DEFAULT_COMPANY_ID,
        reversedEntryId: original.id,
        reversalReason: options.reason,
        createdAt: nowISO(),
        createdBy: actorId,
        schemaVersion: SCHEMA_VERSION,
    }

    const ctx = await validateAndResolveContext(reversal, actorId)

    let saved: JournalEntry | undefined
    await inWriteTx(POSTING_TABLES, async () => {
        // Revalidar el estado dentro de la transacción (doble reversión concurrente)
        const fresh = await getEntryRecord(id)
        if (!fresh || fresh.status === 'REVERSED' || fresh.reversalEntryId) {
            throw new PostingError([`El asiento N° ${original.entryNumber ?? id} ya fue revertido.`])
        }
        const companyId = reversal.companyId ?? DEFAULT_COMPANY_ID
        const nextNumber = (await getMaxEntryNumber(companyId, ctx.exerciseId)) + 1
        saved = {
            ...reversal,
            exerciseId: ctx.exerciseId,
            periodId: ctx.periodId,
            entryNumber: nextNumber,
            postedAt: nowISO(),
            postedBy: actorId,
        }
        await insertEntryRecord(saved)
        await updateEntryRecord(id, {
            status: 'REVERSED',
            reversedAt: nowISO(),
            reversedBy: actorId,
            reversalEntryId: saved.id,
            reversalReason: options.reason,
        })
        await appendAuditEvent({
            eventType: 'ENTRY_REVERSED',
            entityType: 'journalEntry',
            entityId: id,
            companyId,
            exerciseId: ctx.exerciseId,
            actorId,
            reason: options.reason,
            after: saved,
        })
    })
    return saved!
}

// ─────────────────────────────────────────────────────────────
// Comandos auditados para módulos operativos
// ─────────────────────────────────────────────────────────────

export interface OperationMutationOptions {
    actorId?: string
    reason?: string
}

/** ¿El período del asiento admite modificaciones? */
async function assertPeriodOpenForEntry(entry: JournalEntry): Promise<void> {
    if (!entry.periodId) return // legacy sin período: se permite, queda auditado
    const period = await db.periods.get(entry.periodId)
    if (period && period.status !== 'OPEN') {
        throw new PostingError([
            `El asiento N° ${entry.entryNumber ?? entry.id} pertenece al período "${period.name}", que está cerrado, y no puede modificarse.`,
        ])
    }
}

/**
 * Regeneración auditada del asiento de una operación de módulo
 * (ej: el usuario editó un movimiento y el módulo reconstruye las líneas).
 * Validación completa + audit ENTRY_REPLACED con before/after.
 */
export async function replaceOperationEntry(
    entryId: string,
    input: Partial<Pick<JournalEntry, 'date' | 'memo' | 'lines' | 'metadata' | 'sourceId' | 'sourceType'>>,
    options: OperationMutationOptions = {}
): Promise<JournalEntry> {
    const actorId = options.actorId ?? LOCAL_ACTOR
    const existing = await getEntryRecord(entryId)
    if (!existing) throw new Error(`El asiento ${entryId} no existe`)
    if (!existing.sourceModule) {
        throw new PostingError([
            'replaceOperationEntry solo aplica a asientos generados por módulos. Los asientos manuales contabilizados se corrigen por reversión.',
        ])
    }
    await assertPeriodOpenForEntry(existing)

    const updated: JournalEntry = {
        ...existing,
        ...input,
        lines: input.lines ? normalizeLines(input.lines) : existing.lines,
        updatedAt: nowISO(),
        updatedBy: actorId,
    }

    const ctx = await validateAndResolveContext(updated, actorId)

    let saved: JournalEntry | undefined
    await inWriteTx(POSTING_TABLES, async () => {
        saved = { ...updated, exerciseId: ctx.exerciseId, periodId: ctx.periodId }
        await putEntryRecord(saved)
        await appendAuditEvent({
            eventType: 'ENTRY_REPLACED',
            entityType: 'journalEntry',
            entityId: entryId,
            companyId: saved.companyId ?? DEFAULT_COMPANY_ID,
            exerciseId: ctx.exerciseId,
            actorId,
            reason: options.reason ?? 'Regeneración desde la operación de origen',
            before: existing,
            after: saved,
        })
    })
    return saved!
}

/**
 * Actualización auditada de los campos de trazabilidad/vínculo de un asiento
 * (sourceModule/sourceId/sourceType/metadata). No modifica fecha, líneas ni
 * importes: es el comando que usan los módulos para vincular o desvincular
 * asientos existentes de sus operaciones.
 */
export async function updateEntrySourceLink(
    entryId: string,
    link: Partial<Pick<JournalEntry, 'sourceModule' | 'sourceId' | 'sourceType' | 'metadata'>>,
    options: OperationMutationOptions = {}
): Promise<JournalEntry> {
    const actorId = options.actorId ?? LOCAL_ACTOR
    const existing = await getEntryRecord(entryId)
    if (!existing) throw new Error(`El asiento ${entryId} no existe`)

    const updated: JournalEntry = {
        ...existing,
        ...link,
        updatedAt: nowISO(),
        updatedBy: actorId,
    }

    await inWriteTx([db.entries, db.auditLog], async () => {
        await putEntryRecord(updated)
        await appendAuditEvent({
            eventType: 'ENTRY_REPLACED',
            entityType: 'journalEntry',
            entityId: entryId,
            companyId: existing.companyId ?? DEFAULT_COMPANY_ID,
            exerciseId: existing.exerciseId,
            actorId,
            reason: options.reason ?? 'Actualización de vínculo con operación de origen',
            before: { sourceModule: existing.sourceModule, sourceId: existing.sourceId, sourceType: existing.sourceType },
            after: { sourceModule: updated.sourceModule, sourceId: updated.sourceId, sourceType: updated.sourceType },
        })
    })
    return updated
}

/**
 * Baja auditada del asiento de una operación de módulo (cascada al eliminar
 * la operación de origen). Bloqueada en períodos cerrados y para asientos
 * manuales contabilizados.
 */
export async function voidOperationEntry(
    entryId: string,
    options: OperationMutationOptions = {}
): Promise<void> {
    const actorId = options.actorId ?? LOCAL_ACTOR
    const existing = await getEntryRecord(entryId)
    if (!existing) return
    if (!existing.sourceModule && existing.status !== 'DRAFT') {
        throw new PostingError([
            `El asiento N° ${existing.entryNumber ?? entryId} es manual y está contabilizado: no puede eliminarse. Usá "Revertir".`,
        ])
    }
    await assertPeriodOpenForEntry(existing)

    await inWriteTx([db.entries, db.periods, db.auditLog], async () => {
        await deleteEntryRecord(entryId)
        await appendAuditEvent({
            eventType: 'ENTRY_VOIDED',
            entityType: 'journalEntry',
            entityId: entryId,
            companyId: existing.companyId ?? DEFAULT_COMPANY_ID,
            exerciseId: existing.exerciseId,
            actorId,
            reason: options.reason ?? 'Baja de la operación de origen',
            before: existing,
        })
    })
}

/** Baja auditada en lote (reemplaza a db.entries.bulkDelete en módulos) */
export async function voidOperationEntries(
    entryIds: string[],
    options: OperationMutationOptions = {}
): Promise<void> {
    for (const id of entryIds) {
        await voidOperationEntry(id, options)
    }
}

/**
 * Reinicio total del Diario (función existente "Reiniciar ejercicio" del
 * modo educativo). Destructivo, requiere confirmación en UI; queda auditado.
 */
export async function resetJournal(actorId = LOCAL_ACTOR): Promise<{ deletedEntries: number }> {
    const count = await db.entries.count()
    await inWriteTx([db.entries, db.auditLog], async () => {
        await clearAllEntryRecords()
        await appendAuditEvent({
            eventType: 'JOURNAL_RESET',
            entityType: 'database',
            entityId: 'entries',
            companyId: DEFAULT_COMPANY_ID,
            actorId,
            metadata: { deletedEntries: count },
        })
    })
    return { deletedEntries: count }
}
