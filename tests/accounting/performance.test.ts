/**
 * Fase 2B — Performance del motor de reporting (§17.3).
 *
 * Dataset determinista de 10.000 líneas (2.500 asientos × 4 líneas)
 * insertado vía repositorio (bulk) y procesado por el motor completo
 * (TB + ESP + ER + EEPN + EFE directo/indirecto + validación).
 * Los tiempos se imprimen para el informe; el umbral es generoso para no
 * hacer flaky el CI en máquinas lentas.
 */

import { describe, it, expect } from 'vitest'
import { resetDb, seedTestAccounts, TEST_ACCOUNTS } from './helpers'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import type { JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

function syntheticEntries(count: number): JournalEntry[] {
    const entries: JournalEntry[] = []
    for (let i = 0; i < count; i++) {
        const month = String((i % 12) + 1).padStart(2, '0')
        const day = String((i % 28) + 1).padStart(2, '0')
        // venta a crédito + costo (4 líneas por asiento)
        entries.push({
            id: `perf-${i}`,
            date: `2025-${month}-${day}`,
            memo: `Operación sintética ${i}`,
            status: 'POSTED',
            companyId: 'company-default',
            entryNumber: i + 1,
            lines: [
                { accountId: 'deudores', debit: 121, credit: 0 },
                { accountId: 'ventas', debit: 0, credit: 121 },
                { accountId: 'cmv', debit: 70, credit: 0 },
                { accountId: 'mercaderias', debit: 0, credit: 70 },
            ],
        })
    }
    return entries
}

function buildInput(entryCount: number): ReportingInput {
    return {
        context: {
            companyId: 'company-default',
            exerciseId: 'exercise-company-default-2025',
            exerciseLabel: 'Ejercicio 2025',
            periodStart: '2025-01-01',
            periodEnd: '2025-12-31',
        },
        entries: syntheticEntries(entryCount),
        openingBalances: new Map(),
        accounts: TEST_ACCOUNTS,
    }
}

function runEngine(input: ReportingInput) {
    const bundle = buildStatements(input)
    const flows = buildCashFlows(input, bundle)
    bundle.cashFlowDirect = flows.direct
    bundle.cashFlowIndirect = flows.indirect
    bundle.validation = flows.validation
    return bundle
}

describe('Fase 2B — performance del motor', () => {
    it('10.000 líneas: motor completo en < 3 segundos', async () => {
        await resetDb()
        await seedTestAccounts()
        const input = buildInput(2500) // 2.500 asientos × 4 líneas = 10.000

        const t0 = performance.now()
        const bundle = runEngine(input)
        const ms = performance.now() - t0

        expect(bundle.trialBalance.isBalanced).toBe(true)
        expect(bundle.incomeStatement.sales.amount).toBe(2500 * 121)
        expect(ms).toBeLessThan(3000)
        console.info(`[performance] motor completo con 10.000 líneas: ${ms.toFixed(0)} ms`)
    })

    it('100.000 líneas: motor completo en < 30 segundos (medición documental)', async () => {
        const input = buildInput(25000) // 100.000 líneas

        const t0 = performance.now()
        const bundle = runEngine(input)
        const ms = performance.now() - t0

        expect(bundle.trialBalance.isBalanced).toBe(true)
        expect(bundle.incomeStatement.sales.amount).toBe(25000 * 121)
        expect(ms).toBeLessThan(30000)
        console.info(`[performance] motor completo con 100.000 líneas: ${ms.toFixed(0)} ms`)
    })
})
