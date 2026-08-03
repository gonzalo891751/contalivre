/**
 * Dataset independiente «Cierre Iberá 2025» — Fase 2L.
 *
 * Caso dorado puro: no escribe en IndexedDB y no comparte ids, cuentas ni
 * sourceIds con Purmamarca o Grupo Litoral. Incluye partidas monetarias,
 * bienes de cambio con varios orígenes, bienes de uso, depreciación, PN,
 * resultados mensuales, moneda extranjera, valores de cierre y deterioro.
 */

import type { Account, JournalEntry } from '../../core/models'
import type { ClosingMeasurement } from '../../reporting/measurement/measurementTypes'

export const IBERA_COMPANY_ID = 'ibera-2025-company'
export const IBERA_EXERCISE_ID = 'ibera-2025-exercise'
export const IBERA_CLOSE_PERIOD = '2025-12'
export const IBERA_OPENING_PERIOD = '2024-12'

function account(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: partial.kind === 'INCOME' || partial.kind === 'EXPENSE' ? 'OPERATING' : 'CURRENT',
        group: 'Cierre Iberá 2025',
        statementGroup: null,
        parentId: null,
        level: 1,
        normalSide: ['ASSET', 'EXPENSE'].includes(partial.kind) ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        active: true,
        isPostable: true,
        companyId: IBERA_COMPANY_ID,
        ...partial,
    }
}

export const IBERA_ACCOUNTS: Account[] = [
    account({ id: 'ibe-cash', code: 'IBE.1.01', name: 'Banco', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', monetaryClassification: 'MONETARY' }),
    account({ id: 'ibe-receivables', code: 'IBE.1.02', name: 'Créditos por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES', monetaryClassification: 'MONETARY' }),
    account({ id: 'ibe-inventory', code: 'IBE.1.03', name: 'Mercaderías por capas', kind: 'ASSET', statementGroup: 'INVENTORIES', monetaryClassification: 'NON_MONETARY', tags: ['medicion:valor-corriente'] }),
    account({ id: 'ibe-fx', code: 'IBE.1.04', name: 'Tenencia en moneda extranjera', kind: 'ASSET', statementGroup: 'INVESTMENTS', monetaryClassification: 'NON_MONETARY', currency: 'USD', tags: ['medicion:valor-corriente'] }),
    account({ id: 'ibe-ppe', code: 'IBE.1.05', name: 'Equipos', kind: 'ASSET', section: 'NON_CURRENT', statementGroup: 'PPE', monetaryClassification: 'NON_MONETARY', tags: ['medicion:valor-corriente'] }),
    account({ id: 'ibe-acc-dep', code: 'IBE.1.05.1', name: 'Depreciación acumulada equipos', kind: 'ASSET', section: 'NON_CURRENT', statementGroup: 'PPE', monetaryClassification: 'NON_MONETARY', normalSide: 'CREDIT', isContra: true }),
    account({ id: 'ibe-suppliers', code: 'IBE.2.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES', monetaryClassification: 'MONETARY' }),
    account({ id: 'ibe-loan', code: 'IBE.2.02', name: 'Préstamo bancario', kind: 'LIABILITY', statementGroup: 'LOANS', monetaryClassification: 'MONETARY' }),
    account({ id: 'ibe-capital', code: 'IBE.3.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-reserve', code: 'IBE.3.02', name: 'Reserva legal', kind: 'EQUITY', statementGroup: 'RESERVES', equityComponent: 'LEGAL_RESERVE', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-sales', code: 'IBE.4.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-holding', code: 'IBE.4.02', name: 'Resultados por tenencia y cambio', kind: 'INCOME', statementGroup: 'FINANCIAL_INCOME', monetaryClassification: 'NON_MONETARY', allowOppositeBalance: true }),
    account({ id: 'ibe-cogs', code: 'IBE.5.01', name: 'Costo de ventas', kind: 'EXPENSE', statementGroup: 'COGS', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-expense', code: 'IBE.5.02', name: 'Gastos de administración', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-depreciation', code: 'IBE.5.03', name: 'Depreciaciones', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-impairment', code: 'IBE.5.04', name: 'Pérdida por desvalorización', kind: 'EXPENSE', statementGroup: 'OTHER_EXPENSES', monetaryClassification: 'NON_MONETARY' }),
    account({ id: 'ibe-recpam', code: 'IBE.5.05', name: 'RECPAM', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES', monetaryClassification: 'NON_MONETARY', allowOppositeBalance: true }),
]

let sequence = 0
function entry(date: string, memo: string, lines: Array<[string, number, number]>, sourceType = 'operacion'): JournalEntry {
    sequence += 1
    return {
        id: `ibe-entry-${String(sequence).padStart(2, '0')}`,
        companyId: IBERA_COMPANY_ID,
        exerciseId: IBERA_EXERCISE_ID,
        date,
        memo,
        status: 'POSTED',
        sourceModule: 'cierre-ibera-2025',
        sourceType,
        sourceId: `ibera-${String(sequence).padStart(2, '0')}`,
        lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
    } as unknown as JournalEntry
}

/** Saldos de apertura con origen conocido 2024-12. */
export const IBERA_OPENING_BALANCES = new Map<string, { debit: number; credit: number }>([
    ['ibe-cash', { debit: 500_000, credit: 0 }],
    ['ibe-ppe', { debit: 300_000, credit: 0 }],
    ['ibe-capital', { debit: 0, credit: 700_000 }],
    ['ibe-reserve', { debit: 0, credit: 100_000 }],
])

export const IBERA_ENTRIES: JournalEntry[] = [
    entry('2025-01-15', 'Venta de enero a crédito', [['ibe-receivables', 600_000, 0], ['ibe-sales', 0, 600_000]], 'venta'),
    entry('2025-02-10', 'Cobro parcial', [['ibe-cash', 450_000, 0], ['ibe-receivables', 0, 450_000]], 'cobro'),
    entry('2025-02-28', 'Gastos de febrero', [['ibe-expense', 80_000, 0], ['ibe-cash', 0, 80_000]], 'gasto'),
    entry('2025-03-12', 'Compra lote marzo', [['ibe-inventory', 180_000, 0], ['ibe-suppliers', 0, 180_000]], 'compra'),
    entry('2025-04-08', 'Pago a proveedores', [['ibe-suppliers', 120_000, 0], ['ibe-cash', 0, 120_000]], 'pago'),
    entry('2025-05-20', 'Alta de equipo', [['ibe-ppe', 240_000, 0], ['ibe-cash', 0, 240_000]], 'alta-ppe'),
    entry('2025-06-30', 'Gastos de junio devengados', [['ibe-expense', 95_000, 0], ['ibe-suppliers', 0, 95_000]], 'devengamiento'),
    entry('2025-07-18', 'Venta de julio al contado', [['ibe-cash', 380_000, 0], ['ibe-sales', 0, 380_000]], 'venta'),
    entry('2025-08-01', 'Compra lote agosto', [['ibe-inventory', 120_000, 0], ['ibe-suppliers', 0, 120_000]], 'compra'),
    entry('2025-08-31', 'Costo de mercaderías vendidas', [['ibe-cogs', 180_000, 0], ['ibe-inventory', 0, 180_000]], 'cmv'),
    entry('2025-09-05', 'Compra de USD', [['ibe-fx', 100_000, 0], ['ibe-cash', 0, 100_000]], 'moneda-extranjera'),
    entry('2025-10-31', 'Gastos de octubre', [['ibe-expense', 70_000, 0], ['ibe-cash', 0, 70_000]], 'gasto'),
    entry('2025-11-22', 'Venta de noviembre', [['ibe-receivables', 260_000, 0], ['ibe-sales', 0, 260_000]], 'venta'),
    entry('2025-12-31', 'Depreciación del ejercicio', [['ibe-depreciation', 24_000, 0], ['ibe-acc-dep', 0, 24_000]], 'depreciacion'),
    entry('2025-12-31', 'Valor de cierre del inventario', [['ibe-inventory', 15_000, 0], ['ibe-holding', 0, 15_000]], 'medicion-inventario'),
    entry('2025-12-31', 'Diferencia de cambio al cierre', [['ibe-fx', 18_000, 0], ['ibe-holding', 0, 18_000]], 'medicion-fx'),
    entry('2025-12-31', 'Deterioro de equipos', [['ibe-impairment', 26_000, 0], ['ibe-ppe', 0, 26_000]], 'deterioro'),
]

/** Serie didáctica completa y creciente; no se presenta como índice oficial. */
export const IBERA_INDEXES = new Map<string, number>([
    ['2024-12', 98],
    ...Array.from({ length: 12 }, (_, index) => [`2025-${String(index + 1).padStart(2, '0')}`, 100 + index * 2] as [string, number]),
])

const NOW = '2025-12-31T23:59:59.000Z'
export const IBERA_MEASUREMENTS: ClosingMeasurement[] = [
    {
        id: 'ibe-measure-inventory', companyId: IBERA_COMPANY_ID, exerciseId: IBERA_EXERCISE_ID,
        measuredAt: '2025-12-31', rubro: 'BIENES_DE_CAMBIO', accountId: 'ibe-inventory',
        accountCode: 'IBE.1.03', accountName: 'Mercaderías por capas', accountKind: 'ASSET', normalSide: 'DEBIT',
        criterion: 'COSTO_REPOSICION', previousAmount: 120_000, previousIsRestated: false, closingAmount: 135_000,
        source: 'Lista de proveedor Iberá al 31/12/2025', evidence: 'cotizacion-inventario-2025-12',
        difference: 15_000, holdingResultAccountId: 'ibe-holding', status: 'CONTABILIZADA', journalEntryId: 'ibe-entry-15',
        createdAt: NOW, updatedAt: NOW,
    },
    {
        id: 'ibe-measure-fx', companyId: IBERA_COMPANY_ID, exerciseId: IBERA_EXERCISE_ID,
        measuredAt: '2025-12-31', rubro: 'INVERSIONES_FINANCIERAS', accountId: 'ibe-fx',
        accountCode: 'IBE.1.04', accountName: 'Tenencia en moneda extranjera', accountKind: 'ASSET', normalSide: 'DEBIT',
        criterion: 'TIPO_CAMBIO_CIERRE', previousAmount: 100_000, previousIsRestated: false, closingAmount: 118_000,
        source: 'Cotización bancaria al cierre', evidence: 'cotizacion-usd-2025-12-31',
        difference: 18_000, holdingResultAccountId: 'ibe-holding', status: 'CONTABILIZADA', journalEntryId: 'ibe-entry-16',
        createdAt: NOW, updatedAt: NOW,
    },
    {
        id: 'ibe-measure-ppe', companyId: IBERA_COMPANY_ID, exerciseId: IBERA_EXERCISE_ID,
        measuredAt: '2025-12-31', rubro: 'BIENES_DE_USO_REVALUADOS', accountId: 'ibe-ppe',
        accountCode: 'IBE.1.05', accountName: 'Equipos', accountKind: 'ASSET', normalSide: 'DEBIT',
        criterion: 'VALOR_RECUPERABLE', previousAmount: 540_000, previousIsRestated: false, closingAmount: 514_000,
        source: 'Presupuesto de flujos y cotización de mercado', evidence: 'test-deterioro-equipos-2025',
        recoverableAmount: 490_000,
        recoverability: {
            required: true, level: 'ACTIVO_INDIVIDUAL', basis: 'MAYOR_VNR_VALOR_USO', accountingAmount: 516_000,
            netRealizableValue: 470_000, valueInUse: 490_000, recoverableAmount: 490_000,
            impairmentLoss: 26_000, reversal: 0, indicators: ['Caída de demanda del equipo'],
            evidence: 'test-deterioro-equipos-2025', conclusion: 'Corresponde reconocer deterioro por 26.000.',
        },
        difference: -26_000, holdingResultAccountId: 'ibe-impairment', status: 'CONTABILIZADA', journalEntryId: 'ibe-entry-17',
        createdAt: NOW, updatedAt: NOW,
    },
]

export const IBERA_EXPECTED = {
    inventoryBeforeMeasurement: 120_000,
    inventoryAtClose: 135_000,
    fxBeforeMeasurement: 100_000,
    fxAtClose: 118_000,
    ppeBeforeImpairment: 516_000,
    ppeGrossAtClose: 514_000,
    ppeRecoverable: 490_000,
    impairmentLoss: 26_000,
    depreciation: 24_000,
    measurementHoldingGain: 33_000,
    journalEntries: 17,
    indexPeriods: 13,
} as const
