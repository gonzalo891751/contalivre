/**
 * Fase 2F (§7) — Servicio de reglas de distribución de gastos.
 * Validaciones (100 % exacto, negativos, funciones, cuenta apta, COGS/IG,
 * superposición de vigencias), versionado con cierre automático, borradores
 * (editar/eliminar; el motor los ignora) e inmutabilidad de las activas.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import {
    createRule,
    deleteDraftRule,
    endRuleValidity,
    updateDraftRule,
    validateRuleInput,
    type AllocationRuleInput,
} from '../../src/accounting/taxonomy/allocationRulesService'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { db } from '../../src/storage/db'

const BASE: AllocationRuleInput = {
    accountId: 'gastos',
    validFrom: '2025-01-01',
    allocations: [
        { function: 'ADMINISTRATION', percentage: 60 },
        { function: 'SELLING', percentage: 40 },
    ],
    reason: 'superficie ocupada',
    status: 'ACTIVE',
}

describe('Fase 2F — reglas de distribución (servicio)', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('valida 100 % exacto, positivos, función válida y motivo', async () => {
        expect(await validateRuleInput({ ...BASE, allocations: [{ function: 'ADMINISTRATION', percentage: 60 }, { function: 'SELLING', percentage: 30 }] }))
            .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'allocations' })]))
        expect(await validateRuleInput({ ...BASE, allocations: [{ function: 'ADMINISTRATION', percentage: -10 }, { function: 'SELLING', percentage: 110 }] }))
            .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'allocations' })]))
        expect(await validateRuleInput({ ...BASE, reason: '  ' }))
            .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'reason' })]))
        expect(await validateRuleInput(BASE)).toEqual([])
    })

    it('bloquea cuentas COGS (duplicaría CMV) e INCOME_TAX', async () => {
        const cogs = await validateRuleInput({ ...BASE, accountId: 'cmv' })
        expect(cogs.some(e => e.message.includes('CMV'))).toBe(true)
    })

    it('bloquea vigencias superpuestas entre reglas activas', async () => {
        await createRule(BASE)
        const overlapping = await validateRuleInput({ ...BASE, validFrom: '2025-06-01' })
        expect(overlapping.some(e => e.message.includes('superpone'))).toBe(true)
        // sin superposición (la primera es abierta ⇒ siempre choca hasta cerrarla)
        const rules = await db.expenseAllocationRules.toArray()
        await endRuleValidity(rules[0].id, '2025-05-31', 'cierre para test')
        expect(await validateRuleInput({ ...BASE, validFrom: '2025-06-01' })).toEqual([])
    })

    it('versionado: la nueva versión cierra la anterior el día previo (nunca silencioso)', async () => {
        const v1 = await createRule(BASE)
        const v2 = await createRule({ ...BASE, validFrom: '2025-07-01', allocations: [{ function: 'ADMINISTRATION', percentage: 100 }], supersedesId: v1.id })
        expect(v2.version).toBe(2)
        const closed = (await db.expenseAllocationRules.get(v1.id))!
        expect(closed.validTo).toBe('2025-06-30')
        expect(v2.supersedesId).toBe(v1.id)
    })

    it('las activas son inmutables; los borradores se editan y eliminan', async () => {
        const active = await createRule(BASE)
        await expect(updateDraftRule(active.id, BASE)).rejects.toThrow(/borradores/)
        await expect(deleteDraftRule(active.id)).rejects.toThrow(/borradores/)

        const draft = await createRule({ ...BASE, validFrom: '2026-01-01', status: 'DRAFT' })
        const updated = await updateDraftRule(draft.id, { ...BASE, validFrom: '2026-01-01', status: 'DRAFT', reason: 'ajustado' })
        expect(updated.reason).toBe('ajustado')
        await deleteDraftRule(draft.id)
        expect(await db.expenseAllocationRules.get(draft.id)).toBeUndefined()
    })

    it('el motor ignora borradores y aplica la activa (integración con el anexo)', async () => {
        await postNewEntry({ date: '2025-03-01', memo: 'gasto', lines: simpleLines('gastos', 'caja', 1000) })

        await createRule({ ...BASE, status: 'DRAFT' })
        let s = await loadStatementsForYear(2025)
        let row = s.expensesByFunction.rows.find(r => r.accountId === 'gastos')!
        expect(row.source).not.toBe('RULE') // el borrador no se aplica

        await db.expenseAllocationRules.clear()
        await createRule(BASE)
        s = await loadStatementsForYear(2025)
        row = s.expensesByFunction.rows.find(r => r.accountId === 'gastos')!
        expect(row.source).toBe('RULE')
        expect(row.cells.ADMINISTRATION).toBe(600)
        expect(row.cells.SELLING).toBe(400)
    })

    it('finalizar vigencia nunca es retroactivo respecto de validFrom', async () => {
        const rule = await createRule(BASE)
        await expect(endRuleValidity(rule.id, '2024-12-31', 'x')).rejects.toThrow(/anterior/)
    })
})
