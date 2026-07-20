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

    // ── Flujos del ejercicio sobre bienes de cambio, desglosados ──
    // Los débitos a inventario se clasifican por el costComponent del contra
    // (compras/adquisición/otros incorporables); los créditos, por el contra
    // (devoluciones que restan, bajas anormales aisladas, resto = CMV).
    // Sin mapping (modelo perpetuo 2E): débitos = compras, créditos = CMV.
    let purchasesCents = 0
    let acquisitionCents = 0
    let otherIncorporableCents = 0
    let purchaseReturnsCents = 0
    let abnormalLossCents = 0
    let cmvOutflowCents = 0
    const componentAccountIds: Record<string, Set<string>> = {
        purchases: new Set(), acquisition: new Set(), other: new Set(),
        returns: new Set(), abnormal: new Set(), cmv: new Set(),
    }

    const contraComponent = (entry: typeof input.entries[number]): string | undefined => {
        for (const l of entry.lines) {
            if (isInventory(l.accountId)) continue
            const cc = byId.get(l.accountId)?.costComponent
            if (cc) return cc
        }
        return undefined
    }

    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (isStructuralClosingEntry(entry)) continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') continue
        const cc = contraComponent(entry)
        for (const l of entry.lines) {
            if (!isInventory(l.accountId)) continue
            inventoryIds.add(l.accountId)
            const debitCents = toCents(l.debit || 0)
            const creditCents = toCents(l.credit || 0)
            if (debitCents !== 0) {
                if (cc === 'ACQUISITION_COST') { acquisitionCents += debitCents; componentAccountIds.acquisition.add(l.accountId) }
                else if (cc === 'OTHER_INCORPORABLE_COST') { otherIncorporableCents += debitCents; componentAccountIds.other.add(l.accountId) }
                else { purchasesCents += debitCents; componentAccountIds.purchases.add(l.accountId) }
            }
            if (creditCents !== 0) {
                if (cc === 'PURCHASE_RETURNS') { purchaseReturnsCents += creditCents; componentAccountIds.returns.add(l.accountId) }
                else if (cc === 'ABNORMAL_LOSS') { abnormalLossCents += creditCents; componentAccountIds.abnormal.add(l.accountId) }
                else { cmvOutflowCents += creditCents; componentAccountIds.cmv.add(l.accountId) }
            }
        }
    }

    const totalOutflowCents = purchaseReturnsCents + abnormalLossCents + cmvOutflowCents
    const totalInflowCents = purchasesCents + acquisitionCents + otherIncorporableCents
    const closingCents = openingCents + totalInflowCents - totalOutflowCents
    const accountIds = Array.from(inventoryIds)
    const erCogsCents = toCents(incomeStatement.costOfSales.amount)
    const hasInventoryData = inventoryIds.size > 0 && (openingCents !== 0 || totalInflowCents !== 0 || totalOutflowCents !== 0 || closingCents !== 0)
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
            purchaseReturns: na(),
            acquisitionCosts: na(),
            incorporableCosts: na(),
            goodsAvailableForSale: na(),
            closingInventory: na(),
            abnormalLosses: na(),
            costOfSales: mode === 'SERVICES'
                ? { amount: incomeStatement.costOfSales.amount, status: 'CALCULATED', accountIds: incomeStatement.costOfSales.accountIds, detail: 'Costo de servicios según el ER (sin existencias).' }
                : na('Sin costo registrado en el ejercicio.'),
            costOfSalesPerIncomeStatement: incomeStatement.costOfSales.amount,
            validations,
        }
    }

    // ── Puente comercial ─────────────────────────────────────
    // Disponibles = EI + compras − devoluciones + adquisición + otros
    const availableCents = openingCents + purchasesCents - purchaseReturnsCents + acquisitionCents + otherIncorporableCents
    // CMV puro = disponibles − EF − bajas anormales (que salieron pero no son costo)
    const bridgeCogsCents = availableCents - closingCents - abnormalLossCents // = cmvOutflowCents

    check('cmv-disponibles', 'CMV: bienes disponibles = EI + compras − devoluciones + adquisición + otros',
        openingCents + purchasesCents - purchaseReturnsCents + acquisitionCents + otherIncorporableCents, availableCents)
    check('cmv-puente-interno', 'CMV: disponibles − existencia final − bajas anormales = CMV del puente',
        availableCents - closingCents - abnormalLossCents, bridgeCogsCents)

    // Conciliación con el ER: con las bajas anormales YA aisladas, el puente
    // debe igualar al CMV del ER. Si aún difiere, se expone la diferencia sin plug.
    check('cmv-er', 'CMV del puente = CMV del Estado de Resultados',
        erCogsCents, bridgeCogsCents,
        erCogsCents !== bridgeCogsCents
            ? `Diferencia ${fromCents(bridgeCogsCents - erCogsCents)}: hay movimientos de bienes de cambio sin componente de costo mapeado (revisar bajas/ajustes de inventario).`
            : undefined)

    // Existencia final del puente = bienes de cambio del ESP (mismas cuentas)
    let espInventoryCents = 0
    for (const row of tb.rows) {
        if (isInventory(row.accountId)) espInventoryCents += toCents(row.closing)
    }
    check('cmv-ef-esp', 'CMV: existencia final del puente = Bienes de cambio del ESP',
        espInventoryCents, closingCents)

    // Un componente en 0 sin cuentas que lo alimenten es NOT_APPLICABLE (no un cero fingido)
    const comp = (cents: number, ids: Set<string>, detail?: string): CostOfSalesValue =>
        ids.size === 0 && cents === 0 ? value(null, 'NOT_APPLICABLE', [], detail) : value(cents, 'CALCULATED', Array.from(ids), detail)

    const bridge: CostOfSalesBridge = {
        mode: 'COMMERCIAL',
        openingInventory: value(openingCents, 'CALCULATED', accountIds),
        purchases: value(purchasesCents, 'CALCULATED', Array.from(componentAccountIds.purchases),
            'Débitos del ejercicio a bienes de cambio: compras del período.'),
        purchaseReturns: comp(purchaseReturnsCents, componentAccountIds.returns,
            'Devoluciones y bonificaciones de compras (mapping costComponent PURCHASE_RETURNS).'),
        acquisitionCosts: comp(acquisitionCents, componentAccountIds.acquisition,
            'Fletes y costos de adquisición activados al inventario (costComponent ACQUISITION_COST).'),
        incorporableCosts: comp(otherIncorporableCents, componentAccountIds.other,
            'Otros costos incorporables (costComponent OTHER_INCORPORABLE_COST).'),
        goodsAvailableForSale: value(availableCents, 'CALCULATED', accountIds),
        closingInventory: value(closingCents, 'CALCULATED', accountIds),
        abnormalLosses: comp(abnormalLossCents, componentAccountIds.abnormal,
            'Pérdidas/bajas anormales de inventario: se exponen como diferencia real, no integran el CMV.'),
        costOfSales: value(bridgeCogsCents, 'CALCULATED', incomeStatement.costOfSales.accountIds),
        costOfSalesPerIncomeStatement: incomeStatement.costOfSales.amount,
        validations,
    }

    // Comparativo: componentes del puente del ejercicio anterior (mismo motor)
    const prev = input.comparative?.costOfSales
    if (prev) {
        bridge.openingInventory.comparativeAmount = prev.openingInventory.amount
        bridge.purchases.comparativeAmount = prev.purchases.amount
        bridge.purchaseReturns.comparativeAmount = prev.purchaseReturns.amount
        bridge.acquisitionCosts.comparativeAmount = prev.acquisitionCosts.amount
        bridge.incorporableCosts.comparativeAmount = prev.incorporableCosts.amount
        bridge.goodsAvailableForSale.comparativeAmount = prev.goodsAvailableForSale.amount
        bridge.closingInventory.comparativeAmount = prev.closingInventory.amount
        bridge.abnormalLosses.comparativeAmount = prev.abnormalLosses.amount
        bridge.costOfSales.comparativeAmount = prev.costOfSales.amount
    }

    return bridge
}
