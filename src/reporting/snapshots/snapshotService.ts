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

function hashString(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(16)
}

/**
 * Serializa TODO el contenido material del EFE y estados que debe congelarse
 * (Fase 2G §15): ambos métodos nominales y reexpresados, comparativo,
 * revelaciones, REI, preparación, puerta de publicación y validación. Se guarda
 * para consulta histórica (incluye timestamps de generación).
 */
export function serializeBundleForSnapshot(bundle: ReportingBundle): string {
    return JSON.stringify({
        balanceSheet: bundle.statements.balanceSheet,
        incomeStatement: bundle.statements.incomeStatement,
        equityStatement: bundle.statements.equityStatement,
        cashFlowDirect: bundle.statements.cashFlowDirect,
        cashFlowIndirect: bundle.statements.cashFlowIndirect,
        cashFlowRestated: bundle.cashFlowRestated,
        preparation: bundle.preparation,
        publicationGate: bundle.publicationGate,
        validation: bundle.statements.validation,
        inflationSet: bundle.inflationSet,
        hasComparative: bundle.metadata.hasComparative,
    })
}

/**
 * Proyección DETERMINISTA para el hash de contenido: excluye timestamps de
 * generación (generatedAt/checkedAt) para que el hash sólo cambie ante cambios
 * MATERIALES (asientos, mappings, políticas, índices, método, moneda, reglas).
 */
function materialHashInput(bundle: ReportingBundle): string {
    return JSON.stringify({
        prepHash: bundle.preparation.identity.contentHash,
        mappingsHash: bundle.preparation.identity.mappingsHash,
        policyVersion: bundle.preparation.identity.policyVersion,
        cashFlowDirect: bundle.statements.cashFlowDirect,
        cashFlowIndirect: bundle.statements.cashFlowIndirect,
        cashFlowRestated: bundle.cashFlowRestated,
        canPublish: bundle.publicationGate.canPublish,
        blockers: bundle.publicationGate.blockers.map(b => b.id),
        indexSetHash: bundle.inflationSet?.contentHash ?? null,
        hasComparative: bundle.metadata.hasComparative,
    })
}

/**
 * Congela el bundle actual como snapshot. No permite publicar un reporte con
 * blockers en la puerta unificada (§5.3, §15): si no es publicable, DRAFT.
 */
export async function createSnapshot(bundle: ReportingBundle, opts: CreateSnapshotOptions = {}): Promise<ReportSnapshot> {
    const canPublish = bundle.publicationGate.canPublish
    const requested = opts.status ?? 'VALIDATED'
    const status: ReportSnapshotStatus = canPublish ? requested : 'DRAFT'

    const bundleJson = serializeBundleForSnapshot(bundle)
    const snapshot: ReportSnapshot = {
        id: generateId(),
        companyId: bundle.metadata.companyId,
        exerciseId: bundle.statements.context.exerciseId,
        exerciseLabel: bundle.metadata.exerciseLabel,
        status,
        createdAt: new Date().toISOString(),
        createdBy: opts.actorId ?? LOCAL_ACTOR,
        contentHash: hashString(materialHashInput(bundle)),
        reportVersion: bundle.metadata.reportVersion,
        engineVersion: bundle.metadata.engineVersion,
        schemaVersion: bundle.metadata.schemaVersion,
        normative: bundle.metadata.normative,
        indexSetId: opts.indexSetId ?? bundle.inflationSet?.id,
        indexSetHash: bundle.inflationSet?.contentHash ?? null,
        mappingsHash: bundle.preparation.identity.mappingsHash,
        policyVersion: bundle.preparation.identity.policyVersion,
        hasComparative: bundle.metadata.hasComparative,
        bundleJson,
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

/**
 * ¿El cálculo actual difiere del snapshot congelado? (Fase 2G §15). Compara el
 * hash de contenido completo: si cambió un asiento, mapping, política, índice,
 * método, moneda o revelación, el snapshot queda "congelado pero divergente" y
 * la UI puede advertirlo sin borrarlo.
 */
export function snapshotDivergesFromCurrent(snapshot: ReportSnapshot, bundle: ReportingBundle): boolean {
    return snapshot.contentHash !== hashString(materialHashInput(bundle))
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
