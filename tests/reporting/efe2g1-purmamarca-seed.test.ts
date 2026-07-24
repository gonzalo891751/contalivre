/**
 * Fase 2G.1 — HITO 5: seed del caso Purmamarca para QA manual (§6).
 *
 * Verifica que el seed usa los servicios normales, reproduce EXACTAMENTE los
 * importes esperados del EFE, es idempotente, tiene reset acotado al caso y una
 * guardia que impide cargarlo sobre datos ajenos.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { db } from '../../src/storage/db'
import { postOperation } from '../../src/accounting/application/journalService'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import {
    loadPurmamarcaDemo, resetPurmamarcaDemo, isPurmamarcaLoaded, isSafeToLoadPurmamarca,
    PURMAMARCA_EXPECTED, PURMAMARCA_YEAR, PURMAMARCA_ACCOUNTS, PURMAMARCA_COMPANY_NAME,
} from '../../src/accounting/fixtures/purmamarcaDemo'

describe('Fase 2G.1 — caso Purmamarca (seed de QA)', () => {
    beforeEach(async () => { await resetDb() })

    it('reproduce EXACTAMENTE los importes esperados del EFE (ejercicio 2022)', async () => {
        const res = await loadPurmamarcaDemo()
        expect(res.companyRenamed).toBe(true)
        const bundle = await loadReportingBundle(PURMAMARCA_YEAR)
        const dir = bundle.statements.cashFlowDirect!
        expect(dir.openingCash.amount).toBe(PURMAMARCA_EXPECTED.openingCash)   // 10.000
        expect(dir.closingCash.amount).toBe(PURMAMARCA_EXPECTED.closingCash)   // 49.000
        expect(dir.netChange.amount).toBe(PURMAMARCA_EXPECTED.netChange)       // 39.000
        expect(dir.operating.amount).toBe(PURMAMARCA_EXPECTED.operating)       // 4.000
        expect(dir.investing.amount).toBe(PURMAMARCA_EXPECTED.investing)       // 30.000
        expect(dir.financing.amount).toBe(PURMAMARCA_EXPECTED.financing)       // 5.000
        const cobros = (dir.operating.children ?? []).find(c => c.label === 'Cobros de clientes')
        const pagos = (dir.operating.children ?? []).find(c => c.label === 'Pagos a proveedores de bienes y servicios')
        expect(cobros?.amount).toBe(PURMAMARCA_EXPECTED.cobros)                // 32.000
        expect(pagos?.amount).toBe(-PURMAMARCA_EXPECTED.pagos)                 // −28.000
        // Controles en cero (incluye el nuevo efe-disposicion)
        for (const id of ['efe-variacion', 'efe-esp', 'efe-metodos', 'efe-clasificacion', 'efe-disposicion']) {
            expect(bundle.statements.validation!.checks.find(c => c.id === id)!.passed, id).toBe(true)
        }
        // La razón social del caso quedó marcada
        const company = await db.companies.toCollection().first()
        expect(company?.legalName).toBe(PURMAMARCA_COMPANY_NAME)
    })

    it('es idempotente: recargar no duplica asientos', async () => {
        await loadPurmamarcaDemo()
        const count1 = await db.entries.count()
        const res = await loadPurmamarcaDemo()
        expect(res.idempotent).toBe(true)
        expect(await db.entries.count()).toBe(count1)
    })

    it('reset acota al caso: sobre una base con sólo Purmamarca, la vacía', async () => {
        await loadPurmamarcaDemo()
        expect(await isPurmamarcaLoaded()).toBe(true)
        const r = await resetPurmamarcaDemo()
        expect(r.removed).toBeGreaterThan(0)
        expect(await isPurmamarcaLoaded()).toBe(false)
        const accounts = await db.accounts.where('id').anyOf(PURMAMARCA_ACCOUNTS.map(a => a.id)).count()
        expect(accounts).toBe(0)
    })

    it('reset se NIEGA si hay asientos ajenos (no borra otros datos)', async () => {
        await loadPurmamarcaDemo()
        // se agrega un asiento ajeno al caso
        await db.accounts.put({ ...PURMAMARCA_ACCOUNTS[0], id: 'real-caja', code: 'R.1', name: 'Caja real', statementGroup: 'CASH_AND_BANKS' })
        await postOperation({
            date: '2022-07-01', memo: 'Asiento real del usuario',
            lines: [{ accountId: 'real-caja', debit: 1000, credit: 0 }, { accountId: 'pur-ventas', debit: 0, credit: 1000 }],
            sourceModule: 'manual', sourceType: 'ajuste', sourceId: 'real-1',
        })
        await expect(resetPurmamarcaDemo()).rejects.toThrow()
    })

    it('la guardia impide cargar sobre datos ajenos (no contamina empresas reales)', async () => {
        await db.accounts.put({ ...PURMAMARCA_ACCOUNTS[0], id: 'real-caja', code: 'R.1', name: 'Caja real', statementGroup: 'CASH_AND_BANKS' })
        await postOperation({
            date: '2023-01-01', memo: 'Asiento real del usuario',
            lines: [{ accountId: 'real-caja', debit: 1000, credit: 0 }, { accountId: 'real-caja', debit: 0, credit: 1000 }],
            sourceModule: 'manual', sourceType: 'ajuste', sourceId: 'real-1',
        })
        const guard = await isSafeToLoadPurmamarca()
        expect(guard.safe).toBe(false)
        await expect(loadPurmamarcaDemo()).rejects.toThrow()
    })
})
