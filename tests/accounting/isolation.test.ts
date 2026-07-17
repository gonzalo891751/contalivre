/**
 * Fase 2A — Separación temporal entre ejercicios (ACC-003 / ACC-008).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import {
    getEntriesForContext,
    getOpeningBalances,
    resolveContextForYear,
} from '../../src/accounting/reporting/reportingContext'
import { listExercises } from '../../src/accounting/application/contextService'
import { computeLedger } from '../../src/core/ledger'
import { computeTrialBalance } from '../../src/core/balance'
import { db } from '../../src/storage/db'

describe('Fase 2A — aislamiento por ejercicio', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        // Ejercicio 2025
        await postNewEntry({ date: '2025-02-01', memo: 'aporte 2025', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-07-01', memo: 'venta 2025', lines: simpleLines('caja', 'ventas', 400) })
        // Ejercicio 2026
        await postNewEntry({ date: '2026-01-15', memo: 'venta 2026', lines: simpleLines('caja', 'ventas', 900) })
    })

    it('crea ejercicios persistidos por año (no lista fija)', async () => {
        const exercises = await listExercises()
        const years = exercises.map(e => e.startDate.slice(0, 4)).sort()
        expect(years).toEqual(['2025', '2026'])
        expect(exercises.every(e => e.status === 'OPEN')).toBe(true)
    })

    it('el contexto 2025 no incluye movimientos 2026 (y viceversa)', async () => {
        const ctx2025 = await resolveContextForYear(2025)
        const ctx2026 = await resolveContextForYear(2026)

        const entries2025 = await getEntriesForContext(ctx2025)
        const entries2026 = await getEntriesForContext(ctx2026)

        expect(entries2025).toHaveLength(2)
        expect(entries2025.every(e => e.date.startsWith('2025'))).toBe(true)
        expect(entries2026).toHaveLength(1)
        expect(entries2026[0].date).toBe('2026-01-15')
    })

    it('Mayor y Balance 2025 no incluyen movimientos 2026', async () => {
        const ctx2025 = await resolveContextForYear(2025)
        const entries = await getEntriesForContext(ctx2025)
        const accounts = await db.accounts.toArray()
        const ledger = computeLedger(entries, accounts)

        expect(ledger.get('caja')!.totalDebit).toBe(1400) // 1000 + 400, sin los 900 de 2026
        expect(ledger.get('ventas')!.totalCredit).toBe(400)

        const tb = computeTrialBalance(ledger, accounts)
        expect(tb.isBalanced).toBe(true)
        expect(tb.totalSumDebit).toBe(1400)
    })

    it('los saldos de apertura 2026 ingresan solo por el mecanismo explícito', async () => {
        const ctx2026 = await resolveContextForYear(2026)
        const opening = await getOpeningBalances(ctx2026)

        // Neto 2025: caja debe 1400
        expect(opening.get('caja')).toEqual({ debit: 1400, credit: 0 })
        expect(opening.get('capital')).toEqual({ debit: 0, credit: 1000 })

        // El contexto 2026 en sí NO los incluye
        const entries2026 = await getEntriesForContext(ctx2026)
        const accounts = await db.accounts.toArray()
        const ledger2026 = computeLedger(entries2026, accounts)
        expect(ledger2026.get('caja')!.totalDebit).toBe(900)
    })

    it('los borradores nunca integran los libros', async () => {
        const { createDraftEntry } = await import('../../src/accounting/application/journalService')
        await createDraftEntry({ date: '2025-08-01', memo: 'draft', lines: simpleLines('caja', 'ventas', 5000) })

        const ctx2025 = await resolveContextForYear(2025)
        const entries = await getEntriesForContext(ctx2025)
        expect(entries).toHaveLength(2)

        const accounts = await db.accounts.toArray()
        // Defensa en profundidad: aunque el borrador llegara al cómputo,
        // computeLedger lo excluye
        const all = await db.entries.toArray()
        const ledger = computeLedger(all.filter(e => e.date.startsWith('2025')), accounts)
        expect(ledger.get('caja')!.totalDebit).toBe(1400)
    })
})
