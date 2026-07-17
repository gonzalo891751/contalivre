/**
 * GATE CONSOLIDADO DE ACEPTACIÓN — FASES 2A + 2B (Fase 2C, §4).
 *
 * Reproduce end-to-end todas las afirmaciones estructurales de las fases
 * anteriores en un único flujo integrado. Debe pasar antes y después de la
 * Fase 2C. Si falla cualquier invariante, no se implementan funciones nuevas.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import {
    createDraftEntry,
    deleteDraftEntry,
    postDraft,
    postNewEntry,
    postOperation,
    replaceOperationEntry,
    updateDraftEntry,
    voidOperationEntry,
} from '../../src/accounting/application/journalService'
import {
    generateOpeningEntry,
    postClosing,
    previewClosing,
    reopenClosedExercise,
} from '../../src/accounting/application/closingService'
import { exerciseIdForYear, getExercise } from '../../src/accounting/application/contextService'
import { exportBackup, restoreBackup } from '../../src/accounting/backup/backupService'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { computeInflationAdjustment } from '../../src/accounting/inflation/engine'
import { getCoefficient } from '../../src/accounting/inflation/engine'
import { buildMetricsCatalog } from '../../src/reporting/metrics/metrics'
import { CURRENT_SCHEMA_VERSION } from '../../src/accounting/migration/versions'
import { PostingError } from '../../src/accounting/domain/types'
import { db } from '../../src/storage/db'
import type { JournalEntry } from '../../src/core/models'

const Y = 2025

describe('GATE 2A+2B — flujo integrado', () => {
    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    let manualPosted: JournalEntry

    it('2A: borrador fuera de libros → contabilización válida → POSTED inmutable', async () => {
        const draft = await createDraftEntry({
            date: `${Y}-01-05`, memo: 'Aporte', lines: simpleLines('caja', 'capital', 1000000),
        })
        let bundle = await loadStatementsForYear(Y)
        expect(bundle.balanceSheet.totalAssets.amount).toBe(0) // draft no cuenta

        manualPosted = await postDraft(draft.id)
        expect(manualPosted.status).toBe('POSTED')
        expect(manualPosted.entryNumber).toBe(1)

        await expect(updateDraftEntry(manualPosted.id, { memo: 'x' })).rejects.toThrow(PostingError)
        await expect(deleteDraftEntry(manualPosted.id)).rejects.toThrow(PostingError)
        await expect(voidOperationEntry(manualPosted.id)).rejects.toThrow(PostingError)

        bundle = await loadStatementsForYear(Y)
        expect(bundle.balanceSheet.totalAssets.amount).toBe(1000000)
    })

    it('2A: contabilizaciones inválidas rechazadas (NaN/inexistente/agrupadora)', async () => {
        await expect(postNewEntry({ date: `${Y}-02-01`, memo: 'x', lines: [{ accountId: 'caja', debit: NaN, credit: 0 }, { accountId: 'capital', debit: 0, credit: 1 }] })).rejects.toThrow(PostingError)
        await expect(postNewEntry({ date: `${Y}-02-01`, memo: 'x', lines: simpleLines('no-existe', 'capital', 1) })).rejects.toThrow(PostingError)
        await expect(postNewEntry({ date: `${Y}-02-01`, memo: 'x', lines: simpleLines('header-activo', 'capital', 1) })).rejects.toThrow(PostingError)
    })

    it('2B: edición operativa = reversión + sustituto; anulación = reversión', async () => {
        const { entry: op } = await postOperation({
            date: `${Y}-03-01`, memo: 'Compra', lines: simpleLines('mercaderias', 'proveedores', 1000),
            sourceModule: 'inventory', sourceType: 'purchase', sourceId: 'gate-op',
        })
        const substitute = await replaceOperationEntry(op.id, { lines: simpleLines('mercaderias', 'proveedores', 1500) })
        expect(substitute.id).not.toBe(op.id)
        const original = (await db.entries.get(op.id))!
        expect(original.status).toBe('REVERSED')
        expect(original.lines[0].debit).toBe(1000) // contenido económico intacto

        await voidOperationEntry(substitute.id, { reason: 'gate' })
        const bundle = await loadStatementsForYear(Y)
        const merc = bundle.trialBalance.rows.find(r => r.accountId === 'mercaderias')
        expect(merc?.closing ?? 0).toBe(0) // neto cero tras anulación
    })

    it('2A: idempotencia — repetir la operación no duplica', async () => {
        const input = {
            date: `${Y}-04-01`, memo: 'Venta', lines: simpleLines('deudores', 'ventas', 500),
            sourceModule: 'inventory', sourceType: 'sale', sourceId: 'gate-sale',
        }
        const first = await postOperation(input)
        const second = await postOperation(input)
        expect(second.idempotentHit).toBe(true)
        expect(second.entry.id).toBe(first.entry.id)
    })

    it('2A+2B: Diario=Mayor=Balance, A=P+PN, ER=EEPN, PN ESP=cierre EEPN', async () => {
        await postNewEntry({ date: `${Y}-05-01`, memo: 'Gasto', lines: simpleLines('gastos', 'caja', 200) })
        const bundle = await loadStatementsForYear(Y)
        const ids = ['journal-balance', 'ledger-journal', 'equation', 'er-eepn', 'eepn-esp']
        for (const id of ids) {
            const c = bundle.validation.checks.find(ch => ch.id === id)!
            expect(c.passed, id).toBe(true)
        }
    })

    it('2B: EFE directo = indirecto; efectivo EFE = ESP; variación = final − inicial', async () => {
        const bundle = await loadStatementsForYear(Y)
        for (const id of ['efe-metodos', 'efe-esp', 'efe-variacion']) {
            expect(bundle.validation.checks.find(c => c.id === id)!.passed, id).toBe(true)
        }
    })

    it('2B: cierre → refundición → apertura → reapertura', async () => {
        const exId = exerciseIdForYear(Y)
        const preview = await previewClosing(exId)
        expect(preview.canClose).toBe(true)
        await postClosing(exId)
        expect((await getExercise(exId))?.status).toBe('CLOSED')

        const opening = await generateOpeningEntry(exId)
        expect(opening.entry.sourceType).toBe('apertura')

        // 2026 hereda el patrimonio sin duplicar el resultado
        const b2026 = await loadStatementsForYear(Y + 1)
        expect(b2026.incomeStatement.netIncome.amount).toBe(0)
        expect(b2026.balanceSheet.equity.amount).toBe(bundleEquityAfterClose())

        await reopenClosedExercise(exId, 'gate')
        expect((await getExercise(exId))?.status).toBe('OPEN')

        function bundleEquityAfterClose() {
            // capital 1.000.000 + resultado (500 − 200)
            return 1000300
        }
    })

    it('2B: inflación — índice faltante y origen desconocido bloquean; RECPAM directo=indirecto', async () => {
        expect(getCoefficient(new Map(), '2025-01', '2025-12')).toBeNull()

        const indexes = new Map([['2025-01', 100], ['2025-07', 160], ['2025-12', 200]])
        const accounts = await db.accounts.toArray()

        const blocked = computeInflationAdjustment({
            entries: [], accounts,
            openingBalances: new Map([['mercaderias', { debit: 100, credit: 0 }]]),
            closePeriod: '2025-12', indexes,
        })
        expect(blocked.insufficientOrigins.length).toBe(1)
        expect(blocked.canPost).toBe(false)

        const entries: JournalEntry[] = [
            { id: 'i1', date: '2025-01-10', memo: 'aporte', status: 'POSTED', lines: simpleLines('caja', 'capital', 1000) },
            { id: 'i2', date: '2025-07-10', memo: 'compra', status: 'POSTED', lines: simpleLines('mercaderias', 'proveedores', 400) },
        ]
        const ok = computeInflationAdjustment({
            entries, accounts, openingBalances: new Map(), closePeriod: '2025-12', indexes,
        })
        expect(ok.reconciled).toBe(true)
        expect(ok.recpamDirect.recpam).toBe(ok.recpamIndirect.recpam)
    })

    it('2B: indicador con denominador cero no devuelve Infinity', async () => {
        const bundle = await loadStatementsForYear(2030) // ejercicio vacío
        const catalog = buildMetricsCatalog(bundle, await db.accounts.toArray())
        for (const entry of catalog) {
            if (entry.result.status === 'CALCULATED') {
                expect(Number.isFinite(entry.result.value), entry.id).toBe(true)
            }
        }
    })

    it('2A+2B: backup/restore conserva schema v18+ y todos los registros', async () => {
        const backup = await exportBackup()
        expect(backup.schemaVersion).toBeGreaterThanOrEqual(18)
        const before = (await db.entries.toArray()).sort((a, b) => a.id.localeCompare(b.id))

        await db.delete()
        await db.open()
        await restoreBackup(JSON.parse(JSON.stringify(backup)))

        const after = (await db.entries.toArray()).sort((a, b) => a.id.localeCompare(b.id))
        expect(after).toEqual(before)
        expect(backup.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    })

    it('arquitectura: único escritor de entries; sin consumidores del RECPAM legacy fuera de la pantalla contenida', () => {
        const SRC = join(__dirname, '..', '..', 'src')
        const ALLOWED = ['src/accounting/repositories/journalRepository.ts']
        const WRITE = /db\s*\.\s*entries\s*\.\s*(add|put|update|delete|bulkAdd|bulkPut|bulkDelete|clear|modify)\s*\(/
        const offendersWrite: string[] = []
        const legacyRecpamConsumers: string[] = []

        const walk = (dir: string) => {
            for (const name of readdirSync(dir)) {
                const full = join(dir, name)
                if (statSync(full).isDirectory()) { walk(full); continue }
                if (!/\.(ts|tsx)$/.test(name)) continue
                const rel = relative(join(SRC, '..'), full).split(sep).join('/')
                const content = readFileSync(full, 'utf-8')
                if (!ALLOWED.includes(rel) && WRITE.test(content)) offendersWrite.push(rel)
                if (rel !== 'src/core/cierre-valuacion/recpam-indirecto.ts'
                    && /from\s+['"].*recpam-indirecto['"]/.test(content)) {
                    legacyRecpamConsumers.push(rel)
                }
            }
        }
        walk(SRC)
        expect(offendersWrite).toEqual([])
        // Fase 2C: el RECPAM legacy no debe tener consumidores ejecutables
        expect(legacyRecpamConsumers).toEqual([])
    })
})
