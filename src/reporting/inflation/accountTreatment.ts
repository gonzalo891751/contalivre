/**
 * Matriz universal de tratamiento de cuentas — Fase 2I (§2 y §6).
 *
 * Toma un ejercicio registrado y determina, para CADA cuenta con saldo o
 * movimiento, qué le corresponde a los efectos de la expresión en moneda de
 * cierre. El objetivo no es reexpresar: es poder demostrar que el 100 % de las
 * cuentas fue analizado. "No necesita reexpresión" es una conclusión, no una
 * omisión, y queda registrada como tal con su fundamento.
 *
 * La clasificación es ESTRUCTURAL: sale del tipo de cuenta, del rubro de
 * exposición, de la metadata de mapeo y del origen de los movimientos. Nunca
 * del nombre de la cuenta.
 *
 * Función pura: no lee la base ni el DOM, así que el mismo cálculo alimenta la
 * pantalla, las pruebas y los papeles de trabajo.
 */

import { toCents } from '../../accounting/domain/money'
import { deriveMonetaryClassification, isPostableAccount } from '../../accounting/taxonomy/taxonomy'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type { Account, JournalEntry } from '../../core/models'
import type { ClosingMeasurement } from '../measurement/measurementTypes'

const fromCents = (c: number) => c / 100

/** Qué hay que hacerle a la cuenta para llevarla a moneda de cierre */
export type InflationTreatment =
    /** Saldo monetario: ya está expresado en moneda de cierre; se expone al RECPAM */
    | 'MONETARIA_SIN_REEXPRESION'
    /** Partida no monetaria al costo: se anticua y se reexpresa por su origen */
    | 'REEXPRESION_POR_ANTICUACION'
    /** Medida a valor corriente del cierre: ya está en moneda de cierre */
    | 'VALOR_CORRIENTE_AL_CIERRE'
    /** Capital social: conserva su valor nominal legal; el ajuste va aparte */
    | 'CAPITAL_NOMINAL_LEGAL'
    /** Cuenta regularizadora: sigue el tratamiento de su partida principal */
    | 'SIGUE_A_LA_PARTIDA_PRINCIPAL'
    /** Falta una decisión explícita de política contable */
    | 'REQUIERE_DECISION'

export type TreatmentStatus = 'OK' | 'ADVERTENCIA' | 'BLOQUEADO'

export interface OriginPeriodRow {
    /** YYYY-MM del devengamiento o incorporación */
    period: string
    historicAmount: number
    coefficient: number | null
    restatedAmount: number
}

export interface AccountTreatmentRow {
    accountId: string
    code: string
    name: string
    /** Rubro de exposición (statementGroup) */
    rubro: string
    /** Naturaleza: ACTIVO / PASIVO / PN / INGRESO / GASTO */
    naturaleza: string
    balance: number
    monetaryCondition: 'MONETARY' | 'NON_MONETARY' | 'MIXED' | 'NOT_APPLICABLE'
    measurementCriterion: string
    treatment: InflationTreatment
    /** Anticuación: períodos de origen con su coeficiente */
    originPeriods: OriginPeriodRow[]
    /** Moneda en la que está expresado el saldo ANTES del ajuste */
    currencyBefore: 'MONEDA_DE_CIERRE' | 'MONEDA_DE_ORIGEN'
    historicAmount: number
    restatedAmount: number
    /**
     * restatedAmount − historicAmount. En el capital social es exactamente el
     * importe que se expone como Ajuste de capital.
     */
    adjustment: number
    /**
     * Importe con el que la cuenta se EXPONE en los estados. Coincide con el
     * reexpresado salvo en el capital social, que conserva su valor nominal
     * legal aunque se mida reexpresado para determinar el resultado.
     */
    presentationAmount: number
    /** Participa en la determinación analítica del RECPAM */
    participatesInRecpam: boolean
    status: TreatmentStatus
    observations: string[]
    /** Linaje: asientos que formaron el saldo */
    entryIds: string[]
    /** Secuencia base nominal -> base reexpresada -> medición de cierre. */
    measurementSequence?: {
        measurementId: string
        journalEntryId: string
        previousHistoricAmount: number
        previousRestatedAmount: number
        closingAmount: number
        inflationAdjustment: number
        measurementAdjustment: number
        originPeriods: OriginPeriodRow[]
    }
}

export interface CoverageReport {
    /** Cuentas imputables con saldo o movimiento en el ejercicio */
    accountsWithActivity: number
    /** Cuentas con un tratamiento resuelto (todo salvo REQUIERE_DECISION) */
    accountsResolved: number
    /** Porcentaje de cobertura sobre el total de cuentas con actividad */
    coveragePct: number
    /** Suma de |saldo| de las cuentas con actividad */
    absBalanceTotal: number
    /** Suma de |saldo| con tratamiento resuelto */
    absBalanceResolved: number
    /** Porcentaje de cobertura ponderado por saldo */
    balanceCoveragePct: number
    /** Cuentas que exigen una decisión de política contable */
    pending: Array<{ code: string; name: string; reason: string }>
    /** Períodos sin índice requeridos por alguna anticuación */
    missingPeriods: string[]
}

export interface AccountTreatmentMatrix {
    closePeriod: string
    rows: AccountTreatmentRow[]
    coverage: CoverageReport
    /** true cuando toda cuenta con actividad tiene tratamiento y no faltan índices */
    complete: boolean
}

export interface TreatmentInput {
    accounts: Account[]
    entries: JournalEntry[]
    openingBalances: Map<string, { debit: number; credit: number }>
    /** período YYYY-MM del cierre */
    closePeriod: string
    /** período YYYY-MM anterior al inicio del ejercicio (origen de la apertura) */
    openingPeriod: string
    indexes: Map<string, number>
    /** Mediciones contabilizadas que se aplican después de reexpresar la base. */
    closingMeasurements?: ClosingMeasurement[]
}

const NATURALEZA: Record<Account['kind'], string> = {
    ASSET: 'Activo', LIABILITY: 'Pasivo', EQUITY: 'Patrimonio neto',
    INCOME: 'Ingreso', EXPENSE: 'Gasto',
}

/** Mes anterior a un período YYYY-MM */
export function previousMonth(period: string): string {
    const [y, m] = period.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Meses inclusive entre dos períodos YYYY-MM */
export function monthsBetween(from: string, to: string): string[] {
    const out: string[] = []
    let [y, m] = from.split('-').map(Number)
    for (let guard = 0; guard < 600; guard++) {
        const period = `${y}-${String(m).padStart(2, '0')}`
        out.push(period)
        if (period === to) break
        m += 1
        if (m > 12) { m = 1; y += 1 }
    }
    return out
}

/** coef(origen → cierre) = índice de cierre / índice de origen */
export function coefficientFor(
    indexes: Map<string, number>, origin: string, close: string
): number | null {
    const io = indexes.get(origin)
    const ic = indexes.get(close)
    if (!io || !ic || io <= 0) return null
    return ic / io
}

/**
 * Criterio de medición declarado para la cuenta.
 *
 * Se apoya en la metadata: una cuenta medida a valor corriente del cierre ya
 * está expresada en moneda de cierre y NO vuelve a multiplicarse por un
 * coeficiente (§6.4). Sin declaración explícita se asume costo histórico, que
 * es el criterio residual de la RT 54 para las partidas no monetarias.
 */
export function measurementCriterionOf(account: Account): 'COSTO_HISTORICO' | 'VALOR_CORRIENTE_CIERRE' | 'NOMINAL' {
    const tags = account.tags ?? []
    if (tags.includes('medicion:valor-corriente')) return 'VALOR_CORRIENTE_CIERRE'
    if (account.kind === 'EQUITY' && account.statementGroup === 'CAPITAL') return 'NOMINAL'
    if (account.kind === 'ASSET' || account.kind === 'LIABILITY') {
        const monetary = deriveMonetaryClassification(account)
        if (monetary === 'MONETARY') return 'NOMINAL'
    }
    return 'COSTO_HISTORICO'
}

/** ¿Es la cuenta de ajuste del capital? (recibe el ajuste, no se reexpresa) */
export function isCapitalAdjustmentAccount(account: Account): boolean {
    return account.equityComponent === 'CAPITAL_ADJUSTMENT'
        || (account.statementGroup === 'CAPITAL' && (account.tags ?? []).includes('capital:ajuste'))
}

export function buildAccountTreatmentMatrix(input: TreatmentInput): AccountTreatmentMatrix {
    const { accounts, closePeriod, openingPeriod, indexes } = input
    const byId = new Map(accounts.map(a => [a.id, a]))

    // ── Movimientos por cuenta y por período de origen ───────
    const movementsByAccount = new Map<string, Map<string, number>>()   // accountId → period → cents
    const entriesByAccount = new Map<string, Set<string>>()
    const movementDetailsByAccount = new Map<string, Array<{ period: string; cents: number; entryId?: string }>>()
    const balanceCents = new Map<string, number>()

    const addMovement = (accountId: string, period: string, cents: number, entryId?: string) => {
        if (cents === 0) return
        let byPeriod = movementsByAccount.get(accountId)
        if (!byPeriod) { byPeriod = new Map(); movementsByAccount.set(accountId, byPeriod) }
        byPeriod.set(period, (byPeriod.get(period) ?? 0) + cents)
        const details = movementDetailsByAccount.get(accountId) ?? []
        details.push({ period, cents, entryId })
        movementDetailsByAccount.set(accountId, details)
        balanceCents.set(accountId, (balanceCents.get(accountId) ?? 0) + cents)
        if (entryId) {
            let ids = entriesByAccount.get(accountId)
            if (!ids) { ids = new Set(); entriesByAccount.set(accountId, ids) }
            ids.add(entryId)
        }
    }

    // La apertura se anticua al período anterior al inicio del ejercicio
    for (const [accountId, ob] of input.openingBalances) {
        addMovement(accountId, openingPeriod, toCents(ob.debit || 0) - toCents(ob.credit || 0))
    }
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        // La refundición no es un hecho económico: no aporta anticuación
        if (isStructuralClosingEntry(entry)) continue
        const period = entry.sourceModule === 'closing' && entry.sourceType === 'apertura'
            ? openingPeriod
            : entry.date.slice(0, 7)
        for (const l of entry.lines) {
            addMovement(l.accountId, period, toCents(l.debit || 0) - toCents(l.credit || 0), entry.id)
        }
    }

    const measurementsByAccount = new Map<string, ClosingMeasurement>()
    for (const measurement of input.closingMeasurements ?? []) {
        if (measurement.status !== 'CONTABILIZADA' || !measurement.journalEntryId) continue
        const current = measurementsByAccount.get(measurement.accountId)
        if (!current || current.updatedAt < measurement.updatedAt) {
            measurementsByAccount.set(measurement.accountId, measurement)
        }
    }
    const resultRestatementAdjustments = new Map<string, number>()

    const missingPeriods = new Set<string>()
    const rows: AccountTreatmentRow[] = []

    for (const [accountId, byPeriod] of movementsByAccount) {
        const account = byId.get(accountId)
        const balance = fromCents(balanceCents.get(accountId) ?? 0)
        const entryIds = Array.from(entriesByAccount.get(accountId) ?? [])

        if (!account) {
            rows.push({
                accountId, code: '(inexistente)', name: `Cuenta inexistente ${accountId}`,
                rubro: '—', naturaleza: '—', balance,
                monetaryCondition: 'NOT_APPLICABLE', measurementCriterion: '—',
                treatment: 'REQUIERE_DECISION', originPeriods: [],
                currencyBefore: 'MONEDA_DE_ORIGEN',
                historicAmount: balance, restatedAmount: balance, adjustment: 0,
                presentationAmount: balance,
                participatesInRecpam: false, status: 'BLOQUEADO',
                observations: ['Hay movimientos imputados a una cuenta que no existe en el plan.'],
                entryIds,
            })
            continue
        }

        const monetary = deriveMonetaryClassification(account)
        const criterion = measurementCriterionOf(account)
        const observations: string[] = []
        let treatment: InflationTreatment
        let status: TreatmentStatus = 'OK'
        let participatesInRecpam = false
        let currencyBefore: AccountTreatmentRow['currencyBefore'] = 'MONEDA_DE_ORIGEN'

        if (monetary === 'MONETARY') {
            treatment = 'MONETARIA_SIN_REEXPRESION'
            currencyBefore = 'MONEDA_DE_CIERRE'
            participatesInRecpam = true
            observations.push('Su importe nominal ya está expresado en moneda de cierre; su tenencia genera RECPAM.')
        } else if (account.kind === 'EQUITY' && account.statementGroup === 'CAPITAL' && !isCapitalAdjustmentAccount(account)) {
            // El capital se ANTICUA como cualquier partida no monetaria: en
            // moneda de cierre un aporte de enero vale más que su valor nominal,
            // y esa medición es la que determina el resultado del ejercicio por
            // diferencia patrimonial. Lo que no cambia es su EXPOSICIÓN: el
            // Estado de Situación Patrimonial conserva el valor nominal legal y
            // la diferencia se muestra por separado como Ajuste de capital.
            treatment = 'CAPITAL_NOMINAL_LEGAL'
            observations.push('Se anticua por la fecha de cada aporte para medir el patrimonio en moneda de cierre.')
            observations.push('En la exposición conserva su valor nominal legal: la diferencia se presenta en Ajuste de capital.')
        } else if (isCapitalAdjustmentAccount(account)) {
            treatment = 'SIGUE_A_LA_PARTIDA_PRINCIPAL'
            currencyBefore = 'MONEDA_DE_CIERRE'
            observations.push('Recibe el ajuste por reexpresión del capital: no se anticua por sí misma.')
        } else if (criterion === 'VALOR_CORRIENTE_CIERRE') {
            treatment = 'VALOR_CORRIENTE_AL_CIERRE'
            currencyBefore = 'MONEDA_DE_CIERRE'
            observations.push('Medida a valor corriente del cierre: ya está en moneda de cierre y no vuelve a multiplicarse por un coeficiente.')
        } else if (monetary === 'NON_MONETARY') {
            treatment = 'REEXPRESION_POR_ANTICUACION'
            observations.push(account.isContra
                ? 'Regularizadora no monetaria: se anticua con el mismo criterio que la partida que regulariza.'
                : 'Partida no monetaria al costo: se anticua por el período de origen de cada movimiento.')
        } else {
            treatment = 'REQUIERE_DECISION'
            status = 'BLOQUEADO'
            observations.push(monetary === 'MIXED'
                ? 'El rubro admite instrumentos monetarios y no monetarios: declarar la condición de esta cuenta en Plan de cuentas y mapeos.'
                : 'La cuenta no tiene condición monetaria declarada ni rubro que permita derivarla.')
        }

        if (!isPostableAccount(account)) {
            observations.push('Cuenta agrupadora con movimientos: revisá la imputación.')
            status = 'BLOQUEADO'
        }

        // ── Anticuación ──────────────────────────────────────
        const originPeriods: OriginPeriodRow[] = []
        let restatedCents = 0
        const needsRestating = treatment === 'REEXPRESION_POR_ANTICUACION'
            || treatment === 'CAPITAL_NOMINAL_LEGAL'

        // Los períodos con movimiento neto CERO también se listan: son evidencia
        // de que el período fue examinado. Una cuenta cuyos movimientos se
        // compensan dentro del mes —una amortización acumulada que se constituye
        // y se da de baja con la venta del bien— fue analizada igual, y quedaba
        // fuera del recuento de cobertura.
        for (const [period, cents] of Array.from(byPeriod.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
            const coef = needsRestating ? coefficientFor(indexes, period, closePeriod) : 1
            if (cents === 0) {
                originPeriods.push({ period, historicAmount: 0, coefficient: needsRestating ? coef : null, restatedAmount: 0 })
                continue
            }
            if (needsRestating && coef === null) {
                missingPeriods.add(period)
                status = 'BLOQUEADO'
                observations.push(`Falta el índice de ${period}: sin él no se reexpresa (jamás se interpola).`)
            }
            const applied = coef ?? 1
            const restated = Math.round(cents * applied)
            restatedCents += restated
            originPeriods.push({
                period,
                historicAmount: fromCents(cents),
                coefficient: needsRestating ? coef : null,
                restatedAmount: fromCents(restated),
            })
        }

        const historicAmount = balance
        let restatedAmount = needsRestating ? fromCents(restatedCents) : balance
        let measurementSequence: AccountTreatmentRow['measurementSequence']
        const measurement = measurementsByAccount.get(accountId)

        if (measurement?.journalEntryId) {
            const details = movementDetailsByAccount.get(accountId) ?? []
            const beforeMeasurement = details.filter(detail => detail.entryId !== measurement.journalEntryId)
            const measurementMovementCents = details
                .filter(detail => detail.entryId === measurement.journalEntryId)
                .reduce((total, detail) => total + detail.cents, 0)
            const beforeByPeriod = new Map<string, number>()
            for (const detail of beforeMeasurement) {
                beforeByPeriod.set(detail.period, (beforeByPeriod.get(detail.period) ?? 0) + detail.cents)
            }

            const sequenceOrigins: OriginPeriodRow[] = []
            let beforeHistoricCents = 0
            let beforeRestatedCents = 0
            for (const [period, cents] of Array.from(beforeByPeriod.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
                beforeHistoricCents += cents
                const coefficient = measurement.previousIsRestated ? 1 : coefficientFor(indexes, period, closePeriod)
                if (coefficient === null) {
                    missingPeriods.add(period)
                    status = 'BLOQUEADO'
                    observations.push(`Falta el índice de ${period} para reexpresar la base previa a la medición ${measurement.id}.`)
                }
                const restated = Math.round(cents * (coefficient ?? 1))
                beforeRestatedCents += restated
                sequenceOrigins.push({
                    period,
                    historicAmount: fromCents(cents),
                    coefficient,
                    restatedAmount: fromCents(restated),
                })
            }

            const naturalSign = (measurement.normalSide ?? account.normalSide) === 'CREDIT' ? -1 : 1
            const declaredPreviousCents = naturalSign * toCents(measurement.previousAmount)
            if (measurement.previousIsRestated) beforeRestatedCents = declaredPreviousCents
            const closingCents = naturalSign * toCents(measurement.closingAmount)

            if (Math.abs(beforeHistoricCents - declaredPreviousCents) > 1 && !measurement.previousIsRestated) {
                status = status === 'BLOQUEADO' ? status : 'ADVERTENCIA'
                observations.push(
                    `La base nominal declarada en ${measurement.id} (${fromCents(declaredPreviousCents).toFixed(2)}) ` +
                    `no coincide con los movimientos previos (${fromCents(beforeHistoricCents).toFixed(2)}).`,
                )
            }
            if (Math.abs(toCents(balance) - closingCents) > 1) {
                status = 'BLOQUEADO'
                observations.push(
                    `La medición ${measurement.id} quedó contabilizada, pero el saldo del libro ` +
                    `(${balance.toFixed(2)}) no coincide con su valor de cierre (${fromCents(closingCents).toFixed(2)}).`,
                )
            }

            const economicMeasurementCents = closingCents - beforeRestatedCents
            if (measurement.holdingResultAccountId && byId.has(measurement.holdingResultAccountId)) {
                const resultDeltaCents = measurementMovementCents - economicMeasurementCents
                resultRestatementAdjustments.set(
                    measurement.holdingResultAccountId,
                    (resultRestatementAdjustments.get(measurement.holdingResultAccountId) ?? 0) + resultDeltaCents,
                )
            } else {
                status = 'BLOQUEADO'
                observations.push(`La medición ${measurement.id} no identifica la cuenta de resultado de contrapartida.`)
            }

            restatedAmount = fromCents(closingCents)
            measurementSequence = {
                measurementId: measurement.id,
                journalEntryId: measurement.journalEntryId,
                previousHistoricAmount: fromCents(beforeHistoricCents),
                previousRestatedAmount: fromCents(beforeRestatedCents),
                closingAmount: fromCents(closingCents),
                inflationAdjustment: fromCents(beforeRestatedCents - beforeHistoricCents),
                measurementAdjustment: fromCents(economicMeasurementCents),
                originPeriods: sequenceOrigins,
            }
            observations.push(
                `Secuencia aplicada: base ${fromCents(beforeHistoricCents).toFixed(2)} -> ` +
                `reexpresada ${fromCents(beforeRestatedCents).toFixed(2)} -> ` +
                `medición ${fromCents(closingCents).toFixed(2)}.`,
            )
        }

        rows.push({
            accountId, code: account.code, name: account.name,
            rubro: account.statementGroup ?? account.group ?? '—',
            naturaleza: NATURALEZA[account.kind] ?? account.kind,
            balance,
            monetaryCondition: monetary,
            measurementCriterion: criterion,
            treatment, originPeriods, currencyBefore,
            historicAmount, restatedAmount,
            adjustment: fromCents(toCents(restatedAmount) - toCents(historicAmount)),
            presentationAmount: treatment === 'CAPITAL_NOMINAL_LEGAL' ? historicAmount : restatedAmount,
            participatesInRecpam,
            status,
            observations,
            entryIds,
            measurementSequence,
        })
    }

    for (const [resultAccountId, adjustmentCents] of resultRestatementAdjustments) {
        const resultRow = rows.find(row => row.accountId === resultAccountId)
        if (!resultRow) {
            continue
        }
        resultRow.restatedAmount = fromCents(toCents(resultRow.restatedAmount) + adjustmentCents)
        resultRow.adjustment = fromCents(toCents(resultRow.restatedAmount) - toCents(resultRow.historicAmount))
        resultRow.presentationAmount = resultRow.restatedAmount
        resultRow.observations.push(
            `Resultado recalculado contra la base reexpresada de las mediciones: ajuste ${fromCents(adjustmentCents).toFixed(2)}.`,
        )
    }

    rows.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))

    // ── Cobertura ────────────────────────────────────────────
    const withActivity = rows.filter(r => toCents(r.balance) !== 0 || r.originPeriods.length > 0)
    const resolved = withActivity.filter(r => r.treatment !== 'REQUIERE_DECISION')
    const absTotal = withActivity.reduce((s, r) => s + Math.abs(toCents(r.balance)), 0)
    const absResolved = resolved.reduce((s, r) => s + Math.abs(toCents(r.balance)), 0)

    const coverage: CoverageReport = {
        accountsWithActivity: withActivity.length,
        accountsResolved: resolved.length,
        coveragePct: withActivity.length === 0 ? 100 : (resolved.length / withActivity.length) * 100,
        absBalanceTotal: fromCents(absTotal),
        absBalanceResolved: fromCents(absResolved),
        balanceCoveragePct: absTotal === 0 ? 100 : (absResolved / absTotal) * 100,
        pending: withActivity
            .filter(r => r.treatment === 'REQUIERE_DECISION')
            .map(r => ({ code: r.code, name: r.name, reason: r.observations[0] ?? 'Sin tratamiento determinado' })),
        missingPeriods: Array.from(missingPeriods).sort(),
    }

    return {
        closePeriod,
        rows,
        coverage,
        complete: coverage.pending.length === 0 && coverage.missingPeriods.length === 0,
    }
}
