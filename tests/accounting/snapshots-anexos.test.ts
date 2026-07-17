/**
 * Fase 2C — Snapshots de reportes (§16) y anexo de bienes de uso (§15).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { postClosing, generateOpeningEntry, reopenClosedExercise } from '../../src/accounting/application/closingService'
import { exerciseIdForYear } from '../../src/accounting/application/contextService'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { loadReportingInput, loadStatementsForYear } from '../../src/reporting/loadStatements'
import { buildNotes } from '../../src/reporting/engine/buildNotes'
import { createSnapshot, listSnapshots } from '../../src/reporting/snapshots/snapshotService'
import { insertEntryRecord } from '../../src/accounting/repositories/journalRepository'

describe('Fase 2C — snapshots de reportes', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-10', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-06-01', memo: 'venta', lines: simpleLines('caja', 'ventas', 500) })
    })

    it('crea un snapshot PUBLISHED de un reporte validado', async () => {
        const bundle = await loadReportingBundle(2025)
        expect(bundle.statements.validation.canPublish).toBe(true)
        const snap = await createSnapshot(bundle, { status: 'PUBLISHED' })
        expect(snap.status).toBe('PUBLISHED')
        expect(snap.contentHash).toBe(bundle.metadata.reportVersion)
        expect(snap.bundleJson).toContain('balanceSheet')

        const list = await listSnapshots(exerciseIdForYear(2025))
        expect(list).toHaveLength(1)
    })

    it('no publica un reporte no validado: queda DRAFT', async () => {
        // Insertar asiento con cuenta inexistente ⇒ no publicable
        await insertEntryRecord({
            id: 'bad', date: '2025-03-01', memo: 'roto', status: 'POSTED',
            lines: [{ accountId: 'cuenta-x', debit: 10, credit: 0 }, { accountId: 'capital', debit: 0, credit: 10 }],
        })
        const bundle = await loadReportingBundle(2025)
        expect(bundle.statements.validation.canPublish).toBe(false)
        const snap = await createSnapshot(bundle, { status: 'PUBLISHED' })
        expect(snap.status).toBe('DRAFT')
    })

    it('reabrir un ejercicio invalida sus snapshots (no los borra)', async () => {
        await postClosing(exerciseIdForYear(2025))
        await generateOpeningEntry(exerciseIdForYear(2025))
        const bundle = await loadReportingBundle(2025)
        const snap = await createSnapshot(bundle, { status: 'PUBLISHED' })
        expect(snap.status).toBe('PUBLISHED')

        await reopenClosedExercise(exerciseIdForYear(2025), 'corrección')

        const list = await listSnapshots(exerciseIdForYear(2025))
        expect(list).toHaveLength(1) // no se borró
        expect(list[0].status).toBe('INVALIDATED')
        expect(list[0].invalidatedReason).toContain('Reapertura')
    })
})

describe('Fase 2C — anexo de evolución de bienes de uso', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('produce el cuadro con altas y depreciación derivadas del Diario', async () => {
        await postNewEntry({ date: '2025-01-10', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-02-01', memo: 'alta rodado', lines: simpleLines('bienes-uso', 'caja', 500000) })
        await postNewEntry({ date: '2025-12-31', memo: 'depreciación', lines: simpleLines('deprec', 'amort-acum', 50000) })

        const bundle = await loadStatementsForYear(2025)
        const input = await loadReportingInput(2025)
        const notes = buildNotes(input, bundle)
        const anexo = notes.find(n => n.id === 'anexo-bienes-uso')!
        expect(anexo).toBeDefined()

        const rodado = anexo.lines.find(l => l.label.includes('Rodados'))!
        expect(rodado.label).toContain('Altas 500000')
        const amort = anexo.lines.find(l => l.label.includes('Amortización'))!
        expect(amort.label).toContain('Depreciación acumulada 50000')

        // El neto del anexo (500.000 − 50.000) coincide con el ANC del ESP
        expect(anexo.total).toBe(bundle.balanceSheet.nonCurrentAssets.amount)
    })
})
