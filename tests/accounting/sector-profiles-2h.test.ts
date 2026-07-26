/**
 * Fase 2H §H2/§H3/§H4 — Perfiles sectoriales del plan de cuentas.
 *
 * Se verifica la arquitectura pedida: un núcleo común más extensiones
 * sectoriales aditivas, con activación determinística e idempotente que no
 * duplica cuentas, no pisa las del usuario y no borra nada al desactivar.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db, generateId } from '../../src/storage/db'
import { resetDb, seedTestAccounts } from './helpers'
import {
    activateSectorProfile,
    deactivateSectorProfile,
    getActiveProfiles,
    listSectorAccounts,
} from '../../src/storage/sectorProfiles'
import { SECTOR_CATALOG, ALL_SECTOR_ACCOUNTS } from '../../src/core/sectorProfiles/catalog'
import {
    ACTIVITY_PROFILES,
    resolveExposureProfile,
    vocabularyFor,
} from '../../src/core/sectorProfiles/types'

describe('Fase 2H §H2 — catálogo sectorial', () => {
    it('todos los códigos del catálogo son únicos', () => {
        const codes = ALL_SECTOR_ACCOUNTS.map(a => a.code)
        expect(new Set(codes).size).toBe(codes.length)
    })

    it('ninguna cuenta sectorial pisa un código del plan base', () => {
        // Guarda real contra el seed: durante la Fase 2H el código 4.5.20 tuvo
        // que moverse porque 4.5.10 ya era "Impuestos y tasas" en el núcleo y la
        // cuenta hija habría quedado colgada de un rubro ajeno.
        const seed = readFileSync(join(__dirname, '..', '..', 'src', 'storage', 'seed.ts'), 'utf-8')
        const seedCodes = new Set(
            [...seed.matchAll(/code:\s*'([\d.]+)'/g)].map(match => match[1])
        )
        expect(seedCodes.size).toBeGreaterThan(150)

        for (const account of ALL_SECTOR_ACCOUNTS) {
            expect(
                seedCodes.has(account.code),
                `${account.code} (${account.name}) colisiona con una cuenta del plan base`
            ).toBe(false)
        }
    })

    it('cada cuenta imputable declara los metadatos que la exponen', () => {
        for (const account of ALL_SECTOR_ACCOUNTS) {
            if (account.isHeader) continue
            expect(account.statementGroup, `${account.code} sin statementGroup`).toBeTruthy()
            expect(account.monetaryClassification, `${account.code} sin clasificación monetaria`).toBeTruthy()
        }
    })

    it('las regularizadoras tienen lado natural acreedor', () => {
        for (const account of ALL_SECTOR_ACCOUNTS.filter(a => a.isContra)) {
            expect(account.normalSide, `${account.code} regularizadora mal configurada`).toBe('CREDIT')
        }
    })

    it('los gastos sectoriales declaran su función para el anexo', () => {
        const expenses = ALL_SECTOR_ACCOUNTS.filter(
            a => a.kind === 'EXPENSE' && !a.isHeader && a.statementGroup !== 'COGS'
        )
        for (const account of expenses) {
            expect(account.resultFunction, `${account.code} sin función de gasto`).toBeTruthy()
        }
    })
})

describe('Fase 2H §H2 — activación idempotente', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
    })

    it('activar un perfil incorpora sus cuentas', async () => {
        const result = await activateSectorProfile('AGRICULTURAL')

        expect(result.created.length).toBe(SECTOR_CATALOG.AGRICULTURAL.length)
        const codes = (await db.accounts.toArray()).map(a => a.code)
        expect(codes).toContain('1.1.07.01')
        expect(codes).toContain('4.3.06')
    })

    it('activar dos veces NO duplica cuentas', async () => {
        await activateSectorProfile('AGRICULTURAL')
        const afterFirst = await db.accounts.count()

        const second = await activateSectorProfile('AGRICULTURAL')

        expect(second.created).toHaveLength(0)
        expect(second.alreadyPresent.length).toBe(SECTOR_CATALOG.AGRICULTURAL.length)
        expect(await db.accounts.count()).toBe(afterFirst)

        // Ningún código repetido en todo el plan.
        const codes = (await db.accounts.toArray()).map(a => a.code)
        expect(new Set(codes).size).toBe(codes.length)
    })

    it('es determinística: el mismo perfil produce el mismo conjunto de códigos', async () => {
        await activateSectorProfile('NONPROFIT')
        const first = (await listSectorAccounts('NONPROFIT')).map(a => a.code).sort()

        await resetDb()
        await seedTestAccounts()
        await activateSectorProfile('NONPROFIT')
        const second = (await listSectorAccounts('NONPROFIT')).map(a => a.code).sort()

        expect(second).toEqual(first)
    })

    it('preserva las cuentas creadas por el usuario', async () => {
        const custom = {
            id: generateId(),
            code: '9.9.99',
            name: 'Cuenta propia del usuario',
            kind: 'ASSET' as const,
            section: 'CURRENT' as const,
            group: 'Propia',
            statementGroup: null,
            parentId: null,
            level: 2,
            normalSide: 'DEBIT' as const,
            isContra: false,
            isHeader: false,
        }
        await db.accounts.add(custom)

        await activateSectorProfile('AGRICULTURAL')
        await activateSectorProfile('NONPROFIT')

        const stillThere = await db.accounts.get(custom.id)
        expect(stillThere).toBeDefined()
        expect(stillThere?.name).toBe('Cuenta propia del usuario')
    })

    it('reutiliza una cuenta preexistente con el mismo código en vez de duplicarla', async () => {
        // El usuario ya tiene su propia "1.1.07.01" con otro nombre.
        await db.accounts.add({
            id: generateId(),
            code: '1.1.07.01',
            name: 'Mi propia cuenta de hacienda',
            kind: 'ASSET',
            section: 'CURRENT',
            group: 'Propia',
            statementGroup: 'INVENTORIES',
            parentId: null,
            level: 3,
            normalSide: 'DEBIT',
            isContra: false,
            isHeader: false,
        })

        const result = await activateSectorProfile('AGRICULTURAL')

        expect(result.alreadyPresent).toContain('1.1.07.01')
        const matches = (await db.accounts.toArray()).filter(a => a.code === '1.1.07.01')
        expect(matches).toHaveLength(1)
        // No se pisó el nombre elegido por el usuario.
        expect(matches[0].name).toBe('Mi propia cuenta de hacienda')
    })

    it('enlaza cada cuenta con su padre por código', async () => {
        await activateSectorProfile('AGRICULTURAL')
        const accounts = await db.accounts.toArray()
        const parent = accounts.find(a => a.code === '1.1.07')!
        const child = accounts.find(a => a.code === '1.1.07.01')!

        expect(child.parentId).toBe(parent.id)
    })

    it('desactivar NO borra cuentas', async () => {
        await activateSectorProfile('AGRICULTURAL')
        const before = await db.accounts.count()

        await deactivateSectorProfile('AGRICULTURAL')

        expect(await db.accounts.count()).toBe(before)
        expect(await getActiveProfiles()).not.toContain('AGRICULTURAL')
        // Las cuentas siguen disponibles para consultar ejercicios anteriores.
        expect((await listSectorAccounts('AGRICULTURAL')).length).toBeGreaterThan(0)
    })

    it('el núcleo comercial nunca se puede desactivar', async () => {
        await deactivateSectorProfile('COMMERCIAL')
        expect(await getActiveProfiles()).toContain('COMMERCIAL')
    })

    it('varios perfiles conviven en el mismo plan', async () => {
        await activateSectorProfile('AGRICULTURAL')
        await activateSectorProfile('INDUSTRIAL')

        const active = await getActiveProfiles()
        expect(active).toContain('AGRICULTURAL')
        expect(active).toContain('INDUSTRIAL')

        const codes = (await db.accounts.toArray()).map(a => a.code)
        expect(codes).toContain('1.1.07.01') // agro
        expect(codes).toContain('1.1.10.01') // industria
        expect(new Set(codes).size).toBe(codes.length)
    })

    it('las cuentas sectoriales quedan marcadas y protegidas', async () => {
        await activateSectorProfile('NONPROFIT')
        const cuota = (await db.accounts.toArray()).find(a => a.code === '4.1.10.01')!

        expect(cuota.sectorProfile).toBe('NONPROFIT')
        expect(cuota.systemAccount).toBe(true)
        expect(cuota.tags).toContain('sector:NONPROFIT')
    })
})

describe('Fase 2H §H4 — vocabulario de exposición', () => {
    it('una entidad sin fines de lucro no expone "ventas" ni "ganancia"', () => {
        const vocabulary = vocabularyFor(['COMMERCIAL', 'NONPROFIT'])

        expect(vocabulary.incomeStatementTitle).toBe('Estado de Recursos y Gastos')
        expect(vocabulary.revenueLabel).toBe('Recursos')
        expect(vocabulary.positiveResultLabel).toBe('Superávit del ejercicio')
        expect(vocabulary.negativeResultLabel).toBe('Déficit del ejercicio')
        expect(vocabulary.ownersLabel).toBe('Asociados')
    })

    it('el resto de los perfiles conserva el vocabulario comercial', () => {
        for (const profile of ACTIVITY_PROFILES.filter(p => p !== 'NONPROFIT')) {
            const vocabulary = vocabularyFor([profile])
            expect(vocabulary.incomeStatementTitle).toBe('Estado de Resultados')
            expect(vocabulary.resultLabel).toBe('Resultado del ejercicio')
        }
    })

    it('sin fines de lucro manda sobre los demás perfiles activos', () => {
        expect(resolveExposureProfile(['COMMERCIAL', 'AGRICULTURAL', 'NONPROFIT'])).toBe('NONPROFIT')
        expect(resolveExposureProfile(['COMMERCIAL', 'AGRICULTURAL'])).toBe('AGRICULTURAL')
        expect(resolveExposureProfile(['COMMERCIAL'])).toBe('COMMERCIAL')
    })
})
