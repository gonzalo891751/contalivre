/**
 * GATE DE VERIFICACIÓN DE LA FASE 2A (Fase 2B, §4).
 *
 * Reproduce de extremo a extremo las afirmaciones del informe
 * IMPLEMENTACION_FASE_2A_NUCLEO_CONTABLE.md. Este gate debe pasar antes y
 * después de la Fase 2B. Si falla un invariante central, el reporting no
 * debe continuar.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { resetDb, seedTestAccounts, line, simpleLines } from './helpers'
import {
    createDraftEntry,
    deleteDraftEntry,
    postDraft,
    postNewEntry,
    postOperation,
    reverseEntry,
    updateDraftEntry,
    voidOperationEntry,
} from '../../src/accounting/application/journalService'
import {
    closePeriod,
    ensureExerciseForDate,
    getDefaultCompany,
    getPeriodForDate,
    listExercises,
} from '../../src/accounting/application/contextService'
import { exportBackup, restoreBackup } from '../../src/accounting/backup/backupService'
import { getEntriesForContext, resolveContextForYear } from '../../src/accounting/reporting/reportingContext'
import { deriveMonetaryClassification } from '../../src/accounting/taxonomy/taxonomy'
import { calculateCoef } from '../../src/core/cierre-valuacion/calc'
import { PostingError } from '../../src/accounting/domain/types'
import { computeLedger } from '../../src/core/ledger'
import { computeTrialBalance } from '../../src/core/balance'
import { sumMoney } from '../../src/accounting/domain/money'
import { db } from '../../src/storage/db'
import type { JournalEntry } from '../../src/core/models'

const D2025 = '2025-06-15'

describe('GATE Fase 2A — aceptación end-to-end', () => {
    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    let draft: JournalEntry
    let posted: JournalEntry

    it('1. crea empresa, ejercicio y período', async () => {
        const company = await getDefaultCompany()
        expect(company.id).toBe('company-default')

        const exercise = await ensureExerciseForDate(D2025)
        expect(exercise.status).toBe('OPEN')
        const period = await getPeriodForDate(D2025, exercise.id)
        expect(period?.status).toBe('OPEN')
    })

    it('2. el borrador no aparece en el Mayor', async () => {
        draft = await createDraftEntry({
            date: D2025, memo: 'gate draft', lines: simpleLines('caja', 'capital', 1000),
        })
        const accounts = await db.accounts.toArray()
        const entries = await db.entries.toArray()
        const ledger = computeLedger(entries, accounts)
        expect(ledger.get('caja')?.totalDebit ?? 0).toBe(0)
    })

    it('3. contabiliza y Diario = Mayor = Balance', async () => {
        posted = await postDraft(draft.id)
        expect(posted.status).toBe('POSTED')
        expect(posted.entryNumber).toBe(1)

        await postNewEntry({ date: D2025, memo: 'gate venta', lines: simpleLines('deudores', 'ventas', 500) })

        const entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT')
        const accounts = await db.accounts.toArray()
        const journalDebit = sumMoney(entries.flatMap(e => e.lines.map(l => l.debit)))
        const journalCredit = sumMoney(entries.flatMap(e => e.lines.map(l => l.credit)))
        expect(journalDebit).toBe(journalCredit)

        const ledger = computeLedger(entries, accounts)
        const ledgerDebit = sumMoney(Array.from(ledger.values()).map(a => a.totalDebit))
        expect(ledgerDebit).toBe(journalDebit)

        const tb = computeTrialBalance(ledger, accounts)
        expect(tb.isBalanced).toBe(true)
        expect(tb.totalSumDebit).toBe(journalDebit)
    })

    it('4. rechaza cuenta inexistente, agrupadora, NaN e Infinity', async () => {
        await expect(postNewEntry({ date: D2025, memo: 'x', lines: simpleLines('no-existe', 'capital', 10) }))
            .rejects.toThrow(PostingError)
        await expect(postNewEntry({ date: D2025, memo: 'x', lines: simpleLines('header-activo', 'capital', 10) }))
            .rejects.toThrow(PostingError)
        await expect(postNewEntry({ date: D2025, memo: 'x', lines: [line('caja', NaN, 0), line('capital', 0, 10)] }))
            .rejects.toThrow(PostingError)
        await expect(postNewEntry({ date: D2025, memo: 'x', lines: [line('caja', Infinity, 0), line('capital', 0, 10)] }))
            .rejects.toThrow(PostingError)
    })

    it('5. rechaza contabilización en período cerrado', async () => {
        const exercise2024 = await ensureExerciseForDate('2024-03-01')
        const period2024 = (await getPeriodForDate('2024-03-01', exercise2024.id))!
        await closePeriod(period2024.id)
        await expect(postNewEntry({ date: '2024-03-01', memo: 'cerrado', lines: simpleLines('caja', 'capital', 10) }))
            .rejects.toThrow(/cerrado/)
    })

    it('6. impide editar y borrar un POSTED', async () => {
        await expect(updateDraftEntry(posted.id, { memo: 'hack' })).rejects.toThrow(PostingError)
        await expect(deleteDraftEntry(posted.id)).rejects.toThrow(PostingError)
        await expect(voidOperationEntry(posted.id)).rejects.toThrow(PostingError)
        const still = await db.entries.get(posted.id)
        expect(still?.memo).toBe('gate draft')
    })

    it('7. reversión enlazada con neto cero', async () => {
        const reversal = await reverseEntry(posted.id, { reason: 'gate' })
        expect(reversal.reversedEntryId).toBe(posted.id)
        const original = await db.entries.get(posted.id)
        expect(original?.status).toBe('REVERSED')
        expect(original?.reversalEntryId).toBe(reversal.id)

        const entries = (await db.entries.toArray()).filter(e => e.status !== 'DRAFT')
        const accounts = await db.accounts.toArray()
        const ledger = computeLedger(entries, accounts)
        expect(ledger.get('caja')!.balance).toBe(0)
        expect(ledger.get('capital')!.balance).toBe(0)
    })

    it('8. operación repetida no duplica', async () => {
        const input = {
            date: D2025, memo: 'gate op', lines: simpleLines('mercaderias', 'proveedores', 700),
            sourceModule: 'gate', sourceType: 'purchase', sourceId: 'gate-op-1',
        }
        const before = await db.entries.count()
        const first = await postOperation(input)
        const second = await postOperation(input)
        expect(first.idempotentHit).toBe(false)
        expect(second.idempotentHit).toBe(true)
        expect(second.entry.id).toBe(first.entry.id)
        expect(await db.entries.count()).toBe(before + 1)
    })

    it('9. 2025 y 2026 quedan separados', async () => {
        await postNewEntry({ date: '2026-02-01', memo: 'gate 2026', lines: simpleLines('caja', 'ventas', 999) })
        const ctx2025 = await resolveContextForYear(2025)
        const ctx2026 = await resolveContextForYear(2026)
        const e2025 = await getEntriesForContext(ctx2025)
        const e2026 = await getEntriesForContext(ctx2026)
        expect(e2025.every(e => e.date.startsWith('2025'))).toBe(true)
        expect(e2026).toHaveLength(1)
        expect((await listExercises()).length).toBeGreaterThanOrEqual(3)
    })

    it('10. Bienes de Cambio no monetario; índice faltante bloquea', async () => {
        const merc = (await db.accounts.get('mercaderias'))!
        expect(deriveMonetaryClassification(merc)).toBe('NON_MONETARY')
        expect(calculateCoef(undefined, 100)).toBeNull()
        expect(calculateCoef(200, undefined)).toBeNull()
    })

    it('11. backup → restore en base vacía conserva registros y totales', async () => {
        const backup = await exportBackup()
        const entriesBefore = (await db.entries.toArray()).sort((a, b) => a.id.localeCompare(b.id))
        const totalBefore = sumMoney(entriesBefore.flatMap(e => e.lines.map(l => l.debit)))

        // Vaciar la base (simulación de instalación nueva)
        await db.delete()
        await db.open()
        expect(await db.entries.count()).toBe(0)

        await restoreBackup(JSON.parse(JSON.stringify(backup)))
        const entriesAfter = (await db.entries.toArray()).sort((a, b) => a.id.localeCompare(b.id))
        const totalAfter = sumMoney(entriesAfter.flatMap(e => e.lines.map(l => l.debit)))
        expect(entriesAfter).toEqual(entriesBefore)
        expect(totalAfter).toBe(totalBefore)
    })

    it('12. ninguna escritura directa a entries fuera del repositorio', () => {
        const SRC = join(__dirname, '..', '..', 'src')
        const ALLOWED = ['src/accounting/repositories/journalRepository.ts']
        const PATTERN = /db\s*\.\s*entries\s*\.\s*(add|put|update|delete|bulkAdd|bulkPut|bulkDelete|clear|modify)\s*\(/g
        const offenders: string[] = []
        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const full = join(dir, name)
                if (statSync(full).isDirectory()) walk(full)
                else if (/\.(ts|tsx)$/.test(name)) {
                    const rel = relative(join(SRC, '..'), full).split(sep).join('/')
                    if (ALLOWED.includes(rel)) continue
                    if (PATTERN.test(readFileSync(full, 'utf-8'))) offenders.push(rel)
                }
            }
        }
        walk(SRC)
        expect(offenders).toEqual([])
    })
})
