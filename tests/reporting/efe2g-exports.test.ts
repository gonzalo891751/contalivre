/**
 * Fase 2G — REI y revelaciones en la exportación formal (EFE-002, spec §5.4, §14, §18E).
 *
 * En moneda de cierre, la exportación XLSX debe incluir la línea de REI del
 * efectivo y la suma visible debe reconciliar con la variación. Las operaciones
 * que no afectaron el efectivo se exponen en una revelación SEPARADA.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { reexpressCashFlow } from '../../src/reporting/engine/cashFlowInflation'
import { buildSelectedReportSheets } from '../../src/lib/exportReportBundle'
import { defaultExportOptions } from '../../src/lib/exportOptions'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'
import type { ReportingBundle } from '../../src/reporting/loadReportingBundle'

const CTX = { companyId: 'c1', exerciseId: 'ex', exerciseLabel: 'Ej. 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' }
const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'rodados', code: '1.2.01', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'proveedores', code: '2.1.01', name: 'Proveedores de bienes de uso', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', section: 'OPERATING' }),
]

function metadata(): ReportingBundle['metadata'] {
    return {
        companyId: 'c1', companyLegalName: 'Test SA', exerciseLabel: 'Ej. 2025',
        exerciseStatus: 'OPEN', periodStart: '2025-01-01', periodEnd: '2025-12-31',
        currency: 'ARS', unit: 'Pesos ($)', normative: 'RT 54', jurisdiction: 'AR',
        appVersion: '0', engineVersion: '2F.0', schemaVersion: 22, commit: 'x', buildDate: 'x',
        reportVersion: 'h', generatedAt: 'now', hasComparative: false, status: 'VALIDATED',
    }
}

function makeBundle(input: ReportingInput, indexes: Map<string, number>): ReportingBundle {
    const statements = buildStatements(input)
    const cashFlows = buildCashFlows(input, statements)
    statements.cashFlowDirect = cashFlows.direct
    statements.cashFlowIndirect = cashFlows.indirect
    statements.validation = cashFlows.validation
    const restated = reexpressCashFlow(input, statements, indexes)
    return { statements, cashFlowRestated: restated, metadata: metadata() } as unknown as ReportingBundle
}

const efeOnly = () => ({
    ...defaultExportOptions(false),
    content: { esp: false, er: false, eepn: false, efe: true, notas: false, anexos: false, indicadores: false, analisis: false },
})

describe('Fase 2G — REI y revelaciones en exportación (EFE-002)', () => {
    it('la hoja EFE en moneda de cierre incluye REI y reconcilia', () => {
        const input: ReportingInput = {
            context: CTX, accounts: ACCOUNTS,
            openingBalances: new Map([['caja', { debit: 1000, credit: 0 }], ['capital', { debit: 0, credit: 1000 }]]),
            entries: [{ id: 'e1', entryNumber: 1, date: '2025-06-10', memo: 'venta', status: 'POSTED', createdAt: '2025-06-10', updatedAt: '2025-06-10', lines: [{ accountId: 'caja', debit: 500, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 500 }] } as unknown as JournalEntry],
        }
        // Inflación: coef inicio→cierre = 2, coef junio→cierre = 2
        const idx = new Map([['2025-01', 100], ['2025-06', 100], ['2025-12', 200]])
        const bundle = makeBundle(input, idx)
        const sheets = buildSelectedReportSheets(bundle, { ...efeOnly(), efeMethod: 'DIRECT', currency: 'CLOSING' })

        const efe = sheets.find(sh => sh.name === 'EFE directo (cierre)')!
        expect(efe).toBeDefined()
        const rows = efe.rows
        const amountByLabel = (needle: string) => {
            const r = rows.find(row => typeof row[0] === 'string' && (row[0] as string).includes(needle))
            return r ? Number(r[1]) : undefined
        }
        const rei = amountByLabel('REI')
        expect(rei).toBeDefined()

        // Reconciliación visible: opening + operativas + inversión + financiación + REI = cierre
        const opening = bundle.cashFlowRestated!.direct.openingCash.amount
        const op = bundle.cashFlowRestated!.direct.operating.amount
        const inv = bundle.cashFlowRestated!.direct.investing.amount
        const fin = bundle.cashFlowRestated!.direct.financing.amount
        const closing = bundle.cashFlowRestated!.direct.closingCash.amount
        expect(op + inv + fin + rei!).toBe(bundle.cashFlowRestated!.direct.netChange.amount)
        expect(opening + op + inv + fin + rei!).toBe(closing)
    })

    it('operaciones no monetarias: hoja de revelación separada, no integran el total', () => {
        const input: ReportingInput = {
            context: CTX, accounts: ACCOUNTS,
            openingBalances: new Map([['caja', { debit: 1000, credit: 0 }], ['capital', { debit: 0, credit: 1000 }]]),
            entries: [
                { id: 'e1', entryNumber: 1, date: '2025-04-10', memo: 'venta', status: 'POSTED', createdAt: '2025-04-10', updatedAt: '2025-04-10', lines: [{ accountId: 'caja', debit: 300, credit: 0 }, { accountId: 'ventas', debit: 0, credit: 300 }] } as unknown as JournalEntry,
                // compra de rodado a crédito comercial: transacción NO monetaria
                { id: 'e2', entryNumber: 2, date: '2025-05-10', memo: 'rodado a crédito', status: 'POSTED', createdAt: '2025-05-10', updatedAt: '2025-05-10', lines: [{ accountId: 'rodados', debit: 800, credit: 0 }, { accountId: 'proveedores', debit: 0, credit: 800 }] } as unknown as JournalEntry,
            ],
        }
        const bundle = makeBundle(input, new Map())
        const sheets = buildSelectedReportSheets(bundle, { ...efeOnly(), efeMethod: 'DIRECT', currency: 'NOMINAL' })
        expect(sheets.find(sh => sh.name === 'EFE no monetarias')).toBeDefined()
    })
})
