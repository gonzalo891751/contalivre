/**
 * Fase 2G — Snapshots robustos e identidad de contenido (EFE-009, spec §15).
 *
 * El snapshot congela ambos métodos, reexpresión, preparación, gate y validación;
 * el hash depende del contenido material completo y cambia ante cualquier cambio;
 * un bundle con blockers no se guarda como validado; y se detecta divergencia.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from '../accounting/helpers'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { buildCashFlowPreparation } from '../../src/reporting/preparation/cashFlowPreparation'
import { buildPublicationGate } from '../../src/reporting/engine/publicationGate'
import { createSnapshot, snapshotDivergesFromCurrent } from '../../src/reporting/snapshots/snapshotService'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'
import type { ReportingBundle } from '../../src/reporting/loadReportingBundle'

const CTX = { companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ej. 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' }
const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'misteriosa', code: '1.9.9', name: 'Sin clasificar', kind: 'ASSET', statementGroup: null }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', section: 'OPERATING' }),
]

function bundleFor(sale: number, opts: { unclassified?: boolean } = {}): ReportingBundle {
    const lines = opts.unclassified
        ? [{ accountId: 'caja', debit: sale, credit: 0 }, { accountId: 'misteriosa', debit: 0, credit: sale }]
        : [{ accountId: 'caja', debit: sale, credit: 0 }, { accountId: 'ventas', debit: 0, credit: sale }]
    const input: ReportingInput = {
        context: CTX, accounts: ACCOUNTS,
        openingBalances: new Map([['caja', { debit: 100, credit: 0 }], ['capital', { debit: 0, credit: 100 }]]),
        entries: [{ id: 'e1', entryNumber: 1, date: '2025-06-10', memo: 'v', status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10', lines } as unknown as JournalEntry],
    }
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    statements.cashFlowDirect = cashFlows.direct
    statements.cashFlowIndirect = cashFlows.indirect
    statements.validation = cashFlows.validation
    const preparation = buildCashFlowPreparation(input, statements, cashFlows)
    const publicationGate = buildPublicationGate({ validation: statements.validation, restated: null, inflationSet: null })
    return {
        statements, cashFlowRestated: null, preparation, publicationGate, inflationSet: null,
        metadata: { companyId: 'c1', exerciseLabel: 'Ej. 2025', engineVersion: '2F.0', schemaVersion: 22, normative: 'RT 54', reportVersion: `rv-${sale}`, hasComparative: false },
    } as unknown as ReportingBundle
}

describe('Fase 2G — snapshots robustos (EFE-009)', () => {
    beforeEach(async () => { await resetDb() })

    it('congela ambos métodos, preparación y gate; hash fuerte e identidad', async () => {
        const snap = await createSnapshot(bundleFor(500), { status: 'VALIDATED' })
        expect(snap.status).toBe('VALIDATED')
        expect(snap.bundleJson).toContain('cashFlowIndirect')
        expect(snap.bundleJson).toContain('preparation')
        expect(snap.bundleJson).toContain('publicationGate')
        expect(snap.contentHash).toBeTruthy()
        expect(snap.contentHash).not.toBe(snap.reportVersion)
        expect(snap.indexSetHash).toBeNull()
        expect(snap.policyVersion).toBeDefined()
    })

    it('un bundle con blockers no se guarda como validado (queda DRAFT)', async () => {
        const snap = await createSnapshot(bundleFor(500, { unclassified: true }), { status: 'VALIDATED' })
        expect(snap.status).toBe('DRAFT')
    })

    it('el hash cambia ante un cambio material y detecta divergencia', async () => {
        const snap = await createSnapshot(bundleFor(500), { status: 'VALIDATED' })
        // mismo contenido ⇒ no diverge
        expect(snapshotDivergesFromCurrent(snap, bundleFor(500))).toBe(false)
        // contenido distinto (otra venta) ⇒ diverge
        expect(snapshotDivergesFromCurrent(snap, bundleFor(700))).toBe(true)
    })
})
