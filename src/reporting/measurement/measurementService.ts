/**
 * Servicio de mediciones al cierre — Fase 2J §7.
 *
 * Detecta qué partidas EXIGEN medición a valores corrientes, guarda las
 * mediciones con su fundamento y contabiliza el resultado por tenencia por la
 * puerta única del Diario.
 *
 * Dos reglas que gobiernan todo el módulo:
 *
 * 1. **No se mide lo que no corresponde.** La exigencia sale de la metadata de
 *    la cuenta —el criterio declarado en el plan—, no del nombre ni de una
 *    heurística. Si una cuenta está al costo histórico, medirla a valor
 *    corriente sería un error, no una mejora.
 *
 * 2. **Ningún asiento se genera solo.** La medición se propone, se revisa y
 *    recién entonces se contabiliza; y siempre se puede revertir.
 */

import { db, generateId } from '../../storage/db'
import { postOperation, reverseEntry } from '../../accounting/application/journalService'
import { LOCAL_ACTOR } from '../../accounting/domain/types'
import { toCents } from '../../accounting/domain/money'
import type { Account } from '../../core/models'
import {
    CRITERION_LABEL, RUBRO_LABEL,
    type ClosingMeasurement, type MeasurableRubro, type PendingMeasurement,
} from './measurementTypes'
import { assertCriterionAllowed, type MeasurementPolicyContext } from './measurementPolicy'
import type { ClosingPolicyDecision, MeasurementDestination } from '../closing/closingWorkPaperTypes'

export const MEASUREMENT_MODULE = 'closing-measurement'

/** Etiqueta que declara que una cuenta se mide a valor corriente al cierre */
export const CURRENT_VALUE_TAG = 'medicion:valor-corriente'

/**
 * Rubro de medición que corresponde a una cuenta, derivado de su mapping.
 * Devuelve null cuando la cuenta no admite medición a valores corrientes.
 */
export function measurableRubroOf(account: Account): MeasurableRubro | null {
    switch (account.statementGroup) {
        case 'INVENTORIES':
            return account.sectorProfile === 'AGRICULTURAL' ? 'PRODUCTOS_AGROPECUARIOS' : 'BIENES_DE_CAMBIO'
        case 'INVESTMENTS':
            return 'INVERSIONES_FINANCIERAS'
        case 'PPE':
            return 'BIENES_DE_USO_REVALUADOS'
        case 'TRADE_RECEIVABLES':
        case 'OTHER_RECEIVABLES':
        case 'TRADE_PAYABLES':
        case 'OTHER_PAYABLES':
        case 'LOANS':
            return 'CREDITOS_Y_DEUDAS'
        default:
            return null
    }
}

/**
 * ¿La cuenta EXIGE medición al cierre?
 *
 * Sólo cuando su política declarada lo dice. Una cuenta al costo histórico no
 * se mide: aplicar valores corrientes indiscriminadamente sería tan incorrecto
 * como no aplicarlos donde corresponde.
 */
export function requiresClosingMeasurement(account: Account): boolean {
    const tags = account.tags ?? []
    if (!tags.includes(CURRENT_VALUE_TAG)) return false
    return measurableRubroOf(account) !== null
}

export interface PendingMeasurementsInput {
    accounts: Account[]
    /** saldo de cierre por cuenta */
    balances: Map<string, number>
    exerciseId: string
    measurements: ClosingMeasurement[]
}

/** Partidas que exigen medición y todavía no tienen una contabilizada */
export function computePendingMeasurements(input: PendingMeasurementsInput): PendingMeasurement[] {
    const done = new Set(
        input.measurements
            .filter(m => m.exerciseId === input.exerciseId && m.status === 'CONTABILIZADA')
            .map(m => m.accountId)
    )

    const pending: PendingMeasurement[] = []
    for (const account of input.accounts) {
        if (!requiresClosingMeasurement(account)) continue
        const balance = input.balances.get(account.id) ?? 0
        if (toCents(balance) === 0) continue
        if (done.has(account.id)) continue
        const rubro = measurableRubroOf(account)!
        pending.push({
            rubro,
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            balance,
            reason: `La política declarada para ${RUBRO_LABEL[rubro]} exige medir esta partida al cierre y todavía no se registró la medición.`,
        })
    }
    return pending.sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1))
}

/** Lee las mediciones de un ejercicio */
export async function listMeasurements(exerciseId: string): Promise<ClosingMeasurement[]> {
    const all = await db.closingMeasurements.where('exerciseId').equals(exerciseId).toArray()
    return all.sort((a, b) => (a.accountCode < b.accountCode ? -1 : 1))
}

/** Partidas pendientes de medir en un ejercicio, leyendo de la base */
export async function listPendingMeasurements(
    exerciseId: string,
    accounts: Account[],
    balances: Map<string, number>,
): Promise<PendingMeasurement[]> {
    const measurements = await listMeasurements(exerciseId).catch(() => [])
    return computePendingMeasurements({ accounts, balances, exerciseId, measurements })
}

export interface SaveMeasurementInput {
    companyId: string
    exerciseId: string
    measuredAt: string
    rubro: MeasurableRubro
    account: Account
    item?: string
    quantity?: number
    criterion: ClosingMeasurement['criterion']
    entityCategory?: MeasurementPolicyContext['entityCategory']
    destination?: MeasurementDestination
    marketAvailable?: boolean
    reliableDataAvailable?: boolean
    policyDecision?: ClosingPolicyDecision
    previousAmount: number
    previousIsRestated: boolean
    unitValue?: number
    closingAmount: number
    source: string
    sourceUrl?: string
    evidence?: string
    market?: string
    method?: string
    assumptions?: string
    recoverableAmount?: number
    recoverability?: ClosingMeasurement['recoverability']
    holdingResultAccountId?: string
    responsible?: string
    notes?: string
}

/**
 * Guarda (o actualiza) una medición como PROPUESTA. No contabiliza nada:
 * el asiento se revisa primero.
 */
export async function saveMeasurement(input: SaveMeasurementInput): Promise<ClosingMeasurement> {
    if (!input.source.trim()) {
        throw new Error('La medición necesita declarar su fuente: un importe sin origen no se puede defender.')
    }
    const actualRubro = measurableRubroOf(input.account)
    if (actualRubro !== input.rubro) {
        throw new Error('El rubro de la medición no coincide con la clasificación estructural de la cuenta.')
    }
    assertCriterionAllowed({
        entityCategory: input.entityCategory ?? input.policyDecision?.entityCategory ?? 'PEQUENA',
        rubro: input.rubro,
        account: input.account,
        destination: input.destination ?? input.policyDecision?.destination ?? 'NO_DEFINIDO',
        marketAvailable: input.marketAvailable ?? input.policyDecision?.marketAvailable ?? true,
        reliableDataAvailable: input.reliableDataAvailable ?? input.policyDecision?.reliableDataAvailable ?? true,
    }, input.criterion)
    if (input.recoverability?.required && !input.recoverability.evidence.trim()) {
        throw new Error('La evaluación de recuperabilidad necesita evidencia.')
    }
    const now = new Date().toISOString()
    const existing = (await listMeasurements(input.exerciseId))
        .find(m => m.accountId === input.account.id && m.item === input.item && m.status !== 'REVERTIDA')

    const difference = round2(input.closingAmount - input.previousAmount)

    const measurement: ClosingMeasurement = {
        id: existing?.id ?? generateId(),
        companyId: input.companyId,
        exerciseId: input.exerciseId,
        measuredAt: input.measuredAt,
        rubro: input.rubro,
        accountId: input.account.id,
        accountCode: input.account.code,
        accountName: input.account.name,
        accountKind: input.account.kind,
        normalSide: input.account.normalSide,
        item: input.item,
        quantity: input.quantity,
        criterion: input.criterion,
        previousAmount: round2(input.previousAmount),
        previousIsRestated: input.previousIsRestated,
        unitValue: input.unitValue,
        closingAmount: round2(input.closingAmount),
        source: input.source.trim(),
        sourceUrl: input.sourceUrl?.trim() || undefined,
        evidence: input.evidence?.trim() || undefined,
        market: input.market?.trim() || undefined,
        method: input.method?.trim() || undefined,
        assumptions: input.assumptions?.trim() || undefined,
        recoverableAmount: input.recoverableAmount,
        recoverability: input.recoverability,
        policyDecisionId: input.policyDecision?.id,
        policyRationale: input.policyDecision?.rationale,
        policySource: input.policyDecision?.normativeSource,
        difference,
        holdingResultAccountId: input.holdingResultAccountId,
        status: existing?.status === 'CONTABILIZADA' ? 'CONTABILIZADA' : 'PROPUESTA',
        journalEntryId: existing?.journalEntryId,
        responsible: input.responsible?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    }

    if (measurement.status === 'CONTABILIZADA') {
        throw new Error('La medición ya está contabilizada. Revertí su asiento antes de modificarla.')
    }

    await db.closingMeasurements.put(measurement)
    return measurement
}

export interface MeasurementEntryPreview {
    date: string
    memo: string
    lines: Array<{ accountId: string; accountCode: string; accountName: string; debit: number; credit: number }>
    /** true cuando el ajuste es una ganancia por tenencia */
    isGain: boolean
    effect: 'GANANCIA_TENENCIA' | 'PERDIDA_TENENCIA' | 'DETERIORO' | 'REVERSO_DETERIORO'
}

/**
 * Vista previa del asiento que reconoce el resultado por tenencia.
 *
 * Un aumento del valor de la partida se debita en el activo y se acredita en el
 * resultado por tenencia; una disminución, al revés. El asiento se muestra
 * ANTES de contabilizarse: nunca se genera en silencio.
 */
export function previewMeasurementEntry(
    measurement: ClosingMeasurement,
    holdingAccount: Account,
): MeasurementEntryPreview | null {
    const diff = toCents(measurement.difference)
    if (diff === 0) return null

    const amount = Math.abs(measurement.difference)
    const normalSide = measurement.normalSide ?? 'DEBIT'
    const increasesNaturalBalance = diff > 0
    const isAssetLike = normalSide === 'DEBIT'
    const isGain = isAssetLike ? increasesNaturalBalance : !increasesNaturalBalance
    const criterio = CRITERION_LABEL[measurement.criterion]

    const itemLine = {
        accountId: measurement.accountId,
        accountCode: measurement.accountCode,
        accountName: measurement.accountName,
        debit: increasesNaturalBalance === (normalSide === 'DEBIT') ? amount : 0,
        credit: increasesNaturalBalance === (normalSide === 'CREDIT') ? amount : 0,
    }
    const resultLine = {
        accountId: holdingAccount.id,
        accountCode: holdingAccount.code,
        accountName: holdingAccount.name,
        debit: itemLine.credit,
        credit: itemLine.debit,
    }
    const effect = measurement.recoverability?.impairmentLoss
        ? 'DETERIORO'
        : measurement.recoverability?.reversal
            ? 'REVERSO_DETERIORO'
            : isGain ? 'GANANCIA_TENENCIA' : 'PERDIDA_TENENCIA'

    return {
        date: measurement.measuredAt,
        memo: `Medición al cierre de ${measurement.accountName} — ${criterio}`,
        isGain,
        effect,
        lines: itemLine.debit > 0 ? [itemLine, resultLine] : [resultLine, itemLine],
    }
}

/**
 * Contabiliza el resultado por tenencia de una medición.
 *
 * Idempotente por `sourceId`: repetir la acción devuelve el asiento existente
 * en lugar de duplicarlo.
 */
export async function postMeasurement(
    measurementId: string,
    holdingAccountId: string,
    actorId = LOCAL_ACTOR,
): Promise<ClosingMeasurement> {
    const measurement = await db.closingMeasurements.get(measurementId)
    if (!measurement) throw new Error('La medición no existe')
    if (measurement.status === 'CONTABILIZADA') return measurement

    const holding = await db.accounts.get(holdingAccountId)
    if (!holding) throw new Error('La cuenta de resultado por tenencia no existe')
    if (!['INCOME', 'EXPENSE'].includes(holding.kind)) {
        throw new Error('El resultado de la medición debe imputarse a una cuenta de resultados.')
    }

    const preview = previewMeasurementEntry(measurement, holding)
    if (!preview) {
        // Diferencia cero: la medición confirma el importe y no genera asiento.
        const confirmed: ClosingMeasurement = {
            ...measurement, status: 'CONTABILIZADA',
            holdingResultAccountId: holdingAccountId,
            updatedAt: new Date().toISOString(),
        }
        await db.closingMeasurements.put(confirmed)
        return confirmed
    }

    const { entry } = await postOperation({
        date: preview.date,
        memo: preview.memo,
        lines: preview.lines.map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit })),
        sourceModule: MEASUREMENT_MODULE,
        sourceType: measurement.rubro,
        sourceId: measurement.id,
        accountingEventType: 'holding-result',
        actorId,
        metadata: {
            criterio: measurement.criterion,
            fuente: measurement.source,
            medicionAnterior: measurement.previousAmount,
            medicionAlCierre: measurement.closingAmount,
            politica: measurement.policyDecisionId,
            efecto: preview.effect,
        },
    })

    const posted: ClosingMeasurement = {
        ...measurement,
        status: 'CONTABILIZADA',
        holdingResultAccountId: holdingAccountId,
        journalEntryId: entry.id,
        updatedAt: new Date().toISOString(),
    }
    await db.closingMeasurements.put(posted)
    return posted
}

/** Revierte el asiento de una medición y la deja como antecedente */
export async function reverseMeasurement(
    measurementId: string,
    reason: string,
    actorId = LOCAL_ACTOR,
): Promise<ClosingMeasurement> {
    const measurement = await db.closingMeasurements.get(measurementId)
    if (!measurement) throw new Error('La medición no existe')
    if (!reason.trim()) throw new Error('La reversión requiere un motivo.')

    if (measurement.journalEntryId) {
        await reverseEntry(measurement.journalEntryId, { reason: `Reversión de medición al cierre: ${reason}`, actorId })
    }
    const reverted: ClosingMeasurement = {
        ...measurement, status: 'REVERTIDA', updatedAt: new Date().toISOString(),
        notes: [measurement.notes, `Revertida: ${reason}`].filter(Boolean).join(' · '),
    }
    await db.closingMeasurements.put(reverted)
    return reverted
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100
}
