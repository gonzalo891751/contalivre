/**
 * Cierre del PR #28 — El perfil sectorial pertenece a la EMPRESA.
 *
 * Deuda corregida: el perfil era global de la instalación. En una aplicación
 * multiempresa eso significa que activar "sin fines de lucro" en el club
 * cambiaba también la exposición de la empresa comercial y de la agropecuaria.
 *
 * Invariantes que se fijan acá:
 *  - cada empresa tiene su propio conjunto de perfiles;
 *  - cambiar el perfil de una NO altera el de las otras;
 *  - el vocabulario de exposición sigue a la empresa corriente;
 *  - el valor global histórico se migra sin perder datos y de forma idempotente;
 *  - las cuentas sectoriales se comparten: no se duplican por empresa.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../src/storage/db'
import { resetDb, seedTestAccounts } from './helpers'
import { DEFAULT_COMPANY_ID, SYSTEM_META_ID } from '../../src/accounting/migration/migrateV17'
import {
    activateSectorProfile,
    deactivateSectorProfile,
    getActiveProfiles,
    resolveCompanyId,
} from '../../src/storage/sectorProfiles'
import { vocabularyFor } from '../../src/core/sectorProfiles/types'

const COMERCIAL = DEFAULT_COMPANY_ID
const CLUB = 'company-club'
const CAMPO = 'company-campo'

async function createCompany(id: string, legalName: string) {
    await db.companies.put({
        id,
        legalName,
        currency: 'ARS',
        jurisdiction: 'AR',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        active: true,
    })
}

/** Cambia la empresa corriente, como hace la aplicación al seleccionarla. */
async function switchTo(companyId: string) {
    const meta = await db.systemMeta.get(SYSTEM_META_ID)
    await db.systemMeta.put({
        ...(meta ?? { id: SYSTEM_META_ID, appVersion: '0', schemaVersion: 22, installationId: 'test', createdAt: '2026-01-01T00:00:00Z' }),
        id: SYSTEM_META_ID,
        currentCompanyId: companyId,
    } as never)
}

describe('PR #28 — aislamiento del perfil entre empresas', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await createCompany(COMERCIAL, 'Comercial SA')
        await createCompany(CLUB, 'Club Social')
        await createCompany(CAMPO, 'Establecimiento El Campo')
    })

    it('cada empresa arranca con el núcleo comercial', async () => {
        for (const cid of [COMERCIAL, CLUB, CAMPO]) {
            expect(await getActiveProfiles(cid)).toEqual(['COMMERCIAL'])
        }
    })

    it('activar un perfil en una empresa no afecta a las demás', async () => {
        await activateSectorProfile('NONPROFIT', CLUB)

        expect(await getActiveProfiles(CLUB)).toContain('NONPROFIT')
        expect(await getActiveProfiles(COMERCIAL)).not.toContain('NONPROFIT')
        expect(await getActiveProfiles(CAMPO)).not.toContain('NONPROFIT')
    })

    it('tres empresas con tres perfiles distintos conviven sin contaminarse', async () => {
        await activateSectorProfile('NONPROFIT', CLUB)
        await activateSectorProfile('AGRICULTURAL', CAMPO)
        // La comercial se queda con el núcleo.

        expect(await getActiveProfiles(COMERCIAL)).toEqual(['COMMERCIAL'])
        expect(await getActiveProfiles(CLUB)).toEqual(expect.arrayContaining(['COMMERCIAL', 'NONPROFIT']))
        expect(await getActiveProfiles(CLUB)).not.toContain('AGRICULTURAL')
        expect(await getActiveProfiles(CAMPO)).toEqual(expect.arrayContaining(['COMMERCIAL', 'AGRICULTURAL']))
        expect(await getActiveProfiles(CAMPO)).not.toContain('NONPROFIT')
    })

    it('sólo la entidad sin fines de lucro expone Recursos y Gastos', async () => {
        await activateSectorProfile('NONPROFIT', CLUB)
        await activateSectorProfile('AGRICULTURAL', CAMPO)

        expect(vocabularyFor(await getActiveProfiles(CLUB)).incomeStatementTitle)
            .toBe('Estado de Recursos y Gastos')
        expect(vocabularyFor(await getActiveProfiles(COMERCIAL)).incomeStatementTitle)
            .toBe('Estado de Resultados')
        expect(vocabularyFor(await getActiveProfiles(CAMPO)).incomeStatementTitle)
            .toBe('Estado de Resultados')
    })

    it('desactivar en una empresa no desactiva en la otra', async () => {
        await activateSectorProfile('AGRICULTURAL', CLUB)
        await activateSectorProfile('AGRICULTURAL', CAMPO)

        await deactivateSectorProfile('AGRICULTURAL', CLUB)

        expect(await getActiveProfiles(CLUB)).not.toContain('AGRICULTURAL')
        expect(await getActiveProfiles(CAMPO)).toContain('AGRICULTURAL')
    })

    it('las cuentas sectoriales se comparten: no se duplican por empresa', async () => {
        const first = await activateSectorProfile('AGRICULTURAL', CLUB)
        expect(first.created.length).toBeGreaterThan(0)

        // La segunda empresa reutiliza el plan: no crea cuentas nuevas.
        const second = await activateSectorProfile('AGRICULTURAL', CAMPO)
        expect(second.created).toHaveLength(0)
        expect(second.alreadyPresent.length).toBe(first.created.length)

        const codes = (await db.accounts.toArray()).map(a => a.code)
        expect(new Set(codes).size).toBe(codes.length)
    })
})

describe('PR #28 — empresa corriente', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await createCompany(COMERCIAL, 'Comercial SA')
        await createCompany(CLUB, 'Club Social')
    })

    it('sin companyId explícito se usa la empresa corriente', async () => {
        await switchTo(CLUB)
        expect(await resolveCompanyId()).toBe(CLUB)

        await activateSectorProfile('NONPROFIT')

        expect(await getActiveProfiles()).toContain('NONPROFIT')
        expect(await getActiveProfiles(COMERCIAL)).not.toContain('NONPROFIT')
    })

    it('al cambiar de empresa cambia el perfil leído, sin tocar nada más', async () => {
        await activateSectorProfile('NONPROFIT', CLUB)

        await switchTo(CLUB)
        expect(vocabularyFor(await getActiveProfiles()).revenueLabel).toBe('Recursos')

        await switchTo(COMERCIAL)
        expect(vocabularyFor(await getActiveProfiles()).revenueLabel).toBe('Ingresos por ventas')
    })

    it('sin empresa corriente definida cae en la empresa por defecto', async () => {
        expect(await resolveCompanyId()).toBe(DEFAULT_COMPANY_ID)
    })
})

describe('PR #28 — migración del perfil global histórico', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await createCompany(COMERCIAL, 'Comercial SA')
        await createCompany(CLUB, 'Club Social')
    })

    /** Estado tal como lo dejaba la primera versión de la Fase 2H. */
    async function seedLegacyGlobalProfile(profiles: string[]) {
        await db.settings.put({
            id: 'sector-profiles',
            active: profiles,
            updatedAt: '2026-01-01T00:00:00Z',
        } as never)
    }

    it('el perfil global se adopta como perfil de la empresa, sin perder datos', async () => {
        await seedLegacyGlobalProfile(['COMMERCIAL', 'AGRICULTURAL'])

        expect(await getActiveProfiles(COMERCIAL)).toContain('AGRICULTURAL')

        // El campo histórico se conserva: la migración no destruye nada.
        const row = await db.settings.get('sector-profiles')
        expect((row as { active?: string[] }).active).toEqual(['COMMERCIAL', 'AGRICULTURAL'])
    })

    it('la migración es idempotente y no se re-aplica sobre un cambio posterior', async () => {
        await seedLegacyGlobalProfile(['COMMERCIAL', 'AGRICULTURAL'])

        // El usuario desactiva agro en esa empresa.
        await deactivateSectorProfile('AGRICULTURAL', COMERCIAL)
        expect(await getActiveProfiles(COMERCIAL)).not.toContain('AGRICULTURAL')

        // Leer de nuevo NO debe resucitar el valor global.
        expect(await getActiveProfiles(COMERCIAL)).not.toContain('AGRICULTURAL')
    })

    it('el valor global no se filtra a una empresa distinta de la migrada', async () => {
        await seedLegacyGlobalProfile(['COMMERCIAL', 'NONPROFIT'])

        // La primera empresa que lee adopta el global...
        expect(await getActiveProfiles(COMERCIAL)).toContain('NONPROFIT')
        // ...y se persiste, de modo que otra empresa ya no lo hereda.
        await activateSectorProfile('COMMERCIAL', COMERCIAL)
        expect(await getActiveProfiles(CLUB)).not.toContain('NONPROFIT')
    })
})
