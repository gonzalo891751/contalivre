/**
 * Fase 2B — Indicadores con MetricResult y análisis vertical/horizontal (§13).
 * Nunca Infinity/NaN/cero-sustituto; promedios con comparativo o advertencia.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { buildMetricsCatalog } from '../../src/reporting/metrics/metrics'
import {
    horizontalBalanceSheet,
    verticalBalanceSheet,
    verticalIncomeStatement,
} from '../../src/reporting/metrics/analysis'
import { safeDiv, formatNumber } from '../../src/utils/indicators'
import { db } from '../../src/storage/db'
import type { MetricCatalogEntry } from '../../src/reporting/metrics/types'
import type { StatementsBundle } from '../../src/reporting/domain/types'

function byId(catalog: MetricCatalogEntry[], id: string): MetricCatalogEntry {
    const entry = catalog.find(e => e.id === id)
    expect(entry, `métrica ${id} no encontrada`).toBeDefined()
    return entry!
}

describe('Fase 2B — indicadores sobre el golden comercial', () => {
    let bundle: StatementsBundle
    let catalog: MetricCatalogEntry[]

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-02-01', memo: 'compra', lines: simpleLines('mercaderias', 'caja', 200000) })
        await postNewEntry({ date: '2025-03-10', memo: 'venta', lines: simpleLines('deudores', 'ventas', 300000) })
        await postNewEntry({ date: '2025-03-10', memo: 'cmv', lines: simpleLines('cmv', 'mercaderias', 180000) })
        await postNewEntry({ date: '2025-06-30', memo: 'gasto devengado', lines: simpleLines('gastos', 'gastos-a-pagar', 52000) })
        bundle = await loadStatementsForYear(2025)
        const accounts = await db.accounts.toArray()
        catalog = buildMetricsCatalog(bundle, accounts, null)
    })

    it('liquidez corriente exacta con fórmula y sustitución', () => {
        const m = byId(catalog, 'liquidez-corriente').result
        expect(m.status).toBe('CALCULATED')
        if (m.status !== 'CALCULATED') return
        // AC = caja 800.000 + merc 20.000 + deudores 300.000 = 1.120.000; PC = 52.000
        expect(m.value).toBe(21.54)
        expect(m.formula).toBe('AC / PC')
        expect(m.substitution).toContain('1.120.000')
        expect(m.inputs).toHaveLength(2)
    })

    it('prueba ácida excluye inventarios por metadata (no por nombre)', () => {
        const m = byId(catalog, 'prueba-acida').result
        expect(m.status).toBe('CALCULATED')
        if (m.status !== 'CALCULATED') return
        expect(m.value).toBe(21.15) // (1.120.000 − 20.000) / 52.000
    })

    it('ROA sin comparativo: se rotula aproximación con saldo final', () => {
        const m = byId(catalog, 'roa').result
        expect(m.status).toBe('CALCULATED')
        if (m.status !== 'CALCULATED') return
        expect(m.warnings.some(w => w.includes('Aproximación con saldo final'))).toBe(true)
    })

    it('días de cobranza: información insuficiente, no se inventan ventas a crédito', () => {
        const m = byId(catalog, 'dias-cobranza').result
        expect(m.status).toBe('INSUFFICIENT_INFORMATION')
        if (m.status !== 'INSUFFICIENT_INFORMATION') return
        expect(m.missingInputs).toContain('Ventas a crédito del ejercicio')
    })

    it('EBITDA: insuficiente sin metadata de depreciaciones (sin heurísticas)', () => {
        const m = byId(catalog, 'margen-ebitda').result
        expect(m.status).toBe('INSUFFICIENT_INFORMATION')
    })

    it('rotación de inventarios y días con política de días explícita', () => {
        const rot = byId(catalog, 'rotacion-inventarios').result
        expect(rot.status).toBe('CALCULATED')
        if (rot.status !== 'CALCULATED') return
        expect(rot.value).toBe(9) // 180.000 / 20.000
        const dias = byId(catalog, 'dias-inventario').result
        expect(dias.status).toBe('CALCULATED')
        if (dias.status !== 'CALCULATED') return
        expect(dias.dayCountPolicy).toBe(365)
        expect(dias.value).toBe(40.56)
    })

    it('ningún indicador devuelve Infinity ni NaN', () => {
        for (const entry of catalog) {
            if (entry.result.status === 'CALCULATED') {
                expect(Number.isFinite(entry.result.value), entry.id).toBe(true)
            }
        }
    })
})

describe('Fase 2B — denominador cero y PN negativo', () => {
    it('sin pasivo: solvencia NOT_CALCULABLE (nunca ∞)', async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-05', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        const bundle = await loadStatementsForYear(2025)
        const catalog = buildMetricsCatalog(bundle, await db.accounts.toArray())

        const solvencia = byId(catalog, 'solvencia').result
        expect(solvencia.status).toBe('NOT_CALCULABLE')
        const liquidez = byId(catalog, 'liquidez-corriente').result
        expect(liquidez.status).toBe('NOT_CALCULABLE')
    })

    it('PN negativo: Pasivo/PN es NOT_APPLICABLE con razón', async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-02-01', memo: 'pérdida financiada', lines: simpleLines('gastos', 'prestamos', 5000) })
        const bundle = await loadStatementsForYear(2025)
        const catalog = buildMetricsCatalog(bundle, await db.accounts.toArray())
        const m = byId(catalog, 'pasivo-pn').result
        expect(m.status).toBe('NOT_APPLICABLE')
        if (m.status !== 'NOT_APPLICABLE') return
        expect(m.reason).toContain('negativo')
    })
})

describe('Fase 2B — análisis vertical y horizontal', () => {
    let bundle2026: StatementsBundle

    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-03-01', memo: 'aporte 2025', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-06-01', memo: 'venta 2025', lines: simpleLines('caja', 'ventas', 500) })
        await postNewEntry({ date: '2026-04-01', memo: 'venta 2026', lines: simpleLines('caja', 'ventas', 750) })
        bundle2026 = await loadStatementsForYear(2026, { withComparative: true })
    })

    it('vertical ESP: cada rubro sobre el total del activo', () => {
        const rows = verticalBalanceSheet(bundle2026)
        const activoTotal = rows.find(r => r.lineId === 'esp:activo')!
        expect(activoTotal.percentage).toBe(100)
        const ac = rows.find(r => r.lineId === 'esp:ac')!
        expect(ac.baseLabel).toBe('Total del activo')
        expect(ac.percentage).toBe(100) // todo el activo es corriente en este caso
    })

    it('vertical ER: sobre ventas', () => {
        const rows = verticalIncomeStatement(bundle2026)
        const ventas = rows.find(r => r.lineId === 'er:ventas')!
        expect(ventas.percentage).toBe(100)
        const neto = rows.find(r => r.lineId === 'er:neto')!
        expect(neto.percentage).toBe(100) // sin costos en 2026
    })

    it('horizontal: variación absoluta y porcentual con comparativo del motor', () => {
        const rows = horizontalBalanceSheet(bundle2026)
        const activo = rows.find(r => r.lineId === 'esp:activo')!
        expect(activo.previous).toBe(1500)   // caja 2025 acumulada
        expect(activo.current).toBe(2250)
        expect(activo.absoluteChange).toBe(750)
        expect(activo.percentageChange).toBe(50)
    })

    it('horizontal: base cero o negativa queda advertida, sin % engañoso', () => {
        const rows = horizontalBalanceSheet(bundle2026)
        const pnc = rows.find(r => r.lineId === 'esp:pnc')!
        expect(pnc.percentageChange).toBeNull()
        expect(pnc.note).toContain('Base cero')
    })
})

describe('Fase 2B — ANA-001: safeDiv y formatters sin ∞', () => {
    it('safeDiv nunca devuelve Infinity', () => {
        expect(safeDiv(100, 0)).toBeNull()
        expect(safeDiv(0, 0)).toBeNull()
        expect(safeDiv(NaN, 5)).toBeNull()
        expect(safeDiv(10, 4)).toBe(2.5)
    })

    it('los formatters muestran "No calculable"', () => {
        expect(formatNumber(null)).toBe('No calculable')
        expect(formatNumber(Infinity)).toBe('No calculable')
    })
})
