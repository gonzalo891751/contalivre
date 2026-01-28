/**
 * Inventario Module - Public API
 *
 * Re-exports all types and functions for the periodic inventory module
 * and the new Bienes de Cambio module with FIFO/LIFO/PPP costing.
 */

// Legacy Types (Periodic Inventory)
export type {
    UnidadMedida,
    TipoMovimiento,
    ClosingStatus,
    InventoryMode,
    InventoryProduct,
    InventoryMovement,
    KardexRow,
    ProductStock,
    InventoryClosingLine,
    InventoryClosing,
    AccountMappingKey,
    InventoryConfig,
    InventoryState,
} from './types'

// Bienes de Cambio Types (New Costing Model)
export type {
    CostingMethod,
    BienesMovementType,
    IVARate,
    ProductCategory,
    JournalStatus,
    BienesProduct,
    CostLayer,
    BienesMovement,
    BienesSettings,
    ProductValuation,
    BienesKPIs,
} from './types'

// Legacy Factory functions
export {
    generateInventoryId,
    createDefaultConfig,
    createEmptyProduct,
    createEmptyMovement,
    createDraftClosing,
    DEFAULT_ACCOUNT_CODES,
} from './types'

// Bienes de Cambio Factory functions
export {
    createEmptyBienesProduct,
    createEmptyBienesMovement,
    createDefaultBienesSettings,
    generateAutoSKU,
} from './types'

// Movement calculations
export {
    calculateProductStock,
    getStockByProduct,
    validateMovement,
    generateKardex,
    getSignedQuantity,
} from './movements'

// Closing calculations
export {
    calculateComprasNetas,
    calculateVentasNetas,
    calculateCMV as calculateLegacyCMV,
    calculateResultadoBruto,
    updateClosingCalculations,
    generateClosingEntryLines,
    generateReversalEntryLines,
    formatClosingMemo,
} from './closing'

// Bienes de Cambio - Costing Engine
export {
    buildCostLayers,
    calculateExitCost,
    calculateWeightedAverageCost,
    calculateProductValuation,
    calculateAllValuations,
    calculateCMV,
    calculateSales,
    calculateBienesKPIs,
    validateExit,
    canChangeCostingMethod,
    recalculateAllCosts,
} from './costing'
