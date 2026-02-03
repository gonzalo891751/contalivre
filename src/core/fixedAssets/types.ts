/**
 * Fixed Assets (Bienes de Uso) - Type Definitions
 *
 * Data models for the fixed assets module.
 * Follows Argentine accounting standards.
 */

/**
 * Category of fixed asset
 */
export type FixedAssetCategory =
    | 'Inmuebles'
    | 'Instalaciones'
    | 'Maquinarias'
    | 'Rodados'
    | 'Muebles y Utiles'
    | 'Equipos de Computacion'
    | 'Terrenos'
    | 'Otros'

/**
 * Depreciation method
 */
export type FixedAssetMethod = 'lineal-year' | 'lineal-month' | 'units' | 'none'

/**
 * Asset status
 */
export type FixedAssetStatus = 'active' | 'in_progress' | 'sold' | 'amortized'

/**
 * Fixed asset record
 */
export interface FixedAsset {
    id: string
    name: string
    periodId: string                  // Period of acquisition for filtering
    legacySourceId?: string           // Optional link to legacy amortization asset

    // Classification
    category: FixedAssetCategory
    accountId: string                 // ID of asset account (e.g., 1.2.01.04.01)
    contraAccountId: string           // ID of accumulated depreciation account

    // Historical Values
    acquisitionDate: string           // ISO date (YYYY-MM-DD)
    originalValue: number
    residualValuePct: number          // 0-100, default 0

    // Depreciation Configuration
    method: FixedAssetMethod
    lifeYears: number                 // For lineal methods
    lifeUnits?: number                // For units method (total estimated units)
    unitsUsedThisPeriod?: number      // Units produced/used this period

    // State
    status: FixedAssetStatus
    placedInServiceDate?: string      // When asset started being used (if different from acquisition)
    disposalDate?: string             // When sold/disposed
    disposalValue?: number            // Sale price if sold

    // RT6 Inflation Adjustment
    rt6Enabled: boolean
    rt6JournalEntryId?: string | null

    // Journal Linkage (prevents duplicates)
    linkedJournalEntryIds: string[]
    openingJournalEntryId?: string | null

    // Metadata
    notes?: string
    createdAt: string
    updatedAt: string
}

/**
 * Fixed asset event types
 */
export type FixedAssetEventType = 'IMPROVEMENT' | 'REVALUATION' | 'DISPOSAL' | 'DAMAGE'

/**
 * Fixed asset event record
 */
export interface FixedAssetEvent {
    id: string
    periodId: string
    assetId: string
    date: string
    type: FixedAssetEventType
    amount: number
    contraAccountId?: string
    notes?: string
    linkedJournalEntryId?: string | null
    createdAt: string
    updatedAt: string
}

/**
 * Category to account code mapping
 * Based on standard Argentine chart of accounts (Plan de Cuentas)
 */
export const CATEGORY_ACCOUNT_CODES: Record<FixedAssetCategory, {
    asset: string
    contra: string
    name: string
    contraName: string
}> = {
    'Inmuebles': {
        asset: '1.2.01.01',
        contra: '1.2.01.91',
        name: 'Inmuebles',
        contraName: 'Amort. Acum. Inmuebles',
    },
    'Instalaciones': {
        asset: '1.2.01.02',
        contra: '1.2.01.92',
        name: 'Instalaciones',
        contraName: 'Amort. Acum. Instalaciones',
    },
    'Maquinarias': {
        asset: '1.2.01.03',
        contra: '1.2.01.93',
        name: 'Maquinarias',
        contraName: 'Amort. Acum. Maquinarias',
    },
    'Rodados': {
        asset: '1.2.01.04',
        contra: '1.2.01.94',
        name: 'Rodados',
        contraName: 'Amort. Acum. Rodados',
    },
    'Muebles y Utiles': {
        asset: '1.2.01.05',
        contra: '1.2.01.95',
        name: 'Muebles y Utiles',
        contraName: 'Amort. Acum. Muebles y Utiles',
    },
    'Equipos de Computacion': {
        asset: '1.2.01.05',
        contra: '1.2.01.95',
        name: 'Equipos de Computacion',
        contraName: 'Amort. Acum. Equipos Computacion',
    },
    'Terrenos': {
        asset: '1.2.01.01',
        contra: '1.2.01.91',
        name: 'Terrenos',
        contraName: 'Amort. Acum. Terrenos',
    },
    'Otros': {
        asset: '1.2.01.06',
        contra: '1.2.01.96',
        name: 'Otros Bienes de Uso',
        contraName: 'Amort. Acum. Otros Bienes',
    },
}

/**
 * Depreciation expense account code
 */
export const DEPRECIATION_EXPENSE_CODE = '4.5.11'
export const DEPRECIATION_EXPENSE_NAME = 'Amortizaciones Bienes de Uso'

/**
 * All available categories
 */
export const FIXED_ASSET_CATEGORIES: FixedAssetCategory[] = [
    'Inmuebles',
    'Instalaciones',
    'Maquinarias',
    'Rodados',
    'Muebles y Utiles',
    'Equipos de Computacion',
    'Terrenos',
    'Otros',
]

/**
 * Status labels for display
 */
export const STATUS_LABELS: Record<FixedAssetStatus, string> = {
    active: 'En Uso',
    in_progress: 'En Proyecto',
    sold: 'Dado de Baja',
    amortized: 'Amortizado',
}

/**
 * Method labels for display
 */
export const METHOD_LABELS: Record<FixedAssetMethod, string> = {
    'lineal-year': 'Lineal (Anual)',
    'lineal-month': 'Lineal (Mensual)',
    'units': 'Unidades de Produccion',
    'none': 'No Amortizable',
}

/**
 * Generate unique fixed asset ID
 */
export function generateFixedAssetId(): string {
    return `fa-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate unique fixed asset event ID
 */
export function generateFixedAssetEventId(): string {
    return `fae-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Calculate depreciation values for a fixed asset
 */
export interface FixedAssetCalculation {
    valorResidual: number
    valorAmortizable: number
    amortizacionAnual: number
    amortizacionEjercicio: number
    acumuladaInicio: number
    acumuladaCierre: number
    valorLibro: number
    porcentajeDesgaste: number
    estado: 'ACTIVO' | 'AMORTIZADO' | 'NO_AMORTIZA' | 'EN_PROYECTO'
}

/**
 * Default values for creating a new asset
 */
export function createDefaultFixedAsset(periodId: string): Omit<FixedAsset, 'id' | 'createdAt' | 'updatedAt' | 'linkedJournalEntryIds' | 'accountId' | 'contraAccountId'> {
    return {
        name: '',
        periodId,
        category: 'Muebles y Utiles',
        acquisitionDate: new Date().toISOString().split('T')[0],
        originalValue: 0,
        residualValuePct: 0,
        method: 'lineal-year',
        lifeYears: 5,
        status: 'active',
        rt6Enabled: false,
    }
}
