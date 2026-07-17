/**
 * Dominio contable — Fase 2A
 *
 * Entidades de contexto temporal y societario del núcleo contable:
 * Company, AccountingExercise, AccountingPeriod, AuditEvent, SystemMeta.
 *
 * Los asientos (JournalEntry) viven en src/core/models.ts para no duplicar
 * el modelo; esta capa agrega el contexto que los gobierna.
 */

import type { EntryStatus, JournalEntry } from '../../core/models'

// ─────────────────────────────────────────────────────────────
// Empresa
// ─────────────────────────────────────────────────────────────

export interface Company {
    id: string
    legalName: string
    tradeName?: string
    taxId?: string
    currency: string              // moneda funcional (ej: 'ARS')
    jurisdiction?: string         // ej: 'AR-Corrientes'
    accountingFramework?: string  // ej: 'RT 54 TO RT 59'
    createdAt: string
    updatedAt: string
    active: boolean
}

// ─────────────────────────────────────────────────────────────
// Ejercicio y período
// ─────────────────────────────────────────────────────────────

export type ExerciseStatus = 'OPEN' | 'CLOSING' | 'CLOSED'

export interface AccountingExercise {
    id: string
    companyId: string
    name: string                  // ej: 'Ejercicio 2026'
    startDate: string             // YYYY-MM-DD (inclusive)
    endDate: string               // YYYY-MM-DD (inclusive)
    status: ExerciseStatus
    previousExerciseId?: string
    createdAt: string
    closedAt?: string
    closedBy?: string
}

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED'

export interface AccountingPeriod {
    id: string
    exerciseId: string
    companyId: string
    name: string                  // ej: 'Ejercicio 2026' o 'Marzo 2026'
    startDate: string             // YYYY-MM-DD (inclusive)
    endDate: string               // YYYY-MM-DD (inclusive)
    status: PeriodStatus
    closedAt?: string
    closedBy?: string
    reopenedAt?: string
    reopenedBy?: string
    reopenReason?: string
}

// ─────────────────────────────────────────────────────────────
// Audit log (append-only)
// ─────────────────────────────────────────────────────────────

export type AuditEventType =
    | 'DRAFT_CREATED'
    | 'DRAFT_UPDATED'
    | 'DRAFT_DELETED'
    | 'ENTRY_POSTED'
    | 'POSTING_REJECTED'
    | 'ENTRY_REVERSED'
    | 'ENTRY_REPLACED'      // regeneración auditada desde módulo de origen
    | 'ENTRY_VOIDED'        // baja auditada por eliminación de operación de origen
    | 'PERIOD_CLOSED'
    | 'PERIOD_REOPENED'
    | 'EXERCISE_CREATED'
    | 'EXERCISE_CLOSED'
    | 'EXERCISE_REOPENED'
    | 'MIGRATION_EXECUTED'
    | 'BACKUP_CREATED'
    | 'RESTORE_EXECUTED'
    | 'JOURNAL_RESET'

export interface AuditEvent {
    id: string
    eventType: AuditEventType
    entityType: 'journalEntry' | 'period' | 'exercise' | 'company' | 'database'
    entityId: string
    companyId?: string
    exerciseId?: string
    actorId: string               // identidad local explícita ('local-user', 'legacy-migration')
    timestamp: string             // ISO datetime
    before?: unknown
    after?: unknown
    reason?: string
    metadata?: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────
// Metadata de sistema (singleton)
// ─────────────────────────────────────────────────────────────

export interface SystemMeta {
    id: string                    // siempre 'system'
    appVersion: string
    schemaVersion: number
    installationId: string
    createdAt: string
    lastMigrationAt?: string
    lastMigrationId?: string
    lastBackupAt?: string
    currentCompanyId?: string
    currentExerciseId?: string
    migrationExceptions?: MigrationException[]
}

export interface MigrationException {
    entryId: string
    date: string
    reason: string
    detectedAt: string
}

// ─────────────────────────────────────────────────────────────
// Contratos del servicio de contabilización
// ─────────────────────────────────────────────────────────────

/** Identidad local por defecto. No simula autenticación real. */
export const LOCAL_ACTOR = 'local-user'
export const MIGRATION_ACTOR = 'legacy-migration'

export interface EntryDraftInput {
    date: string
    memo: string
    lines: Array<{
        accountId: string
        debit: number
        credit: number
        description?: string
    }>
    sourceModule?: string
    sourceType?: string
    sourceId?: string
    metadata?: Record<string, unknown>
    actorId?: string
}

export interface OperationPostingInput extends EntryDraftInput {
    sourceModule: string
    sourceType: string
    sourceId: string
    /** Tipo de hecho contable dentro de la operación (para la clave de idempotencia) */
    accountingEventType?: string
    /** Clave explícita; si falta se construye con buildIdempotencyKey */
    idempotencyKey?: string
    /** Fecha de creación original (para preservar asientos migrados/legacy) */
    createdAt?: string
}

export interface PostingResult {
    entry: JournalEntry
    /** true si la operación ya estaba contabilizada y se devolvió el asiento existente */
    idempotentHit: boolean
}

/** Error tipado de validación de contabilización */
export class PostingError extends Error {
    readonly errors: string[]
    constructor(errors: string[]) {
        super(errors.join('\n'))
        this.name = 'PostingError'
        this.errors = errors
    }
}

export type { EntryStatus, JournalEntry }
