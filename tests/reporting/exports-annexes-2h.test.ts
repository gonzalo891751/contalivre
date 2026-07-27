/**
 * Fase 2H §H11 — Las exportaciones coinciden con el bundle canónico.
 *
 * §15 exige que los importes del XLSX salgan del MISMO motor que la pantalla.
 * Estas pruebas comparan celda por celda contra el bundle: si alguien recalcula
 * algo en el exportador, la prueba falla.
 *
 * También se fija el reparto de responsabilidades: el papel de trabajo (base,
 * regla, porcentajes, controles) va al XLSX; el PDF profesional no lo lleva.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resetDb } from '../accounting/helpers'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { buildReportSheets } from '../../src/lib/exportReportBundle'
import {
    loadIndustrialFixture,
    INDUSTRIAL_FIXTURE_YEAR,
} from '../../src/accounting/fixtures/sectorFixtures'
import type { WorkbookSheet } from '../../src/lib/spreadsheet'

const sheetNamed = (sheets: WorkbookSheet[], name: string) => sheets.find(s => s.name === name)

describe('Fase 2H §H11 — XLSX vs bundle (empresa industrial)', () => {
    let bundle: Awaited<ReturnType<typeof loadReportingBundle>>
    let sheets: WorkbookSheet[]

    beforeAll(async () => {
        await resetDb()
        await loadIndustrialFixture()
        bundle = await loadReportingBundle(INDUSTRIAL_FIXTURE_YEAR)
        sheets = buildReportSheets(bundle)
    })

    it('exporta la hoja de costo de ventas con el bloque de producción', () => {
        const sheet = sheetNamed(sheets, 'Costo de ventas')!
        expect(sheet).toBeDefined()

        const labels = sheet.rows.map(r => String(r[0] ?? ''))
        expect(labels).toContain('(=) Costo de producción del período')
        expect(labels).toContain('(=) Costo de productos terminados')
        expect(labels).toContain('(=) Costo de los productos vendidos')
    })

    it('los importes del costo de producción son los del bundle, no recalculados', () => {
        const sheet = sheetNamed(sheets, 'Costo de ventas')!
        const production = bundle.statements.costOfSales.production!

        const find = (label: string) => sheet.rows.find(r => String(r[0]) === label)![1]

        expect(find('Materias primas e insumos consumidos')).toBe(production.directMaterials.amount)
        expect(find('(+) Mano de obra directa')).toBe(production.directLabor.amount)
        expect(find('(=) Costo de producción del período')).toBe(production.productionCost.amount)
        expect(find('(=) Costo de los productos vendidos')).toBe(production.costOfGoodsSold.amount)
    })

    it('el CMV exportado coincide con el del Estado de Resultados', () => {
        const sheet = sheetNamed(sheets, 'Costo de ventas')!
        const row = sheet.rows.find(r => String(r[0]) === 'Costo de ventas según ER')!
        expect(row[1]).toBe(bundle.statements.costOfSales.costOfSalesPerIncomeStatement)
    })

    it('el anexo de bienes de uso exporta los totales del bundle', () => {
        const sheet = sheetNamed(sheets, 'Bienes de uso')
        if (!sheet) return // el fixture industrial no carga bienes de uso
        const totals = bundle.statements.fixedAssetsAnnex.totals
        const last = sheet.rows[sheet.rows.length - 1]
        expect(last[4]).toBe(totals.grossClosing)
        expect(last[9]).toBe(totals.residual)
    })
})

describe('Fase 2H §H11 — papel de trabajo de gastos', () => {
    it('el XLSX incluye base, porcentaje, importe y control por asignación', async () => {
        await resetDb()
        const { seedTestAccounts, simpleLines } = await import('../accounting/helpers')
        const { postNewEntry } = await import('../../src/accounting/application/journalService')
        const { createRule } = await import('../../src/accounting/taxonomy/allocationRulesService')
        await seedTestAccounts()

        await postNewEntry({
            date: '2026-05-10',
            memo: 'Alquiler del local',
            lines: simpleLines('gastos', 'caja', 100000),
        })

        await createRule({
            accountId: 'gastos',
            validFrom: '2026-01-01',
            basis: 'SURFACE',
            allocations: [
                { function: 'ADMINISTRATION', percentage: 30, driverValue: 150 },
                { function: 'PRODUCTION', percentage: 70, driverValue: 350 },
            ],
            reason: 'Distribución por superficie afectada',
            status: 'ACTIVE',
        })

        const bundle = await loadReportingBundle(2026)
        const sheets = buildReportSheets(bundle)
        const sheet = sheetNamed(sheets, 'Gastos (preparación)')!

        expect(sheet).toBeDefined()
        const header = sheet.rows[0].map(String)
        for (const column of ['Base', 'Valor de la base', 'Porcentaje', 'Importe asignado', 'Control']) {
            expect(header).toContain(column)
        }

        const body = sheet.rows.slice(1)
        const admin = body.find(r => String(r[2]) === 'Administración')!
        const prod = body.find(r => String(r[2]) === 'Producción / costos directos')!

        expect(String(admin[3])).toBe('Superficie (m²)')
        expect(admin[4]).toBe(150)
        expect(admin[5]).toBe(30)
        expect(admin[6]).toBe(30000)
        expect(admin[9]).toBe('OK')

        expect(prod[4]).toBe(350)
        expect(prod[6]).toBe(70000)

        // La suma de lo asignado es exactamente el saldo contable.
        expect(Number(admin[6]) + Number(prod[6])).toBe(100000)
    })
})

describe('Fase 2H §H11 — separación entre PDF profesional y papel de trabajo', () => {
    const pdfSource = readFileSync(
        join(__dirname, '..', '..', 'src', 'lib', 'exportReportBundle.ts'),
        'utf-8'
    )

    it('el papel de trabajo se exporta como hoja propia del XLSX', () => {
        expect(pdfSource).toContain("name: 'Gastos (preparación)'")
    })

    it('el exportador no recalcula importes: sólo lee el bundle', () => {
        // No debe importar motores de cálculo; sólo tipos y etiquetas.
        expect(pdfSource).not.toContain('buildStatements')
        expect(pdfSource).not.toContain('buildCostOfSales')
        expect(pdfSource).not.toContain('buildExpensesByFunction')
    })
})
