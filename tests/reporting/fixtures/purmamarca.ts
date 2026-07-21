/**
 * Fase 2G — Fixture PERMANENTE del caso Purmamarca (spec §16).
 *
 * Reproduce el caso pedagógico del "Caso Purmamarca EFE.xlsx" como evidencia
 * de prueba reutilizable. NO es dato productivo: vive sólo en tests/E2E.
 *
 * Efectivo inicial 10.000 · final 49.000 · variación 39.000.
 * Directo:   cobros 32.000 · pagos −28.000 · operación 4.000 ·
 *            inversión 30.000 · financiación 5.000 · variación 39.000.
 * Indirecto: resultado 15.000 · créditos −3.000 · inventarios −10.000 ·
 *            proveedores +2.000 · operación 4.000 · inversión 30.000 ·
 *            financiación 5.000 · variación 39.000.
 * Puentes:   ventas 35.000 − Δcréditos 3.000 = cobros 32.000;
 *            CMV 20.000 + EF 10.000 − EI 0 = compras 30.000;
 *            compras 30.000 − Δproveedores 2.000 = pagos 28.000.
 * La venta de PPE es a valor contable (30.000 = 30.000): sin resultado.
 */

import { makeAccount } from '../../accounting/helpers'
import type { Account, JournalEntry } from '../../../src/core/models'
import type { ReportingInput } from '../../../src/reporting/domain/types'

export const PURMAMARCA_CTX = {
    companyId: 'purmamarca',
    exerciseId: 'ex-2025',
    exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
}

export const PURMAMARCA_ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja y bancos', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', group: 'Caja y Bancos' }),
    makeAccount({ id: 'creditos', code: '1.1.02', name: 'Créditos por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES', group: 'Créditos por ventas' }),
    makeAccount({ id: 'mercaderias', code: '1.1.04', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES', group: 'Bienes de cambio' }),
    makeAccount({ id: 'bienes-uso', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', group: 'Bienes de uso', section: 'NON_CURRENT' }),
    makeAccount({ id: 'proveedores', code: '2.1.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES', group: 'Deudas comerciales' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', group: 'Capital' }),
    makeAccount({ id: 'aportes', code: '3.1.02', name: 'Aportes irrevocables', kind: 'EQUITY', statementGroup: 'CAPITAL', group: 'Aportes irrevocables' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', group: 'Ventas', section: 'OPERATING' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'Costo de mercaderías vendidas', kind: 'EXPENSE', statementGroup: 'COGS', group: 'Costo de ventas', section: 'COST' }),
]

let seq = 0
function entry(date: string, memo: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return {
        id: `pur-${seq}`, entryNumber: seq, date, memo,
        status: 'POSTED', lines, createdAt: date, updatedAt: date,
    } as unknown as JournalEntry
}

/** Asientos del ejercicio (sin apertura; la apertura va en openingBalances) */
export function purmamarcaEntries(): JournalEntry[] {
    seq = 0
    return [
        entry('2025-02-10', 'Venta de mercaderías a crédito', [
            { accountId: 'creditos', debit: 35000, credit: 0 },
            { accountId: 'ventas', debit: 0, credit: 35000 },
        ]),
        entry('2025-03-10', 'Cobro parcial de clientes', [
            { accountId: 'caja', debit: 32000, credit: 0 },
            { accountId: 'creditos', debit: 0, credit: 32000 },
        ]),
        entry('2025-04-10', 'Compra de mercaderías a crédito', [
            { accountId: 'mercaderias', debit: 30000, credit: 0 },
            { accountId: 'proveedores', debit: 0, credit: 30000 },
        ]),
        entry('2025-05-10', 'Pago parcial a proveedores', [
            { accountId: 'proveedores', debit: 28000, credit: 0 },
            { accountId: 'caja', debit: 0, credit: 28000 },
        ]),
        entry('2025-06-30', 'Costo de mercaderías vendidas', [
            { accountId: 'cmv', debit: 20000, credit: 0 },
            { accountId: 'mercaderias', debit: 0, credit: 20000 },
        ]),
        entry('2025-09-10', 'Venta de bienes de uso a valor contable', [
            { accountId: 'caja', debit: 30000, credit: 0 },
            { accountId: 'bienes-uso', debit: 0, credit: 30000 },
        ]),
        entry('2025-11-10', 'Aporte irrevocable de los socios', [
            { accountId: 'caja', debit: 5000, credit: 0 },
            { accountId: 'aportes', debit: 0, credit: 5000 },
        ]),
    ]
}

/** Saldos de apertura: Caja 10.000 y Bienes de uso 30.000 al Debe; Capital 40.000 al Haber. */
export function purmamarcaOpening(): Map<string, { debit: number; credit: number }> {
    return new Map([
        ['caja', { debit: 10000, credit: 0 }],
        ['bienes-uso', { debit: 30000, credit: 0 }],
        ['capital', { debit: 0, credit: 40000 }],
    ])
}

export function buildPurmamarcaInput(): ReportingInput {
    return {
        context: PURMAMARCA_CTX,
        entries: purmamarcaEntries(),
        openingBalances: purmamarcaOpening(),
        accounts: PURMAMARCA_ACCOUNTS,
    }
}

/** Índices de inflación planos (coef = 1) para probar la reexpresión sin inflación. */
export function purmamarcaFlatIndexes(): Map<string, number> {
    const idx = new Map<string, number>()
    for (let m = 1; m <= 12; m++) idx.set(`2025-${String(m).padStart(2, '0')}`, 100)
    return idx
}

/** Importes esperados (en unidades monetarias) — spec §16. */
export const PURMAMARCA_EXPECTED = {
    openingCash: 10000,
    closingCash: 49000,
    netChange: 39000,
    netIncome: 15000,
    direct: { operating: 4000, investing: 30000, financing: 5000, cobrosClientes: 32000, pagosProveedores: -28000 },
    indirect: { operating: 4000, deltaCreditos: -3000, deltaInventarios: -10000, deltaProveedores: 2000 },
    bridges: { cobros: 32000, compras: 30000, pagos: 28000 },
} as const
