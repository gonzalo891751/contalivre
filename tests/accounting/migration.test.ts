/**
 * Fase 2A — Migración v16 → v17 (DAT-002).
 * Verifica que la migración preserva IDs y contenido económico, asigna
 * empresa/ejercicio/período/estado y es idempotente.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { migrateToV17, DEFAULT_COMPANY_ID } from '../../src/accounting/migration/migrateV17'

const TEST_DB_NAME = 'MigrationTestDb'

/** Base de prueba que replica el salto v16 → v17 */
function defineTestDb(): Dexie {
    const testDb = new Dexie(TEST_DB_NAME)
    testDb.version(16).stores({
        accounts: 'id, &code, name, kind, parentId, level, statementGroup',
        entries: 'id, date, memo, sourceModule, sourceId',
        settings: 'id',
        companyProfile: 'id',
    })
    testDb.version(17).stores({
        accounts: 'id, &code, name, kind, parentId, level, statementGroup, companyId',
        entries: 'id, date, memo, sourceModule, sourceId, status, companyId, exerciseId, periodId, idempotencyKey, entryNumber, [companyId+exerciseId]',
        settings: 'id',
        companyProfile: 'id',
        companies: 'id, active',
        exercises: 'id, companyId, startDate, endDate, status',
        periods: 'id, exerciseId, companyId, startDate, endDate, status',
        auditLog: 'id, eventType, entityType, entityId, companyId, exerciseId, timestamp',
        systemMeta: 'id',
    }).upgrade(migrateToV17)
    return testDb
}

/** Crea una base v16 con datos legacy y la cierra */
async function seedLegacyV16() {
    const legacy = new Dexie(TEST_DB_NAME)
    legacy.version(16).stores({
        accounts: 'id, &code, name, kind, parentId, level, statementGroup',
        entries: 'id, date, memo, sourceModule, sourceId',
        settings: 'id',
        companyProfile: 'id',
    })
    await legacy.open()
    await legacy.table('companyProfile').add({ id: 'default', legalName: 'Mi Empresa SRL', cuit: '30-11111111-1' })
    await legacy.table('accounts').bulkAdd([
        { id: 'caja', code: '1.1.01.01', name: 'Caja', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentId: null, level: 3, normalSide: 'DEBIT', isContra: false, isHeader: false },
        { id: 'merc', code: '1.1.04.01', name: 'Mercaderías', kind: 'ASSET', section: 'CURRENT', group: 'Bienes de cambio', statementGroup: 'INVENTORIES', parentId: null, level: 3, normalSide: 'DEBIT', isContra: false, isHeader: false },
        { id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentId: null, level: 2, normalSide: 'CREDIT', isContra: false, isHeader: false },
    ])
    await legacy.table('entries').bulkAdd([
        { id: 'e1', date: '2025-03-01', memo: 'aporte', lines: [{ accountId: 'caja', debit: 100, credit: 0 }, { accountId: 'capital', debit: 0, credit: 100 }], createdAt: '2025-03-01T10:00:00Z' },
        { id: 'e2', date: '2026-02-01', memo: 'compra', lines: [{ accountId: 'merc', debit: 50, credit: 0 }, { accountId: 'caja', debit: 0, credit: 50 }], createdAt: '2026-02-01T10:00:00Z' },
        { id: 'e3', date: 'fecha-rota', memo: 'corrupto', lines: [{ accountId: 'caja', debit: 1, credit: 0 }, { accountId: 'capital', debit: 0, credit: 1 }] },
    ])
    legacy.close()
}

describe('Fase 2A — migración v16 → v17', () => {
    beforeEach(async () => {
        await Dexie.delete(TEST_DB_NAME)
        await seedLegacyV16()
    })

    it('preserva IDs y contenido económico, y asigna contexto', async () => {
        const v17 = defineTestDb()
        await v17.open()

        const entries = await v17.table('entries').toArray()
        expect(entries.map((e: { id: string }) => e.id).sort()).toEqual(['e1', 'e2', 'e3'])

        const e1 = entries.find((e: { id: string }) => e.id === 'e1')
        expect(e1.lines).toEqual([{ accountId: 'caja', debit: 100, credit: 0 }, { accountId: 'capital', debit: 0, credit: 100 }])
        expect(e1.status).toBe('POSTED')
        expect(e1.companyId).toBe(DEFAULT_COMPANY_ID)
        expect(e1.exerciseId).toContain('2025')
        expect(e1.periodId).toContain('2025')
        expect(e1.entryNumber).toBe(1)
        expect(e1.postedBy).toBe('legacy-migration')
        expect(e1.metadata.migratedFromLegacy).toBe(true)

        const e2 = entries.find((e: { id: string }) => e.id === 'e2')
        expect(e2.exerciseId).toContain('2026')

        v17.close()
    })

    it('crea empresa por defecto desde companyProfile y ejercicios por año', async () => {
        const v17 = defineTestDb()
        await v17.open()

        const company = await v17.table('companies').get(DEFAULT_COMPANY_ID)
        expect(company.legalName).toBe('Mi Empresa SRL')
        expect(company.taxId).toBe('30-11111111-1')

        const exercises = await v17.table('exercises').toArray()
        expect(exercises.map((e: { name: string }) => e.name).sort()).toEqual(['Ejercicio 2025', 'Ejercicio 2026'])
        expect(exercises.every((e: { status: string }) => e.status === 'OPEN')).toBe(true)

        const periods = await v17.table('periods').toArray()
        expect(periods).toHaveLength(2)

        v17.close()
    })

    it('no inventa fechas: el asiento con fecha inválida va al reporte de excepciones', async () => {
        const v17 = defineTestDb()
        await v17.open()

        const e3 = await v17.table('entries').get('e3')
        expect(e3).toBeDefined() // no se descarta
        expect(e3.exerciseId).toBeUndefined()
        expect(e3.metadata.needsReview).toBe(true)

        const meta = await v17.table('systemMeta').get('system')
        expect(meta.migrationExceptions).toHaveLength(1)
        expect(meta.migrationExceptions[0].entryId).toBe('e3')

        v17.close()
    })

    it('materializa la taxonomía de cuentas (Mercaderías NO monetaria)', async () => {
        const v17 = defineTestDb()
        await v17.open()

        const merc = await v17.table('accounts').get('merc')
        expect(merc.monetaryClassification).toBe('NON_MONETARY')
        expect(merc.accountClass).toBe('ASSET')
        const caja = await v17.table('accounts').get('caja')
        expect(caja.monetaryClassification).toBe('MONETARY')

        v17.close()
    })

    it('deja metadata de migración y evento de auditoría', async () => {
        const v17 = defineTestDb()
        await v17.open()

        const meta = await v17.table('systemMeta').get('system')
        expect(meta.schemaVersion).toBe(17)
        expect(meta.lastMigrationId).toBe('v17-fase2a-nucleo-contable')
        expect(meta.installationId).toBeTruthy()

        const audits = await v17.table('auditLog').where('eventType').equals('MIGRATION_EXECUTED').toArray()
        expect(audits).toHaveLength(1)

        v17.close()
    })
})
