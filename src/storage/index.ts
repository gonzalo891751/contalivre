// Database
export { db, generateId, cleanupDuplicateAccounts, hasDuplicateCodes } from './db'
export type { Settings } from './db'

// Seed data
export { loadSeedDataIfNeeded, resetDatabase, getAccountsByKind, getAccountTree, getChildAccounts, repairDefaultFxAccounts } from './seed'

// Accounts CRUD
export {
    getAllAccounts,
    getAccountById,
    getAccountByCode,
    createAccount,
    updateAccount,
    deleteAccount,
    searchAccounts,
    generateNextCode,
    getPostableAccounts,
    getChildren,
    hasChildren,
} from './accounts'

// Entries CRUD
export {
    getAllEntries,
    getEntryById,
    createEntry,
    updateEntry,
    deleteEntry,
    getEntriesByDateRange,
    countEntries,
    getLastEntry,
    createEmptyLine,
    getTodayISO,
} from './entries'

// Amortizaciones
export {
    loadAmortizationState,
    saveAmortizationState,
    clearAmortizationState,
} from './amortizaciones'

// Inventario
export {
    loadInventoryConfig,
    saveInventoryConfig,
    getAllProducts,
    getProductById,
    getProductBySku,
    createProduct,
    updateProduct,
    deleteProduct,
    getAllMovements,
    getMovementsByProduct,
    getMovementsByDateRange,
    createMovement,
    updateMovement,
    deleteMovement,
    getAllClosings,
    getClosingById,
    getClosingsByStatus,
    getLatestPostedClosing,
    createClosing,
    updateClosing,
    deleteClosing,
    getAccountBalanceByCode,
    getAccountIdByCode,
    clearAllInventoryData,
} from './inventario'

// Cierre Valuación
export {
    loadCierreValuacionState,
    saveCierreValuacionState,
    clearCierreValuacionState,
} from './cierre-valuacion'

// Bienes de Cambio (new costing model)
export {
    // Settings
    loadBienesSettings,
    saveBienesSettings,
    updateCostingMethod,
    // Products
    getAllBienesProducts,
    getBienesProductById,
    getBienesProductBySku,
    createBienesProduct,
    updateBienesProduct,
    deleteBienesProduct,
    // Movements
    getAllBienesMovements,
    getBienesMovementsByProduct,
    getBienesMovementsByDateRange,
    createBienesMovement,
    generateJournalForMovement,
    linkMovementToEntries,
    updateBienesMovement,
    updateBienesMovementWithJournal,
    deleteBienesMovement,
    deleteBienesMovementWithJournal,
    deleteBienesProductWithMovements,
    reconcileMovementJournalLinks,
    // Bulk
    clearAllBienesData,
    clearBienesPeriodData,
    importBienesProducts,
    // Queries
    getProductsWithLowStock,
    getAllBienesSKUs,
} from './bienes'

// Moneda Extranjera
export {
    // Settings
    loadFxSettings,
    saveFxSettings,
    // Mapping
    // (separado para smart mapping P0)
    // Accounts
    getAllFxAccounts,
    getFxAccountsByType,
    getFxAccountById,
    createFxAccount,
    updateFxAccount,
    deleteFxAccount,
    // Movements
    getAllFxMovements,
    getFxMovementsByAccount,
    createFxMovement,
    updateFxMovementWithJournal,
    generateJournalForFxMovement,
    linkFxMovementToEntries,
    markFxMovementAsNonAccounting,
    deleteFxMovementWithJournal,
    // Preview
    previewFxMovementJournal,
    // FIFO
    calculateFIFOCost,
    // Reconciliation
    reconcileFxJournalLinks,
    findOrphanFxEntries,
    getReconciliationData,
    // Liabilities
    getAllFxDebts,
    getFxDebtById,
    createFxDebt,
    updateFxDebt,
    deleteFxDebt,
    addFxDebtDisbursement,
    addFxDebtPayment,
    getAllFxLiabilities,
    createFxLiability,
    updateFxLiability,
    deleteFxLiability,
    // Balance
    calculateFxAccountBalance,
    // Bulk
    clearFxPeriodData,
    clearAllFxData,
} from './fx'

// FX Mapping helpers
export {
    suggestLedgerAccountForFxAsset,
    suggestLedgerAccountForFxDebt,
    ensureLedgerAccountExists,
} from './fxMapping'

// Export types from fx
export type { FxJournalPreview, FxReconciliationData } from './fx'

