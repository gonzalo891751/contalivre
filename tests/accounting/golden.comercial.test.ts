/**
 * Fase 2A — Golden case comercial mínimo (§3.2).
 * Todo el caso corre a través del servicio único de contabilización.
 * Saldos exactos verificados, sin snapshots.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, line, simpleLines } from './helpers'
import {
    createDraftEntry,
    postDraft,
    postNewEntry,
    postOperation,
} from '../../src/accounting/application/journalService'
import { computeLedger } from '../../src/core/ledger'
import { computeTrialBalance } from '../../src/core/balance'
import { sumMoney } from '../../src/accounting/domain/money'
import { db } from '../../src/storage/db'
import type { Ledger } from '../../src/core/models'

describe('Fase 2A — golden case comercial', () => {
    let ledger: Ledger

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()

        // 1. Aporte de capital en efectivo
        await postNewEntry({ date: '2025-01-05', memo: 'Aporte de capital', lines: simpleLines('caja', 'capital', 1000000) })

        // 2. Compra de mercaderías al contado (operación idempotente de módulo)
        await postOperation({
            date: '2025-02-10', memo: 'Compra de mercaderías contado',
            lines: simpleLines('mercaderias', 'caja', 200000),
            sourceModule: 'inventory', sourceType: 'purchase', sourceId: 'golden-p1',
        })

        // 3. Compra de mercaderías a crédito
        await postOperation({
            date: '2025-03-01', memo: 'Compra de mercaderías a crédito',
            lines: simpleLines('mercaderias', 'proveedores', 100000),
            sourceModule: 'inventory', sourceType: 'purchase', sourceId: 'golden-p2',
        })

        // 4. Venta a crédito + 5. costo de ventas
        await postOperation({
            date: '2025-04-15', memo: 'Venta a crédito',
            lines: simpleLines('deudores', 'ventas', 300000),
            sourceModule: 'inventory', sourceType: 'sale', sourceId: 'golden-v1', accountingEventType: 'revenue',
        })
        await postOperation({
            date: '2025-04-15', memo: 'Costo de la venta',
            lines: simpleLines('cmv', 'mercaderias', 180000),
            sourceModule: 'inventory', sourceType: 'sale', sourceId: 'golden-v1', accountingEventType: 'cogs',
        })

        // 6. Cobro parcial
        await postNewEntry({ date: '2025-05-02', memo: 'Cobro a deudores', lines: simpleLines('caja', 'deudores', 150000) })

        // 7. Pago parcial a proveedores
        await postNewEntry({ date: '2025-05-20', memo: 'Pago a proveedores', lines: simpleLines('proveedores', 'caja', 60000) })

        // 8. Gasto devengado impago
        await postNewEntry({ date: '2025-06-30', memo: 'Gasto devengado', lines: simpleLines('gastos', 'gastos-a-pagar', 50000) })

        // 9. Asiento de ajuste: nace como borrador y se contabiliza
        const draft = await createDraftEntry({
            date: '2025-12-31', memo: 'Ajuste de cierre',
            lines: [line('gastos', 10000, 0), line('caja', 0, 10000)],
        })
        await postDraft(draft.id)

        const entries = await db.entries.toArray()
        const accounts = await db.accounts.toArray()
        ledger = computeLedger(entries, accounts)
    })

    it('saldos exactos de Caja', () => {
        // 1.000.000 - 200.000 + 150.000 - 60.000 - 10.000
        expect(ledger.get('caja')!.balance).toBe(880000)
    })

    it('saldos exactos de Mercaderías', () => {
        // 200.000 + 100.000 - 180.000
        expect(ledger.get('mercaderias')!.balance).toBe(120000)
    })

    it('saldos exactos de Créditos (Deudores)', () => {
        expect(ledger.get('deudores')!.balance).toBe(150000)
    })

    it('saldos exactos de Proveedores', () => {
        expect(ledger.get('proveedores')!.balance).toBe(40000)
    })

    it('saldos exactos de Capital', () => {
        expect(ledger.get('capital')!.balance).toBe(1000000)
    })

    it('saldos exactos de Ventas, Costo y Gastos', () => {
        expect(ledger.get('ventas')!.balance).toBe(300000)
        expect(ledger.get('cmv')!.balance).toBe(180000)
        expect(ledger.get('gastos')!.balance).toBe(60000)
    })

    it('resultado del ejercicio exacto', () => {
        const resultado = ledger.get('ventas')!.balance
            - ledger.get('cmv')!.balance
            - ledger.get('gastos')!.balance
        expect(resultado).toBe(60000)
    })

    it('ecuación patrimonial: Activo = Pasivo + PN + Resultado', () => {
        const activo = sumMoney([
            ledger.get('caja')!.balance,
            ledger.get('mercaderias')!.balance,
            ledger.get('deudores')!.balance,
        ])
        const pasivo = sumMoney([
            ledger.get('proveedores')!.balance,
            ledger.get('gastos-a-pagar')!.balance,
        ])
        const pn = ledger.get('capital')!.balance + 60000
        expect(activo).toBe(1150000)
        expect(pasivo).toBe(90000)
        expect(activo).toBe(sumMoney([pasivo, pn]))
    })

    it('balance de comprobación equilibrado y numeración secuencial completa', async () => {
        const accounts = await db.accounts.toArray()
        const tb = computeTrialBalance(ledger, accounts)
        expect(tb.isBalanced).toBe(true)

        const entries = await db.entries.toArray()
        const numbers = entries.map(e => e.entryNumber).sort((a, b) => (a ?? 0) - (b ?? 0))
        expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
        expect(entries.every(e => e.status === 'POSTED')).toBe(true)
        expect(entries.every(e => e.exerciseId && e.periodId && e.companyId)).toBe(true)
    })
})
