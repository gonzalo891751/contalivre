/**
 * Fase 2F (§5) — Golden del dataset "ContaLivre RC Acceptance".
 *
 * Carga el fixture determinista completo (2024 comparativo cerrado con
 * apertura + 2025 actual) por la puerta única de contabilización y verifica
 * los saldos esperados DOCUMENTADOS contra el motor canónico: ER, PN, CMV,
 * gastos por función, FX, EFE, estado validado, variante bloqueada e
 * idempotencia de recarga. No depende de la fecha del sistema.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb } from '../accounting/helpers'
import {
    RC_CURRENT_YEAR,
    RC_EXPECTED,
    RC_PRIOR_YEAR,
    isSafeToLoad,
    loadRcAcceptanceDataset,
    postRcUnmappedVariant,
    revertRcUnmappedVariant,
} from '../../src/accounting/fixtures/rcAcceptance'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { db } from '../../src/storage/db'
import type { StatementsBundle } from '../../src/reporting/domain/types'

describe('Fase 2F — dataset RC Acceptance (golden)', () => {
    let prior: StatementsBundle
    let current: StatementsBundle

    beforeAll(async () => {
        await resetDb()
        const result = await loadRcAcceptanceDataset()
        expect(result.closedPrior).toBe(true)
        prior = await loadStatementsForYear(RC_PRIOR_YEAR)
        current = await loadStatementsForYear(RC_CURRENT_YEAR)
    })

    it('2024 (comparativo): resultado y caja esperados', () => {
        expect(prior.incomeStatement.netIncome.amount).toBe(RC_EXPECTED.priorNetIncome)
        expect(prior.cashFlowDirect!.closingCash.amount).toBe(RC_EXPECTED.priorClosingCash)
        expect(prior.incomeStatement.incomeTaxStatus).toBe('CALCULATED')
        expect(prior.incomeStatement.incomeTax.amount).toBe(66000)
    })

    it('2025: ER completo con IG estructural', () => {
        const er = current.incomeStatement
        expect(er.preTaxResult.amount).toBe(RC_EXPECTED.currentPreTax)
        expect(er.incomeTax.amount).toBe(RC_EXPECTED.currentIncomeTax)
        expect(er.netIncome.amount).toBe(RC_EXPECTED.currentNetIncome)
        expect(er.incomeTaxStatus).toBe('CALCULATED')
    })

    it('2025: PN del ESP = cierre del EEPN = cierre de la matriz', () => {
        expect(current.balanceSheet.equity.amount).toBe(RC_EXPECTED.currentEquity)
        expect(current.equityStatement.closingBalance.amount).toBe(RC_EXPECTED.currentEquity)
        expect(current.equityMatrix.closingRow.total).toBe(RC_EXPECTED.currentEquity)
    })

    it('2025: la matriz del EEPN muestra los movimientos del fixture', () => {
        const m = current.equityMatrix
        const row = (t: string) => m.movementRows.find(r => r.type === t)!
        expect(row('CONTRIBUTION').cells.CAPITAL).toBe(300000)
        // −80.000 dividendos; la AREA (−20.000) cae acá por clasificación
        // estructural hasta que exista equityMovementType persistido (2F §9):
        // ese hito la mueve a "Modificaciones de ejercicios anteriores".
        expect(row('DISTRIBUTION').total).toBe(-100000)
        expect(row('RESERVE_CREATION').cells.LEGAL_RESERVE).toBe(13200)
        expect(row('RESERVE_CREATION').total).toBe(0)
        expect(row('RESERVE_RELEASE').cells.LEGAL_RESERVE).toBe(-3200)
        expect(row('CAPITALIZATION').cells.CAPITAL_ADJUSTMENT).toBe(50000)
        expect(row('CAPITALIZATION').total).toBe(0)
        expect(row('CURRENT_RESULT').total).toBe(RC_EXPECTED.currentNetIncome)
        // columnas dinámicas presentes
        const comps = m.columns.map(c => c.component)
        expect(comps).toEqual(expect.arrayContaining(['CAPITAL', 'CAPITAL_ADJUSTMENT', 'LEGAL_RESERVE', 'PRIOR_RETAINED_EARNINGS', 'CURRENT_RESULT']))
    })

    it('2025: puente del CMV con existencia inicial heredada por la apertura', () => {
        const b = current.costOfSales
        expect(b.mode).toBe('COMMERCIAL')
        expect(b.openingInventory.amount).toBe(RC_EXPECTED.cmvBridge.opening)
        expect(b.purchases.amount).toBe(RC_EXPECTED.cmvBridge.purchases)
        expect(b.closingInventory.amount).toBe(RC_EXPECTED.cmvBridge.closing)
        expect(b.costOfSales.amount).toBe(RC_EXPECTED.cmvBridge.cogs)
        expect(b.validations.every(v => v.passed)).toBe(true)
    })

    it('2025: gastos por función con la regla 60/40 aplicada', () => {
        const g = current.expensesByFunction
        expect(g.totals.byFunction.ADMINISTRATION).toBe(RC_EXPECTED.expensesByFunction.ADMINISTRATION)
        expect(g.totals.byFunction.SELLING).toBe(RC_EXPECTED.expensesByFunction.SELLING)
        expect(g.totals.byFunction.FINANCIAL).toBe(RC_EXPECTED.expensesByFunction.FINANCIAL)
        expect(g.totals.total).toBe(RC_EXPECTED.expensesByFunction.total)
        const alq = g.rows.find(r => r.accountId === 'rc-alquileres')!
        expect(alq.source).toBe('RULE')
        expect(alq.cells.ADMINISTRATION).toBe(54000)
        expect(alq.cells.SELLING).toBe(36000)
        expect(g.unmappedExpenses).toHaveLength(0)
    })

    it('2025: moneda extranjera y bienes de uso', () => {
        expect(current.foreignCurrency.applicable).toBe(true)
        expect(current.foreignCurrency.rows[0].measurement).toBe(RC_EXPECTED.fxMeasurement)

        const ppe = current.fixedAssetsAnnex
        const rodados = ppe.rows.find(r => r.assetClass === 'Rodados')!
        expect(rodados.additions).toBe(240000)
        expect(rodados.periodDepreciation).toBe(24000)
        expect(rodados.residual).toBe(216000)
        expect(ppe.validations.every(v => v.passed)).toBe(true)
    })

    it('2025: EFE — transferencia a USD no es flujo; compra de PPE a crédito revelada', () => {
        const cf = current.cashFlowDirect!
        expect(cf.closingCash.amount).toBe(RC_EXPECTED.currentClosingCash)
        expect(cf.investing.amount).toBe(-100000) // inversiones; el rodado fue a crédito
        expect(cf.nonMonetaryDisclosures.some(d2 => d2.label.includes('rodado'))).toBe(true)
        for (const id of ['efe-metodos', 'efe-esp', 'efe-variacion']) {
            expect(current.validation.checks.find(c => c.id === id)?.passed, id).toBe(true)
        }
    })

    it('estado base VALIDADO; la variante sin mapping BLOQUEA y su reversión revalida', async () => {
        expect(current.validation.canPublish).toBe(true)

        await postRcUnmappedVariant()
        const blocked = await loadStatementsForYear(RC_CURRENT_YEAR)
        expect(blocked.validation.canPublish).toBe(false)
        expect(blocked.validation.checks.find(c => c.id === 'unmapped-results')?.passed).toBe(false)

        expect(await revertRcUnmappedVariant()).toBe(true)
        const revalidated = await loadStatementsForYear(RC_CURRENT_YEAR)
        expect(revalidated.validation.canPublish).toBe(true)
    })

    it('recarga idempotente: repetir la carga no duplica ningún asiento', async () => {
        const before = await db.entries.count()
        const rerun = await loadRcAcceptanceDataset()
        expect(rerun.idempotent).toBe(true)
        expect(await db.entries.count()).toBe(before)
        const again = await loadStatementsForYear(RC_CURRENT_YEAR)
        expect(again.balanceSheet.equity.amount).toBe(RC_EXPECTED.currentEquity)
    })

    it('la guardia impide cargar sobre una base con asientos reales', async () => {
        await postNewEntry({
            date: `${RC_CURRENT_YEAR}-12-01`, memo: 'asiento real del usuario',
            lines: [{ accountId: 'rc-caja', debit: 1, credit: 0 }, { accountId: 'rc-ventas', debit: 0, credit: 1 }],
        })
        const guard = await isSafeToLoad()
        expect(guard.safe).toBe(false)
        await expect(loadRcAcceptanceDataset()).rejects.toThrow(/base limpia/)
    })
})
