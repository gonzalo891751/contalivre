/**
 * RECPAM: determinación dual y conciliación — Fase 2I (§7).
 *
 * El RECPAM es el resultado de mantener partidas monetarias mientras cambia el
 * poder adquisitivo de la moneda. NO es la cifra que hace cuadrar el estado.
 * Para poder afirmarlo, se calcula de dos maneras independientes y se exige que
 * coincidan dentro de una tolerancia explícita y mínima:
 *
 *   A · SECUENCIAL — surge del proceso completo de expresión en moneda de
 *       cierre: resultado del ejercicio por diferencia patrimonial reexpresada,
 *       menos el resultado que aportan las cuentas de resultado reexpresadas.
 *
 *   B · ANALÍTICO — surge de la exposición: posición monetaria al inicio y
 *       flujos monetarios de cada mes, cada uno por el coeficiente que le
 *       corresponde desde su período hasta el cierre.
 *
 * Si difieren por encima de la tolerancia, la diferencia se EXPONE con las
 * cuentas y los períodos involucrados y bloquea la publicación. Nunca se
 * absorbe con un asiento balanceante.
 *
 * Convención de flujos: se los considera ocurridos al cierre de su mes, de modo
 * que un flujo del mes m queda expuesto desde el fin de m hasta el cierre. Es
 * la convención habitual de la RT 6 cuando no se dispone del detalle diario, y
 * se aplica igual en las dos determinaciones para que sean comparables.
 */

import { toCents } from '../../accounting/domain/money'
import { coefficientFor, type AccountTreatmentMatrix } from './accountTreatment'
import type { Account } from '../../core/models'

const fromCents = (c: number) => c / 100

/** Tolerancia de conciliación: un centavo por cuenta monetaria, mínimo $1 */
export const RECPAM_TOLERANCE_CENTS_PER_ACCOUNT = 1
export const RECPAM_MIN_TOLERANCE_CENTS = 100

export interface MonetaryPositionRow {
    /** YYYY-MM */
    period: string
    /** posición monetaria neta al inicio del mes (activos − pasivos), histórica */
    openingPosition: number
    /** flujo monetario neto del mes */
    netFlow: number
    /** posición al cierre del mes */
    closingPosition: number
    /** coef(mes → cierre) */
    coefficient: number | null
    /** efecto del flujo del mes sobre el RECPAM, en moneda de cierre */
    recpamContribution: number
}

export interface RecpamDetermination {
    /** RECPAM en moneda de cierre; negativo = pérdida por exposición */
    amount: number
    /** cómo se llegó al número, para el papel de trabajo */
    components: Array<{ label: string; amount: number; detail?: string }>
}

export interface RecpamReconciliation {
    sequential: RecpamDetermination
    analytic: RecpamDetermination
    difference: number
    toleranceCents: number
    reconciled: boolean
    /** posición monetaria mes a mes */
    monetaryEvolution: MonetaryPositionRow[]
    /** cuentas monetarias que integran la posición */
    monetaryAccounts: Array<{ code: string; name: string; balance: number }>
    blockers: string[]
}

export interface RecpamInput {
    matrix: AccountTreatmentMatrix
    accounts: Account[]
    indexes: Map<string, number>
    closePeriod: string
    openingPeriod: string
    /** meses del ejercicio en orden, YYYY-MM */
    periods: string[]
}

/**
 * Determinación ANALÍTICA: exposición de la posición monetaria.
 *
 * RECPAM = −[ P₀ × (coef₀ − 1) + Σ Fₘ × (coefₘ − 1) ]
 *
 * donde P₀ es la posición monetaria inicial anticuada al período de apertura y
 * Fₘ el flujo monetario neto del mes m. Un saldo monetario activo mantenido en
 * un contexto inflacionario produce pérdida; uno pasivo, ganancia.
 */
export function computeAnalyticRecpam(input: RecpamInput): {
    determination: RecpamDetermination
    evolution: MonetaryPositionRow[]
    missing: string[]
} {
    const { matrix, indexes, closePeriod, openingPeriod, periods } = input

    // Flujos monetarios netos por período, sumando todas las cuentas monetarias
    const flowByPeriod = new Map<string, number>()
    for (const row of matrix.rows) {
        if (!row.participatesInRecpam) continue
        for (const origin of row.originPeriods) {
            flowByPeriod.set(origin.period,
                (flowByPeriod.get(origin.period) ?? 0) + toCents(origin.historicAmount))
        }
    }

    const missing: string[] = []
    const evolution: MonetaryPositionRow[] = []

    const openingCents = flowByPeriod.get(openingPeriod) ?? 0
    const openingCoef = coefficientFor(indexes, openingPeriod, closePeriod)
    if (openingCoef === null && openingCents !== 0) missing.push(openingPeriod)

    let recpamCents = 0
    if (openingCents !== 0 && openingCoef !== null) {
        recpamCents -= Math.round(openingCents * (openingCoef - 1))
    }

    let position = openingCents
    evolution.push({
        period: openingPeriod,
        openingPosition: 0,
        netFlow: fromCents(openingCents),
        closingPosition: fromCents(openingCents),
        coefficient: openingCoef,
        recpamContribution: openingCoef === null ? 0 : fromCents(-Math.round(openingCents * (openingCoef - 1))),
    })

    for (const period of periods) {
        const flow = flowByPeriod.get(period) ?? 0
        const coef = coefficientFor(indexes, period, closePeriod)
        if (coef === null && flow !== 0) { missing.push(period); continue }
        const contribution = coef === null ? 0 : -Math.round(flow * (coef - 1))
        recpamCents += contribution
        evolution.push({
            period,
            openingPosition: fromCents(position),
            netFlow: fromCents(flow),
            closingPosition: fromCents(position + flow),
            coefficient: coef,
            recpamContribution: fromCents(contribution),
        })
        position += flow
    }

    return {
        determination: {
            amount: fromCents(recpamCents),
            components: evolution
                .filter(e => toCents(e.recpamContribution) !== 0)
                .map(e => ({
                    label: `Exposición del flujo monetario de ${e.period}`,
                    amount: e.recpamContribution,
                    detail: `Flujo ${e.netFlow.toFixed(2)} × (coeficiente ${e.coefficient?.toFixed(6) ?? '—'} − 1)`,
                })),
        },
        evolution,
        missing: Array.from(new Set(missing)),
    }
}

/**
 * Determinación SECUENCIAL: por diferencia patrimonial reexpresada.
 *
 * Resultado total en moneda de cierre
 *   = PN final reexpresado − PN inicial reexpresado − aportes + distribuciones
 * RECPAM = resultado total − resultado de las cuentas de resultado reexpresadas
 */
export function computeSequentialRecpam(input: RecpamInput): RecpamDetermination {
    const { matrix, accounts } = input
    const byId = new Map(accounts.map(a => [a.id, a]))

    let assetsCents = 0, liabilitiesCents = 0
    let equityContributedCents = 0, equityOtherCents = 0
    let resultCents = 0

    for (const row of matrix.rows) {
        const account = byId.get(row.accountId)
        if (!account) continue
        const restated = toCents(row.restatedAmount)
        switch (account.kind) {
            case 'ASSET': assetsCents += restated; break
            case 'LIABILITY': liabilitiesCents += -restated; break
            case 'EQUITY':
                // Los aportes y su ajuste no son resultado del ejercicio
                if (account.statementGroup === 'CAPITAL') equityContributedCents += -restated
                else equityOtherCents += -restated
                break
            case 'INCOME': resultCents += -restated; break
            case 'EXPENSE': resultCents += -restated; break
        }
    }

    // Patrimonio final reexpresado, medido por los activos y pasivos
    const equityFromAssetsCents = assetsCents - liabilitiesCents
    // Resultado total: lo que el patrimonio creció por encima de los aportes y
    // de los resultados acumulados anteriores
    const totalResultCents = equityFromAssetsCents - equityContributedCents - equityOtherCents
    const recpamCents = totalResultCents - resultCents

    return {
        amount: fromCents(recpamCents),
        components: [
            { label: 'Activos en moneda de cierre', amount: fromCents(assetsCents) },
            { label: 'Pasivos en moneda de cierre', amount: fromCents(-liabilitiesCents) },
            { label: 'Patrimonio neto final reexpresado', amount: fromCents(equityFromAssetsCents) },
            { label: 'Aportes de los propietarios reexpresados', amount: fromCents(-equityContributedCents) },
            { label: 'Resultados acumulados anteriores reexpresados', amount: fromCents(-equityOtherCents) },
            {
                label: 'Resultado del ejercicio por diferencia patrimonial',
                amount: fromCents(totalResultCents),
                detail: 'Patrimonio final − aportes − resultados acumulados anteriores',
            },
            {
                label: 'Resultado de las cuentas de resultado reexpresadas',
                amount: fromCents(resultCents),
                detail: 'Ingresos − gastos, cada uno anticuado a su período de origen',
            },
        ],
    }
}

/** Corre las dos determinaciones y las concilia */
export function reconcileRecpam(input: RecpamInput): RecpamReconciliation {
    const analytic = computeAnalyticRecpam(input)
    const sequential = computeSequentialRecpam(input)

    const monetaryAccounts = input.matrix.rows
        .filter(r => r.participatesInRecpam)
        .map(r => ({ code: r.code, name: r.name, balance: r.balance }))

    const toleranceCents = Math.max(
        RECPAM_MIN_TOLERANCE_CENTS,
        monetaryAccounts.length * RECPAM_TOLERANCE_CENTS_PER_ACCOUNT,
    )
    const differenceCents = toCents(sequential.amount) - toCents(analytic.determination.amount)
    const reconciled = Math.abs(differenceCents) <= toleranceCents

    const blockers: string[] = []
    if (analytic.missing.length > 0) {
        blockers.push(`Faltan índices para determinar el RECPAM en: ${analytic.missing.join(', ')}. Sin índice no se estima.`)
    }
    if (!input.matrix.complete) {
        blockers.push(`Hay ${input.matrix.coverage.pending.length} cuenta(s) sin tratamiento declarado: el RECPAM no puede darse por conciliado mientras existan.`)
    }
    if (!reconciled) {
        blockers.push(
            `El RECPAM secuencial (${sequential.amount.toFixed(2)}) y el analítico ` +
            `(${analytic.determination.amount.toFixed(2)}) difieren en ${fromCents(differenceCents).toFixed(2)}, ` +
            `por encima de la tolerancia de ${fromCents(toleranceCents).toFixed(2)}. ` +
            `Revisá la anticuación de las cuentas no monetarias y la clasificación monetaria antes de publicar.`
        )
    }

    return {
        sequential,
        analytic: analytic.determination,
        difference: fromCents(differenceCents),
        toleranceCents,
        reconciled: reconciled && analytic.missing.length === 0 && input.matrix.complete,
        monetaryEvolution: analytic.evolution,
        monetaryAccounts,
        blockers,
    }
}
