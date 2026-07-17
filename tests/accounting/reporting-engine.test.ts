/**
 * Fase 2B — Motor único de reporting + EFE (§8, §11, §18.1).
 *
 * Golden case comercial ampliado: aporte, compras (contado y crédito),
 * venta con CMV, cobro, pago, gasto devengado, PPE a crédito (transacción
 * no monetaria), depreciación, préstamo y pago en efectivo.
 * Verifica ESP, ER, EEPN, EFE directo, EFE indirecto y validación
 * automática, todos desde el mismo modelo canónico.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { postClosing, generateOpeningEntry } from '../../src/accounting/application/closingService'
import { exerciseIdForYear } from '../../src/accounting/application/contextService'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { insertEntryRecord } from '../../src/accounting/repositories/journalRepository'
import type { StatementsBundle } from '../../src/reporting/domain/types'

async function seedGoldenYear2025() {
    const post = postNewEntry
    await post({ date: '2025-01-05', memo: 'Aporte de capital', lines: simpleLines('caja', 'capital', 1000000) })
    await post({ date: '2025-02-01', memo: 'Compra mercaderías contado', lines: simpleLines('mercaderias', 'caja', 200000) })
    await post({ date: '2025-02-15', memo: 'Compra mercaderías crédito', lines: simpleLines('mercaderias', 'proveedores', 100000) })
    await post({ date: '2025-03-10', memo: 'Venta a crédito', lines: simpleLines('deudores', 'ventas', 300000) })
    await post({ date: '2025-03-10', memo: 'Costo de la venta', lines: simpleLines('cmv', 'mercaderias', 180000) })
    await post({ date: '2025-04-01', memo: 'Cobro a clientes', lines: simpleLines('caja', 'deudores', 150000) })
    await post({ date: '2025-04-15', memo: 'Pago a proveedores', lines: simpleLines('proveedores', 'caja', 60000) })
    await post({ date: '2025-06-30', memo: 'Gasto devengado impago', lines: simpleLines('gastos', 'gastos-a-pagar', 50000) })
    await post({ date: '2025-07-01', memo: 'Compra rodado a crédito', lines: simpleLines('bienes-uso', 'gastos-a-pagar', 120000) })
    await post({ date: '2025-12-31', memo: 'Depreciación del ejercicio', lines: simpleLines('deprec', 'amort-acum', 12000) })
    await post({ date: '2025-08-01', memo: 'Préstamo bancario recibido', lines: simpleLines('caja', 'prestamos', 300000) })
    await post({ date: '2025-09-01', memo: 'Gasto pagado en efectivo', lines: simpleLines('gastos', 'caja', 10000) })
}

describe('Fase 2B — motor único: golden comercial 2025', () => {
    let bundle: StatementsBundle

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedGoldenYear2025()
        bundle = await loadStatementsForYear(2025)
    })

    it('ER exacto: resultado 48.000', () => {
        const er = bundle.incomeStatement
        expect(er.sales.amount).toBe(300000)
        expect(er.costOfSales.amount).toBe(180000)
        expect(er.grossProfit.amount).toBe(120000)
        expect(er.adminExpenses.amount).toBe(72000) // 50.000 + 10.000 + 12.000 deprec
        expect(er.netIncome.amount).toBe(48000)
    })

    it('ESP exacto y ecuación patrimonial', () => {
        const bs = bundle.balanceSheet
        expect(bs.currentAssets.amount).toBe(1450000)     // caja 1.180.000 + merc 120.000 + deudores 150.000
        expect(bs.nonCurrentAssets.amount).toBe(108000)   // rodado 120.000 − amort 12.000 (regularizadora neteada)
        expect(bs.totalAssets.amount).toBe(1558000)
        expect(bs.totalLiabilities.amount).toBe(510000)   // prov 40.000 + gastos a pagar 170.000 + préstamo 300.000
        expect(bs.equity.amount).toBe(1048000)            // capital 1.000.000 + resultado 48.000
        expect(bs.equationDifference).toBe(0)
    })

    it('EEPN: apertura 0, aportes 1.000.000, resultado 48.000, cierre = PN del ESP', () => {
        const eepn = bundle.equityStatement
        expect(eepn.openingBalance.amount).toBe(0)
        expect(eepn.contributions.amount).toBe(1000000)
        expect(eepn.periodResult.amount).toBe(48000)
        expect(eepn.closingBalance.amount).toBe(1048000)
        expect(eepn.closingBalance.amount).toBe(bundle.balanceSheet.equity.amount)
    })

    it('EFE directo: operativas −120.000, inversión 0, financiación 1.300.000', () => {
        const efe = bundle.cashFlowDirect!
        expect(efe.operating.amount).toBe(-120000)
        expect(efe.investing.amount).toBe(0)              // el rodado se compró a crédito
        expect(efe.financing.amount).toBe(1300000)        // aporte + préstamo
        expect(efe.netChange.amount).toBe(1180000)
        expect(efe.openingCash.amount).toBe(0)
        expect(efe.closingCash.amount).toBe(1180000)
        expect(efe.unclassified.amount).toBe(0)
    })

    it('EFE directo: subcategorías operativas estructurales', () => {
        const children = bundle.cashFlowDirect!.operating.children!
        const byLabel = new Map(children.map(c => [c.label, c.amount]))
        expect(byLabel.get('Cobros de clientes')).toBe(150000)
        expect(byLabel.get('Pagos a proveedores')).toBe(-260000) // 200.000 contado + 60.000 pago
        expect(byLabel.get('Otros cobros y pagos operativos')).toBe(-10000)
    })

    it('EFE indirecto = directo (verificado, no forzado)', () => {
        const ind = bundle.cashFlowIndirect!
        expect(ind.operating.amount).toBe(-120000)
        expect(ind.netChange.amount).toBe(1180000)
        const children = new Map(ind.operating.children!.map(c => [c.id, c.amount]))
        expect(children.get('efe:ind:resultado')).toBe(48000)
        expect(children.get('efe:ind:wc-activos')).toBe(-270000)
        expect(children.get('efe:ind:wc-pasivos')).toBe(210000)
        expect(children.get('efe:ind:ajustes')).toBe(-108000) // −PPE crédito 120.000 + deprec 12.000
    })

    it('la compra de PPE a crédito se revela como transacción no monetaria', () => {
        const disclosures = bundle.cashFlowDirect!.nonMonetaryDisclosures
        expect(disclosures.some(d => d.label.includes('Compra rodado a crédito'))).toBe(true)
    })

    it('validación completa aprobada (publicable)', () => {
        const failed = bundle.validation.checks.filter(c => !c.passed)
        expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0)
        expect(bundle.validation.canPublish).toBe(true)
    })

    it('el TB normalizado concilia Diario = Mayor', () => {
        const tb = bundle.trialBalance
        expect(tb.totalPeriodDebit).toBe(tb.totalPeriodCredit)
        expect(tb.isBalanced).toBe(true)
    })

    it('linaje: cada línea conoce sus cuentas', () => {
        expect(bundle.incomeStatement.sales.accountIds).toContain('ventas')
        expect(bundle.balanceSheet.currentAssets.accountIds).toContain('caja')
        // aporte, compra contado, cobro, pago proveedores, préstamo, gasto pagado
        const cajaRow = bundle.trialBalance.rows.find(r => r.accountId === 'caja')!
        expect(cajaRow.entryIds.length).toBe(6)
    })
})

describe('Fase 2B — motor único: multiejercicio con cierre y apertura (§18.4)', () => {
    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedGoldenYear2025()
        await postClosing(exerciseIdForYear(2025))
        await generateOpeningEntry(exerciseIdForYear(2025))
    })

    it('2025 cerrado: el ER sigue mostrando el período y el ESP no cambia', async () => {
        const bundle = await loadStatementsForYear(2025)
        expect(bundle.incomeStatement.netIncome.amount).toBe(48000)
        expect(bundle.balanceSheet.totalAssets.amount).toBe(1558000)
        expect(bundle.balanceSheet.equity.amount).toBe(1048000)
        expect(bundle.validation.canPublish).toBe(true)
    })

    it('2026: apertura = cierre previo, resultado NO duplicado, EFE en cero', async () => {
        const bundle = await loadStatementsForYear(2026, { withComparative: true })
        expect(bundle.incomeStatement.netIncome.amount).toBe(0)
        expect(bundle.balanceSheet.totalAssets.amount).toBe(1558000)
        expect(bundle.balanceSheet.equity.amount).toBe(1048000)

        const efe = bundle.cashFlowDirect!
        expect(efe.openingCash.amount).toBe(1180000)     // vía asiento de apertura
        expect(efe.netChange.amount).toBe(0)
        expect(efe.closingCash.amount).toBe(1180000)
        expect(bundle.validation.canPublish).toBe(true)

        // Comparativo derivado del mismo motor
        expect(bundle.balanceSheet.totalAssets.comparativeAmount).toBe(1558000)
    })
})

describe('Fase 2B — validación bloquea publicación', () => {
    it('cuenta inexistente con saldo: expuesta y no publicable', async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-03-01', memo: 'ok', lines: simpleLines('caja', 'capital', 100) })
        // Asiento legacy corrupto solo insertable vía repositorio
        await insertEntryRecord({
            id: 'legacy-x', date: '2025-04-01', memo: 'legacy', status: 'POSTED',
            lines: [
                { accountId: 'cuenta-borrada', debit: 50, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 50 },
            ],
        })
        const bundle = await loadStatementsForYear(2025)
        expect(bundle.validation.canPublish).toBe(false)
        const failing = bundle.validation.checks.find(c => c.id === 'unknown-accounts')!
        expect(failing.passed).toBe(false)
        // La línea NO desaparece: integra el activo como fila a regularizar
        expect(bundle.trialBalance.rows.some(r => r.unknownAccount)).toBe(true)
    })

    it('flujo de efectivo sin categoría: check EFE en rojo', async () => {
        await resetDb()
        await seedTestAccounts()
        const { makeAccount } = await import('./helpers')
        await db_addAccount(makeAccount({ id: 'sin-categoria', code: '1.1.99', name: 'Activo sin mapping', kind: 'ASSET', statementGroup: null }))
        await postNewEntry({ date: '2025-03-01', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-04-01', memo: 'pago raro', lines: simpleLines('sin-categoria', 'caja', 300) })

        const bundle = await loadStatementsForYear(2025)
        const check = bundle.validation.checks.find(c => c.id === 'efe-clasificacion')!
        expect(check.passed).toBe(false)
        expect(bundle.cashFlowDirect!.unclassified.amount).toBe(-300)
        // Aun así los invariantes aritméticos cierran (nada se omite)
        expect(bundle.cashFlowDirect!.netChange.amount).toBe(700)
        expect(bundle.cashFlowDirect!.closingCash.amount).toBe(700)
    })
})

async function db_addAccount(account: import('../../src/core/models').Account) {
    const { db } = await import('../../src/storage/db')
    await db.accounts.add(account)
}
