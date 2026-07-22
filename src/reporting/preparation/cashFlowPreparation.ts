/**
 * CashFlowPreparationModel — Fase 2G §7.
 *
 * DTO inmutable y serializable con TODA la evidencia del papel de trabajo del
 * EFE: identidad, puente del efectivo, filas matriciales, imputaciones con
 * fórmula/operandos/lineage, puentes devengado→percibido y controles exactos en
 * centavos. Se emite junto a los estados (alternativa B de la auditoría) desde
 * el motor canónico: la UI y el export del papel de trabajo lo CONSUMEN; nunca
 * recalculan.
 *
 * Principio de reconciliación de la matriz: para cada cuenta NO efectivo, su
 * variación matricial (cierre − inicio, Debe−Haber) es su propia imputación a
 * una causa/actividad ⇒ control por fila = 0 por construcción. La suma de
 * variaciones de todas las cuentas = 0 (el balance cierra), de modo que la
 * variación del efectivo queda explicada por −Σ(variaciones no efectivo). La
 * exposición económica de cada actividad es el signo invertido de su columna.
 */

import type { Account } from '../../core/models'
import { toCents } from '../../accounting/domain/money'
import { ACCOUNTING_ENGINE_VERSION, NORMATIVE_BASELINE } from '../../accounting/migration/versions'
import { CASH_FLOW_POLICY_VERSION } from '../policy/cashFlowPolicy'
import { flowBucket, isCashAccount } from '../engine/buildCashFlow'
import type { CashFlowsResult } from '../engine/buildCashFlow'
import type { RestatedCashFlow } from '../engine/cashFlowInflation'
import { getCoefficient } from '../../accounting/inflation/engine'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type { ReportingInput, StatementsBundle, TrialBalanceRow2B } from '../domain/types'

const fromCents = (c: number) => c / 100

/** Versión del algoritmo de preparación (incluye la reexpresión por contribución de 2G.1). */
export const PREPARATION_ALGORITHM_VERSION = '2G.1'

export type PrepActivity = 'OPERATING' | 'INVESTING' | 'FINANCING' | 'UNCLASSIFIED'
/** NOMINAL = moneda nominal; CLOSING_CURRENCY = moneda de cierre (reexpresada). */
export type PrepExpression = 'NOMINAL' | 'CLOSING_CURRENCY'

/** Cobertura del set de índices para la preparación reexpresada. */
export type PrepCoverage = 'COVERED' | 'PARTIAL' | 'MISSING'

export interface PreparationIdentity {
    companyId: string
    exerciseId: string
    exerciseLabel: string
    closeDate: string
    /** período de cierre YYYY-MM (destino de la reexpresión) */
    closePeriod: string
    expression: PrepExpression
    currency: string
    normativeVersion: string
    engineVersion: string
    /** versión del algoritmo de preparación reexpresada */
    algorithmVersion: string
    policyVersion: number
    mappingsHash: string
    indexSetId: string | null
    indexSetHash: string | null
    contentHash: string
    /** estado de cobertura de índices (NOMINAL siempre COVERED) */
    coverage: PrepCoverage
    /** blockers de la preparación (faltan índices, sin clasificar, disposición no resuelta) */
    blockers: string[]
    generatedAt: string
}

/**
 * Evidencia de UNA contribución reexpresada (§3): conserva el nominal, la fecha/
 * período de origen, los índices, el coeficiente, el importe reexpresado antes y
 * después de redondeo y la diferencia de redondeo, además del lineage exacto
 * (asiento, línea, cuenta) y su clasificación/actividad/fórmula/control.
 */
export interface PrepContribution {
    id: string
    accountId: string
    code: string
    name: string
    entryId: string
    lineIndex: number
    /** importe con signo técnico Debe−Haber en centavos (nominal) */
    amountNominalCents: number
    originDate: string
    originPeriod: string
    /** índice del período de origen; null si falta en el set */
    originIndex: number | null
    /** índice del período de cierre; null si falta */
    closeIndex: number | null
    /** coeficiente cierre/origen; null si falta algún índice */
    coefficient: number | null
    /** nominal × coeficiente antes de redondear (unidades) */
    restatedRawCents: number
    /** reexpresado redondeado a centavos */
    restatedCents: number
    /** diferencia de redondeo = restatedCents − restatedRaw */
    roundingDiffCents: number
    activity: PrepActivity
    causeLabel: string
    rule: string
    classification: 'AUTO' | 'MANUAL'
    formula: string
    /** true si el período carece de índice (contribución bloqueada) */
    blocked: boolean
    control: number
}

export interface CashComponent {
    accountId: string
    code: string
    name: string
    openingCents: number
    closingCents: number
}

export interface CashBridge {
    /** efectivo inicial publicado */
    openingPublishedCents: number
    /** modificaciones de ejercicios anteriores (AREA); 0 si no hay */
    priorAdjustmentsCents: number
    /** efectivo inicial modificado = publicado + modificaciones */
    openingAdjustedCents: number
    closingCents: number
    netChangeCents: number
    components: CashComponent[]
    /** conciliación con el ESP: efectivo del TB al cierre */
    espClosingCents: number
    reconciledWithEsp: boolean
    // ── Campos de reexpresión (sólo en preparación CLOSING_CURRENCY) ──
    /** efectivo inicial reexpresado (coef inicio→cierre) */
    openingRestatedCents?: number
    /** modificaciones de apertura reexpresadas */
    priorAdjustmentsRestatedCents?: number
    /** efectivo inicial modificado reexpresado */
    openingAdjustedRestatedCents?: number
    /** Σ flujos reexpresados (sin REI) */
    flowsRestatedCents?: number
    /** Resultado por exposición a la inflación del efectivo (REI) — conciliación, no flujo */
    reiCents?: number
}

export interface PrepImputation {
    id: string
    method: 'DIRECT' | 'INDIRECT'
    activity: PrepActivity
    /** etiqueta de la causa/columna */
    causeLabel: string
    /** importe con signo técnico (Debe−Haber matricial o Haber−Debe de caja) */
    amountCents: number
    /** interpretación económica (entrada/salida, origen/aplicación) */
    economicCents: number
    formula: string
    operands: Record<string, number>
    /** regla de clasificación aplicada (bucket) */
    rule: string
    accountId: string
    /** asientos y líneas que forman el importe (lineage) */
    entryIds: string[]
    classification: 'AUTO' | 'MANUAL'
    control: number
}

export interface PrepMatrixRow {
    id: string
    accountId: string
    code: string
    name: string
    nature: Account['kind']
    activity: PrepActivity
    causeLabel: string
    openingCents: number
    closingCents: number
    /** variación técnica (matricial Debe−Haber) */
    variationCents: number
    /** variación con interpretación económica (signo invertido para exponer) */
    economicVariationCents: number
    direction: 'INCREASE' | 'DECREASE' | 'NONE'
    originApplication: 'ORIGIN' | 'APPLICATION' | 'NONE'
    imputedCents: number
    /** control por fila = variación − total imputado (0 = conciliado) */
    control: number
    state: 'RECONCILED' | 'WARNING' | 'BLOCKED' | 'NO_MOVEMENT'
    entryIds: string[]
    // ── Reexpresión (sólo CLOSING_CURRENCY): variación reexpresada por contribución ──
    /** variación NOMINAL (matricial Debe−Haber) — referencia del detalle reexpresado */
    nominalVariationCents?: number
    /** cantidad de contribuciones reexpresadas que forman la fila */
    contributionCount?: number
    /** true si alguna contribución de la fila carece de índice */
    blockedByMissingIndex?: boolean
}

export interface PrepBridge {
    id: string
    label: string
    formula: string
    operands: { label: string; amountCents: number; sign: 1 | -1 }[]
    resultCents: number
    /** total del método directo con el que debe conciliar */
    expectedCents: number
    /** residual = result − expected (0 = conciliado) */
    residualCents: number
    reconciled: boolean
}

export interface PrepColumnControl {
    activity: PrepActivity
    technicalCents: number
    economicCents: number
}

export interface PrepControls {
    /** filas con control ≠ 0 */
    rowsWithDifference: number
    columns: PrepColumnControl[]
    /** Σ variaciones no efectivo + variación efectivo = 0 */
    totalControlCents: number
    /** directo = indirecto en operativo */
    methodControlCents: number
    /** efectivo inicial + variación = efectivo final */
    cashControlCents: number
    /** efectivo del EFE = efectivo del ESP */
    espControlCents: number
    /** todos los controles en cero */
    allReconciled: boolean
}

export interface CashFlowPreparationModel {
    identity: PreparationIdentity
    cashBridge: CashBridge
    matrixRows: PrepMatrixRow[]
    imputations: PrepImputation[]
    bridges: PrepBridge[]
    controls: PrepControls
    /** actividades presentes, para columnas dinámicas de la UI */
    activities: PrepActivity[]
    /**
     * Evidencia por contribución reexpresada (§3). Sólo en CLOSING_CURRENCY; se
     * agrega por cuenta para la matriz (una fila/imputación por cuenta) y se
     * retiene aquí para el detalle de celda y la hoja "Reexpresión" del papel de
     * trabajo. NO se vuelca completa al DOM (performance §11).
     */
    contributions?: PrepContribution[]
}

function hashString(s: string): string {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(16)
}

function causeFor(account: Account | undefined, bucket: string): { activity: PrepActivity; label: string } {
    if (bucket === 'RESULT') return { activity: 'OPERATING', label: 'Resultado del ejercicio' }
    if (bucket === 'WC_ASSET') {
        const g = account?.statementGroup
        if (g === 'INVENTORIES') return { activity: 'OPERATING', label: 'Bienes de cambio' }
        return { activity: 'OPERATING', label: 'Créditos y otros activos operativos' }
    }
    if (bucket === 'WC_LIAB') return { activity: 'OPERATING', label: 'Deudas comerciales y otros pasivos operativos' }
    if (bucket === 'INVESTING') return { activity: 'INVESTING', label: 'Bienes de uso, intangibles e inversiones' }
    if (bucket === 'FINANCING') return { activity: 'FINANCING', label: 'Aportes, préstamos y financiación' }
    return { activity: 'UNCLASSIFIED', label: 'Sin clasificación (regularizar)' }
}

function sumGroup(rows: TrialBalanceRow2B[], byId: Map<string, Account>, groups: string[]): number {
    let cents = 0
    for (const r of rows) {
        const g = byId.get(r.accountId)?.statementGroup
        if (g && groups.includes(g)) cents += toCents(r.closing) - toCents(r.opening)
    }
    return cents
}

/**
 * Construye el modelo de preparación NOMINAL desde el mismo input/estados que el
 * EFE. `cashFlows` provee los totales de referencia para los controles de método.
 */
export function buildCashFlowPreparation(
    input: ReportingInput,
    statements: StatementsBundle,
    cashFlows: CashFlowsResult,
): CashFlowPreparationModel {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const rows = statements.trialBalance.rows

    // ── Puente del efectivo ──────────────────────────────────
    const openingCash = toCents(cashFlows.direct.openingCash.amount)
    const priorAdjustments = toCents(cashFlows.direct.priorAdjustments?.amount ?? 0)
    const openingAdjusted = openingCash + priorAdjustments
    const closingCash = toCents(cashFlows.direct.closingCash.amount)
    const netChange = toCents(cashFlows.direct.netChange.amount)
    let espClosing = 0
    const components: CashComponent[] = []
    for (const r of rows) {
        if (!isCashAccount(byId.get(r.accountId))) continue
        espClosing += toCents(r.closing)
        components.push({
            accountId: r.accountId, code: r.code, name: r.name,
            openingCents: toCents(r.opening), closingCents: toCents(r.closing),
        })
    }

    // ── Filas matriciales + imputaciones (base indirecta reconciliable) ──
    const matrixRows: PrepMatrixRow[] = []
    const imputations: PrepImputation[] = []
    const columnTech = new Map<PrepActivity, number>()
    let nonCashVariationCents = 0

    for (const r of rows) {
        const account = byId.get(r.accountId)
        if (isCashAccount(account)) continue
        const opening = toCents(r.opening)
        const closing = toCents(r.closing)
        const variation = closing - opening
        const bucket = flowBucket(account)
        const { activity, label } = causeFor(account, bucket)
        const economic = -variation
        if (variation !== 0) {
            nonCashVariationCents += variation
            columnTech.set(activity, (columnTech.get(activity) ?? 0) + variation)
            imputations.push({
                id: `prep:imp:${r.accountId}`,
                method: 'INDIRECT',
                activity,
                causeLabel: label,
                amountCents: variation,
                economicCents: economic,
                formula: 'saldo final − saldo inicial',
                operands: { saldoFinal: fromCents(closing), saldoInicial: fromCents(opening) },
                rule: bucket,
                accountId: r.accountId,
                entryIds: r.entryIds,
                classification: 'AUTO',
                control: 0,
            })
        }
        matrixRows.push({
            id: `prep:row:${r.accountId}`,
            accountId: r.accountId, code: r.code, name: r.name, nature: r.kind,
            activity, causeLabel: label,
            openingCents: opening, closingCents: closing,
            variationCents: variation, economicVariationCents: economic,
            direction: variation > 0 ? 'INCREASE' : variation < 0 ? 'DECREASE' : 'NONE',
            originApplication: economic > 0 ? 'ORIGIN' : economic < 0 ? 'APPLICATION' : 'NONE',
            imputedCents: variation, // una imputación = la variación ⇒ control 0
            control: 0,
            state: variation === 0 ? 'NO_MOVEMENT' : bucket === 'UNCLASSIFIED' ? 'BLOCKED' : 'RECONCILED',
            entryIds: r.entryIds,
        })
    }

    // ── Controles ────────────────────────────────────────────
    const activities: PrepActivity[] = ['OPERATING', 'INVESTING', 'FINANCING', 'UNCLASSIFIED']
    const columns: PrepColumnControl[] = activities
        .filter(a => columnTech.has(a))
        .map(a => ({ activity: a, technicalCents: columnTech.get(a) ?? 0, economicCents: -(columnTech.get(a) ?? 0) }))
    // Identidad completa del balance: Σ variaciones no efectivo + variación del
    // efectivo (flujos + modificación de apertura) = 0.
    const totalControl = nonCashVariationCents + netChange + priorAdjustments
    const methodControl = toCents(cashFlows.direct.operating.amount) - toCents(cashFlows.indirect.operating.amount)
    const cashControl = (openingAdjusted + netChange) - closingCash
    const espControl = espClosing - closingCash
    const rowsWithDifference = matrixRows.filter(r => r.control !== 0).length
    const allReconciled = totalControl === 0 && methodControl === 0 && cashControl === 0 && espControl === 0 && rowsWithDifference === 0

    // ── Puentes devengado → percibido (sólo si son demostrables) ──
    const bridges: PrepBridge[] = []
    const salesCents = toCents(Math.abs(statements.incomeStatement.sales.amount))
    const cogsCents = toCents(Math.abs(statements.incomeStatement.costOfSales.amount))
    const deltaReceivables = sumGroup(rows, byId, ['TRADE_RECEIVABLES'])
    const deltaInventory = sumGroup(rows, byId, ['INVENTORIES'])
    const deltaPayables = -sumGroup(rows, byId, ['TRADE_PAYABLES']) // crédito-positivo

    const directOp = cashFlows.direct.operating.children ?? []
    const cobrosExpected = toCents(directOp.find(c => c.label === 'Cobros de clientes')?.amount ?? 0)
    const pagosExpected = -toCents(directOp.find(c => c.label === 'Pagos a proveedores de bienes y servicios')?.amount ?? 0)

    if (salesCents !== 0 || deltaReceivables !== 0) {
        const cobros = salesCents - deltaReceivables
        bridges.push({
            id: 'prep:bridge:cobros',
            label: 'Ventas devengadas → Cobros de clientes',
            formula: 'ventas − aumento de créditos',
            operands: [
                { label: 'Ventas devengadas', amountCents: salesCents, sign: 1 },
                { label: 'Aumento de créditos', amountCents: deltaReceivables, sign: -1 },
            ],
            resultCents: cobros,
            expectedCents: cobrosExpected,
            residualCents: cobrosExpected !== 0 ? cobros - cobrosExpected : 0,
            reconciled: cobrosExpected === 0 || cobros === cobrosExpected,
        })
    }
    if (cogsCents !== 0 || deltaInventory !== 0) {
        const compras = cogsCents + deltaInventory
        bridges.push({
            id: 'prep:bridge:compras',
            label: 'Costo de ventas → Compras',
            formula: 'CMV + existencia final − existencia inicial',
            operands: [
                { label: 'Costo de mercaderías vendidas', amountCents: cogsCents, sign: 1 },
                { label: 'Aumento de bienes de cambio', amountCents: deltaInventory, sign: 1 },
            ],
            resultCents: compras,
            expectedCents: compras,
            residualCents: 0,
            reconciled: true,
        })
        const compras2 = cogsCents + deltaInventory
        const pagos = compras2 - deltaPayables
        bridges.push({
            id: 'prep:bridge:pagos',
            label: 'Compras → Pagos a proveedores',
            formula: 'compras − aumento de deudas comerciales',
            operands: [
                { label: 'Compras', amountCents: compras2, sign: 1 },
                { label: 'Aumento de deudas comerciales', amountCents: deltaPayables, sign: -1 },
            ],
            resultCents: pagos,
            expectedCents: pagosExpected,
            residualCents: pagosExpected !== 0 ? pagos - pagosExpected : 0,
            reconciled: pagosExpected === 0 || pagos === pagosExpected,
        })
    }

    // ── Identidad + hash de contenido ────────────────────────
    const mappingsHash = hashString(JSON.stringify(input.accounts.map(a => [a.id, a.statementGroup, a.cashFlowCategory])))
    const contentHash = hashString(JSON.stringify({
        ctx: input.context,
        rows: rows.map(r => [r.accountId, r.opening, r.closing]),
        net: statements.incomeStatement.netIncome.amount,
        opCents: cashFlows.direct.operating.amount,
        invCents: cashFlows.direct.investing.amount,
        finCents: cashFlows.direct.financing.amount,
        mappingsHash,
    }))

    const nominalBlockers: string[] = []
    if (matrixRows.some(r => r.state === 'BLOCKED')) {
        nominalBlockers.push('Hay cuentas con movimiento sin clasificación EFE: regularizar antes de publicar.')
    }

    const identity: PreparationIdentity = {
        companyId: input.context.companyId,
        exerciseId: input.context.exerciseId,
        exerciseLabel: input.context.exerciseLabel,
        closeDate: input.context.periodEnd,
        closePeriod: input.context.periodEnd.slice(0, 7),
        expression: 'NOMINAL',
        currency: 'ARS',
        normativeVersion: NORMATIVE_BASELINE,
        engineVersion: ACCOUNTING_ENGINE_VERSION,
        algorithmVersion: PREPARATION_ALGORITHM_VERSION,
        policyVersion: CASH_FLOW_POLICY_VERSION,
        mappingsHash,
        indexSetId: null,
        indexSetHash: null,
        contentHash,
        coverage: 'COVERED',
        blockers: nominalBlockers,
        generatedAt: new Date().toISOString(),
    }

    const cashBridge: CashBridge = {
        openingPublishedCents: openingCash,
        priorAdjustmentsCents: priorAdjustments,
        openingAdjustedCents: openingAdjusted,
        closingCents: closingCash,
        netChangeCents: netChange,
        components,
        espClosingCents: espClosing,
        reconciledWithEsp: espClosing === closingCash,
    }

    const controls: PrepControls = {
        rowsWithDifference,
        columns,
        totalControlCents: totalControl,
        methodControlCents: methodControl,
        cashControlCents: cashControl,
        espControlCents: espControl,
        allReconciled,
    }

    return {
        identity,
        cashBridge,
        matrixRows,
        imputations,
        bridges,
        controls,
        activities: columns.map(c => c.activity),
    }
}

export interface RestatedPreparationContext {
    indexes: Map<string, number>
    indexSetId: string
    indexSetHash: string
}

/**
 * Construye el modelo de preparación en MONEDA DE CIERRE (§3). Es un modelo
 * HERMANO del nominal, con `identity.expression = 'CLOSING_CURRENCY'`, no una
 * matriz nominal disfrazada: cada contribución se reexpresa por el coeficiente de
 * SU período de origen y conserva evidencia (índices, coeficiente, redondeo,
 * lineage). Los totales de flujos/REI se toman de la reexpresión formal
 * (`reexpressCashFlow`) para reconciliar exactamente con la exposición.
 *
 * Si falta el índice de un período con contribución material, NO se simula
 * coeficiente 1 como válido: se marca la cobertura, se listan las contribuciones
 * afectadas y se agrega un blocker.
 */
export function buildCashFlowPreparationRestated(
    input: ReportingInput,
    statements: StatementsBundle,
    cashFlows: CashFlowsResult,
    restated: RestatedCashFlow,
    ctx: RestatedPreparationContext,
): CashFlowPreparationModel {
    const { indexes, indexSetId, indexSetHash } = ctx
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const rows = statements.trialBalance.rows
    const closePeriod = input.context.periodEnd.slice(0, 7)
    const startPeriod = input.context.periodStart.slice(0, 7)
    const closeIndex = indexes.get(closePeriod) ?? null

    const flowEntries = input.entries.filter(e =>
        e.status !== 'DRAFT'
        && !isStructuralClosingEntry(e)
        && !(e.sourceModule === 'closing' && e.sourceType === 'apertura'))

    // ── Contribuciones reexpresadas por línea (evidencia por contribución) ──
    const contributions: PrepContribution[] = []
    const missingPeriods = new Set<string>()
    // Acumuladores por cuenta (matriz agregada) y por actividad (columnas)
    const restatedByAccount = new Map<string, number>()   // Debe−Haber reexpresado
    const nominalByAccount = new Map<string, number>()
    const blockedByAccount = new Set<string>()
    const countByAccount = new Map<string, number>()
    let restatedCashChangeCents = 0
    let contribSeq = 0

    for (const entry of flowEntries) {
        const originPeriod = entry.date.slice(0, 7)
        const coef = getCoefficient(indexes, originPeriod, closePeriod)
        if (coef === null) missingPeriods.add(originPeriod)
        const originIndex = indexes.get(originPeriod) ?? null
        for (let li = 0; li < entry.lines.length; li++) {
            const l = entry.lines[li]
            const account = byId.get(l.accountId)
            const netDC = toCents(l.debit || 0) - toCents(l.credit || 0)
            if (netDC === 0) continue
            if (isCashAccount(account)) {
                restatedCashChangeCents += Math.round(netDC * (coef ?? 1))
                continue
            }
            const bucket = flowBucket(account)
            const { activity, label } = causeFor(account, bucket)
            const restatedRaw = netDC * (coef ?? 1)
            const restatedCents = Math.round(restatedRaw)
            const blocked = coef === null
            contributions.push({
                id: `prep:contrib:${entry.id}:${li}:${++contribSeq}`,
                accountId: l.accountId,
                code: account?.code ?? '—',
                name: account?.name ?? l.accountId,
                entryId: entry.id,
                lineIndex: li,
                amountNominalCents: netDC,
                originDate: entry.date,
                originPeriod,
                originIndex,
                closeIndex,
                coefficient: coef,
                restatedRawCents: restatedRaw,
                restatedCents,
                roundingDiffCents: restatedCents - restatedRaw,
                activity,
                causeLabel: label,
                rule: bucket,
                classification: 'AUTO',
                formula: 'importe nominal × (índice de cierre ÷ índice de origen)',
                blocked,
                control: 0,
            })
            restatedByAccount.set(l.accountId, (restatedByAccount.get(l.accountId) ?? 0) + restatedCents)
            nominalByAccount.set(l.accountId, (nominalByAccount.get(l.accountId) ?? 0) + netDC)
            countByAccount.set(l.accountId, (countByAccount.get(l.accountId) ?? 0) + 1)
            if (blocked) blockedByAccount.add(l.accountId)
        }
    }

    // ── Filas matriciales + imputaciones reexpresadas (agregadas por cuenta) ──
    const matrixRows: PrepMatrixRow[] = []
    const imputations: PrepImputation[] = []
    const columnTech = new Map<PrepActivity, number>()
    let nonCashRestatedVariation = 0

    // conserva orden estable por código de cuenta
    const orderedAccountIds = rows.map(r => r.accountId).filter(id => restatedByAccount.has(id) || !isCashAccount(byId.get(id)))
    const seen = new Set<string>()
    for (const accountId of [...orderedAccountIds, ...restatedByAccount.keys()]) {
        if (seen.has(accountId)) continue
        seen.add(accountId)
        const account = byId.get(accountId)
        if (isCashAccount(account)) continue
        const restatedVar = restatedByAccount.get(accountId) ?? 0
        const nominalVar = nominalByAccount.get(accountId) ?? 0
        const tbRow = rows.find(r => r.accountId === accountId)
        const bucket = flowBucket(account)
        const { activity, label } = causeFor(account, bucket)
        const economic = -restatedVar
        const blocked = blockedByAccount.has(accountId)
        if (restatedVar !== 0 || nominalVar !== 0) {
            nonCashRestatedVariation += restatedVar
            columnTech.set(activity, (columnTech.get(activity) ?? 0) + restatedVar)
            imputations.push({
                id: `prep:imp:${accountId}`,
                method: 'INDIRECT',
                activity,
                causeLabel: label,
                amountCents: restatedVar,
                economicCents: economic,
                formula: 'Σ (contribución nominal × coeficiente del período de origen)',
                operands: { variacionReexpresada: fromCents(restatedVar), variacionNominal: fromCents(nominalVar) },
                rule: bucket,
                accountId,
                entryIds: tbRow?.entryIds ?? [],
                classification: 'AUTO',
                control: 0,
            })
        }
        matrixRows.push({
            id: `prep:row:${accountId}`,
            accountId,
            code: account?.code ?? tbRow?.code ?? '—',
            name: account?.name ?? tbRow?.name ?? accountId,
            nature: (account?.kind ?? tbRow?.kind) as Account['kind'],
            activity, causeLabel: label,
            openingCents: toCents(tbRow?.opening ?? 0), closingCents: toCents(tbRow?.closing ?? 0),
            variationCents: restatedVar, economicVariationCents: economic,
            direction: restatedVar > 0 ? 'INCREASE' : restatedVar < 0 ? 'DECREASE' : 'NONE',
            originApplication: economic > 0 ? 'ORIGIN' : economic < 0 ? 'APPLICATION' : 'NONE',
            imputedCents: restatedVar,
            control: 0,
            state: blocked ? 'BLOCKED' : (restatedVar === 0 ? 'NO_MOVEMENT' : bucket === 'UNCLASSIFIED' ? 'BLOCKED' : 'RECONCILED'),
            entryIds: tbRow?.entryIds ?? [],
            nominalVariationCents: nominalVar,
            contributionCount: countByAccount.get(accountId) ?? 0,
            blockedByMissingIndex: blocked,
        })
    }

    // ── Puente del efectivo reexpresado (totales autoritativos de la exposición) ──
    const openingPublishedCents = toCents(cashFlows.direct.openingCash.amount)
    const priorAdjustmentsCents = toCents(cashFlows.direct.priorAdjustments?.amount ?? 0)
    const openingRestatedCents = toCents(restated.direct.openingCash.amount)
    const openingCoef = getCoefficient(indexes, startPeriod, closePeriod)
    const priorAdjustmentsRestatedCents = Math.round(priorAdjustmentsCents * (openingCoef ?? 1))
    const openingAdjustedRestatedCents = openingRestatedCents + priorAdjustmentsRestatedCents
    const closingCents = toCents(restated.direct.closingCash.amount)
    const flowsRestatedCents = toCents(restated.direct.operating.amount)
        + toCents(restated.direct.investing.amount)
        + toCents(restated.direct.financing.amount)
        + toCents(restated.direct.unclassified.amount)
    const reiCents = closingCents - (openingRestatedCents + flowsRestatedCents)
    const netChangeCents = toCents(restated.direct.netChange.amount)

    let espClosing = 0
    const components: CashComponent[] = []
    for (const r of rows) {
        if (!isCashAccount(byId.get(r.accountId))) continue
        espClosing += toCents(r.closing)
        components.push({ accountId: r.accountId, code: r.code, name: r.name, openingCents: toCents(r.opening), closingCents: toCents(r.closing) })
    }

    // ── Controles ────────────────────────────────────────────
    const activities: PrepActivity[] = ['OPERATING', 'INVESTING', 'FINANCING', 'UNCLASSIFIED']
    const columns: PrepColumnControl[] = activities
        .filter(a => columnTech.has(a))
        .map(a => ({ activity: a, technicalCents: columnTech.get(a) ?? 0, economicCents: -(columnTech.get(a) ?? 0) }))
    const totalControl = nonCashRestatedVariation + restatedCashChangeCents
    const methodControl = toCents(restated.direct.operating.amount) - toCents(restated.indirect.operating.amount)
    const cashControl = (openingAdjustedRestatedCents + flowsRestatedCents + reiCents) - closingCents
    const espControl = espClosing - closingCents
    const rowsWithDifference = matrixRows.filter(r => r.control !== 0).length

    // ── Cobertura y blockers ─────────────────────────────────
    const blockers: string[] = [...restated.blockers]
    let coverage: PrepCoverage = 'COVERED'
    if (missingPeriods.size > 0 || closeIndex === null) {
        const anyCovered = closeIndex !== null && contributions.some(c => !c.blocked)
        coverage = anyCovered ? 'PARTIAL' : 'MISSING'
        const affected = contributions.filter(c => c.blocked).map(c => `${c.code} (${c.originPeriod})`)
        blockers.push(`Faltan índices para reexpresar contribuciones de: ${Array.from(missingPeriods).sort().join(', ') || closePeriod}. Contribuciones afectadas: ${Array.from(new Set(affected)).join(', ') || '—'}. No se estima con coeficiente 1.`)
    }
    const allReconciled = coverage === 'COVERED'
        && totalControl === 0 && methodControl === 0 && cashControl === 0 && espControl === 0 && rowsWithDifference === 0

    // ── Puentes devengado → percibido reexpresados ───────────
    const sumRestatedGroup = (groups: string[]): number => {
        let cents = 0
        for (const [accountId, v] of restatedByAccount) {
            const g = byId.get(accountId)?.statementGroup
            if (g && groups.includes(g)) cents += v
        }
        return cents
    }
    const bridges: PrepBridge[] = []
    const salesRestated = -sumRestatedGroup(['SALES'])           // ingreso: Haber ⇒ magnitud positiva
    const deltaReceivablesRestated = sumRestatedGroup(['TRADE_RECEIVABLES'])
    const cogsRestated = sumRestatedGroup(['COGS'])              // gasto: Debe ⇒ positivo
    const deltaInventoryRestated = sumRestatedGroup(['INVENTORIES'])
    const deltaPayablesRestated = -sumRestatedGroup(['TRADE_PAYABLES'])
    const restatedOp = restated.direct.operating.children ?? []
    const cobrosExpected = toCents(restatedOp.find(c => c.label === 'Cobros de clientes')?.amount ?? 0)
    const pagosExpected = -toCents(restatedOp.find(c => c.label === 'Pagos a proveedores de bienes y servicios')?.amount ?? 0)
    if (salesRestated !== 0 || deltaReceivablesRestated !== 0) {
        const cobros = salesRestated - deltaReceivablesRestated
        bridges.push({
            id: 'prep:bridge:cobros', label: 'Ventas devengadas → Cobros de clientes (moneda de cierre)',
            formula: 'ventas reexpresadas − aumento de créditos reexpresado',
            operands: [
                { label: 'Ventas devengadas (reexpresadas)', amountCents: salesRestated, sign: 1 },
                { label: 'Aumento de créditos (reexpresado)', amountCents: deltaReceivablesRestated, sign: -1 },
            ],
            resultCents: cobros, expectedCents: cobrosExpected,
            residualCents: cobrosExpected !== 0 ? cobros - cobrosExpected : 0,
            reconciled: cobrosExpected === 0 || cobros === cobrosExpected,
        })
    }
    if (cogsRestated !== 0 || deltaInventoryRestated !== 0) {
        const compras = cogsRestated + deltaInventoryRestated
        const pagos = compras - deltaPayablesRestated
        bridges.push({
            id: 'prep:bridge:pagos', label: 'Compras → Pagos a proveedores (moneda de cierre)',
            formula: 'compras reexpresadas − aumento de deudas comerciales reexpresado',
            operands: [
                { label: 'Compras (reexpresadas)', amountCents: compras, sign: 1 },
                { label: 'Aumento de deudas comerciales (reexpresado)', amountCents: deltaPayablesRestated, sign: -1 },
            ],
            resultCents: pagos, expectedCents: pagosExpected,
            residualCents: pagosExpected !== 0 ? pagos - pagosExpected : 0,
            reconciled: pagosExpected === 0 || pagos === pagosExpected,
        })
    }

    // ── Identidad + hash (incluye coeficientes) ──────────────
    const mappingsHash = hashString(JSON.stringify(input.accounts.map(a => [a.id, a.statementGroup, a.cashFlowCategory])))
    const contentHash = hashString(JSON.stringify({
        ctx: input.context,
        set: indexSetHash,
        contribs: contributions.map(c => [c.accountId, c.entryId, c.lineIndex, c.amountNominalCents, c.coefficient, c.restatedCents]),
        rei: reiCents, flows: flowsRestatedCents, mappingsHash,
    }))

    const identity: PreparationIdentity = {
        companyId: input.context.companyId,
        exerciseId: input.context.exerciseId,
        exerciseLabel: input.context.exerciseLabel,
        closeDate: input.context.periodEnd,
        closePeriod,
        expression: 'CLOSING_CURRENCY',
        currency: 'ARS',
        normativeVersion: NORMATIVE_BASELINE,
        engineVersion: ACCOUNTING_ENGINE_VERSION,
        algorithmVersion: PREPARATION_ALGORITHM_VERSION,
        policyVersion: CASH_FLOW_POLICY_VERSION,
        mappingsHash,
        indexSetId,
        indexSetHash,
        contentHash,
        coverage,
        blockers,
        generatedAt: new Date().toISOString(),
    }

    const cashBridge: CashBridge = {
        openingPublishedCents,
        priorAdjustmentsCents,
        openingAdjustedCents: openingPublishedCents + priorAdjustmentsCents,
        closingCents,
        netChangeCents,
        components,
        espClosingCents: espClosing,
        reconciledWithEsp: espClosing === closingCents,
        openingRestatedCents,
        priorAdjustmentsRestatedCents,
        openingAdjustedRestatedCents,
        flowsRestatedCents,
        reiCents,
    }

    const controls: PrepControls = {
        rowsWithDifference,
        columns,
        totalControlCents: totalControl,
        methodControlCents: methodControl,
        cashControlCents: cashControl,
        espControlCents: espControl,
        allReconciled,
    }

    return {
        identity,
        cashBridge,
        matrixRows,
        imputations,
        bridges,
        controls,
        activities: columns.map(c => c.activity),
        contributions,
    }
}
