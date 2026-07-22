/**
 * Motor único de reporting — dominio (Fase 2B, §8).
 *
 * Núcleo PURO: sin React, sin Dexie, sin PDF/XLSX. Todos los estados parten
 * del mismo modelo canónico (NormalizedTrialBalance) construido desde
 * asientos POSTED/REVERSED del contexto + saldos de apertura explícitos.
 * Cada línea lleva linaje (cuentas y asientos que la forman).
 */

import type { Account, ExpenseAllocationRule, JournalEntry, ManualDisclosure, ResultFunction } from '../../core/models'

export interface EngineContext {
    companyId: string
    exerciseId: string
    exerciseLabel: string
    periodStart: string
    periodEnd: string
}

export interface ReportingInput {
    context: EngineContext
    /** Asientos del ejercicio que integran los libros (sin DRAFT) */
    entries: JournalEntry[]
    /** Saldos previos explícitos (vacío si existe apertura formal) */
    openingBalances: Map<string, { debit: number; credit: number }>
    accounts: Account[]
    /** Reglas versionadas de distribución de gastos por función (Fase 2E §9.2) */
    allocationRules?: ExpenseAllocationRule[]
    /** Notas manuales persistentes vigentes del ejercicio (Fase 2F §8) */
    manualDisclosures?: ManualDisclosure[]
    /** Detalle operativo de posiciones en moneda extranjera (Fase 2F §11) */
    foreignCurrencyDetails?: ForeignCurrencyDetail[]
    /** Bundle comparativo (ejercicio anterior, derivado con el mismo motor) */
    comparative?: StatementsBundle | null
}

// ─────────────────────────────────────────────────────────────
// Balance de comprobación normalizado (modelo canónico)
// ─────────────────────────────────────────────────────────────

export interface TrialBalanceRow2B {
    accountId: string
    code: string
    name: string
    kind: Account['kind']
    isContra: boolean
    /** apertura neta Debe−Haber */
    opening: number
    periodDebit: number
    periodCredit: number
    /** cierre neto Debe−Haber (opening + debit − credit) */
    closing: number
    /** ids de asientos que movieron la cuenta en el período (linaje) */
    entryIds: string[]
    /** true si la cuenta no existe en el plan (nunca se omite) */
    unknownAccount: boolean
}

export interface NormalizedTrialBalance {
    context: EngineContext
    rows: TrialBalanceRow2B[]
    totalPeriodDebit: number
    totalPeriodCredit: number
    totalOpeningDebit: number
    totalOpeningCredit: number
    isBalanced: boolean
}

// ─────────────────────────────────────────────────────────────
// Líneas de reporte con linaje
// ─────────────────────────────────────────────────────────────

export interface ReportLine {
    id: string
    label: string
    /** 0 = título/total mayor, 1 = rubro, 2 = cuenta */
    level: number
    amount: number
    comparativeAmount?: number | null
    /** linaje: cuentas que forman el importe */
    accountIds: string[]
    noteRef?: string
    children?: ReportLine[]
}

export interface BalanceSheet2B {
    currentAssets: ReportLine
    nonCurrentAssets: ReportLine
    totalAssets: ReportLine
    currentLiabilities: ReportLine
    nonCurrentLiabilities: ReportLine
    totalLiabilities: ReportLine
    equity: ReportLine
    totalLiabilitiesAndEquity: ReportLine
    /** Activo − (Pasivo + PN); 0 si la ecuación cierra */
    equationDifference: number
}

/**
 * Estado del renglón de impuesto a las ganancias (Fase 2E, §5.2).
 * - CALCULATED: hay cuentas con mapping estructural INCOME_TAX (importe real,
 *   incluso $0 si no se devengó impuesto).
 * - NOT_APPLICABLE: el ejercicio no tiene actividad de resultados que gravar.
 * - INSUFFICIENT_INFORMATION: hay resultados pero el plan no tiene ninguna
 *   cuenta mapeada a INCOME_TAX; el importe NO se muestra como $0 calculado.
 */
export type IncomeTaxStatus = 'CALCULATED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_INFORMATION'

export interface IncomeStatement2B {
    sales: ReportLine
    costOfSales: ReportLine
    grossProfit: ReportLine
    adminExpenses: ReportLine
    sellingExpenses: ReportLine
    operatingResult: ReportLine
    financialResults: ReportLine
    otherResults: ReportLine
    /** Resultado operativo + financieros y por tenencia + otros (Fase 2E, §5) */
    preTaxResult: ReportLine
    /** Solo cuentas con statementGroup INCOME_TAX; jamás inferido por nombre */
    incomeTax: ReportLine
    incomeTaxStatus: IncomeTaxStatus
    /** Resultado de operaciones que continúan (= neto: discontinuadas sin soporte) */
    continuingResult: ReportLine
    netIncome: ReportLine
}

export interface EquityStatement2B {
    openingBalance: ReportLine
    contributions: ReportLine
    distributions: ReportLine
    reservesMovements: ReportLine
    otherMovements: ReportLine
    periodResult: ReportLine
    closingBalance: ReportLine
}

// ─────────────────────────────────────────────────────────────
// EEPN matricial de doble entrada (Fase 2E, §6)
// ─────────────────────────────────────────────────────────────

import type { EquityComponent, EquityMovementType } from '../../core/models'

export type EquityColumnGroupId = 'CONTRIBUTED' | 'RESERVES' | 'RETAINED' | 'DEFERRED' | 'OTHER'

export interface EquityMatrixColumn {
    component: EquityComponent
    label: string
    group: EquityColumnGroupId
    /** cuentas que integran la columna (linaje) */
    accountIds: string[]
    opening: number
    variations: number
    closing: number
}

export interface EquityMatrixColumnGroup {
    id: EquityColumnGroupId
    label: string
    components: EquityComponent[]
}

export interface EquityMatrixRow {
    type: EquityMovementType | 'ADJUSTED_OPENING' | 'TOTAL_VARIATIONS' | 'CLOSING'
    label: string
    /** importe por componente (clave = EquityComponent); credit-positivo */
    cells: Partial<Record<EquityComponent, number>>
    total: number
    accountIds: string[]
    entryIds: string[]
    /** filas conceptuales sin movimientos se ocultan en el modo compacto */
    hasData: boolean
    isSubtotal: boolean
}

// ─────────────────────────────────────────────────────────────
// Anexo de gastos por función (Fase 2E, §9)
// ─────────────────────────────────────────────────────────────

export interface ExpenseAccountRow {
    accountId: string
    code: string
    name: string
    /** gasto total de la cuenta en el período (positivo) */
    total: number
    comparativeTotal?: number | null
    /** importe por función (suma exacta = total) */
    cells: Partial<Record<ResultFunction, number>>
    /** origen de la asignación: regla versionada, mapping explícito o derivación */
    source: 'RULE' | 'MAPPING' | 'DERIVED'
    ruleId?: string
}

export interface ExpensesByFunctionMatrix {
    rows: ExpenseAccountRow[]
    columns: { function: ResultFunction; label: string }[]
    totals: {
        byFunction: Partial<Record<ResultFunction, number>>
        total: number
        comparativeTotal?: number | null
    }
    /** gastos sin función: se exponen y bloquean la publicación formal */
    unmappedExpenses: { accountId: string; code: string; name: string; total: number }[]
    validations: ValidationCheck[]
}

// ─────────────────────────────────────────────────────────────
// Determinación del costo de ventas (Fase 2E, §10)
// ─────────────────────────────────────────────────────────────

export type CostOfSalesMode = 'COMMERCIAL' | 'SERVICES' | 'NOT_APPLICABLE'

export interface CostOfSalesValue {
    /** null cuando el estado no es CALCULATED (nunca cero como sustituto) */
    amount: number | null
    status: 'CALCULATED' | 'NOT_APPLICABLE' | 'INSUFFICIENT_INFORMATION'
    accountIds: string[]
    comparativeAmount?: number | null
    detail?: string
}

export interface CostOfSalesBridge {
    mode: CostOfSalesMode
    openingInventory: CostOfSalesValue
    purchases: CostOfSalesValue
    /** devoluciones y bonificaciones de compras (restan; Fase 2F §10) */
    purchaseReturns: CostOfSalesValue
    /** fletes y costos de adquisición (suman; Fase 2F §10) */
    acquisitionCosts: CostOfSalesValue
    /** otros costos incorporables (suman; Fase 2F §10) */
    incorporableCosts: CostOfSalesValue
    goodsAvailableForSale: CostOfSalesValue
    closingInventory: CostOfSalesValue
    /**
     * Pérdidas/bajas anormales que salieron de inventario pero NO son CMV
     * (siniestros, obsolescencia). Se exponen como diferencia real, jamás
     * mezcladas con el costo (Fase 2F §10.1).
     */
    abnormalLosses: CostOfSalesValue
    /** CMV por el puente: disponibles − existencia final − bajas anormales */
    costOfSales: CostOfSalesValue
    /** CMV según el ER (registro perpetuo); la igualdad se VERIFICA, no se fuerza */
    costOfSalesPerIncomeStatement: number
    validations: ValidationCheck[]
}

// ─────────────────────────────────────────────────────────────
// Anexo de bienes de uso (Fase 2E, §11)
// ─────────────────────────────────────────────────────────────

export interface FixedAssetsAnnexRow {
    /** clase estructural (annexGroup); 'Sin clase asignada' si falta mapping */
    assetClass: string
    accountIds: string[]
    /** valores de origen */
    grossOpening: number
    additions: number
    disposals: number
    grossClosing: number
    /** depreciaciones acumuladas (positivas: regularizan restando) */
    accumDepOpening: number
    periodDepreciation: number
    depDisposals: number
    accumDepClosing: number
    /** valor residual = VO final − dep. acumulada final */
    residual: number
    comparativeResidual?: number | null
}

export interface FixedAssetsAnnex {
    rows: FixedAssetsAnnexRow[]
    totals: FixedAssetsAnnexRow
    /** true si alguna cuenta PPE no tiene clase asignada (annexGroup) */
    hasUnclassified: boolean
    validations: ValidationCheck[]
}

/**
 * Fila del anexo de bienes de uso en moneda de cierre (Fase 2F §12):
 * valor nominal + ajuste por reexpresión = valor reexpresado, para el valor
 * de origen y para la depreciación acumulada. La reexpresión proviene del
 * motor de inflación y de los orígenes de cada movimiento (anticuación).
 */
export interface FixedAssetsRestatedRow {
    assetClass: string
    accountIds: string[]
    grossNominal: number
    grossAdjustment: number
    grossRestated: number
    depNominal: number
    depAdjustment: number
    depRestated: number
    residualRestated: number
}

export interface FixedAssetsAnnexRestated {
    rows: FixedAssetsRestatedRow[]
    totals: FixedAssetsRestatedRow
    /** período de cierre YYYY-MM contra el que se reexpresa */
    closePeriod: string
    /** faltan índices ⇒ no se reexpresa (no se estima con coeficiente 1) */
    blockers: string[]
}

// ─────────────────────────────────────────────────────────────
// Moneda extranjera (Fase 2E, §12)
// ─────────────────────────────────────────────────────────────

export interface ForeignCurrencyRow {
    accountId: string
    code: string
    name: string
    currency: string
    side: 'ASSET' | 'LIABILITY' | 'OTHER'
    monetary: string
    /** medición contable en moneda de curso legal (saldo del libro) */
    measurement: number
    comparativeMeasurement?: number | null
    /** cantidad y cotización: sin datos estructurados ⇒ INSUFFICIENT */
    quantityStatus: 'CALCULATED' | 'INSUFFICIENT_INFORMATION'
    /** cantidad en moneda extranjera (módulo operativo), si está disponible */
    quantity?: number | null
    /** cotización efectivamente utilizada (ARS/ME) */
    rate?: number | null
    rateType?: string
    rateSource?: string
    rateDate?: string
    /** medición implícita = cantidad × cotización (módulo operativo) */
    impliedMeasurement?: number | null
    /**
     * diferencia entre la medición contable (Diario) y la implícita del
     * módulo operativo. La fuente del saldo es SIEMPRE el Diario; cualquier
     * diferencia se expone, no se oculta (Fase 2F §11).
     */
    reconciliationDifference?: number | null
    statementLineId: string
}

export interface ForeignCurrencyDisclosure {
    applicable: boolean
    rows: ForeignCurrencyRow[]
    note: string
    /** true si el detalle operativo reconcilia con el Diario en todas las cuentas */
    reconciled: boolean
}

/**
 * Detalle operativo de una posición en moneda extranjera (Fase 2F §11),
 * normalizado desde el módulo de moneda extranjera. El motor lo usa para
 * enriquecer la nota; la fuente del saldo sigue siendo el Diario.
 */
export interface ForeignCurrencyDetail {
    ledgerAccountId: string
    currency: string
    quantity: number
    rate: number
    rateType?: string
    rateSource?: string
    rateDate?: string
}

export interface EquityMatrixViewModel {
    columns: EquityMatrixColumn[]
    columnGroups: EquityMatrixColumnGroup[]
    openingRow: EquityMatrixRow
    priorAdjustmentRow: EquityMatrixRow
    adjustedOpeningRow: EquityMatrixRow
    movementRows: EquityMatrixRow[]
    totalVariationsRow: EquityMatrixRow
    closingRow: EquityMatrixRow
    /** totales del ejercicio comparativo (mismo motor sobre el ejercicio previo) */
    comparative: { openingTotal: number; closingTotal: number; periodResult: number } | null
    validations: ValidationCheck[]
}

export type CashFlowMethod = 'DIRECT' | 'INDIRECT'

export interface CashFlowStatement2B {
    method: CashFlowMethod
    openingCash: ReportLine
    /** modificaciones de ejercicios anteriores (AREA) sobre el efectivo inicial (§11) */
    priorAdjustments?: ReportLine
    /** efectivo al inicio modificado = inicial + modificaciones (§11) */
    adjustedOpening?: ReportLine
    operating: ReportLine
    investing: ReportLine
    financing: ReportLine
    netChange: ReportLine
    closingCash: ReportLine
    /** flujos sin clasificar (bloquean la publicación si son materiales) */
    unclassified: ReportLine
    /** transacciones sin efecto en efectivo (se revelan, no integran flujos) */
    nonMonetaryDisclosures: ReportLine[]
}

// ─────────────────────────────────────────────────────────────
// Validación automática (§8.5)
// ─────────────────────────────────────────────────────────────

export interface ValidationCheck {
    id: string
    label: string
    passed: boolean
    expected?: number
    actual?: number
    difference?: number
    detail?: string
}

export interface StatementValidationReport {
    context: EngineContext
    checks: ValidationCheck[]
    allPassed: boolean
    /** los estados no pueden marcarse "Validados" si esto es false */
    canPublish: boolean
}

export interface StatementsBundle {
    context: EngineContext
    trialBalance: NormalizedTrialBalance
    balanceSheet: BalanceSheet2B
    incomeStatement: IncomeStatement2B
    equityStatement: EquityStatement2B
    /** EEPN matricial de doble entrada (Fase 2E, §6) */
    equityMatrix: EquityMatrixViewModel
    /** Anexo de gastos por función (Fase 2E, §9) */
    expensesByFunction: ExpensesByFunctionMatrix
    /** Determinación del costo de ventas (Fase 2E, §10) */
    costOfSales: CostOfSalesBridge
    /** Anexo de bienes de uso por clase (Fase 2E, §11) */
    fixedAssetsAnnex: FixedAssetsAnnex
    /** Cuadro de moneda extranjera (Fase 2E, §12) */
    foreignCurrency: ForeignCurrencyDisclosure
    cashFlowDirect: CashFlowStatement2B | null
    cashFlowIndirect: CashFlowStatement2B | null
    validation: StatementValidationReport
}
