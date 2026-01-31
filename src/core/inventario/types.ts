/**
 * Inventario - Type Definitions
 * 
 * Data models for periodic inventory management (Inventario Periódico por Diferencias).
 * Supports stock control in units and CMV calculation at period close.
 */

/**
 * Unit of measure for inventory products
 */
export type UnidadMedida = 'u' | 'kg' | 'lt'

/**
 * Movement type for stock operations
 */
export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE'

/**
 * Status of an inventory closing
 */
export type ClosingStatus = 'DRAFT' | 'POSTED' | 'REVERSED'

/**
 * Inventory mode
 * PERIODIC = Diferencias de inventario (CMV al cierre)
 * PERMANENT = Inventario permanente (CMV en cada venta)
 */
export type InventoryMode = 'PERIODIC' | 'PERMANENT'

// ========================================
// Product & Movement Types (Tab A)
// ========================================

/**
 * Inventory product for stock tracking
 */
export interface InventoryProduct {
    id: string
    sku: string
    description: string
    unit: UnidadMedida
    minStock?: number          // Optional minimum stock alert threshold
}

/**
 * Stock movement (operational kardex)
 */
export interface InventoryMovement {
    id: string
    date: string               // ISO date string (YYYY-MM-DD)
    productId: string
    type: TipoMovimiento
    quantity: number           // Always positive; sign determined by type
    observation?: string
    reference?: string         // Supplier, ticket number, etc.
}

/**
 * Kardex row with running balance
 */
export interface KardexRow {
    movement: InventoryMovement
    entrada: number
    salida: number
    saldo: number              // Running balance after this movement
}

/**
 * Stock summary for a product
 */
export interface ProductStock {
    product: InventoryProduct
    currentStock: number
    hasAlert: boolean          // currentStock < minStock
}

// ========================================
// Closing Types (Tab B)
// ========================================

/**
 * Detail line for per-product EF entry
 */
export interface InventoryClosingLine {
    productId: string
    productDescription: string
    quantity?: number          // Optional units
    unitValue?: number         // Optional unit value
    totalValue: number         // Net value (qty * unit or direct)
}

/**
 * Inventory closing record
 */
export interface InventoryClosing {
    id: string
    periodStart: string        // ISO date
    periodEnd: string          // ISO date
    closingDate: string        // ISO date (when entry is posted)

    // Existencias
    existenciaInicial: number  // $ neto
    existenciaFinal: number    // $ neto
    efLines?: InventoryClosingLine[]  // Per-product breakdown

    // Compras Netas components (fetched from ledger)
    compras: number
    gastosCompras: number
    bonifCompras: number
    devolCompras: number
    comprasNetas: number       // Calculated

    // CMV
    cmv: number                // Calculated: EI + CN - EF

    // Ventas Netas (informative)
    ventas: number
    bonifVentas: number
    devolVentas: number
    ventasNetas: number        // Calculated
    resultadoBruto: number     // Ventas Netas - CMV

    // IVA (informative)
    ivaCF: number
    ivaDF: number
    ivaBalance: number         // DF - CF

    // Audit trail
    journalEntryId?: string    // Generated closing entry ID
    status: ClosingStatus
    reversalEntryId?: string   // If reversed, the reversal entry ID

    // Timestamps
    createdAt: string
    updatedAt: string
}

// ========================================
// Configuration (Tab C)
// ========================================

/**
 * Account mapping keys
 */
export type AccountMappingKey =
    | 'mercaderias'
    | 'cmv'
    | 'variacionExistencias'
    | 'compras'
    | 'gastosCompras'
    | 'bonifCompras'
    | 'devolCompras'
    | 'ventas'
    | 'bonifVentas'
    | 'devolVentas'
    | 'ivaCF'
    | 'ivaDF'
    | 'diferenciaInventario'
    | 'aperturaInventario'
    | 'descuentosObtenidos'
    | 'descuentosOtorgados'

/**
 * Module configuration
 */
export interface InventoryConfig {
    id: string                 // Fixed ID for single-document store
    mode: InventoryMode
    allowNegativeStock: boolean
    accountMappings: Partial<Record<AccountMappingKey, string>>  // key → accountId
    lastUpdated: string
}

// ========================================
// State for persistence
// ========================================

/**
 * Complete inventory module state
 */
export interface InventoryState {
    config: InventoryConfig
    products: InventoryProduct[]
    movements: InventoryMovement[]
    closings: InventoryClosing[]
}

// ========================================
// Factory functions
// ========================================

/**
 * Generate unique ID
 */
export function generateInventoryId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create default config
 */
export function createDefaultConfig(): InventoryConfig {
    return {
        id: 'inventory-config',
        mode: 'PERIODIC',
        allowNegativeStock: false,
        accountMappings: {},
        lastUpdated: new Date().toISOString(),
    }
}

/**
 * Create empty product
 */
export function createEmptyProduct(): InventoryProduct {
    return {
        id: generateInventoryId('prod'),
        sku: '',
        description: '',
        unit: 'u',
    }
}

/**
 * Create empty movement
 */
export function createEmptyMovement(productId: string): InventoryMovement {
    return {
        id: generateInventoryId('mov'),
        date: new Date().toISOString().split('T')[0],
        productId,
        type: 'ENTRADA',
        quantity: 0,
    }
}

/**
 * Create draft closing
 */
export function createDraftClosing(periodStart: string, periodEnd: string): InventoryClosing {
    const now = new Date().toISOString()
    return {
        id: generateInventoryId('closing'),
        periodStart,
        periodEnd,
        closingDate: periodEnd,
        existenciaInicial: 0,
        existenciaFinal: 0,
        compras: 0,
        gastosCompras: 0,
        bonifCompras: 0,
        devolCompras: 0,
        comprasNetas: 0,
        cmv: 0,
        ventas: 0,
        bonifVentas: 0,
        devolVentas: 0,
        ventasNetas: 0,
        resultadoBruto: 0,
        ivaCF: 0,
        ivaDF: 0,
        ivaBalance: 0,
        status: 'DRAFT',
        createdAt: now,
        updatedAt: now,
    }
}

/**
 * Default account code mappings (Argentine chart of accounts)
 */
export const DEFAULT_ACCOUNT_CODES: Record<AccountMappingKey, string> = {
    mercaderias: '1.1.04.01',
    cmv: '5.1.01',
    variacionExistencias: '5.1.99',
    compras: '4.8.01',
    gastosCompras: '4.8.02',
    bonifCompras: '4.8.03',
    devolCompras: '4.8.04',
    ventas: '4.1.01',
    bonifVentas: '4.8.05',
    devolVentas: '4.8.06',
    ivaCF: '1.1.03.01',
    ivaDF: '2.1.03.01',
    diferenciaInventario: '4.3.02',
    aperturaInventario: '3.2.01',
    descuentosObtenidos: '4.6.09',
    descuentosOtorgados: '4.2.01',
}

// ========================================
// BIENES DE CAMBIO - New Costing Model
// ========================================

/**
 * Costing method for inventory valuation
 */
export type CostingMethod = 'FIFO' | 'LIFO' | 'PPP'

/**
 * Movement type for bienes de cambio (extended)
 */
export type BienesMovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'COUNT' | 'VALUE_ADJUSTMENT'

/**
 * Sub-classification for VALUE_ADJUSTMENT movements.
 * Distinguishes the origin so journal generation and UI labels are correct.
 */
export type AdjustmentKind =
    | 'RT6'
    | 'CAPITALIZATION'
    | 'BONUS_PURCHASE'
    | 'BONUS_SALE'
    | 'DISCOUNT_PURCHASE'
    | 'DISCOUNT_SALE'
    | 'OTHER'

/**
 * Journal integration status for inventory movements
 */
export type JournalStatus = 'generated' | 'linked' | 'none' | 'error' | 'missing' | 'desync'

/**
 * IVA rate for Argentina
 */
export type IVARate = 21 | 10.5 | 0

/**
 * Product category
 */
export type ProductCategory = 'MERCADERIA' | 'MATERIA_PRIMA' | 'PRODUCTO_TERMINADO' | 'OTROS'

/**
 * Product for bienes de cambio with costing support
 */
export interface BienesProduct {
    id: string
    sku: string
    name: string
    description?: string
    unit: UnidadMedida
    category: ProductCategory
    reorderPoint: number           // Stock minimo para alerta
    ivaRate: IVARate
    periodId?: string              // Ejercicio/periodo asociado (YYYY)
    // Cuentas contables asociadas (para Etapa 2)
    accountMercaderias?: string    // Cuenta de activo (ej: 1.1.04.01)
    accountCMV?: string            // Cuenta CMV (ej: 5.1.01)
    accountVentas?: string         // Cuenta ventas (ej: 4.1.01)
    // Inventario inicial
    openingQty: number
    openingUnitCost: number
    openingDate: string            // ISO date
    // Metadata
    createdAt: string
    updatedAt: string
}

/**
 * Currency basis for cost layers (RT6/RECPAM)
 * - 'HIST': Historical cost (original purchase value)
 * - 'CIERRE': Already reexpressed to closing currency (post RT6 adjustment)
 */
export type CurrencyBasis = 'HIST' | 'CIERRE'

/**
 * Cost layer for FIFO/LIFO tracking
 */
export interface CostLayer {
    date: string                   // Date of purchase
    quantity: number               // Remaining quantity in layer
    unitCost: number               // Unit cost of this layer
    movementId: string             // Reference to original purchase movement
    /**
     * Currency basis of the unitCost:
     * - 'HIST' (default): Historical cost, needs reexpression for homogeneous valuation
     * - 'CIERRE': Already reexpressed to closing currency (via RT6 VALUE_ADJUSTMENT)
     *            When 'CIERRE', valuation-homogenea uses coef=1 to avoid double reexpression
     */
    currencyBasis?: CurrencyBasis
}

/**
 * Movement for bienes de cambio with full costing
 */
export interface BienesMovement {
    id: string
    date: string                   // ISO date (YYYY-MM-DD)
    type: BienesMovementType
    productId: string
    quantity: number               // Always positive
    periodId?: string              // Ejercicio/periodo asociado (YYYY)
    // For purchases
    unitCost?: number              // Cost per unit (for PURCHASE)
    // For sales
    unitPrice?: number             // Selling price per unit (for SALE)
    // IVA
    ivaRate: IVARate
    ivaAmount: number              // Calculated IVA
    subtotal: number               // quantity * (unitCost or unitPrice)
    total: number                  // subtotal + ivaAmount
    // Costing (calculated at save time)
    costMethod: CostingMethod      // Snapshot of method at transaction time
    costUnitAssigned: number       // Assigned cost per unit (for SALE/ADJUSTMENT)
    costTotalAssigned: number      // Total cost assigned (for CMV calculation)
    costLayersUsed?: {             // Layers consumed (for SALE, FIFO/LIFO)
        movementId: string
        quantity: number
        unitCost: number
    }[]
    // Bonificaciones, descuentos, gastos (optional)
    bonificacionPct?: number       // % commercial discount (reduces base price)
    bonificacionAmount?: number    // $ calculated bonificación
    descuentoFinancieroPct?: number // % financial discount (goes to financial result)
    descuentoFinancieroAmount?: number // $ calculated descuento
    gastosCompra?: number          // $ purchase expenses (freight, insurance, etc.)
    isDevolucion?: boolean         // True if this is a return (purchase return / sale return)
    // VALUE_ADJUSTMENT sub-classification
    adjustmentKind?: AdjustmentKind // 'RT6' | 'CAPITALIZATION' | 'OTHER' — required for VALUE_ADJUSTMENT
    // RT6 inflation adjustment (VALUE_ADJUSTMENT only)
    valueDelta?: number            // $ change in valuation (positive = increase, negative = decrease)
    rt6Period?: string             // YYYY-MM period of the RT6 adjustment
    rt6SourceEntryId?: string      // Journal entry ID of the RT6 asiento that originated this
    originCategory?: 'EI' | 'COMPRAS' | 'GASTOS_COMPRA' | 'BONIF_COMPRA' | 'DEVOL_COMPRA'  // RT6 origin category for cierre breakdown
    sourceMovementId?: string      // Optional: purchase movement to target cost layers (capitalization)
    // Additional info
    counterparty?: string          // Supplier name (PURCHASE) or Customer (SALE)
    paymentMethod?: string         // Efectivo, Cuenta Corriente, etc.
    paymentSplits?: {              // Multiple payments/counterparties
        accountId: string
        amount: number
        method?: string
    }[]
    notes?: string
    reference?: string             // Invoice number, receipt, etc.
    // For Etapa 2: Journal integration
    autoJournal: boolean           // Flag: should generate journal entry
    linkedJournalEntryIds: string[] // References to generated entries (Etapa 2)
    journalStatus: JournalStatus   // Estado real del asiento
    journalMissingReason?: 'entry_deleted' | 'manual_unlinked'
    // Metadata
    createdAt: string
    updatedAt: string
}

/**
 * Settings for bienes de cambio module
 */
export interface BienesSettings {
    id: string                     // Fixed: 'bienes-settings'
    costMethod: CostingMethod      // Global costing method
    costMethodLocked: boolean      // True if there are exits (sales/adjustments)
    allowNegativeStock: boolean
    defaultIVARate: IVARate
    // Inventory mode: PERMANENT (CMV on each sale) vs PERIODIC (CMV at close)
    inventoryMode: InventoryMode
    // Auto-generate journal entries for movements (default true)
    autoJournalEntries: boolean
    // Account mappings (for Etapa 2)
    accountMappings: Partial<Record<AccountMappingKey, string>>
    periodGoals?: Record<string, { salesTarget?: number; marginTarget?: number }>
    // Date for opening balance calculation (optional, defaults to auto logic)
    openingBalanceDate?: string
    lastUpdated: string
}

/**
 * Stock valuation result for a product
 */
export interface ProductValuation {
    product: BienesProduct
    currentStock: number           // Units on hand
    layers: CostLayer[]            // Cost layers (for FIFO/LIFO)
    averageCost: number            // Weighted average cost (for PPP)
    totalValue: number             // Stock value
    hasAlert: boolean              // Stock below reorder point
}

/**
 * KPIs for bienes de cambio dashboard
 */
export interface BienesKPIs {
    totalProducts: number
    totalUnits: number
    stockValue: number             // Total inventory value
    cmvPeriod: number              // CMV in current period
    salesPeriod: number            // Sales in current period
    grossMargin: number            // (Sales - CMV) / Sales * 100
    lowStockAlerts: number         // Products below reorder point
}

// ========================================
// Factory Functions - Bienes de Cambio
// ========================================

/**
 * Create empty bienes product
 */
export function createEmptyBienesProduct(): BienesProduct {
    const now = new Date().toISOString()
    return {
        id: generateInventoryId('bprod'),
        sku: '',
        name: '',
        unit: 'u',
        category: 'MERCADERIA',
        reorderPoint: 0,
        ivaRate: 21,
        openingQty: 0,
        openingUnitCost: 0,
        openingDate: now.split('T')[0],
        createdAt: now,
        updatedAt: now,
    }
}

/**
 * Create empty bienes movement
 */
export function createEmptyBienesMovement(
    productId: string,
    type: BienesMovementType,
    costMethod: CostingMethod
): BienesMovement {
    const now = new Date().toISOString()
    return {
        id: generateInventoryId('bmov'),
        date: now.split('T')[0],
        type,
        productId,
        quantity: 0,
        ivaRate: 21,
        ivaAmount: 0,
        subtotal: 0,
        total: 0,
        costMethod,
        costUnitAssigned: 0,
        costTotalAssigned: 0,
        autoJournal: false,
        linkedJournalEntryIds: [],
        journalStatus: 'none',
        createdAt: now,
        updatedAt: now,
    }
}

/**
 * Create default bienes settings
 */
export function createDefaultBienesSettings(): BienesSettings {
    return {
        id: 'bienes-settings',
        costMethod: 'PPP',
        costMethodLocked: false,
        allowNegativeStock: false,
        defaultIVARate: 21,
        inventoryMode: 'PERMANENT',
        autoJournalEntries: true,
        accountMappings: {},
        periodGoals: {},
        lastUpdated: new Date().toISOString(),
    }
}

/**
 * Generate auto SKU from product name
 */
export function generateAutoSKU(name: string, existingSKUs: string[]): string {
    // Take first 3 letters of first 2 words + random suffix
    const words = name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/)
    const prefix = words.slice(0, 2).map(w => w.slice(0, 3)).join('')
    let suffix = 1
    let sku = `${prefix}-${String(suffix).padStart(3, '0')}`
    while (existingSKUs.includes(sku)) {
        suffix++
        sku = `${prefix}-${String(suffix).padStart(3, '0')}`
    }
    return sku
}
