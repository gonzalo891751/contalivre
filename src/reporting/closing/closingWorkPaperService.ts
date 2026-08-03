/** Persistencia y validación del papel de trabajo del pre-cierre. */

import { db, generateId } from '../../storage/db'
import { LOCAL_ACTOR } from '../../accounting/domain/types'
import { toCents } from '../../accounting/domain/money'
import { postOperation, reverseEntry } from '../../accounting/application/journalService'
import type {
    ClosingAdjustmentProposal,
    ClosingPolicyDecision,
    ClosingStageReview,
    ClosingWorkPaper,
    EntityCategory,
    InflationClosingPolicy,
    InflationOriginDecision,
} from './closingWorkPaperTypes'

export function closingWorkPaperId(companyId: string, exerciseId: string): string {
    return `preclose:${companyId}:${exerciseId}`
}

export function emptyClosingWorkPaper(
    companyId: string,
    exerciseId: string,
    actorId = LOCAL_ACTOR,
    entityCategory: EntityCategory = 'PEQUENA',
): ClosingWorkPaper {
    const now = new Date().toISOString()
    return {
        id: closingWorkPaperId(companyId, exerciseId),
        companyId,
        exerciseId,
        version: 1,
        entityCategory,
        status: 'BORRADOR',
        inflation: { applicability: 'PENDIENTE' },
        stageReviews: [],
        policyDecisions: [],
        inflationDecisions: [],
        adjustments: [],
        auditTrail: [],
        createdAt: now,
        createdBy: actorId,
        updatedAt: now,
        updatedBy: actorId,
    }
}

export async function getClosingWorkPaper(companyId: string, exerciseId: string): Promise<ClosingWorkPaper | null> {
    return (await db.closingWorkPapers.get(closingWorkPaperId(companyId, exerciseId))) ?? null
}

async function mutateWorkPaper(
    companyId: string,
    exerciseId: string,
    actorId: string,
    action: string,
    detail: string,
    mutate: (paper: ClosingWorkPaper) => ClosingWorkPaper,
): Promise<ClosingWorkPaper> {
    const current = await getClosingWorkPaper(companyId, exerciseId)
        ?? emptyClosingWorkPaper(companyId, exerciseId, actorId)
    const now = new Date().toISOString()
    const next = mutate(current)
    const persisted: ClosingWorkPaper = {
        ...next,
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actorId,
        auditTrail: [
            ...next.auditTrail,
            { id: generateId(), action, actorId, timestamp: now, detail },
        ],
    }
    validateClosingWorkPaper(persisted)
    await db.closingWorkPapers.put(persisted)
    return persisted
}

export async function saveInflationPolicy(
    companyId: string,
    exerciseId: string,
    policy: InflationClosingPolicy,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    if (policy.applicability === 'NO_APLICABLE' && !policy.rationale?.trim()) {
        throw new Error('Para concluir que el ajuste por inflación no aplica se necesita un motivo verificable.')
    }
    if (policy.applicability === 'APLICABLE' && !policy.indexSetId) {
        throw new Error('Cuando el ajuste por inflación aplica debe seleccionarse la serie de índices.')
    }
    const normalized: InflationClosingPolicy = {
        ...policy,
        rationale: policy.rationale?.trim() || undefined,
        contextAssessment: policy.contextAssessment?.trim() || undefined,
        normativeSource: policy.normativeSource?.trim() || undefined,
        reviewedBy: actorId,
        reviewedAt: new Date().toISOString(),
    }
    return mutateWorkPaper(companyId, exerciseId, actorId, 'INFLATION_POLICY_UPDATED',
        `Aplicabilidad: ${normalized.applicability}`, paper => ({ ...paper, inflation: normalized }))
}

export async function saveStageReview(
    companyId: string,
    exerciseId: string,
    review: ClosingStageReview,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    if (review.status === 'NO_APLICABLE' && !review.notApplicableReason?.trim()) {
        throw new Error('Una etapa no aplicable necesita un motivo concreto y verificable.')
    }
    const normalized: ClosingStageReview = {
        ...review,
        note: review.note?.trim() || undefined,
        notApplicableReason: review.notApplicableReason?.trim() || undefined,
        reviewedBy: actorId,
        reviewedAt: new Date().toISOString(),
    }
    return mutateWorkPaper(companyId, exerciseId, actorId, 'STAGE_REVIEW_UPDATED',
        `Etapa ${review.stage}: ${review.status}`, paper => ({
            ...paper,
            stageReviews: [...paper.stageReviews.filter(r => r.stage !== review.stage), normalized],
        }))
}

export async function savePolicyDecision(
    companyId: string,
    exerciseId: string,
    decision: ClosingPolicyDecision,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    if (!decision.rationale.trim() || !decision.normativeSource.trim()) {
        throw new Error('La política de medición necesita fundamento y fuente normativa.')
    }
    if (decision.previousCriterion && decision.previousCriterion !== decision.criterion && !decision.changeReason?.trim()) {
        throw new Error('Un cambio de criterio necesita explicar el motivo.')
    }
    const currentPaper = await getClosingWorkPaper(companyId, exerciseId)
    const inconsistent = currentPaper?.policyDecisions.find(existing =>
        existing.accountId !== decision.accountId
        && existing.rubro === decision.rubro
        && existing.accountKind === decision.accountKind
        && existing.destination === decision.destination
        && existing.criterion !== decision.criterion)
    if (inconsistent && !decision.changeReason?.trim()) {
        throw new Error(`Una partida similar (${inconsistent.accountId}) usa ${inconsistent.criterion}. Documentá el motivo para aplicar otro criterio.`)
    }
    const normalized = {
        ...decision,
        rationale: decision.rationale.trim(),
        normativeSource: decision.normativeSource.trim(),
        selectedBy: actorId,
        selectedAt: new Date().toISOString(),
    }
    return mutateWorkPaper(companyId, exerciseId, actorId, 'MEASUREMENT_POLICY_UPDATED',
        `Cuenta ${decision.accountId}: ${decision.criterion}`, paper => ({
            ...paper,
            policyDecisions: [...paper.policyDecisions.filter(d => d.accountId !== decision.accountId), normalized],
        }))
}

export async function saveInflationOriginDecision(
    companyId: string,
    exerciseId: string,
    decision: InflationOriginDecision,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    if (!decision.rationale.trim()) throw new Error('La clasificación y el origen necesitan fundamento.')
    if ((decision.originMethod === 'PROMEDIO' || decision.originMethod === 'RECONSTRUIDO')
        && !decision.simplificationReason?.trim()) {
        throw new Error('El uso de promedios o reconstrucciones necesita justificar la simplificación.')
    }
    const normalized = {
        ...decision,
        rationale: decision.rationale.trim(),
        simplificationReason: decision.simplificationReason?.trim() || undefined,
        reviewedBy: actorId,
        reviewedAt: new Date().toISOString(),
    }
    return mutateWorkPaper(companyId, exerciseId, actorId, 'INFLATION_ORIGIN_UPDATED',
        `Cuenta ${decision.accountId}: ${decision.classification}/${decision.originMethod}`, paper => ({
            ...paper,
            inflationDecisions: [...paper.inflationDecisions.filter(d => d.accountId !== decision.accountId), normalized],
        }))
}

export async function saveAdjustmentProposal(
    companyId: string,
    exerciseId: string,
    proposal: ClosingAdjustmentProposal,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    const debit = proposal.lines.reduce((sum, line) => sum + toCents(line.debit), 0)
    const credit = proposal.lines.reduce((sum, line) => sum + toCents(line.credit), 0)
    if (debit !== credit) throw new Error('El ajuste propuesto no balancea en centavos.')
    if (proposal.lines.length < 2) throw new Error('El ajuste propuesto necesita al menos dos líneas.')
    const duplicate = (await getClosingWorkPaper(companyId, exerciseId))?.adjustments
        .find(a => a.sourceId === proposal.sourceId && a.status !== 'REVERTIDO' && a.id !== proposal.id)
    if (duplicate) throw new Error('Ya existe un ajuste activo para el mismo origen; se evita la duplicación.')
    return mutateWorkPaper(companyId, exerciseId, actorId, 'ADJUSTMENT_UPDATED',
        `${proposal.kind}: ${proposal.status}`, paper => ({
            ...paper,
            adjustments: [...paper.adjustments.filter(a => a.id !== proposal.id), proposal],
        }))
}

export async function approveClosingAdjustment(
    companyId: string,
    exerciseId: string,
    adjustmentId: string,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    return mutateWorkPaper(companyId, exerciseId, actorId, 'ADJUSTMENT_APPROVED', adjustmentId, paper => ({
        ...paper,
        adjustments: paper.adjustments.map(adjustment => adjustment.id === adjustmentId
            ? {
                ...adjustment,
                status: 'APROBADO',
                approvedAt: new Date().toISOString(),
                approvedBy: actorId,
            }
            : adjustment),
    }))
}

export async function markClosingAdjustmentExtracontable(
    companyId: string,
    exerciseId: string,
    adjustmentId: string,
    rationale: string,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    if (!rationale.trim()) throw new Error('El tratamiento extracontable necesita un motivo.')
    return mutateWorkPaper(companyId, exerciseId, actorId, 'ADJUSTMENT_EXTRACONTABLE', adjustmentId, paper => ({
        ...paper,
        adjustments: paper.adjustments.map(adjustment => adjustment.id === adjustmentId
            ? { ...adjustment, status: 'EXTRACONTABLE', rationale: rationale.trim() }
            : adjustment),
    }))
}

export async function postClosingAdjustment(
    companyId: string,
    exerciseId: string,
    adjustmentId: string,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    const paper = await getClosingWorkPaper(companyId, exerciseId)
    const adjustment = paper?.adjustments.find(candidate => candidate.id === adjustmentId)
    if (!adjustment) throw new Error('El ajuste propuesto no existe.')
    if (adjustment.status === 'CONTABILIZADO') return paper!
    if (adjustment.status !== 'APROBADO') throw new Error('El asiento debe aprobarse después de revisar todas sus líneas.')
    const debit = adjustment.lines.reduce((sum, line) => sum + toCents(line.debit), 0)
    const credit = adjustment.lines.reduce((sum, line) => sum + toCents(line.credit), 0)
    if (debit !== credit) throw new Error('El asiento dejó de balancear en centavos; no se contabiliza.')
    const { entry } = await postOperation({
        date: adjustment.date,
        memo: adjustment.memo,
        lines: adjustment.lines.map(line => ({ accountId: line.accountId, debit: line.debit, credit: line.credit })),
        sourceModule: 'closing-workpaper',
        sourceType: adjustment.kind,
        sourceId: adjustment.id,
        accountingEventType: adjustment.kind === 'INFLACION' ? 'inflation-adjustment' : 'closing-measurement',
        actorId,
        metadata: { exerciseId, workPaperId: paper!.id, rationale: adjustment.rationale },
    })
    return mutateWorkPaper(companyId, exerciseId, actorId, 'ADJUSTMENT_POSTED', adjustmentId, current => ({
        ...current,
        adjustments: current.adjustments.map(candidate => candidate.id === adjustmentId
            ? { ...candidate, status: 'CONTABILIZADO', journalEntryId: entry.id, postedAt: new Date().toISOString() }
            : candidate),
    }))
}

export async function reverseClosingAdjustment(
    companyId: string,
    exerciseId: string,
    adjustmentId: string,
    reason: string,
    actorId = LOCAL_ACTOR,
): Promise<ClosingWorkPaper> {
    if (!reason.trim()) throw new Error('La reversión necesita un motivo.')
    const paper = await getClosingWorkPaper(companyId, exerciseId)
    const adjustment = paper?.adjustments.find(candidate => candidate.id === adjustmentId)
    if (!adjustment?.journalEntryId || adjustment.status !== 'CONTABILIZADO') {
        throw new Error('Sólo puede revertirse un ajuste contabilizado y trazado al Diario.')
    }
    await reverseEntry(adjustment.journalEntryId, { reason: `Reversión de ajuste de pre-cierre: ${reason}`, actorId })
    return mutateWorkPaper(companyId, exerciseId, actorId, 'ADJUSTMENT_REVERSED', adjustmentId, current => ({
        ...current,
        adjustments: current.adjustments.map(candidate => candidate.id === adjustmentId
            ? { ...candidate, status: 'REVERTIDO', reversedAt: new Date().toISOString(), rationale: `${candidate.rationale} · Reversión: ${reason.trim()}` }
            : candidate),
    }))
}

export function validateClosingWorkPaper(paper: ClosingWorkPaper): void {
    if (!paper.companyId || !paper.exerciseId) throw new Error('El papel de trabajo debe pertenecer a una empresa y un ejercicio.')
    if (paper.inflation.applicability === 'APLICABLE' && !paper.inflation.indexSetId) {
        throw new Error('La política aplicable no identifica la serie de índices seleccionada.')
    }
    if (paper.inflation.applicability === 'NO_APLICABLE' && !paper.inflation.rationale?.trim()) {
        throw new Error('La no aplicación del ajuste por inflación no está fundamentada.')
    }
    for (const review of paper.stageReviews) {
        if (review.status === 'NO_APLICABLE' && !review.notApplicableReason?.trim()) {
            throw new Error(`La etapa ${review.stage} figura no aplicable sin motivo verificable.`)
        }
    }
    const activeSources = new Set<string>()
    for (const adjustment of paper.adjustments) {
        if (adjustment.status === 'REVERTIDO') continue
        if (activeSources.has(adjustment.sourceId)) throw new Error(`Ajuste duplicado para ${adjustment.sourceId}.`)
        activeSources.add(adjustment.sourceId)
        const debit = adjustment.lines.reduce((sum, line) => sum + toCents(line.debit), 0)
        const credit = adjustment.lines.reduce((sum, line) => sum + toCents(line.credit), 0)
        if (debit !== credit) throw new Error(`El ajuste ${adjustment.id} no balancea en centavos.`)
    }
}
