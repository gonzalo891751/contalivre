/**
 * Fase 2K §25 — dataset demostrativo "Grupo Litoral", de punta a punta.
 *
 * A diferencia de los golden tests de la planilla (que ejercitan el motor puro
 * con balances armados a mano), este test recorre TODO el camino real:
 *
 *   asientos contabilizados por la puerta única
 *     → estados individuales del motor canónico
 *       → hoja de consolidación
 *         → juego consolidado
 *
 * y verifica que el resultado consolidado atribuible a los propietarios sea
 * exactamente el resultado individual de la controladora, que es la prueba
 * ácida de que la consolidación está bien hecha cuando la inversión se mide
 * por valor patrimonial proporcional.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { db } from '../../src/storage/db'
import {
    LITORAL_PARENT_ID, LITORAL_SUB_ID, seedGrupoLitoral,
} from '../../src/consolidation/fixtures/grupoLitoral'
import { runConsolidation } from '../../src/consolidation/service'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import type { ConsolidationResult } from '../../src/consolidation/service'

let result: ConsolidationResult
let consolidation2025Id: string
let entriesSnapshot: string

describe('Grupo Litoral — consolidación completa desde los libros reales', () => {
    beforeAll(async () => {
        await resetDb()
        const seed = await seedGrupoLitoral()
        consolidation2025Id = seed.consolidation2025Id
        entriesSnapshot = JSON.stringify(await db.entries.orderBy('id').toArray())
        result = await runConsolidation(consolidation2025Id, { withComparative: true })
    }, 60_000)

    // ── Estados individuales ──

    it('los estados individuales salen del motor canónico y cierran por separado', async () => {
        const parent = await loadStatementsForYear(2025, { companyId: LITORAL_PARENT_ID })
        const sub = await loadStatementsForYear(2025, { companyId: LITORAL_SUB_ID })

        expect(parent.balanceSheet.totalAssets.amount).toBe(1_351_400)
        expect(parent.balanceSheet.totalLiabilities.amount).toBe(140_000)
        expect(parent.balanceSheet.equity.amount).toBe(1_211_400)
        expect(parent.balanceSheet.equationDifference).toBe(0)
        expect(parent.incomeStatement.netIncome.amount).toBe(186_400)

        expect(sub.balanceSheet.totalAssets.amount).toBe(646_000)
        expect(sub.balanceSheet.totalLiabilities.amount).toBe(240_000)
        expect(sub.balanceSheet.equity.amount).toBe(406_000)
        expect(sub.balanceSheet.equationDifference).toBe(0)
        expect(sub.incomeStatement.netIncome.amount).toBe(96_000)
    })

    // ── Participación no controladora ──

    it('la PNC se calcula sobre el patrimonio ajustado por el resultado no trascendido', () => {
        expect(result.worksheet.nci).toHaveLength(1)
        const nci = result.worksheet.nci[0]
        expect(nci.ownership).toBe(0.8)
        expect(nci.subsidiaryEquity).toBe(406_000)
        // Venta ascendente: 180.000 − 120.000 = 60.000 de resultado interno,
        // del cual el 30 % sigue en poder del grupo ⇒ 18.000 no trascendidos
        expect(nci.unrealizedFromSubsidiary).toBe(18_000)
        expect(nci.adjustedEquity).toBe(388_000)
        expect(nci.closingNci).toBe(77_600)          // 20 % de 388.000
        expect(nci.subsidiaryResult).toBe(96_000)
        expect(nci.adjustedResult).toBe(78_000)
        expect(nci.nciResult).toBe(15_600)           // 20 % de 78.000
    })

    it('la inversión medida por VPP no deja diferencia de consolidación', () => {
        const nci = result.worksheet.nci[0]
        expect(nci.bookedInvestment).toBe(310_400)
        expect(nci.expectedInvestment).toBe(310_400)
        expect(nci.consolidationDifference).toBe(0)
    })

    // ── Juego consolidado ──

    it('ESP consolidado: la inversión y los saldos recíprocos desaparecen', () => {
        const bs = result.statements.balanceSheet
        expect(bs.totalAssets.amount).toBe(1_389_000)
        expect(bs.totalLiabilities.amount).toBe(100_000)
        expect(bs.equityOwners.amount).toBe(1_211_400)
        expect(bs.nonControllingInterest.amount).toBe(77_600)
        expect(bs.totalEquity.amount).toBe(1_289_000)
        expect(bs.equationDifference).toBe(0)

        const line = (id: string) => result.worksheet.rows.find(r => r.lineId === id)
        // Inversión permanente: eliminada por completo
        expect(line('ANC_INVERSIONES')!.consolidated).toBe(0)
        // Préstamo y saldo comercial intragrupo: en cero de los dos lados
        expect(line('AC_OTROS_CREDITOS')!.consolidated).toBe(0)
        expect(line('PC_PRESTAMOS')!.consolidated).toBe(0)
        // Mercaderías: 130.000 + 90.000 − 18.000 no trascendidos
        expect(line('AC_BIENES_CAMBIO')!.consolidated * -1 * -1).toBe(202_000)
    })

    it('ER consolidado: el resultado de los propietarios es el de la controladora', () => {
        const er = result.statements.incomeStatement
        expect(er.sales.amount).toBe(1_100_000)          // 700.000 + 580.000 − 180.000 internas
        expect(er.costOfSales.amount).toBe(618_000)      // 420.000 + 360.000 − 180.000 + 18.000
        expect(er.adminExpenses.amount).toBe(180_000)
        expect(er.financialIncome.amount).toBe(0)        // los 24.000 eran internos
        expect(er.financialExpenses.amount).toBe(0)
        expect(er.otherResults.amount).toBe(0)           // el VPP se elimina
        expect(er.incomeTax.amount).toBe(100_000)
        expect(er.netIncome.amount).toBe(202_000)
        expect(er.attributableToNci.amount).toBe(15_600)
        // PRUEBA ÁCIDA: con la inversión medida por VPP, el resultado de los
        // propietarios del consolidado es idéntico al individual de la controladora.
        expect(er.attributableToOwners.amount).toBe(186_400)
    })

    it('EEPN consolidado: separa propietarios de participación no controladora', () => {
        const eepn = result.statements.equityStatement
        expect(eepn.openingAvailable).toBe(true)
        const cierre = eepn.rows.find(r => r.id === 'eepn-cons:cierre')!
        expect(cierre.cells.TOTAL_PROPIETARIOS).toBe(1_211_400)
        expect(cierre.cells.PNC).toBe(77_600)
        expect(cierre.cells.TOTAL).toBe(1_289_000)
        const resultado = eepn.rows.find(r => r.id === 'eepn-cons:resultado')!
        expect(resultado.cells.TOTAL_PROPIETARIOS).toBe(186_400)
        expect(resultado.cells.PNC).toBe(15_600)
    })

    it('M — EFE consolidado: los flujos internos se eliminan y el efectivo no cambia', () => {
        const cf = result.statements.cashFlow!
        expect(cf.blockers).toEqual([])
        // El efectivo del grupo es la suma del efectivo real de las entidades:
        // un pago entre ellas no crea ni destruye efectivo.
        expect(cf.closingCash).toBe(87_000)
        expect(cf.sumOfEntityClosingCash).toBe(87_000)
        expect(cf.checks.find(c => c.id === 'efe-cons-efectivo-final')!.passed).toBe(true)
        expect(cf.checks.find(c => c.id === 'efe-cons-vs-esp')!.passed).toBe(true)
        // Se eliminaron el desembolso del préstamo y los dividendos internos
        expect(cf.eliminations.map(e => e.amount).sort((a, b) => a - b)).toEqual([32_000, 200_000])
        // Las eliminaciones netean a cero entre actividades
        expect(cf.lines.reduce((s, l) => s + l.elimination, 0)).toBe(0)
    })

    // ── Invariantes y trazabilidad ──

    it('todos los invariantes del motor pasan y el juego es emisible', () => {
        const failed = result.statements.checks.filter(c => !c.passed)
        expect(failed.map(c => `${c.label}${c.detail ? `: ${c.detail}` : ''}`)).toEqual([])
        expect(result.statements.blockers).toEqual([])
        expect(result.statements.canPublish).toBe(true)
    })

    it('toda eliminación balancea y cada línea reconcilia', () => {
        expect(result.worksheet.eliminations.every(e => e.balanced)).toBe(true)
        for (const row of result.worksheet.rows) {
            const recomputed = row.subtotal + row.homogenization + row.investmentElimination +
                row.nonControllingInterest + row.reciprocalElimination + row.operationElimination +
                row.unrealizedElimination + row.deferredTax + row.manualAdjustment
            expect(Math.round(recomputed * 100)).toBe(Math.round(row.consolidated * 100))
        }
    })

    it('cada línea consolidada conserva las entidades y cuentas que la forman', () => {
        const mercaderias = result.worksheet.rows.find(r => r.lineId === 'AC_BIENES_CAMBIO')!
        expect(mercaderias.byEntity.map(e => e.companyId).sort())
            .toEqual([LITORAL_PARENT_ID, LITORAL_SUB_ID].sort())
        expect(mercaderias.byEntity.every(e => e.accountIds.length > 0)).toBe(true)
        expect(mercaderias.eliminationIds.length).toBeGreaterThan(0)
    })

    it('cada eliminación explica su regla, su cálculo y su fundamento', () => {
        for (const elim of result.worksheet.eliminations) {
            expect(elim.rationale.length).toBeGreaterThan(40)
            expect(elim.computation.length).toBeGreaterThan(0)
            expect(elim.relatedCompanyIds.length).toBeGreaterThan(0)
        }
        const unrealized = result.worksheet.eliminations.find(e => e.kind === 'UNREALIZED_RESULT')!
        expect(unrealized.computation.join(' ')).toMatch(/Resultado NO trascendido/)
        expect(unrealized.computation.join(' ')).toMatch(/Ascendente/)
    })

    // ── El invariante absoluto ──

    it('los libros de las entidades quedan intactos después de consolidar', async () => {
        await runConsolidation(consolidation2025Id, { withComparative: true })
        const after = JSON.stringify(await db.entries.orderBy('id').toArray())
        expect(after).toBe(entriesSnapshot)
    })

    it('recalcular no duplica ningún ajuste', async () => {
        const again = await runConsolidation(consolidation2025Id, { withComparative: true })
        expect(again.statements.balanceSheet.totalAssets.amount)
            .toBe(result.statements.balanceSheet.totalAssets.amount)
        expect(again.worksheet.eliminations.length).toBe(result.worksheet.eliminations.length)
        expect(JSON.stringify(again.worksheet.rows)).toBe(JSON.stringify(result.worksheet.rows))
    })

    // ── Preparación y notas ──

    it('el panel de preparación habilita la consolidación', () => {
        expect(result.readiness.canConsolidate).toBe(true)
        expect(result.readiness.progress).toBeGreaterThanOrEqual(90)
        const blocked = result.readiness.checks.filter(c => c.state === 'BLOCKED')
        expect(blocked.map(c => c.label)).toEqual([])
    })

    it('las notas se construyen con datos reales del grupo', () => {
        const notes = result.statements.notes
        expect(notes.map(n => n.id)).toContain('nota-bases')
        expect(notes.map(n => n.id)).toContain('nota-composicion')
        expect(notes.map(n => n.id)).toContain('nota-pnc')

        const composicion = notes.find(n => n.id === 'nota-composicion')!
        expect(composicion.table!.rows.some(r => r[0] === 'Iberá Distribuciones S.A.' && r[2] === '80,00 %')).toBe(true)

        const pnc = notes.find(n => n.id === 'nota-pnc')!
        expect(pnc.paragraphs.join(' ')).toMatch(/NO constituye una deuda del grupo/)
        expect(pnc.table!.rows[0]).toContain('77.600,00')
    })

    // ── O — comparativo entre dos ejercicios ──

    it('O — el comparativo 2024 alimenta el saldo inicial del EEPN 2025', async () => {
        const withoutComparative = await runConsolidation(consolidation2025Id)
        expect(withoutComparative.statements.equityStatement.openingAvailable).toBe(false)
        expect(withoutComparative.statements.equityStatement.note)
            .toMatch(/no puede determinarse y no se estima/)

        const inicio = result.statements.equityStatement.rows.find(r => r.id === 'eepn-cons:inicio')!
        expect(inicio.insufficient).toBeUndefined()
        // PN consolidado al cierre de 2024: controladora 1.025.000 + PNC 20 % de 350.000
        expect(inicio.cells.TOTAL_PROPIETARIOS).toBe(1_025_000)
        expect(inicio.cells.PNC).toBe(70_000)
    })
})
