/**
 * Servicio de snapshots de reportes — Fase 2C (§16).
 */

import { db, generateId } from '../../storage/db'
import { appendAuditEvent } from '../../accounting/audit/auditLog'
import { LOCAL_ACTOR } from '../../accounting/domain/types'
import type { ReportingBundle } from '../loadReportingBundle'
import type { ReportSnapshot, ReportSnapshotStatus } from './types'

export interface CreateSnapshotOptions {
    status?: Extract<ReportSnapshotStatus, 'VALIDATED' | 'PUBLISHED'>
    indexSetId?: string
    actorId?: string
}

/**
 * Congela el bundle actual como snapshot. No permite publicar un reporte no
 * validado (§16.1): si el bundle no es publicable, se guarda como DRAFT.
 */
export async function createSnapshot(bundle: ReportingBundle, opts: CreateSnapshotOptions = {}): Promise<ReportSnapshot> {
    const canPublish = bundle.statements.validation.canPublish
    const requested = opts.status ?? 'VALIDATED'
    const status: ReportSnapshotStatus = canPublish ? requested : 'DRAFT'

    const snapshot: ReportSnapshot = {
        id: generateId(),
        companyId: bundle.metadata.companyId,
        exerciseId: bundle.statements.context.exerciseId,
        exerciseLabel: bundle.metadata.exerciseLabel,
        status,
        createdAt: new Date().toISOString(),
        createdBy: opts.actorId ?? LOCAL_ACTOR,
        contentHash: bundle.metadata.reportVersion,
        reportVersion: bundle.metadata.reportVersion,
        engineVersion: bundle.metadata.engineVersion,
        schemaVersion: bundle.metadata.schemaVersion,
        normative: bundle.metadata.normative,
        indexSetId: opts.indexSetId,
        hasComparative: bundle.metadata.hasComparative,
        bundleJson: JSON.stringify({
            balanceSheet: bundle.statements.balanceSheet,
            incomeStatement: bundle.statements.incomeStatement,
            equityStatement: bundle.statements.equityStatement,
            cashFlowDirect: bundle.statements.cashFlowDirect,
            validation: bundle.statements.validation,
        }),
    }

    await db.reportSnapshots.add(snapshot)
    await appendAuditEvent({
        eventType: 'ENTRY_POSTED', // evento genérico de creación auditada
        entityType: 'exercise',
        entityId: snapshot.exerciseId,
        companyId: snapshot.companyId,
        exerciseId: snapshot.exerciseId,
        actorId: snapshot.createdBy,
        reason: `Snapshot de reporte ${status}`,
        metadata: { kind: 'report-snapshot', snapshotId: snapshot.id, status, reportVersion: snapshot.reportVersion },
    })
    return snapshot
}

export async function listSnapshots(exerciseId?: string): Promise<ReportSnapshot[]> {
    const all = exerciseId
        ? await db.reportSnapshots.where('exerciseId').equals(exerciseId).toArray()
        : await db.reportSnapshots.toArray()
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Invalida (sin borrar) los snapshots activos de un ejercicio. Se llama al
 * reabrir un ejercicio o al revertir un asiento que ya estaba capturado.
 */
export async function invalidateSnapshotsForExercise(exerciseId: string, reason: string): Promise<number> {
    const active = (await db.reportSnapshots.where('exerciseId').equals(exerciseId).toArray())
        .filter(s => s.status !== 'INVALIDATED')
    if (active.length === 0) return 0

    const now = new Date().toISOString()
    await db.transaction('rw', [db.reportSnapshots, db.auditLog], async () => {
        for (const s of active) {
            await db.reportSnapshots.update(s.id, { status: 'INVALIDATED', invalidatedAt: now, invalidatedReason: reason })
        }
        await appendAuditEvent({
            eventType: 'EXERCISE_REOPENED',
            entityType: 'exercise',
            entityId: exerciseId,
            exerciseId,
            actorId: LOCAL_ACTOR,
            reason: `Snapshots invalidados: ${reason}`,
            metadata: { kind: 'snapshot-invalidation', count: active.length },
        })
    })
    return active.length
}
