/**
 * Fase 2H §H7 — Circuito único de bienes de uso.
 *
 * Verifica que Operaciones → ficha → asiento → anexo → estados sea UNA sola
 * cadena y no dos bases paralelas:
 *
 *   - el alta del bien se contabiliza por el servicio único y aparece en el ESP;
 *   - la depreciación del ejercicio llega al anexo y al ER;
 *   - el anexo, que se arma con el Libro Diario, concilia con las fichas del
 *     módulo (mismo valor de origen, misma depreciación acumulada);
 *   - una ficha sin asiento se detecta y se informa, no se ignora.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../../src/storage/db'
import { resetDb, seedTestAccounts } from './helpers'
import {
    createFixedAsset,
    syncFixedAssetAcquisitionEntry,
    generateAmortizationEntry,
    getFixedAssetsMetrics,
    getAllFixedAssets,
} from '../../src/storage/fixedAssets'
import { reverseEntry } from '../../src/accounting/application/journalService'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'
import { reconcileFixedAssets } from '../../src/reporting/fixedAssetsReconciliation'
import type { FixedAsset } from '../../src/core/fixedAssets/types'

const YEAR = 2026
const PERIOD = String(YEAR)

/**
 * El módulo de Bienes de uso resuelve algunas cuentas por CÓDIGO contra el plan
 * real (acreedores varios para la compra a crédito y la cuenta de amortizaciones
 * del ejercicio). El plan mínimo de pruebas no las trae, así que se agregan.
 */
async function seedModuleAccounts() {
    await db.accounts.bulkAdd([
        {
            id: 'acreedores-varios',
            code: '2.1.06.01',
            name: 'Acreedores Varios',
            kind: 'LIABILITY',
            section: 'CURRENT',
            group: 'Otras deudas',
            statementGroup: 'OTHER_PAYABLES',
            parentId: null,
            level: 3,
            normalSide: 'CREDIT',
            isContra: false,
            isHeader: false,
            isPostable: true,
            active: true,
        },
        {
            id: 'amort-ejercicio',
            code: '4.5.11',
            name: 'Amortizaciones Bienes de Uso',
            kind: 'EXPENSE',
            section: 'ADMIN',
            group: 'Gastos de administración',
            statementGroup: 'ADMIN_EXPENSES',
            parentId: null,
            level: 2,
            normalSide: 'DEBIT',
            isContra: false,
            isHeader: false,
            isPostable: true,
            active: true,
            resultFunction: 'ADMINISTRATION',
        },
    ])
}

/** Alta de un rodado de 1.000.000 a 5 años, sin valor residual. */
async function createRodado(overrides: Partial<FixedAsset> = {}) {
    return createFixedAsset({
        name: 'Rodado de reparto',
        periodId: PERIOD,
        category: 'rodados',
        accountId: 'bienes-uso',
        contraAccountId: 'amort-acum',
        originType: 'PURCHASE',
        acquisitionDate: `${YEAR}-01-01`,
        originalValue: 1000000,
        residualValuePct: 0,
        method: 'lineal-year',
        lifeYears: 5,
        status: 'active',
        rt6Enabled: false,
        acquisition: {
            date: `${YEAR}-01-01`,
            docType: 'FC A',
            docNumber: '0001-00000001',
            netAmount: 1000000,
            vatRate: 0,
            vatAmount: 0,
            totalAmount: 1000000,
            withVat: false,
            // Sin pagos inmediatos: la compra queda en Acreedores Varios.
            splits: [],
        },
        ...overrides,
    } as Parameters<typeof createFixedAsset>[0])
}

async function reconcile() {
    const bundle = await loadReportingBundle(YEAR)
    const metrics = await getFixedAssetsMetrics(PERIOD, YEAR)
    const assets = await getAllFixedAssets(PERIOD)
    return {
        bundle,
        reconciliation: reconcileFixedAssets(
            bundle,
            { totalCost: metrics.totalCost, totalAccumulated: metrics.totalAccumulated, count: metrics.count },
            assets
        ),
    }
}

describe('Fase 2H §H7 — alta y depreciación', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedModuleAccounts()
    })

    it('el alta del bien genera asiento y llega al ESP', async () => {
        const asset = await createRodado()
        const result = await syncFixedAssetAcquisitionEntry(asset)
        expect(result.entryId, result.error).toBeTruthy()

        const bundle = await loadReportingBundle(YEAR)

        const ppe = bundle.statements.trialBalance.rows.find(r => r.accountId === 'bienes-uso')!
        expect(ppe.closing).toBe(1000000)
        expect(bundle.statements.balanceSheet.equationDifference).toBe(0)
    })

    it('la depreciación del ejercicio llega al anexo y al resultado', async () => {
        const asset = await createRodado()
        await syncFixedAssetAcquisitionEntry(asset)

        const stored = (await db.fixedAssets.get(asset.id))!
        const dep = await generateAmortizationEntry(stored, YEAR)
        expect(dep.success, dep.error).toBe(true)

        const annex = (await loadReportingBundle(YEAR)).statements.fixedAssetsAnnex

        // 1.000.000 / 5 años = 200.000 en el ejercicio.
        expect(annex.totals.periodDepreciation).toBe(200000)
        expect(annex.totals.accumDepClosing).toBe(200000)
        expect(annex.totals.grossClosing).toBe(1000000)
        expect(annex.totals.residual).toBe(800000)
    })

    it('el anexo concilia con las fichas del módulo', async () => {
        const asset = await createRodado()
        await syncFixedAssetAcquisitionEntry(asset)
        const stored = (await db.fixedAssets.get(asset.id))!
        await generateAmortizationEntry(stored, YEAR)

        const { reconciliation } = await reconcile()

        expect(reconciliation.reconciled, JSON.stringify(reconciliation.rows)).toBe(true)
        expect(reconciliation.assetCount).toBe(1)
        expect(reconciliation.assetsWithoutEntries).toHaveLength(0)

        const gross = reconciliation.rows.find(r => r.label.startsWith('Valor de origen'))!
        expect(gross.perModule).toBe(1000000)
        expect(gross.perLedger).toBe(1000000)
        expect(gross.difference).toBe(0)
    })

    it('no hay bases paralelas: la planilla y el anexo leen los mismos bienes', async () => {
        const asset = await createRodado()
        await syncFixedAssetAcquisitionEntry(asset)

        // La planilla de amortizaciones consume getAllFixedAssets (V2), la misma
        // fuente que alimenta los asientos que arman el anexo.
        const assets = await getAllFixedAssets(PERIOD)
        expect(assets).toHaveLength(1)
        expect(assets[0].id).toBe(asset.id)

        const metrics = await getFixedAssetsMetrics(PERIOD, YEAR)
        expect(metrics.totalCost).toBe(1000000)
    })
})

describe('Fase 2H §H7 — casos límite', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await seedModuleAccounts()
    })

    it('una ficha sin asiento se detecta y se informa', async () => {
        await createRodado() // sin contabilizar

        const { reconciliation } = await reconcile()

        expect(reconciliation.assetsWithoutEntries).toHaveLength(1)
        expect(reconciliation.assetsWithoutEntries[0].name).toBe('Rodado de reparto')
        // La conciliación falla: el módulo tiene 1.000.000 y el Diario 0.
        expect(reconciliation.reconciled).toBe(false)

        const gross = reconciliation.rows[0]
        expect(gross.perModule).toBe(1000000)
        expect(gross.perLedger).toBe(0)
        expect(gross.difference).toBe(1000000)
    })

    it('un bien con valor residual no se deprecia por debajo de él', async () => {
        const asset = await createRodado({ originalValue: 1000000, residualValuePct: 20, lifeYears: 4 })
        await syncFixedAssetAcquisitionEntry(asset)
        const stored = (await db.fixedAssets.get(asset.id))!
        const dep = await generateAmortizationEntry(stored, YEAR)
        expect(dep.success, dep.error).toBe(true)

        const annex = (await loadReportingBundle(YEAR)).statements.fixedAssetsAnnex
        // Base depreciable = 1.000.000 − 20 % = 800.000; en 4 años = 200.000.
        expect(annex.totals.periodDepreciation).toBe(200000)
    })

    it('la reversión del asiento de alta deja el anexo en cero', async () => {
        const asset = await createRodado()
        const result = await syncFixedAssetAcquisitionEntry(asset)

        await reverseEntry(result.entryId!, { date: `${YEAR}-06-30`, reason: 'prueba de reversión' })

        const annex = (await loadReportingBundle(YEAR)).statements.fixedAssetsAnnex
        expect(annex.totals.grossClosing).toBe(0)
    })

    it('el módulo sin bienes no reporta diferencia falsa', async () => {
        const { reconciliation } = await reconcile()
        expect(reconciliation.empty).toBe(true)
        expect(reconciliation.assetCount).toBe(0)
    })

    it('no duplica el alta si se sincroniza dos veces (idempotencia)', async () => {
        const asset = await createRodado()
        await syncFixedAssetAcquisitionEntry(asset)
        const stored = (await db.fixedAssets.get(asset.id))!
        await syncFixedAssetAcquisitionEntry(stored)

        const bundle = await loadReportingBundle(YEAR)
        // Sigue siendo un solo bien de 1.000.000, no 2.000.000.
        const ppe = bundle.statements.trialBalance.rows.find(r => r.accountId === 'bienes-uso')!
        expect(ppe.closing).toBe(1000000)
    })
})

describe('Fase 2H §H7 — invariantes de arquitectura', () => {
    const root = join(__dirname, '..', '..')

    it('el selector de conciliación no recalcula la amortización', () => {
        const source = readFileSync(join(root, 'src', 'reporting', 'fixedAssetsReconciliation.ts'), 'utf-8')
        // Reutiliza los totales del módulo; no vuelve a derivar la depreciación.
        expect(source).not.toContain('calculateFixedAssetDepreciation')
        expect(source).toContain('FixedAssetsModuleTotals')
    })

    it('el panel de conciliación consume el bundle canónico', () => {
        const source = readFileSync(
            join(root, 'src', 'components', 'Estados', 'canonical', 'FixedAssetsReconciliationPanel.tsx'),
            'utf-8'
        )
        expect(source).toContain('ReportingBundle')
        expect(source).toContain('reconcileFixedAssets')
    })
})
