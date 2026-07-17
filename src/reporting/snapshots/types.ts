/**
 * Snapshots de reportes publicados — Fase 2C (§16).
 *
 * Un snapshot congela un ReportingBundle validado (con su contexto, hash,
 * versiones e índices usados). NO es la fuente autoritativa: el Diario sigue
 * siéndolo. Si se reabre un ejercicio o se revierte un asiento anterior, el
 * snapshot no se borra: se marca INVALIDATED con la causa.
 */

export type ReportSnapshotStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'INVALIDATED'

export interface ReportSnapshot {
    id: string
    companyId: string
    exerciseId: string
    exerciseLabel: string
    status: ReportSnapshotStatus
    createdAt: string
    createdBy: string
    /** hash del contenido del bundle al momento del snapshot */
    contentHash: string
    /** versión del reporte que produjo el motor */
    reportVersion: string
    engineVersion: string
    schemaVersion: number
    normative: string
    /** id del set de índices usado para inflación, si aplica */
    indexSetId?: string
    hasComparative: boolean
    /** copia serializada de los estados (para consulta histórica) */
    bundleJson: string
    /** motivo de invalidación, si corresponde */
    invalidatedAt?: string
    invalidatedReason?: string
}
