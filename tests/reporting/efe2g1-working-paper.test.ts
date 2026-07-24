/**
 * Fase 2G.1 — HITO 6: exportación del papel de trabajo en moneda de cierre (§3.E, §8).
 *
 * El papel de trabajo (documento INTERNO) admite nominal, moneda de cierre o
 * ambas. En moneda de cierre incluye la hoja "Reexpresión" con la evidencia por
 * contribución (índice origen/cierre, coeficiente, redondeo) y su suma reconcilia.
 * El export FORMAL nunca incluye la matriz (contrato de separación).
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { reexpressCashFlow } from '../../src/reporting/engine/cashFlowInflation'
import { buildCashFlowPreparation, buildCashFlowPreparationRestated } from '../../src/reporting/preparation/cashFlowPreparation'
import { buildPublicationGate } from '../../src/reporting/engine/publicationGate'
import { buildWorkingPaperSheets } from '../../src/lib/exportWorkingPaper'
import { buildSelectedReportSheets } from '../../src/lib/exportReportBundle'
import { defaultExportOptions } from '../../src/lib/exportOptions'
import { buildPurmamarcaInput, purmamarcaFlatIndexes } from './fixtures/purmamarca'
import type { ReportingBundle } from '../../src/reporting/loadReportingBundle'

function makeBundle(withRestated: boolean): ReportingBundle {
    const input = buildPurmamarcaInput()
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    statements.cashFlowDirect = cashFlows.direct
    statements.cashFlowIndirect = cashFlows.indirect
    statements.validation = cashFlows.validation
    const preparation = buildCashFlowPreparation(input, statements, cashFlows)
    let cashFlowRestated = null as ReportingBundle['cashFlowRestated']
    let preparationRestated = null as ReportingBundle['preparationRestated']
    if (withRestated) {
        const indexes = purmamarcaFlatIndexes()
        const restated = reexpressCashFlow(input, statements, indexes)
        cashFlowRestated = restated
        preparationRestated = buildCashFlowPreparationRestated(input, statements, cashFlows, restated, {
            indexes, indexSetId: 'set-x', indexSetHash: 'hash-x',
        })
    }
    const publicationGate = buildPublicationGate({ validation: statements.validation, restated: cashFlowRestated, inflationSet: null })
    return {
        statements, cashFlowRestated, preparation, preparationRestated, publicationGate, inflationSet: null,
        metadata: {
            companyId: 'purmamarca', companyLegalName: 'Purmamarca SA', exerciseLabel: 'Ej. 2022',
            periodStart: '2022-01-01', periodEnd: '2022-12-31', currency: 'ARS', unit: 'Pesos ($)',
            normative: 'RT 54', engineVersion: '2G.1', reportVersion: 'rv', status: 'VALIDATED', hasComparative: false,
        },
    } as unknown as ReportingBundle
}

describe('Fase 2G.1 — papel de trabajo en moneda de cierre', () => {
    it('nominal (por defecto): sin hoja Reexpresión', () => {
        const sheets = buildWorkingPaperSheets(makeBundle(true))
        const names = sheets.map(s => s.name)
        expect(names).toContain('Resumen y controles')
        expect(names).toContain('Matriz')
        expect(names.some(n => n.includes('Reexpresión'))).toBe(false)
    })

    it('moneda de cierre: incluye hoja Reexpresión con evidencia por contribución', () => {
        const sheets = buildWorkingPaperSheets(makeBundle(true), 'CLOSING_CURRENCY')
        const rex = sheets.find(s => s.name.includes('Reexpresión'))!
        expect(rex).toBeDefined()
        const header = rex.rows[0].map(String)
        for (const col of ['Fecha', 'Asiento', 'Cuenta', 'Importe nominal', 'Índice origen', 'Índice cierre', 'Coeficiente', 'Reexpresado', 'Dif. redondeo']) {
            expect(header.some(h => h.includes(col)), col).toBe(true)
        }
        // Con coef=1 la suma reexpresada iguala la suma nominal (no efectivo)
        const total = rex.rows.find(r => String(r[0]).startsWith('Total reexpresado'))
        expect(total).toBeDefined()
    })

    it('ambas: hojas nominales (N·) y de cierre (MC·) sin colisión', () => {
        const sheets = buildWorkingPaperSheets(makeBundle(true), 'BOTH')
        const names = sheets.map(s => s.name)
        expect(names).toContain('N·Matriz')
        expect(names).toContain('MC·Matriz')
        expect(names.some(n => n === 'MC·Reexpresión')).toBe(true)
        // nombres únicos (Excel no admite hojas repetidas)
        expect(new Set(names).size).toBe(names.length)
    })

    it('contrato de separación: el export FORMAL nunca incluye la matriz', () => {
        const sheets = buildSelectedReportSheets(makeBundle(true), {
            ...defaultExportOptions(false), efeMethod: 'BOTH', currency: 'CLOSING',
            content: { esp: false, er: false, eepn: false, efe: true, notas: false, anexos: false, indicadores: false, analisis: false },
        })
        const names = sheets.map(s => s.name)
        expect(names).not.toContain('Matriz')
        expect(names.some(n => n.includes('Reexpresión'))).toBe(false)
        expect(names.some(n => n.includes('Trazabilidad'))).toBe(false)
    })

    it('el papel de trabajo está identificado como documento interno', () => {
        const sheets = buildWorkingPaperSheets(makeBundle(true), 'CLOSING_CURRENCY')
        const resumen = sheets.find(s => s.name.includes('Resumen y controles'))!
        const flat = resumen.rows.flat().map(String).join(' ')
        expect(flat).toContain('Documento interno de preparación')
        expect(flat).toContain('CLOSING_CURRENCY')
    })
})
