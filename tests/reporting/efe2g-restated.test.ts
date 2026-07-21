/**
 * Fase 2G — Moneda de cierre: no duplicar partidas sin clasificar (EFE-004, spec §5.2, §17.26).
 *
 * En el indirecto reexpresado, el flujo sin clasificar se suma dentro de
 * `operating` y OTRA VEZ en `netChange` (cashFlowInflation.ts:205). El directo
 * reexpresado lo cuenta una sola vez. La prueba (`it.fails`) exige la identidad
 * `directo.netChange = indirecto.netChange`; está ROJA hasta HITO 3, donde se
 * corrige la fórmula y se agrega esta regresión permanente.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { reexpressCashFlow } from '../../src/reporting/engine/cashFlowInflation'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    // Cuenta sin statementGroup ni override EFE ⇒ bucket UNCLASSIFIED
    makeAccount({ id: 'misteriosa', code: '1.9.99', name: 'Partida a regularizar', kind: 'ASSET', statementGroup: null }),
]

function flatIndexes(): Map<string, number> {
    const idx = new Map<string, number>()
    for (let m = 1; m <= 12; m++) idx.set(`2025-${String(m).padStart(2, '0')}`, 100)
    return idx
}

describe('Fase 2G — reexpresión: sin doble conteo de partidas sin clasificar (EFE-004)', () => {
    it.fails('directo reexpresado = indirecto reexpresado en la variación neta', () => {
        const input: ReportingInput = {
            context: CTX,
            entries: [{
                id: 'r1', entryNumber: 1, date: '2025-06-10', memo: 'cobro sin clasificar',
                status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10',
                lines: [
                    { accountId: 'caja', debit: 300, credit: 0 },
                    { accountId: 'misteriosa', debit: 0, credit: 300 },
                ],
            } as unknown as JournalEntry],
            openingBalances: new Map(),
            accounts: ACCOUNTS,
        }
        const statements = buildStatements(input)
        const restated = reexpressCashFlow(input, statements, flatIndexes())

        // La partida sin clasificar (300) se cuenta UNA sola vez en ambos métodos
        expect(restated.indirect.netChange.amount).toBe(restated.direct.netChange.amount)
        expect(restated.direct.netChange.amount).toBe(300)
        expect(restated.indirect.netChange.amount).toBe(300)
    })
})
