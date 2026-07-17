/**
 * Fase 2A — Ciclo de vida DRAFT → POSTED → REVERSED (ACC-002).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import {
    createDraftEntry,
    deleteDraftEntry,
    postDraft,
    postNewEntry,
    reverseEntry,
    updateDraftEntry,
    voidOperationEntry,
} from '../../src/accounting/application/journalService'
import { updateEntry, deleteEntry } from '../../src/storage/entries'
import { PostingError } from '../../src/accounting/domain/types'
import { db } from '../../src/storage/db'
import { computeLedger } from '../../src/core/ledger'

const DATE = '2025-05-10'

describe('Fase 2A — ciclo de vida del asiento', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('el borrador es editable y no impacta los libros', async () => {
        const draft = await createDraftEntry({
            date: DATE, memo: 'borrador', lines: simpleLines('caja', 'capital', 100),
        })
        expect(draft.status).toBe('DRAFT')
        expect(draft.entryNumber).toBeUndefined()

        const updated = await updateDraftEntry(draft.id, {
            memo: 'borrador editado',
            lines: simpleLines('caja', 'capital', 250),
        })
        expect(updated.memo).toBe('borrador editado')

        // No impacta el mayor
        const accounts = await db.accounts.toArray()
        const entries = await db.entries.toArray()
        const ledger = computeLedger(entries, accounts)
        expect(ledger.get('caja')?.totalDebit ?? 0).toBe(0)
    })

    it('el borrador es eliminable', async () => {
        const draft = await createDraftEntry({
            date: DATE, memo: 'a eliminar', lines: simpleLines('caja', 'capital', 100),
        })
        await deleteDraftEntry(draft.id)
        expect(await db.entries.get(draft.id)).toBeUndefined()
    })

    it('contabilizar asigna número secuencial, fecha y actor', async () => {
        const draft = await createDraftEntry({
            date: DATE, memo: 'para postear', lines: simpleLines('caja', 'capital', 500),
        })
        const posted = await postDraft(draft.id)
        expect(posted.status).toBe('POSTED')
        expect(posted.entryNumber).toBe(1)
        expect(posted.postedAt).toBeTruthy()
        expect(posted.postedBy).toBe('local-user')
        expect(posted.exerciseId).toBeTruthy()
        expect(posted.periodId).toBeTruthy()

        const second = await postNewEntry({
            date: DATE, memo: 'segundo', lines: simpleLines('banco', 'capital', 300),
        })
        expect(second.entryNumber).toBe(2)
    })

    it('un contabilizado manual es inmutable y no eliminable físicamente', async () => {
        const posted = await postNewEntry({
            date: DATE, memo: 'inmutable', lines: simpleLines('caja', 'capital', 100),
        })

        await expect(updateDraftEntry(posted.id, { memo: 'hack' })).rejects.toThrow(PostingError)
        await expect(updateEntry(posted.id, { memo: 'hack' })).rejects.toThrow()
        await expect(deleteDraftEntry(posted.id)).rejects.toThrow(PostingError)
        await expect(deleteEntry(posted.id)).rejects.toThrow()
        await expect(voidOperationEntry(posted.id)).rejects.toThrow(PostingError)

        const still = await db.entries.get(posted.id)
        expect(still).toBeDefined()
        expect(still!.memo).toBe('inmutable')
    })

    it('la reversión crea un asiento nuevo enlazado, con motivo y actor, y conserva el original', async () => {
        const posted = await postNewEntry({
            date: DATE, memo: 'original', lines: simpleLines('caja', 'capital', 700),
        })

        const reversal = await reverseEntry(posted.id, { reason: 'Error de imputación' })

        expect(reversal.id).not.toBe(posted.id)
        expect(reversal.status).toBe('POSTED')
        expect(reversal.reversedEntryId).toBe(posted.id)
        expect(reversal.reversalReason).toBe('Error de imputación')
        expect(reversal.postedBy).toBe('local-user')
        expect(reversal.date).toBe(DATE)
        // Debe y Haber invertidos, todas las líneas conservadas
        expect(reversal.lines).toHaveLength(2)
        expect(reversal.lines[0]).toMatchObject({ accountId: 'caja', debit: 0, credit: 700 })
        expect(reversal.lines[1]).toMatchObject({ accountId: 'capital', debit: 700, credit: 0 })

        const original = await db.entries.get(posted.id)
        expect(original).toBeDefined()
        expect(original!.status).toBe('REVERSED')
        expect(original!.reversalEntryId).toBe(reversal.id)

        // Efecto neto nulo en el mayor
        const accounts = await db.accounts.toArray()
        const entries = await db.entries.toArray()
        const ledger = computeLedger(entries, accounts)
        expect(ledger.get('caja')!.balance).toBe(0)
        expect(ledger.get('capital')!.balance).toBe(0)
    })

    it('no puede revertirse dos veces sin control (idempotente)', async () => {
        const posted = await postNewEntry({
            date: DATE, memo: 'doble reversión', lines: simpleLines('caja', 'capital', 100),
        })
        const first = await reverseEntry(posted.id, { reason: 'motivo 1' })
        const second = await reverseEntry(posted.id, { reason: 'motivo 2' })
        expect(second.id).toBe(first.id)

        const reversals = (await db.entries.toArray()).filter(e => e.reversedEntryId === posted.id)
        expect(reversals).toHaveLength(1)
    })

    it('la reversión exige motivo', async () => {
        const posted = await postNewEntry({
            date: DATE, memo: 'sin motivo', lines: simpleLines('caja', 'capital', 100),
        })
        await expect(reverseEntry(posted.id, { reason: '' })).rejects.toThrow(PostingError)
    })

    it('un borrador no se revierte', async () => {
        const draft = await createDraftEntry({
            date: DATE, memo: 'draft', lines: simpleLines('caja', 'capital', 100),
        })
        await expect(reverseEntry(draft.id, { reason: 'x' })).rejects.toThrow(PostingError)
    })
})
