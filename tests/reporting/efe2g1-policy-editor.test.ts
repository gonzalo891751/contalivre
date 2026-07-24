/**
 * Fase 2G.1 — HITO 4: edición y persistencia de la política EFE (§5).
 *
 * Verifica el camino que ejecuta el panel de edición: clasificar cuentas por rol,
 * editar intereses/dividendos/IG/sobregiros, agregar/revocar overrides y guardar
 * como NUEVA versión (versionado). Comprueba que el motor consume lo editado y
 * que la vigencia (validFrom/validTo) preserva la historicidad.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { ensureDefaultPolicy, getActivePolicy, savePolicy } from '../../src/reporting/policy/policyRepository'
import { effectiveCashRole, effectiveOverride, roleCountsAsCash, disposalOverrideForEntry, type CashFlowPolicy } from '../../src/reporting/policy/cashFlowPolicy'

const COMPANY = 'default-company'

describe('Fase 2G.1 — edición de políticas EFE', () => {
    beforeEach(async () => { await resetDb() })

    it('guarda una nueva versión con clasificaciones, políticas y overrides editados', async () => {
        const base = await ensureDefaultPolicy(COMPANY)
        expect(base.version).toBe(1)

        const edited: CashFlowPolicy = {
            ...base,
            requiresReview: false,
            interestsPaid: 'FINANCING',
            dividendsReceived: 'INVESTING',
            overdrafts: 'FINANCING',
            cashClassifications: [
                { accountId: 'caja', role: 'CASH', justification: 'Efectivo en caja' },
                { accountId: 'fondo', role: 'RESTRICTED_FUND', justification: 'Garantía bloqueada' },
                { accountId: 'plazo', role: 'CASH_EQUIVALENT', attributes: { highLiquidity: true, insignificantRisk: true, shortMaturity: true } },
            ],
            overrides: [
                { id: 'ov-1', target: 'ENTRY', targetId: 'e-100', classification: 'INVESTING', reason: 'Disposición a crédito', source: 'user', createdAt: '2025-01-01', version: 1 },
            ],
        }
        await savePolicy({ ...edited, version: edited.version + 1 })

        const reloaded = await getActivePolicy(COMPANY)
        expect(reloaded!.version).toBe(2)
        expect(reloaded!.requiresReview).toBe(false)
        expect(reloaded!.interestsPaid).toBe('FINANCING')
        expect(reloaded!.overdrafts).toBe('FINANCING')
        expect(reloaded!.cashClassifications).toHaveLength(3)
        expect(reloaded!.overrides).toHaveLength(1)
    })

    it('el motor consume los roles y overrides editados', async () => {
        const base = await ensureDefaultPolicy(COMPANY)
        await savePolicy({
            ...base, version: 2, requiresReview: false,
            cashClassifications: [
                { accountId: 'caja', role: 'CASH' },
                { accountId: 'fondo', role: 'RESTRICTED_FUND' },
            ],
            overrides: [{ id: 'ov-1', target: 'ENTRY', targetId: 'e-100', classification: 'INVESTING', reason: 'r', source: 's', createdAt: '2025-01-01', version: 1 }],
        })
        const p = await getActivePolicy(COMPANY)

        expect(effectiveCashRole(p, 'caja', '2025-06-01')).toBe('CASH')
        expect(roleCountsAsCash('CASH', p!.overdrafts)).toBe(true)
        // el fondo restringido NO integra el efectivo
        expect(roleCountsAsCash('RESTRICTED_FUND', p!.overdrafts)).toBe(false)
        // el override de disposición se resuelve para el asiento
        const ov = disposalOverrideForEntry(p, { id: 'e-100', date: '2025-06-01' })
        expect(ov?.classification).toBe('INVESTING')
        expect(effectiveOverride(p, { ENTRY: 'e-100' }, '2025-06-01')).not.toBeNull()
    })

    it('la vigencia (validFrom/validTo) preserva la historicidad', async () => {
        const base = await ensureDefaultPolicy(COMPANY)
        await savePolicy({
            ...base, version: 2,
            overrides: [{ id: 'ov-old', target: 'ENTRY', targetId: 'e-1', classification: 'FINANCING', reason: 'r', source: 's', createdAt: '2024-01-01', version: 1, validTo: '2024-12-31' }],
        })
        const p = await getActivePolicy(COMPANY)
        // vigente en 2024, ya no en 2025
        expect(effectiveOverride(p, { ENTRY: 'e-1' }, '2024-06-01')).not.toBeNull()
        expect(effectiveOverride(p, { ENTRY: 'e-1' }, '2025-06-01')).toBeNull()
    })
})
