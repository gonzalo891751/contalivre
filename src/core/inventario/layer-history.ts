/**
 * Layer History Engine for Bienes de Cambio
 *
 * Builds a complete audit trail of inventory lots including:
 * - Exhausted lots (not filtered out)
 * - Events per lot (CONSUMPTION, RETURN, ADJUSTMENT)
 * - Initial vs current quantity for progress bars
 *
 * This module complements buildCostLayers() which only returns active layers.
 */

import type {
    BienesProduct,
    BienesMovement,
    CostingMethod,
} from './types'
import { computeInventariableUnitCost } from './costing'

/**
 * Event types for lot history
 */
export type LotEventType = 'CREATION' | 'CONSUMPTION' | 'RETURN' | 'ADJUSTMENT'

/**
 * Single event in a lot's lifecycle
 */
export interface LotEvent {
    date: string
    type: LotEventType
    quantity: number // Negative for consumption, positive for return/adjustment
    referenceId: string // Movement ID that caused this event
    referenceMemo?: string // Description (e.g., "Venta #123", "Devolución")
    balanceAfter: number // Running balance after this event
}

/**
 * Complete history of a single lot
 */
export interface LotHistory {
    id: string // Unique lot ID (based on source movementId)
    originDate: string // Date of initial entry (purchase/opening)
    originType: 'OPENING' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN'
    initialQuantity: number // Original quantity when lot was created
    currentQuantity: number // Remaining quantity (can be 0 for exhausted lots)
    unitCostHistorico: number // Original unit cost (historical)
    events: LotEvent[]
    isExhausted: boolean // true if currentQuantity <= 0
}

/**
 * Build complete layer history for a product
 * Unlike buildCostLayers(), this keeps ALL lots (including exhausted ones)
 * and tracks events for audit trail.
 */
export function buildLayerHistory(
    product: BienesProduct,
    movements: BienesMovement[],
    method: CostingMethod
): LotHistory[] {
    // Sort movements chronologically
    const sorted = [...movements]
        .filter(m => m.productId === product.id)
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))

    const movementsById = new Map(sorted.map(m => [m.id, m]))

    // Lot history storage (keyed by movementId)
    const lots = new Map<string, LotHistory>()

    // Helper to get or create lot
    const getOrCreateLot = (
        movementId: string,
        date: string,
        initialQty: number,
        unitCost: number,
        originType: LotHistory['originType']
    ): LotHistory => {
        let lot = lots.get(movementId)
        if (!lot) {
            lot = {
                id: movementId,
                originDate: date,
                originType,
                initialQuantity: initialQty,
                currentQuantity: initialQty,
                unitCostHistorico: unitCost,
                events: [{
                    date,
                    type: 'CREATION',
                    quantity: initialQty,
                    referenceId: movementId,
                    referenceMemo: originType === 'OPENING' ? 'Existencia Inicial' : 'Compra',
                    balanceAfter: initialQty,
                }],
                isExhausted: initialQty <= 0,
            }
            lots.set(movementId, lot)
        }
        return lot
    }

    // Start with opening inventory
    if (product.openingQty > 0 && product.openingUnitCost > 0) {
        getOrCreateLot(
            'opening',
            product.openingDate,
            product.openingQty,
            product.openingUnitCost,
            'OPENING'
        )
    }

    // Process each movement
    for (const mov of sorted) {
        if (mov.type === 'PURCHASE' && !mov.isDevolucion && mov.unitCost !== undefined && mov.quantity > 0) {
            // New purchase creates a lot
            const inventariableUnitCost = computeInventariableUnitCost(mov)
            getOrCreateLot(mov.id, mov.date, mov.quantity, inventariableUnitCost, 'PURCHASE')

        } else if (mov.type === 'PURCHASE' && mov.isDevolucion) {
            // Purchase return: consume from target lot
            const qtyToConsume = Math.abs(mov.quantity)
            if (qtyToConsume > 0 && mov.sourceMovementId) {
                const lot = lots.get(mov.sourceMovementId)
                if (lot) {
                    lot.currentQuantity -= qtyToConsume
                    lot.isExhausted = lot.currentQuantity <= 0
                    lot.events.push({
                        date: mov.date,
                        type: 'CONSUMPTION',
                        quantity: -qtyToConsume,
                        referenceId: mov.id,
                        referenceMemo: 'Devolución de compra',
                        balanceAfter: lot.currentQuantity,
                    })
                }
            }

        } else if (mov.type === 'SALE' && mov.isDevolucion) {
            // Sale return: restore to original lots
            const qtyToReturn = Math.abs(mov.quantity)
            if (qtyToReturn > 0) {
                const source = mov.sourceMovementId ? movementsById.get(mov.sourceMovementId) : undefined
                const sourceLayers = source?.costLayersUsed || []

                if (sourceLayers.length > 0 && source?.quantity) {
                    const sourceQty = Math.abs(source.quantity)
                    const ratio = sourceQty > 0 ? qtyToReturn / sourceQty : 0

                    sourceLayers.forEach(usedLayer => {
                        const qtyToRestore = usedLayer.quantity * ratio
                        if (qtyToRestore > 0) {
                            let lot = lots.get(usedLayer.movementId)

                            if (!lot) {
                                // Lot doesn't exist yet (edge case), create it
                                const originalMov = movementsById.get(usedLayer.movementId)
                                lot = getOrCreateLot(
                                    usedLayer.movementId,
                                    originalMov?.date || mov.date,
                                    0, // Will be populated by the return
                                    usedLayer.unitCost,
                                    'RETURN'
                                )
                                // Adjust initial to match the return
                                lot.initialQuantity = qtyToRestore
                                lot.currentQuantity = qtyToRestore
                                lot.events[0].quantity = qtyToRestore
                                lot.events[0].balanceAfter = qtyToRestore
                            } else {
                                lot.currentQuantity += qtyToRestore
                                lot.isExhausted = lot.currentQuantity <= 0
                            }

                            lot.events.push({
                                date: mov.date,
                                type: 'RETURN',
                                quantity: qtyToRestore,
                                referenceId: mov.id,
                                referenceMemo: `Devolución de venta`,
                                balanceAfter: lot.currentQuantity,
                            })
                        }
                    })
                } else if (mov.sourceMovementId) {
                    // Fallback: try to find lot by sourceMovementId
                    const sourceSale = movementsById.get(mov.sourceMovementId)
                    if (sourceSale?.costLayersUsed?.length) {
                        // Use the first layer as target
                        const targetLayerId = sourceSale.costLayersUsed[0].movementId
                        const lot = lots.get(targetLayerId)
                        if (lot) {
                            lot.currentQuantity += qtyToReturn
                            lot.isExhausted = lot.currentQuantity <= 0
                            lot.events.push({
                                date: mov.date,
                                type: 'RETURN',
                                quantity: qtyToReturn,
                                referenceId: mov.id,
                                referenceMemo: 'Devolución de venta',
                                balanceAfter: lot.currentQuantity,
                            })
                        }
                    }
                }
            }

        } else if (mov.type === 'SALE' && !mov.isDevolucion) {
            // Regular sale: consume from lots based on costLayersUsed
            if (mov.costLayersUsed && mov.costLayersUsed.length > 0) {
                mov.costLayersUsed.forEach(usedLayer => {
                    const lot = lots.get(usedLayer.movementId)
                    if (lot) {
                        lot.currentQuantity -= usedLayer.quantity
                        lot.isExhausted = lot.currentQuantity <= 0
                        lot.events.push({
                            date: mov.date,
                            type: 'CONSUMPTION',
                            quantity: -usedLayer.quantity,
                            referenceId: mov.id,
                            referenceMemo: `Venta${mov.reference ? ' #' + mov.reference : ''}`,
                            balanceAfter: lot.currentQuantity,
                        })
                    }
                })
            } else {
                // Fallback: consume from lots in FIFO/LIFO order
                let remaining = mov.quantity
                const sortedLots = [...lots.values()]
                    .filter(l => l.currentQuantity > 0)
                    .sort((a, b) => method === 'LIFO'
                        ? b.originDate.localeCompare(a.originDate)
                        : a.originDate.localeCompare(b.originDate)
                    )

                for (const lot of sortedLots) {
                    if (remaining <= 0) break
                    const consume = Math.min(lot.currentQuantity, remaining)
                    lot.currentQuantity -= consume
                    lot.isExhausted = lot.currentQuantity <= 0
                    lot.events.push({
                        date: mov.date,
                        type: 'CONSUMPTION',
                        quantity: -consume,
                        referenceId: mov.id,
                        referenceMemo: `Venta${mov.reference ? ' #' + mov.reference : ''}`,
                        balanceAfter: lot.currentQuantity,
                    })
                    remaining -= consume
                }
            }

        } else if (mov.type === 'ADJUSTMENT' && mov.quantity > 0 && mov.unitCost !== undefined) {
            // Positive adjustment creates a new lot
            getOrCreateLot(mov.id, mov.date, mov.quantity, mov.unitCost, 'ADJUSTMENT')

        } else if (mov.type === 'ADJUSTMENT' && mov.quantity < 0) {
            // Negative adjustment consumes from lots
            let remaining = Math.abs(mov.quantity)
            const sortedLots = [...lots.values()]
                .filter(l => l.currentQuantity > 0)
                .sort((a, b) => method === 'LIFO'
                    ? b.originDate.localeCompare(a.originDate)
                    : a.originDate.localeCompare(b.originDate)
                )

            for (const lot of sortedLots) {
                if (remaining <= 0) break
                const consume = Math.min(lot.currentQuantity, remaining)
                lot.currentQuantity -= consume
                lot.isExhausted = lot.currentQuantity <= 0
                lot.events.push({
                    date: mov.date,
                    type: 'ADJUSTMENT',
                    quantity: -consume,
                    referenceId: mov.id,
                    referenceMemo: mov.notes || 'Ajuste negativo',
                    balanceAfter: lot.currentQuantity,
                })
                remaining -= consume
            }

        } else if (mov.type === 'VALUE_ADJUSTMENT') {
            // Value-only adjustment: distribute to lots and record event
            const affectsLayers = mov.adjustmentKind === 'RT6' || mov.adjustmentKind === 'CAPITALIZATION'
            if (!affectsLayers) continue

            const delta = mov.valueDelta ?? mov.subtotal ?? 0
            if (delta !== 0) {
                const targetLots = mov.sourceMovementId
                    ? [lots.get(mov.sourceMovementId)].filter(Boolean) as LotHistory[]
                    : [...lots.values()].filter(l => l.currentQuantity > 0)

                const totalQty = targetLots.reduce((s, l) => s + l.currentQuantity, 0)
                if (totalQty > 0) {
                    for (const lot of targetLots) {
                        const share = lot.currentQuantity / totalQty
                        const valueDelta = delta * share
                        // Update unit cost
                        if (lot.currentQuantity > 0) {
                            lot.unitCostHistorico += valueDelta / lot.currentQuantity
                        }
                        lot.events.push({
                            date: mov.date,
                            type: 'ADJUSTMENT',
                            quantity: 0, // Value-only, no qty change
                            referenceId: mov.id,
                            referenceMemo: mov.adjustmentKind === 'RT6' ? 'Ajuste RT6' : 'Capitalización',
                            balanceAfter: lot.currentQuantity,
                        })
                    }
                }
            }
        }
    }

    // Return all lots sorted by origin date
    return [...lots.values()].sort((a, b) =>
        method === 'LIFO'
            ? b.originDate.localeCompare(a.originDate)
            : a.originDate.localeCompare(b.originDate)
    )
}

/**
 * Get summary stats from lot history
 */
export function getLotHistorySummary(history: LotHistory[]): {
    totalInitial: number
    totalCurrent: number
    totalConsumed: number
    activeLots: number
    exhaustedLots: number
    totalValueHistorico: number
} {
    const totalInitial = history.reduce((s, l) => s + l.initialQuantity, 0)
    const totalCurrent = history.reduce((s, l) => s + Math.max(0, l.currentQuantity), 0)
    const totalConsumed = totalInitial - totalCurrent
    const activeLots = history.filter(l => !l.isExhausted).length
    const exhaustedLots = history.filter(l => l.isExhausted).length
    const totalValueHistorico = history.reduce((s, l) =>
        s + Math.max(0, l.currentQuantity) * l.unitCostHistorico, 0
    )

    return {
        totalInitial,
        totalCurrent,
        totalConsumed,
        activeLots,
        exhaustedLots,
        totalValueHistorico,
    }
}
