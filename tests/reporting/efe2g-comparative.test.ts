/**
 * Fase 2G — Apertura modificada (AREA) y comparativo del EFE (EFE-005/EFE-012,
 * spec §10, §11, §17.23-24).
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows, attachCashFlowComparative } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex', exerciseLabel: 'E', periodStart: '2025-01-01', periodEnd: '2025-12-31',
}
const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'rna', code: '3.2.01', name: 'Resultados no asignados', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', section: 'OPERATING' }),
]

let seq = 0
function entry(lines: { accountId: string; debit: number; credit: number }[], extra: Partial<JournalEntry> = {}): JournalEntry {
    seq += 1
    return { id: `c${seq}`, entryNumber: seq, date: '2025-05-10', memo: `a${seq}`, status: 'POSTED', lines, createdAt: '2025-05-10', updatedAt: '2025-05-10', ...extra } as unknown as JournalEntry
}

describe('Fase 2G — modificación del efectivo inicial (AREA)', () => {
    it('la AREA que toca efectivo modifica el inicial, no los flujos del período', () => {
        seq = 0
        const input: ReportingInput = {
            context: CTX,
            openingBalances: new Map([['caja', { debit: 1000, credit: 0 }], ['capital', { debit: 0, credit: 1000 }]]),
            accounts: ACCOUNTS,
            entries: [
                // AREA: corrección de un ejercicio anterior que aumenta el efectivo
                entry([{ accountId: 'caja', debit: 200, credit: 0 }, { accountId: 'rna', debit: 0, credit: 200 }], { equityMovementType: 'PRIOR_PERIOD_ADJUSTMENT' }),
                // venta cobrada del período (flujo operativo)
                entry([{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 500 }]),
            ],
        }
        const statements = buildStatements(input)
        const flows = buildCashFlows(input, statements)

        expect(flows.direct.openingCash.amount).toBe(1000)
        expect(flows.direct.priorAdjustments?.amount).toBe(200)
        expect(flows.direct.adjustedOpening?.amount).toBe(1200)
        expect(flows.direct.operating.amount).toBe(500) // AREA NO integra flujos
        expect(flows.direct.netChange.amount).toBe(500)
        expect(flows.direct.closingCash.amount).toBe(1700)
        // variación = final − inicial MODIFICADO
        expect(flows.validation.checks.find(c => c.id === 'efe-variacion')!.passed).toBe(true)
        expect(flows.validation.checks.find(c => c.id === 'efe-esp')!.passed).toBe(true)
    })

    it('sin AREA no se agregan líneas de modificación (colapsable)', () => {
        seq = 0
        const input: ReportingInput = {
            context: CTX, accounts: ACCOUNTS,
            openingBalances: new Map([['caja', { debit: 1000, credit: 0 }], ['capital', { debit: 0, credit: 1000 }]]),
            entries: [entry([{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 500 }])],
        }
        const flows = buildCashFlows(input, buildStatements(input))
        expect(flows.direct.priorAdjustments).toBeUndefined()
        expect(flows.direct.adjustedOpening).toBeUndefined()
    })
})

describe('Fase 2G — comparativo del EFE', () => {
    it('adosa los importes del ejercicio anterior a las líneas actuales', () => {
        seq = 0
        const mk = (sale: number): ReportingInput => ({
            context: CTX, accounts: ACCOUNTS, openingBalances: new Map([['caja', { debit: 100, credit: 0 }], ['capital', { debit: 0, credit: 100 }]]),
            entries: [entry([{ accountId: 'caja', debit: sale, credit: 0 }, { accountId: 'ventas', debit: 0, credit: sale }])],
        })
        const prevInput = mk(300)
        const curInput = mk(500)
        const prev = buildCashFlows(prevInput, buildStatements(prevInput))
        const cur = buildCashFlows(curInput, buildStatements(curInput))

        attachCashFlowComparative(cur.direct, prev.direct)
        expect(cur.direct.operating.amount).toBe(500)
        expect(cur.direct.operating.comparativeAmount).toBe(300)
        expect(cur.direct.netChange.comparativeAmount).toBe(300)
        expect(cur.direct.closingCash.amount).toBe(600)
        expect(cur.direct.closingCash.comparativeAmount).toBe(400)
    })
})
