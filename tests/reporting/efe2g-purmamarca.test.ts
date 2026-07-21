/**
 * Fase 2G — Caso Purmamarca como fixture permanente (spec §16, §26.1-2).
 *
 * Fija los importes exactos, la conciliación por ambos métodos y los cuatro
 * controles del EFE. La matriz/puentes/lineage se agregan en hitos posteriores;
 * aquí se congela el comportamiento numérico que NO debe romperse.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { buildPurmamarcaInput, PURMAMARCA_EXPECTED as E } from './fixtures/purmamarca'

function run() {
    const input = buildPurmamarcaInput()
    const statements = buildStatements(input)
    const flows = buildCashFlows(input, statements)
    return { statements, flows }
}

describe('Fase 2G — Purmamarca (importes y controles)', () => {
    it('efectivo inicial, final y variación', () => {
        const { flows } = run()
        expect(flows.direct.openingCash.amount).toBe(E.openingCash)
        expect(flows.direct.closingCash.amount).toBe(E.closingCash)
        expect(flows.direct.netChange.amount).toBe(E.netChange)
    })

    it('método directo: operación 4.000, inversión 30.000, financiación 5.000', () => {
        const { flows } = run()
        expect(flows.direct.operating.amount).toBe(E.direct.operating)
        expect(flows.direct.investing.amount).toBe(E.direct.investing)
        expect(flows.direct.financing.amount).toBe(E.direct.financing)

        const ops = flows.direct.operating.children ?? []
        const cobros = ops.find(c => c.label === 'Cobros de clientes')
        const pagos = ops.find(c => c.label === 'Pagos a proveedores de bienes y servicios')
        expect(cobros?.amount).toBe(E.direct.cobrosClientes)
        expect(pagos?.amount).toBe(E.direct.pagosProveedores)
    })

    it('método indirecto: resultado 15.000 y variaciones de capital de trabajo', () => {
        const { flows } = run()
        expect(flows.indirect.operating.amount).toBe(E.indirect.operating)

        const children = flows.indirect.operating.children ?? []
        const resultado = children.find(c => c.id === 'efe:ind:resultado')
        expect(resultado?.amount).toBe(E.netIncome)

        const wcA = children.find(c => c.id === 'efe:ind:wc-activos')!
        const creditos = wcA.children!.find(c => c.accountIds[0] === 'creditos')
        const inventarios = wcA.children!.find(c => c.accountIds[0] === 'mercaderias')
        expect(creditos?.amount).toBe(E.indirect.deltaCreditos)
        expect(inventarios?.amount).toBe(E.indirect.deltaInventarios)

        const wcL = children.find(c => c.id === 'efe:ind:wc-pasivos')!
        expect(wcL.amount).toBe(E.indirect.deltaProveedores)
    })

    it('directo = indirecto en actividades operativas', () => {
        const { flows } = run()
        expect(flows.direct.operating.amount).toBe(flows.indirect.operating.amount)
        expect(flows.indirect.netChange.amount).toBe(E.netChange)
    })

    it('los cuatro controles del EFE aprueban', () => {
        const { flows } = run()
        for (const id of ['efe-variacion', 'efe-esp', 'efe-metodos', 'efe-clasificacion']) {
            const check = flows.validation.checks.find(c => c.id === id)
            expect(check, id).toBeDefined()
            expect(check!.passed, id).toBe(true)
        }
    })

    it('sin flujos sin clasificar', () => {
        const { flows } = run()
        expect(flows.direct.unclassified.amount).toBe(0)
    })
})
