/** Reglas puras de política de medición y recuperabilidad — Fase 2L. */

import type { Account } from '../../core/models'
import type { EntityCategory, MeasurementDestination } from '../closing/closingWorkPaperTypes'
import type {
    MeasurableRubro,
    MeasurementCriterion,
    RecoverabilityAssessment,
    RecoverableBasis,
    RecoverabilityLevel,
} from './measurementTypes'

export interface MeasurementPolicyContext {
    entityCategory: EntityCategory
    rubro: MeasurableRubro
    account: Account
    destination: MeasurementDestination
    marketAvailable: boolean
    reliableDataAvailable: boolean
}

const BY_RUBRO: Record<MeasurableRubro, MeasurementCriterion[]> = {
    BIENES_DE_CAMBIO: [
        'COSTO_ADQUISICION', 'COSTO_PRODUCCION', 'COSTO_REPOSICION',
        'VALOR_NETO_REALIZACION',
    ],
    INVERSIONES_FINANCIERAS: [
        'COSTO_ADQUISICION', 'COSTO_AMORTIZADO', 'VALOR_COTIZACION',
        'VALOR_RAZONABLE', 'VALOR_DESCONTADO',
    ],
    MONEDA_EXTRANJERA: ['TIPO_CAMBIO_CIERRE', 'COSTO_AMORTIZADO'],
    PROPIEDADES_DE_INVERSION: ['MODELO_COSTO', 'VALOR_RAZONABLE', 'MODELO_REVALUACION'],
    BIENES_DE_USO_REVALUADOS: [
        'MODELO_COSTO', 'MODELO_REVALUACION', 'COSTO_REPOSICION',
        'COSTO_REPRODUCCION', 'COSTO_RECONSTRUCCION', 'VALOR_RECUPERABLE',
    ],
    ACTIVOS_BIOLOGICOS: ['COSTO_PRODUCCION', 'COSTO_REPOSICION', 'VALOR_RAZONABLE', 'VALOR_NETO_REALIZACION'],
    PRODUCTOS_AGROPECUARIOS: ['COSTO_PRODUCCION', 'VALOR_RAZONABLE', 'VALOR_NETO_REALIZACION'],
    CREDITOS_Y_DEUDAS: ['COSTO_AMORTIZADO', 'VALOR_DESCONTADO', 'TIPO_CAMBIO_CIERRE', 'VALOR_RAZONABLE'],
}

export interface AllowedMeasurementCriterion {
    criterion: MeasurementCriterion
    requiresMarket: boolean
    requiresReliableData: boolean
    requiresRecoverability: boolean
    rationale: string
}

export function allowedMeasurementCriteria(context: MeasurementPolicyContext): AllowedMeasurementCriterion[] {
    return BY_RUBRO[context.rubro].map(criterion => ({
        criterion,
        requiresMarket: ['VALOR_COTIZACION', 'VALOR_RAZONABLE', 'COSTO_REPOSICION'].includes(criterion),
        requiresReliableData: !['COSTO_HISTORICO', 'MODELO_COSTO'].includes(criterion),
        requiresRecoverability: criterion === 'VALOR_RECUPERABLE'
            || (context.account.kind === 'ASSET' && ['MODELO_COSTO', 'MODELO_REVALUACION'].includes(criterion)),
        rationale: policyRationale(context.rubro, criterion),
    })).filter(rule => {
        if (rule.requiresMarket && !context.marketAvailable) return false
        if (rule.requiresReliableData && !context.reliableDataAvailable) return false
        if (context.destination === 'COBRO_PAGO' && !['COSTO_AMORTIZADO', 'VALOR_DESCONTADO', 'TIPO_CAMBIO_CIERRE'].includes(rule.criterion)) return false
        if (context.destination === 'VENTA' && context.rubro === 'BIENES_DE_CAMBIO'
            && !['VALOR_NETO_REALIZACION', 'COSTO_REPOSICION'].includes(rule.criterion)) return false
        return true
    })
}

export function assertCriterionAllowed(context: MeasurementPolicyContext, criterion: MeasurementCriterion): void {
    if (!allowedMeasurementCriteria(context).some(rule => rule.criterion === criterion)) {
        throw new Error(`El criterio ${criterion} no es válido para ${context.rubro} con el destino y la evidencia declarados.`)
    }
}

export interface RecoverabilityInput {
    required: boolean
    level: RecoverabilityLevel
    basis: RecoverableBasis
    accountingAmount: number
    netRealizableValue?: number
    valueInUse?: number
    fairValueLessCosts?: number
    priorImpairment?: number
    amountWithoutPriorImpairment?: number
    indicators?: string[]
    evidence: string
    conclusion?: string
}

export function calculateRecoverability(input: RecoverabilityInput): RecoverabilityAssessment {
    const candidates: number[] = []
    if (input.basis === 'VNR' || input.basis === 'MAYOR_VNR_VALOR_USO') {
        if (input.netRealizableValue === undefined) throw new Error('Falta el valor neto de realización.')
        candidates.push(input.netRealizableValue)
    }
    if (input.basis === 'VALOR_USO' || input.basis === 'MAYOR_VNR_VALOR_USO') {
        if (input.valueInUse === undefined) throw new Error('Falta el valor de uso.')
        candidates.push(input.valueInUse)
    }
    if (input.basis === 'VALOR_RAZONABLE_MENOS_COSTOS') {
        if (input.fairValueLessCosts === undefined) throw new Error('Falta el valor razonable menos costos de disposición.')
        candidates.push(input.fairValueLessCosts)
    }
    const recoverableAmount = round2(Math.max(...candidates))
    const loss = round2(Math.max(0, input.accountingAmount - recoverableAmount))
    const prior = Math.max(0, input.priorImpairment ?? 0)
    const cap = input.amountWithoutPriorImpairment ?? input.accountingAmount + prior
    const potentialReversal = Math.max(0, recoverableAmount - input.accountingAmount)
    const reversal = round2(Math.min(prior, potentialReversal, Math.max(0, cap - input.accountingAmount)))
    return {
        required: input.required,
        level: input.level,
        basis: input.basis,
        accountingAmount: round2(input.accountingAmount),
        netRealizableValue: input.netRealizableValue,
        valueInUse: input.valueInUse,
        fairValueLessCosts: input.fairValueLessCosts,
        recoverableAmount,
        impairmentLoss: loss,
        reversal,
        reversalCap: round2(cap),
        indicators: input.indicators ?? [],
        evidence: input.evidence.trim(),
        conclusion: input.conclusion?.trim()
            || (loss > 0 ? `Corresponde reconocer una pérdida por desvalorización de ${loss.toFixed(2)}.`
                : reversal > 0 ? `Corresponde revertir deterioro por ${reversal.toFixed(2)}, respetando el límite.`
                    : 'La medición contable no supera el valor recuperable.'),
    }
}

function policyRationale(rubro: MeasurableRubro, criterion: MeasurementCriterion): string {
    return `${criterion} se habilita para ${rubro} sólo con destino, mercado y datos compatibles.`
}

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}
