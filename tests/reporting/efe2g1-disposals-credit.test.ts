/**
 * Fase 2G.1 — HITO 3: disposiciones a crédito, cobro parcial y operación mixta.
 *
 * En el HITO 1 estas pruebas eran `it.fails` (documentaban que el motor no
 * detectaba ni resolvía estos casos). El HITO 3 agrega:
 *  - DETECCIÓN de disposiciones a crédito/mixtas sin resolver
 *    (control `efe-disposicion` que BLOQUEA; nunca clasifica en silencio);
 *  - RESOLUCIÓN por override transaccional auditable (target ENTRY/OPERATION →
 *    inversión/financiación), con control importe asignado ≤ efectivo real.
 * Ahora son verdes (regresión permanente): la deuda quedó cerrada, no ablandada.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { defaultCashFlowPolicy, type CashFlowOverride, type CashFlowPolicy } from '../../src/reporting/policy/cashFlowPolicy'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'cred-bu', code: '1.1.05', name: 'Créditos por venta de bienes de uso', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    makeAccount({ id: 'ppe', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'ganancia', code: '4.5.01', name: 'Resultado venta bienes de uso', kind: 'INCOME', statementGroup: 'OTHER_INCOME', section: 'OPERATING' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]

function e(id: string, date: string, memo: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    return { id, entryNumber: Number(id.replace(/\D/g, '')) || 1, date, memo, status: 'POSTED', lines, createdAt: date, updatedAt: date } as unknown as JournalEntry
}

function run(opening: Map<string, { debit: number; credit: number }>, entries: JournalEntry[], policy?: CashFlowPolicy) {
    const input: ReportingInput = { context: CTX, entries, openingBalances: opening, accounts: ACCOUNTS }
    const statements = buildStatements(input)
    return buildCashFlows(input, statements, policy)
}

function override(targetId: string, opts: Partial<CashFlowOverride> = {}): CashFlowPolicy {
    return defaultCashFlowPolicy('c1', {
        overrides: [{
            id: `ov-${targetId}`, target: 'ENTRY', targetId, classification: 'INVESTING',
            reason: 'Disposición de bien de uso resuelta para QA', source: 'test', createdAt: '2025-01-01', version: 1,
            ...opts,
        }],
    })
}

const disposalCheck = (flows: ReturnType<typeof run>) => flows.validation.checks.find(c => c.id === 'efe-disposicion')!

describe('Fase 2G.1 — disposiciones a crédito / parciales / mixtas (HITO 3)', () => {
    it('venta a crédito SIN resolver: el motor detecta y BLOQUEA (UNRESOLVED_DISPOSAL)', () => {
        const flows = run(
            new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]),
            [e('sale-credit', '2025-06-10', 'Venta de bienes de uso a crédito', [
                { accountId: 'cred-bu', debit: 30000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 20000 },
                { accountId: 'ganancia', debit: 0, credit: 10000 },
            ])],
        )
        const check = disposalCheck(flows)
        expect(check.passed).toBe(false)
        expect(flows.validation.canPublish).toBe(false)
    })

    it('venta a crédito RESUELTA: sin flujo, revela lo pendiente y elimina la ganancia del operativo', () => {
        const flows = run(
            new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]),
            [e('sale-credit', '2025-06-10', 'Venta de bienes de uso a crédito', [
                { accountId: 'cred-bu', debit: 30000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 20000 },
                { accountId: 'ganancia', debit: 0, credit: 10000 },
            ])],
            override('sale-credit'),
        )
        expect(disposalCheck(flows).passed).toBe(true)
        expect(flows.direct.investing.amount).toBe(0)   // aún no hay flujo
        expect(flows.direct.operating.amount).toBe(0)   // la ganancia NO es operativa
        expect(flows.indirect.operating.amount).toBe(0) // ganancia eliminada del indirecto
        // se revela la venta pendiente de cobro (30.000)
        const pending = flows.direct.nonMonetaryDisclosures.find(d => d.id.startsWith('efe:pendiente'))
        expect(pending?.amount).toBe(30000)
    })

    it('cobro posterior RESUELTO como inversión, no operativo', () => {
        const flows = run(
            new Map([['cred-bu', { debit: 30000, credit: 0 }], ['capital', { debit: 0, credit: 30000 }]]),
            [e('collect', '2025-08-10', 'Cobro de venta de bienes de uso', [
                { accountId: 'caja', debit: 30000, credit: 0 },
                { accountId: 'cred-bu', debit: 0, credit: 30000 },
            ])],
            override('collect'),
        )
        expect(flows.direct.investing.amount).toBe(30000)
        expect(flows.direct.operating.amount).toBe(0)
        expect(flows.indirect.operating.amount).toBe(0)
        expect(flows.validation.checks.find(c => c.id === 'efe-metodos')!.passed).toBe(true)
    })

    it('cobro PARCIAL: sólo el efectivo realmente cobrado (12.000) es inversión', () => {
        const flows = run(
            new Map([['cred-bu', { debit: 30000, credit: 0 }], ['capital', { debit: 0, credit: 30000 }]]),
            [e('collect-partial', '2025-08-10', 'Cobro parcial de venta de bienes de uso', [
                { accountId: 'caja', debit: 12000, credit: 0 },
                { accountId: 'cred-bu', debit: 0, credit: 12000 },
            ])],
            override('collect-partial'),
        )
        expect(flows.direct.investing.amount).toBe(12000)
        expect(flows.direct.operating.amount).toBe(0)
        expect(flows.validation.checks.find(c => c.id === 'efe-metodos')!.passed).toBe(true)
    })

    it('operación MIXTA: sólo el efectivo (10.000) es inversión; el crédito no genera operativo', () => {
        const flows = run(
            new Map([['ppe', { debit: 22000, credit: 0 }], ['capital', { debit: 0, credit: 22000 }]]),
            [e('mixed', '2025-06-10', 'Venta mixta de bienes de uso', [
                { accountId: 'caja', debit: 10000, credit: 0 },
                { accountId: 'cred-bu', debit: 20000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 22000 },
                { accountId: 'ganancia', debit: 0, credit: 8000 },
            ])],
            override('mixed'),
        )
        expect(flows.direct.investing.amount).toBe(10000)
        expect(flows.direct.operating.amount).toBe(0)
        expect(flows.indirect.operating.amount).toBe(0)
        expect(flows.validation.checks.find(c => c.id === 'efe-metodos')!.passed).toBe(true)
    })

    it('control: un override no puede asignar más efectivo que el realmente cobrado', () => {
        const flows = run(
            new Map([['ppe', { debit: 22000, credit: 0 }], ['capital', { debit: 0, credit: 22000 }]]),
            [e('mixed', '2025-06-10', 'Venta mixta de bienes de uso', [
                { accountId: 'caja', debit: 10000, credit: 0 },
                { accountId: 'cred-bu', debit: 20000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 22000 },
                { accountId: 'ganancia', debit: 0, credit: 8000 },
            ])],
            override('mixed', { assignedCents: 3000000 }), // 30.000 > 10.000 real
        )
        expect(disposalCheck(flows).passed).toBe(false)
        expect(flows.validation.canPublish).toBe(false)
    })
})
