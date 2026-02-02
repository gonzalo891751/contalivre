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

    const movementsById = new Map(sorted.map(m => [m.id, m]))

    // Process each movement
    for (const mov of sorted) {
        if (mov.type === 'PURCHASE' && !mov.isDevolucion && mov.unitCost !== undefined && mov.quantity > 0) {
            // Inventariable cost = neto de bonificaciones + gastos s/compras (sin IVA, sin desc financiero)
            const inventariableUnitCost = computeInventariableUnitCost(mov)
            layers.push({
                date: mov.date,
                quantity: mov.quantity,
                unitCost: inventariableUnitCost,
                movementId: mov.id,
            })
        } else if (mov.type === 'PURCHASE' && mov.isDevolucion) {
            // Purchase return: remove from layers (prefer original purchase)
            const qtyToConsume = Math.abs(mov.quantity)
            if (qtyToConsume > 0) {
                const remaining = consumeFromTargetLayers(layers, qtyToConsume, mov.sourceMovementId)
                if (remaining > 0) {
                    consumeFromLayers(layers, remaining, method)
                }
            }
        } else if (mov.type === 'SALE' || (mov.type === 'ADJUSTMENT' && mov.quantity < 0)) {
            // Consume from layers based on method
            if (mov.type === 'SALE' && mov.isDevolucion) {
                // SALE RETURN: Restore to ORIGINAL layers (preserve FIFO date priority)
                // DO NOT create new layers with return date - this breaks PEPS ordering
                const qtyToReturn = Math.abs(mov.quantity)
                if (qtyToReturn > 0) {
                    const source = mov.sourceMovementId ? movementsById.get(mov.sourceMovementId) : undefined
                    const sourceLayers = source?.costLayersUsed || []

                    if (sourceLayers.length > 0 && source?.quantity) {
                        // Restore proportionally to original layers used by the sale
                        const sourceQty = Math.abs(source.quantity)
                        const ratio = sourceQty > 0 ? qtyToReturn / sourceQty : 0

                        sourceLayers.forEach(usedLayer => {
                            const qtyToRestore = usedLayer.quantity * ratio
                            if (qtyToRestore > 0) {
                                // Find existing layer with same movementId to restore to
                                const existingLayer = layers.find(l => l.movementId === usedLayer.movementId)

                                if (existingLayer) {
                                    // Layer still exists: add back the returned quantity
                                    existingLayer.quantity += qtyToRestore
                                } else {
                                    // Layer was fully consumed: recreate with ORIGINAL date
                                    // Get original purchase date from movement
                                    const originalMov = movementsById.get(usedLayer.movementId)
                                    const originalDate = originalMov?.date || mov.date // fallback to return date only if original not found

                                    layers.push({
                                        date: originalDate,
                                        quantity: qtyToRestore,
                                        unitCost: usedLayer.unitCost,
                                        movementId: usedLayer.movementId,
                                    })
                                }
                            }
                        })
                    } else if (mov.costUnitAssigned && qtyToReturn > 0) {
                        // Fallback: no costLayersUsed, use sourceMovementId to find original layer
                        const targetMovementId = mov.sourceMovementId || mov.id
                        const existingLayer = layers.find(l => l.movementId === targetMovementId)

                        if (existingLayer) {
                            existingLayer.quantity += qtyToReturn
                        } else {
                            // Get original date from source movement
                            const originalMov = mov.sourceMovementId ? movementsById.get(mov.sourceMovementId) : undefined
                            const originalDate = originalMov?.date || mov.date

                            layers.push({
                                date: originalDate,
                                quantity: qtyToReturn,
                                unitCost: mov.costUnitAssigned,
                                movementId: targetMovementId,
                            })
                        }
                    } else if (qtyToReturn > 0) {
                        // Last resort fallback: use average cost, try to find any existing layer
                        const totalQty = layers.reduce((s, l) => s + l.quantity, 0)
                        const avgCost = totalQty > 0
                            ? layers.reduce((s, l) => s + l.quantity * l.unitCost, 0) / totalQty
                            : 0
                        if (avgCost > 0 && layers.length > 0) {
                            // Add to oldest layer to maintain FIFO priority
                            const oldestLayer = [...layers].sort((a, b) => a.date.localeCompare(b.date))[0]
                            oldestLayer.quantity += qtyToReturn
                        } else if (avgCost > 0) {
                            // No layers exist, create one with original source date if available
                            const originalMov = mov.sourceMovementId ? movementsById.get(mov.sourceMovementId) : undefined
                            const originalDate = originalMov?.date || mov.date

                            layers.push({
                                date: originalDate,
                                quantity: qtyToReturn,
                                unitCost: avgCost,
                                movementId: mov.sourceMovementId || mov.id,
                            })
                        }
                    }
                }
            } else {
                const qtyToConsume = mov.type === 'SALE' ? mov.quantity : Math.abs(mov.quantity)
                consumeFromLayers(layers, qtyToConsume, method)
            }
        } else if (mov.type === 'ADJUSTMENT' && mov.quantity > 0 && mov.unitCost !== undefined) {
            // Positive adjustment adds a layer
            layers.push({
                date: mov.date,
                quantity: mov.quantity,
                unitCost: mov.unitCost,
                movementId: mov.id,
            })
        } else if (mov.type === 'INITIAL_STOCK' && mov.quantity > 0 && mov.unitCost !== undefined) {
            // P1: Existencia Inicial — crea capa igual que una compra
            // Reemplaza la capa ficticia de 'opening' si existe del producto
            const existingOpeningIdx = layers.findIndex(l => l.movementId === 'opening')
            if (existingOpeningIdx >= 0) {
                // Remove fake opening layer since we have a real INITIAL_STOCK movement
                layers.splice(existingOpeningIdx, 1)
            }
            layers.push({
                date: mov.date,
                quantity: mov.quantity,
                unitCost: mov.unitCost,
                movementId: mov.id,
            })
        } else if (mov.type === 'VALUE_ADJUSTMENT') {
            const affectsLayers = mov.adjustmentKind === 'RT6' || mov.adjustmentKind === 'CAPITALIZATION'
            if (!affectsLayers) continue
            // Value-only adjustment (RT6/capitalization): distribute across existing layers
            const delta = mov.valueDelta ?? mov.subtotal ?? 0
            if (delta !== 0) {
                const bySource = mov.sourceMovementId
                    ? layers.filter(l => l.movementId === mov.sourceMovementId && l.quantity > 0)
                    : []
                const targetLayers = bySource.length > 0 ? bySource : layers
                const totalTargetQty = targetLayers.reduce((s, l) => s + l.quantity, 0)
                if (totalTargetQty > 0) {
                    // Distribute by remaining quantity in the targeted layers
                    for (const layer of targetLayers) {
                        const share = layer.quantity / totalTargetQty
                        layer.unitCost += (delta * share) / layer.quantity
                        // RT6 adjustments reexpress cost to closing currency
                        // Mark layer to prevent double reexpression in valuation-homogenea
                        if (mov.adjustmentKind === 'RT6') {
                            layer.currencyBasis = 'CIERRE'
                        }
                    }
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

function consumeFromTargetLayers(
    layers: CostLayer[],
    quantity: number,
    movementId?: string
): number {
    if (!movementId) return quantity
    let remaining = quantity
    for (const layer of layers) {
        if (remaining <= 0) break
        if (layer.movementId !== movementId) continue
        const consume = Math.min(layer.quantity, remaining)
        layer.quantity -= consume
        remaining -= consume
    }
    return remaining
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
): { unitCost: number; totalCost: number; layersUsed?: { movementId: string; quantity: number; unitCost: number }[]; error?: string } {
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
            layersUsed: exitQuantity > 0 ? [{ movementId: 'avg', quantity: exitQuantity, unitCost }] : [],
        }
    }

    // FIFO or LIFO: calculate from layers
    const layers = [...valuation.layers] // Clone to not mutate
    let remaining = exitQuantity
    let totalCost = 0
    const layersUsed: { movementId: string; quantity: number; unitCost: number }[] = []

    if (method === 'FIFO') {
        // Consume from oldest first
        for (const layer of layers) {
            if (remaining <= 0) break
            const consume = Math.min(layer.quantity, remaining)
            totalCost += consume * layer.unitCost
            if (consume > 0) {
                layersUsed.push({ movementId: layer.movementId, quantity: consume, unitCost: layer.unitCost })
            }
            remaining -= consume
        }
    } else {
        // LIFO: consume from newest first
        for (let i = layers.length - 1; i >= 0 && remaining > 0; i--) {
            const consume = Math.min(layers[i].quantity, remaining)
            totalCost += consume * layers[i].unitCost
            if (consume > 0) {
                layersUsed.push({ movementId: layers[i].movementId, quantity: consume, unitCost: layers[i].unitCost })
            }
            remaining -= consume
        }
    }

    return {
        unitCost: totalCost / exitQuantity,
        totalCost,
        layersUsed,
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

    const movementsById = new Map(sorted.map(m => [m.id, m]))

    for (const mov of sorted) {
        if (mov.type === 'PURCHASE' && mov.unitCost !== undefined && !mov.isDevolucion) {
            // Add to inventory at inventariable cost (neto bonif + gastos)
            const invUnitCost = computeInventariableUnitCost(mov)
            totalQty += mov.quantity
            totalValue += mov.quantity * invUnitCost
        } else if (mov.type === 'PURCHASE' && mov.isDevolucion) {
            const qty = Math.abs(mov.quantity)
            if (qty > 0 && mov.unitCost !== undefined) {
                totalQty -= qty
                totalValue -= qty * mov.unitCost
            }
        } else if (mov.type === 'SALE') {
            if (mov.isDevolucion) {
                const qty = Math.abs(mov.quantity)
                const source = mov.sourceMovementId ? movementsById.get(mov.sourceMovementId) : undefined
                const sourceLayers = source?.costLayersUsed || []
                const sourceQty = source?.quantity ? Math.abs(source.quantity) : 0
                if (sourceLayers.length > 0 && sourceQty > 0) {
                    const ratio = qty / sourceQty
                    const returnedValue = sourceLayers.reduce((sum, layer) => sum + (layer.unitCost * layer.quantity * ratio), 0)
                    totalQty += qty
                    totalValue += returnedValue
                } else {
                    const unitCost = mov.costUnitAssigned || source?.costUnitAssigned || (totalQty > 0 ? totalValue / totalQty : 0)
                    totalQty += qty
                    totalValue += qty * unitCost
                }
            } else {
                // Remove at current average cost
                const avgCost = totalQty > 0 ? totalValue / totalQty : 0
                totalQty -= mov.quantity
                totalValue -= mov.quantity * avgCost
            }
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
            const affectsValue = mov.adjustmentKind === 'RT6' || mov.adjustmentKind === 'CAPITALIZATION'
            if (affectsValue) {
                // Value-only adjustment (e.g., RT6 inflation): changes value, not quantity
                totalValue += (mov.valueDelta ?? mov.subtotal ?? 0)
            }
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
            if (mov.isDevolucion) {
                currentStock -= Math.abs(mov.quantity)
            } else {
                currentStock += mov.quantity
            }
        } else if (mov.type === 'SALE') {
            if (mov.isDevolucion) {
                currentStock += Math.abs(mov.quantity)
            } else {
                currentStock -= mov.quantity
            }
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

    return filteredMovements.reduce((sum, m) => {
        if (m.type === 'SALE' && m.isDevolucion) {
            return sum - Math.abs(m.costTotalAssigned || 0)
        }
        return sum + (m.costTotalAssigned || 0)
    }, 0)
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
        if (mov.type === 'SALE' && mov.isDevolucion) {
            const product = products.find(p => p.id === mov.productId)
            if (product) {
                const qty = Math.abs(mov.quantity)
                const priorMovements = result.filter(m => m.productId === mov.productId)
                const source = mov.sourceMovementId
                    ? priorMovements.find(m => m.id === mov.sourceMovementId)
                    : undefined
                let costUnitAssigned = 0
                let costTotalAssigned = 0
                if (source?.costLayersUsed && source.costLayersUsed.length > 0) {
                    const sourceQty = Math.abs(source.quantity || 0)
                    const ratio = sourceQty > 0 ? qty / sourceQty : 0
                    costTotalAssigned = source.costLayersUsed.reduce((sum, layer) => sum + (layer.unitCost * layer.quantity * ratio), 0)
                    costUnitAssigned = qty > 0 ? costTotalAssigned / qty : 0
                } else if (source?.costUnitAssigned) {
                    costUnitAssigned = source.costUnitAssigned
                    costTotalAssigned = costUnitAssigned * qty
                } else {
                    const valuation = calculateProductValuation(product, priorMovements, newMethod)
                    costUnitAssigned = valuation.averageCost
                    costTotalAssigned = costUnitAssigned * qty
                }
                result.push({
                    ...mov,
                    costMethod: newMethod,
                    costUnitAssigned,
                    costTotalAssigned,
                    costLayersUsed: undefined,
                    updatedAt: new Date().toISOString(),
                })
            } else {
                result.push(mov)
            }
        } else if (mov.type === 'SALE' || (mov.type === 'ADJUSTMENT' && mov.quantity < 0)) {
            const product = products.find(p => p.id === mov.productId)
            if (product) {
                const qty = mov.type === 'SALE' ? mov.quantity : Math.abs(mov.quantity)
                // Calculate cost based on movements processed so far
                const { unitCost, totalCost, layersUsed } = calculateExitCost(
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
                    costLayersUsed: mov.type === 'SALE' ? layersUsed : undefined,
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
