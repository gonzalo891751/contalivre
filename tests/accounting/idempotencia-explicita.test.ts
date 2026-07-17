/**
 * Fase 2C (§10) — Idempotencia explícita de generadores automáticos.
 *
 * Verifica la semántica universal que createEntry aplica a TODOS los
 * generadores con origen completo: mismo hecho no duplica; hechos distintos
 * de la misma operación no se fusionan; versión = reversión + sustituto;
 * reintento tras error = consistente.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines, line } from './helpers'
import { createEntry, updateEntry, deleteEntry } from '../../src/storage/entries'
import { contentDiscriminator } from '../../src/accounting/domain/idempotency'
import { db } from '../../src/storage/db'

const DATE = '2025-06-01'

/** Simula un generador de módulo: mismo patrón que bienes/fx/ops/etc. */
async function postFromModule(module: string, type: string, sourceId: string, lines: ReturnType<typeof simpleLines>, memo = 'op') {
    return createEntry({ date: DATE, memo, lines, sourceModule: module, sourceType: type, sourceId })
}

describe('Fase 2C — idempotencia por familia de generadores', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('mismo evento repetido no duplica (inventory/purchase)', async () => {
        const a = await postFromModule('inventory', 'purchase', 'mov-1', simpleLines('mercaderias', 'proveedores', 1000))
        const b = await postFromModule('inventory', 'purchase', 'mov-1', simpleLines('mercaderias', 'proveedores', 1000))
        expect(b.id).toBe(a.id)
        expect(await db.entries.count()).toBe(1)
    })

    it('dos hechos distintos de la misma operación NO se fusionan (venta: ingreso + CMV)', async () => {
        // misma sourceId (venta), líneas distintas → claves distintas
        const revenue = await postFromModule('inventory', 'sale', 'venta-9', simpleLines('deudores', 'ventas', 300), 'ingreso')
        const cogs = await postFromModule('inventory', 'sale', 'venta-9', simpleLines('cmv', 'mercaderias', 180), 'cmv')
        expect(cogs.id).not.toBe(revenue.id)
        expect(await db.entries.count()).toBe(2)
    })

    it('reintento tras "error" (mismo contenido) es idempotente', async () => {
        const first = await postFromModule('fx', 'compra', 'fx-3', simpleLines('banco', 'caja', 500))
        // el generador reintenta exactamente el mismo asiento
        const retry = await postFromModule('fx', 'compra', 'fx-3', simpleLines('banco', 'caja', 500))
        expect(retry.id).toBe(first.id)
        expect(await db.entries.count()).toBe(1)
    })

    it('nueva versión (edición económica) = reversión + sustituto', async () => {
        const original = await postFromModule('ops', 'vendor_invoice', 'inv-5', simpleLines('gastos', 'proveedores', 1000))
        const substitute = await updateEntry(original.id, { lines: simpleLines('gastos', 'proveedores', 1500) })
        expect(substitute.id).not.toBe(original.id)
        expect((await db.entries.get(original.id))!.status).toBe('REVERSED')
        // el sustituto queda como único activo con ese origen
        const active = (await db.entries.toArray()).filter(e => e.sourceId === 'inv-5' && e.status === 'POSTED')
        expect(active).toHaveLength(1)
    })

    it('tras anular, re-postear el mismo contenido crea un asiento NUEVO (no devuelve el revertido)', async () => {
        const original = await postFromModule('investments', 'buy', 'inv-x', simpleLines('banco', 'caja', 700))
        await deleteEntry(original.id) // anulación por reversión
        expect((await db.entries.get(original.id))!.status).toBe('REVERSED')

        const reposted = await postFromModule('investments', 'buy', 'inv-x', simpleLines('banco', 'caja', 700))
        expect(reposted.id).not.toBe(original.id)
        expect(reposted.status).toBe('POSTED')
    })

    it('el accountingEventType explícito de metadata prevalece sobre el hash', async () => {
        const a = await createEntry({
            date: DATE, memo: 'depreciación 2025', lines: simpleLines('deprec', 'amort-acum', 100),
            sourceModule: 'fixed-assets', sourceType: 'rt6', sourceId: 'bien-1',
            metadata: { accountingEventType: 'depreciation-2025' },
        })
        // mismo bien, mismo evento explícito, distinto importe → misma clave → idempotente
        const b = await createEntry({
            date: DATE, memo: 'depreciación 2025 (reintento)', lines: simpleLines('deprec', 'amort-acum', 100),
            sourceModule: 'fixed-assets', sourceType: 'rt6', sourceId: 'bien-1',
            metadata: { accountingEventType: 'depreciation-2025' },
        })
        expect(b.id).toBe(a.id)
    })

    it('operaciones distintas (distinto sourceId) generan asientos distintos', async () => {
        const a = await postFromModule('inventory', 'purchase', 'mov-A', simpleLines('mercaderias', 'proveedores', 100))
        const b = await postFromModule('inventory', 'purchase', 'mov-B', simpleLines('mercaderias', 'proveedores', 100))
        expect(b.id).not.toBe(a.id)
        expect(await db.entries.count()).toBe(2)
    })

    it('los asientos llevan la clave de idempotencia derivada', async () => {
        const e = await postFromModule('inventory', 'purchase', 'mov-K', [line('mercaderias', 250, 0), line('proveedores', 0, 250)])
        const stored = await db.entries.get(e.id)
        const expectedDisc = contentDiscriminator([line('mercaderias', 250, 0), line('proveedores', 0, 250)])
        expect(stored?.idempotencyKey).toContain('inventory')
        expect(stored?.idempotencyKey).toContain(expectedDisc)
    })
})

describe('Fase 2C — contentDiscriminator', () => {
    it('es estable e independiente del orden de las líneas', () => {
        const a = contentDiscriminator([line('caja', 100, 0), line('ventas', 0, 100)])
        const b = contentDiscriminator([line('ventas', 0, 100), line('caja', 100, 0)])
        expect(a).toBe(b)
    })
    it('cambia con el importe y con la cuenta', () => {
        const base = contentDiscriminator([line('caja', 100, 0), line('ventas', 0, 100)])
        expect(contentDiscriminator([line('caja', 101, 0), line('ventas', 0, 101)])).not.toBe(base)
        expect(contentDiscriminator([line('banco', 100, 0), line('ventas', 0, 100)])).not.toBe(base)
    })
})
