/**
 * Migración a schema v18 — Fase 2B: modelo monetario definitivo.
 *
 * Normaliza todos los importes del Diario al invariante de integridad de
 * centavos (ADR_MODELO_MONETARIO.md):
 * - todo importe pasa a ser la representación exacta de sus centavos;
 * - el valor original se conserva en metadata.legacyAmounts cuando cambia;
 * - importes no finitos o fuera de rango van al informe de excepciones
 *   (no se inventan valores);
 * - idempotente vía metadata.moneyModelV18 (independiente de schemaVersion,
 *   porque una base v16 que salta a v18 estampa schemaVersion en v17);
 * - transaccional: corre dentro del upgrade Dexie (rollback ante fallo).
 */

import type { Transaction } from 'dexie'
import type { EntryLine, JournalEntry } from '../../core/models'
import type { MigrationException, SystemMeta } from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { isCentExact, MAX_AMOUNT, roundMoney } from '../domain/money'
import { APP_VERSION } from './versions'
import { SYSTEM_META_ID } from './migrateV17'

export const MIGRATION_V18_ID = 'v18-modelo-monetario'
/** Esta migración lleva la base a la versión 18 (no a la vigente). */
const SCHEMA_VERSION_V18 = 18

interface LegacyAmountRecord {
    lineIndex: number
    field: 'debit' | 'credit'
    original: number
    normalized: number
}

function nowISO(): string {
    return new Date().toISOString()
}

function randomId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export interface MoneyNormalizationResult {
    lines: EntryLine[]
    changes: LegacyAmountRecord[]
    problems: string[]
}

/**
 * Normaliza las líneas de un asiento al invariante de centavos.
 * Pura y reutilizable en tests.
 */
export function normalizeEntryAmounts(lines: EntryLine[]): MoneyNormalizationResult {
    const changes: LegacyAmountRecord[] = []
    const problems: string[] = []

    const normalized = lines.map((lineItem, index) => {
        const next = { ...lineItem }
        for (const field of ['debit', 'credit'] as const) {
            const original = lineItem[field]
            if (typeof original !== 'number' || !Number.isFinite(original)) {
                problems.push(`línea ${index + 1} (${field}): importe no finito (${original})`)
                continue
            }
            if (Math.abs(original) > MAX_AMOUNT) {
                problems.push(`línea ${index + 1} (${field}): importe fuera de rango (${original})`)
                continue
            }
            if (!isCentExact(original)) {
                const canonical = roundMoney(Object.is(original, -0) ? 0 : original)
                const diff = Math.abs(canonical - original)
                // Residuo binario de representación es del orden de 1e-13;
                // cualquier diferencia mayor implica decimales reales por
                // encima de la escala contable y queda reportada (no es un
                // redondeo silencioso).
                if (diff > 1e-9) {
                    problems.push(`línea ${index + 1} (${field}): ${original} tiene más de 2 decimales; normalizado a ${canonical}`)
                }
                changes.push({ lineIndex: index, field, original, normalized: canonical })
                next[field] = canonical
            }
        }
        return next
    })

    return { lines: normalized, changes, problems }
}

/**
 * Migración principal v18.
 */
export async function migrateToV18(tx: Transaction): Promise<void> {
    const timestamp = nowISO()
    const entriesTable = tx.table('entries')
    const entries = (await entriesTable.toArray()) as JournalEntry[]

    const exceptions: MigrationException[] = []
    let normalizedEntries = 0
    let normalizedAmounts = 0

    for (const entry of entries) {
        const meta = (entry.metadata ?? {}) as Record<string, unknown>
        if (meta.moneyModelV18 === true) continue // idempotencia

        const result = normalizeEntryAmounts(entry.lines ?? [])
        const updates: Partial<JournalEntry> = {
            schemaVersion: SCHEMA_VERSION_V18,
            metadata: { ...meta, moneyModelV18: true },
        }

        if (result.changes.length > 0) {
            updates.lines = result.lines
            updates.metadata = {
                ...(updates.metadata as Record<string, unknown>),
                legacyAmounts: result.changes,
            }
            normalizedEntries++
            normalizedAmounts += result.changes.length
        }

        if (result.problems.length > 0) {
            updates.metadata = {
                ...(updates.metadata as Record<string, unknown>),
                needsReview: true,
            }
            exceptions.push({
                entryId: entry.id,
                date: String(entry.date ?? ''),
                reason: `Modelo monetario v18: ${result.problems.join(' | ')}`,
                detectedAt: timestamp,
            })
        }

        await entriesTable.update(entry.id, updates)
    }

    // SystemMeta
    const metaTable = tx.table('systemMeta')
    const existing = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    if (existing) {
        await metaTable.update(SYSTEM_META_ID, {
            appVersion: APP_VERSION,
            schemaVersion: SCHEMA_VERSION_V18,
            lastMigrationAt: timestamp,
            lastMigrationId: MIGRATION_V18_ID,
            migrationExceptions: [...(existing.migrationExceptions ?? []), ...exceptions],
        })
    }

    await tx.table('auditLog').add({
        id: randomId('audit'),
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_V18_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: {
            scannedEntries: entries.length,
            normalizedEntries,
            normalizedAmounts,
            exceptions: exceptions.length,
        },
    })
}
