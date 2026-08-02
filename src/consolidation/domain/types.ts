/**
 * Consolidación de estados contables — dominio (Fase 2K).
 *
 * PRINCIPIO INVARIANTE DEL MÓDULO
 * ────────────────────────────────
 * Los ajustes y eliminaciones de consolidación son EXTRACONTABLES. No escriben
 * asientos en el Libro Diario de ninguna entidad, no tocan sus mayores, no
 * modifican sus balances individuales ni su patrimonio neto legal. Son papeles
 * de trabajo del grupo: se recalculan, se editan, se anulan y se regeneran sin
 * alterar jamás los datos fuente.
 *
 * El módulo CONSUME la representación canónica de los estados individuales
 * (StatementsBundle, producido por src/reporting) y PRODUCE una representación
 * canónica consolidada. No duplica el motor de ESP, ER, EEPN ni EFE.
 *
 * Marco normativo: RT 54 (texto ordenado por RT 59). La RT 21 se cita sólo como
 * antecedente histórico; su terminología ("participación minoritaria", "sociedad
 * emisora / inversora") NO se usa en la exposición: la norma vigente habla de
 * PARTICIPACIÓN NO CONTROLADORA, que integra el patrimonio neto y nunca el pasivo.
 */

import type { Account } from '../../core/models'
import type { NormalizedTrialBalance, StatementsBundle, ValidationCheck } from '../../reporting/domain/types'

// ─────────────────────────────────────────────────────────────
// 1. Grupo económico y perímetro
// ─────────────────────────────────────────────────────────────

export interface EconomicGroup {
    id: string
    name: string
    /** entidad controladora: una empresa real de la instalación */
    parentCompanyId: string
    /** moneda de presentación del juego consolidado */
    presentationCurrency: string
    /** unidad de medida declarada (ej. 'Moneda de cierre') */
    measurementUnit: string
    description?: string
    createdAt: string
    updatedAt: string
    active: boolean
}

/**
 * Vínculo de una entidad con el grupo.
 *
 * `relation` es la naturaleza del vínculo; `method` es el tratamiento contable.
 * No son lo mismo y la interfaz no los colapsa: una asociada NO "se consolida
 * por VPP", se MIDE por VPP y queda fuera del perímetro de consolidación.
 */
export type MemberRelation = 'PARENT' | 'SUBSIDIARY' | 'ASSOCIATE' | 'JOINT_VENTURE'

export type ConsolidationMethod =
    /** consolidación total (línea por línea, con PNC) */
    | 'FULL'
    /** medición por valor patrimonial proporcional; NO integra el perímetro */
    | 'EQUITY_METHOD'
    /** excluida con fundamento normativo explícito */
    | 'EXCLUDED'

/** Fundamento por el cual se concluye que existe (o no) control */
export type ControlBasis =
    | 'MAJORITY_VOTING_RIGHTS'
    | 'CONTRACTUAL_AGREEMENT'
    | 'BOARD_APPOINTMENT'
    | 'DE_FACTO_CONTROL'
    | 'NO_CONTROL'

export interface GroupMember {
    id: string
    groupId: string
    companyId: string
    relation: MemberRelation
    method: ConsolidationMethod
    /** participación patrimonial DIRECTA sobre el capital, 0..1 */
    directOwnership: number
    /** derechos de voto 0..1 cuando difieren de la participación patrimonial */
    votingRights?: number
    /** miembro a través del cual se posee (participación indirecta) */
    heldThroughMemberId?: string
    controlFrom: string
    controlTo?: string
    /**
     * Conclusión EXPLÍCITA sobre la existencia de control. No se deriva de que
     * el porcentaje supere el 50 %: el control es un juicio, y el sistema exige
     * que quede fundado en lugar de concluirlo en silencio.
     */
    hasControl: boolean
    controlBasis: ControlBasis
    controlRationale: string
    exclusionReason?: string
    sortOrder: number
}

// ─────────────────────────────────────────────────────────────
// 2. Ejercicio de consolidación
// ─────────────────────────────────────────────────────────────

export type ConsolidationStatus = 'DRAFT' | 'IN_REVIEW' | 'LOCKED'

export interface ConsolidationExercise {
    id: string
    groupId: string
    label: string
    /** fecha de cierre de la controladora: gobierna todo el juego */
    reportingDate: string
    periodStart: string
    periodEnd: string
    status: ConsolidationStatus
    /** set de índices para expresar el juego en moneda de cierre */
    inflationIndexSetId?: string
    /** consolidación del ejercicio anterior (comparativo) */
    previousConsolidationId?: string
    createdAt: string
    updatedAt: string
    lockedAt?: string
    lockedBy?: string
}

/**
 * Qué ejercicio individual de cada entidad alimenta esta consolidación.
 * La participación se registra POR EJERCICIO: puede cambiar entre períodos sin
 * reescribir la historia del maestro de miembros.
 */
export interface ConsolidationMemberLink {
    id: string
    consolidationId: string
    memberId: string
    companyId: string
    /** año calendario del ejercicio individual */
    sourceYear: number
    sourceExerciseId: string
    /** cierre del ejercicio individual (puede diferir del de la controladora) */
    sourcePeriodEnd: string
    /** participación aplicable en este ejercicio, 0..1 */
    ownership: number
    votingRights?: number
    /** fundamento y ajustes cuando el cierre no coincide */
    homogenizationNote?: string
    included: boolean
}

// ─────────────────────────────────────────────────────────────
// 3. Mapeo contable del grupo
// ─────────────────────────────────────────────────────────────

/**
 * Línea canónica del juego consolidado. Se deriva de la taxonomía que YA usa
 * el motor individual (kind + clasificación corriente + statementGroup): no se
 * crea una taxonomía paralela ni se depende de nombres de cuenta.
 */
export type ConsolidatedLineId =
    // Activo
    | 'AC_CAJA_BANCOS' | 'AC_CREDITOS_VENTAS' | 'AC_OTROS_CREDITOS'
    | 'AC_BIENES_CAMBIO' | 'AC_INVERSIONES' | 'AC_OTROS'
    | 'ANC_CREDITOS' | 'ANC_INVERSIONES' | 'ANC_BIENES_USO'
    | 'ANC_INTANGIBLES' | 'ANC_OTROS'
    // Pasivo
    | 'PC_DEUDAS_COMERCIALES' | 'PC_DEUDAS_SOCIALES' | 'PC_DEUDAS_FISCALES'
    | 'PC_PRESTAMOS' | 'PC_OTRAS_DEUDAS'
    | 'PNC_DEUDAS_COMERCIALES' | 'PNC_PRESTAMOS' | 'PNC_OTRAS_DEUDAS'
    // Patrimonio neto
    | 'PN_CAPITAL' | 'PN_RESERVAS' | 'PN_RESULTADOS_ACUMULADOS'
    | 'PN_RESULTADO_EJERCICIO'
    /** participación no controladora: integra el PN, jamás el pasivo */
    | 'PN_PARTICIPACION_NO_CONTROLADORA'
    /** diferencia entre la inversión contabilizada y el VPP (llave / menor valor) */
    | 'ANC_LLAVE_NEGOCIO'
    // Resultados
    | 'ER_VENTAS' | 'ER_COSTO_VENTAS' | 'ER_GASTOS_ADMINISTRACION'
    | 'ER_GASTOS_COMERCIALIZACION'
    /**
     * Ingresos y gastos financieros se exponen SEPARADOS en la hoja de
     * consolidación aunque el ER individual los presente netos: si se mezclaran,
     * eliminar los intereses internos —ingreso de una entidad y gasto de la
     * otra por el mismo importe— sería invisible, y el invariante "los ingresos
     * y gastos intragrupo quedan en cero" no podría verificarse.
     */
    | 'ER_INGRESOS_FINANCIEROS' | 'ER_GASTOS_FINANCIEROS'
    | 'ER_RESULTADO_INVERSIONES_PERMANENTES' | 'ER_OTROS_RESULTADOS'
    | 'ER_IMPUESTO_GANANCIAS'
    /** resultado del ejercicio atribuible a la PNC */
    | 'ER_RESULTADO_PNC'
    // Salvaguarda
    | 'SIN_CLASIFICAR'

export type ConsolidatedSection =
    | 'ASSET_CURRENT' | 'ASSET_NON_CURRENT'
    | 'LIABILITY_CURRENT' | 'LIABILITY_NON_CURRENT'
    | 'EQUITY' | 'RESULT'

export interface ConsolidatedLineSpec {
    id: ConsolidatedLineId
    label: string
    section: ConsolidatedSection
    sortOrder: number
    /**
     * Signo de exposición: +1 la línea se expone con saldo deudor positivo
     * (activos, gastos); −1 con saldo acreedor positivo (pasivos, PN, ingresos).
     * El motor trabaja SIEMPRE en neto Debe−Haber y sólo aplica el signo al
     * exponer, para que una eliminación nunca cambie de sentido por la vista.
     */
    naturalSign: 1 | -1
}

/**
 * Categoría intragrupo de una cuenta. Es lo que permite que el motor detecte
 * partidas recíprocas y resultados internos por MAPPING y no por el nombre de
 * la cuenta ("Caja", "Mercaderías", "Inversión permanente" no significan nada
 * para el motor).
 */
export type IntragroupCategory =
    | 'NONE'
    | 'INVESTMENT_IN_SUBSIDIARY'
    | 'EQUITY_METHOD_RESULT'
    | 'INTRAGROUP_RECEIVABLE'
    | 'INTRAGROUP_PAYABLE'
    | 'INTRAGROUP_LOAN_ASSET'
    | 'INTRAGROUP_LOAN_LIABILITY'
    | 'INTRAGROUP_INTEREST_INCOME'
    | 'INTRAGROUP_INTEREST_EXPENSE'
    | 'INTRAGROUP_DIVIDEND_RECEIVABLE'
    | 'INTRAGROUP_DIVIDEND_PAYABLE'
    | 'INTRAGROUP_DIVIDEND_INCOME'
    | 'INTRAGROUP_SALES'
    | 'INTRAGROUP_COST_OF_SALES'
    | 'INTRAGROUP_SERVICE_INCOME'
    | 'INTRAGROUP_SERVICE_EXPENSE'

export interface ConsolidationAccountMapping {
    id: string
    groupId: string
    companyId: string
    accountId: string
    consolidatedLineId: ConsolidatedLineId
    intragroupCategory: IntragroupCategory
    /** contraparte del grupo cuando la cuenta es específica de una relación */
    counterpartyCompanyId?: string
    source: 'AUTO' | 'MANUAL'
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    /** por qué el asistente propuso este destino */
    rationale?: string
    updatedAt: string
}

/** Propuesta del asistente de mapeo, antes de persistirse */
export interface MappingSuggestion {
    companyId: string
    accountId: string
    code: string
    name: string
    consolidatedLineId: ConsolidatedLineId
    intragroupCategory: IntragroupCategory
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    rationale: string
    /** true si el destino es ambiguo y conviene revisión manual */
    needsReview: boolean
}

// ─────────────────────────────────────────────────────────────
// 4. Conciliación de saldos recíprocos
// ─────────────────────────────────────────────────────────────

export type ReciprocalKind =
    | 'TRADE' | 'LOAN' | 'INTEREST' | 'DIVIDEND'
    | 'ADVANCE' | 'CURRENT_ACCOUNT' | 'OTHER'

export type ReciprocalDifferenceCause =
    | 'PENDING_ENTRY' | 'IN_TRANSIT' | 'EXCHANGE_DIFFERENCE'
    | 'TIMING' | 'MISPOSTING' | 'MEASUREMENT' | 'OTHER'

export type ReciprocalStatus = 'PENDING' | 'RECONCILED' | 'DISPUTED'

export interface ReciprocalBalance {
    id: string
    consolidationId: string
    kind: ReciprocalKind
    /** entidad que registra el CRÉDITO (activo) */
    creditorCompanyId: string
    creditorAccountId: string
    creditorAmount: number
    /** entidad que registra la DEUDA (pasivo) */
    debtorCompanyId: string
    debtorAccountId: string
    debtorAmount: number
    currency: string
    /**
     * Importe efectivamente conciliado y por lo tanto eliminado. Si los dos
     * lados no coinciden, la diferencia se EXPONE: no se compensa por el mayor,
     * ni por el menor, ni por un promedio.
     */
    agreedAmount: number
    differenceCause?: ReciprocalDifferenceCause
    differenceNote?: string
    status: ReciprocalStatus
    responsible?: string
    /** antigüedad de la partida en días, si se conoce */
    ageDays?: number
    /** true si la partida fue propuesta por la detección automática */
    autoDetected: boolean
    updatedAt: string
}

// ─────────────────────────────────────────────────────────────
// 5. Operaciones internas y resultados no trascendidos
// ─────────────────────────────────────────────────────────────

/**
 * Dirección de la operación intragrupo. Se DERIVA de quién vende, no se declara
 * a mano: es lo que determina a quién se le imputa el resultado no trascendido.
 */
export type IntragroupDirection = 'UPSTREAM' | 'DOWNSTREAM' | 'LATERAL'

export type IntragroupOperationType =
    | 'GOODS'
    | 'SERVICES'
    | 'RENT'
    | 'INTEREST'
    | 'DIVIDENDS'
    | 'FIXED_ASSET'
    | 'INTANGIBLE'
    | 'OTHER'

export interface IntragroupOperation {
    id: string
    consolidationId: string
    type: IntragroupOperationType
    sellerCompanyId: string
    buyerCompanyId: string
    description: string
    /** importe facturado dentro del grupo (ingreso del vendedor) */
    transferAmount: number
    /** costo del bien o servicio PARA EL GRUPO (costo de origen del vendedor) */
    groupCost: number
    /**
     * Proporción del bien que YA salió del grupo (0..1). 1 = totalmente
     * trascendido a terceros; 0 = íntegramente en poder del grupo.
     */
    realizedRatio: number
    /**
     * Resultado no trascendido fijado manualmente. Cuando está presente prevalece
     * sobre el cálculo y queda marcado como ajuste manual con su fundamento.
     */
    manualUnrealizedAmount?: number
    manualReason?: string
    /**
     * Tasa del impuesto diferido sobre el resultado no trascendido (0..1).
     * Ausente = no se reconoce efecto impositivo (y así se declara).
     */
    deferredTaxRate?: number
    /** para transferencias de bienes de uso: depreciación del período sobre el mayor valor */
    depreciationOnUnrealized?: number
    /**
     * Movimiento de efectivo que la operación produjo ENTRE las dos entidades
     * (Fase 2K §14). El grupo no puede generar flujos de efectivo consigo mismo:
     * lo que una entidad pagó es lo que la otra cobró, así que ambos lados se
     * eliminan del EFE consolidado y el efectivo total del grupo no cambia.
     *
     * Ausente = la operación no movió efectivo en el período (quedó a crédito).
     */
    cashFlow?: {
        /** importe efectivamente cobrado/pagado entre las entidades */
        amount: number
        /** actividad en la que el PAGADOR expuso la salida */
        payerActivity: CashFlowActivity
        /** actividad en la que el COBRADOR expuso la entrada */
        receiverActivity: CashFlowActivity
    }
    createdAt: string
    updatedAt: string
}

export type CashFlowActivity = 'OPERATING' | 'INVESTING' | 'FINANCING'

// ─────────────────────────────────────────────────────────────
// 6. Ajustes manuales de consolidación
// ─────────────────────────────────────────────────────────────

export type AdjustmentCategory =
    | 'HOMOGENIZATION'
    | 'INVESTMENT_VS_EQUITY'
    | 'NON_CONTROLLING_INTEREST'
    | 'RECIPROCAL_BALANCES'
    | 'INTRAGROUP_OPERATION'
    | 'UNREALIZED_RESULT'
    | 'DEFERRED_TAX'
    | 'TRANSLATION'
    | 'RECLASSIFICATION'
    | 'OTHER'

export type AdjustmentStatus = 'DRAFT' | 'APPROVED' | 'REVERSED'

export interface ManualAdjustmentLine {
    /** entidad a la que se imputa la línea (o el grupo, si es del consolidado) */
    companyId?: string
    consolidatedLineId: ConsolidatedLineId
    /** cuenta de origen cuando el ajuste es rastreable a una cuenta concreta */
    accountId?: string
    debit: number
    credit: number
    description?: string
}

export interface ManualConsolidationAdjustment {
    id: string
    consolidationId: string
    date: string
    category: AdjustmentCategory
    concept: string
    explanation: string
    documentReference?: string
    relatedCompanyIds: string[]
    lines: ManualAdjustmentLine[]
    status: AdjustmentStatus
    createdBy: string
    createdAt: string
    approvedBy?: string
    approvedAt?: string
    reversedBy?: string
    reversedAt?: string
    reversalReason?: string
    /** ajuste que este revierte */
    reversesAdjustmentId?: string
}

// ─────────────────────────────────────────────────────────────
// 7. Modelo de cálculo (salida del motor)
// ─────────────────────────────────────────────────────────────

/** Origen de un importe dentro de la hoja de consolidación */
export type EliminationOrigin =
    | 'AUTOMATIC'
    | 'SUGGESTED'
    | 'MANUAL'

export type EliminationKind =
    | 'INVESTMENT_VS_EQUITY'
    | 'NON_CONTROLLING_INTEREST'
    | 'RECIPROCAL_BALANCE'
    | 'INTRAGROUP_OPERATION'
    | 'UNREALIZED_RESULT'
    | 'UNREALIZED_RESULT_REVERSAL'
    | 'INTRAGROUP_DIVIDEND'
    | 'EQUITY_METHOD_RESULT'
    | 'DEFERRED_TAX'
    | 'INTRAGROUP_CASH_FLOW'
    | 'HOMOGENIZATION'
    | 'MANUAL'

/**
 * Línea de un asiento de eliminación. Todo asiento DEBE balancear: la suma de
 * debe menos haber de sus líneas es exactamente cero al centavo, y el motor lo
 * verifica antes de incorporarlo a la hoja.
 */
export interface EliminationLine {
    consolidatedLineId: ConsolidatedLineId
    /** entidad cuyo importe se está corrigiendo (undefined = línea del grupo) */
    companyId?: string
    accountId?: string
    debit: number
    credit: number
    description: string
}

export interface EliminationEntry {
    id: string
    kind: EliminationKind
    origin: EliminationOrigin
    /** rótulo corto para la columna de la hoja de trabajo */
    label: string
    /** explicación en lenguaje llano: por qué existe esta eliminación */
    rationale: string
    /** referencia normativa cuando corresponde */
    normativeReference?: string
    /** cómo se calculó el importe, paso a paso */
    computation: string[]
    lines: EliminationLine[]
    relatedCompanyIds: string[]
    /** id de la operación intragrupo, partida recíproca o ajuste que lo origina */
    sourceId?: string
    balanced: boolean
}

/** Importe de una entidad en una línea consolidada, con su linaje */
export interface WorksheetEntityAmount {
    companyId: string
    /** neto Debe−Haber en la línea */
    amount: number
    accountIds: string[]
}

/**
 * Fila de la hoja de consolidación. Todos los importes están en neto Debe−Haber
 * (deudor positivo). El signo de exposición se aplica al construir los estados.
 */
export interface WorksheetRow {
    lineId: ConsolidatedLineId
    label: string
    section: ConsolidatedSection
    sortOrder: number
    naturalSign: 1 | -1
    /** importe por entidad */
    byEntity: WorksheetEntityAmount[]
    /** suma previa: agregado línea por línea antes de eliminar */
    subtotal: number
    /** ajustes de homogeneización */
    homogenization: number
    /** eliminación inversión contra patrimonio neto */
    investmentElimination: number
    /** reconocimiento de la participación no controladora */
    nonControllingInterest: number
    /** eliminación de saldos recíprocos */
    reciprocalElimination: number
    /** eliminación de operaciones internas (ingresos y gastos) */
    operationElimination: number
    /** eliminación de resultados no trascendidos a terceros */
    unrealizedElimination: number
    /** efecto del impuesto diferido sobre los ajustes anteriores */
    deferredTax: number
    /** otros ajustes manuales aprobados */
    manualAdjustment: number
    /** importe consolidado = suma previa + todos los ajustes */
    consolidated: number
    /** eliminaciones que tocaron esta fila, para poder abrir el detalle */
    eliminationIds: string[]
}

export interface NonControllingInterestDetail {
    companyId: string
    companyName: string
    /** participación de la controladora, 0..1 */
    ownership: number
    /** porcentaje NO controlado, 0..1 */
    nonControllingRatio: number
    /** patrimonio neto de la controlada según sus estados individuales */
    subsidiaryEquity: number
    /** resultados no trascendidos originados por ESTA controlada */
    unrealizedFromSubsidiary: number
    /** patrimonio neto ajustado que sirve de base a la PNC */
    adjustedEquity: number
    /** patrimonio atribuible a la PNC al cierre */
    closingNci: number
    /** resultado del ejercicio de la controlada */
    subsidiaryResult: number
    /** resultado ajustado por los resultados no trascendidos propios */
    adjustedResult: number
    /** resultado del ejercicio atribuible a la PNC */
    nciResult: number
    /** inversión contabilizada por la controladora */
    bookedInvestment: number
    /** VPP esperado según el patrimonio ajustado y los RNT descendentes */
    expectedInvestment: number
    /**
     * Diferencia entre la inversión contabilizada y el VPP esperado. NO se
     * absorbe en silencio: se expone como llave de negocio / menor valor a
     * justificar, y bloquea la emisión si nadie la explica.
     */
    consolidationDifference: number
    /** resultados no trascendidos originados por otras entidades y alojados aquí */
    unrealizedFromOthers: number
}

export interface ConsolidationWorksheet {
    consolidationId: string
    groupName: string
    parentCompanyId: string
    reportingDate: string
    periodStart: string
    periodEnd: string
    presentationCurrency: string
    measurementUnit: string
    /** entidades incluidas, en orden de exposición */
    entities: { companyId: string; name: string; role: MemberRelation; ownership: number }[]
    rows: WorksheetRow[]
    eliminations: EliminationEntry[]
    nci: NonControllingInterestDetail[]
    checks: ValidationCheck[]
    /** motivos por los que el juego consolidado no puede emitirse */
    blockers: string[]
    /** advertencias que no impiden la emisión */
    warnings: string[]
}

// ─────────────────────────────────────────────────────────────
// 8. Entrada del motor
// ─────────────────────────────────────────────────────────────

/**
 * Estados individuales de una entidad tal como entran al motor de consolidación.
 * Son de SOLO LECTURA: el motor jamás los modifica.
 */
export interface ConsolidationEntityInput {
    companyId: string
    companyName: string
    relation: MemberRelation
    method: ConsolidationMethod
    ownership: number
    votingRights?: number
    /** juego individual canónico producido por src/reporting */
    statements: StatementsBundle
    /**
     * Balance de comprobación de la entidad ANTES de la refundición del
     * resultado, construido con el mismo `buildNormalizedTrialBalance` del motor
     * individual excluyendo el asiento estructural de cierre.
     *
     * Es la base correcta para consolidar: expone el patrimonio neto sin el
     * resultado del ejercicio y las cuentas de resultado con su movimiento del
     * período, de modo que TODA la hoja de trabajo vive en un único espacio
     * Debe−Haber cuya suma es exactamente cero. Así, cada eliminación es un
     * asiento balanceado en ese mismo espacio y el control de la ecuación
     * patrimonial es aritmética, no una comparación entre dos modelos.
     */
    trialBalance: NormalizedTrialBalance
    /** plan de cuentas aplicable a la entidad */
    accounts: Account[]
    /** cierre del ejercicio individual */
    periodEnd: string
    exerciseStatus: string
}

export interface ConsolidationEngineInput {
    consolidation: ConsolidationExercise
    group: EconomicGroup
    entities: ConsolidationEntityInput[]
    mappings: ConsolidationAccountMapping[]
    reciprocals: ReciprocalBalance[]
    operations: IntragroupOperation[]
    adjustments: ManualConsolidationAdjustment[]
    /** consolidación comparativa ya calculada (ejercicio anterior) */
    comparative?: ConsolidationWorksheet | null
}

// ─────────────────────────────────────────────────────────────
// 9. Panel de preparación
// ─────────────────────────────────────────────────────────────

export type ReadinessState = 'COMPLETE' | 'NEEDS_REVIEW' | 'BLOCKED' | 'NOT_APPLICABLE'

export interface ReadinessCheck {
    id: string
    label: string
    state: ReadinessState
    detail: string
    /** entidad a la que se refiere, si aplica */
    companyId?: string
    /** qué hacer para resolverlo */
    remediation?: string
}

export interface ReadinessReport {
    checks: ReadinessCheck[]
    /** true si ningún control quedó en BLOCKED */
    canConsolidate: boolean
    /** porcentaje de avance de la preparación, 0..100 */
    progress: number
}
