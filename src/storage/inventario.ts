/**
 * Inventario Storage
 * 
 * Persistence layer for the periodic inventory module using Dexie/IndexedDB.
 */

import { db } from './db'
import type {
    InventoryProduct,
    InventoryMovement,
    InventoryClosing,
    InventoryConfig,
} from '../core/inventario/types'
import { createDefaultConfig } from '../core/inventario/types'

const CONFIG_ID = 'inventory-config'

// ========================================
// Configuration
// ========================================

/**
 * Load inventory config (create default if not exists)
 */
export async function loadInventoryConfig(): Promise<InventoryConfig> {
    try {
        const config = await db.inventoryConfig.where('id').equals(CONFIG_ID).first()
        if (config) {
            return config
        }
    } catch (error) {
        console.warn('Error loading inventory config:', error)
    }

    // Return default config if none exists
    return createDefaultConfig()
}

/**
 * Save inventory config
 */
export async function saveInventoryConfig(config: InventoryConfig): Promise<void> {
    try {
        const configToSave = {
            ...config,
            id: CONFIG_ID,
            lastUpdated: new Date().toISOString(),
        }
        await db.inventoryConfig.put(configToSave)
    } catch (error) {
        console.error('Error saving inventory config:', error)
        throw error
    }
}

// ========================================
// Products
// ========================================

/**
 * Get all products
 */
export async function getAllProducts(): Promise<InventoryProduct[]> {
    return db.inventoryProducts.toArray()
}

/**
 * Get product by ID
 */
export async function getProductById(id: string): Promise<InventoryProduct | undefined> {
    return db.inventoryProducts.get(id)
}

/**
 * Get product by SKU
 */
export async function getProductBySku(sku: string): Promise<InventoryProduct | undefined> {
    return db.inventoryProducts.where('sku').equals(sku).first()
}

/**
 * Create a new product
 */
export async function createProduct(product: InventoryProduct): Promise<InventoryProduct> {
    // Check for duplicate SKU
    if (product.sku) {
        const existing = await getProductBySku(product.sku)
        if (existing) {
            throw new Error(`Ya existe un producto con SKU "${product.sku}"`)
        }
    }

    await db.inventoryProducts.add(product)
    return product
}

/**
 * Update a product
 */
export async function updateProduct(id: string, updates: Partial<InventoryProduct>): Promise<InventoryProduct> {
    const existing = await db.inventoryProducts.get(id)
    if (!existing) {
        throw new Error('Producto no encontrado')
    }

    // Check for duplicate SKU if changing it
    if (updates.sku && updates.sku !== existing.sku) {
        const other = await getProductBySku(updates.sku)
        if (other) {
            throw new Error(`Ya existe un producto con SKU "${updates.sku}"`)
        }
    }

    const updated = { ...existing, ...updates }
    await db.inventoryProducts.put(updated)
    return updated
}

/**
 * Delete a product (and optionally its movements)
 */
export async function deleteProduct(id: string, deleteMovements = false): Promise<void> {
    if (deleteMovements) {
        await db.inventoryMovements.where('productId').equals(id).delete()
    }
    await db.inventoryProducts.delete(id)
}

// ========================================
// Movements
// ========================================

/**
 * Get all movements (sorted by date descending)
 */
export async function getAllMovements(): Promise<InventoryMovement[]> {
    return db.inventoryMovements.orderBy('date').reverse().toArray()
}

/**
 * Get movements by product
 */
export async function getMovementsByProduct(productId: string): Promise<InventoryMovement[]> {
    return db.inventoryMovements
        .where('productId')
        .equals(productId)
        .sortBy('date')
}

/**
 * Get movements by date range
 */
export async function getMovementsByDateRange(
    startDate: string,
    endDate: string
): Promise<InventoryMovement[]> {
    return db.inventoryMovements
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray()
}

/**
 * Create a movement
 */
export async function createMovement(movement: InventoryMovement): Promise<InventoryMovement> {
    await db.inventoryMovements.add(movement)
    return movement
}

/**
 * Update a movement
 */
export async function updateMovement(
    id: string,
    updates: Partial<InventoryMovement>
): Promise<InventoryMovement> {
    const existing = await db.inventoryMovements.get(id)
    if (!existing) {
        throw new Error('Movimiento no encontrado')
    }

    const updated = { ...existing, ...updates }
    await db.inventoryMovements.put(updated)
    return updated
}

/**
 * Delete a movement
 */
export async function deleteMovement(id: string): Promise<void> {
    await db.inventoryMovements.delete(id)
}

// ========================================
// Closings
// ========================================

/**
 * Get all closings (sorted by periodEnd descending)
 */
export async function getAllClosings(): Promise<InventoryClosing[]> {
    return db.inventoryClosings.orderBy('periodEnd').reverse().toArray()
}

/**
 * Get closing by ID
 */
export async function getClosingById(id: string): Promise<InventoryClosing | undefined> {
    return db.inventoryClosings.get(id)
}

/**
 * Get closings by status
 */
export async function getClosingsByStatus(status: InventoryClosing['status']): Promise<InventoryClosing[]> {
    return db.inventoryClosings.where('status').equals(status).toArray()
}

/**
 * Get the latest posted closing (for EI of next period)
 */
export async function getLatestPostedClosing(): Promise<InventoryClosing | undefined> {
    const closings = await db.inventoryClosings
        .where('status')
        .equals('POSTED')
        .sortBy('periodEnd')
    return closings[closings.length - 1]
}

/**
 * Create a closing (draft)
 */
export async function createClosing(closing: InventoryClosing): Promise<InventoryClosing> {
    await db.inventoryClosings.add(closing)
    return closing
}

/**
 * Update a closing
 */
export async function updateClosing(
    id: string,
    updates: Partial<InventoryClosing>
): Promise<InventoryClosing> {
    const existing = await db.inventoryClosings.get(id)
    if (!existing) {
        throw new Error('Cierre no encontrado')
    }

    const updated = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    }
    await db.inventoryClosings.put(updated)
    return updated
}

/**
 * Delete a closing (only if DRAFT)
 */
export async function deleteClosing(id: string): Promise<void> {
    const closing = await db.inventoryClosings.get(id)
    if (closing && closing.status !== 'DRAFT') {
        throw new Error('Solo se pueden eliminar cierres en estado BORRADOR')
    }
    await db.inventoryClosings.delete(id)
}

// ========================================
// Account Balance Queries (from Ledger)
// ========================================

/**
 * Get account balance by code within a date range
 * Returns the sum of (debit - credit) for the account
 */
export async function getAccountBalanceByCode(
    code: string,
    startDate?: string,
    endDate?: string
): Promise<number> {
    // First find the account by code
    const account = await db.accounts.where('code').equals(code).first()
    if (!account) {
        console.warn(`Account with code "${code}" not found`)
        return 0
    }

    // Get all entries in range
    let entries = await db.entries.toArray()
    if (startDate) {
        entries = entries.filter(e => e.date >= startDate)
    }
    if (endDate) {
        entries = entries.filter(e => e.date <= endDate)
    }

    // Sum the account's movements
    let balance = 0
    for (const entry of entries) {
        for (const line of entry.lines) {
            if (line.accountId === account.id) {
                balance += line.debit - line.credit
            }
        }
    }

    return balance
}

/**
 * Get account ID by code
 */
export async function getAccountIdByCode(code: string): Promise<string | null> {
    const account = await db.accounts.where('code').equals(code).first()
    return account?.id || null
}

// ========================================
// Utility: Clear all inventory data
// ========================================

/**
 * Clear all inventory module data (for reset/testing)
 */
export async function clearAllInventoryData(): Promise<void> {
    await db.inventoryProducts.clear()
    await db.inventoryMovements.clear()
    await db.inventoryClosings.clear()
    await db.inventoryConfig.clear()
}
