/**
 * Servicio de contexto contable — Fase 2A
 *
 * Gestión de empresa, ejercicios y períodos persistidos. Los ejercicios ya
 * NO son una lista fija de años: viven en la base y gobiernan qué fechas
 * admiten contabilización.
 *
 * Decisión de diseño (modo laboratorio educativo local): si una operación
 * intenta contabilizar en una fecha para la que no existe ejercicio, se
 * aprovisiona automáticamente un ejercicio anual ABIERTO con su período
 * anual, y queda auditado como EXERCISE_CREATED. Cerrar el período o el
 * ejercicio activa la protección temporal (la contabilización se rechaza).
 */

import { db, generateId } from '../../storage/db'
import type {
    AccountingExercise,
    AccountingPeriod,
    Company,
    SystemMeta,
} from '../domain/types'
import { LOCAL_ACTOR } from '../domain/types'
import {
    APP_VERSION,
    DEFAULT_COMPANY_ID,
    SCHEMA_VERSION,
    SYSTEM_META_ID,
    buildAnnualExercise,
    buildAnnualPeriod,
    exerciseIdForYear,
} from '../migration/migrateV17'
import { appendAuditEvent } from '../audit/auditLog'
import { inWriteTx } from './txUtils'

function nowISO(): string {
    return new Date().toISOString()
}

// ─────────────────────────────────────────────────────────────
// Empresa
// ─────────────────────────────────────────────────────────────

export async function getDefaultCompany(): Promise<Company> {
    const existing = await db.companies.get(DEFAULT_COMPANY_ID)
    if (existing) return existing
    const timestamp = nowISO()
    const company: Company = {
        id: DEFAULT_COMPANY_ID,
        legalName: 'Empresa ContaLivre',
        currency: 'ARS',
        jurisdiction: 'AR',
        accountingFramework: 'RT 54 (texto ordenado por RT 59)',
        createdAt: timestamp,
        updatedAt: timestamp,
        active: true,
    }
    await db.companies.put(company)
    return company
}

// ─────────────────────────────────────────────────────────────
// Ejercicios
// ─────────────────────────────────────────────────────────────

export async function listExercises(companyId?: string): Promise<AccountingExercise[]> {
    const cid = companyId ?? DEFAULT_COMPANY_ID
    const list = await db.exercises.where('companyId').equals(cid).toArray()
    return list.sort((a, b) => b.startDate.localeCompare(a.startDate))
}

export async function getExercise(id: string): Promise<AccountingExercise | undefined> {
    return db.exercises.get(id)
}

export async function getExerciseForDate(
    date: string,
    companyId?: string
): Promise<AccountingExercise | undefined> {
    const cid = companyId ?? DEFAULT_COMPANY_ID
    const list = await db.exercises.where('companyId').equals(cid).toArray()
    return list.find(e => date >= e.startDate && date <= e.endDate)
}

/**
 * Devuelve el ejercicio que contiene la fecha; si no existe, lo aprovisiona
 * (ejercicio anual + período anual, ambos OPEN) y lo audita.
 */
export async function ensureExerciseForDate(
    date: string,
    opts: { companyId?: string; actorId?: string } = {}
): Promise<AccountingExercise> {
    const companyId = opts.companyId ?? DEFAULT_COMPANY_ID
    await getDefaultCompany()
    const existing = await getExerciseForDate(date, companyId)
    if (existing) return existing

    const year = Number(date.slice(0, 4))
    const exercise = buildAnnualExercise(companyId, year)
    const period = buildAnnualPeriod(companyId, year)
    await inWriteTx([db.exercises, db.periods, db.auditLog], async () => {
        if (!(await db.exercises.get(exercise.id))) await db.exercises.add(exercise)
        if (!(await db.periods.get(period.id))) await db.periods.add(period)
        await appendAuditEvent({
            eventType: 'EXERCISE_CREATED',
            entityType: 'exercise',
            entityId: exercise.id,
            companyId,
            exerciseId: exercise.id,
            actorId: opts.actorId ?? LOCAL_ACTOR,
            after: exercise,
            reason: `Aprovisionamiento automático para la fecha ${date}`,
        })
    })
    return exercise
}

export async function createExercise(
    input: { companyId?: string; year: number; actorId?: string }
): Promise<AccountingExercise> {
    return ensureExerciseForDate(`${input.year}-01-01`, {
        companyId: input.companyId,
        actorId: input.actorId,
    })
}

export async function closeExercise(exerciseId: string, actorId = LOCAL_ACTOR): Promise<void> {
    const exercise = await db.exercises.get(exerciseId)
    if (!exercise) throw new Error(`El ejercicio ${exerciseId} no existe`)
    if (exercise.status === 'CLOSED') return
    const timestamp = nowISO()
    await db.transaction('rw', [db.exercises, db.periods, db.auditLog], async () => {
        await db.exercises.update(exerciseId, { status: 'CLOSED', closedAt: timestamp, closedBy: actorId })
        const periods = await db.periods.where('exerciseId').equals(exerciseId).toArray()
        for (const p of periods) {
            if (p.status !== 'CLOSED') {
                await db.periods.update(p.id, { status: 'CLOSED', closedAt: timestamp, closedBy: actorId })
            }
        }
        await appendAuditEvent({
            eventType: 'EXERCISE_CLOSED',
            entityType: 'exercise',
            entityId: exerciseId,
            companyId: exercise.companyId,
            exerciseId,
            actorId,
            before: exercise,
        })
    })
}

export async function reopenExercise(exerciseId: string, reason: string, actorId = LOCAL_ACTOR): Promise<void> {
    const exercise = await db.exercises.get(exerciseId)
    if (!exercise) throw new Error(`El ejercicio ${exerciseId} no existe`)
    await db.transaction('rw', [db.exercises, db.periods, db.auditLog], async () => {
        await db.exercises.update(exerciseId, { status: 'OPEN', closedAt: undefined, closedBy: undefined })
        const periods = await db.periods.where('exerciseId').equals(exerciseId).toArray()
        for (const p of periods) {
            await db.periods.update(p.id, {
                status: 'OPEN',
                reopenedAt: nowISO(),
                reopenedBy: actorId,
                reopenReason: reason,
            })
        }
        await appendAuditEvent({
            eventType: 'EXERCISE_REOPENED',
            entityType: 'exercise',
            entityId: exerciseId,
            companyId: exercise.companyId,
            exerciseId,
            actorId,
            reason,
        })
    })
}

// ─────────────────────────────────────────────────────────────
// Períodos
// ─────────────────────────────────────────────────────────────

export async function getPeriodForDate(
    date: string,
    exerciseId: string
): Promise<AccountingPeriod | undefined> {
    const periods = await db.periods.where('exerciseId').equals(exerciseId).toArray()
    return periods.find(p => date >= p.startDate && date <= p.endDate)
}

export async function closePeriod(periodId: string, actorId = LOCAL_ACTOR): Promise<void> {
    const period = await db.periods.get(periodId)
    if (!period) throw new Error(`El período ${periodId} no existe`)
    if (period.status === 'CLOSED') return
    await db.transaction('rw', [db.periods, db.auditLog], async () => {
        await db.periods.update(periodId, { status: 'CLOSED', closedAt: nowISO(), closedBy: actorId })
        await appendAuditEvent({
            eventType: 'PERIOD_CLOSED',
            entityType: 'period',
            entityId: periodId,
            companyId: period.companyId,
            exerciseId: period.exerciseId,
            actorId,
            before: period,
        })
    })
}

export async function reopenPeriod(periodId: string, reason: string, actorId = LOCAL_ACTOR): Promise<void> {
    const period = await db.periods.get(periodId)
    if (!period) throw new Error(`El período ${periodId} no existe`)
    await db.transaction('rw', [db.periods, db.auditLog], async () => {
        await db.periods.update(periodId, {
            status: 'OPEN',
            reopenedAt: nowISO(),
            reopenedBy: actorId,
            reopenReason: reason,
        })
        await appendAuditEvent({
            eventType: 'PERIOD_REOPENED',
            entityType: 'period',
            entityId: periodId,
            companyId: period.companyId,
            exerciseId: period.exerciseId,
            actorId,
            reason,
        })
    })
}

// ─────────────────────────────────────────────────────────────
// Metadata de sistema
// ─────────────────────────────────────────────────────────────

export async function getSystemMeta(): Promise<SystemMeta> {
    const existing = await db.systemMeta.get(SYSTEM_META_ID)
    if (existing) return existing
    const meta: SystemMeta = {
        id: SYSTEM_META_ID,
        appVersion: APP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        installationId: generateId(),
        createdAt: nowISO(),
    }
    await db.systemMeta.put(meta)
    return meta
}

export async function setCurrentExercise(exerciseId: string): Promise<void> {
    await getSystemMeta()
    await db.systemMeta.update(SYSTEM_META_ID, {
        currentExerciseId: exerciseId,
        currentCompanyId: DEFAULT_COMPANY_ID,
    })
}

export { DEFAULT_COMPANY_ID, exerciseIdForYear }
