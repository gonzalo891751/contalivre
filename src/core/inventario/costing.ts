/**
 * Costing Engine for Bienes de Cambio
 *
 * Implements FIFO, LIFO (UEPS), and PPP (Weighted Average) costing methods.
 * Pure functions for calculating CMV and inventory valuation.
 */

import type {
    BienesProduct,
    BienesMovement,
    CostingMethod,
    CostLayer,
    ProductValuation,
    BienesKPIs,
} from './types'

// ========================================
// Inventariable Cost
// ========================================

/**
 * Compute inventariable unit cost for a purchase movement.
 * Includes: precio neto de bonificaciones + gastos sobre compras.
 * Excludes: IVA, descuento financiero (goes to financial results).
 */
export function computeInventariableUnitCost(mov: BienesMovement): number {
    if (mov.unitCost === undefined || mov.quantity <= 0) return 0
    const bruto = mov.unitCost * mov.quantity
    const bonif = mov.bonificacionAmount ?? (mov.bonificacionPct ? bruto * mov.bonificacionPct / 100 : 0)
    const netoAfterBonif = bruto - bonif
    const gastos = mov.gastosCompra ?? 0
    return (netoAfterBonif + gastos) / mov.quantity
}

// ========================================
// Cost Layer Management
// ========================================

/**
 * Build cost layers from movements for a product
 * Layers represent remaining inventory by cost lot
 */
export function buildCostLayers(
    product: BienesProduct,
    movements: BienesMovement[],
    method: CostingMethod
): CostLayer[] {
    // Sort movements by date
    const sorted = [...movements]
        .filter(m => m.productId === product.id)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

    // Start with opening inventory as first layer
    const layers: CostLayer[] = []
    if (product.openingQty > 0 && product.openingUnitCost > 0) {
        layers.push({
            date: product.openingDate,
            quantity: product.openingQty,
            unitCost: product.openingUnitCost,
            movementId: 'opening',
        })
    }

    // Process each movement
    for (const mov of sorted) {
        if (mov.type === 'PURCHASE' && mov.unitCost !== undefined && mov.quantity > 0) {
            // Inventariable cost = neto de bonificaciones + gastos s/compras (sin IVA, sin desc financiero)
            const inventariableUnitCost = computeInventariableUnitCost(mov)
            layers.push({
                date: mov.date,
                quantity: mov.quantity,
                unitCost: inventariableUnitCost,
                movementId: mov.id,
            })
        } else if (mov.type === 'SALE' || (mov.type === 'ADJUSTMENT' && mov.quantity < 0)) {
            // Consume from layers based on method
            const qtyToConsume = mov.type === 'SALE' ? mov.quantity : Math.abs(mov.quantity)
            consumeFromLayers(layers, qtyToConsume, method)
        } else if (mov.type === 'ADJUSTMENT' && mov.quantity > 0 && mov.unitCost !== undefined) {
            // Positive adjustment adds a layer
            layers.push({
                date: mov.date,
                quantity: mov.quantity,
                unitCost: mov.unitCost,
                movementId: mov.id,
            })
        } else if (mov.type === 'VALUE_ADJUSTMENT') {
            // Value-only adjustment (RT6 inflation): distribute across existing layers
            const delta = mov.valueDelta ?? mov.subtotal ?? 0
            const totalLayerQty = layers.reduce((s, l) => s + l.quantity, 0)
            if (totalLayerQty > 0 && delta !== 0) {
                for (const layer of layers) {
                    const share = layer.quantity / totalLayerQty
                    layer.unitCost += (delta * share) / layer.quantity
                }
            }
        }
    }

    // Remove empty layers
    return layers.filter(l => l.quantity > 0)
}

/**
 * Consume quantity from layers based on costing method
 * Mutates the layers array in place
 */
function consumeFromLayers(
    layers: CostLayer[],
    quantity: number,
    method: CostingMethod
): void {
    let remaining = quantity

    if (method === 'FIFO') {
        // Consume from oldest first
        for (const layer of layers) {
            if (remaining <= 0) break
            const consume = Math.min(layer.quantity, remaining)
            layer.quantity -= consume
            remaining -= consume
        }
    } else if (method === 'LIFO') {
        // Consume from newest first (reverse order)
        for (let i = layers.length - 1; i >= 0 && remaining > 0; i--) {
            const consume = Math.min(layers[i].quantity, remaining)
            layers[i].quantity -= consume
            remaining -= consume
        }
    }
    // PPP doesn't use layers for consumption - it uses average cost
}

// ========================================
// Cost Calculation
// ========================================

/**
 * Calculate cost for a sale/exit using specified method
 * Returns { unitCost, totalCost } for the exit
 */
export function calculateExitCost(
    product: BienesProduct,
    movements: BienesMovement[],
    exitQuantity: number,
    method: CostingMethod
): { unitCost: number; totalCost: number; error?: string } {
    // Get current stock and valuation
    const valuation = calculateProductValuation(product, movements, method)

    // Check if we have enough stock
    if (exitQuantity > valuation.currentStock) {
        return {
            unitCost: 0,
            totalCost: 0,
            error: `Stock insuficiente. Disponible: ${valuation.currentStock}, Solicitado: ${exitQuantity}`,
        }
    }

    if (method === 'PPP') {
        // Use weighted average cost
        const unitCost = valuation.averageCost
        return {
            unitCost,
            totalCost: unitCost * exitQuantity,
        }
    }

    // FIFO or LIFO: calculate from layers
    const layers = [...valuation.layers] // Clone to not mutate
    let remaining = exitQuantity
    let totalCost = 0

    if (method === 'FIFO') {
        // Consume from oldest first
        for (const layer of layers) {
            if (remaining <= 0) break
            const consume = Math.min(layer.quantity, remaining)
            totalCost += consume * layer.unitCost
            remaining -= consume
        }
    } else {
        // LIFO: consume from newest first
        for (let i = layers.length - 1; i >= 0 && remaining > 0; i--) {
            const consume = Math.min(layers[i].quantity, remaining)
            totalCost += consume * layers[i].unitCost
            remaining -= consume
        }
    }

    return {
        unitCost: totalCost / exitQuantity,
        totalCost,
    }
}

/**
 * Calculate weighted average cost (PPP)
 */
export function calculateWeightedAverageCost(
    product: BienesProduct,
    movements: BienesMovement[]
): number {
    let totalQty = product.openingQty
    let totalValue = product.openingQty * product.openingUnitCost

    // Sort movements by date
    const sorted = [...movements]
        .filter(m => m.productId === product.id)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

    for (const mov of sorted) {
        if (mov.type === 'PURCHASE' && mov.unitCost !== undefined) {
            // Add to inventory at inventariable cost (neto bonif + gastos)
            const invUnitCost = computeInventariableUnitCost(mov)
            totalQty += mov.quantity
            totalValue += mov.quantity * invUnitCost
        } else if (mov.type === 'SALE') {
            // Remove at current average cost
            const avgCost = totalQty > 0 ? totalValue / totalQty : 0
            totalQty -= mov.quantity
            totalValue -= mov.quantity * avgCost
        } else if (mov.type === 'ADJUSTMENT') {
            if (mov.quantity > 0 && mov.unitCost !== undefined) {
                totalQty += mov.quantity
                totalValue += mov.quantity * mov.unitCost
            } else if (mov.quantity < 0) {
                const avgCost = totalQty > 0 ? totalValue / totalQty : 0
                totalQty -= Math.abs(mov.quantity)
                totalValue -= Math.abs(mov.quantity) * avgCost
            }
        } else if (mov.type === 'VALUE_ADJUSTMENT') {
            // Value-only adjustment (e.g., RT6 inflation): changes value, not quantity
            totalValue += (mov.valueDelta ?? mov.subtotal ?? 0)
        }
    }

    return totalQty > 0 ? totalValue / totalQty : 0
}

// ========================================
// Product Valuation
// ========================================

/**
 * Calculate current valuation for a product
 */
export function calculateProductValuation(
    product: BienesProduct,
    movements: BienesMovement[],
    method: CostingMethod
): ProductValuation {
    const productMovements = movements.filter(m => m.productId === product.id)
    const layers = buildCostLayers(product, productMovements, method)

    // Calculate current stock
    let currentStock = product.openingQty
    for (const mov of productMovements) {
        if (mov.type === 'PURCHASE') {
            currentStock += mov.quantity
        } else if (mov.type === 'SALE') {
            currentStock -= mov.quantity
        } else if (mov.type === 'ADJUSTMENT') {
            currentStock += mov.quantity // Can be negative
        } else if (mov.type === 'VALUE_ADJUSTMENT') {
            // No quantity change — value-only adjustment (RT6 inflation)
        } else if (mov.type === 'COUNT') {
            // Count sets the stock to the counted value
            // This is handled in closing, not here
        }
    }

    // Calculate average cost
    const averageCost = method === 'PPP'
        ? calculateWeightedAverageCost(product, productMovements)
        : layers.reduce((sum, l) => sum + l.quantity * l.unitCost, 0) /
          Math.max(1, layers.reduce((sum, l) => sum + l.quantity, 0))

    // Calculate total value based on method
    let totalValue: number
    if (method === 'PPP') {
        totalValue = currentStock * averageCost
    } else {
        totalValue = layers.reduce((sum, l) => sum + l.quantity * l.unitCost, 0)
    }

    return {
        product,
        currentStock,
        layers,
        averageCost,
        totalValue,
        hasAlert: product.reorderPoint > 0 && currentStock < product.reorderPoint,
    }
}

/**
 * Calculate valuation for all products
 */
export function calculateAllValuations(
    products: BienesProduct[],
    movements: BienesMovement[],
    method: CostingMethod
): ProductValuation[] {
    return products.map(p => calculateProductValuation(p, movements, method))
}

// ========================================
// CMV Calculation
// ========================================

/**
 * Calculate CMV (Cost of Goods Sold) for a period
 */
export function calculateCMV(
    movements: BienesMovement[],
    startDate?: string,
    endDate?: string
): number {
    let filteredMovements = movements.filter(m =>
        m.type === 'SALE' || (m.type === 'ADJUSTMENT' && m.quantity < 0)
    )

    if (startDate) {
        filteredMovements = filteredMovements.filter(m => m.date >= startDate)
    }
    if (endDate) {
        filteredMovements = filteredMovements.filter(m => m.date <= endDate)
    }

    return filteredMovements.reduce((sum, m) => sum + m.costTotalAssigned, 0)
}

/**
 * Calculate total sales for a period
 */
export function calculateSales(
    movements: BienesMovement[],
    startDate?: string,
    endDate?: string
): number {
    let salesMovements = movements.filter(m => m.type === 'SALE')

    if (startDate) {
        salesMovements = salesMovements.filter(m => m.date >= startDate)
    }
    if (endDate) {
        salesMovements = salesMovements.filter(m => m.date <= endDate)
    }

    return salesMovements.reduce((sum, m) => sum + m.subtotal, 0)
}

// ========================================
// KPIs Calculation
// ========================================

/**
 * Calculate KPIs for bienes de cambio dashboard
 */
export function calculateBienesKPIs(
    products: BienesProduct[],
    movements: BienesMovement[],
    method: CostingMethod,
    periodStart?: string,
    periodEnd?: string
): BienesKPIs {
    const valuations = calculateAllValuations(products, movements, method)

    const totalProducts = products.length
    const totalUnits = valuations.reduce((sum, v) => sum + v.currentStock, 0)
    const stockValue = valuations.reduce((sum, v) => sum + v.totalValue, 0)
    const lowStockAlerts = valuations.filter(v => v.hasAlert).length

    const cmvPeriod = calculateCMV(movements, periodStart, periodEnd)
    const salesPeriod = calculateSales(movements, periodStart, periodEnd)
    const grossMargin = salesPeriod > 0 ? ((salesPeriod - cmvPeriod) / salesPeriod) * 100 : 0

    return {
        totalProducts,
        totalUnits,
        stockValue,
        cmvPeriod,
        salesPeriod,
        grossMargin,
        lowStockAlerts,
    }
}

// ========================================
// Validation
// ========================================

/**
 * Check if a sale/exit is valid (enough stock)
 */
export function validateExit(
    product: BienesProduct,
    movements: BienesMovement[],
    exitQuantity: number,
    method: CostingMethod,
    allowNegative: boolean
): { valid: boolean; error?: string; currentStock: number } {
    const valuation = calculateProductValuation(product, movements, method)

    if (exitQuantity <= 0) {
        return { valid: false, error: 'La cantidad debe ser mayor a cero', currentStock: valuation.currentStock }
    }

    if (!allowNegative && exitQuantity > valuation.currentStock) {
        return {
            valid: false,
            error: `Stock insuficiente. Disponible: ${valuation.currentStock} ${product.unit}`,
            currentStock: valuation.currentStock,
        }
    }

    return { valid: true, currentStock: valuation.currentStock }
}

/**
 * Check if costing method can be changed
 * Returns false if there are exits (sales/adjustments) already recorded
 */
export function canChangeCostingMethod(movements: BienesMovement[]): boolean {
    return !movements.some(m =>
        m.type === 'SALE' ||
        (m.type === 'ADJUSTMENT' && m.quantity < 0)
    )
}

// ========================================
// Recalculation
// ========================================

/**
 * Recalculate cost assignments for all movements with a new method
 * This is used when changing costing method (with user confirmation)
 * Returns new movements with updated costUnitAssigned and costTotalAssigned
 */
export function recalculateAllCosts(
    products: BienesProduct[],
    movements: BienesMovement[],
    newMethod: CostingMethod
): BienesMovement[] {
    // Sort by date
    const sorted = [...movements].sort((a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    )

    const result: BienesMovement[] = []

    // Process each movement, recalculating costs for exits
    for (const mov of sorted) {
        if (mov.type === 'SALE' || (mov.type === 'ADJUSTMENT' && mov.quantity < 0)) {
            const product = products.find(p => p.id === mov.productId)
            if (product) {
                const qty = mov.type === 'SALE' ? mov.quantity : Math.abs(mov.quantity)
                // Calculate cost based on movements processed so far
                const { unitCost, totalCost } = calculateExitCost(
                    product,
                    result.filter(m => m.productId === mov.productId),
                    qty,
                    newMethod
                )
                result.push({
                    ...mov,
                    costMethod: newMethod,
                    costUnitAssigned: unitCost,
                    costTotalAssigned: totalCost,
                    updatedAt: new Date().toISOString(),
                })
            } else {
                result.push(mov)
            }
        } else {
            result.push({
                ...mov,
                costMethod: newMethod,
                updatedAt: new Date().toISOString(),
            })
        }
    }

    return result
}
