/**
 * Migración a schema v17 — Fase 2A
 *
 * Ejecutada por Dexie dentro del upgrade transaccional de la versión 17.
 * Idempotente: cada paso verifica si el registro ya fue migrado antes de
 * modificarlo, por lo que puede re-ejecutarse sin duplicar datos.
 *
 * Pasos:
 * 1. Empresa por defecto (a partir de companyProfile si existe).
 * 2. Ejercicios y períodos anuales derivados de las fechas de los asientos.
 * 3. Asientos legacy: companyId/exerciseId/periodId/status POSTED/entryNumber,
 *    actor 'legacy-migration', metadata.migratedFromLegacy. No se modifica su
 *    contenido económico. Fechas inválidas van al reporte de excepciones.
 * 4. Cuentas: materialización de taxonomía estructurada.
 * 5. SystemMeta + evento de auditoría MIGRATION_EXECUTED.
 */

import type { Transaction } from 'dexie'
import type { Account, JournalEntry } from '../../core/models'
import type {
    AccountingExercise,
    AccountingPeriod,
    Company,
    MigrationException,
    SystemMeta,
} from '../domain/types'
import { MIGRATION_ACTOR } from '../domain/types'
import { materializeTaxonomy } from '../taxonomy/taxonomy'

export const SCHEMA_VERSION = 17
export const MIGRATION_ID = 'v17-fase2a-nucleo-contable'
export const DEFAULT_COMPANY_ID = 'company-default'
export const SYSTEM_META_ID = 'system'

export const APP_VERSION: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION) || '0.2.0'

function nowISO(): string {
    return new Date().toISOString()
}

function randomId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function exerciseIdForYear(year: number): string {
    return `exercise-${DEFAULT_COMPANY_ID}-${year}`
}

export function periodIdForYear(year: number): string {
    return `period-${DEFAULT_COMPANY_ID}-${year}`
}

export function buildAnnualExercise(companyId: string, year: number): AccountingExercise {
    return {
        id: exerciseIdForYear(year),
        companyId,
        name: `Ejercicio ${year}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        status: 'OPEN',
        createdAt: nowISO(),
    }
}

export function buildAnnualPeriod(companyId: string, year: number): AccountingPeriod {
    return {
        id: periodIdForYear(year),
        exerciseId: exerciseIdForYear(year),
        companyId,
        name: `Ejercicio ${year}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        status: 'OPEN',
    }
}

/**
 * Migración principal. Recibe la transacción del upgrade de Dexie v17.
 */
export async function migrateToV17(tx: Transaction): Promise<void> {
    const timestamp = nowISO()

    // ── 1. Empresa por defecto ───────────────────────────────
    const companiesTable = tx.table('companies')
    let company = (await companiesTable.get(DEFAULT_COMPANY_ID)) as Company | undefined
    if (!company) {
        let legalName = 'Empresa ContaLivre'
        let taxId: string | undefined
        try {
            const profile = await tx.table('companyProfile').get('default')
            if (profile?.legalName) legalName = profile.legalName
            if (profile?.cuit) taxId = profile.cuit
        } catch {
            // companyProfile puede no existir en bases muy viejas
        }
        company = {
            id: DEFAULT_COMPANY_ID,
            legalName,
            taxId,
            currency: 'ARS',
            jurisdiction: 'AR',
            accountingFramework: 'RT 54 (texto ordenado por RT 59)',
            createdAt: timestamp,
            updatedAt: timestamp,
            active: true,
        }
        await companiesTable.add(company)
    }

    // ── 2/3. Asientos legacy → ejercicios, períodos y contexto ──
    const entriesTable = tx.table('entries')
    const exercisesTable = tx.table('exercises')
    const periodsTable = tx.table('periods')

    const allEntries = (await entriesTable.toArray()) as JournalEntry[]
    const exceptions: MigrationException[] = []
    const years = new Set<number>()

    for (const entry of allEntries) {
        if (typeof entry.date === 'string' && ISO_DATE_RE.test(entry.date)) {
            years.add(Number(entry.date.slice(0, 4)))
        }
    }

    for (const year of years) {
        if (!(await exercisesTable.get(exerciseIdForYear(year)))) {
            await exercisesTable.add(buildAnnualExercise(DEFAULT_COMPANY_ID, year))
        }
        if (!(await periodsTable.get(periodIdForYear(year)))) {
            await periodsTable.add(buildAnnualPeriod(DEFAULT_COMPANY_ID, year))
        }
    }

    // Numeración secuencial por ejercicio, ordenada por fecha y createdAt
    const sorted = [...allEntries].sort((a, b) => {
        const dateCmp = String(a.date).localeCompare(String(b.date))
        if (dateCmp !== 0) return dateCmp
        return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
    })
    const counters = new Map<string, number>()

    for (const entry of sorted) {
        if (entry.status && entry.companyId && entry.exerciseId) continue // ya migrado

        const validDate = typeof entry.date === 'string' && ISO_DATE_RE.test(entry.date)
        const updates: Partial<JournalEntry> = {
            companyId: DEFAULT_COMPANY_ID,
            status: entry.status ?? 'POSTED',
            createdBy: entry.createdBy ?? MIGRATION_ACTOR,
            postedAt: entry.postedAt ?? entry.createdAt ?? timestamp,
            postedBy: entry.postedBy ?? MIGRATION_ACTOR,
            schemaVersion: SCHEMA_VERSION,
            metadata: { ...(entry.metadata ?? {}), migratedFromLegacy: true },
        }

        if (validDate) {
            const year = Number(entry.date.slice(0, 4))
            const exerciseId = exerciseIdForYear(year)
            updates.exerciseId = exerciseId
            updates.periodId = periodIdForYear(year)
            const next = (counters.get(exerciseId) ?? 0) + 1
            counters.set(exerciseId, next)
            updates.entryNumber = entry.entryNumber ?? next
        } else {
            // No inventar fechas: dejar el asiento sin ejercicio y reportarlo
            updates.metadata = { ...(updates.metadata as Record<string, unknown>), needsReview: true }
            exceptions.push({
                entryId: entry.id,
                date: String(entry.date ?? ''),
                reason: 'Fecha inválida o ausente: no puede asignarse a un ejercicio',
                detectedAt: timestamp,
            })
        }

        await entriesTable.update(entry.id, updates)
    }

    // ── 4. Taxonomía de cuentas ──────────────────────────────
    const accountsTable = tx.table('accounts')
    const accounts = (await accountsTable.toArray()) as Account[]
    for (const account of accounts) {
        if (account.metadataVersion) continue // ya migrada
        const enriched = materializeTaxonomy(account, DEFAULT_COMPANY_ID)
        await accountsTable.put(enriched)
    }

    // ── 5. SystemMeta + auditoría ────────────────────────────
    const metaTable = tx.table('systemMeta')
    const existingMeta = (await metaTable.get(SYSTEM_META_ID)) as SystemMeta | undefined
    const currentYear = years.size > 0 ? Math.max(...years) : new Date().getFullYear()
    const meta: SystemMeta = {
        id: SYSTEM_META_ID,
        appVersion: APP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        installationId: existingMeta?.installationId ?? randomId('install'),
        createdAt: existingMeta?.createdAt ?? timestamp,
        lastMigrationAt: timestamp,
        lastMigrationId: MIGRATION_ID,
        currentCompanyId: DEFAULT_COMPANY_ID,
        currentExerciseId: existingMeta?.currentExerciseId ?? exerciseIdForYear(currentYear),
        migrationExceptions: [...(existingMeta?.migrationExceptions ?? []), ...exceptions],
    }
    await metaTable.put(meta)

    await tx.table('auditLog').add({
        id: randomId('audit'),
        eventType: 'MIGRATION_EXECUTED',
        entityType: 'database',
        entityId: MIGRATION_ID,
        companyId: DEFAULT_COMPANY_ID,
        actorId: MIGRATION_ACTOR,
        timestamp,
        metadata: {
            migratedEntries: sorted.length,
            exercisesCreated: years.size,
            accountsEnriched: accounts.length,
            exceptions: exceptions.length,
        },
    })
}
