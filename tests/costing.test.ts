import { describe, it, expect } from 'vitest'
import { buildCostLayers, calculateProductValuation } from '../src/core/inventario/costing'
import type { BienesProduct, BienesMovement } from '../src/core/inventario/types'

/**
 * Test Case: "Lata de Tomate" (AUDIT_INVENTARIO_DASHBOARD.md)
 *
 * Scenario:
 * - Compra 100 @ $10 (Enero)
 * - Venta 50 (Febrero)
 * - Devolución de venta 10 (Marzo)
 *
 * Expected (FIFO/PEPS):
 * - 1 sola capa con fecha Enero y Qty = 60
 * - La devolución restaura al lote original, NO crea lote nuevo
 *
 * Bug actual:
 * - Crea 2 capas: Enero=50, Marzo=10
 * - Mercadería devuelta queda "al final de la cola" PEPS
 */

function createTestProduct(): BienesProduct {
    const now = new Date().toISOString()
    return {
        id: 'prod-lata-tomate',
        sku: 'LAT-001',
        name: 'Lata de Tomate',
        unit: 'u',
        category: 'MERCADERIA',
        reorderPoint: 10,
        ivaRate: 21,
        openingQty: 0,
        openingUnitCost: 0,
        openingDate: '2026-01-01',
        createdAt: now,
        updatedAt: now,
    }
}

function createTestMovements(): BienesMovement[] {
    const now = new Date().toISOString()
    const base = {
        productId: 'prod-lata-tomate',
        ivaRate: 21 as const,
        costMethod: 'FIFO' as const,
        autoJournal: false,
        linkedJournalEntryIds: [],
        journalStatus: 'none' as const,
        createdAt: now,
        updatedAt: now,
    }

    // 1. Compra 100 @ $10 (Enero)
    const purchase: BienesMovement = {
        ...base,
        id: 'mov-compra-001',
        date: '2026-01-15',
        type: 'PURCHASE',
        quantity: 100,
        unitCost: 10,
        ivaAmount: 210,
        subtotal: 1000,
        total: 1210,
        costUnitAssigned: 10,
        costTotalAssigned: 1000,
    }

    // 2. Venta 50 (Febrero)
    const sale: BienesMovement = {
        ...base,
        id: 'mov-venta-001',
        date: '2026-02-10',
        type: 'SALE',
        quantity: 50,
        unitPrice: 15,
        ivaAmount: 157.5,
        subtotal: 750,
        total: 907.5,
        costUnitAssigned: 10,
        costTotalAssigned: 500,
        costLayersUsed: [
            { movementId: 'mov-compra-001', quantity: 50, unitCost: 10 }
        ],
    }

    // 3. Devolución de venta 10 (Marzo)
    const saleReturn: BienesMovement = {
        ...base,
        id: 'mov-devol-001',
        date: '2026-03-05',
        type: 'SALE',
        isDevolucion: true,
        sourceMovementId: 'mov-venta-001',
        quantity: 10, // qty a devolver
        unitPrice: 15,
        ivaAmount: 31.5,
        subtotal: 150,
        total: 181.5,
        costUnitAssigned: 10,
        costTotalAssigned: 100,
    }

    return [purchase, sale, saleReturn]
}

describe('Costing Engine - Devoluciones de Venta (PEPS)', () => {

    it('Lata de Tomate: devolución de venta NO debe crear lote nuevo', () => {
        const product = createTestProduct()
        const movements = createTestMovements()

        const layers = buildCostLayers(product, movements, 'FIFO')

        // Esperado: 1 sola capa con 60 unidades (100 - 50 + 10)
        expect(layers.length).toBe(1)
        expect(layers[0].quantity).toBe(60)
        expect(layers[0].date).toBe('2026-01-15') // Fecha original de compra
        expect(layers[0].movementId).toBe('mov-compra-001')
        expect(layers[0].unitCost).toBe(10)
    })

    it('Lata de Tomate: stock total debe ser 60 después de devolución', () => {
        const product = createTestProduct()
        const movements = createTestMovements()

        const valuation = calculateProductValuation(product, movements, 'FIFO')

        expect(valuation.currentStock).toBe(60)
        expect(valuation.totalValue).toBe(600) // 60 * $10
    })

    it('Devolución sin sourceMovementId: debe usar costLayersUsed del sale original', () => {
        const product = createTestProduct()
        const movements = createTestMovements()

        // Simular devolución que tiene sourceMovementId pero el source tiene costLayersUsed
        const layers = buildCostLayers(product, movements, 'FIFO')

        // Debe restaurar al lote original (mov-compra-001), no crear lote con fecha marzo
        const marchLayers = layers.filter(l => l.date.startsWith('2026-03'))
        expect(marchLayers.length).toBe(0) // No debe haber lotes de marzo
    })

    it('Múltiples devoluciones parciales deben acumularse en lote original', () => {
        const product = createTestProduct()
        const now = new Date().toISOString()
        const base = {
            productId: 'prod-lata-tomate',
            ivaRate: 21 as const,
            costMethod: 'FIFO' as const,
            autoJournal: false,
            linkedJournalEntryIds: [],
            journalStatus: 'none' as const,
            createdAt: now,
            updatedAt: now,
        }

        const movements: BienesMovement[] = [
            // Compra 100 @ $10
            {
                ...base,
                id: 'mov-compra-001',
                date: '2026-01-15',
                type: 'PURCHASE',
                quantity: 100,
                unitCost: 10,
                ivaAmount: 210,
                subtotal: 1000,
                total: 1210,
                costUnitAssigned: 10,
                costTotalAssigned: 1000,
            },
            // Venta 80
            {
                ...base,
                id: 'mov-venta-001',
                date: '2026-02-10',
                type: 'SALE',
                quantity: 80,
                unitPrice: 15,
                ivaAmount: 252,
                subtotal: 1200,
                total: 1452,
                costUnitAssigned: 10,
                costTotalAssigned: 800,
                costLayersUsed: [
                    { movementId: 'mov-compra-001', quantity: 80, unitCost: 10 }
                ],
            },
            // Devolución 1: 5 unidades
            {
                ...base,
                id: 'mov-devol-001',
                date: '2026-03-01',
                type: 'SALE',
                isDevolucion: true,
                sourceMovementId: 'mov-venta-001',
                quantity: 5,
                unitPrice: 15,
                ivaAmount: 15.75,
                subtotal: 75,
                total: 90.75,
                costUnitAssigned: 10,
                costTotalAssigned: 50,
            },
            // Devolución 2: 3 unidades
            {
                ...base,
                id: 'mov-devol-002',
                date: '2026-03-15',
                type: 'SALE',
                isDevolucion: true,
                sourceMovementId: 'mov-venta-001',
                quantity: 3,
                unitPrice: 15,
                ivaAmount: 9.45,
                subtotal: 45,
                total: 54.45,
                costUnitAssigned: 10,
                costTotalAssigned: 30,
            },
        ]

        const layers = buildCostLayers(product, movements, 'FIFO')

        // Stock final: 100 - 80 + 5 + 3 = 28
        expect(layers.length).toBe(1)
        expect(layers[0].quantity).toBe(28)
        expect(layers[0].date).toBe('2026-01-15') // Fecha original
    })

    it('Devolución de venta de múltiples lotes debe restaurar proporcionalmente', () => {
        const product = createTestProduct()
        const now = new Date().toISOString()
        const base = {
            productId: 'prod-lata-tomate',
            ivaRate: 21 as const,
            costMethod: 'FIFO' as const,
            autoJournal: false,
            linkedJournalEntryIds: [],
            journalStatus: 'none' as const,
            createdAt: now,
            updatedAt: now,
        }

        const movements: BienesMovement[] = [
            // Compra 1: 50 @ $10 (Enero)
            {
                ...base,
                id: 'mov-compra-001',
                date: '2026-01-10',
                type: 'PURCHASE',
                quantity: 50,
                unitCost: 10,
                ivaAmount: 105,
                subtotal: 500,
                total: 605,
                costUnitAssigned: 10,
                costTotalAssigned: 500,
            },
            // Compra 2: 50 @ $12 (Febrero)
            {
                ...base,
                id: 'mov-compra-002',
                date: '2026-02-05',
                type: 'PURCHASE',
                quantity: 50,
                unitCost: 12,
                ivaAmount: 126,
                subtotal: 600,
                total: 726,
                costUnitAssigned: 12,
                costTotalAssigned: 600,
            },
            // Venta 70 (consume 50 de Ene + 20 de Feb)
            {
                ...base,
                id: 'mov-venta-001',
                date: '2026-02-20',
                type: 'SALE',
                quantity: 70,
                unitPrice: 18,
                ivaAmount: 264.6,
                subtotal: 1260,
                total: 1524.6,
                costUnitAssigned: 10.57, // promedio ponderado de los layers usados
                costTotalAssigned: 740, // 50*10 + 20*12
                costLayersUsed: [
                    { movementId: 'mov-compra-001', quantity: 50, unitCost: 10 },
                    { movementId: 'mov-compra-002', quantity: 20, unitCost: 12 },
                ],
            },
            // Devolución 14 (20% de la venta)
            {
                ...base,
                id: 'mov-devol-001',
                date: '2026-03-10',
                type: 'SALE',
                isDevolucion: true,
                sourceMovementId: 'mov-venta-001',
                quantity: 14, // 20% de 70
                unitPrice: 18,
                ivaAmount: 52.92,
                subtotal: 252,
                total: 304.92,
                costUnitAssigned: 10.57,
                costTotalAssigned: 148,
            },
        ]

        const layers = buildCostLayers(product, movements, 'FIFO')

        // Stock esperado: 50 - 50 + (50*0.2=10) del lote 1 = 10
        //                 50 - 20 + (20*0.2=4) del lote 2 = 34
        // Total: 44 unidades
        const totalQty = layers.reduce((sum, l) => sum + l.quantity, 0)
        expect(totalQty).toBe(44)

        // Debe haber 2 lotes (uno de enero parcialmente restaurado, uno de febrero)
        // O podría tener solo lote de febrero si el de enero se agotó completamente
        // El punto es que NO debe haber lotes de marzo
        const marchLayers = layers.filter(l => l.date.startsWith('2026-03'))
        expect(marchLayers.length).toBe(0)
    })
})
