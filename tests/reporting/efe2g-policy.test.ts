/**
 * Fase 2G — Política EFE versionada y NOT_APPLICABLE (EFE-007/EFE-010, spec §6, §17.20-21).
 *
 * Cubre el modelo puro de política (derivación heredada, vigencia, overrides,
 * sobregiros) y el arreglo de NOT_APPLICABLE en el motor: una cuenta marcada
 * NOT_APPLICABLE ya NO se clasifica silenciosamente como inversión.
 */

import { describe, it, expect } from 'vitest'
import {
    defaultCashFlowPolicy,
    deriveLegacyPolicy,
    effectiveCashRole,
    effectiveOverride,
    roleCountsAsCash,
    type CashFlowOverride,
} from '../../src/reporting/policy/cashFlowPolicy'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows, flowBucket } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

describe('Fase 2G — modelo de política EFE', () => {
    it('política por defecto: intereses/dividendos/IG con criterio RT 54', () => {
        const p = defaultCashFlowPolicy('c1')
        expect(p.interestsPaid).toBe('OPERATING')
        expect(p.dividendsPaid).toBe('FINANCING')
        expect(p.incomeTax).toBe('OPERATING')
        expect(p.overdrafts).toBe('CASH_COMPONENT')
        expect(p.requiresReview).toBe(false)
    })

    it('política heredada: clasifica cuentas de caja y marca requiresReview', () => {
        const p = deriveLegacyPolicy('c1', [
            { id: 'caja', statementGroup: 'CASH_AND_BANKS' },
            { id: 'plazo-fijo', statementGroup: 'INVESTMENTS', cashFlowCategory: 'CASH_EQUIVALENT' },
            { id: 'rodados', statementGroup: 'PPE' },
        ])
        expect(p.requiresReview).toBe(true)
        expect(p.source).toBe('migration-v22')
        const ids = p.cashClassifications.map(c => c.accountId)
        expect(ids).toContain('caja')
        expect(ids).toContain('plazo-fijo')
        expect(ids).not.toContain('rodados')
        expect(p.cashClassifications.find(c => c.accountId === 'plazo-fijo')!.role).toBe('CASH_EQUIVALENT')
        expect(p.cashClassifications.find(c => c.accountId === 'caja')!.role).toBe('CASH')
    })

    it('rol de efectivo con vigencia histórica', () => {
        const p = defaultCashFlowPolicy('c1', {
            cashClassifications: [
                { accountId: 'fondo', role: 'RESTRICTED_FUND', validFrom: '2025-01-01', validTo: '2025-06-30' },
            ],
        })
        expect(effectiveCashRole(p, 'fondo', '2025-03-01')).toBe('RESTRICTED_FUND')
        expect(effectiveCashRole(p, 'fondo', '2025-08-01')).toBeNull() // fuera de vigencia
        expect(effectiveCashRole(p, 'otra', '2025-03-01')).toBeNull()
    })

    it('sobregiro cuenta como efectivo sólo si la política lo dice', () => {
        expect(roleCountsAsCash('OVERDRAFT', 'CASH_COMPONENT')).toBe(true)
        expect(roleCountsAsCash('OVERDRAFT', 'FINANCING')).toBe(false)
        expect(roleCountsAsCash('RESTRICTED_FUND', 'CASH_COMPONENT')).toBe(false)
        expect(roleCountsAsCash('CASH_EQUIVALENT', 'FINANCING')).toBe(true)
    })

    it('override efectivo: precedencia LINE > ACCOUNT y vigencia', () => {
        const overrides: CashFlowOverride[] = [
            { id: 'o1', target: 'ACCOUNT', targetId: 'int', classification: 'OPERATING', reason: 'default', source: 'u', createdAt: 'now', version: 1 },
            { id: 'o2', target: 'LINE', targetId: 'L9', classification: 'FINANCING', reason: 'préstamo', source: 'u', createdAt: 'now', version: 1, validFrom: '2025-01-01' },
        ]
        const p = defaultCashFlowPolicy('c1', { overrides })
        expect(effectiveOverride(p, { LINE: 'L9', ACCOUNT: 'int' }, '2025-05-01')!.classification).toBe('FINANCING')
        expect(effectiveOverride(p, { ACCOUNT: 'int' }, '2025-05-01')!.classification).toBe('OPERATING')
        // línea fuera de vigencia (2024) ⇒ cae al override de cuenta
        expect(effectiveOverride(p, { LINE: 'L9', ACCOUNT: 'int' }, '2024-01-01')!.classification).toBe('OPERATING')
        expect(effectiveOverride(p, { LINE: 'L9' }, '2024-01-01')).toBeNull()
    })
})

describe('Fase 2G — NOT_APPLICABLE en el motor (EFE-010)', () => {
    const ACCOUNTS: Account[] = [
        makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
        makeAccount({ id: 'ppe-na', code: '1.2.01', name: 'Bien de uso no aplicable', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', cashFlowCategory: 'NOT_APPLICABLE' }),
        makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    ]

    it('una cuenta NOT_APPLICABLE no se deriva como inversión', () => {
        const byId = new Map(ACCOUNTS.map(a => [a.id, a]))
        expect(flowBucket(byId.get('ppe-na'))).toBe('UNCLASSIFIED')

        const input: ReportingInput = {
            context: { companyId: 'c1', exerciseId: 'ex', exerciseLabel: 'E', periodStart: '2025-01-01', periodEnd: '2025-12-31' },
            openingBalances: new Map([['ppe-na', { debit: 1000, credit: 0 }], ['capital', { debit: 0, credit: 1000 }]]),
            accounts: ACCOUNTS,
            entries: [{
                id: 'e1', entryNumber: 1, date: '2025-06-10', memo: 'venta', status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10',
                lines: [{ accountId: 'caja', debit: 1000, credit: 0 }, { accountId: 'ppe-na', debit: 0, credit: 1000 }],
            } as unknown as JournalEntry],
        }
        const statements = buildStatements(input)
        const flows = buildCashFlows(input, statements)
        // NO va a inversión; queda sin clasificar y bloquea (se expone)
        expect(flows.direct.investing.amount).toBe(0)
        expect(flows.direct.unclassified.amount).toBe(1000)
        expect(flows.validation.checks.find(c => c.id === 'efe-clasificacion')!.passed).toBe(false)
    })
})
