/**
 * Fase 2K §5 — contexto de reporting multi-entidad.
 *
 * La consolidación necesita que dos entidades del MISMO grupo lleven libros
 * separados en la misma instalación y que el motor canónico produzca los
 * estados individuales de cada una. Este test verifica exactamente eso:
 *
 * - la empresa por defecto conserva su id de ejercicio histórico (compatibilidad);
 * - una entidad nueva tiene su propio ejercicio para el mismo año;
 * - los asientos de una entidad NO aparecen en los libros de la otra;
 * - el juego de estados de cada una sale del mismo motor, sin duplicarlo.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from '../accounting/helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import {
    DEFAULT_COMPANY_ID,
    createCompany,
    exerciseIdFor,
    exerciseIdForYear,
    getExerciseForCompanyYear,
    listCompanies,
} from '../../src/accounting/application/contextService'
import { loadStatementsForYear } from '../../src/reporting/loadStatements'
import { resolveContextForYear } from '../../src/accounting/reporting/reportingContext'

const SUB = 'company-controlada-test'

describe('Fase 2K — contexto de reporting por entidad', () => {
    beforeAll(async () => {
        await resetDb()
        await seedTestAccounts()
        await createCompany({ id: SUB, legalName: 'Controlada S.A.' })

        // Controladora (empresa por defecto)
        await postNewEntry({ date: '2022-01-05', memo: 'Aporte', lines: simpleLines('caja', 'capital', 1_000_000) })
        await postNewEntry({ date: '2022-03-01', memo: 'Venta', lines: simpleLines('deudores', 'ventas', 400_000) })

        // Controlada: mismos ids de cuenta (plan compartido), otra entidad
        await postNewEntry({ date: '2022-01-05', memo: 'Aporte', companyId: SUB, lines: simpleLines('caja', 'capital', 200_000) })
        await postNewEntry({ date: '2022-04-01', memo: 'Venta', companyId: SUB, lines: simpleLines('deudores', 'ventas', 150_000) })
    })

    it('la empresa por defecto conserva su id de ejercicio histórico', () => {
        expect(exerciseIdFor(DEFAULT_COMPANY_ID, 2022)).toBe(exerciseIdForYear(2022))
        expect(exerciseIdForYear(2022)).toBe('exercise-company-default-2022')
    })

    it('cada entidad tiene su propio ejercicio para el mismo año', async () => {
        const parent = await getExerciseForCompanyYear(DEFAULT_COMPANY_ID, 2022)
        const sub = await getExerciseForCompanyYear(SUB, 2022)
        expect(parent?.id).toBe('exercise-company-default-2022')
        expect(sub?.id).toBe(`exercise-${SUB}-2022`)
        expect(parent!.id).not.toBe(sub!.id)
        expect(sub!.companyId).toBe(SUB)
    })

    it('resolveContextForYear distingue la entidad', async () => {
        const ctx = await resolveContextForYear(2022, { companyId: SUB })
        expect(ctx.companyId).toBe(SUB)
        expect(ctx.exerciseId).toBe(`exercise-${SUB}-2022`)
        expect(ctx.periodStart).toBe('2022-01-01')
        expect(ctx.periodEnd).toBe('2022-12-31')
    })

    it('los libros no se mezclan: cada juego refleja sólo su entidad', async () => {
        const parent = await loadStatementsForYear(2022)
        const sub = await loadStatementsForYear(2022, { companyId: SUB })

        expect(parent.incomeStatement.sales.amount).toBe(400_000)
        expect(sub.incomeStatement.sales.amount).toBe(150_000)

        expect(parent.balanceSheet.totalAssets.amount).toBe(1_400_000)
        expect(sub.balanceSheet.totalAssets.amount).toBe(350_000)

        // La ecuación patrimonial cierra en AMBAS de manera independiente
        expect(parent.balanceSheet.equationDifference).toBe(0)
        expect(sub.balanceSheet.equationDifference).toBe(0)
    })

    it('el registro de entidades incluye la empresa por defecto primero', async () => {
        const companies = await listCompanies()
        expect(companies[0].id).toBe(DEFAULT_COMPANY_ID)
        expect(companies.map(c => c.id)).toContain(SUB)
    })
})
