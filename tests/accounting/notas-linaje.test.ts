/**
 * Fase 2B — Notas reconciliadas (§12) y trazabilidad/linaje (§14).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadReportingInput, loadStatementsForYear } from '../../src/reporting/loadStatements'
import { buildNotes } from '../../src/reporting/engine/buildNotes'
import { getLineLineage } from '../../src/reporting/lineage'
import type { StatementsBundle } from '../../src/reporting/domain/types'
import type { StatementNote } from '../../src/reporting/engine/buildNotes'

describe('Fase 2B — notas y linaje', () => {
    let bundle: StatementsBundle
    let notes: StatementNote[]

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'Aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-02-01', memo: 'Compra mercaderías', lines: simpleLines('mercaderias', 'proveedores', 300000) })
        await postNewEntry({ date: '2025-03-01', memo: 'Venta', lines: simpleLines('deudores', 'ventas', 150000) })
        bundle = await loadStatementsForYear(2025)
        const input = await loadReportingInput(2025)
        notes = buildNotes(input, bundle)
    })

    it('la nota de deudas comerciales reconcilia exactamente con el pasivo del ESP', () => {
        const deudas = notes.find(n => n.id === 'nota-deudas-comerciales')!
        expect(deudas.total).toBe(300000)
        expect(deudas.reconciled).toBe(true)
        expect(deudas.lines.every(l => l.origin === 'DERIVED')).toBe(true)
    })

    it('la nota de efectivo usa la misma política que el EFE y reconcilia', () => {
        const efectivo = notes.find(n => n.id === 'nota-efectivo')!
        expect(efectivo.total).toBe(1000000)
        expect(efectivo.reconciled).toBe(true)
    })

    it('las notas manuales se declaran NOT_AVAILABLE (no se inventan)', () => {
        const contingencias = notes.find(n => n.id === 'nota-contingencias')!
        expect(contingencias.lines[0].origin).toBe('NOT_AVAILABLE')
        expect(contingencias.total).toBeNull()
    })

    it('la nota de bases declara normativa y modo educativo', () => {
        const bases = notes.find(n => n.id === 'nota-bases')!
        expect(bases.text).toContain('RT 54')
        expect(bases.text).toContain('laboratorio educativo')
    })

    it('linaje: de la línea de ventas del ER a sus asientos', async () => {
        const salesLine = bundle.incomeStatement.sales
        const lineage = await getLineLineage(bundle, salesLine.id, salesLine.accountIds)
        expect(lineage.movements).toHaveLength(1)
        expect(lineage.movements[0].memo).toBe('Venta')
        expect(lineage.movements[0].credit).toBe(150000)
        expect(lineage.totalCredit).toBe(150000)
    })

    it('linaje: del activo corriente del ESP a movimientos con operación de origen', async () => {
        const ac = bundle.balanceSheet.currentAssets
        const lineage = await getLineLineage(bundle, ac.id, ac.accountIds)
        expect(lineage.movements.length).toBeGreaterThanOrEqual(3)
        // Cada movimiento referencia asiento, cuenta y estado
        for (const m of lineage.movements) {
            expect(m.entryId).toBeTruthy()
            expect(m.accountLabel).toBeTruthy()
            expect(m.status).toBe('POSTED')
        }
    })
})
