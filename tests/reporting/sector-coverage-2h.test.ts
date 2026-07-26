/**
 * Fase 2H §H3/§H4 — Las cuentas sectoriales llegan a los estados.
 *
 * No alcanza con que las cuentas existan: el criterio de aceptación 4 exige que
 * se mapeen correctamente a ESP, ER, EFE, notas y anexos. Estas pruebas
 * recorren el ciclo completo con los fixtures agropecuario y de asociación
 * civil, y controlan que el motor canónico las exponga donde corresponde.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../src/storage/db'
import { resetDb } from '../accounting/helpers'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import {
    loadAgroFixture,
    loadNonprofitFixture,
    AGRO_FIXTURE_YEAR,
    NONPROFIT_FIXTURE_YEAR,
} from '../../src/accounting/fixtures/sectorFixtures'

/** Suma el cierre de las cuentas cuyo código empieza con el prefijo dado. */
async function closingByPrefix(bundle: Awaited<ReturnType<typeof loadReportingBundle>>, prefix: string) {
    return bundle.statements.trialBalance.rows
        .filter(row => row.code.startsWith(prefix))
        .reduce((sum, row) => sum + row.closing, 0)
}

describe('Fase 2H §H3 — establecimiento agropecuario', () => {
    let bundle: Awaited<ReturnType<typeof loadReportingBundle>>

    beforeAll(async () => {
        await resetDb()
        await loadAgroFixture()
        bundle = await loadReportingBundle(AGRO_FIXTURE_YEAR)
    })

    it('el ESP cierra: activo = pasivo + patrimonio neto', () => {
        const bs = bundle.statements.balanceSheet
        expect(bs.totalAssets.amount).toBe(bs.totalLiabilitiesAndEquity.amount)
        expect(bs.equationDifference).toBe(0)
    })

    it('los productos agropecuarios se exponen dentro de bienes de cambio', async () => {
        // Cosecha 850.000 − costo 800.000 − merma 50.000 = 0 al cierre.
        expect(await closingByPrefix(bundle, '1.1.08.01')).toBe(0)
        // Insumos totalmente aplicados a la producción.
        expect(await closingByPrefix(bundle, '1.1.08.02')).toBe(0)

        const inventories = await db.accounts.toArray()
        const agroInventory = inventories.filter(a => a.code.startsWith('1.1.08'))
        expect(agroInventory.length).toBeGreaterThan(0)
        for (const account of agroInventory) {
            expect(account.statementGroup).toBe('INVENTORIES')
        }
    })

    it('los activos biológicos no corrientes se clasifican como bienes de uso', async () => {
        const accounts = await db.accounts.toArray()
        const biological = accounts.filter(a => a.code.startsWith('1.2.06') && !a.isHeader)
        expect(biological.length).toBeGreaterThan(0)
        for (const account of biological) {
            expect(account.statementGroup).toBe('PPE')
            expect(account.currentClassification).toBe('NON_CURRENT')
        }
    })

    it('la venta agropecuaria se expone como ingreso y su costo como CMV', () => {
        const er = bundle.statements.incomeStatement
        expect(er.sales.amount).toBe(1100000)
        // Costo de productos agropecuarios vendidos.
        expect(Math.abs(er.costOfSales.amount)).toBe(800000)
    })

    it('el resultado por producción se reconoce sin necesidad de venta', async () => {
        // Se devengó 250.000 de resultado por producción durante el ejercicio.
        const rows = bundle.statements.trialBalance.rows.filter(r => r.code === '4.6.10')
        expect(rows).toHaveLength(1)
        expect(rows[0].periodCredit).toBe(250000)
    })

    it('las cuentas agropecuarias son NO monetarias para la reexpresión', async () => {
        const accounts = await db.accounts.toArray()
        const agro = accounts.filter(a => a.sectorProfile === 'AGRICULTURAL' && !a.isHeader)
        expect(agro.length).toBeGreaterThan(0)
        for (const account of agro) {
            expect(account.monetaryClassification, `${account.code}`).toBe('NON_MONETARY')
        }
    })

    it('el EFE concilia con la variación del efectivo', () => {
        const cf = bundle.statements.cashFlowDirect!
        // Único movimiento de efectivo: el aporte inicial de 2.000.000.
        expect(cf.netChange.amount).toBe(2000000)
    })

    it('el balance de comprobación está balanceado', () => {
        expect(bundle.statements.trialBalance.isBalanced).toBe(true)
    })
})

describe('Fase 2H §H4 — asociación civil', () => {
    let bundle: Awaited<ReturnType<typeof loadReportingBundle>>

    beforeAll(async () => {
        await resetDb()
        await loadNonprofitFixture()
        bundle = await loadReportingBundle(NONPROFIT_FIXTURE_YEAR)
    })

    it('el ESP cierra', () => {
        const bs = bundle.statements.balanceSheet
        expect(bs.totalAssets.amount).toBe(bs.totalLiabilitiesAndEquity.amount)
        expect(bs.equationDifference).toBe(0)
    })

    it('los recursos se exponen como ingresos del ejercicio', () => {
        // Cuotas 900.000 + donación 300.000 + subsidio aplicado 400.000.
        expect(bundle.statements.incomeStatement.sales.amount).toBe(1600000)
    })

    it('el subsidio no aplicado queda como pasivo, no como recurso', async () => {
        // Recibido 500.000, aplicado 400.000 ⇒ 100.000 sigue siendo obligación.
        const pending = await closingByPrefix(bundle, '2.1.08.01')
        expect(Math.abs(pending)).toBe(100000)

        const account = await db.accounts.where('code').equals('2.1.08.01').first()
        expect(account?.statementGroup).toBe('DEFERRED_INCOME')
    })

    it('los gastos se separan entre actividades y administración', async () => {
        const er = bundle.statements.incomeStatement
        // Conducción institucional (administración).
        expect(Math.abs(er.adminExpenses.amount)).toBe(250000)
        // Actividad deportiva (gastos de programas).
        expect(Math.abs(er.sellingExpenses.amount)).toBe(600000)
    })

    it('el superávit del ejercicio surge del mismo modelo matemático', () => {
        const er = bundle.statements.incomeStatement
        // 1.600.000 de recursos − 850.000 de gastos = 750.000 de superávit.
        expect(er.netIncome.amount).toBe(750000)
    })

    it('la adquisición del bien de uso es un flujo de inversión', () => {
        const cf = bundle.statements.cashFlowDirect!
        expect(cf.investing.amount).toBe(-700000)
    })

    it('el EFE concilia con la variación del efectivo', () => {
        const cf = bundle.statements.cashFlowDirect!
        // 800.000 + 300.000 + 500.000 − 250.000 − 600.000 − 700.000 = 50.000
        expect(cf.netChange.amount).toBe(50000)
    })

    it('el patrimonio de la entidad evoluciona por el resultado del ejercicio', () => {
        const eepn = bundle.statements.equityStatement
        expect(eepn.periodResult.amount).toBe(750000)
        expect(eepn.closingBalance.amount).toBe(750000)
    })

    it('el balance de comprobación está balanceado', () => {
        expect(bundle.statements.trialBalance.isBalanced).toBe(true)
    })
})
