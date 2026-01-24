/**
 * Amortizaciones - Type Definitions
 * 
 * Data models for the depreciation/amortization calculator tool.
 */

/**
 * Tipo de vida útil
 */
export type VidaUtilTipo = 'AÑOS' | 'PORCENTAJE_ANUAL'

/**
 * Metodo de amortizacion
 */
export type AmortizationMethod = 'lineal-year' | 'lineal-month' | 'none'

/**
 * Estado del bien
 */
export type EstadoBien = 'ACTIVO' | 'AMORTIZADO' | 'NO_AMORTIZA'

/**
 * Bien de uso individual para amortización
 */
export interface AmortizationAsset {
    id: string
    rubro: string
    fechaAlta: string           // ISO date string (YYYY-MM-DD)
    detalle: string
    valorOrigen: number | null  // Nullable for empty rows
    residualPct: number         // % valor residual (default from global)
    amortizablePct: number      // % valor amortizable (default from global)
    vidaUtilValor: number | null
    vidaUtilTipo: VidaUtilTipo
    metodo: AmortizationMethod
    noAmortiza: boolean         // Checkbox "No amortiza (ej: Terreno)"
    overrideGlobals: boolean    // True if user manually edited % for this row
}

/**
 * Parámetros globales del ejercicio
 */
export interface AmortizationParams {
    fechaCierreEjercicio: string    // ISO date string (YYYY-MM-DD)
    residualPctGlobal: number       // Default: 5
    amortizablePctGlobal: number    // Default: 95
    prorrateoMensual: boolean       // Default: false
}

/**
 * Valores calculados para un bien
 */
export interface CalculatedValues {
    valorResidual: number | null           // VR = C * r
    valorAmortizable: number | null        // VA = C * a
    amortizacionEjercicio: number | null   // Amort. del ejercicio
    acumuladaInicio: number | null         // Acum. inicio
    acumuladaCierre: number | null         // Acum. cierre
    vrContable: number | null              // V.R. contable
    estado: EstadoBien                     // ACTIVO / AMORTIZADO / NO_AMORTIZA
}

/**
 * Fila completa de la tabla (asset + calculated)
 */
export interface AmortizationRow {
    asset: AmortizationAsset
    calculated: CalculatedValues
}

/**
 * Estado completo de la planilla (para persistencia)
 */
export interface AmortizationState {
    id: string                      // Fixed ID for single-document store
    params: AmortizationParams
    assets: AmortizationAsset[]
    assetsByPeriod?: Record<string, AmortizationAsset[]>
    lastUpdated: string             // ISO date string
}

/**
 * Totales de la planilla
 */
export interface AmortizationTotals {
    valorOrigen: number
    valorResidual: number
    valorAmortizable: number
    amortizacionEjercicio: number
    acumuladaCierre: number
    vrContable: number
}

/**
 * Default values for new assets
 */
export function createDefaultAsset(id: string, params: AmortizationParams): AmortizationAsset {
    return {
        id,
        rubro: 'Muebles y Utiles',
        fechaAlta: '',
        detalle: '',
        valorOrigen: null,
        residualPct: params.residualPctGlobal,
        amortizablePct: params.amortizablePctGlobal,
        vidaUtilValor: null,
        vidaUtilTipo: 'AÑOS',
        metodo: 'lineal-year',
        noAmortiza: false,
        overrideGlobals: false,
    }
}

/**
 * Default global parameters
 */
export function createDefaultParams(): AmortizationParams {
    const now = new Date()
    const year = now.getFullYear()
    return {
        fechaCierreEjercicio: `${year}-12-31`,
        residualPctGlobal: 0,
        amortizablePctGlobal: 100,
        prorrateoMensual: false,
    }
}

/**
 * Create initial state
 */
export function createInitialState(): AmortizationState {
    const params = createDefaultParams()
    return {
        id: 'amortizaciones-state',
        params,
        assets: [],
        lastUpdated: new Date().toISOString(),
    }
}

/**
 * Generate unique asset ID
 */
export function generateAssetId(): string {
    return `asset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
