/**
 * Fase 2G — CashFlowPreparationModel sobre Purmamarca (spec §7, §16, §26.2-4).
 *
 * La matriz se genera en el MOTOR (no en React). Verifica controles por fila,
 * columna y total en cero; puentes devengado→percibido exactos; e imputaciones
 * con lineage. La exposición económica por actividad reproduce el EFE.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { buildCashFlowPreparation } from '../../src/reporting/preparation/cashFlowPreparation'
import { buildPurmamarcaInput } from './fixtures/purmamarca'

function prep() {
    const input = buildPurmamarcaInput()
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    return buildCashFlowPreparation(input, statements, cashFlows)
}

const col = (m: ReturnType<typeof prep>, a: string) => m.controls.columns.find(c => c.activity === a)

describe('Fase 2G — preparación Purmamarca', () => {
    it('controles por fila, columna y total en cero', () => {
        const m = prep()
        expect(m.controls.totalControlCents).toBe(0)
        expect(m.controls.methodControlCents).toBe(0)
        expect(m.controls.cashControlCents).toBe(0)
        expect(m.controls.espControlCents).toBe(0)
        expect(m.controls.rowsWithDifference).toBe(0)
        expect(m.controls.allReconciled).toBe(true)
        expect(m.matrixRows.every(r => r.control === 0)).toBe(true)
    })

    it('exposición económica por actividad reproduce el EFE', () => {
        const m = prep()
        expect(col(m, 'OPERATING')!.economicCents).toBe(400000)   // 4.000
        expect(col(m, 'INVESTING')!.economicCents).toBe(3000000)  // 30.000
        expect(col(m, 'FINANCING')!.economicCents).toBe(500000)   // 5.000
        const totalEconomic = m.controls.columns.reduce((s, c) => s + c.economicCents, 0)
        expect(totalEconomic).toBe(m.cashBridge.netChangeCents) // 39.000
    })

    it('puente del efectivo concilia con el ESP', () => {
        const m = prep()
        expect(m.cashBridge.openingPublishedCents).toBe(1000000)
        expect(m.cashBridge.closingCents).toBe(4900000)
        expect(m.cashBridge.netChangeCents).toBe(3900000)
        expect(m.cashBridge.reconciledWithEsp).toBe(true)
        expect(m.cashBridge.priorAdjustmentsCents).toBe(0)
        expect(m.cashBridge.openingAdjustedCents).toBe(1000000)
    })

    it('puentes devengado → percibido exactos', () => {
        const m = prep()
        const cobros = m.bridges.find(b => b.id === 'prep:bridge:cobros')!
        expect(cobros.resultCents).toBe(3200000) // 35.000 − 3.000 = 32.000
        expect(cobros.reconciled).toBe(true)
        expect(cobros.residualCents).toBe(0)

        const compras = m.bridges.find(b => b.id === 'prep:bridge:compras')!
        expect(compras.resultCents).toBe(3000000) // 20.000 + 10.000 − 0 = 30.000
        expect(compras.reconciled).toBe(true)

        const pagos = m.bridges.find(b => b.id === 'prep:bridge:pagos')!
        expect(pagos.resultCents).toBe(2800000) // 30.000 − 2.000 = 28.000
        expect(pagos.reconciled).toBe(true)
        expect(pagos.residualCents).toBe(0)
    })

    it('imputaciones con lineage y descomposición operativa (§16)', () => {
        const m = prep()
        // el resultado, créditos, inventarios y proveedores como causas separadas
        const byCause = (label: string) => m.imputations.find(i => i.causeLabel === label && i.accountId !== 'ventas')
        const creditos = m.imputations.find(i => i.accountId === 'creditos')!
        expect(creditos.economicCents).toBe(-300000) // −3.000
        expect(creditos.entryIds.length).toBeGreaterThan(0) // lineage a asientos
        const inventarios = m.imputations.find(i => i.accountId === 'mercaderias')!
        expect(inventarios.economicCents).toBe(-1000000) // −10.000
        const proveedores = m.imputations.find(i => i.accountId === 'proveedores')!
        expect(proveedores.economicCents).toBe(200000) // +2.000
        expect(byCause('Bienes de cambio')).toBeDefined()
    })

    it('identidad con hash de contenido y versiones', () => {
        const m = prep()
        expect(m.identity.contentHash).toBeTruthy()
        expect(m.identity.mappingsHash).toBeTruthy()
        expect(m.identity.engineVersion).toBeTruthy()
        expect(m.identity.expression).toBe('NOMINAL')
        expect(m.identity.closeDate).toBe('2025-12-31')
    })
})
