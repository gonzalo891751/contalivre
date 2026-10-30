/**
 * Análisis de Estados Contables — fórmulas de la bibliografía argentina.
 *
 * Caso de dos ejercicios con IVA, préstamo, depreciación e impuesto, cerrado
 * y reabierto con el circuito real. Los importes esperados están verificados
 * a mano (ver comentarios): si cambia una fórmula, el test lo dice.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestCompany, documentNominalTestClosing } from './helpers'
import { db } from '../../src/storage/db'
import { loadSeedDataIfNeeded } from '../../src/storage/seed'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { generateClosingDrafts, postClosing, generateOpeningEntry } from '../../src/accounting/application/closingService'
import { exerciseIdForYear } from '../../src/accounting/application/contextService'
import { loadReportingBundle, type ReportingBundle } from '../../src/reporting/loadReportingBundle'
import { buildMetricsCatalog } from '../../src/reporting/metrics/metrics'
import type { MetricCatalogEntry, MetricResult } from '../../src/reporting/metrics/types'

type Line = { accountId: string; debit: number; credit: number }

async function chart() {
    const accounts = await db.accounts.toArray()
    const id = (code: string) => {
        const a = accounts.find(x => x.code === code)
        if (!a) throw new Error(`cuenta ${code} inexistente`)
        return a.id
    }
    const L = (code: string, debit: number, credit: number): Line => ({ accountId: id(code), debit, credit })
    const post = (date: string, memo: string, lines: Line[]) => postNewEntry({ date, memo, lines, allowExerciseProvisioning: true })
    return { L, post }
}

function value(catalog: MetricCatalogEntry[], id: string): number | null {
    const m = catalog.find(e => e.id === id)
    expect(m, `indicador ${id}`).toBeDefined()
    return m!.result.status === 'CALCULATED' ? m!.result.value : null
}
function result(catalog: MetricCatalogEntry[], id: string): MetricResult {
    return catalog.find(e => e.id === id)!.result
}

describe('Análisis de estados contables — caso comercial de dos ejercicios', () => {
    let b2025: ReportingBundle
    let b2026: ReportingBundle

    beforeAll(async () => {
        await resetDb()
        await loadSeedDataIfNeeded()
        await seedTestCompany()
        const { L, post } = await chart()
        // ── 2025 ─────────────────────────────────────────────
        await post('2025-01-02', 'Aporte', [L('1.1.01.02', 5000000, 0), L('3.1.01', 0, 5000000)])
        await post('2025-01-10', 'Rodado', [L('1.2.01.04', 1200000, 0), L('1.1.01.02', 0, 1200000)])
        await post('2025-02-01', 'Préstamo LP', [L('1.1.01.02', 1000000, 0), L('2.2.01.01', 0, 1000000)])
        await post('2025-03-01', 'Compra', [L('1.1.04.01', 3000000, 0), L('1.1.03.01', 630000, 0), L('2.1.01.01', 0, 3630000)])
        await post('2025-05-01', 'Venta', [L('1.1.02.01', 4840000, 0), L('4.1.01', 0, 4000000), L('2.1.03.01', 0, 840000)])
        await post('2025-05-01', 'CMV', [L('4.3.01', 2400000, 0), L('1.1.04.01', 0, 2400000)])
        await post('2025-07-01', 'Cobranza', [L('1.1.01.02', 4000000, 0), L('1.1.02.01', 0, 4000000)])
        await post('2025-08-01', 'Pago a proveedores', [L('2.1.01.01', 3000000, 0), L('1.1.01.02', 0, 3000000)])
        await post('2025-09-01', 'Sueldos', [L('4.5.01', 600000, 0), L('1.1.01.02', 0, 600000)])
        await post('2025-12-31', 'Intereses', [L('4.6.02', 150000, 0), L('1.1.01.02', 0, 150000)])
        await post('2025-12-31', 'Amortización', [L('4.5.11', 240000, 0), L('1.2.01.94', 0, 240000)])
        await post('2025-12-31', 'Impuesto a las ganancias', [L('4.9.01', 200000, 0), L('2.1.03.02', 0, 200000)])
        await documentNominalTestClosing(2025)
        await generateClosingDrafts(exerciseIdForYear(2025))
        await postClosing(exerciseIdForYear(2025))
        await generateOpeningEntry(exerciseIdForYear(2025))
        // ── 2026 ─────────────────────────────────────────────
        await post('2026-03-01', 'Compra', [L('1.1.04.01', 4000000, 0), L('1.1.03.01', 840000, 0), L('2.1.01.01', 0, 4840000)])
        await post('2026-05-01', 'Venta', [L('1.1.02.01', 7260000, 0), L('4.1.01', 0, 6000000), L('2.1.03.01', 0, 1260000)])
        await post('2026-05-01', 'CMV', [L('4.3.01', 3500000, 0), L('1.1.04.01', 0, 3500000)])
        await post('2026-07-01', 'Cobranza', [L('1.1.01.02', 6500000, 0), L('1.1.02.01', 0, 6500000)])
        await post('2026-08-01', 'Pago a proveedores', [L('2.1.01.01', 4500000, 0), L('1.1.01.02', 0, 4500000)])
        await post('2026-09-01', 'Sueldos', [L('4.5.01', 900000, 0), L('1.1.01.02', 0, 900000)])
        await post('2026-12-31', 'Intereses', [L('4.6.02', 180000, 0), L('1.1.01.02', 0, 180000)])
        await post('2026-12-31', 'Amortización', [L('4.5.11', 240000, 0), L('1.2.01.94', 0, 240000)])
        await post('2026-12-31', 'Impuesto a las ganancias', [L('4.9.01', 350000, 0), L('2.1.03.02', 0, 350000)])

        b2025 = await loadReportingBundle(2025, { withComparative: true })
        b2026 = await loadReportingBundle(2026, { withComparative: true })
    })

    it('el ejercicio 2026 toma sus saldos de inicio del asiento de apertura', () => {
        expect(b2026.statements.openingSource).toBe('OPENING_ENTRY')
        expect(b2025.statements.openingSource).toBe('NONE')
    })

    it('liquidez: corriente, ácida e inmediata', () => {
        // AC 10.140.000 · PC 3.620.000 · BC 1.100.000 · Caja y bancos 5.970.000
        expect(value(b2026.metrics, 'liquidez-corriente')).toBe(2.8)
        expect(value(b2026.metrics, 'prueba-acida')).toBe(2.5)
        expect(value(b2026.metrics, 'liquidez-inmediata')).toBe(1.65)
        expect(value(b2026.metrics, 'capital-trabajo')).toBe(6520000)
    })

    it('plazos: bienes de cambio, cobranza con IVA y pago con compras del puente del costo', () => {
        // BC promedio (600.000 + 1.100.000)/2 = 850.000; CMV 3.500.000
        expect(value(b2026.metrics, 'rotacion-inventarios')).toBe(4.12)
        expect(value(b2026.metrics, 'dias-inventario')).toBe(88.64)
        // créditos promedio (840.000 + 1.600.000)/2 = 1.220.000; ventas c/IVA 7.260.000
        expect(value(b2026.metrics, 'dias-cobranza')).toBe(61.34)
        // proveedores promedio (630.000 + 970.000)/2 = 800.000; compras 4.000.000 × 1,21
        expect(value(b2026.metrics, 'dias-pago')).toBe(60.33)
        expect(value(b2026.metrics, 'ciclo-operativo')).toBe(149.98)
        expect(value(b2026.metrics, 'ciclo-conversion')).toBe(89.65)
    })

    it('estructura: solvencia PN/P (con variante A/P) y endeudamiento P/PN', () => {
        // PN 6.240.000 · Pasivo 4.620.000 · Activo 10.860.000
        expect(value(b2026.metrics, 'solvencia')).toBe(1.35)
        const solv = b2026.metrics.find(e => e.id === 'solvencia')!
        expect(solv.variants?.[0]).toMatchObject({ formula: 'Activo / Pasivo', value: 2.35 })
        expect(value(b2026.metrics, 'endeudamiento')).toBe(0.74)
        expect(value(b2026.metrics, 'cobertura-intereses')).toBe(7.56) // (1.180.000 + 180.000) / 180.000
    })

    it('rentabilidad: RA con intereses, RPN, costo de la deuda y efecto palanca', () => {
        // RA = (830.000 + 180.000) / ((8.080.000 + 10.860.000)/2)
        expect(value(b2026.metrics, 'roa')).toBe(10.67)
        // RPN = 830.000 / ((5.410.000 + 6.240.000)/2)
        expect(value(b2026.metrics, 'roe')).toBe(14.25)
        expect(value(b2026.metrics, 'costo-deuda')).toBe(4.94)
        expect(value(b2026.metrics, 'efecto-palanca')).toBe(1.34)
        const palanca = result(b2026.metrics, 'efecto-palanca')
        expect(palanca.status === 'CALCULATED' && palanca.interpretation).toContain('Favorable')
        // EBITDA = RO 1.360.000 + depreciación 240.000
        expect(value(b2026.metrics, 'margen-ebitda')).toBe(26.67)
    })

    it('cada indicador trae su valor del ejercicio anterior', () => {
        const ra = b2026.metrics.find(e => e.id === 'roa')!
        // 2025: (410.000 + 150.000) / 8.080.000 (saldo final, primer ejercicio)
        expect(ra.previous?.status === 'CALCULATED' && ra.previous.value).toBe(6.93)
        const cfo = b2026.metrics.find(e => e.id === 'cfo-pc')!
        expect(cfo.previous?.status).toBe('CALCULATED')
    })

    it('opción saldos de cierre: no promedia', () => {
        const catalog = buildMetricsCatalog(b2026.statements, b2026.accounts, b2026.comparativeStatements, { averaging: 'CIERRE' })
        // 1.600.000 / 7.260.000 × 365
        expect(value(catalog, 'dias-cobranza')).toBe(80.44)
    })

    it('ente sin fines de lucro: sin rentabilidad del PN; autosuficiencia de recursos', () => {
        const catalog = buildMetricsCatalog(b2026.statements, b2026.accounts, b2026.comparativeStatements, { nonProfit: true })
        expect(result(catalog, 'roe').status).toBe('NOT_APPLICABLE')
        expect(result(catalog, 'efecto-palanca').status).toBe('NOT_APPLICABLE')
        // 6.000.000 / (3.500.000 + 1.140.000)
        expect(value(catalog, 'autosuficiencia')).toBe(1.29)
    })

    it('análisis horizontal del ESP sin filas duplicadas', () => {
        const ids = b2026.analysis.horizontalBalanceSheet.map(r => r.lineId)
        expect(new Set(ids).size).toBe(ids.length)
        const ac = b2026.analysis.horizontalBalanceSheet.find(r => r.lineId === 'esp:ac')!
        expect(ac.previous).toBe(7120000)
        expect(ac.percentageChange).toBe(42.42)
    })

    it('ningún indicador devuelve Infinity ni NaN', () => {
        for (const e of [...b2025.metrics, ...b2026.metrics]) {
            if (e.result.status === 'CALCULATED') expect(Number.isFinite(e.result.value), e.id).toBe(true)
        }
    })
})

describe('Análisis de estados contables — práctico que arranca con asiento de apertura manual', () => {
    it('promedia con los saldos del asiento de apertura del primer día', async () => {
        await resetDb()
        await loadSeedDataIfNeeded()
        await seedTestCompany()
        const { L, post } = await chart()
        await post('2026-01-01', 'Asiento de apertura', [
            L('1.1.01.02', 1000000, 0), L('1.1.02.01', 400000, 0), L('1.1.04.01', 600000, 0),
            L('2.1.01.01', 0, 500000), L('3.1.01', 0, 1500000),
        ])
        await post('2026-04-01', 'Venta', [L('1.1.02.01', 2420000, 0), L('4.1.01', 0, 2000000), L('2.1.03.01', 0, 420000)])
        await post('2026-04-01', 'CMV', [L('4.3.01', 1200000, 0), L('1.1.04.01', 0, 1200000)])
        await post('2026-06-01', 'Compra', [L('1.1.04.01', 1000000, 0), L('1.1.03.01', 210000, 0), L('2.1.01.01', 0, 1210000)])

        const b = await loadReportingBundle(2026, { withComparative: true })
        expect(b.statements.openingSource).toBe('MANUAL_OPENING')
        const cobranza = result(b.metrics, 'dias-cobranza')
        expect(cobranza.status).toBe('CALCULATED')
        if (cobranza.status !== 'CALCULATED') return
        expect(cobranza.warnings).toEqual([])
        // créditos promedio (400.000 + 2.820.000)/2 = 1.610.000; ventas c/IVA 2.420.000
        expect(cobranza.value).toBe(242.83)
        expect(cobranza.inputs[0].source).toContain('apertura')
    })
})
