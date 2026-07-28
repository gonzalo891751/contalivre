/**
 * Fase 2I §11 — defectos residuales del informe de auditoría.
 *
 * DEF-A21 · una fecha fuera de todo ejercicio ya no crea uno en silencio.
 * DEF-A22 · el redondeo a centavos queda registrado en el asiento.
 * DEF-A17 · un balance sin movimientos no afirma que "cuadra".
 * DEF-A11 · la ficha de la empresa es la fuente de su identidad contable.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, simpleLines } from './helpers'
import { detectRoundedAmounts, postNewEntry } from '../../src/accounting/application/journalService'
import { createExercise, getDefaultCompany, listExercises } from '../../src/accounting/application/contextService'
import { upsertCompanyProfile } from '../../src/storage/companyProfile'
import { computeTrialBalance, getBalanceStatusMessage } from '../../src/core/balance'
import { db } from '../../src/storage/db'

describe('DEF-A21 · el ejercicio no se crea por una fecha mal tipeada', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-03-01', memo: 'primera operación', lines: simpleLines('caja', 'capital', 1000) })
    })

    it('el primer asiento sí abre el ejercicio: es el nacimiento de la empresa', async () => {
        const exercises = await listExercises()
        expect(exercises).toHaveLength(1)
        expect(exercises[0].startDate).toBe('2025-01-01')
    })

    it('una fecha de otro año se rechaza nombrando los ejercicios que existen', async () => {
        await expect(postNewEntry({
            date: '2024-03-01', memo: 'año mal tipeado', lines: simpleLines('caja', 'ventas', 500),
        })).rejects.toThrow(/no pertenece a ningún ejercicio/)

        await expect(postNewEntry({
            date: '2024-03-01', memo: 'año mal tipeado', lines: simpleLines('caja', 'ventas', 500),
        })).rejects.toThrow(/Ejercicio 2025/)
    })

    it('el asiento rechazado no deja rastro en ningún libro', async () => {
        await postNewEntry({ date: '2024-03-01', memo: 'x', lines: simpleLines('caja', 'ventas', 500) }).catch(() => { })
        expect(await listExercises()).toHaveLength(1)
        expect(await db.entries.count()).toBe(1)
    })

    it('con el ejercicio creado a propósito, el mismo asiento se acepta', async () => {
        await createExercise({ year: 2024 })
        const posted = await postNewEntry({
            date: '2024-03-01', memo: 'ejercicio anterior', lines: simpleLines('caja', 'ventas', 500),
        })
        expect(posted.status).toBe('POSTED')
        expect((await listExercises()).map(e => e.name).sort()).toEqual(['Ejercicio 2024', 'Ejercicio 2025'])
    })

    it('quien abre un ejercicio a propósito puede declararlo en la contabilización', async () => {
        const posted = await postNewEntry({
            date: '2027-06-01', memo: 'carga de escenario', lines: simpleLines('caja', 'ventas', 100),
            allowExerciseProvisioning: true,
        })
        expect(posted.status).toBe('POSTED')
        expect((await listExercises()).some(e => e.name === 'Ejercicio 2027')).toBe(true)
    })
})

describe('DEF-A22 · el redondeo a centavos se declara', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('detecta qué importes van a cambiar', () => {
        const rounded = detectRoundedAmounts([
            { accountId: 'caja', debit: 100.005, credit: 0 },
            { accountId: 'ventas', debit: 0, credit: 100.005 },
        ])
        expect(rounded).toHaveLength(2)
        expect(rounded[0]).toMatchObject({ index: 0, field: 'debit', original: 100.005 })
        expect(rounded[0].rounded).not.toBe(100.005)
    })

    it('no reporta nada cuando los importes ya están en escala de centavos', () => {
        expect(detectRoundedAmounts([
            { accountId: 'caja', debit: 100.01, credit: 0 },
            { accountId: 'ventas', debit: 0, credit: 100.01 },
        ])).toHaveLength(0)
    })

    it('el asiento contabilizado deja constancia de lo que se ingresó', async () => {
        const posted = await postNewEntry({
            date: '2025-06-15', memo: 'con tres decimales',
            lines: [
                { accountId: 'caja', debit: 100.005, credit: 0 },
                { accountId: 'ventas', debit: 0, credit: 100.005 },
            ],
        })
        const registro = posted.metadata?.roundedAmounts as Array<Record<string, unknown>> | undefined
        expect(registro).toBeDefined()
        expect(registro).toHaveLength(2)
        expect(registro![0]).toMatchObject({ linea: 1, campo: 'Debe', ingresado: 100.005 })
        // Y los libros quedan en escala de centavos exacta
        expect(posted.lines[0].debit).toBe(100.01)
    })
})

describe('DEF-A17 · el balance vacío no afirma que cuadra', () => {
    it('sin movimientos invita a cargar el primer asiento', () => {
        const tb = computeTrialBalance(new Map(), [])
        expect(getBalanceStatusMessage(tb)).toMatch(/Todavía no hay movimientos/)
        expect(getBalanceStatusMessage(tb)).not.toMatch(/cuadra perfectamente/)
    })
})

describe('DEF-A11 · la ficha es la fuente de la identidad contable', () => {
    beforeEach(async () => { await resetDb() })

    it('guardar la ficha actualiza la empresa que leen los estados', async () => {
        const antes = await getDefaultCompany()
        expect(antes.legalName).toBe('Empresa ContaLivre')

        await upsertCompanyProfile({
            legalName: 'Purmamarca Comercial S.A. — Auditoría E2E',
            cuit: '30-71234567-4',
        })

        const despues = await db.companies.get(antes.id)
        expect(despues!.legalName).toBe('Purmamarca Comercial S.A. — Auditoría E2E')
        expect(despues!.taxId).toBe('30-71234567-4')
    })

    it('una ficha sin denominación no borra la identidad existente', async () => {
        await upsertCompanyProfile({ legalName: 'Empresa Real S.A.', cuit: '30-11111111-1' })
        await upsertCompanyProfile({ actividadPrincipal: 'Comercio' } as never)

        const company = await db.companies.toCollection().first()
        expect(company!.legalName).toBe('Empresa Real S.A.')
    })
})
