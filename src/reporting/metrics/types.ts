/**
 * Contrato de indicadores — Fase 2B (§13.1).
 *
 * Nunca: cero como sustituto de ausencia, Infinity, NaN, ni interpretación
 * automática engañosa. Todo resultado declara su fórmula, sus insumos con
 * origen, su período y sus limitaciones.
 */

export interface MetricInput {
    label: string
    value: number
    /** de dónde sale el importe (línea del estado / cuentas) */
    source: string
    /** true si es promedio (inicio+cierre)/2 */
    isAverage?: boolean
}

export type MetricResult =
    | {
        status: 'CALCULATED'
        value: number
        /** fórmula simbólica, ej: "AC / PC" */
        formula: string
        /** sustitución numérica, ej: "1.450.000 / 210.000" */
        substitution: string
        inputs: MetricInput[]
        interpretation: string
        warnings: string[]
        /** política de días usada, si aplica (ej: 365) */
        dayCountPolicy?: number
        unit: MetricUnit
        /** valor de referencia con significado matemático (ej.: 1 = cobertura exacta) */
        reference?: { value: number; label: string }
    }
    | {
        status: 'NOT_CALCULABLE'
        reason: string
        missingInputs: string[]
        formula: string
    }
    | {
        status: 'NOT_APPLICABLE'
        reason: string
        formula: string
    }
    | {
        status: 'INSUFFICIENT_INFORMATION'
        reason: string
        missingInputs: string[]
        formula: string
    }

export type MetricUnit = 'ratio' | 'percentage' | 'currency' | 'days' | 'times'

/**
 * Otra forma de calcular el mismo concepto que usan algunas cátedras o la
 * bibliografía internacional. Se muestra al lado del principal para que el
 * alumno reconozca el índice aunque lo vea con otra fórmula.
 */
export interface MetricVariant {
    label: string
    formula: string
    value: number | null
    unit: MetricUnit
    note?: string
}

export type MetricCategory = 'liquidez' | 'solvencia' | 'rentabilidad' | 'actividad' | 'flujo'

export interface MetricCatalogEntry {
    id: string
    label: string
    category: MetricCategory
    result: MetricResult
    /** variantes de cálculo (solo informativas) */
    variants?: MetricVariant[]
    /** el mismo indicador en el ejercicio anterior, cuando hay comparativo */
    previous?: MetricResult | null
}

/**
 * Parámetros del análisis. Son decisiones del analista que cambian el
 * resultado; por eso se declaran y se muestran, nunca se esconden.
 */
export interface MetricsOptions {
    /** alícuota de IVA para homogeneizar ventas/compras con los saldos (que incluyen IVA). 0 = sin IVA */
    vatRate?: number
    /** proporción de las ventas que fue a crédito (0–1) */
    creditSalesShare?: number
    /** proporción de las compras que fue a crédito (0–1) */
    creditPurchasesShare?: number
    /** PROMEDIO = (inicio + cierre) / 2; CIERRE = saldos finales (simplificación de muchos prácticos) */
    averaging?: 'PROMEDIO' | 'CIERRE'
    /** días del año comercial (365 o 360) */
    dayCount?: number
    /** ente sin fines de lucro: no se calcula rentabilidad sobre aportes */
    nonProfit?: boolean
}

export const DEFAULT_METRICS_OPTIONS: Required<MetricsOptions> = {
    vatRate: 0.21,
    creditSalesShare: 1,
    creditPurchasesShare: 1,
    averaging: 'PROMEDIO',
    dayCount: 365,
    nonProfit: false,
}

// ─────────────────────────────────────────────────────────────
// Análisis vertical y horizontal (§13.2 / §13.3)
// ─────────────────────────────────────────────────────────────

export interface VerticalAnalysisRow {
    lineId: string
    label: string
    amount: number
    /** base de comparación (total activo / financiación / ventas) */
    baseLabel: string
    baseAmount: number
    /** porcentaje sobre la base; null si la base es 0 */
    percentage: number | null
    level: number
}

export interface HorizontalAnalysisRow {
    lineId: string
    label: string
    current: number
    previous: number | null
    absoluteChange: number | null
    /** % de variación; null cuando la base es 0 o el signo invalida la lectura */
    percentageChange: number | null
    /** advertencia cuando el % no es interpretable */
    note?: string
    level: number
}
