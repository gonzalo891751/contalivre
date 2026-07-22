/**
 * Fase 2G.1 — HITO 2: preparación matricial en MONEDA DE CIERRE (§3).
 *
 * El motor emite un modelo HERMANO del nominal
 * (`buildCashFlowPreparationRestated`) con `identity.expression =
 * 'CLOSING_CURRENCY'`. Cada contribución conserva índice de origen/cierre,
 * coeficiente, importe reexpresado antes y después de redondeo y diferencia de
 * redondeo. La matriz reconcilia con la exposición formal reexpresada; el REI
 * aparece y reconcilia; la falta de índices BLOQUEA (no se estima con coef 1).
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { reexpressCashFlow } from '../../src/reporting/engine/cashFlowInflation'
import { buildCashFlowPreparationRestated } from '../../src/reporting/preparation/cashFlowPreparation'
import { buildPurmamarcaInput, purmamarcaFlatIndexes } from './fixtures/purmamarca'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

function restatedPrep(input: ReportingInput, indexes: Map<string, number>) {
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    const restated = reexpressCashFlow(input, statements, indexes)
    return buildCashFlowPreparationRestated(input, statements, cashFlows, restated, {
        indexes, indexSetId: 'set-test', indexSetHash: 'hash-test',
    })
}

const col = (m: ReturnType<typeof restatedPrep>, a: string) => m.controls.columns.find(c => c.activity === a)

describe('Fase 2G.1 — preparación en moneda de cierre (Purmamarca, coef=1)', () => {
    it('identidad CLOSING_CURRENCY con set/hash/algoritmo/cobertura', () => {
        const m = restatedPrep(buildPurmamarcaInput(), purmamarcaFlatIndexes())
        expect(m.identity.expression).toBe('CLOSING_CURRENCY')
        expect(m.identity.indexSetId).toBe('set-test')
        expect(m.identity.indexSetHash).toBe('hash-test')
        expect(m.identity.algorithmVersion).toBe('2G.1')
        expect(m.identity.closePeriod).toBe('2025-12')
        expect(m.identity.coverage).toBe('COVERED')
        expect(m.identity.blockers).toEqual([])
    })

    it('con coef=1 reproduce el nominal: controles en cero y columnas económicas', () => {
        const m = restatedPrep(buildPurmamarcaInput(), purmamarcaFlatIndexes())
        expect(m.controls.totalControlCents).toBe(0)
        expect(m.controls.methodControlCents).toBe(0)
        expect(m.controls.cashControlCents).toBe(0)
        expect(m.controls.espControlCents).toBe(0)
        expect(m.controls.rowsWithDifference).toBe(0)
        expect(m.controls.allReconciled).toBe(true)
        expect(col(m, 'OPERATING')!.economicCents).toBe(400000)
        expect(col(m, 'INVESTING')!.economicCents).toBe(3000000)
        expect(col(m, 'FINANCING')!.economicCents).toBe(500000)
    })

    it('puente del efectivo reexpresado con REI (coef=1 ⇒ REI 0)', () => {
        const m = restatedPrep(buildPurmamarcaInput(), purmamarcaFlatIndexes())
        expect(m.cashBridge.openingRestatedCents).toBe(1000000)
        expect(m.cashBridge.closingCents).toBe(4900000)
        expect(m.cashBridge.reiCents).toBe(0)
        expect(m.cashBridge.netChangeCents).toBe(3900000)
        expect(m.cashBridge.flowsRestatedCents).toBe(3900000)
        expect(m.cashBridge.reconciledWithEsp).toBe(true)
    })

    it('cada contribución conserva índice, coeficiente y redondeo', () => {
        const m = restatedPrep(buildPurmamarcaInput(), purmamarcaFlatIndexes())
        expect(m.contributions && m.contributions.length).toBeGreaterThan(0)
        for (const c of m.contributions!) {
            expect(c.originIndex).toBe(100)
            expect(c.closeIndex).toBe(100)
            expect(c.coefficient).toBe(1)
            expect(c.restatedCents).toBe(c.amountNominalCents) // coef 1
            expect(c.roundingDiffCents).toBe(0)
            expect(c.entryId).toBeTruthy()
            expect(typeof c.lineIndex).toBe('number')
            expect(c.blocked).toBe(false)
        }
    })
})

// ── Escenario con inflación real (coeficiente ≠ 1) ──────────────────────────
const INF_CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}
const INF_ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'ppe', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]
function infInput(): ReportingInput {
    return {
        context: INF_CTX,
        openingBalances: new Map([['ppe', { debit: 24000, credit: 0 }], ['capital', { debit: 0, credit: 24000 }]]),
        accounts: INF_ACCOUNTS,
        entries: [{
            id: 'v1', entryNumber: 1, date: '2025-06-10', memo: 'venta PPE a valor contable',
            status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10',
            lines: [
                { accountId: 'caja', debit: 24000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 24000 },
            ],
        } as unknown as JournalEntry],
    }
}
/** índice 120 en junio, 240 al cierre ⇒ coeficiente 2,0 para el flujo de junio */
function infIndexes(): Map<string, number> {
    const idx = new Map<string, number>()
    for (let mo = 1; mo <= 12; mo++) idx.set(`2025-${String(mo).padStart(2, '0')}`, mo <= 6 ? 120 : 240)
    return idx
}

describe('Fase 2G.1 — preparación en moneda de cierre con inflación real', () => {
    it('reexpresa por contribución (coef=2) y reconcilia con la exposición formal', () => {
        const m = restatedPrep(infInput(), infIndexes())
        // venta de PPE reexpresada: 24.000 × 2 = 48.000 en inversión
        expect(col(m, 'INVESTING')!.economicCents).toBe(4800000)
        const ppeContrib = m.contributions!.find(c => c.accountId === 'ppe')!
        expect(ppeContrib.amountNominalCents).toBe(-2400000) // crédito
        expect(ppeContrib.coefficient).toBe(2)
        expect(ppeContrib.restatedCents).toBe(-4800000)
        // REI negativo: el efectivo cobrado pierde poder adquisitivo hasta el cierre
        expect(m.cashBridge.reiCents).toBe(-2400000)
        expect(m.cashBridge.closingCents).toBe(2400000)
        expect(m.cashBridge.netChangeCents).toBe(m.cashBridge.flowsRestatedCents! + m.cashBridge.reiCents!)
        // controles del papel de trabajo en cero (método, caja, esp, total, filas)
        expect(m.controls.methodControlCents).toBe(0)
        expect(m.controls.cashControlCents).toBe(0)
        expect(m.controls.espControlCents).toBe(0)
        expect(m.controls.totalControlCents).toBe(0)
        expect(m.controls.allReconciled).toBe(true)
    })

    it('falta de índice BLOQUEA (no se estima con coef 1)', () => {
        const partial = infIndexes()
        partial.delete('2025-06') // el período del flujo pierde su índice
        const m = restatedPrep(infInput(), partial)
        expect(m.identity.coverage).not.toBe('COVERED')
        expect(m.identity.blockers.length).toBeGreaterThan(0)
        expect(m.controls.allReconciled).toBe(false)
        const ppeContrib = m.contributions!.find(c => c.accountId === 'ppe')!
        expect(ppeContrib.blocked).toBe(true)
        expect(ppeContrib.coefficient).toBeNull()
        const ppeRow = m.matrixRows.find(r => r.accountId === 'ppe')!
        expect(ppeRow.state).toBe('BLOCKED')
        expect(ppeRow.blockedByMissingIndex).toBe(true)
    })
})
