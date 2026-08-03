/**
 * Fase 2K §22, §24 — exportaciones consolidadas.
 *
 * Verifica que el libro de trabajo en Excel contenga DATOS REALES (no una
 * maqueta): las hojas esperadas, los importes del motor con formato numérico
 * y no como texto, las eliminaciones con su fundamento y el detalle de la PNC.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { seedGrupoLitoral } from '../../src/consolidation/fixtures/grupoLitoral'
import { runConsolidation, type ConsolidationResult } from '../../src/consolidation/service'
import { buildConsolidationWorkbook } from '../../src/consolidation/export/consolidatedWorkbook'
import type ExcelJS from 'exceljs'

let result: ConsolidationResult
let wb: ExcelJS.Workbook

const cellValues = (sheet: ExcelJS.Worksheet): unknown[] => {
    const out: unknown[] = []
    sheet.eachRow(row => row.eachCell(cell => out.push(cell.value)))
    return out
}

describe('Exportación del libro de trabajo de consolidación', () => {
    beforeAll(async () => {
        await resetDb()
        const seed = await seedGrupoLitoral()
        result = await runConsolidation(seed.consolidation2025Id, { withComparative: true })
        wb = buildConsolidationWorkbook(result.worksheet, result.statements)
    }, 60_000)

    it('incluye todas las hojas del juego consolidado', () => {
        expect(wb.worksheets.map(w => w.name)).toEqual([
            'Portada y control',
            'Hoja de consolidación',
            'Eliminaciones',
            'Cálculo de eliminaciones',
            'Participación no controladora',
            'ESP consolidado',
            'ER consolidado',
            'EEPN consolidado',
            'EFE consolidado',
            'Notas',
        ])
    })

    it('la portada identifica al grupo, a la controladora y al período', () => {
        const values = cellValues(wb.getWorksheet('Portada y control')!)
        expect(values).toContain('Grupo Litoral')
        expect(values).toContain('Controladora: Litoral Holding S.A.')
        expect(values.some(v => typeof v === 'string' && v.includes('2025-01-01 al 2025-12-31'))).toBe(true)
        expect(values.some(v => typeof v === 'string' && v.includes('Moneda: ARS'))).toBe(true)
    })

    it('la portada lista los controles de integridad y su resultado', () => {
        const values = cellValues(wb.getWorksheet('Portada y control')!)
        expect(values).toContain('PASA')
        expect(values).not.toContain('NO PASA')
        expect(values.some(v => typeof v === 'string' && /activo = pasivo/i.test(v))).toBe(true)
    })

    it('la hoja de consolidación trae los importes del motor como NÚMEROS', () => {
        const sheet = wb.getWorksheet('Hoja de consolidación')!
        const rows: unknown[][] = []
        sheet.eachRow(row => rows.push((row.values as unknown[]).slice(1)))

        const mercaderias = rows.find(r => r[1] === 'Bienes de cambio')!
        // Litoral 130.000 · Iberá 90.000 · suma previa 220.000 · consolidado 202.000
        expect(mercaderias[2]).toBe(130_000)
        expect(mercaderias[3]).toBe(90_000)
        expect(mercaderias[4]).toBe(220_000)
        expect(mercaderias[mercaderias.length - 1]).toBe(202_000)
        expect(typeof mercaderias[4]).toBe('number')

        const inversiones = rows.find(r => r[1] === 'Inversiones permanentes')!
        expect(inversiones[inversiones.length - 1]).toBe(0)
    })

    it('las eliminaciones se exportan con su fundamento y todas balancean', () => {
        const sheet = wb.getWorksheet('Eliminaciones')!
        const rows: unknown[][] = []
        sheet.eachRow(row => rows.push((row.values as unknown[]).slice(1)))
        const dataRows = rows.filter(r => typeof r[0] === 'string' && String(r[0]).startsWith('elim-'))

        expect(dataRows.length).toBeGreaterThan(0)
        expect(dataRows.every(r => r[8] === 'Sí')).toBe(true)
        // Cada línea lleva su explicación: no hay importes sin justificar
        expect(dataRows.every(r => typeof r[9] === 'string' && String(r[9]).length > 40)).toBe(true)
        // Debe = Haber en el conjunto
        const debit = dataRows.reduce((s, r) => s + Number(r[6] ?? 0), 0)
        const credit = dataRows.reduce((s, r) => s + Number(r[7] ?? 0), 0)
        expect(Math.round(debit * 100)).toBe(Math.round(credit * 100))
    })

    it('la hoja de PNC trae la determinación completa por controlada', () => {
        const sheet = wb.getWorksheet('Participación no controladora')!
        const rows: unknown[][] = []
        sheet.eachRow(row => rows.push((row.values as unknown[]).slice(1)))
        const ibera = rows.find(r => r[0] === 'Iberá Distribuciones S.A.')!
        expect(ibera[1]).toBeCloseTo(0.2, 10)      // % no controlado
        expect(ibera[2]).toBe(406_000)             // PN de la controlada
        expect(ibera[3]).toBe(-18_000)             // resultados no trascendidos propios
        expect(ibera[4]).toBe(388_000)             // PN ajustado
        expect(ibera[5]).toBe(77_600)              // PNC al cierre
        expect(ibera[8]).toBe(15_600)              // resultado atribuible a la PNC
        expect(ibera[11]).toBe(0)                  // diferencia de consolidación
    })

    it('el ESP consolidado expone la PNC dentro del patrimonio neto', () => {
        const sheet = wb.getWorksheet('ESP consolidado')!
        const rows: unknown[][] = []
        sheet.eachRow(row => rows.push((row.values as unknown[]).slice(1)))
        const find = (label: string) => rows.find(r => String(r[0]).trim() === label)

        expect(find('Total del activo')![1]).toBe(1_389_000)
        expect(find('Total del pasivo')![1]).toBe(100_000)
        expect(find('Participación no controladora')![1]).toBe(77_600)
        expect(find('Total del patrimonio neto')![1]).toBe(1_289_000)
        expect(find('Total del pasivo y del patrimonio neto')![1]).toBe(1_389_000)
    })

    it('el ER consolidado separa las dos atribuciones del resultado', () => {
        const sheet = wb.getWorksheet('ER consolidado')!
        const rows: unknown[][] = []
        sheet.eachRow(row => rows.push((row.values as unknown[]).slice(1)))
        const find = (label: string) => rows.find(r => String(r[0]).trim() === label)

        expect(find('Resultado del ejercicio')![1]).toBe(202_000)
        expect(find('Resultado atribuible a los propietarios de la controladora')![1]).toBe(186_400)
        expect(find('Resultado atribuible a la participación no controladora')![1]).toBe(15_600)
    })

    it('el EFE consolidado trae los flujos internos eliminados', () => {
        const sheet = wb.getWorksheet('EFE consolidado')!
        const values = cellValues(sheet)
        expect(values).toContain('Efectivo al cierre del ejercicio')
        expect(values).toContain(87_000)
        expect(values.some(v => typeof v === 'string' && /Desembolso del préstamo intragrupo/.test(v))).toBe(true)
        expect(values).toContain(200_000)
    })

    it('las notas marcan explícitamente las que requieren narrativa del emisor', () => {
        const values = cellValues(wb.getWorksheet('Notas')!)
        expect(values).toContain('Bases de consolidación')
        expect(values).toContain('Composición del grupo económico')
        expect(values).toContain('Participación no controladora')
        expect(values).toContain('[Requiere que el emisor complete la narrativa profesional]')
    })

    it('el libro se serializa a un archivo xlsx válido', async () => {
        const buffer = await wb.xlsx.writeBuffer()
        expect(buffer.byteLength).toBeGreaterThan(10_000)
        // Firma de un contenedor ZIP (formato OOXML)
        const head = new Uint8Array(buffer.slice(0, 2))
        expect(head[0]).toBe(0x50)
        expect(head[1]).toBe(0x4b)
    })
})
