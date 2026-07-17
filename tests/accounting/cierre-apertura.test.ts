/**
 * Fase 2B — Cierre contable, refundición, apertura y reapertura (§7 y §18.4).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import {
    generateClosingDrafts,
    generateOpeningEntry,
    postClosing,
    previewClosing,
    reopenClosedExercise,
} from '../../src/accounting/application/closingService'
import { createDraftEntry, postNewEntry } from '../../src/accounting/application/journalService'
import { ensureExerciseForDate, getExercise, exerciseIdForYear } from '../../src/accounting/application/contextService'
import { getEntriesForContext, getOpeningBalances, resolveContextForYear } from '../../src/accounting/reporting/reportingContext'
import { excludeClosingEntries } from '../../src/utils/resultsStatement'
import { computeLedger } from '../../src/core/ledger'
import { db } from '../../src/storage/db'
import { PostingError } from '../../src/accounting/domain/types'

const EX_2025 = () => exerciseIdForYear(2025)

/** Escenario 2025: capital 1000, venta 500, gasto 200 ⇒ resultado 300 */
async function seedYear2025() {
    await postNewEntry({ date: '2025-01-10', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
    await postNewEntry({ date: '2025-06-01', memo: 'venta', lines: simpleLines('caja', 'ventas', 500) })
    await postNewEntry({ date: '2025-09-01', memo: 'gasto', lines: simpleLines('gastos', 'caja', 200) })
}

async function balances(filterYear?: number): Promise<Map<string, number>> {
    let entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT')
    if (filterYear) entries = entries.filter(e => e.date.startsWith(String(filterYear)))
    const accounts = await db.accounts.toArray()
    const ledger = computeLedger(entries, accounts)
    const map = new Map<string, number>()
    for (const [id, acc] of ledger) map.set(id, acc.balance)
    return map
}

describe('Fase 2B — vista previa de cierre', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedYear2025()
    })

    it('calcula el resultado y detalla ingresos/gastos', async () => {
        const preview = await previewClosing(EX_2025())
        expect(preview.canClose).toBe(true)
        expect(preview.result).toBe(300)
        expect(preview.incomeAccounts).toHaveLength(1)
        expect(preview.incomeAccounts[0]).toMatchObject({ accountId: 'ventas', balance: 500 })
        expect(preview.expenseAccounts[0]).toMatchObject({ accountId: 'gastos', balance: 200 })
    })

    it('bloquea el cierre con borradores pendientes', async () => {
        await createDraftEntry({ date: '2025-11-01', memo: 'pendiente', lines: simpleLines('caja', 'ventas', 10) })
        const preview = await previewClosing(EX_2025())
        expect(preview.canClose).toBe(false)
        expect(preview.blockers.some(b => b.includes('borrador'))).toBe(true)
        await expect(generateClosingDrafts(EX_2025())).rejects.toThrow(PostingError)
    })
})

describe('Fase 2B — refundición y cierre', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedYear2025()
    })

    it('genera borradores explicables y la contabilización deja resultados en cero', async () => {
        const drafts = await generateClosingDrafts(EX_2025())
        expect(drafts.incomeDraft?.status).toBe('DRAFT')
        expect(drafts.expenseDraft?.status).toBe('DRAFT')
        expect(drafts.transferDraft?.status).toBe('DRAFT')

        // Los borradores NO afectan los libros todavía
        const before = await balances()
        expect(before.get('ventas')).toBe(500)

        const { result, postedEntryIds } = await postClosing(EX_2025())
        expect(result).toBe(300)
        expect(postedEntryIds).toHaveLength(3)

        const after = await balances()
        expect(after.get('ventas')).toBe(0)
        expect(after.get('gastos')).toBe(0)
        expect(after.get('resultado-ejercicio')).toBe(0)      // transferido
        expect(after.get('resultados-no-asignados')).toBe(300)
        expect(after.get('caja')).toBe(1300)

        const exercise = await getExercise(EX_2025())
        expect(exercise?.status).toBe('CLOSED')
    })

    it('el cierre es idempotente: repetir no duplica asientos', async () => {
        await postClosing(EX_2025())
        const count = await db.entries.count()
        const again = await postClosing(EX_2025())
        expect(await db.entries.count()).toBe(count)
        expect(again.postedEntryIds).toHaveLength(3)
    })

    it('el ER del ejercicio excluye la refundición estructuralmente', async () => {
        await postClosing(EX_2025())
        const entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT' && e.date.startsWith('2025'))
        const accounts = await db.accounts.toArray()
        const withoutClosing = excludeClosingEntries(entries, accounts)
        const ledger = computeLedger(withoutClosing, accounts)
        expect(ledger.get('ventas')!.balance).toBe(500)   // el ER sigue viendo la venta
        expect(ledger.get('gastos')!.balance).toBe(200)
    })
})

describe('Fase 2B — apertura del ejercicio siguiente (§18.4)', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedYear2025()
        await postClosing(EX_2025())
    })

    it('apertura solo patrimonial e igual al cierre anterior', async () => {
        const opening = await generateOpeningEntry(EX_2025())
        expect(opening.entry.date).toBe('2026-01-01')
        expect(opening.entry.sourceType).toBe('apertura')

        // Solo cuentas patrimoniales
        const accounts = await db.accounts.toArray()
        const byId = new Map(accounts.map(a => [a.id, a]))
        for (const l of opening.entry.lines) {
            const kind = byId.get(l.accountId)!.kind
            expect(['ASSET', 'LIABILITY', 'EQUITY']).toContain(kind)
        }

        // Saldo final patrimonial N = saldo inicial N+1
        const y2026 = await balances(2026)
        expect(y2026.get('caja')).toBe(1300)
        expect(y2026.get('capital')).toBe(1000)
        expect(y2026.get('resultados-no-asignados')).toBe(300)

        // El resultado del ejercicio anterior NO reaparece como cuenta dinámica
        expect(y2026.get('ventas') ?? 0).toBe(0)
        expect(y2026.get('gastos') ?? 0).toBe(0)
        expect(opening.entry.lines.some(l => l.accountId === 'ventas' || l.accountId === 'gastos')).toBe(false)
    })

    it('la apertura es idempotente', async () => {
        const first = await generateOpeningEntry(EX_2025())
        const second = await generateOpeningEntry(EX_2025())
        expect(second.entry.id).toBe(first.entry.id)
    })

    it('con apertura formal, el mecanismo de acumulación previa queda vacío (sin doble conteo)', async () => {
        await generateOpeningEntry(EX_2025())
        const ctx2026 = await resolveContextForYear(2026)
        const opening = await getOpeningBalances(ctx2026)
        expect(opening.size).toBe(0)

        // El contexto 2026 contiene la apertura y nada más
        const e2026 = await getEntriesForContext(ctx2026)
        expect(e2026).toHaveLength(1)
        expect(e2026[0].sourceType).toBe('apertura')
    })

    it('exige refundición previa', async () => {
        await resetDb()
        await seedTestAccounts()
        await seedYear2025()
        await ensureExerciseForDate('2025-06-01')
        await expect(generateOpeningEntry(EX_2025())).rejects.toThrow(/refundición/)
    })
})

describe('Fase 2B — reapertura controlada', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedYear2025()
        await postClosing(EX_2025())
        await generateOpeningEntry(EX_2025())
    })

    it('revierte cierre y apertura, restaura los saldos dinámicos y exige motivo', async () => {
        await expect(reopenClosedExercise(EX_2025(), '')).rejects.toThrow(/motivo/)

        const { reversedEntryIds } = await reopenClosedExercise(EX_2025(), 'Corrección de un gasto omitido')
        expect(reversedEntryIds.length).toBe(4) // apertura + transferencia + gastos + ingresos

        const exercise = await getExercise(EX_2025())
        expect(exercise?.status).toBe('OPEN')

        // Los saldos del ejercicio vuelven al estado pre-cierre
        const after = await balances(2025)
        expect(after.get('ventas')).toBe(500)
        expect(after.get('gastos')).toBe(200)
        expect(after.get('resultados-no-asignados')).toBe(0)

        // La apertura 2026 quedó neutralizada
        const y2026 = await balances(2026)
        expect(y2026.get('caja') ?? 0).toBe(0)
    })
})
