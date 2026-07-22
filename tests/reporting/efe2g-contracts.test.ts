/**
 * Fase 2G — Contratos de exportación y separación formal/preparación
 * (spec §18C, §14, §26.25-27).
 *
 * - El estado formal (CashFlowStatement2B) no contiene campos matriciales.
 * - Directo e indirecto comparten inversión y financiación (misma evidencia).
 * - La preparación conserva evidencia (lineage, fórmulas, operandos).
 * - El export FORMAL no incluye la matriz; existe un export AUXILIAR de papel
 *   de trabajo que sí la incluye, con su advertencia.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { buildCashFlowPreparation } from '../../src/reporting/preparation/cashFlowPreparation'
import { buildPublicationGate } from '../../src/reporting/engine/publicationGate'
import { buildSelectedReportSheets } from '../../src/lib/exportReportBundle'
import { buildWorkingPaperSheets } from '../../src/lib/exportWorkingPaper'
import { defaultExportOptions } from '../../src/lib/exportOptions'
import { buildPurmamarcaInput } from './fixtures/purmamarca'
import type { ReportingBundle } from '../../src/reporting/loadReportingBundle'

function makeBundle(): ReportingBundle {
    const input = buildPurmamarcaInput()
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    statements.cashFlowDirect = cashFlows.direct
    statements.cashFlowIndirect = cashFlows.indirect
    statements.validation = cashFlows.validation
    const preparation = buildCashFlowPreparation(input, statements, cashFlows)
    const publicationGate = buildPublicationGate({ validation: statements.validation, restated: null, inflationSet: null })
    return {
        statements, cashFlowRestated: null, preparation, publicationGate, inflationSet: null,
        metadata: {
            companyId: 'purmamarca', companyLegalName: 'Purmamarca SA', exerciseLabel: 'Ej. 2025',
            periodStart: '2025-01-01', periodEnd: '2025-12-31', currency: 'ARS', unit: 'Pesos ($)',
            normative: 'RT 54', engineVersion: '2F.0', reportVersion: 'rv', status: 'VALIDATED', hasComparative: false,
        },
    } as unknown as ReportingBundle
}

describe('Fase 2G — contratos formal / preparación', () => {
    it('el estado formal no contiene campos matriciales accidentales', () => {
        const { statements } = makeBundle()
        const keys = Object.keys(statements.cashFlowDirect!)
        for (const forbidden of ['matrixRows', 'imputations', 'controls', 'bridges']) {
            expect(keys).not.toContain(forbidden)
        }
        // sólo líneas exponibles + revelaciones
        expect(keys).toContain('operating')
        expect(keys).toContain('nonMonetaryDisclosures')
    })

    it('directo e indirecto comparten inversión y financiación (misma evidencia)', () => {
        const { statements } = makeBundle()
        expect(statements.cashFlowDirect!.investing).toBe(statements.cashFlowIndirect!.investing)
        expect(statements.cashFlowDirect!.financing).toBe(statements.cashFlowIndirect!.financing)
    })

    it('la preparación conserva evidencia: lineage, fórmula y operandos', () => {
        const { preparation } = makeBundle()
        const imp = preparation.imputations.find(i => i.accountId === 'creditos')!
        expect(imp.formula).toBeTruthy()
        expect(Object.keys(imp.operands).length).toBeGreaterThan(0)
        const row = preparation.matrixRows.find(r => r.accountId === 'creditos')!
        expect(row.entryIds.length).toBeGreaterThan(0)
    })

    it('export FORMAL no incluye la matriz', () => {
        const bundle = makeBundle()
        const sheets = buildSelectedReportSheets(bundle, {
            ...defaultExportOptions(false), efeMethod: 'BOTH',
            content: { esp: false, er: false, eepn: false, efe: true, notas: false, anexos: false, indicadores: false, analisis: false },
        })
        const names = sheets.map(s => s.name)
        expect(names).not.toContain('Matriz')
        expect(names).not.toContain('Trazabilidad')
        expect(names.some(n => n.startsWith('EFE'))).toBe(true)
    })

    it('export AUXILIAR de papel de trabajo incluye matriz, controles y advertencia', () => {
        const bundle = makeBundle()
        const sheets = buildWorkingPaperSheets(bundle)
        const names = sheets.map(s => s.name)
        expect(names).toContain('Matriz')
        expect(names).toContain('Puentes')
        expect(names).toContain('Trazabilidad')
        expect(names).toContain('Resumen y controles')

        const resumen = sheets.find(s => s.name === 'Resumen y controles')!
        const flat = resumen.rows.flat().join(' ')
        expect(flat).toContain('No integra por sí solo los estados contables formales')
        // controles en cero para Purmamarca
        const total = resumen.rows.find(r => r[0] === 'Control total')!
        expect(total[1]).toBe(0)

        const matriz = sheets.find(s => s.name === 'Matriz')!
        // fila total explicado con la variación del efectivo
        const totalRow = matriz.rows.find(r => r[0] === 'Total explicado')!
        expect(totalRow[totalRow.length - 2]).toBe(39000) // variación del efectivo
    })
})
