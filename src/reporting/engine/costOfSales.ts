/**
 * Determinación del costo de ventas — Fase 2E (§10).
 *
 * Función PURA del motor: puente EI + Compras (+ costos incorporables)
 * = Bienes disponibles − EF = CMV, derivado exclusivamente de las cuentas
 * con mapping INVENTORIES y de los flujos reales del Diario. La igualdad con
 * el CMV del ER (registro perpetuo) se VERIFICA: si difiere (p. ej. bajas de
 * inventario contra otros egresos), la diferencia se expone con detalle y
 * bloquea la conciliación — jamás se agrega una línea balanceante.
 *
 * Alcances (§10.2):
 * - COMMERCIAL: hay bienes de cambio (saldo o movimientos) ⇒ puente completo.
 * - SERVICES: no hay bienes de cambio pero sí COGS ⇒ costo de servicios según
 *   el ER; EI/EF no aplicables (no se fuerzan existencias).
 * - NOT_APPLICABLE: sin bienes de cambio ni COGS.
 * - Actividad industrial (materias primas / producción en proceso): sin
 *   soporte estructural declarado; no se finge apertura por etapas.
 */

import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type {
    CostOfSalesBridge,
    CostOfSalesValue,
    IncomeStatement2B,
    NormalizedTrialBalance,
    ReportingInput,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

function value(
    amountCents: number | null,
    status: CostOfSalesValue['status'],
    accountIds: string[] = [],
    detail?: string
): CostOfSalesValue {
    return { amount: amountCents === null ? null : fromCents(amountCents), status, accountIds, detail }
}

export function buildCostOfSales(
    input: ReportingInput,
    tb: NormalizedTrialBalance,
    incomeStatement: IncomeStatement2B
): CostOfSalesBridge {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const isInventory = (accountId: string) => byId.get(accountId)?.statementGroup === 'INVENTORIES'

    // ── Existencia inicial: aperturas explícitas + apertura formal ──
    let openingCents = 0
    const inventoryIds = new Set<string>()
    for (const [accountId, ob] of input.openingBalances) {
        if (!isInventory(accountId)) continue
        openingCents += toCents(ob.debit || 0) - toCents(ob.credit || 0)
        inventoryIds.add(accountId)
    }
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (!(entry.sourceModule === 'closing' && entry.sourceType === 'apertura')) continue
        for (const l of entry.lines) {
            if (!isInventory(l.accountId)) continue
            openingCents += toCents(l.debit || 0) - toCents(l.credit || 0)
            inventoryIds.add(l.accountId)
        }
    }

    // ── Flujos del ejercicio sobre bienes de cambio ──────────
    let purchasesCents = 0   // débitos: compras y costos incorporados al inventario
    let outflowCents = 0     // créditos: salidas al costo (y otras bajas)
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (isStructuralClosingEntry(entry)) continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') continue
        for (const l of entry.lines) {
            if (!isInventory(l.accountId)) continue
            purchasesCents += toCents(l.debit || 0)
            outflowCents += toCents(l.credit || 0)
            inventoryIds.add(l.accountId)
        }
    }

    const closingCents = openingCents + purchasesCents - outflowCents
    const accountIds = Array.from(inventoryIds)
    const erCogsCents = toCents(incomeStatement.costOfSales.amount)
    const hasInventoryData = inventoryIds.size > 0 && (openingCents !== 0 || purchasesCents !== 0 || outflowCents !== 0 || closingCents !== 0)
    const hasCogs = erCogsCents !== 0 || incomeStatement.costOfSales.accountIds.length > 0

    const validations: ValidationCheck[] = []
    const check = (id: string, label: string, expected: number, actual: number, detail?: string) => {
        validations.push({
            id, label,
            passed: expected === actual,
            expected: fromCents(expected), actual: fromCents(actual),
            difference: fromCents(actual - expected), detail,
        })
    }

    // ── Modo servicios / no aplicable ────────────────────────
    if (!hasInventoryData) {
        const mode = hasCogs ? 'SERVICES' as const : 'NOT_APPLICABLE' as const
        const na = (detail?: string) => value(null, 'NOT_APPLICABLE', [], detail)
        return {
            mode,
            openingInventory: na('Sin bienes de cambio: no se fuerzan existencias.'),
            purchases: na(),
            incorporableCosts: na(),
            goodsAvailableForSale: na(),
            closingInventory: na(),
            costOfSales: mode === 'SERVICES'
                ? { amount: incomeStatement.costOfSales.amount, status: 'CALCULATED', accountIds: incomeStatement.costOfSales.accountIds, detail: 'Costo de servicios según el ER (sin existencias).' }
                : na('Sin costo registrado en el ejercicio.'),
            costOfSalesPerIncomeStatement: incomeStatement.costOfSales.amount,
            validations,
        }
    }

    // ── Puente comercial ─────────────────────────────────────
    const availableCents = openingCents + purchasesCents
    const bridgeCogsCents = availableCents - closingCents // = outflowCents

    check('cmv-disponibles', 'CMV: bienes disponibles = EI + compras y costos incorporables',
        openingCents + purchasesCents, availableCents)
    check('cmv-puente-interno', 'CMV: disponibles − existencia final = CMV del puente',
        availableCents - closingCents, bridgeCogsCents)

    // Conciliación con el ER: si difiere hay salidas de inventario que no
    // fueron al CMV (bajas, siniestros); se expone la diferencia, sin plug.
    check('cmv-er', 'CMV del puente = CMV del Estado de Resultados',
        erCogsCents, bridgeCogsCents,
        erCogsCents !== bridgeCogsCents
            ? `Diferencia ${fromCents(bridgeCogsCents - erCogsCents)}: hay movimientos de bienes de cambio que no se imputaron a CMV (revisar bajas/ajustes de inventario).`
            : undefined)

    // Existencia final del puente = bienes de cambio del ESP (mismas cuentas)
    let espInventoryCents = 0
    for (const row of tb.rows) {
        if (isInventory(row.accountId)) espInventoryCents += toCents(row.closing)
    }
    check('cmv-ef-esp', 'CMV: existencia final del puente = Bienes de cambio del ESP',
        espInventoryCents, closingCents)

    const bridge: CostOfSalesBridge = {
        mode: 'COMMERCIAL',
        openingInventory: value(openingCents, 'CALCULATED', accountIds),
        purchases: value(purchasesCents, 'CALCULATED', accountIds,
            'Débitos del ejercicio a bienes de cambio: compras y costos incorporables activados.'),
        incorporableCosts: value(null, 'NOT_APPLICABLE', [],
            'Los costos incorporables debitados a bienes de cambio ya integran la línea de compras; no hay categoría estructural separada.'),
        goodsAvailableForSale: value(availableCents, 'CALCULATED', accountIds),
        closingInventory: value(closingCents, 'CALCULATED', accountIds),
        costOfSales: value(bridgeCogsCents, 'CALCULATED', incomeStatement.costOfSales.accountIds),
        costOfSalesPerIncomeStatement: incomeStatement.costOfSales.amount,
        validations,
    }

    // Comparativo: componentes del puente del ejercicio anterior (mismo motor)
    const prev = input.comparative?.costOfSales
    if (prev) {
        bridge.openingInventory.comparativeAmount = prev.openingInventory.amount
        bridge.purchases.comparativeAmount = prev.purchases.amount
        bridge.goodsAvailableForSale.comparativeAmount = prev.goodsAvailableForSale.amount
        bridge.closingInventory.comparativeAmount = prev.closingInventory.amount
        bridge.costOfSales.comparativeAmount = prev.costOfSales.amount
    }

    return bridge
}
