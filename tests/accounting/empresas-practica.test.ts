/**
 * Empresas de práctica: registro, cambio de empresa (con sus preferencias)
 * y casos de ejemplo cargados con el circuito contable real.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers'
import { db } from '../../src/storage/db'
import { loadSeedDataIfNeeded } from '../../src/storage/seed'
import {
    activateWorkspace, createWorkspace, deleteWorkspace, getActiveWorkspace, listWorkspaces, updateWorkspace,
    DEFAULT_DB_NAME, DEFAULT_WORKSPACE_ID,
} from '../../src/storage/workspaces'
import { getDefaultCompany } from '../../src/accounting/application/contextService'
import { loadPracticeCase, PRACTICE_SECOND_YEAR } from '../../src/accounting/fixtures/practiceCases'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { resetApplication } from '../../src/accounting/maintenance/resetService'

describe('Empresas de práctica — registro y cambio de empresa', () => {
    beforeEach(() => localStorage.clear())

    it('siempre existe la empresa principal sobre la base histórica', () => {
        const list = listWorkspaces()
        expect(list[0].id).toBe(DEFAULT_WORKSPACE_ID)
        expect(list[0].dbName).toBe(DEFAULT_DB_NAME)
        expect(getActiveWorkspace().id).toBe(DEFAULT_WORKSPACE_ID)
    })

    it('crea empresas con base propia y nombre único', () => {
        const club = createWorkspace({ name: 'Club Ribera', entityKind: 'SIN_FINES_DE_LUCRO', start: 'EJEMPLO' })
        expect(club.dbName).not.toBe(DEFAULT_DB_NAME)
        expect(club.initializedAt).toBeUndefined()
        expect(() => createWorkspace({ name: 'club ribera', entityKind: 'CON_FINES_DE_LUCRO', start: 'VACIA' })).toThrow(/Ya existe/)
        expect(updateWorkspace(club.id, { name: 'Club Atlético Ribera' }).name).toBe('Club Atlético Ribera')
    })

    it('al cambiar de empresa guarda y restaura las preferencias de cada una', () => {
        const otra = createWorkspace({ name: 'Otra S.A.', entityKind: 'CON_FINES_DE_LUCRO', start: 'VACIA' })
        localStorage.setItem('contalivre_period_year', '{"year":2024}')
        localStorage.setItem('contalivre.sidebar.collapsed', 'true')

        activateWorkspace(otra.id)
        expect(getActiveWorkspace().id).toBe(otra.id)
        expect(localStorage.getItem('contalivre_period_year')).toBeNull()      // preferencia de la empresa
        expect(localStorage.getItem('contalivre.sidebar.collapsed')).toBe('true') // preferencia del navegador
        localStorage.setItem('contalivre_period_year', '{"year":2026}')

        activateWorkspace(DEFAULT_WORKSPACE_ID)
        expect(localStorage.getItem('contalivre_period_year')).toBe('{"year":2024}')
        activateWorkspace(otra.id)
        expect(localStorage.getItem('contalivre_period_year')).toBe('{"year":2026}')
    })

    it('no se puede borrar la empresa abierta; las demás sí', async () => {
        const otra = createWorkspace({ name: 'Para borrar', entityKind: 'CON_FINES_DE_LUCRO', start: 'VACIA' })
        await expect(deleteWorkspace(DEFAULT_WORKSPACE_ID)).rejects.toThrow(/abierta/)
        await deleteWorkspace(otra.id)
        expect(listWorkspaces().some(w => w.id === otra.id)).toBe(false)
    })

    it('el reseteo total vacía la empresa abierta pero no el registro de empresas', async () => {
        await resetDb()
        const otra = createWorkspace({ name: 'Sobrevive', entityKind: 'CON_FINES_DE_LUCRO', start: 'VACIA' })
        await resetApplication('test')
        expect(listWorkspaces().some(w => w.id === otra.id)).toBe(true)
    })
})

describe('Casos de práctica', () => {
    it('comercial: dos ejercicios, el primero cerrado; palanca favorable en 2024 y desfavorable en 2025', async () => {
        await resetDb()
        await loadSeedDataIfNeeded()
        await loadPracticeCase('COMERCIAL')

        const b = await loadReportingBundle(PRACTICE_SECOND_YEAR, { withComparative: true })
        expect(b.metadata.hasComparative).toBe(true)
        expect(b.statements.balanceSheet.equationDifference).toBe(0)
        expect(b.statements.openingSource).toBe('OPENING_ENTRY')
        expect(b.statements.incomeStatement.netIncome.amount).toBe(135850)
        expect(b.comparativeStatements!.incomeStatement.netIncome.amount).toBe(718900)

        const palanca = b.metrics.find(m => m.id === 'efecto-palanca')!
        expect(palanca.result.status).toBe('CALCULATED')
        if (palanca.result.status !== 'CALCULATED' || palanca.previous?.status !== 'CALCULATED') throw new Error('sin palanca')
        expect(palanca.result.value).toBeLessThan(1)
        expect(palanca.previous.value).toBeGreaterThan(1)

        const cobranza = b.metrics.find(m => m.id === 'dias-cobranza')!
        if (cobranza.result.status !== 'CALCULATED' || cobranza.previous?.status !== 'CALCULATED') throw new Error('sin plazos')
        expect(cobranza.result.value).toBeGreaterThan(cobranza.previous.value)
    })

    it('sin fines de lucro: estado de recursos y gastos, superávit y cierre con su cuenta', async () => {
        await resetDb()
        await loadSeedDataIfNeeded('ESFL')
        const company = await getDefaultCompany()
        await db.companies.put({ ...company, legalName: 'Club Ribera', taxId: '30-00000000-0', entityKind: 'SIN_FINES_DE_LUCRO' })
        await loadPracticeCase('SIN_FINES_DE_LUCRO')

        const b = await loadReportingBundle(PRACTICE_SECOND_YEAR, { withComparative: true })
        const er = b.statements.incomeStatement
        expect(er.sales.label).toBe('Recursos ordinarios')
        expect(er.sellingExpenses.label).toBe('Gastos específicos de sectores')
        expect(er.netIncome.label).toBe('Superávit (déficit) del ejercicio')
        expect(er.netIncome.amount).toBe(1130000)
        expect(b.comparativeStatements!.incomeStatement.netIncome.amount).toBe(2280000)
        expect(b.metadata.entityKind).toBe('SIN_FINES_DE_LUCRO')

        // la refundición usó "Superávit (déficit) del ejercicio" y el cierre lo
        // transfirió a "Superávits no asignados"
        const accounts = await db.accounts.toArray()
        expect(accounts.find(a => a.code === '3.3.02')!.name).toBe('Superávit (déficit) del ejercicio')
        const noAsignados = accounts.find(a => a.code === '3.3.01')!
        expect(noAsignados.name).toBe('Superávits no asignados')
        const row = b.statements.trialBalance.rows.find(r => r.accountId === noAsignados.id)
        expect(row?.closing).toBe(-2280000)

        expect(b.metrics.find(m => m.id === 'roe')!.result.status).toBe('NOT_APPLICABLE')
        expect(b.metrics.find(m => m.id === 'autosuficiencia')!.result.status).toBe('CALCULATED')
        // las cuotas a cobrar no son créditos por ventas: no hay plazo de cobranza que medir (y no se muestra un 0 engañoso)
        expect(b.metrics.find(m => m.id === 'dias-cobranza')!.result.status).toBe('NOT_APPLICABLE')
        expect(b.metrics.find(m => m.id === 'ciclo-conversion')!.result.status).toBe('NOT_APPLICABLE')
    })
})
