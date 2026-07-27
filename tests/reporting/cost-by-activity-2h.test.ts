/**
 * Fase 2H §H6 — Anexo de costo diferenciado por actividad.
 *
 * Antes de esta fase el anexo sólo distinguía COMMERCIAL / SERVICES /
 * NOT_APPLICABLE, y la cabecera del motor declaraba explícitamente que la
 * actividad industrial no tenía "soporte estructural declarado".
 *
 * Ahora se agregan los modos INDUSTRIAL y AGRICULTURAL, con el costo de
 * producción como SUBTOTAL DERIVADO y conciliado contra el CMV del puente de
 * existencias. La detección es estructural (mapping de cuentas), nunca por
 * nombre, y la precedencia es agro > industria > comercio > servicios.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import {
    loadIndustrialFixture,
    loadAgroFixture,
    INDUSTRIAL_FIXTURE_YEAR,
    AGRO_FIXTURE_YEAR,
} from '../../src/accounting/fixtures/sectorFixtures'

describe('Fase 2H §H6 — empresa industrial', () => {
    let bundle: Awaited<ReturnType<typeof loadReportingBundle>>

    beforeAll(async () => {
        await resetDb()
        await loadIndustrialFixture()
        bundle = await loadReportingBundle(INDUSTRIAL_FIXTURE_YEAR)
    })

    it('el anexo detecta el modo industrial de forma estructural', () => {
        const cost = bundle.statements.costOfSales
        expect(cost.mode).toBe('INDUSTRIAL')
        expect(cost.modeReason).toContain('función de producción')
    })

    it('abre el costo de producción en sus componentes', () => {
        const production = bundle.statements.costOfSales.production!
        expect(production).toBeDefined()

        expect(production.directMaterials.amount).toBe(300000)
        expect(production.directLabor.amount).toBe(200000)
        expect(production.indirectCosts.amount).toBe(80000)
        expect(production.productionDepreciation.amount).toBe(20000)
    })

    it('el costo de producción es un subtotal derivado, no una fila decorativa', () => {
        const p = bundle.statements.costOfSales.production!
        // 300.000 + 200.000 + 80.000 + 20.000
        expect(p.productionCost.amount).toBe(600000)

        const suma = (p.directMaterials.amount ?? 0) + (p.directLabor.amount ?? 0)
            + (p.indirectCosts.amount ?? 0) + (p.productionDepreciation.amount ?? 0)
        expect(p.productionCost.amount).toBe(suma)

        const check = bundle.statements.costOfSales.validations.find(v => v.id === 'costo-produccion-suma')!
        expect(check.passed).toBe(true)
    })

    it('encadena producción → terminados → vendidos', () => {
        const p = bundle.statements.costOfSales.production!
        // Sin existencias iniciales: terminados = costo de producción ajustado por PP.
        expect(p.finishedGoodsCost.amount).toBe(
            (p.productionCost.amount ?? 0) + (p.workInProcessOpening.amount ?? 0) - (p.workInProcessClosing.amount ?? 0)
        )
        expect(p.costOfGoodsSold.amount).toBe(
            (p.finishedGoodsCost.amount ?? 0) + (p.finishedGoodsOpening.amount ?? 0) - (p.finishedGoodsClosing.amount ?? 0)
        )
    })

    it('el costo por la vía de producción concilia con el CMV del puente', () => {
        const cost = bundle.statements.costOfSales
        const check = cost.validations.find(v => v.id === 'costo-produccion-cmv')!
        expect(check.passed, check.detail).toBe(true)
    })

    it('no hay dos costos de ventas distintos: puente = ER', () => {
        const cost = bundle.statements.costOfSales
        expect(Math.abs(cost.costOfSalesPerIncomeStatement)).toBe(600000)
        const erCheck = cost.validations.find(v => v.id === 'cmv-er')!
        expect(erCheck.passed, erCheck.detail).toBe(true)
    })

    it('el ESP cierra y el balance está balanceado', () => {
        expect(bundle.statements.balanceSheet.equationDifference).toBe(0)
        expect(bundle.statements.trialBalance.isBalanced).toBe(true)
    })
})

describe('Fase 2H §H6 — actividad agropecuaria', () => {
    let bundle: Awaited<ReturnType<typeof loadReportingBundle>>

    beforeAll(async () => {
        await resetDb()
        await loadAgroFixture()
        bundle = await loadReportingBundle(AGRO_FIXTURE_YEAR)
    })

    it('el anexo toma el modo agropecuario con precedencia sobre los demás', () => {
        const cost = bundle.statements.costOfSales
        expect(cost.mode).toBe('AGRICULTURAL')
        expect(cost.modeReason).toContain('agropecuario')
    })

    it('expone el bloque de producción sin duplicar el resultado por producción', () => {
        const cost = bundle.statements.costOfSales
        expect(cost.production).toBeDefined()

        // El resultado por producción (250.000) es un RESULTADO del ER, no un
        // componente del costo: no debe aparecer sumado en el costo de producción.
        expect(cost.production!.productionCost.amount).not.toBe(250000)
    })

    it('el CMV agropecuario del puente concilia con el ER', () => {
        const cost = bundle.statements.costOfSales
        const erCheck = cost.validations.find(v => v.id === 'cmv-er')!
        expect(erCheck.passed, erCheck.detail).toBe(true)
    })
})

describe('Fase 2H §H6 — comercio y servicios conservan su comportamiento', () => {
    it('sin evidencia de producción el anexo sigue siendo comercial', async () => {
        await resetDb()
        const { seedTestAccounts, simpleLines } = await import('../accounting/helpers')
        const { postNewEntry } = await import('../../src/accounting/application/journalService')
        await seedTestAccounts()

        await postNewEntry({
            date: '2026-04-01',
            memo: 'Compra de mercaderías',
            lines: simpleLines('mercaderias', 'proveedores', 100000),
        })
        await postNewEntry({
            date: '2026-05-01',
            memo: 'Costo de lo vendido',
            lines: simpleLines('cmv', 'mercaderias', 60000),
        })

        const bundle = await loadReportingBundle(2026)
        const cost = bundle.statements.costOfSales

        expect(cost.mode).toBe('COMMERCIAL')
        expect(cost.production).toBeUndefined()
        expect(cost.openingInventory.amount).toBe(0)
        expect(cost.purchases.amount).toBe(100000)
        expect(cost.closingInventory.amount).toBe(40000)
        expect(cost.costOfSales.amount).toBe(60000)
    })

    it('sin bienes de cambio pero con costo, el modo es servicios', async () => {
        await resetDb()
        const { seedTestAccounts, simpleLines } = await import('../accounting/helpers')
        const { postNewEntry } = await import('../../src/accounting/application/journalService')
        await seedTestAccounts()

        await postNewEntry({
            date: '2026-06-01',
            memo: 'Costo de servicios prestados',
            lines: simpleLines('cmv', 'caja', 50000),
        })

        const bundle = await loadReportingBundle(2026)
        expect(bundle.statements.costOfSales.mode).toBe('SERVICES')
        // No se fuerzan existencias que no existen.
        expect(bundle.statements.costOfSales.openingInventory.status).toBe('NOT_APPLICABLE')
    })
})
