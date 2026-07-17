/**
 * Fase 2C (§6.4) — Consistencia UI = ReportingBundle = exportación.
 * Los importes exportados deben ser EXACTAMENTE los del motor (una sola fuente).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { buildReportSheets } from '../../src/lib/exportReportBundle'
import type { ReportingBundle } from '../../src/reporting/loadReportingBundle'

/** Busca el importe de un concepto en una hoja (label→valor) */
function cell(sheets: ReturnType<typeof buildReportSheets>, sheetName: string, labelIncludes: string): number | null {
    const sheet = sheets.find(s => s.name === sheetName)!
    const row = sheet.rows.find(r => typeof r[0] === 'string' && (r[0] as string).includes(labelIncludes))
    return row ? (row[1] as number) : null
}

describe('Fase 2C — consistencia motor/exportación', () => {
    let bundle: ReportingBundle
    let sheets: ReturnType<typeof buildReportSheets>

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-02-01', memo: 'compra', lines: simpleLines('mercaderias', 'caja', 200000) })
        await postNewEntry({ date: '2025-03-10', memo: 'venta', lines: simpleLines('deudores', 'ventas', 300000) })
        await postNewEntry({ date: '2025-03-10', memo: 'cmv', lines: simpleLines('cmv', 'mercaderias', 180000) })
        bundle = await loadReportingBundle(2025)
        sheets = buildReportSheets(bundle)
    })

    it('el ESP exportado coincide con el bundle', () => {
        expect(cell(sheets, 'ESP', 'Total del activo')).toBe(bundle.statements.balanceSheet.totalAssets.amount)
        expect(cell(sheets, 'ESP', 'Patrimonio neto')).toBe(bundle.statements.balanceSheet.equity.amount)
        expect(cell(sheets, 'ESP', 'Total pasivo + patrimonio neto')).toBe(bundle.statements.balanceSheet.totalLiabilitiesAndEquity.amount)
    })

    it('el ER exportado coincide con el bundle', () => {
        expect(cell(sheets, 'ER', 'Resultado del ejercicio')).toBe(bundle.statements.incomeStatement.netIncome.amount)
        expect(cell(sheets, 'ER', 'Resultado bruto')).toBe(bundle.statements.incomeStatement.grossProfit.amount)
    })

    it('el EEPN exportado coincide con el bundle y con el PN del ESP', () => {
        const cierre = cell(sheets, 'EEPN', 'Saldos al cierre')
        expect(cierre).toBe(bundle.statements.equityStatement.closingBalance.amount)
        expect(cierre).toBe(bundle.statements.balanceSheet.equity.amount)
    })

    it('el EFE exportado coincide con el bundle', () => {
        expect(cell(sheets, 'EFE directo', 'Efectivo y equivalentes al cierre')).toBe(bundle.statements.cashFlowDirect!.closingCash.amount)
        expect(cell(sheets, 'EFE directo', 'Variación neta del efectivo')).toBe(bundle.statements.cashFlowDirect!.netChange.amount)
    })

    it('la hoja de metadatos incluye versión de motor y validaciones', () => {
        const meta = sheets.find(s => s.name === 'Metadatos')!
        const flat = meta.rows.map(r => r.join(' '))
        expect(flat.some(r => r.includes('Motor contable'))).toBe(true)
        expect(flat.some(r => r.includes('Validaciones'))).toBe(true)
        expect(flat.some(r => r.includes(bundle.metadata.reportVersion))).toBe(true)
    })

    it('todas las hojas del juego están presentes', () => {
        const names = sheets.map(s => s.name)
        for (const expected of ['Metadatos', 'ESP', 'ER', 'EEPN', 'EFE directo', 'EFE indirecto', 'Notas', 'Indicadores', 'Análisis vertical', 'Análisis horizontal']) {
            expect(names, expected).toContain(expected)
        }
    })
})
