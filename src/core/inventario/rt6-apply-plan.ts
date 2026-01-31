/**
 * RT6 Inventory Apply Plan
 *
 * Builds a detailed plan for applying RT6 (inflation adjustment) from
 * cierre-valuacion Step 2 data to inventory VALUE_ADJUSTMENT movements.
 *
 * The plan maps each RT6 origin lot (EI, monthly purchases, expenses, etc.)
 * to concrete inventory movements, distributing deltas proportionally.
 */

import type { CierreValuacionState, PartidaRT6 } from '../cierre-valuacion/types'
import { computeRT6Partida, getPeriodFromDate } from '../cierre-valuacion/calc'
import type { BienesMovement, BienesProduct } from './types'

// ========================================
// Types
// ========================================

export type OriginCategory = 'EI' | 'COMPRAS' | 'GASTOS_COMPRA' | 'BONIF_COMPRA' | 'DEVOL_COMPRA'

export interface RT6ApplyPlanItem {
    /** ID of the inventory movement to adjust (null = EI / opening stock) */
    targetMovementId: string | null
    productId: string
    /** YYYY-MM period of the RT6 origin lot */
    period: string
    originCategory: OriginCategory
    /** Delta to apply (positive = increase, negative = decrease) */
    valueDelta: number
    /** Human-readable label for audit trail */
    label: string
    /** Historical value of the target (for display/audit) */
    historicalValue: number
}

export interface UnmatchedOrigin {
    period: string
    delta: number
    label: string
    accountCode: string
}

export interface RT6InventoryApplyPlan {
    items: RT6ApplyPlanItem[]
    unmatchedOrigins: UnmatchedOrigin[]
    /** sum(items.valueDelta) */
    totalDeltaControl: number
    /** Expected delta from RT6 entry inventory lines */
    totalDeltaExpected: number
    roundingDiff: number
    isValid: boolean
}

/** Maps inventory account keys to their account IDs */
export interface InventoryAccountMap {
    mercaderias?: string
    compras?: string
    gastosCompras?: string
    bonifCompras?: string
    devolCompras?: string
}

export interface BuildRT6PlanInput {
    /** The net delta from the RT6 journal entry's inventory lines */
    adjustmentAmount: number
    /** Inventory account ID → key mapping */
    inventoryAccountMap: InventoryAccountMap
    /** All current inventory movements */
    movements: BienesMovement[]
    /** All products (for EI distribution) */
    products: BienesProduct[]
    /** CierreValuacion persisted state (has partidasRT6 + indices + closingDate) */
    cierreState: CierreValuacionState
}

// ========================================
// Helpers
// ========================================

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

function getCategoryForAccountId(
    accountId: string,
    map: InventoryAccountMap
): OriginCategory | null {
    if (map.mercaderias && accountId === map.mercaderias) return 'EI'
    if (map.compras && accountId === map.compras) return 'COMPRAS'
    if (map.gastosCompras && accountId === map.gastosCompras) return 'GASTOS_COMPRA'
    if (map.bonifCompras && accountId === map.bonifCompras) return 'BONIF_COMPRA'
    if (map.devolCompras && accountId === map.devolCompras) return 'DEVOL_COMPRA'
    return null
}

function getCategoryLabel(cat: OriginCategory): string {
    switch (cat) {
        case 'EI': return 'EI'
        case 'COMPRAS': return 'Compra'
        case 'GASTOS_COMPRA': return 'Gasto s/compra'
        case 'BONIF_COMPRA': return 'Bonif s/compra'
        case 'DEVOL_COMPRA': return 'Devol s/compra'
    }
}

/**
 * Distribute a delta proportionally across targets by their historical value.
 * Last item gets the rounding remainder.
 */
function distributeProportionally(
    delta: number,
    targets: { id: string | null; productId: string; historicalValue: number; label: string }[]
): { id: string | null; productId: string; share: number; historicalValue: number; label: string }[] {
    const totalHistorical = targets.reduce((s, t) => s + Math.abs(t.historicalValue), 0)
    if (totalHistorical <= 0 || targets.length === 0) return []

    let remaining = delta
    return targets.map((t, i) => {
        const isLast = i === targets.length - 1
        const share = isLast
            ? remaining
            : round2((Math.abs(t.historicalValue) / totalHistorical) * delta)
        remaining = round2(remaining - share)
        return { id: t.id, productId: t.productId, share, historicalValue: t.historicalValue, label: t.label }
    })
}

// ========================================
// Main Function
// ========================================

export function buildRT6InventoryApplyPlan(input: BuildRT6PlanInput): RT6InventoryApplyPlan {
    const { adjustmentAmount, inventoryAccountMap, movements, products, cierreState } = input
    const { partidasRT6, indices, closingDate } = cierreState

    const closingPeriod = getPeriodFromDate(closingDate)
    const items: RT6ApplyPlanItem[] = []
    const unmatchedOrigins: UnmatchedOrigin[] = []

    // Build reverse map: accountId → OriginCategory
    const accountIdToCategory = new Map<string, OriginCategory>()
    for (const [, accId] of Object.entries(inventoryAccountMap)) {
        if (!accId) continue
        const cat = getCategoryForAccountId(accId, inventoryAccountMap)
        if (cat) accountIdToCategory.set(accId, cat)
    }

    // Find inventory-relevant RT6 partidas
    const relevantPartidas: { partida: PartidaRT6; category: OriginCategory }[] = []
    for (const p of partidasRT6) {
        if (!p.accountId) continue
        const cat = accountIdToCategory.get(p.accountId)
        if (cat) {
            relevantPartidas.push({ partida: p, category: cat })
        }
    }

    // Process each relevant partida
    for (const { partida, category } of relevantPartidas) {
        const computed = computeRT6Partida(partida, indices, closingPeriod)

        for (const lot of computed.itemsComputed) {
            const lotDelta = round2(lot.homog - lot.importeBase)
            if (Math.abs(lotDelta) < 0.01) continue

            const lotPeriod = getPeriodFromDate(lot.fechaOrigen)
            const catLabel = getCategoryLabel(category)

            if (category === 'EI') {
                // Map to products' opening inventory
                const productsWithOpening = products.filter(p => (p.openingQty * p.openingUnitCost) > 0)
                if (productsWithOpening.length === 0) {
                    unmatchedOrigins.push({
                        period: lotPeriod,
                        delta: lotDelta,
                        label: `${catLabel} ${lotPeriod} (sin productos con EI)`,
                        accountCode: partida.cuentaCodigo,
                    })
                    continue
                }

                const targets = productsWithOpening.map(p => ({
                    id: null as string | null,
                    productId: p.id,
                    historicalValue: p.openingQty * p.openingUnitCost,
                    label: `${catLabel} ${lotPeriod} · ${p.name}`,
                }))

                const distributed = distributeProportionally(lotDelta, targets)
                for (const d of distributed) {
                    items.push({
                        targetMovementId: d.id,
                        productId: d.productId,
                        period: lotPeriod,
                        originCategory: 'EI',
                        valueDelta: d.share,
                        label: d.label,
                        historicalValue: d.historicalValue,
                    })
                }
            } else {
                // COMPRAS, GASTOS_COMPRA, BONIF_COMPRA, DEVOL_COMPRA
                // Find matching inventory movements in the lot's period
                const matchingMovements = findMovementsForCategory(
                    movements, category, lotPeriod
                )

                if (matchingMovements.length === 0) {
                    // For GASTOS/BONIF/DEVOL, try falling back to regular purchases in same period
                    const fallbackMoves = (category !== 'COMPRAS')
                        ? findMovementsForCategory(movements, 'COMPRAS', lotPeriod)
                        : []

                    if (fallbackMoves.length > 0) {
                        const targets = fallbackMoves.map(m => {
                            const prod = products.find(p => p.id === m.productId)
                            return {
                                id: m.id as string | null,
                                productId: m.productId,
                                historicalValue: m.subtotal,
                                label: `${catLabel} ${lotPeriod} · ${prod?.name || 'Producto'} #${m.id.slice(0, 6)}`,
                            }
                        })

                        const distributed = distributeProportionally(lotDelta, targets)
                        for (const d of distributed) {
                            items.push({
                                targetMovementId: d.id,
                                productId: d.productId,
                                period: lotPeriod,
                                originCategory: category,
                                valueDelta: d.share,
                                label: d.label,
                                historicalValue: d.historicalValue,
                            })
                        }
                    } else {
                        unmatchedOrigins.push({
                            period: lotPeriod,
                            delta: lotDelta,
                            label: `${catLabel} ${lotPeriod} (sin movimientos)`,
                            accountCode: partida.cuentaCodigo,
                        })
                    }
                    continue
                }

                const targets = matchingMovements.map(m => {
                    const prod = products.find(p => p.id === m.productId)
                    return {
                        id: m.id as string | null,
                        productId: m.productId,
                        historicalValue: m.subtotal,
                        label: `${catLabel} ${lotPeriod} · ${prod?.name || 'Producto'} #${m.id.slice(0, 6)}`,
                    }
                })

                const distributed = distributeProportionally(lotDelta, targets)
                for (const d of distributed) {
                    items.push({
                        targetMovementId: d.id,
                        productId: d.productId,
                        period: lotPeriod,
                        originCategory: category,
                        valueDelta: d.share,
                        label: d.label,
                        historicalValue: d.historicalValue,
                    })
                }
            }
        }
    }

    const totalDeltaControl = round2(items.reduce((s, i) => s + i.valueDelta, 0))
    const roundingDiff = round2(adjustmentAmount - totalDeltaControl)

    return {
        items,
        unmatchedOrigins,
        totalDeltaControl,
        totalDeltaExpected: adjustmentAmount,
        roundingDiff,
        isValid: unmatchedOrigins.length === 0,
    }
}

/**
 * Find inventory movements matching a category in a given period (YYYY-MM).
 */
function findMovementsForCategory(
    movements: BienesMovement[],
    category: OriginCategory,
    period: string
): BienesMovement[] {
    return movements.filter(m => {
        if (m.type !== 'PURCHASE') return false
        const movPeriod = m.date.substring(0, 7)
        if (movPeriod !== period) return false

        switch (category) {
            case 'COMPRAS':
                return !m.isDevolucion
            case 'GASTOS_COMPRA':
                return !m.isDevolucion && (m.gastosCompra ?? 0) > 0
            case 'BONIF_COMPRA':
                return !m.isDevolucion && (m.bonificacionAmount ?? 0) > 0
            case 'DEVOL_COMPRA':
                return m.isDevolucion === true
            default:
                return false
        }
    })
}
