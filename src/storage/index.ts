// Database
export { db, generateId, cleanupDuplicateAccounts, hasDuplicateCodes } from './db'
export type { Settings } from './db'

// Seed data
export { loadSeedDataIfNeeded, resetDatabase, getAccountsByKind, getAccountTree, getChildAccounts } from './seed'

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
