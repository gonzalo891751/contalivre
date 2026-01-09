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
 * Inventory mode (only PERIODIC in MVP)
 */
export type InventoryMode = 'PERIODIC'

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
    compras: '5.1.03',
    gastosCompras: '5.1.04',
    bonifCompras: '5.1.05',
    devolCompras: '5.1.06',
    ventas: '4.1.01',
    bonifVentas: '4.1.03',
    devolVentas: '4.1.04',
    ivaCF: '1.1.03.01',
    ivaDF: '2.1.03.01',
}
