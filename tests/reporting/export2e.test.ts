/**
 * Fase 2E (§13): la exportación formal expone los contenidos nuevos con las
 * MISMAS cifras del bundle (sin recalcular):
 * - ER con antes de impuesto / IG / operaciones que continúan;
 * - EEPN como matriz de doble entrada;
 * - EFE con método 'Ambos';
 * - anexos: gastos por función, CMV, bienes de uso;
 * - notas numeradas.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadReportingBundle, type ReportingBundle } from '../../src/reporting/loadReportingBundle'
import { buildSelectedReportSheets } from '../../src/lib/exportReportBundle'
import { defaultExportOptions } from '../../src/lib/exportOptions'

describe('Fase 2E — exportación formal consistente', () => {
    let bundle: ReportingBundle
    let sheets: ReturnType<typeof buildSelectedReportSheets>

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-02-01', memo: 'compra', lines: simpleLines('mercaderias', 'caja', 200000) })
        await postNewEntry({ date: '2025-03-10', memo: 'venta', lines: simpleLines('deudores', 'ventas', 300000) })
        await postNewEntry({ date: '2025-03-10', memo: 'cmv', lines: simpleLines('cmv', 'mercaderias', 180000) })
        await postNewEntry({ date: '2025-06-30', memo: 'gasto', lines: simpleLines('gastos', 'caja', 50000) })
        bundle = await loadReportingBundle(2025)
        sheets = buildSelectedReportSheets(bundle, { ...defaultExportOptions(false), efeMethod: 'BOTH' })
    })

    const sheet = (name: string) => sheets.find(s => s.name === name)

    it('ER: subtotales 2E con la misma cifra que el bundle', () => {
        const er = sheet('ER')!
        const find = (label: string) => er.rows.find(r => typeof r[0] === 'string' && (r[0] as string).trim() === label)
        expect(find('Resultado antes del impuesto a las ganancias')?.[1])
            .toBe(bundle.statements.incomeStatement.preTaxResult.amount)
        expect(find('Resultado del ejercicio')?.[1])
            .toBe(bundle.statements.incomeStatement.netIncome.amount)
        // El plan semilla de tests no tiene cuenta INCOME_TAX ⇒ nunca $0 fingido
        expect(bundle.statements.incomeStatement.incomeTaxStatus).toBe('INSUFFICIENT_INFORMATION')
        const igRow = find('Impuesto a las ganancias')
        expect(igRow?.[1]).toBe('Información insuficiente (sin mapping)')
    })

    it('EEPN: hoja matricial con cierre = PN del ESP', () => {
        const eepn = sheet('EEPN')!
        const closing = eepn.rows.find(r => r[0] === 'Saldos al cierre')!
        const totalIdx = eepn.rows[1].length - 1
        expect(closing[totalIdx]).toBe(bundle.statements.balanceSheet.equity.amount)
        // encabezado agrupado presente (dos filas de cabecera)
        expect(eepn.rows[1][0]).toBe('Movimiento')
    })

    it("EFE con método 'Ambos': dos hojas con los mismos flujos del bundle", () => {
        const directo = sheet('EFE directo')!
        const indirecto = sheet('EFE indirecto')!
        const closingRow = (s: typeof directo) => s.rows.find(r => typeof r[0] === 'string' && (r[0] as string).includes('al cierre'))!
        expect(closingRow(directo)[1]).toBe(bundle.statements.cashFlowDirect!.closingCash.amount)
        expect(closingRow(indirecto)[1]).toBe(bundle.statements.cashFlowIndirect!.closingCash.amount)
    })

    it('anexo de gastos por función: total = bundle', () => {
        const gastos = sheet('Gastos por función')!
        const total = gastos.rows.find(r => r[0] === 'Total')!
        expect(total[1]).toBe(bundle.statements.expensesByFunction.totals.total)
    })

    it('CMV: puente con las cifras del bundle', () => {
        const cmv = sheet('Costo de ventas')!
        const find = (label: string) => cmv.rows.find(r => r[0] === label)
        expect(find('Existencia inicial')?.[1]).toBe(bundle.statements.costOfSales.openingInventory.amount)
        expect(find('Costo de ventas (puente)')?.[1]).toBe(bundle.statements.costOfSales.costOfSales.amount)
        expect(find('Costo de ventas según ER')?.[1]).toBe(bundle.statements.incomeStatement.costOfSales.amount)
    })

    it('bienes de uso: residual del anexo = ESP', () => {
        const ppe = sheet('Bienes de uso')
        // el escenario no tiene bienes de uso ⇒ la hoja no se exporta (sin ceros ficticios)
        if (bundle.statements.fixedAssetsAnnex.rows.length === 0) {
            expect(ppe).toBeUndefined()
        } else {
            const totalRow = ppe!.rows.find(r => r[0] === 'Total')!
            expect(totalRow[9]).toBe(bundle.statements.fixedAssetsAnnex.totals.residual)
        }
    })

    it('notas numeradas en la hoja de notas', () => {
        const notas = sheet('Notas')!
        const first = notas.rows[1][0] as string
        expect(first).toMatch(/^Nota \d+ — /)
    })
})
