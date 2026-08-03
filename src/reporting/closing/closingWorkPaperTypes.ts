/**
 * Papel de trabajo persistente del pre-cierre — Fase 2L.
 *
 * Guarda decisiones profesionales; las cifras contables continúan saliendo del
 * Diario y del motor canónico. Nada de este registro altera libros por sí solo.
 */

import type { AccountKind, MonetaryClassification, NormalSide } from '../../core/models'
import type { MeasurableRubro, MeasurementCriterion } from '../measurement/measurementTypes'

export type GuidedClosingStage =
    | 'IDENTIDAD_EJERCICIO'
    | 'INTEGRIDAD_COBERTURA'
    | 'CORTE_DEVENGAMIENTOS'
    | 'INVENTARIO_CMV'
    | 'BIENES_USO_DEPRECIACIONES'
    | 'MEDICION_RECUPERABILIDAD'
    | 'UNIDAD_MEDIDA_INFLACION'
    | 'CONCILIACION_EMISION'

export type GuidedStageStatus =
    | 'PENDIENTE'
    | 'EN_REVISION'
    | 'CON_ADVERTENCIAS'
    | 'BLOQUEADA'
    | 'COMPLETA'
    | 'NO_APLICABLE'

export interface ClosingStageReview {
    stage: GuidedClosingStage
    status: 'PENDIENTE' | 'EN_REVISION' | 'REVISADA' | 'NO_APLICABLE'
    /** Sólo para NO_APLICABLE; debe ser concreto y verificable. */
    notApplicableReason?: string
    note?: string
    reviewedBy?: string
    reviewedAt?: string
}

export type EntityCategory = 'PEQUENA' | 'MEDIANA' | 'OTRA'
export type InflationApplicability = 'PENDIENTE' | 'APLICABLE' | 'NO_APLICABLE'

export interface InflationClosingPolicy {
    applicability: InflationApplicability
    /** Hechos considerados para resolver el contexto de unidad de medida. */
    contextAssessment?: string
    /** Obligatoria cuando la conclusión es NO_APLICABLE. */
    rationale?: string
    normativeSource?: string
    indexSetId?: string
    reviewedBy?: string
    reviewedAt?: string
}

export type MeasurementDestination =
    | 'USO'
    | 'VENTA'
    | 'NEGOCIACION'
    | 'COBRO_PAGO'
    | 'INVERSION'
    | 'NO_DEFINIDO'

export interface ClosingPolicyDecision {
    id: string
    accountId: string
    rubro: MeasurableRubro
    accountKind: AccountKind
    normalSide: NormalSide
    destination: MeasurementDestination
    criterion: MeasurementCriterion
    previousCriterion?: MeasurementCriterion
    entityCategory: EntityCategory
    marketAvailable: boolean
    reliableDataAvailable: boolean
    material: boolean
    simplificationApplied?: string
    rationale: string
    normativeSource: string
    source?: string
    effectiveAt: string
    selectedBy: string
    selectedAt: string
    supersedesId?: string
    changeReason?: string
}

export type OriginMethod = 'FECHA_EXACTA' | 'MES_ORIGEN' | 'PROMEDIO' | 'RECONSTRUIDO' | 'VALOR_CIERRE'

export interface InflationOriginDecision {
    accountId: string
    classification: MonetaryClassification
    originMethod: OriginMethod
    originPeriods: string[]
    simplificationReason?: string
    /** Impide una segunda reexpresión de mediciones ya expresadas al cierre. */
    closingValueProtected: boolean
    rationale: string
    reviewedBy: string
    reviewedAt: string
}

export type ClosingAdjustmentStatus =
    | 'CALCULADO'
    | 'PROPUESTO'
    | 'APROBADO'
    | 'CONTABILIZADO'
    | 'REVERTIDO'
    | 'EXTRACONTABLE'

export interface ClosingAdjustmentLine {
    accountId: string
    accountCode: string
    accountName: string
    debit: number
    credit: number
    explanation: string
}

export interface ClosingAdjustmentProposal {
    id: string
    kind: 'MEDICION' | 'DETERIORO' | 'REVERSO_DETERIORO' | 'INFLACION'
    sourceId: string
    status: ClosingAdjustmentStatus
    date: string
    memo: string
    lines: ClosingAdjustmentLine[]
    journalEntryId?: string
    calculatedAt: string
    calculatedBy: string
    approvedAt?: string
    approvedBy?: string
    postedAt?: string
    reversedAt?: string
    rationale: string
}

export interface ClosingWorkPaperAuditEvent {
    id: string
    action: string
    actorId: string
    timestamp: string
    detail: string
}

export interface ClosingWorkPaper {
    id: string
    companyId: string
    exerciseId: string
    version: number
    entityCategory: EntityCategory
    status: 'BORRADOR' | 'EN_REVISION' | 'APROBADO'
    inflation: InflationClosingPolicy
    stageReviews: ClosingStageReview[]
    policyDecisions: ClosingPolicyDecision[]
    inflationDecisions: InflationOriginDecision[]
    adjustments: ClosingAdjustmentProposal[]
    auditTrail: ClosingWorkPaperAuditEvent[]
    createdAt: string
    createdBy: string
    updatedAt: string
    updatedBy: string
}
