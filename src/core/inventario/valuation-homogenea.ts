/**
 * Valuación Homogénea de Existencia Final
 *
 * Reexpresses ending inventory (EF) from historical cost (valores de origen)
 * to homogeneous currency (moneda de cierre) using FACPCE monthly indices.
 *
 * For FIFO/PEPS: each cost layer is reexpressed individually using
 *   coef = index(closingMonth) / index(originMonth)
 *
 * For PPP: the weighted average cost is treated as a single "layer"
 *   with a blended origin period (approximate).
 *
 * Reuses index helpers from cierre-valuacion module.
 */

import type { IndexRow } from '../cierre-valuacion/types'
import { getPeriodFromDate, getIndexForPeriod, calculateCoef } from '../cierre-valuacion/calc'
import type {
    BienesProduct,
    BienesMovement,
    CostingMethod,
    CostLayer,
    ProductValuation,
} from './types'
import { calculateAllValuations } from './costing'

// ========================================
// Types
// ========================================

/**
 * A cost layer with homogeneous reexpression data
 */
export interface HomogeneousLayer {
    /** Original cost layer */
    date: string
    quantity: number
    unitCostOrigen: number       // Historical ARS
    movementId: string
    /** Reexpression */
    originPeriod: string         // YYYY-MM
    closingPeriod: string        // YYYY-MM
    indexOrigen: number | null    // Index at origin
    indexCierre: number | null    // Index at closing
    coef: number                 // indexCierre / indexOrigen (1 if missing)
    unitCostHomog: number        // unitCostOrigen * coef
    totalOrigen: number          // quantity * unitCostOrigen
    totalHomog: number           // quantity * unitCostHomog
}

/**
 * Ending inventory valuation for a single product
 */
export interface ProductEndingValuation {
    product: BienesProduct
    method: CostingMethod
    endingQty: number
    /** Valores de origen (historical ARS) */
    endingValueOrigen: number
    /** Valores homogéneos (moneda de cierre ARS) */
    endingValueHomog: number
    /** Ajuste = homog - origen */
    ajuste: number
    /** Ajuste as % of origen */
    ajustePct: number
    /** Per-layer detail (FIFO/LIFO only; PPP has synthetic single layer) */
    layers: HomogeneousLayer[]
    /** Average cost (PPP) */
    averageCostOrigen: number
    averageCostHomog: number
}

/**
 * Aggregate ending inventory valuation
 */
export interface EndingInventoryValuation {
    closingPeriod: string
    method: CostingMethod
    totalEndingQty: number
    totalEndingValueOrigen: number
    totalEndingValueHomog: number
    totalAjuste: number
    totalAjustePct: number
    /** Per-product breakdown */
    products: ProductEndingValuation[]
    /** Whether indices were available for calculation */
    hasIndices: boolean
    /** Missing periods (no index found) */
    missingPeriods: string[]
}

// ========================================
// Core Functions
// ========================================

/**
 * Reexpress a single cost layer to homogeneous values
 */
export function reexpressLayer(
    layer: CostLayer,
    closingPeriod: string,
    indices: IndexRow[]
): HomogeneousLayer {
    const originPeriod = getPeriodFromDate(layer.date)
    const indexOrigen = getIndexForPeriod(indices, originPeriod) ?? null
    const indexCierre = getIndexForPeriod(indices, closingPeriod) ?? null
    const coef = calculateCoef(indexCierre ?? undefined, indexOrigen ?? undefined)

    return {
        date: layer.date,
        quantity: layer.quantity,
        unitCostOrigen: layer.unitCost,
        movementId: layer.movementId,
        originPeriod,
        closingPeriod,
        indexOrigen,
        indexCierre,
        coef,
        unitCostHomog: layer.unitCost * coef,
        totalOrigen: layer.quantity * layer.unitCost,
        totalHomog: layer.quantity * layer.unitCost * coef,
    }
}

/**
 * Compute ending inventory valuation for a single product
 */
export function computeProductEndingValuation(
    valuation: ProductValuation,
    method: CostingMethod,
    closingPeriod: string,
    indices: IndexRow[]
): ProductEndingValuation {
    const { product, currentStock, layers, averageCost, totalValue } = valuation

    if (method === 'PPP') {
        // For PPP, compute a blended origin period from all layers
        // Approximate: use weighted average of layer dates
        const blendedCoef = computeBlendedPPPCoef(valuation, closingPeriod, indices)
        const homogValue = totalValue * blendedCoef.coef
        const ajuste = homogValue - totalValue

        return {
            product,
            method,
            endingQty: currentStock,
            endingValueOrigen: totalValue,
            endingValueHomog: homogValue,
            ajuste,
            ajustePct: totalValue > 0 ? (ajuste / totalValue) * 100 : 0,
            layers: blendedCoef.syntheticLayers,
            averageCostOrigen: averageCost,
            averageCostHomog: averageCost * blendedCoef.coef,
        }
    }

    // FIFO / LIFO: reexpress each layer individually
    const homogLayers = layers.map(l => reexpressLayer(l, closingPeriod, indices))
    const endingValueOrigen = homogLayers.reduce((s, l) => s + l.totalOrigen, 0)
    const endingValueHomog = homogLayers.reduce((s, l) => s + l.totalHomog, 0)
    const ajuste = endingValueHomog - endingValueOrigen
    const totalQty = homogLayers.reduce((s, l) => s + l.quantity, 0)

    return {
        product,
        method,
        endingQty: currentStock,
        endingValueOrigen,
        endingValueHomog,
        ajuste,
        ajustePct: endingValueOrigen > 0 ? (ajuste / endingValueOrigen) * 100 : 0,
        layers: homogLayers,
        averageCostOrigen: totalQty > 0 ? endingValueOrigen / totalQty : 0,
        averageCostHomog: totalQty > 0 ? endingValueHomog / totalQty : 0,
    }
}

/**
 * Compute ending inventory valuation for ALL products
 */
export function computeEndingInventoryValuation(params: {
    products: BienesProduct[]
    movements: BienesMovement[]
    method: CostingMethod
    closingPeriod: string      // YYYY-MM (month of closing date)
    indices: IndexRow[]
}): EndingInventoryValuation {
    const { products, movements, method, closingPeriod, indices } = params

    const valuations = calculateAllValuations(products, movements, method)
    const missingPeriods = new Set<string>()

    const productValuations = valuations
        .filter(v => v.currentStock > 0)
        .map(v => {
            const pv = computeProductEndingValuation(v, method, closingPeriod, indices)
            // Collect missing periods
            for (const l of pv.layers) {
                if (l.indexOrigen === null) missingPeriods.add(l.originPeriod)
                if (l.indexCierre === null) missingPeriods.add(l.closingPeriod)
            }
            return pv
        })

    const totalEndingQty = productValuations.reduce((s, p) => s + p.endingQty, 0)
    const totalEndingValueOrigen = productValuations.reduce((s, p) => s + p.endingValueOrigen, 0)
    const totalEndingValueHomog = productValuations.reduce((s, p) => s + p.endingValueHomog, 0)
    const totalAjuste = totalEndingValueHomog - totalEndingValueOrigen
    const hasIndices = indices.length > 0 && missingPeriods.size === 0

    return {
        closingPeriod,
        method,
        totalEndingQty,
        totalEndingValueOrigen,
        totalEndingValueHomog,
        totalAjuste,
        totalAjustePct: totalEndingValueOrigen > 0 ? (totalAjuste / totalEndingValueOrigen) * 100 : 0,
        products: productValuations,
        hasIndices,
        missingPeriods: Array.from(missingPeriods).sort(),
    }
}

// ========================================
// PPP Helpers
// ========================================

/**
 * For PPP, compute a blended coefficient by weighting each remaining layer's
 * value proportion against its origin-to-closing coefficient.
 * Returns the blended coef and a synthetic layer for UI display.
 */
function computeBlendedPPPCoef(
    valuation: ProductValuation,
    closingPeriod: string,
    indices: IndexRow[]
): { coef: number; syntheticLayers: HomogeneousLayer[] } {
    const { layers, totalValue, currentStock, averageCost } = valuation

    if (layers.length === 0 || totalValue <= 0) {
        // No layers: use a single synthetic layer with coef=1
        return {
            coef: 1,
            syntheticLayers: [],
        }
    }

    // Reexpress each layer and compute weighted coef
    const homogLayers = layers.map(l => reexpressLayer(l, closingPeriod, indices))
    const totalOrigen = homogLayers.reduce((s, l) => s + l.totalOrigen, 0)
    const totalHomog = homogLayers.reduce((s, l) => s + l.totalHomog, 0)
    const blendedCoef = totalOrigen > 0 ? totalHomog / totalOrigen : 1

    // For PPP we show a single synthetic layer representing the weighted average
    const syntheticLayer: HomogeneousLayer = {
        date: 'PPP',
        quantity: currentStock,
        unitCostOrigen: averageCost,
        movementId: 'ppp-synthetic',
        originPeriod: 'blended',
        closingPeriod,
        indexOrigen: null,
        indexCierre: null,
        coef: blendedCoef,
        unitCostHomog: averageCost * blendedCoef,
        totalOrigen: totalValue,
        totalHomog: totalValue * blendedCoef,
    }

    return {
        coef: blendedCoef,
        syntheticLayers: [syntheticLayer],
    }
}
