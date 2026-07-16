/**
 * Fase 2B — Reversión uniforme de operaciones (§6).
 *
 * Todo asiento POSTED es inmutable en su contenido económico:
 * - editar la operación ⇒ reversión + asiento sustituto (atómicos, enlazados);
 * - eliminar la operación ⇒ anulación por reversión (sin delete físico);
 * - cambios solo descriptivos ⇒ actualización in place auditada;
 * - borradores ⇒ edición/eliminación directa (no integraron libros).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import {
    postOperation,
    replaceOperationEntry,
    voidOperationEntry,
    createDraftEntry,
} from '../../src/accounting/application/journalService'
import { updateEntry, deleteEntry } from '../../src/storage/entries'
import { deleteJournalEntryWithSync } from '../../src/storage/journalSync'
import { db } from '../../src/storage/db'
import { computeLedger } from '../../src/core/ledger'
import type { JournalEntry } from '../../src/core/models'

const DATE = '2025-05-01'

async function postSampleOperation(sourceId = 'op-1'): Promise<JournalEntry> {
    const { entry } = await postOperation({
        date: DATE,
        memo: 'Compra original',
        lines: simpleLines('mercaderias', 'proveedores', 1000),
        sourceModule: 'inventory',
        sourceType: 'purchase',
        sourceId,
    })
    return entry
}

async function ledgerBalance(accountId: string): Promise<number> {
    const entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT')
    const accounts = await db.accounts.toArray()
    return computeLedger(entries, accounts).get(accountId)?.balance ?? 0
}

describe('Fase 2B — edición económica ⇒ reversión + sustituto', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('crea reversión y sustituto atómicos, conservando el original', async () => {
        const original = await postSampleOperation()

        const substitute = await replaceOperationEntry(original.id, {
            memo: 'Compra corregida',
            lines: simpleLines('mercaderias', 'proveedores', 1500),
        }, { reason: 'El usuario corrigió el importe' })

        // El sustituto es un asiento NUEVO
        expect(substitute.id).not.toBe(original.id)
        expect(substitute.status).toBe('POSTED')
        expect(substitute.metadata?.replacesEntryId).toBe(original.id)
        expect(substitute.metadata?.operationVersion).toBe(2)
        expect(substitute.idempotencyKey).toContain('#v2')

        // El original se conserva INTACTO en su contenido económico
        const preserved = (await db.entries.get(original.id))!
        expect(preserved.status).toBe('REVERSED')
        expect(preserved.lines).toEqual(original.lines)
        expect(preserved.reversalEntryId).toBeTruthy()

        // Existe la reversión enlazada
        const reversal = (await db.entries.get(preserved.reversalEntryId!))!
        expect(reversal.reversedEntryId).toBe(original.id)
        expect(reversal.lines[0]).toMatchObject({ accountId: 'mercaderias', debit: 0, credit: 1000 })

        // Los libros reflejan SOLO el importe nuevo
        expect(await ledgerBalance('mercaderias')).toBe(1500)
        expect(await ledgerBalance('proveedores')).toBe(1500)

        // Son 3 asientos: original + reversión + sustituto
        expect(await db.entries.count()).toBe(3)
    })

    it('cambio solo descriptivo (memo) NO genera reversión', async () => {
        const original = await postSampleOperation('op-desc')
        const updated = await replaceOperationEntry(original.id, { memo: 'Nuevo memo' })

        expect(updated.id).toBe(original.id)
        expect(updated.memo).toBe('Nuevo memo')
        expect(updated.status).toBe('POSTED')
        expect(await db.entries.count()).toBe(1)
        // Las líneas no cambiaron
        expect(updated.lines).toEqual(original.lines)
    })

    it('los borradores se editan in place', async () => {
        const draft = await createDraftEntry({
            date: DATE, memo: 'draft', lines: simpleLines('caja', 'capital', 10),
            sourceModule: 'inventory', sourceType: 'x', sourceId: 'd1',
        })
        const updated = await replaceOperationEntry(draft.id, {
            lines: simpleLines('caja', 'capital', 99),
        })
        expect(updated.id).toBe(draft.id)
        expect(updated.status).toBe('DRAFT')
        expect(await db.entries.count()).toBe(1)
    })

    it('no permite reemplazar dos veces el mismo original', async () => {
        const original = await postSampleOperation('op-doble')
        await replaceOperationEntry(original.id, { lines: simpleLines('mercaderias', 'proveedores', 2000) })
        await expect(
            replaceOperationEntry(original.id, { lines: simpleLines('mercaderias', 'proveedores', 3000) })
        ).rejects.toThrow(/ya fue revertido/)
    })

    it('updateEntry (capa compat) devuelve el sustituto', async () => {
        const original = await postSampleOperation('op-compat')
        const result = await updateEntry(original.id, {
            lines: simpleLines('mercaderias', 'proveedores', 700),
        })
        expect(result.id).not.toBe(original.id)
        expect(await ledgerBalance('mercaderias')).toBe(700)
    })
})

describe('Fase 2B — anulación por reversión (sin delete físico)', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('voidOperationEntry revierte y conserva el asiento', async () => {
        const original = await postSampleOperation('op-void')
        await voidOperationEntry(original.id, { reason: 'Baja de la operación' })

        const preserved = (await db.entries.get(original.id))!
        expect(preserved.status).toBe('REVERSED')
        expect(preserved.lines).toEqual(original.lines)

        // Neto cero en libros; nada se eliminó físicamente
        expect(await ledgerBalance('mercaderias')).toBe(0)
        expect(await db.entries.count()).toBe(2)

        // Audit log registra la anulación con la reversión enlazada
        const events = await db.auditLog.where('eventType').equals('ENTRY_VOIDED').toArray()
        expect(events.some(e => (e.metadata as { mode?: string })?.mode === 'reversed-not-deleted')).toBe(true)
    })

    it('es idempotente: anular dos veces no duplica reversiones', async () => {
        const original = await postSampleOperation('op-void-2')
        await voidOperationEntry(original.id)
        await voidOperationEntry(original.id)
        expect(await db.entries.count()).toBe(2)
    })

    it('deleteEntry (capa compat) anula por reversión los POSTED de módulos', async () => {
        const original = await postSampleOperation('op-del')
        await deleteEntry(original.id)
        const preserved = await db.entries.get(original.id)
        expect(preserved).toBeDefined()
        expect(preserved!.status).toBe('REVERSED')
        expect(await ledgerBalance('proveedores')).toBe(0)
    })

    it('los borradores de módulos sí se eliminan físicamente', async () => {
        const draft = await createDraftEntry({
            date: DATE, memo: 'd', lines: simpleLines('caja', 'capital', 5),
            sourceModule: 'inventory', sourceType: 'x', sourceId: 'dv',
        })
        await voidOperationEntry(draft.id)
        expect(await db.entries.get(draft.id)).toBeUndefined()
    })

    it('deleteJournalEntryWithSync informa anulación por reversión', async () => {
        const original = await postSampleOperation('op-sync')
        const result = await deleteJournalEntryWithSync(original.id)
        expect(result.message).toContain('anulado por reversión')
        expect((await db.entries.get(original.id))!.status).toBe('REVERSED')
    })
})

describe('Fase 2B — familia de módulos: inversiones', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('eliminar un movimiento de inversiones anula su asiento por reversión', async () => {
        const { entry } = await postOperation({
            date: DATE, memo: 'Compra plazo fijo',
            lines: simpleLines('banco', 'caja', 5000),
            sourceModule: 'investments', sourceType: 'buy', sourceId: 'inv-1',
        })
        await db.invMovements.add({
            id: 'inv-1', periodId: '2025', date: DATE, rubro: 'PLAZO_FIJO', type: 'PF_CONSTITUTE',
            instrumentId: 'i1', amount: 5000, journalEntryId: entry.id,
            createdAt: DATE, updatedAt: DATE,
        } as never)

        const { deleteMovement } = await import('../../src/storage/inversiones')
        const result = await deleteMovement('inv-1')
        expect(result.success).toBe(true)

        const preserved = (await db.entries.get(entry.id))!
        expect(preserved.status).toBe('REVERSED')
        expect(await ledgerBalance('banco')).toBe(0)
        expect(await db.invMovements.get('inv-1')).toBeUndefined()
    })
})
