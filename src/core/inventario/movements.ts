/**
 * Inventario - Movement Calculations
 * 
 * Pure functions for stock movement operations and kardex generation.
 * All calculations are in units (not monetary values).
 */

import type {
    InventoryMovement,
    InventoryProduct,
    KardexRow,
    ProductStock,
    TipoMovimiento,
    InventoryConfig,
} from './types'

/**
 * Get signed quantity based on movement type
 * ENTRADA = positive, SALIDA = negative, AJUSTE = can be either (stored as-is)
 */
export function getSignedQuantity(movement: InventoryMovement): number {
    switch (movement.type) {
        case 'ENTRADA':
            return Math.abs(movement.quantity)
        case 'SALIDA':
            return -Math.abs(movement.quantity)
        case 'AJUSTE':
            return movement.quantity // Can be positive or negative
        default:
            return 0
    }
}

/**
 * Calculate current stock for a product from movements
 */
export function calculateProductStock(
    movements: InventoryMovement[],
    productId: string
): number {
    return movements
        .filter(m => m.productId === productId)
        .reduce((sum, m) => sum + getSignedQuantity(m), 0)
}

/**
 * Get stock summary for all products
 */
export function getStockByProduct(
    products: InventoryProduct[],
    movements: InventoryMovement[]
): ProductStock[] {
    return products.map(product => {
        const currentStock = calculateProductStock(movements, product.id)
        return {
            product,
            currentStock,
            hasAlert: product.minStock !== undefined && currentStock < product.minStock,
        }
    })
}

/**
 * Validation result for a movement
 */
export interface MovementValidation {
    ok: boolean
    errors: string[]
}

/**
 * Validate a movement before saving
 */
export function validateMovement(
    movement: InventoryMovement,
    existingMovements: InventoryMovement[],
    config: InventoryConfig
): MovementValidation {
    const errors: string[] = []

    // Required fields
    if (!movement.date) {
        errors.push('La fecha es requerida')
    }

    if (!movement.productId) {
        errors.push('El producto es requerido')
    }

    if (movement.quantity <= 0 && movement.type !== 'AJUSTE') {
        errors.push('La cantidad debe ser mayor a 0')
    }

    // Check negative stock if not allowed
    if (!config.allowNegativeStock && movement.type === 'SALIDA') {
        // Calculate current stock excluding this movement (if it's an update)
        const otherMovements = existingMovements.filter(m => m.id !== movement.id)
        const currentStock = calculateProductStock(otherMovements, movement.productId)
        const afterStock = currentStock - Math.abs(movement.quantity)

        if (afterStock < 0) {
            errors.push(`Stock insuficiente. Stock actual: ${currentStock}, cantidad a retirar: ${movement.quantity}`)
        }
    }

    return {
        ok: errors.length === 0,
        errors,
    }
}

/**
 * Generate kardex (movements with running balance) for a product
 * Sorted by date ascending
 */
export function generateKardex(
    movements: InventoryMovement[],
    productId: string
): KardexRow[] {
    const productMovements = movements
        .filter(m => m.productId === productId)
        .sort((a, b) => a.date.localeCompare(b.date))

    let runningBalance = 0
    const kardex: KardexRow[] = []

    for (const movement of productMovements) {
        const signedQty = getSignedQuantity(movement)
        runningBalance += signedQty

        kardex.push({
            movement,
            entrada: movement.type === 'ENTRADA' ? movement.quantity : 0,
            salida: movement.type === 'SALIDA' ? movement.quantity : 0,
            saldo: runningBalance,
        })
    }

    return kardex
}

/**
 * Get movement type display label
 */
export function getMovementTypeLabel(type: TipoMovimiento): string {
    const labels: Record<TipoMovimiento, string> = {
        'ENTRADA': 'Entrada',
        'SALIDA': 'Salida',
        'AJUSTE': 'Ajuste',
    }
    return labels[type]
}

/**
 * Get movement type badge color class
 */
export function getMovementTypeClass(type: TipoMovimiento): string {
    const classes: Record<TipoMovimiento, string> = {
        'ENTRADA': 'chip-entrada',
        'SALIDA': 'chip-salida',
        'AJUSTE': 'chip-ajuste',
    }
    return classes[type]
}

/**
 * Get unit label
 */
export function getUnitLabel(unit: 'u' | 'kg' | 'lt'): string {
    const labels = {
        'u': 'unidades',
        'kg': 'kg',
        'lt': 'litros',
    }
    return labels[unit]
}

/**
 * Format quantity with unit
 */
export function formatQuantityWithUnit(qty: number, unit: 'u' | 'kg' | 'lt'): string {
    const unitAbbrev = unit === 'u' ? 'u' : unit
    return `${qty.toLocaleString('es-AR')} ${unitAbbrev}`
}
