/**
 * Fase 2A — Asientos inválidos (§3.1 "Casos obligatorios").
 * Toda contabilización inválida debe rechazarse con error concreto;
 * nada se omite silenciosamente.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, line, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { closePeriod, ensureExerciseForDate, getPeriodForDate } from '../../src/accounting/application/contextService'
import { PostingError } from '../../src/accounting/domain/types'
import { validateForPosting } from '../../src/accounting/validation/validatePosting'
import { db } from '../../src/storage/db'
import type { Account } from '../../src/core/models'

const DATE = '2025-03-15'

async function expectRejected(input: Parameters<typeof postNewEntry>[0], fragment: string) {
    let error: unknown
    try {
        await postNewEntry(input)
    } catch (e) {
        error = e
    }
    expect(error, `esperaba rechazo con mensaje que contenga "${fragment}"`).toBeInstanceOf(PostingError)
    expect((error as PostingError).message).toContain(fragment)
}

describe('Fase 2A — contabilización de asientos inválidos', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('rechaza Debe distinto de Haber', async () => {
        await expectRejected(
            { date: DATE, memo: 'desbalanceado', lines: [line('caja', 100, 0), line('capital', 0, 90)] },
            'no cuadra'
        )
        expect(await db.entries.count()).toBe(0)
    })

    it('rechaza importe NaN', async () => {
        await expectRejected(
            { date: DATE, memo: 'nan', lines: [line('caja', NaN, 0), line('capital', 0, 100)] },
            'NaN'
        )
    })

    it('rechaza importe Infinity', async () => {
        await expectRejected(
            { date: DATE, memo: 'inf', lines: [line('caja', Infinity, 0), line('capital', 0, 100)] },
            'Infinity'
        )
    })

    it('rechaza importe -Infinity', async () => {
        await expectRejected(
            { date: DATE, memo: '-inf', lines: [line('caja', 0, -Infinity), line('capital', 0, 100)] },
            'Infinity'
        )
    })

    it('rechaza importes negativos', async () => {
        await expectRejected(
            { date: DATE, memo: 'neg', lines: [line('caja', -100, 0), line('capital', 0, -100)] },
            'negativo'
        )
    })

    it('rechaza línea con Debe y Haber simultáneos', async () => {
        await expectRejected(
            { date: DATE, memo: 'ambos', lines: [line('caja', 100, 50), line('capital', 0, 50)] },
            'simultáneamente'
        )
    })

    it('rechaza línea sin Debe ni Haber', async () => {
        await expectRejected(
            { date: DATE, memo: 'vacía', lines: [line('caja', 100, 0), line('capital', 0, 100), line('banco', 0, 0)] },
            'Debe o en Haber'
        )
    })

    it('rechaza asiento con menos de 2 líneas', async () => {
        await expectRejected(
            { date: DATE, memo: 'una línea', lines: [line('caja', 0, 0)] },
            'al menos 2 líneas'
        )
    })

    it('rechaza cuenta inexistente (no la omite silenciosamente)', async () => {
        await expectRejected(
            { date: DATE, memo: 'fantasma', lines: simpleLines('cuenta-fantasma', 'capital', 100) },
            'no existe en el plan de cuentas'
        )
        expect(await db.entries.count()).toBe(0)
    })

    it('rechaza cuenta agrupadora / no imputable', async () => {
        await expectRejected(
            { date: DATE, memo: 'header', lines: simpleLines('header-activo', 'capital', 100) },
            'agrupadora'
        )
    })

    it('rechaza cuenta inactiva', async () => {
        await expectRejected(
            { date: DATE, memo: 'inactiva', lines: simpleLines('cuenta-inactiva', 'capital', 100) },
            'inactiva'
        )
    })

    it('rechaza fecha inválida', async () => {
        await expectRejected(
            { date: '2025-13-45', memo: 'fecha', lines: simpleLines('caja', 'capital', 100) },
            'no es una fecha válida'
        )
        await expectRejected(
            { date: '', memo: 'sin fecha', lines: simpleLines('caja', 'capital', 100) },
            'no es una fecha válida'
        )
    })

    it('rechaza fecha fuera del ejercicio (validación pura)', async () => {
        const exercise = await ensureExerciseForDate('2025-06-01')
        const period = (await getPeriodForDate('2025-06-01', exercise.id))!
        const accounts = await db.accounts.toArray()
        const accountsById = new Map<string, Account>(accounts.map(a => [a.id, a]))

        const errors = validateForPosting(
            {
                id: 'x', date: '2026-01-15', memo: 'fuera',
                lines: simpleLines('caja', 'capital', 100),
            },
            { accountsById, exercise, period }
        )
        expect(errors.some(e => e.includes('fuera del ejercicio'))).toBe(true)
    })

    it('rechaza contabilización en período cerrado con mensaje concreto', async () => {
        const exercise = await ensureExerciseForDate(DATE)
        const period = (await getPeriodForDate(DATE, exercise.id))!
        await closePeriod(period.id)

        await expectRejected(
            { date: DATE, memo: 'cerrado', lines: simpleLines('caja', 'capital', 100) },
            'está cerrado'
        )
        expect(await db.entries.count()).toBe(0)
    })

    it('registra el rechazo en el audit log', async () => {
        await expectRejected(
            { date: DATE, memo: 'audit', lines: [line('caja', 100, 0), line('capital', 0, 90)] },
            'no cuadra'
        )
        const events = await db.auditLog.where('eventType').equals('POSTING_REJECTED').toArray()
        expect(events.length).toBeGreaterThanOrEqual(1)
    })
})
