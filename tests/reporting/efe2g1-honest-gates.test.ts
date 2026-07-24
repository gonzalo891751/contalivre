/**
 * Fase 2G.1 — HITO 8: etiquetas y estados honestos (§9, §10).
 *
 * La puerta de publicación y los estados distinguen calculado/conciliado/
 * validado/bloqueado. No aparece "Validado" con blocker, ni "moneda de cierre"
 * sobre nominal, ni "conciliado" con una disposición pendiente.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { reexpressCashFlow } from '../../src/reporting/engine/cashFlowInflation'
import { buildCashFlowPreparationRestated } from '../../src/reporting/preparation/cashFlowPreparation'
import { buildPublicationGate } from '../../src/reporting/engine/publicationGate'
import { defaultCashFlowPolicy, type CashFlowPolicy } from '../../src/reporting/policy/cashFlowPolicy'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = { companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ej 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' }
const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'cred-bu', code: '1.1.05', name: 'Créditos por venta BU', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    makeAccount({ id: 'ppe', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'ganancia', code: '4.5.01', name: 'Resultado venta BU', kind: 'INCOME', statementGroup: 'OTHER_INCOME', section: 'OPERATING' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]
const creditSale: JournalEntry = {
    id: 'sale', entryNumber: 1, date: '2025-06-10', memo: 'Venta BU a crédito', status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10',
    lines: [{ accountId: 'cred-bu', debit: 30000, credit: 0 }, { accountId: 'ppe', debit: 0, credit: 20000 }, { accountId: 'ganancia', debit: 0, credit: 10000 }],
} as unknown as JournalEntry

function gate(policy?: CashFlowPolicy) {
    const input: ReportingInput = { context: CTX, entries: [creditSale], openingBalances: new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]), accounts: ACCOUNTS }
    const statements = buildStatements(input)
    const cf = buildCashFlows(input, statements, policy)
    statements.validation = cf.validation
    return buildPublicationGate({ validation: cf.validation, restated: null, inflationSet: null })
}

describe('Fase 2G.1 — etiquetas y estados honestos', () => {
    it('disposición pendiente ⇒ NO publicable (no "validado" con blocker)', () => {
        const g = gate() // sin override
        expect(g.canPublish).toBe(false)
        expect(g.blockers.some(b => /disposic/i.test(b.message))).toBe(true)
        // la acción pedagógica orienta a resolver con override
        expect(g.blockers.find(b => /disposic/i.test(b.message))!.action).toMatch(/override/i)
    })

    it('disposición resuelta por override ⇒ publicable', () => {
        const policy = defaultCashFlowPolicy('c1', {
            overrides: [{ id: 'ov', target: 'ENTRY', targetId: 'sale', classification: 'INVESTING', reason: 'r', source: 's', createdAt: '2025-01-01', version: 1 }],
        })
        const g = gate(policy)
        expect(g.canPublish).toBe(true)
        expect(g.blockers).toHaveLength(0)
    })

    it('moneda de cierre sin índices ⇒ cobertura MISSING/PARTIAL y NO conciliado (no se rotula cierre válido)', () => {
        const input: ReportingInput = {
            context: CTX,
            entries: [{ id: 'v', entryNumber: 1, date: '2025-06-10', memo: 'venta contado', status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10', lines: [{ accountId: 'caja', debit: 24000, credit: 0 }, { accountId: 'ppe', debit: 0, credit: 24000 }] } as unknown as JournalEntry],
            openingBalances: new Map([['ppe', { debit: 24000, credit: 0 }], ['capital', { debit: 0, credit: 24000 }]]),
            accounts: ACCOUNTS,
        }
        const statements = buildStatements(input)
        const cf = buildCashFlows(input, statements)
        const indexes = new Map<string, number>() // vacío: sin índices
        const restated = reexpressCashFlow(input, statements, indexes)
        const m = buildCashFlowPreparationRestated(input, statements, cf, restated, { indexes, indexSetId: 's', indexSetHash: 'h' })
        expect(m.identity.coverage).not.toBe('COVERED')
        expect(m.controls.allReconciled).toBe(false)
        expect(m.identity.blockers.length).toBeGreaterThan(0)
    })
})
