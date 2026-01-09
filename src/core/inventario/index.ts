/**
 * Inventario Module - Public API
 * 
 * Re-exports all types and functions for the periodic inventory module.
 */

// Types
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

// Factory functions
export {
    generateInventoryId,
    createDefaultConfig,
    createEmptyProduct,
    createEmptyMovement,
    createDraftClosing,
    DEFAULT_ACCOUNT_CODES,
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
    calculateCMV,
    calculateResultadoBruto,
    updateClosingCalculations,
    generateClosingEntryLines,
    generateReversalEntryLines,
    formatClosingMemo,
} from './closing'
