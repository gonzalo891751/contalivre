/**
 * Fase 2C — Asistente de mapeos (§11) y escenarios educativos (§14).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, makeAccount, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import {
    buildMappingReport,
    describeImpact,
    saveMapping,
    proposeMapping,
} from '../../src/accounting/taxonomy/mappingAssistant'
import { getScenarioDefinitions, runScenario, resetScenario, SCENARIO_YEARS } from '../../src/accounting/scenarios/scenarios'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { db } from '../../src/storage/db'
import type { Account } from '../../src/core/models'

describe('Fase 2C — asistente de mapeos', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('detecta cuenta con saldo y sin grupo de exposición como incompleta y bloqueante', async () => {
        await db.accounts.add(makeAccount({ id: 'sin-grupo', code: '1.1.09.01', name: 'Activo sin mapping', kind: 'ASSET', statementGroup: null }))
        await postNewEntry({ date: '2025-03-01', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        await postNewEntry({ date: '2025-04-01', memo: 'mov', lines: simpleLines('sin-grupo', 'caja', 300) })

        const report = await buildMappingReport()
        const problem = report.incomplete.find(s => s.account.id === 'sin-grupo')!
        expect(problem).toBeDefined()
        expect(problem.issues).toContain('BALANCE_NO_STATEMENT_GROUP')
        expect(report.blockingCount).toBeGreaterThanOrEqual(1)
    })

    it('describeImpact explica el efecto antes de guardar', () => {
        const acc = makeAccount({ id: 'x', code: '1.1.09.02', name: 'Otros activos', kind: 'ASSET', statementGroup: null })
        const impact = describeImpact(acc, { statementGroup: 'INVENTORIES', monetaryClassification: 'NON_MONETARY' })
        expect(impact.changes).toHaveLength(2)
        expect(impact.descriptions.join(' ')).toContain('rubro INVENTORIES')
        expect(impact.descriptions.join(' ')).toContain('NON_MONETARY')
    })

    it('saveMapping persiste el cambio, sube metadataVersion y audita', async () => {
        await db.accounts.add(makeAccount({ id: 'y', code: '1.1.09.03', name: 'Cuenta X', kind: 'ASSET', statementGroup: null }))
        const before = (await db.accounts.get('y'))!
        const updated = await saveMapping('y', { statementGroup: 'INVENTORIES' }, { reason: 'test' })
        expect(updated.statementGroup).toBe('INVENTORIES')
        expect(updated.metadataVersion).toBe((before.metadataVersion ?? 0) + 1)

        const audits = await db.auditLog.where('entityId').equals('y').toArray()
        expect(audits.some(a => (a.metadata as { kind?: string })?.kind === 'account-mapping')).toBe(true)
    })

    it('proposeMapping solo sugiere, nunca decide MIXED/NOT_APPLICABLE', () => {
        const inv = makeAccount({ id: 'inv', code: '1.2.03.01', name: 'Inversión', kind: 'ASSET', statementGroup: 'INVESTMENTS' })
        const proposal = proposeMapping(inv)
        // INVESTMENTS deriva a MIXED ⇒ no se propone monetaryClassification
        expect(proposal.monetaryClassification).toBeUndefined()
        expect(proposal.accountClass).toBe('ASSET')
    })

    it('no bloquea cuando todas las cuentas con saldo tienen mapping', async () => {
        await postNewEntry({ date: '2025-03-01', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000) })
        const report = await buildMappingReport()
        expect(report.blockingCount).toBe(0)
    })
})

/** Inserta las cuentas del plan seed que usan los escenarios */
async function seedScenarioAccounts() {
    const defs: Array<[string, string, Account['kind'], Account['statementGroup'], Partial<Account>]> = [
        ['1.1.01.01', 'Caja', 'ASSET', 'CASH_AND_BANKS', {}],
        ['1.1.01.02', 'Banco', 'ASSET', 'CASH_AND_BANKS', {}],
        ['1.1.02.01', 'Deudores por ventas', 'ASSET', 'TRADE_RECEIVABLES', {}],
        ['1.1.04.01', 'Mercaderías', 'ASSET', 'INVENTORIES', {}],
        ['1.2.01.04', 'Rodados', 'ASSET', 'PPE', { section: 'NON_CURRENT' }],
        ['1.2.01.94', 'Amort. acum. Rodados', 'ASSET', 'PPE', { section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT' }],
        ['2.1.01.01', 'Proveedores', 'LIABILITY', 'TRADE_PAYABLES', {}],
        ['2.1.02.01', 'Sueldos a pagar', 'LIABILITY', 'PAYROLL_LIABILITIES', {}],
        ['2.1.05.02', 'Préstamos bancarios', 'LIABILITY', 'LOANS', {}],
        ['3.1.01', 'Capital social', 'EQUITY', 'CAPITAL', {}],
        ['3.2.01', 'Resultado del ejercicio', 'EQUITY', 'RETAINED_EARNINGS', {}],
        ['3.2.02', 'Resultados no asignados', 'EQUITY', 'RETAINED_EARNINGS', {}],
        ['4.1.01', 'Ventas', 'INCOME', 'SALES', { section: 'OPERATING' }],
        ['4.2.01', 'CMV', 'EXPENSE', 'COGS', { section: 'COST' }],
        ['4.3.01', 'Gastos de administración', 'EXPENSE', 'ADMIN_EXPENSES', { section: 'ADMIN' }],
        ['4.4.01', 'Intereses', 'EXPENSE', 'FINANCIAL_EXPENSES', { section: 'FINANCIAL' }],
    ]
    await db.accounts.bulkAdd(defs.map(([code, name, kind, sg, extra]) =>
        makeAccount({ id: code, code, name, kind, statementGroup: sg, ...extra })))
}

describe('Fase 2C — escenarios educativos', () => {
    beforeEach(async () => {
        await resetDb()
        await seedScenarioAccounts()
    })

    it('el escenario comercial se contabiliza en su ejercicio demo y produce estados válidos', async () => {
        const defs = await getScenarioDefinitions()
        const comercial = defs.find(d => d.id === 'comercial')!
        const result = await runScenario(comercial)
        expect(result.missingAccounts).toEqual([])
        expect(result.postedSteps).toBe(11)

        const bundle = await loadStatementsForYear(SCENARIO_YEARS.comercial)
        // Con cierre al final, el resultado quedó refundido; el patrimonio incorpora el resultado
        expect(bundle.balanceSheet.equationDifference).toBe(0)
        expect(bundle.validation.canPublish).toBe(true)
    })

    it('los escenarios están aislados: no contaminan un ejercicio real', async () => {
        const defs = await getScenarioDefinitions()
        await runScenario(defs.find(d => d.id === 'comercial')!)
        // Ejercicio real 2025 permanece vacío
        const real = await loadStatementsForYear(2025)
        expect(real.balanceSheet.totalAssets.amount).toBe(0)
    })

    it('restablecer un escenario borra sus asientos demo', async () => {
        const defs = await getScenarioDefinitions()
        const inflacion = defs.find(d => d.id === 'inflacion')!
        await runScenario(inflacion)
        const before = await db.entries.where('date').between('9003-01-01', '9003-12-31', true, true).count()
        expect(before).toBeGreaterThan(0)

        const { deleted } = await resetScenario(inflacion)
        expect(deleted).toBe(before)
        const after = await db.entries.where('date').between('9003-01-01', '9003-12-31', true, true).count()
        expect(after).toBe(0)
    })

    it('reset rechaza años que no son demo', async () => {
        const { resetJournalRangeForScenario } = await import('../../src/accounting/scenarios/scenarioReset')
        await expect(resetJournalRangeForScenario(2025, 'comercial')).rejects.toThrow(/demo/)
    })
})
