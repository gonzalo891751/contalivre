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
        unit: 'ratio' | 'percentage' | 'currency' | 'days' | 'times'
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

export interface MetricCatalogEntry {
    id: string
    label: string
    category: 'liquidez' | 'solvencia' | 'rentabilidad' | 'actividad' | 'flujo'
    result: MetricResult
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
