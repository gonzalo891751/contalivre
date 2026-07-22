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
import type { ReportingInput, StatementsBundle, TrialBalanceRow2B } from '../domain/types'

const fromCents = (c: number) => c / 100

export type PrepActivity = 'OPERATING' | 'INVESTING' | 'FINANCING' | 'UNCLASSIFIED'
export type PrepExpression = 'NOMINAL' | 'RESTATED'

export interface PreparationIdentity {
    companyId: string
    exerciseId: string
    exerciseLabel: string
    closeDate: string
    expression: PrepExpression
    currency: string
    normativeVersion: string
    engineVersion: string
    policyVersion: number
    mappingsHash: string
    indexSetHash: string | null
    contentHash: string
    generatedAt: string
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

    const identity: PreparationIdentity = {
        companyId: input.context.companyId,
        exerciseId: input.context.exerciseId,
        exerciseLabel: input.context.exerciseLabel,
        closeDate: input.context.periodEnd,
        expression: 'NOMINAL',
        currency: 'ARS',
        normativeVersion: NORMATIVE_BASELINE,
        engineVersion: ACCOUNTING_ENGINE_VERSION,
        policyVersion: CASH_FLOW_POLICY_VERSION,
        mappingsHash,
        indexSetHash: null,
        contentHash,
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
