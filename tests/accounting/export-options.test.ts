/**
 * Fase 2D (§3) — La exportación formal respeta las opciones (contenido, método
 * del EFE, comparativo) y sigue usando EXACTAMENTE las cifras del bundle.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadReportingBundle, type ReportingBundle } from '../../src/reporting/loadReportingBundle'
import { buildSelectedReportSheets } from '../../src/lib/exportReportBundle'
import { defaultExportOptions, type ExportEstadosOptions } from '../../src/lib/exportOptions'

describe('Fase 2D — opciones de exportación', () => {
    let bundle: ReportingBundle

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-03-10', memo: 'venta', lines: simpleLines('deudores', 'ventas', 300000) })
        await postNewEntry({ date: '2025-03-10', memo: 'cmv', lines: simpleLines('cmv', 'mercaderias', 180000) })
        bundle = await loadReportingBundle(2025)
    })

    it('filtra las hojas por el contenido seleccionado', () => {
        const opts: ExportEstadosOptions = { ...defaultExportOptions(false), content: { esp: true, er: false, eepn: false, efe: false, notas: false, anexos: false, indicadores: false, analisis: false } }
        const names = buildSelectedReportSheets(bundle, opts).map(s => s.name)
        expect(names).toContain('Metadatos')
        expect(names).toContain('ESP')
        expect(names).not.toContain('ER')
        expect(names).not.toContain('EEPN')
        expect(names.some(n => n.startsWith('EFE'))).toBe(false)
    })

    it('elige la hoja del EFE según el método', () => {
        const direct = buildSelectedReportSheets(bundle, { ...defaultExportOptions(false), content: { esp: false, er: false, eepn: false, efe: true, notas: false, anexos: false, indicadores: false, analisis: false }, efeMethod: 'DIRECT' })
        expect(direct.some(s => s.name === 'EFE directo')).toBe(true)
        const indirect = buildSelectedReportSheets(bundle, { ...defaultExportOptions(false), content: { esp: false, er: false, eepn: false, efe: true, notas: false, anexos: false, indicadores: false, analisis: false }, efeMethod: 'INDIRECT' })
        expect(indirect.some(s => s.name === 'EFE indirecto')).toBe(true)
    })

    it('la hoja ESP exportada coincide con las cifras del bundle', () => {
        const opts = { ...defaultExportOptions(false), content: { esp: true, er: false, eepn: false, efe: false, notas: false, anexos: false, indicadores: false, analisis: false } }
        const esp = buildSelectedReportSheets(bundle, opts).find(s => s.name === 'ESP')!
        const totalRow = esp.rows.find(r => typeof r[0] === 'string' && (r[0] as string).includes('Total del activo'))!
        expect(totalRow[1]).toBe(bundle.statements.balanceSheet.totalAssets.amount)
    })

    it('sin comparativo la cabecera tiene una sola columna de importes', () => {
        const opts = { ...defaultExportOptions(false), comparative: false, content: { esp: true, er: false, eepn: false, efe: false, notas: false, anexos: false, indicadores: false, analisis: false } }
        const esp = buildSelectedReportSheets(bundle, opts).find(s => s.name === 'ESP')!
        expect(esp.rows[0]).toEqual(['Concepto', 'Ejercicio actual'])
    })
})
