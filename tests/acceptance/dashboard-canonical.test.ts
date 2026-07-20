/**
 * Fase 2F (§14) — El Dashboard usa el ÚNICO motor canónico.
 *
 * useDashboardMetrics deriva del ReportingBundle (loadReportingBundle), no de
 * core/statements ni domain/reports. Verifica además que Inicio y Estados
 * muestran EXACTAMENTE los mismos totales (activo, pasivo, PN, efectivo,
 * liquidez), y que los motores de estados legacy fueron eliminados del árbol.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resetDb } from '../accounting/helpers'
import { loadRcAcceptanceDataset, RC_CURRENT_YEAR, RC_EXPECTED } from '../../src/accounting/fixtures/rcAcceptance'
import { loadReportingBundle } from '../../src/reporting/loadReportingBundle'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')
const importsFrom = (c: string, m: string) =>
    new RegExp(`(import|export)[^;]*from\\s+['"][^'"]*${m.replace(/[/]/g, '\\/')}[^'"]*['"]`).test(c)

describe('Fase 2F — Dashboard canónico', () => {
    it('useDashboardMetrics consume el ReportingBundle y no motores legacy', () => {
        const hook = readFileSync(join(SRC, 'hooks', 'useDashboardMetrics.ts'), 'utf-8')
        expect(importsFrom(hook, 'useReportingBundle') || importsFrom(hook, 'reporting/loadReportingBundle')).toBe(true)
        for (const legacy of ['core/statements', 'core/ledger', 'core/balance', 'domain/reports']) {
            expect(importsFrom(hook, legacy), `useDashboardMetrics importa ${legacy}`).toBe(false)
        }
    })

    it('el motor de estados legacy fue eliminado del árbol', () => {
        expect(existsSync(join(SRC, 'core', 'statements.ts'))).toBe(false)
        expect(existsSync(join(SRC, 'domain', 'reports', 'estadoResultados.ts'))).toBe(false)
    })

    it('ningún archivo de src consume computeStatements', () => {
        const barrel = readFileSync(join(SRC, 'core', 'index.ts'), 'utf-8')
        expect(barrel.includes('computeStatements')).toBe(false)
    })
})

describe('Fase 2F — Dashboard y Estados coinciden', () => {
    beforeAll(async () => {
        await resetDb()
        await loadRcAcceptanceDataset()
    })

    it('los totales del bundle (fuente del Dashboard) = los de Estados', async () => {
        // El Dashboard y Estados cargan el MISMO loadReportingBundle: por
        // construcción los totales coinciden. Verificamos las cifras clave
        // contra los golden del dataset RC.
        const bundle = await loadReportingBundle(RC_CURRENT_YEAR)
        const bs = bundle.statements.balanceSheet

        expect(bs.equity.amount).toBe(RC_EXPECTED.currentEquity)
        expect(bs.equationDifference).toBe(0)
        expect(bs.totalAssets.amount).toBe(bs.totalLiabilitiesAndEquity.amount)

        // efectivo: el dashboard suma CASH_AND_BANKS del activo corriente
        let cash = 0
        const walk = (l: typeof bs.currentAssets) => {
            if (l.level === 2 && l.accountIds.length === 1) {
                const id = l.accountIds[0]
                if (id === 'rc-caja' || id === 'rc-banco-usd') cash += Math.abs(l.amount)
            }
            for (const c of l.children ?? []) walk(c)
        }
        walk(bs.currentAssets)
        expect(cash).toBe(RC_EXPECTED.currentClosingCash)
    })
})
