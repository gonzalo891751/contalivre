import { describe, expect, it } from 'vitest'
import type { Account, JournalEntry } from '../src/core/models'
import { buildEstadoResultados } from '../src/domain/reports/estadoResultados'

const mkAccount = (account: Account): Account => account

describe('Estado de Resultados - devoluciones sobre ventas', () => {
    it('4.8.06 resta Ventas Netas aunque venga legacy como COGS', () => {
        const accounts: Account[] = [
            mkAccount({
                id: 'deudor',
                code: '1.1.02.01.01',
                name: 'Cliente X',
                kind: 'ASSET',
                section: 'CURRENT',
                group: 'Creditos por ventas',
                statementGroup: 'TRADE_RECEIVABLES',
                parentId: null,
                level: 4,
                normalSide: 'DEBIT',
                isContra: false,
                isHeader: false,
            }),
            mkAccount({
                id: 'ventas',
                code: '4.1.01',
                name: 'Ventas',
                kind: 'INCOME',
                section: 'OPERATING',
                group: 'Ingresos operativos',
                statementGroup: 'SALES',
                parentId: null,
                level: 3,
                normalSide: 'CREDIT',
                isContra: false,
                isHeader: false,
            }),
            mkAccount({
                id: 'devol-ventas-legacy',
                code: '4.8.06',
                name: 'Devoluciones sobre ventas',
                kind: 'EXPENSE',
                section: 'COST',
                group: 'Movimiento de mercaderias',
                statementGroup: 'COGS',
                parentId: null,
                level: 3,
                normalSide: 'DEBIT',
                isContra: true,
                isHeader: false,
            }),
        ]

        const entries: JournalEntry[] = [
            {
                id: 'sale',
                date: '2025-01-10',
                memo: 'Venta',
                lines: [
                    { accountId: 'deudor', debit: 1000, credit: 0 },
                    { accountId: 'ventas', debit: 0, credit: 1000 },
                ],
            },
            {
                id: 'sale-return',
                date: '2025-01-18',
                memo: 'Devolucion venta',
                lines: [
                    { accountId: 'devol-ventas-legacy', debit: 200, credit: 0 },
                    { accountId: 'deudor', debit: 0, credit: 200 },
                ],
                metadata: { journalRole: 'sale_return' },
            },
        ]

        const er = buildEstadoResultados({
            accounts,
            entries,
            fromDate: '2025-01-01',
            toDate: '2025-12-31',
            fiscalYear: 2025,
        })

        expect(er.ventasBrutas.subtotal).toBe(1000)
        expect(er.devolucionesYBonificaciones.subtotal).toBe(-200)
        expect(er.ventasNetas).toBe(800)
        expect(er.costoVentas.subtotal).toBe(0)
    })
})
