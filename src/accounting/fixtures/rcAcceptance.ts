/**
 * Dataset de aceptación "ContaLivre RC Acceptance" — Fase 2F (§5).
 *
 * Fixture DETERMINISTA para la validación visual y E2E de la Release
 * Candidate. No es la Práctica guiada: es un juego de datos de testing,
 * identificado como tal, con ejercicios FIJOS 2024 (comparativo) y 2025
 * (actual) — nunca depende de la fecha del sistema.
 *
 * Reglas:
 * - Todas las cuentas del fixture usan ids/códigos con prefijo `rc-` / "RC".
 * - Todos los asientos se contabilizan por la puerta ÚNICA (postOperation),
 *   etiquetados sourceModule='rc-fixture' (idempotentes por sourceId).
 * - Solo se carga sobre una base SIN asientos reales (guardia explícita):
 *   jamás se mezcla con datos del usuario.
 * - La eliminación en entorno de prueba es el reseteo total existente
 *   (resetService); no hay borrado selectivo de asientos POSTED.
 * - La variante "sin mapping" agrega un gasto sin statementGroup para
 *   demostrar el estado BLOQUEADO; se revierte con la reversión uniforme.
 */

import { db } from '../../storage/db'
import { postOperation, voidOperationEntry } from '../application/journalService'
import { postClosing, generateOpeningEntry } from '../application/closingService'
import { exerciseIdForYear } from '../application/contextService'
import type { Account, ExpenseAllocationRule } from '../../core/models'

export const RC_FIXTURE_MODULE = 'rc-fixture'
export const RC_PREFIX = 'rc-'

/** Años FIJOS del dataset (independientes de la fecha actual) */
export const RC_PRIOR_YEAR = 2024
export const RC_CURRENT_YEAR = 2025

function acc(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: 'CURRENT',
        group: partial.group ?? 'RC Acceptance',
        statementGroup: null,
        parentId: null,
        level: 1,
        normalSide: ['ASSET', 'EXPENSE'].includes(partial.kind) ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        active: true,
        isPostable: true,
        ...partial,
    }
}

/** Plan de cuentas del fixture (mappings estructurales completos) */
export const RC_ACCOUNTS: Account[] = [
    acc({ id: 'rc-caja', code: 'RC.1.01', name: 'RC Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', monetaryClassification: 'MONETARY' }),
    acc({ id: 'rc-banco-usd', code: 'RC.1.02', name: 'RC Banco cuenta en dólares', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', currency: 'USD', monetaryClassification: 'MONETARY' }),
    acc({ id: 'rc-inversiones', code: 'RC.1.03', name: 'RC Inversiones transitorias', kind: 'ASSET', statementGroup: 'INVESTMENTS' }),
    acc({ id: 'rc-deudores', code: 'RC.1.04', name: 'RC Deudores por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    acc({ id: 'rc-prevision', code: 'RC.1.05', name: 'RC Previsión para incobrables', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES', isContra: true, normalSide: 'CREDIT' }),
    acc({ id: 'rc-mercaderias', code: 'RC.1.06', name: 'RC Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES', monetaryClassification: 'NON_MONETARY' }),
    acc({ id: 'rc-rodados', code: 'RC.1.07', name: 'RC Rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Rodados', monetaryClassification: 'NON_MONETARY' }),
    acc({ id: 'rc-amort-rodados', code: 'RC.1.08', name: 'RC Amortización acumulada rodados', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT', annexGroup: 'Rodados', isContra: true, normalSide: 'CREDIT', monetaryClassification: 'NON_MONETARY' }),
    acc({ id: 'rc-proveedores', code: 'RC.2.01', name: 'RC Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES', monetaryClassification: 'MONETARY' }),
    acc({ id: 'rc-prestamos', code: 'RC.2.02', name: 'RC Préstamos bancarios', kind: 'LIABILITY', statementGroup: 'LOANS', monetaryClassification: 'MONETARY' }),
    acc({ id: 'rc-sueldos-pagar', code: 'RC.2.03', name: 'RC Remuneraciones a pagar', kind: 'LIABILITY', statementGroup: 'PAYROLL_LIABILITIES', monetaryClassification: 'MONETARY' }),
    acc({ id: 'rc-ig-pagar', code: 'RC.2.04', name: 'RC Impuesto a las ganancias a pagar', kind: 'LIABILITY', statementGroup: 'TAX_LIABILITIES', monetaryClassification: 'MONETARY' }),
    acc({ id: 'rc-capital', code: 'RC.3.01', name: 'RC Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL' }),
    acc({ id: 'rc-ajuste-capital', code: 'RC.3.02', name: 'RC Ajuste del capital', kind: 'EQUITY', statementGroup: 'CAPITAL', equityComponent: 'CAPITAL_ADJUSTMENT' }),
    acc({ id: 'rc-reserva-legal', code: 'RC.3.03', name: 'RC Reserva legal', kind: 'EQUITY', statementGroup: 'RESERVES', equityComponent: 'LEGAL_RESERVE' }),
    acc({ id: 'rc-rna', code: 'RC.3.04', name: 'RC Resultados no asignados', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS', equityComponent: 'PRIOR_RETAINED_EARNINGS' }),
    acc({ id: 'rc-resultado-ejercicio', code: 'RC.3.05', name: 'RC Resultado del ejercicio', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS', equityComponent: 'CURRENT_RESULT' }),
    acc({ id: 'rc-ventas', code: 'RC.4.01', name: 'RC Ventas', kind: 'INCOME', statementGroup: 'SALES' }),
    acc({ id: 'rc-dif-cambio', code: 'RC.4.02', name: 'RC Diferencias de cambio ganadas', kind: 'INCOME', statementGroup: 'FINANCIAL_INCOME' }),
    acc({ id: 'rc-cmv', code: 'RC.5.01', name: 'RC Costo de mercaderías vendidas', kind: 'EXPENSE', statementGroup: 'COGS' }),
    acc({ id: 'rc-gastos-adm', code: 'RC.5.02', name: 'RC Sueldos y cargas', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    acc({ id: 'rc-quebrantos', code: 'RC.5.03', name: 'RC Quebrantos por incobrabilidad', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    acc({ id: 'rc-deprec', code: 'RC.5.04', name: 'RC Depreciación bienes de uso', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    acc({ id: 'rc-alquileres', code: 'RC.5.05', name: 'RC Alquileres', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES' }),
    acc({ id: 'rc-gastos-com', code: 'RC.5.06', name: 'RC Publicidad', kind: 'EXPENSE', statementGroup: 'SELLING_EXPENSES' }),
    acc({ id: 'rc-intereses', code: 'RC.5.07', name: 'RC Intereses perdidos', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES' }),
    acc({ id: 'rc-recpam', code: 'RC.5.08', name: 'RC RECPAM', kind: 'EXPENSE', statementGroup: 'FINANCIAL_EXPENSES', allowOppositeBalance: true }),
    acc({ id: 'rc-ig', code: 'RC.5.09', name: 'RC Impuesto a las ganancias', kind: 'EXPENSE', statementGroup: 'INCOME_TAX' }),
    // Variante controlada: gasto SIN mapping (statementGroup null) para
    // demostrar el estado bloqueado. Sin saldo en el dataset base.
    acc({ id: 'rc-gasto-sin-mapping', code: 'RC.5.99', name: 'RC Gasto sin mapping (demo)', kind: 'EXPENSE', statementGroup: null }),
]

/** Regla de distribución 60/40 del gasto de alquileres (§5.1 "gasto parcialmente distribuido") */
export const RC_ALLOCATION_RULE: ExpenseAllocationRule = {
    id: 'rc-rule-alquileres',
    accountId: 'rc-alquileres',
    validFrom: `${RC_CURRENT_YEAR}-01-01`,
    allocations: [
        { function: 'ADMINISTRATION', percentage: 60 },
        { function: 'SELLING', percentage: 40 },
    ],
    reason: 'RC Acceptance: superficie ocupada 60/40 (fixture determinista)',
    createdBy: 'rc-fixture',
    createdAt: `${RC_CURRENT_YEAR}-01-01T00:00:00.000Z`,
    version: 1,
}

interface FxLine { accountId: string; debit: number; credit: number }
interface FxEntry { date: string; memo: string; type: string; lines: FxLine[]; equityMovementType?: import('../../core/models').EquityMovementType }

const d = (accountId: string, amount: number): FxLine => ({ accountId, debit: amount, credit: 0 })
const h = (accountId: string, amount: number): FxLine => ({ accountId, credit: amount, debit: 0 })

/** Asientos del ejercicio comparativo 2024 */
export const RC_ENTRIES_PRIOR: FxEntry[] = [
    { date: `${RC_PRIOR_YEAR}-01-05`, memo: 'RC Aporte de capital inicial', type: 'aporte', lines: [d('rc-caja', 1000000), h('rc-capital', 1000000)] },
    { date: `${RC_PRIOR_YEAR}-02-01`, memo: 'RC Compra de mercaderías contado', type: 'compra', lines: [d('rc-mercaderias', 400000), h('rc-caja', 400000)] },
    { date: `${RC_PRIOR_YEAR}-03-01`, memo: 'RC Venta contado', type: 'venta', lines: [d('rc-caja', 700000), h('rc-ventas', 700000)] },
    { date: `${RC_PRIOR_YEAR}-03-01`, memo: 'RC Costo de la venta', type: 'cmv', lines: [d('rc-cmv', 250000), h('rc-mercaderias', 250000)] },
    { date: `${RC_PRIOR_YEAR}-05-01`, memo: 'RC Gastos de administración pagados', type: 'gasto', lines: [d('rc-gastos-adm', 120000), h('rc-caja', 120000)] },
    { date: `${RC_PRIOR_YEAR}-12-31`, memo: 'RC Impuesto a las ganancias devengado', type: 'ig', lines: [d('rc-ig', 66000), h('rc-ig-pagar', 66000)] },
]

/** Asientos del ejercicio actual 2025 */
export const RC_ENTRIES_CURRENT: FxEntry[] = [
    { date: `${RC_CURRENT_YEAR}-01-08`, memo: 'RC AREA: gasto omitido en 2024 (modificación de ejercicios anteriores)', type: 'area', equityMovementType: 'PRIOR_PERIOD_ADJUSTMENT', lines: [d('rc-rna', 20000), h('rc-proveedores', 20000)] },
    { date: `${RC_CURRENT_YEAR}-01-15`, memo: 'RC Aporte de los propietarios', type: 'aporte', lines: [d('rc-caja', 300000), h('rc-capital', 300000)] },
    { date: `${RC_CURRENT_YEAR}-01-20`, memo: 'RC Capitalización parcial de resultados', type: 'capitalizacion', lines: [d('rc-rna', 50000), h('rc-ajuste-capital', 50000)] },
    { date: `${RC_CURRENT_YEAR}-02-01`, memo: 'RC Constitución de reserva legal (5%)', type: 'reserva', lines: [d('rc-rna', 13200), h('rc-reserva-legal', 13200)] },
    { date: `${RC_CURRENT_YEAR}-02-15`, memo: 'RC Distribución de dividendos en efectivo', type: 'dividendos', lines: [d('rc-rna', 80000), h('rc-caja', 80000)] },
    { date: `${RC_CURRENT_YEAR}-03-01`, memo: 'RC Desafectación parcial de reserva', type: 'desafectacion', lines: [d('rc-reserva-legal', 3200), h('rc-rna', 3200)] },
    { date: `${RC_CURRENT_YEAR}-03-10`, memo: 'RC Compra de mercaderías a crédito', type: 'compra', lines: [d('rc-mercaderias', 500000), h('rc-proveedores', 500000)] },
    { date: `${RC_CURRENT_YEAR}-03-20`, memo: 'RC Venta a crédito', type: 'venta', lines: [d('rc-deudores', 900000), h('rc-ventas', 900000)] },
    { date: `${RC_CURRENT_YEAR}-03-20`, memo: 'RC Costo de la venta', type: 'cmv', lines: [d('rc-cmv', 450000), h('rc-mercaderias', 450000)] },
    { date: `${RC_CURRENT_YEAR}-04-01`, memo: 'RC Cobranza a clientes', type: 'cobro', lines: [d('rc-caja', 600000), h('rc-deudores', 600000)] },
    { date: `${RC_CURRENT_YEAR}-04-15`, memo: 'RC Pago a proveedores', type: 'pago', lines: [d('rc-proveedores', 300000), h('rc-caja', 300000)] },
    { date: `${RC_CURRENT_YEAR}-05-01`, memo: 'RC Compra de rodado con préstamo (sin efecto en efectivo)', type: 'ppe', lines: [d('rc-rodados', 240000), h('rc-prestamos', 240000)] },
    { date: `${RC_CURRENT_YEAR}-05-10`, memo: 'RC Compra de inversiones transitorias', type: 'inversion', lines: [d('rc-inversiones', 100000), h('rc-caja', 100000)] },
    { date: `${RC_CURRENT_YEAR}-06-01`, memo: 'RC Compra de USD (transferencia entre efectivo)', type: 'fx-compra', lines: [d('rc-banco-usd', 120000), h('rc-caja', 120000)] },
    { date: `${RC_CURRENT_YEAR}-06-30`, memo: 'RC Diferencia de cambio ganada sobre USD', type: 'fx-dif', lines: [d('rc-banco-usd', 30000), h('rc-dif-cambio', 30000)] },
    { date: `${RC_CURRENT_YEAR}-07-01`, memo: 'RC Sueldos devengados', type: 'sueldos', lines: [d('rc-gastos-adm', 150000), h('rc-sueldos-pagar', 150000)] },
    { date: `${RC_CURRENT_YEAR}-07-05`, memo: 'RC Pago de sueldos', type: 'pago-sueldos', lines: [d('rc-sueldos-pagar', 100000), h('rc-caja', 100000)] },
    { date: `${RC_CURRENT_YEAR}-08-01`, memo: 'RC Publicidad pagada', type: 'gasto-com', lines: [d('rc-gastos-com', 60000), h('rc-caja', 60000)] },
    { date: `${RC_CURRENT_YEAR}-08-15`, memo: 'RC Alquileres pagados (gasto distribuido 60/40)', type: 'alquiler', lines: [d('rc-alquileres', 90000), h('rc-caja', 90000)] },
    { date: `${RC_CURRENT_YEAR}-09-01`, memo: 'RC Intereses del préstamo pagados', type: 'intereses', lines: [d('rc-intereses', 24000), h('rc-caja', 24000)] },
    { date: `${RC_CURRENT_YEAR}-10-01`, memo: 'RC Constitución de previsión para incobrables', type: 'prevision', lines: [d('rc-quebrantos', 30000), h('rc-prevision', 30000)] },
    { date: `${RC_CURRENT_YEAR}-12-31`, memo: 'RC Depreciación del rodado', type: 'deprec', lines: [d('rc-deprec', 24000), h('rc-amort-rodados', 24000)] },
    { date: `${RC_CURRENT_YEAR}-12-31`, memo: 'RC Reexpresión del capital (RECPAM)', type: 'recpam', equityMovementType: 'OTHER', lines: [d('rc-recpam', 40000), h('rc-ajuste-capital', 40000)] },
    { date: `${RC_CURRENT_YEAR}-12-31`, memo: 'RC Impuesto a las ganancias devengado', type: 'ig', lines: [d('rc-ig', 30000), h('rc-ig-pagar', 30000)] },
]

/**
 * Saldos esperados documentados (golden, en $):
 * 2024: resultado 264.000 (700.000 − 250.000 − 120.000 − 66.000); caja 1.180.000.
 * 2025: resultado 32.000; antes de impuesto 62.000; IG 30.000;
 *       PN cierre 1.536.000 (1.264.000 − 20.000 AREA + 300.000 aporte
 *       − 80.000 dividendos + 40.000 reexpresión + 32.000 resultado);
 *       CMV puente: EI 150.000 + compras 500.000 − EF 200.000 = 450.000;
 *       gastos por función: ADMIN 258.000 · SELLING 96.000 · FINANCIAL 64.000
 *       (alquileres 90.000 repartidos 54.000/36.000 por regla);
 *       efectivo final 1.356.000 (incluye rc-banco-usd 150.000).
 */
export const RC_EXPECTED = {
    priorNetIncome: 264000,
    priorClosingCash: 1180000,
    currentPreTax: 62000,
    currentIncomeTax: 30000,
    currentNetIncome: 32000,
    currentEquity: 1536000,
    cmvBridge: { opening: 150000, purchases: 500000, closing: 200000, cogs: 450000 },
    expensesByFunction: { ADMINISTRATION: 258000, SELLING: 96000, FINANCIAL: 64000, total: 418000 },
    fxMeasurement: 150000,
    currentClosingCash: 1356000,
} as const

/** ¿La base contiene SOLO datos del fixture (o está vacía)? */
export async function isSafeToLoad(): Promise<{ safe: boolean; reason?: string }> {
    const entries = await db.entries.toArray()
    const foreign = entries.filter(e =>
        e.status !== 'DRAFT'
        && e.sourceModule !== RC_FIXTURE_MODULE
        && e.sourceModule !== 'closing')
    if (foreign.length > 0) {
        return { safe: false, reason: `La base tiene ${foreign.length} asiento(s) reales; el fixture RC solo se carga sobre una base limpia (usá el reseteo total primero).` }
    }
    return { safe: true }
}

export interface RcLoadResult {
    accounts: number
    entriesPrior: number
    entriesCurrent: number
    closedPrior: boolean
    idempotent: boolean
}

/**
 * Carga el dataset completo: plan rc-, asientos 2024, cierre + apertura,
 * asientos 2025 y la regla de distribución. Idempotente (sourceIds fijos).
 */
export async function loadRcAcceptanceDataset(): Promise<RcLoadResult> {
    const guard = await isSafeToLoad()
    if (!guard.safe) throw new Error(guard.reason)

    await db.accounts.bulkPut(RC_ACCOUNTS)
    await db.expenseAllocationRules.put(RC_ALLOCATION_RULE)

    let idempotent = true
    const post = async (e: FxEntry, i: number, year: number) => {
        const res = await postOperation({
            date: e.date, memo: e.memo, lines: e.lines,
            sourceModule: RC_FIXTURE_MODULE, sourceType: e.type, sourceId: `rc-${year}-${i}`,
            equityMovementType: e.equityMovementType,
        })
        if (!res.idempotentHit) idempotent = false
    }

    for (let i = 0; i < RC_ENTRIES_PRIOR.length; i++) await post(RC_ENTRIES_PRIOR[i], i, RC_PRIOR_YEAR)

    // Cierre 2024 + apertura 2025 (una sola vez)
    const priorExerciseId = exerciseIdForYear(RC_PRIOR_YEAR)
    const alreadyClosed = (await db.entries.toArray()).some(e =>
        e.sourceModule === 'closing' && e.sourceType === 'apertura' && e.status !== 'DRAFT')
    let closedPrior = false
    if (!alreadyClosed) {
        await postClosing(priorExerciseId)
        await generateOpeningEntry(priorExerciseId)
        closedPrior = true
    }

    for (let i = 0; i < RC_ENTRIES_CURRENT.length; i++) await post(RC_ENTRIES_CURRENT[i], i, RC_CURRENT_YEAR)

    return {
        accounts: RC_ACCOUNTS.length,
        entriesPrior: RC_ENTRIES_PRIOR.length,
        entriesCurrent: RC_ENTRIES_CURRENT.length,
        closedPrior,
        idempotent,
    }
}

const UNMAPPED_SOURCE_ID = 'rc-2025-unmapped-demo'

/** Variante controlada: agrega un gasto SIN mapping ⇒ estados BLOQUEADOS */
export async function postRcUnmappedVariant(): Promise<void> {
    await postOperation({
        date: `${RC_CURRENT_YEAR}-11-15`,
        memo: 'RC DEMO: gasto sin mapping (bloquea la publicación)',
        lines: [d('rc-gasto-sin-mapping', 10000), h('rc-caja', 10000)],
        sourceModule: RC_FIXTURE_MODULE, sourceType: 'unmapped-demo', sourceId: UNMAPPED_SOURCE_ID,
    })
}

/** Revierte la variante (reversión uniforme; el neto vuelve a 0 y valida) */
export async function revertRcUnmappedVariant(): Promise<boolean> {
    const entry = (await db.entries.toArray()).find(e =>
        e.sourceModule === RC_FIXTURE_MODULE && e.sourceType === 'unmapped-demo'
        && e.sourceId === UNMAPPED_SOURCE_ID && e.status === 'POSTED')
    if (!entry) return false
    await voidOperationEntry(entry.id, { reason: 'RC: fin de la demo de estado bloqueado' })
    return true
}

/** ¿El dataset está cargado? (para la UI del panel) */
export async function isRcDatasetLoaded(): Promise<boolean> {
    const first = await db.entries.toArray()
    return first.some(e => e.sourceModule === RC_FIXTURE_MODULE)
}
