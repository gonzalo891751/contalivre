/** Papel de trabajo trazable del ajuste por inflación — Fase 2L. */

import { toCents } from '../../accounting/domain/money'
import type { ClosingWorkPaper, InflationOriginDecision } from '../closing/closingWorkPaperTypes'
import type { ClosingMeasurement } from '../measurement/measurementTypes'
import { coefficientFor, monthsBetween, type AccountTreatmentMatrix, type AccountTreatmentRow } from './accountTreatment'
import type { RecpamReconciliation } from './recpam'

export interface InflationCoefficientRow {
    period: string
    originIndex: number | null
    closingIndex: number | null
    coefficient: number | null
    formula: string
    status: 'OK' | 'FALTA_INDICE'
}

export interface InflationWorkPaperOrigin {
    period: string
    historicAmount: number
    originIndex: number | null
    closingIndex: number | null
    coefficient: number | null
    restatedAmount: number
    formula: string
}

export interface InflationWorkPaperRow {
    accountId: string
    code: string
    name: string
    rubro: string
    classification: string
    treatment: AccountTreatmentRow['treatment']
    baseAmount: number
    originMethod: InflationOriginDecision['originMethod'] | 'DERIVADO_LIBRO'
    origins: InflationWorkPaperOrigin[]
    inflationAdjustment: number
    closingMeasurement?: number
    measurementAdjustment: number
    finalAmount: number
    resultKind: 'RECPAM' | 'RESULTADO_TENENCIA' | 'DETERIORO' | 'SIN_RESULTADO_DIRECTO' | 'REQUIERE_DECISION'
    status: 'OK' | 'ADVERTENCIA' | 'BLOQUEADO'
    evidence: string[]
    entryIds: string[]
    /** Guardia material contra reexpresar una medición a fecha de cierre. */
    doubleAdjustmentPrevented: boolean
}

export interface InflationWorkPaper {
    applicable: boolean
    applicabilityStatus: ClosingWorkPaper['inflation']['applicability']
    rationale?: string
    startPeriod: string
    closingPeriod: string
    openingPeriod: string
    coefficients: InflationCoefficientRow[]
    rows: InflationWorkPaperRow[]
    missingPeriods: string[]
    blockers: string[]
    recpam: RecpamReconciliation | null
    totals: {
        baseAmount: number
        inflationAdjustment: number
        measurementAdjustment: number
        finalAmount: number
    }
}

export interface BuildInflationWorkPaperInput {
    matrix: AccountTreatmentMatrix | null
    indexes: Map<string, number>
    startPeriod: string
    closingPeriod: string
    openingPeriod: string
    workPaper: ClosingWorkPaper | null
    measurements: ClosingMeasurement[]
    recpam: RecpamReconciliation | null
}

export function auditIndexSeries(
    indexes: Map<string, number>,
    openingPeriod: string,
    closingPeriod: string,
): { rows: InflationCoefficientRow[]; missingPeriods: string[] } {
    const closingIndex = indexes.get(closingPeriod) ?? null
    const periods = [openingPeriod, ...monthsBetween(nextMonth(openingPeriod), closingPeriod)]
    const rows = periods.map(period => {
        const originIndex = indexes.get(period) ?? null
        const coefficient = originIndex && closingIndex ? coefficientFor(indexes, period, closingPeriod) : null
        return {
            period,
            originIndex,
            closingIndex,
            coefficient,
            formula: coefficient === null
                ? `Índice ${closingPeriod} / índice ${period} — pendiente`
                : `${closingIndex!.toFixed(6)} / ${originIndex!.toFixed(6)} = ${coefficient.toFixed(8)}`,
            status: coefficient === null ? 'FALTA_INDICE' as const : 'OK' as const,
        }
    })
    return { rows, missingPeriods: rows.filter(row => row.status === 'FALTA_INDICE').map(row => row.period) }
}

export function buildInflationWorkPaper(input: BuildInflationWorkPaperInput): InflationWorkPaper {
    const applicability = input.workPaper?.inflation.applicability ?? 'PENDIENTE'
    const applicable = applicability === 'APLICABLE'
    const indexAudit = auditIndexSeries(input.indexes, input.openingPeriod, input.closingPeriod)
    const blockers: string[] = []

    if (applicability === 'PENDIENTE') {
        blockers.push('Falta concluir si el contexto exige expresar los estados en moneda de cierre.')
    }
    if (applicability === 'NO_APLICABLE' && !input.workPaper?.inflation.rationale?.trim()) {
        blockers.push('La conclusión de no aplicación no tiene un motivo verificable.')
    }
    if (applicable && !input.matrix) blockers.push('El ajuste aplica pero no se pudo construir la matriz de tratamiento.')
    if (applicable && indexAudit.missingPeriods.length > 0) {
        blockers.push(`Faltan índices para: ${indexAudit.missingPeriods.join(', ')}. No se interpolan ni se completan en silencio.`)
    }

    const measurementsByAccount = new Map<string, ClosingMeasurement>()
    for (const measurement of input.measurements) {
        if (measurement.status === 'REVERTIDA') continue
        const current = measurementsByAccount.get(measurement.accountId)
        if (!current || current.updatedAt < measurement.updatedAt) measurementsByAccount.set(measurement.accountId, measurement)
    }
    const decisions = new Map((input.workPaper?.inflationDecisions ?? []).map(decision => [decision.accountId, decision]))
    const rows = (input.matrix?.rows ?? []).map(row => buildRow(
        row, input.indexes, input.closingPeriod,
        decisions.get(row.accountId), measurementsByAccount.get(row.accountId),
    ))

    for (const row of rows) {
        if (row.status === 'BLOQUEADO') blockers.push(`${row.code} ${row.name}: ${row.evidence[0] ?? 'requiere revisión'}`)
        if (!Number.isFinite(row.finalAmount) || !Number.isFinite(row.inflationAdjustment)) {
            blockers.push(`${row.code} ${row.name}: el cálculo produjo un importe no finito.`)
        }
    }
    if (applicable && input.recpam && !input.recpam.reconciled) blockers.push(...input.recpam.blockers)

    return {
        applicable,
        applicabilityStatus: applicability,
        rationale: input.workPaper?.inflation.rationale,
        startPeriod: input.startPeriod,
        closingPeriod: input.closingPeriod,
        openingPeriod: input.openingPeriod,
        coefficients: indexAudit.rows,
        rows,
        missingPeriods: indexAudit.missingPeriods,
        blockers: Array.from(new Set(blockers)),
        recpam: input.recpam,
        totals: {
            baseAmount: sum(rows.map(row => row.baseAmount)),
            inflationAdjustment: sum(rows.map(row => row.inflationAdjustment)),
            measurementAdjustment: sum(rows.map(row => row.measurementAdjustment)),
            finalAmount: sum(rows.map(row => row.finalAmount)),
        },
    }
}

function buildRow(
    row: AccountTreatmentRow,
    indexes: Map<string, number>,
    closingPeriod: string,
    decision?: InflationOriginDecision,
    measurement?: ClosingMeasurement,
): InflationWorkPaperRow {
    const closingMeasurement = measurement?.closingAmount
    const measurementAtClose = measurement?.measuredAt.slice(0, 7) === closingPeriod
    const protectedAtClose = row.treatment === 'VALOR_CORRIENTE_AL_CIERRE'
        || decision?.closingValueProtected === true
        || measurementAtClose
    const sequence = row.measurementSequence
    const originsAreClosingValue = protectedAtClose && !sequence
    const origins = (sequence?.originPeriods ?? row.originPeriods).map(origin => {
        const originIndex = indexes.get(origin.period) ?? null
        const closingIndex = indexes.get(closingPeriod) ?? null
        const coefficient = originsAreClosingValue ? 1 : origin.coefficient
        const restatedAmount = originsAreClosingValue ? origin.historicAmount : origin.restatedAmount
        return {
            period: origin.period,
            historicAmount: origin.historicAmount,
            originIndex,
            closingIndex,
            coefficient,
            restatedAmount,
            formula: originsAreClosingValue
                ? 'Importe ya medido a la fecha de cierre × 1,00000000'
                : coefficient === null
                    ? `Índice ${closingPeriod} / índice ${origin.period} — pendiente`
                    : `${origin.historicAmount.toFixed(2)} × ${coefficient.toFixed(8)} = ${restatedAmount.toFixed(2)}`,
        }
    })
    const baseAmount = sequence?.previousHistoricAmount ?? row.historicAmount
    const inflationAdjustment = sequence?.inflationAdjustment
        ?? (protectedAtClose ? 0 : round2(row.adjustment))
    const measurementAdjustment = sequence?.measurementAdjustment
        ?? (measurement ? round2(measurement.closingAmount - measurement.previousAmount) : 0)
    const finalAmount = sequence?.closingAmount
        ?? (measurement ? round2(measurement.closingAmount) : round2(row.historicAmount + inflationAdjustment))
    const evidence = [...row.observations]
    if (measurement) evidence.push(`Medición ${measurement.id}: ${measurement.source}`)
    if (decision) evidence.push(`Origen revisado por ${decision.reviewedBy}: ${decision.rationale}`)
    if (protectedAtClose && (row.adjustment !== 0 || measurement)) {
        evidence.push('Guardia de doble ajuste aplicada: el valor de cierre conserva coeficiente 1.')
    }
    return {
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        rubro: row.rubro,
        classification: decision?.classification ?? row.monetaryCondition,
        treatment: row.treatment,
        baseAmount: round2(baseAmount),
        originMethod: decision?.originMethod ?? 'DERIVADO_LIBRO',
        origins,
        inflationAdjustment,
        closingMeasurement,
        measurementAdjustment,
        finalAmount,
        resultKind: row.participatesInRecpam ? 'RECPAM'
            : measurement?.recoverability?.impairmentLoss ? 'DETERIORO'
                : measurement ? 'RESULTADO_TENENCIA'
                    : row.treatment === 'REQUIERE_DECISION' ? 'REQUIERE_DECISION'
                        : 'SIN_RESULTADO_DIRECTO',
        status: row.status === 'BLOQUEADO' ? 'BLOQUEADO'
            : origins.some(origin => origin.coefficient === null && !originsAreClosingValue) ? 'BLOQUEADO'
                : protectedAtClose && row.adjustment !== 0 ? 'ADVERTENCIA' : 'OK',
        evidence,
        entryIds: row.entryIds,
        doubleAdjustmentPrevented: protectedAtClose,
    }
}

function nextMonth(period: string): string {
    const [year, month] = period.split('-').map(Number)
    const date = new Date(Date.UTC(year, month, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function sum(values: number[]): number {
    return values.reduce((total, value) => total + toCents(value), 0) / 100
}
