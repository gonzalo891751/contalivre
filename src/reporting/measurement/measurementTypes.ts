/**
 * Mediciones a valores corrientes al cierre — Fase 2J §7.
 *
 * Una medición NO es una reexpresión. La reexpresión cambia la unidad de medida
 * de un importe que ya estaba medido; la medición cambia el importe porque el
 * valor del bien cambió. Por eso una partida medida a valor corriente del cierre
 * ya está expresada en moneda de cierre y no vuelve a multiplicarse por un
 * coeficiente: hacerlo sería un doble ajuste.
 *
 * Cada medición guarda su criterio, su fuente y su evidencia, porque el importe
 * no se deriva de los libros: entra desde afuera y tiene que poder defenderse.
 */

/** Criterio de medición aplicado, según la RT 54 (t.o. RT 59) */
export type MeasurementCriterion =
    /** costo histórico sin actualización de la medición */
    | 'COSTO_HISTORICO'
    /** costo de adquisición */
    | 'COSTO_ADQUISICION'
    /** costo de producción */
    | 'COSTO_PRODUCCION'
    /** costo de construcción */
    | 'COSTO_CONSTRUCCION'
    /** valor neto de realización: precio de venta menos costos de venta */
    | 'VALOR_NETO_REALIZACION'
    /** costo de reposición del bien en el mercado en el que la entidad compra */
    | 'COSTO_REPOSICION'
    /** costo de reproducir el activo */
    | 'COSTO_REPRODUCCION'
    /** costo de reconstruir el activo */
    | 'COSTO_RECONSTRUCCION'
    /** valor razonable observable en un mercado activo */
    | 'VALOR_RAZONABLE'
    /** valor de cotización de un instrumento financiero */
    | 'VALOR_COTIZACION'
    /** valor descontado de flujos futuros */
    | 'VALOR_DESCONTADO'
    /** costo amortizado por tasa efectiva */
    | 'COSTO_AMORTIZADO'
    /** modelo de costo para bienes de uso o propiedades de inversión */
    | 'MODELO_COSTO'
    /** modelo de revaluación */
    | 'MODELO_REVALUACION'
    /** conversión al tipo de cambio aplicable al cierre */
    | 'TIPO_CAMBIO_CIERRE'
    /** comparación con el valor recuperable (deterioro) */
    | 'VALOR_RECUPERABLE'

export const CRITERION_LABEL: Record<MeasurementCriterion, string> = {
    COSTO_HISTORICO: 'Costo histórico',
    COSTO_ADQUISICION: 'Costo de adquisición',
    COSTO_PRODUCCION: 'Costo de producción',
    COSTO_CONSTRUCCION: 'Costo de construcción',
    VALOR_NETO_REALIZACION: 'Valor neto de realización',
    COSTO_REPOSICION: 'Costo de reposición',
    COSTO_REPRODUCCION: 'Costo de reproducción',
    COSTO_RECONSTRUCCION: 'Costo de reconstrucción',
    VALOR_RAZONABLE: 'Valor razonable',
    VALOR_COTIZACION: 'Valor de cotización',
    VALOR_DESCONTADO: 'Valor descontado de flujos futuros',
    COSTO_AMORTIZADO: 'Costo amortizado',
    MODELO_COSTO: 'Modelo de costo',
    MODELO_REVALUACION: 'Modelo de revaluación',
    TIPO_CAMBIO_CIERRE: 'Tipo de cambio de cierre',
    VALOR_RECUPERABLE: 'Comparación con el valor recuperable',
}

/** Rubros que la aplicación sabe medir al cierre */
export type MeasurableRubro =
    | 'BIENES_DE_CAMBIO'
    | 'INVERSIONES_FINANCIERAS'
    | 'MONEDA_EXTRANJERA'
    | 'PROPIEDADES_DE_INVERSION'
    | 'BIENES_DE_USO_REVALUADOS'
    | 'ACTIVOS_BIOLOGICOS'
    | 'PRODUCTOS_AGROPECUARIOS'
    | 'CREDITOS_Y_DEUDAS'

export const RUBRO_LABEL: Record<MeasurableRubro, string> = {
    BIENES_DE_CAMBIO: 'Bienes de cambio',
    INVERSIONES_FINANCIERAS: 'Inversiones financieras',
    MONEDA_EXTRANJERA: 'Moneda extranjera',
    PROPIEDADES_DE_INVERSION: 'Propiedades de inversión',
    BIENES_DE_USO_REVALUADOS: 'Bienes de uso (modelo de revaluación)',
    ACTIVOS_BIOLOGICOS: 'Activos biológicos',
    PRODUCTOS_AGROPECUARIOS: 'Productos agropecuarios',
    CREDITOS_Y_DEUDAS: 'Créditos y deudas con medición financiera',
}

export type MeasurementStatus =
    /** cargada, con su asiento todavía sin contabilizar */
    | 'PROPUESTA'
    /** su resultado por tenencia está contabilizado */
    | 'CONTABILIZADA'
    /** se revirtió el asiento; la medición queda como antecedente */
    | 'REVERTIDA'

export type RecoverabilityLevel = 'ACTIVO_INDIVIDUAL' | 'ACTIVIDAD_GENERADORA_EFECTIVO' | 'UNIDAD_MENOR'
export type RecoverableBasis = 'VNR' | 'VALOR_USO' | 'VALOR_RAZONABLE_MENOS_COSTOS' | 'MAYOR_VNR_VALOR_USO'

export interface RecoverabilityAssessment {
    required: boolean
    level: RecoverabilityLevel
    basis: RecoverableBasis
    accountingAmount: number
    netRealizableValue?: number
    valueInUse?: number
    fairValueLessCosts?: number
    recoverableAmount: number
    impairmentLoss: number
    reversal: number
    /** límite del reverso: valor contable que existiría sin deterioro previo */
    reversalCap?: number
    indicators: string[]
    evidence: string
    conclusion: string
}

export interface ClosingMeasurement {
    id: string
    companyId: string
    exerciseId: string
    /** fecha de la medición (normalmente el cierre) */
    measuredAt: string

    rubro: MeasurableRubro
    accountId: string
    accountCode: string
    accountName: string
    accountKind?: import('../../core/models').AccountKind
    normalSide?: import('../../core/models').NormalSide
    /** partida o lote dentro de la cuenta, cuando corresponda */
    item?: string
    quantity?: number

    criterion: MeasurementCriterion
    /** importe con el que la partida venía medida (histórico o reexpresado) */
    previousAmount: number
    /** ¿el importe anterior estaba reexpresado a moneda de cierre? */
    previousIsRestated: boolean
    unitValue?: number
    /** importe de la partida al cierre según el criterio aplicado */
    closingAmount: number

    /** de dónde salió el valor: mercado, publicación, cotización, tasación */
    source: string
    sourceUrl?: string
    /** documento de respaldo (nombre o referencia) */
    evidence?: string
    /** mercado considerado, cuando el criterio lo requiere */
    market?: string
    method?: string
    assumptions?: string

    /** comparación contra el valor recuperable, cuando corresponde */
    recoverableAmount?: number
    recoverability?: RecoverabilityAssessment

    /** decisión de política que fundamenta esta aplicación */
    policyDecisionId?: string
    policyRationale?: string
    policySource?: string

    /** closingAmount − previousAmount */
    difference: number
    /** cuenta de resultado que recibe el resultado por tenencia */
    holdingResultAccountId?: string

    status: MeasurementStatus
    /** asiento que reconoce el resultado por tenencia */
    journalEntryId?: string
    responsible?: string
    notes?: string

    createdAt: string
    updatedAt: string
}

/** Partida que exige medición y todavía no la tiene */
export interface PendingMeasurement {
    rubro: MeasurableRubro
    accountId: string
    accountCode: string
    accountName: string
    balance: number
    reason: string
}
