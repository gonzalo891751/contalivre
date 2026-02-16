/**
 * Fixed Assets (Bienes de Uso) - Type Definitions
 *
 * Data models for the fixed assets module.
 * Follows Argentine accounting standards.
 */

/**
 * Category of fixed asset (tangibles)
 */
export type FixedAssetCategoryTangible =
    | 'Inmuebles'
    | 'Instalaciones'
    | 'Maquinarias'
    | 'Rodados'
    | 'Muebles y Utiles'
    | 'Equipos de Computacion'
    | 'Terrenos'
    | 'Otros'

/**
 * Category of intangible asset
 */
export type FixedAssetCategoryIntangible =
    | 'Software'
    | 'Marcas y Patentes'
    | 'Otros Intangibles'

/**
 * All asset categories (tangible + intangible)
 */
export type FixedAssetCategory = FixedAssetCategoryTangible | FixedAssetCategoryIntangible

/**
 * Asset type: tangible vs intangible
 */
export type FixedAssetType = 'TANGIBLE' | 'INTANGIBLE'

/**
 * Origin of the asset: purchase in current period vs opening balance
 */
export type FixedAssetOriginType = 'PURCHASE' | 'OPENING'

/**
 * Payment split for acquisition (contrapartida)
 */
export interface PaymentSplit {
    accountId: string
    amount: number
    percentage?: number
    description?: string
    /** Instrumento: transferencia, efectivo, cheque, cheque_diferido, pagare */
    instrumentType?: 'transferencia' | 'efectivo' | 'cheque' | 'cheque_diferido' | 'pagare'
    /** Fecha de vencimiento (para cheque diferido, pagaré) */
    dueDate?: string
}

/**
 * Deduction on acquisition invoice
 *
 * - BONIFICACION: commercial discount → reduces asset value (lowers netAmount)
 * - DESCUENTO_FINANCIERO: financial discount → exposed separately (Descuentos Obtenidos 4.6.09)
 */
export interface AcquisitionDeduction {
    type: 'BONIFICACION' | 'DESCUENTO_FINANCIERO'
    amount: number
    description?: string
}

/**
 * Retention/perception line on immediate payment (asiento #2)
 *
 * - RETENCION: withheld on IVA (when paying). Cr: Retenciones a depositar (2.1.03.03)
 * - PERCEPCION: charged on neto (if applicable). Dr: Percepciones sufridas (1.1.03.08)
 */
export interface AcquisitionTaxWithholding {
    id: string
    kind: 'RETENCION' | 'PERCEPCION'
    taxType: 'IVA' | 'IIBB' | 'GANANCIAS' | 'SUSS' | 'OTRO'
    rate?: number    // % applied (informational)
    amount: number
}

/**
 * Acquisition data for assets purchased in current period
 */
export interface AcquisitionData {
    date: string           // Fecha del asiento de compra
    docType: string        // Tipo comprobante (FC A, FC B, etc)
    docNumber: string      // Numero comprobante
    netAmount: number      // Neto gravado (after bonificación)
    vatRate: number        // Alicuota IVA (21, 10.5, 27, 0)
    vatAmount: number      // Monto IVA
    totalAmount: number    // Total factura (net + IVA - descto financiero)
    withVat: boolean       // true=discrimina IVA, false=sin IVA (IVA como costo)
    splits: PaymentSplit[] // Pagos inmediatos (asiento #2); sum <= totalAmount
    counterpartyName?: string // Nombre del proveedor (empty = genérico → Acreedores Varios)

    /** Bonificación / Descuento financiero (asiento #1) */
    deductions?: AcquisitionDeduction[]
    /** Retenciones / Percepciones (asiento #2 — pago) */
    withholdings?: AcquisitionTaxWithholding[]
}

/**
 * Opening data for assets from previous periods
 */
export interface OpeningData {
    initialAccumDep: number     // Amort. acum. inicial al inicio del ejercicio
    contraAccountId: string     // Cuenta contrapartida apertura (Capital social, Apertura, etc)
}

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
    assetType?: FixedAssetType        // TANGIBLE (default) or INTANGIBLE
    accountId: string                 // ID of asset account (e.g., 1.2.01.04.01)
    contraAccountId: string           // ID of accumulated depreciation account

    // Origin of the asset
    originType?: FixedAssetOriginType // PURCHASE (default) or OPENING

    // Historical Values
    acquisitionDate: string           // ISO date (YYYY-MM-DD)
    originalValue: number
    residualValuePct: number          // 0-100, default 0

    // Depreciation Configuration
    method: FixedAssetMethod
    lifeYears: number                 // For lineal methods (years)
    lifeMonths?: number               // Canonical life in months (lifeYears*12 if not set)
    lifeUnits?: number                // For units method (total estimated units)
    unitsUsedThisPeriod?: number      // Units produced/used this period

    // State
    status: FixedAssetStatus
    placedInServiceDate?: string      // When asset started being used (if different from acquisition)
    disposalDate?: string             // When sold/disposed
    disposalValue?: number            // Sale price if sold

    // Acquisition data (for originType=PURCHASE)
    acquisition?: AcquisitionData

    // Opening data (for originType=OPENING)
    opening?: OpeningData

    // RT6 Inflation Adjustment
    rt6Enabled: boolean
    rt6JournalEntryId?: string | null

    // Journal Linkage (prevents duplicates)
    linkedJournalEntryIds: string[]
    openingJournalEntryId?: string | null
    acquisitionJournalEntryId?: string | null  // ID del asiento de factura (devengamiento)
    paymentJournalEntryId?: string | null      // ID del asiento de pago inmediato

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
    assetType: FixedAssetType
}> = {
    // Tangibles (Bienes de Uso - 1.2.01.xx)
    'Inmuebles': {
        asset: '1.2.01.01',
        contra: '1.2.01.91',
        name: 'Inmuebles',
        contraName: 'Amort. Acum. Inmuebles',
        assetType: 'TANGIBLE',
    },
    'Instalaciones': {
        asset: '1.2.01.02',
        contra: '1.2.01.92',
        name: 'Instalaciones',
        contraName: 'Amort. Acum. Instalaciones',
        assetType: 'TANGIBLE',
    },
    'Muebles y Utiles': {
        asset: '1.2.01.03',
        contra: '1.2.01.93',
        name: 'Muebles y Utiles',
        contraName: 'Amort. Acum. Muebles y Utiles',
        assetType: 'TANGIBLE',
    },
    'Rodados': {
        asset: '1.2.01.04',
        contra: '1.2.01.94',
        name: 'Rodados',
        contraName: 'Amort. Acum. Rodados',
        assetType: 'TANGIBLE',
    },
    'Equipos de Computacion': {
        asset: '1.2.01.05',
        contra: '1.2.01.95',
        name: 'Equipos de Computacion',
        contraName: 'Amort. Acum. Equipos Computacion',
        assetType: 'TANGIBLE',
    },
    'Terrenos': {
        asset: '1.2.01.06',
        contra: '1.2.01.96',
        name: 'Terrenos',
        contraName: 'Amort. Acum. Terrenos',
        assetType: 'TANGIBLE',
    },
    'Maquinarias': {
        asset: '1.2.01.08',
        contra: '1.2.01.98',
        name: 'Maquinarias',
        contraName: 'Amort. Acum. Maquinarias',
        assetType: 'TANGIBLE',
    },
    'Otros': {
        asset: '1.2.01.09',
        contra: '1.2.01.99',
        name: 'Otros Bienes de Uso',
        contraName: 'Amort. Acum. Otros Bienes',
        assetType: 'TANGIBLE',
    },
    // Intangibles (Activos Intangibles - 1.2.02.xx)
    'Software': {
        asset: '1.2.02.01',
        contra: '1.2.02.91',
        name: 'Software',
        contraName: 'Amort. Acum. Software',
        assetType: 'INTANGIBLE',
    },
    'Marcas y Patentes': {
        asset: '1.2.02.02',
        contra: '1.2.02.92',
        name: 'Marcas y Patentes',
        contraName: 'Amort. Acum. Marcas y Patentes',
        assetType: 'INTANGIBLE',
    },
    'Otros Intangibles': {
        asset: '1.2.02.03',
        contra: '1.2.02.93',
        name: 'Otros Intangibles',
        contraName: 'Amort. Acum. Otros Intangibles',
        assetType: 'INTANGIBLE',
    },
}

/**
 * Depreciation expense account code
 */
export const DEPRECIATION_EXPENSE_CODE = '4.5.11'
export const DEPRECIATION_EXPENSE_NAME = 'Amortizaciones Bienes de Uso'

/**
 * Tangible asset categories
 */
export const TANGIBLE_CATEGORIES: FixedAssetCategoryTangible[] = [
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
 * Intangible asset categories
 */
export const INTANGIBLE_CATEGORIES: FixedAssetCategoryIntangible[] = [
    'Software',
    'Marcas y Patentes',
    'Otros Intangibles',
]

/**
 * All available categories (tangible + intangible)
 */
export const FIXED_ASSET_CATEGORIES: FixedAssetCategory[] = [
    ...TANGIBLE_CATEGORIES,
    ...INTANGIBLE_CATEGORIES,
]

/**
 * Asset type labels for display
 */
export const ASSET_TYPE_LABELS: Record<FixedAssetType, string> = {
    'TANGIBLE': 'Bien de Uso',
    'INTANGIBLE': 'Bien Intangible',
}

/**
 * Origin type labels for display
 */
export const ORIGIN_TYPE_LABELS: Record<FixedAssetOriginType, string> = {
    'PURCHASE': 'Compra en el ejercicio',
    'OPENING': 'Viene del ejercicio anterior',
}

/**
 * Check if category is intangible
 */
export function isIntangibleCategory(category: FixedAssetCategory): category is FixedAssetCategoryIntangible {
    return INTANGIBLE_CATEGORIES.includes(category as FixedAssetCategoryIntangible)
}

/**
 * Get asset type from category
 */
export function getAssetTypeFromCategory(category: FixedAssetCategory): FixedAssetType {
    return CATEGORY_ACCOUNT_CODES[category]?.assetType || 'TANGIBLE'
}

/**
 * Get effective life in months
 */
export function getLifeMonths(asset: FixedAsset): number {
    if (asset.lifeMonths !== undefined && asset.lifeMonths > 0) {
        return asset.lifeMonths
    }
    return (asset.lifeYears || 0) * 12
}

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
        assetType: 'TANGIBLE',
        originType: 'PURCHASE',
        acquisitionDate: new Date().toISOString().split('T')[0],
        originalValue: 0,
        residualValuePct: 0,
        method: 'lineal-year',
        lifeYears: 5,
        lifeMonths: 60,
        status: 'active',
        rt6Enabled: false,
    }
}

/**
 * Default acquisition data
 */
export function createDefaultAcquisition(): AcquisitionData {
    return {
        date: new Date().toISOString().split('T')[0],
        docType: 'FC A',
        docNumber: '',
        netAmount: 0,
        vatRate: 21,
        vatAmount: 0,
        totalAmount: 0,
        withVat: true,
        splits: [],
    }
}

/**
 * Default opening data
 */
export function createDefaultOpening(): OpeningData {
    return {
        initialAccumDep: 0,
        contraAccountId: '',
    }
}
