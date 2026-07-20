/**
 * Fase 2F (§12/§13) — Set de índices único para moneda de cierre.
 * El mismo set alimenta EFE y bienes de uso; se identifica en el bundle
 * (nombre, estado, fuente, hash, cobertura, faltantes). La reexpresión de
 * bienes de uso anticúa cada movimiento; sin índice para un período se
 * bloquea (no se estima con coeficiente 1).
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { loadRcAcceptanceDataset, RC_CURRENT_YEAR } from '../../src/accounting/fixtures/rcAcceptance'
import { saveIndexSet } from '../../src/accounting/inflation/indexRegistry'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import type { InflationIndexSet } from '../../src/accounting/inflation/types'

describe('Fase 2F — set de índices para moneda de cierre', () => {
    let fullSet: InflationIndexSet
    let partialSet: InflationIndexSet

    beforeAll(async () => {
        await resetDb()
        await loadRcAcceptanceDataset()
        // set completo: todos los meses 2024-2025 con índice creciente
        const values: { period: string; value: number }[] = []
        let v = 100
        for (const y of [2024, 2025]) {
            for (let m = 1; m <= 12; m++) {
                values.push({ period: `${y}-${String(m).padStart(2, '0')}`, value: v })
                v = Math.round(v * 1.05 * 100) / 100
            }
        }
        fullSet = await saveIndexSet({ name: 'Índices RC (ejemplo)', status: 'EXAMPLE', source: 'test', values })
        // set parcial: sin diciembre 2025 (falta el cierre)
        partialSet = await saveIndexSet({ name: 'Índices parciales', status: 'MANUAL', source: 'test', values: values.filter(x => x.period !== '2025-12') })
    })

    it('sin set: nominal, sin reexpresión (moneda de cierre no disponible)', async () => {
        const bundle = await loadReportingBundle(RC_CURRENT_YEAR)
        expect(bundle.inflationSet).toBeNull()
        expect(bundle.cashFlowRestated).toBeNull()
        expect(bundle.fixedAssetsRestated).toBeNull()
    })

    it('con set completo: identidad del set + EFE y bienes de uso reexpresados', async () => {
        const bundle = await loadReportingBundle(RC_CURRENT_YEAR, { inflationIndexSetId: fullSet.id })
        expect(bundle.inflationSet).not.toBeNull()
        expect(bundle.inflationSet!.name).toBe('Índices RC (ejemplo)')
        expect(bundle.inflationSet!.status).toBe('EXAMPLE')
        expect(bundle.inflationSet!.contentHash).toBe(fullSet.contentHash)
        expect(bundle.inflationSet!.missingPeriods).toEqual([])

        // EFE en moneda de cierre disponible
        expect(bundle.cashFlowRestated).not.toBeNull()

        // Bienes de uso reexpresados: el ajuste es no nulo y VO reexpresado > nominal
        const fa = bundle.fixedAssetsRestated!
        expect(fa.blockers).toEqual([])
        const rodados = fa.rows.find(r => r.assetClass === 'Rodados')!
        expect(rodados.grossNominal).toBe(240000)
        expect(rodados.grossRestated).toBeGreaterThan(rodados.grossNominal)
        expect(rodados.grossAdjustment).toBeCloseTo(rodados.grossRestated - rodados.grossNominal, 2)
        expect(rodados.residualRestated).toBeCloseTo(rodados.grossRestated - rodados.depRestated, 2)
    })

    it('con set parcial (falta el cierre): la reexpresión de bienes de uso se BLOQUEA', async () => {
        const bundle = await loadReportingBundle(RC_CURRENT_YEAR, { inflationIndexSetId: partialSet.id })
        expect(bundle.inflationSet!.missingPeriods).toContain('2025-12')
        expect(bundle.fixedAssetsRestated!.blockers.length).toBeGreaterThan(0)
        expect(bundle.fixedAssetsRestated!.blockers[0]).toContain('2025-12')
    })
})
