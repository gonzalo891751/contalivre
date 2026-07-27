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
    ProductionCostBlock,
    ReportingInput,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

/**
 * Componentes del costo de producción del período (Fase 2H §H6).
 *
 * Se agrupan por `costComponent` cuando está mapeado y, en su defecto, por la
 * naturaleza declarada de la cuenta. La detección es estructural: una cuenta
 * entra si es de costo (statementGroup COGS) y su función es PRODUCTION.
 */
function collectProductionCosts(input: ReportingInput, tb: NormalizedTrialBalance) {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const buckets = {
        materials: { cents: 0, ids: new Set<string>() },
        labor: { cents: 0, ids: new Set<string>() },
        indirect: { cents: 0, ids: new Set<string>() },
        depreciation: { cents: 0, ids: new Set<string>() },
    }
    const accountIds = new Set<string>()
    let totalCents = 0

    for (const row of tb.rows) {
        const account = byId.get(row.accountId)
        if (!account || account.isHeader) continue
        if (account.statementGroup !== 'COGS') continue
        if (account.resultFunction !== 'PRODUCTION') continue

        // Costo CARGADO a producción en el período. Se usa el débito del período
        // y no el saldo de cierre porque, si el costo se capitalizó a producción
        // en proceso, la cuenta queda saldada y el saldo sería cero pese a que el
        // costo sí se incurrió.
        const cents = toCents(row.periodDebit)
        if (cents === 0 && row.entryIds.length === 0) continue

        // Clasificación por el código de la subcuenta de costo de producción,
        // que es parte del catálogo sectorial (no una heurística por nombre).
        const bucket = account.code.includes('.01')
            ? buckets.labor
            : account.code.includes('.02')
              ? buckets.materials
              : account.code.includes('.04')
                ? buckets.depreciation
                : buckets.indirect

        bucket.cents += cents
        bucket.ids.add(row.accountId)
        accountIds.add(row.accountId)
        totalCents += cents
    }

    return { ...buckets, totalCents, accountIds }
}

/** Saldos de apertura y cierre de las cuentas de un annexGroup / código dado. */
function stageBalances(
    input: ReportingInput,
    tb: NormalizedTrialBalance,
    matches: (code: string) => boolean
) {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const ids = new Set<string>()
    let openingCents = 0
    let closingCents = 0

    for (const [accountId, ob] of input.openingBalances) {
        const account = byId.get(accountId)
        if (!account || !matches(account.code)) continue
        openingCents += toCents(ob.debit || 0) - toCents(ob.credit || 0)
        ids.add(accountId)
    }
    for (const row of tb.rows) {
        const account = byId.get(row.accountId)
        if (!account || !matches(account.code)) continue
        closingCents += toCents(row.closing)
        ids.add(row.accountId)
    }
    return { openingCents, closingCents, ids }
}

function value(
    amountCents: number | null,
    status: CostOfSalesValue['status'],
    accountIds: string[] = [],
    detail?: string
): CostOfSalesValue {
    return { amount: amountCents === null ? null : fromCents(amountCents), status, accountIds, detail }
}

/**
 * Arma el bloque de producción y sus conciliaciones (Fase 2H §H6).
 *
 * Todos los subtotales son DERIVADOS. Se agregan dos controles: que el costo de
 * producción sea la suma exacta de sus componentes y que la cadena
 * producción → terminados → vendidos cierre contra el CMV del puente.
 */
function buildProductionBlock(
    input: ReportingInput,
    tb: NormalizedTrialBalance,
    production: ReturnType<typeof collectProductionCosts>,
    bridgeCogsCents: number,
    check: (id: string, label: string, expected: number, actual: number, detail?: string) => void
): ProductionCostBlock {
    // Etapas por código del catálogo sectorial: producción en proceso y
    // productos terminados (industria) o producción agropecuaria en proceso.
    const wip = stageBalances(input, tb, code => code.startsWith('1.1.10.02') || code.startsWith('1.1.08.03'))
    const finished = stageBalances(input, tb, code => code.startsWith('1.1.10.03') || code.startsWith('1.1.08.01'))

    const productionCostCents = production.materials.cents + production.labor.cents
        + production.indirect.cents + production.depreciation.cents

    check('costo-produccion-suma',
        'Costo de producción = materia prima + mano de obra + costos indirectos + depreciaciones',
        production.materials.cents + production.labor.cents + production.indirect.cents + production.depreciation.cents,
        productionCostCents)

    // Costo de lo terminado = costo de producción + PP inicial − PP final
    const finishedCostCents = productionCostCents + wip.openingCents - wip.closingCents
    // Costo de lo vendido = terminados + PT inicial − PT final
    const soldCents = finishedCostCents + finished.openingCents - finished.closingCents

    check('costo-produccion-terminados',
        'Costo de productos terminados = costo de producción + producción en proceso inicial − final',
        productionCostCents + wip.openingCents - wip.closingCents, finishedCostCents)

    // Conciliación final: la vía de producción debe llegar al mismo costo que el
    // puente de existencias. Si difiere, se expone; jamás se agrega un plug.
    check('costo-produccion-cmv',
        'Costo de productos vendidos por producción = CMV del puente de existencias',
        bridgeCogsCents, soldCents,
        bridgeCogsCents !== soldCents
            ? `Diferencia ${fromCents(soldCents - bridgeCogsCents)}: revisar el mapping de las cuentas de costo de producción y de las etapas de inventario.`
            : undefined)

    const v = (cents: number, ids: Set<string>, detail?: string): CostOfSalesValue =>
        ids.size === 0 && cents === 0
            ? value(null, 'NOT_APPLICABLE', [], detail)
            : value(cents, 'CALCULATED', Array.from(ids), detail)

    return {
        directMaterials: v(production.materials.cents, production.materials.ids,
            'Materias primas e insumos consumidos en el período.'),
        directLabor: v(production.labor.cents, production.labor.ids,
            'Mano de obra directa afectada a producción.'),
        indirectCosts: v(production.indirect.cents, production.indirect.ids,
            'Costos indirectos de producción.'),
        productionDepreciation: v(production.depreciation.cents, production.depreciation.ids,
            'Depreciaciones de bienes afectados a producción (no implican salida de efectivo).'),
        productionCost: value(productionCostCents, 'CALCULATED', Array.from(production.accountIds),
            'Subtotal derivado: suma de los componentes del costo de producción del período.'),
        workInProcessOpening: v(wip.openingCents, wip.ids, 'Producción en proceso al inicio.'),
        workInProcessClosing: v(wip.closingCents, wip.ids, 'Producción en proceso al cierre.'),
        finishedGoodsCost: value(finishedCostCents, 'CALCULATED', Array.from(wip.ids),
            'Costo de lo terminado en el período.'),
        finishedGoodsOpening: v(finished.openingCents, finished.ids, 'Productos terminados al inicio.'),
        finishedGoodsClosing: v(finished.closingCents, finished.ids, 'Productos terminados al cierre.'),
        costOfGoodsSold: value(soldCents, 'CALCULATED', Array.from(finished.ids),
            'Costo de los productos vendidos determinado por la vía de producción.'),
    }
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
    // Existencias que salieron del inventario hacia el proceso productivo: son
    // salida real, pero no son costo de ventas (Fase 2H §H6).
    let transferredToProductionCents = 0
    const componentAccountIds: Record<string, Set<string>> = {
        purchases: new Set(), acquisition: new Set(), other: new Set(),
        returns: new Set(), abnormal: new Set(), cmv: new Set(), toProduction: new Set(),
    }

    const contraComponent = (entry: typeof input.entries[number]): string | undefined => {
        for (const l of entry.lines) {
            if (isInventory(l.accountId)) continue
            const cc = byId.get(l.accountId)?.costComponent
            if (cc) return cc
        }
        return undefined
    }

    /**
     * ¿El contra del asiento es el pool de costos de producción? (Fase 2H §H6)
     *
     * Cuando una existencia sale contra una cuenta de costo de producción
     * (consumo de materia prima) NO es un costo de ventas: la mercadería pasó al
     * proceso productivo y recién será costo cuando se venda el producto
     * terminado. Se expone como transferencia a producción, que es una salida
     * real del inventario pero no integra el CMV.
     */
    const contraIsProductionPool = (entry: typeof input.entries[number]): boolean =>
        entry.lines.some(l => {
            if (isInventory(l.accountId)) return false
            const a = byId.get(l.accountId)
            return a?.statementGroup === 'COGS' && a?.resultFunction === 'PRODUCTION'
        })

    /**
     * ¿El asiento consume o repone existencias contra el costo de ventas?
     *
     * En inventario permanente el costo se registra cuenta a cuenta contra la
     * cuenta de CMV. Sin esta distinción estructural, un movimiento de
     * existencias que NO toca el costo (una devolución al proveedor) se contaba
     * como consumo, y un movimiento que SÍ lo toca en sentido inverso (el
     * reingreso al costo de una devolución de un cliente) se contaba como
     * compra. Ambos rompían el puente contra el ER sin que hubiera nada mal
     * registrado, y el plan de cuentas base no trae `costComponent` con el que
     * desambiguarlo.
     */
    const costOfSalesIds = new Set(incomeStatement.costOfSales.accountIds)
    const contraIsCostOfSales = (entry: typeof input.entries[number]): boolean =>
        entry.lines.some(l => !isInventory(l.accountId) && costOfSalesIds.has(l.accountId))

    /**
     * ¿La salida de existencias fue contra un tercero y no contra un resultado?
     *
     * Sólo entonces se trata de una devolución al proveedor. Si la contrapartida
     * es una cuenta de resultado distinta del costo de ventas (un siniestro, una
     * baja anormal sin mapear), la diferencia SIGUE expuesta: el puente no la
     * absorbe y la publicación queda bloqueada, que es el comportamiento buscado.
     */
    const contraHasNoResult = (entry: typeof input.entries[number]): boolean =>
        entry.lines.every(l => {
            if (isInventory(l.accountId)) return true
            const kind = byId.get(l.accountId)?.kind
            return kind !== 'INCOME' && kind !== 'EXPENSE'
        })

    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (isStructuralClosingEntry(entry)) continue
        if (entry.sourceModule === 'closing' && entry.sourceType === 'apertura') continue
        const cc = contraComponent(entry)
        const toProduction = contraIsProductionPool(entry)
        const againstCostOfSales = contraIsCostOfSales(entry)
        const againstThirdPartyOnly = contraHasNoResult(entry)

        const inventoryLines = entry.lines.filter(l => isInventory(l.accountId))
        if (inventoryLines.length === 0) continue

        let entryDebitCents = 0
        let entryCreditCents = 0
        for (const l of inventoryLines) {
            inventoryIds.add(l.accountId)
            entryDebitCents += toCents(l.debit || 0)
            entryCreditCents += toCents(l.credit || 0)
        }

        /**
         * Transferencias internas entre etapas de existencias (Fase 2H §H6).
         *
         * Si un asiento debita y acredita cuentas de bienes de cambio (por
         * ejemplo aplicar insumos a la producción en proceso, o pasar la
         * producción a productos terminados), esa porción NO es una compra ni un
         * costo de ventas: la mercadería sólo cambió de etapa. Contarla en
         * ambos lados inflaba compras y CMV por el mismo importe.
         *
         * Se neutraliza la porción compensada y sólo se computa el neto, que es
         * lo que realmente entró o salió del inventario.
         */
        const transferCents = Math.min(entryDebitCents, entryCreditCents)
        const netCents = entryDebitCents - entryCreditCents

        if (transferCents > 0 && netCents === 0) continue // transferencia pura

        for (const l of inventoryLines) {
            const debitCents = toCents(l.debit || 0)
            const creditCents = toCents(l.credit || 0)

            // Con transferencia interna sólo se imputa la parte neta, repartida
            // proporcionalmente entre las cuentas del lado dominante.
            const effectiveDebit = transferCents > 0
                ? (netCents > 0 && entryDebitCents > 0 ? Math.round((debitCents / entryDebitCents) * netCents) : 0)
                : debitCents
            const effectiveCredit = transferCents > 0
                ? (netCents < 0 && entryCreditCents > 0 ? Math.round((creditCents / entryCreditCents) * -netCents) : 0)
                : creditCents

            if (effectiveDebit !== 0) {
                if (cc === 'ACQUISITION_COST') { acquisitionCents += effectiveDebit; componentAccountIds.acquisition.add(l.accountId) }
                else if (cc === 'OTHER_INCORPORABLE_COST') { otherIncorporableCents += effectiveDebit; componentAccountIds.other.add(l.accountId) }
                // Reingreso al inventario contra el costo de ventas (devolución
                // de un cliente): no es una compra, es un consumo que se revierte.
                else if (againstCostOfSales) { cmvOutflowCents -= effectiveDebit; componentAccountIds.cmv.add(l.accountId) }
                else { purchasesCents += effectiveDebit; componentAccountIds.purchases.add(l.accountId) }
            }
            if (effectiveCredit !== 0) {
                if (cc === 'PURCHASE_RETURNS') { purchaseReturnsCents += effectiveCredit; componentAccountIds.returns.add(l.accountId) }
                else if (cc === 'ABNORMAL_LOSS') { abnormalLossCents += effectiveCredit; componentAccountIds.abnormal.add(l.accountId) }
                else if (toProduction) { transferredToProductionCents += effectiveCredit; componentAccountIds.toProduction.add(l.accountId) }
                // Salida de existencias contra un tercero y sin resultado
                // asociado: es una devolución al proveedor, no un consumo.
                else if (againstThirdPartyOnly) { purchaseReturnsCents += effectiveCredit; componentAccountIds.returns.add(l.accountId) }
                else { cmvOutflowCents += effectiveCredit; componentAccountIds.cmv.add(l.accountId) }
            }
        }
    }

    const totalOutflowCents = purchaseReturnsCents + abnormalLossCents + cmvOutflowCents + transferredToProductionCents
    const totalInflowCents = purchasesCents + acquisitionCents + otherIncorporableCents
    const closingCents = openingCents + totalInflowCents - totalOutflowCents
    const accountIds = Array.from(inventoryIds)
    const erCogsCents = toCents(incomeStatement.costOfSales.amount)
    const hasInventoryData = inventoryIds.size > 0 && (openingCents !== 0 || totalInflowCents !== 0 || totalOutflowCents !== 0 || closingCents !== 0)
    const hasCogs = erCogsCents !== 0 || incomeStatement.costOfSales.accountIds.length > 0

    // ── Evidencia estructural de producción (Fase 2H §H6) ────
    // Se detecta por MAPPING, nunca por el nombre de la cuenta: cuentas de costo
    // (COGS) cuya función declarada es PRODUCTION y que tuvieron movimiento.
    const production = collectProductionCosts(input, tb)
    const hasProductionData = production.totalCents !== 0 || production.accountIds.size > 0
    const hasAgroData = input.accounts.some(
        a => a.sectorProfile === 'AGRICULTURAL'
            && tb.rows.some(r => r.accountId === a.id && (r.closing !== 0 || r.entryIds.length > 0))
    )

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
    // CMV puro = disponibles − EF − bajas anormales − transferencias a producción
    // (todas salieron del inventario, pero ninguna de las dos últimas es costo de ventas)
    const bridgeCogsCents = availableCents - closingCents - abnormalLossCents - transferredToProductionCents

    check('cmv-disponibles', 'CMV: bienes disponibles = EI + compras − devoluciones + adquisición + otros',
        openingCents + purchasesCents - purchaseReturnsCents + acquisitionCents + otherIncorporableCents, availableCents)
    check('cmv-puente-interno', 'CMV: disponibles − existencia final − bajas anormales − transferencias a producción = CMV del puente',
        availableCents - closingCents - abnormalLossCents - transferredToProductionCents, bridgeCogsCents)

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

    // ── Alcance del anexo (Fase 2H §H6) ──────────────────────
    // Precedencia estructural: agro > industria > comercio.
    const mode: CostOfSalesBridge['mode'] = hasAgroData
        ? 'AGRICULTURAL'
        : hasProductionData
          ? 'INDUSTRIAL'
          : 'COMMERCIAL'

    const modeReason = hasAgroData
        ? 'Hay cuentas del perfil agropecuario con movimientos: el costo se expone con activos biológicos y productos agropecuarios.'
        : hasProductionData
          ? 'Hay cuentas de costo con función de producción: el anexo abre el costo de producción por etapas.'
          : 'No hay evidencia de costos de producción: se expone el puente comercial.'

    const bridge: CostOfSalesBridge = {
        mode,
        modeReason,
        production: hasProductionData || hasAgroData
            ? buildProductionBlock(input, tb, production, bridgeCogsCents, check)
            : undefined,
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
