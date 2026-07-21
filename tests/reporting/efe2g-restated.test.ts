/**
 * Fase 2G — Moneda de cierre: no duplicar partidas sin clasificar (EFE-004, spec §5.2, §17.26).
 *
 * HITO 3 corrigió el doble conteo: el flujo sin clasificar se cuenta UNA vez en
 * `netChange` del indirecto reexpresado. La prueba era `it.fails` en HITO 1 y
 * ahora es verde (regresión permanente de EFE-004). Se agrega además la
 * consistencia nominal↔cierre de la disposición de PPE (EFE-001 en reexpresión).
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
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
    makeAccount({ id: 'ppe', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'ganancia', code: '4.5.01', name: 'Resultado venta bienes de uso', kind: 'INCOME', statementGroup: 'OTHER_INCOME' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]

function flatIndexes(): Map<string, number> {
    const idx = new Map<string, number>()
    for (let m = 1; m <= 12; m++) idx.set(`2025-${String(m).padStart(2, '0')}`, 100)
    return idx
}

describe('Fase 2G — reexpresión: sin doble conteo de partidas sin clasificar (EFE-004)', () => {
    it('directo reexpresado = indirecto reexpresado en la variación neta', () => {
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

    it('disposición de PPE con ganancia: reexpresado (coef=1) coincide con nominal', () => {
        const input: ReportingInput = {
            context: CTX,
            openingBalances: new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]),
            accounts: ACCOUNTS,
            entries: [{
                id: 'v1', entryNumber: 1, date: '2025-06-10', memo: 'venta PPE con ganancia',
                status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10',
                lines: [
                    { accountId: 'caja', debit: 30000, credit: 0 },
                    { accountId: 'ppe', debit: 0, credit: 20000 },
                    { accountId: 'ganancia', debit: 0, credit: 10000 },
                ],
            } as unknown as JournalEntry],
        }
        const statements = buildStatements(input)
        const nominal = buildCashFlows(input, statements)
        const restated = reexpressCashFlow(input, statements, flatIndexes())

        // Con coef=1, la moneda de cierre reproduce el nominal (EFE-001 también acá)
        expect(restated.direct.investing.amount).toBe(30000)
        expect(restated.direct.operating.amount).toBe(0)
        expect(restated.indirect.operating.amount).toBe(0)
        expect(restated.direct.investing.amount).toBe(nominal.direct.investing.amount)
        expect(restated.direct.operating.amount).toBe(nominal.direct.operating.amount)
        // sin blocker de igualdad directo=indirecto
        expect(restated.blockers).toEqual([])
    })
})
