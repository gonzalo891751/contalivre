/**
 * Catálogo de indicadores para el Análisis de Estados Contables.
 *
 * Todos los importes provienen del StatementsBundle del motor único (mismo
 * contexto que ESP/ER/EEPN/EFE). Las fórmulas siguen la bibliografía
 * argentina de AEC (situación financiera de corto plazo, situación
 * patrimonial y situación económica); cuando una cátedra usa otra forma de
 * cálculo, se informa como variante en lugar de imponer una sola.
 *
 * Promedios: (inicio + cierre) / 2. El saldo de inicio sale del ejercicio
 * anterior (comparativo) o, si no está cargado, de la apertura del propio
 * ejercicio. Sin ninguno de los dos se usa el saldo final y se rotula
 * "aproximación con saldo final".
 *
 * Sin puntaje universal de "salud": la lectura describe lo que dice el número
 * (por cada $1 de…, tantos días…) y su referencia matemática, nunca un
 * veredicto genérico de bien o mal.
 */

import { toCents } from '../../accounting/domain/money'
import { isCashAccount } from '../engine/buildCashFlow'
import type { Account } from '../../core/models'
import type { StatementsBundle } from '../domain/types'
import {
    DEFAULT_METRICS_OPTIONS,
    type MetricCatalogEntry,
    type MetricInput,
    type MetricResult,
    type MetricsOptions,
    type MetricUnit,
    type MetricVariant,
} from './types'

/** Tag de cuentas cuyo saldo es costo de la deuda (intereses del pasivo) */
export const FINANCIAL_COST_TAG = 'analisis:costo-financiero'

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000

function fmt(n: number): string {
    return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}
function pesos(n: number): string {
    return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function pct(n: number): string {
    return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`
}
function money(n: number): string {
    return `$${Math.round(n).toLocaleString('es-AR')}`
}

// ─────────────────────────────────────────────────────────────
// Saldos por rubro (cierre e inicio)
// ─────────────────────────────────────────────────────────────

interface Balances {
    AC: number
    ANC: number
    AT: number
    PC: number
    PNC: number
    PT: number
    PN: number
    /** bienes de cambio */
    BC: number
    /** créditos por ventas (netos de previsión) */
    CxV: number
    /** deudas comerciales */
    DC: number
    /** caja y bancos (misma política de efectivo que el EFE) */
    disp: number
    /** inversiones corrientes */
    invCte: number
}

const isCurrent = (a: Account) =>
    (a.currentClassification ?? (a.section === 'NON_CURRENT' ? 'NON_CURRENT' : 'CURRENT')) === 'CURRENT'

/** Suma por rubro de saldos netos Debe−Haber (activo positivo, pasivo y PN negativos) */
function classify(netByAccount: Iterable<[string, number]>, byId: Map<string, Account>): Balances {
    const c = { AC: 0, ANC: 0, PC: 0, PNC: 0, PN: 0, BC: 0, CxV: 0, DC: 0, disp: 0, invCte: 0 }
    for (const [accountId, net] of netByAccount) {
        const a = byId.get(accountId)
        if (!a) continue
        const cents = toCents(net)
        if (a.kind === 'ASSET') {
            if (isCurrent(a)) c.AC += cents
            else c.ANC += cents
            if (a.statementGroup === 'INVENTORIES') c.BC += cents
            if (a.statementGroup === 'TRADE_RECEIVABLES') c.CxV += cents
            if (isCashAccount(a)) c.disp += cents
            else if (a.statementGroup === 'INVESTMENTS' && isCurrent(a)) c.invCte += cents
        } else if (a.kind === 'LIABILITY') {
            if (isCurrent(a)) c.PC -= cents
            else c.PNC -= cents
            if (a.statementGroup === 'TRADE_PAYABLES') c.DC -= cents
        } else {
            // PN + resultados no refundidos (pertenecen al PN)
            c.PN -= cents
        }
    }
    const f = (x: number) => x / 100
    return {
        AC: f(c.AC), ANC: f(c.ANC), AT: f(c.AC + c.ANC),
        PC: f(c.PC), PNC: f(c.PNC), PT: f(c.PC + c.PNC),
        PN: f(c.PN), BC: f(c.BC), CxV: f(c.CxV), DC: f(c.DC),
        disp: f(c.disp), invCte: f(c.invCte),
    }
}

function closingOf(bundle: StatementsBundle, byId: Map<string, Account>): Balances {
    const tb = classify(bundle.trialBalance.rows.map(r => [r.accountId, r.closing] as [string, number]), byId)
    // Los totales del ESP mandan (incluyen cuentas inexistentes expuestas)
    const bs = bundle.balanceSheet
    return {
        ...tb,
        AC: bs.currentAssets.amount, ANC: bs.nonCurrentAssets.amount, AT: bs.totalAssets.amount,
        PC: bs.currentLiabilities.amount, PNC: bs.nonCurrentLiabilities.amount, PT: bs.totalLiabilities.amount,
        PN: bs.equity.amount,
    }
}

interface StartBalances {
    values: Balances
    source: string
}

function startOf(bundle: StatementsBundle, prev: StatementsBundle | null, byId: Map<string, Account>): StartBalances | null {
    if (prev) {
        const values = closingOf(prev, byId)
        if (toCents(values.AT) !== 0) return { values, source: 'saldos de cierre del ejercicio anterior' }
    }
    const opening = bundle.openingNet ? Object.entries(bundle.openingNet) : []
    if (opening.length === 0) return null
    const values = classify(opening, byId)
    if (toCents(values.AT) === 0) return null
    const source = bundle.openingSource === 'MANUAL_OPENING'
        ? 'asiento de apertura cargado el primer día del ejercicio'
        : bundle.openingSource === 'PRIOR_BALANCES'
            ? 'saldos acumulados al inicio del ejercicio'
            : 'asiento de apertura del ejercicio'
    return { values, source }
}

// ─────────────────────────────────────────────────────────────
// Helpers de cálculo
// ─────────────────────────────────────────────────────────────

interface Ctx {
    bundle: StatementsBundle
    byId: Map<string, Account>
    end: Balances
    start: StartBalances | null
    opts: Required<MetricsOptions>
}

function input(label: string, value: number, source: string, isAverage = false): MetricInput {
    return { label, value: r2(value), source, isAverage }
}

/** Promedio (inicio+cierre)/2, o saldo de cierre por opción o por falta de inicio */
function averaged(ctx: Ctx, label: string, pick: (b: Balances) => number, source: string): { input: MetricInput; warning: string | null } {
    const endValue = pick(ctx.end)
    if (ctx.opts.averaging === 'CIERRE') {
        return {
            input: input(`${label} (saldo de cierre)`, endValue, `${source}; saldo al cierre por opción del análisis`),
            warning: null,
        }
    }
    if (!ctx.start) {
        return {
            input: input(`${label} (saldo final)`, endValue, source),
            warning: `Aproximación con saldo final: no hay saldos de inicio (ejercicio anterior o asiento de apertura) para promediar ${label.toLowerCase()}.`,
        }
    }
    const startValue = pick(ctx.start.values)
    return {
        input: input(`${label} promedio`, (startValue + endValue) / 2,
            `(${fmt(startValue)} inicio + ${fmt(endValue)} cierre) / 2 — inicio según ${ctx.start.source}`, true),
        warning: null,
    }
}

function notCalculable(formula: string, reason: string, missing: string[]): MetricResult {
    return { status: 'NOT_CALCULABLE', reason, missingInputs: missing, formula }
}

interface CalcOpts {
    unit?: MetricUnit
    interpretation: (value: number) => string
    warnings?: (string | null)[]
    reference?: { value: number; label: string }
    /** multiplica el cociente (ej. días) */
    factor?: number
    factorLabel?: string
    dayCountPolicy?: number
}

function calc(formula: string, numerator: MetricInput, denominator: MetricInput, o: CalcOpts): MetricResult {
    if (toCents(denominator.value) === 0) {
        return notCalculable(formula, `${denominator.label} es cero: el cociente no está definido (no se muestra ∞).`, [denominator.label])
    }
    const raw = (numerator.value / denominator.value) * (o.factor ?? 1)
    const value = o.unit === 'percentage' ? r2(raw * 100) : r2(raw)
    return {
        status: 'CALCULATED',
        value,
        formula,
        substitution: `${fmt(numerator.value)} / ${fmt(denominator.value)}${o.factor ? ` × ${o.factorLabel ?? o.factor}` : ''}`,
        inputs: [numerator, denominator],
        interpretation: o.interpretation(value),
        warnings: (o.warnings ?? []).filter((w): w is string => !!w),
        unit: o.unit ?? 'ratio',
        dayCountPolicy: o.dayCountPolicy,
        reference: o.reference,
    }
}

const valueOf = (r: MetricResult): number | null => (r.status === 'CALCULATED' ? r.value : null)

function variant(label: string, formula: string, num: number, den: number, unit: MetricUnit, note?: string): MetricVariant {
    const ok = toCents(den) !== 0
    const raw = ok ? num / den : null
    return { label, formula, unit, note, value: raw === null ? null : unit === 'percentage' ? r2(raw * 100) : r2(raw) }
}

/** Intereses y costos del pasivo del ejercicio (positivo = costo) */
function financialCost(ctx: Ctx): { amount: number; source: string; warning: string | null } {
    const children = ctx.bundle.incomeStatement.financialResults.children ?? []
    const hasTagged = [...ctx.byId.values()].some(a => (a.tags ?? []).includes(FINANCIAL_COST_TAG))
    let cents = 0
    if (hasTagged) {
        for (const c of children) {
            const a = ctx.byId.get(c.accountIds[0])
            if ((a?.tags ?? []).includes(FINANCIAL_COST_TAG)) cents -= toCents(c.amount)
        }
        return { amount: cents / 100, source: 'ER: cuentas de intereses y gastos de la deuda', warning: null }
    }
    for (const c of children) {
        const a = ctx.byId.get(c.accountIds[0])
        if (a?.statementGroup === 'FINANCIAL_EXPENSES' && c.amount < 0) cents -= toCents(c.amount)
    }
    return {
        amount: cents / 100,
        source: 'ER: gastos financieros',
        warning: 'Ninguna cuenta está marcada como costo de la deuda: se tomaron todos los gastos financieros (pueden incluir RECPAM o diferencias de cambio).',
    }
}

/** Compras netas del ejercicio (desde la determinación del costo de ventas) */
function purchasesOf(ctx: Ctx): { amount: number; source: string } | null {
    const cs = ctx.bundle.costOfSales
    if (cs.purchases.status === 'CALCULATED' && cs.purchases.amount !== null) {
        const amount = cs.purchases.amount
            + (cs.acquisitionCosts.amount ?? 0)
            + (cs.incorporableCosts.amount ?? 0)
            - (cs.purchaseReturns.amount ?? 0)
        return { amount, source: 'Determinación del costo de ventas: compras netas del ejercicio' }
    }
    if (ctx.start) {
        const cmv = ctx.bundle.incomeStatement.costOfSales.amount
        return {
            amount: cmv + ctx.end.BC - ctx.start.values.BC,
            source: 'Derivadas de la fórmula del costo: CMV + existencia final − existencia inicial',
        }
    }
    return null
}

// ─────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────

export function buildMetricsCatalog(
    bundle: StatementsBundle,
    accounts: Account[],
    prev: StatementsBundle | null = null,
    options: MetricsOptions = {},
): MetricCatalogEntry[] {
    const opts: Required<MetricsOptions> = { ...DEFAULT_METRICS_OPTIONS, ...options }
    const byId = new Map(accounts.map(a => [a.id, a]))
    const ctx: Ctx = { bundle, byId, end: closingOf(bundle, byId), start: startOf(bundle, prev, byId), opts }
    const { end } = ctx
    const er = bundle.incomeStatement
    const efe = bundle.cashFlowDirect
    const DAYS = opts.dayCount
    const resultLabel = opts.nonProfit ? 'Superávit (déficit)' : 'Resultado del ejercicio'
    const salesLabel = opts.nonProfit ? 'Recursos ordinarios' : 'Ventas netas'

    const ventas = er.sales.amount
    const cmv = er.costOfSales.amount
    const resultado = er.netIncome.amount
    const cfo = efe?.operating.amount ?? null
    const hasInventories = toCents(end.BC) !== 0 || toCents(cmv) !== 0 || (ctx.start ? toCents(ctx.start.values.BC) !== 0 : false)

    const entries: MetricCatalogEntry[] = []
    const add = (id: string, label: string, category: MetricCatalogEntry['category'], result: MetricResult, variants?: MetricVariant[]) =>
        entries.push({ id, label, category, result, ...(variants && variants.length > 0 ? { variants } : {}) })

    // ═════════════════════════════════════════════════════════
    // SITUACIÓN FINANCIERA DE CORTO PLAZO — Liquidez
    // ═════════════════════════════════════════════════════════
    {
        const value = r2(end.AC - end.PC)
        add('capital-trabajo', 'Capital corriente (capital de trabajo)', 'liquidez', {
            status: 'CALCULATED',
            value,
            formula: 'AC − PC',
            substitution: `${fmt(end.AC)} − ${fmt(end.PC)}`,
            inputs: [input('Activo corriente', end.AC, 'ESP: Activo corriente'), input('Pasivo corriente', end.PC, 'ESP: Pasivo corriente')],
            interpretation: value >= 0
                ? `Después de cancelar todas las deudas corrientes con el activo corriente, sobrarían ${money(value)}.`
                : `El activo corriente no alcanza para cubrir las deudas corrientes: faltarían ${money(-value)}.`,
            warnings: [],
            unit: 'currency',
            reference: { value: 0, label: 'AC = PC' },
        })
    }
    add('liquidez-corriente', 'Liquidez corriente', 'liquidez',
        calc('AC / PC', input('Activo corriente', end.AC, 'ESP'), input('Pasivo corriente', end.PC, 'ESP'), {
            interpretation: v => `Por cada $1 de deuda corriente hay ${pesos(v)} de activo corriente para cubrirla.`,
            reference: { value: 1, label: 'AC = PC' },
        }))
    add('prueba-acida', 'Liquidez ácida (prueba ácida o seca)', 'liquidez',
        calc('(AC − Bienes de cambio) / PC',
            input('AC − Bienes de cambio', end.AC - end.BC, `ESP: AC ${fmt(end.AC)} menos bienes de cambio ${fmt(end.BC)}`),
            input('Pasivo corriente', end.PC, 'ESP'), {
                interpretation: v => `Sin contar los bienes de cambio (lo menos líquido del AC), hay ${pesos(v)} por cada $1 de deuda corriente.`,
                reference: { value: 1, label: 'cobertura exacta' },
            }))
    {
        const immediate = end.disp + end.invCte
        add('liquidez-inmediata', 'Liquidez inmediata (absoluta)', 'liquidez',
            calc('(Caja y bancos + Inversiones corrientes) / PC',
                input('Caja y bancos + Inversiones corrientes', immediate, `Caja y bancos ${fmt(end.disp)} + Inversiones corrientes ${fmt(end.invCte)}`),
                input('Pasivo corriente', end.PC, 'ESP'), {
                    interpretation: v => `Con lo disponible hoy (efectivo e inversiones de rápida realización) se cubre el ${pct(r2(v * 100))} de la deuda corriente.`,
                    reference: { value: 1, label: 'cobertura exacta' },
                }),
            [variant('Solo caja y bancos', 'Caja y bancos / PC', end.disp, end.PC, 'ratio')])
    }

    // ═════════════════════════════════════════════════════════
    // SITUACIÓN FINANCIERA DE CORTO PLAZO — Plazos y ciclo
    // ═════════════════════════════════════════════════════════
    const avgBC = averaged(ctx, 'Bienes de cambio', b => b.BC, 'ESP: bienes de cambio')
    const avgCxV = averaged(ctx, 'Créditos por ventas', b => b.CxV, 'ESP: créditos por ventas')
    const avgDC = averaged(ctx, 'Deudas comerciales', b => b.DC, 'ESP: deudas comerciales')

    let daysInventory: number | null = null
    if (!hasInventories) {
        const na: MetricResult = { status: 'NOT_APPLICABLE', reason: 'El ente no tiene bienes de cambio ni costo de ventas (por ejemplo, una empresa de servicios).', formula: 'CMV / Bienes de cambio promedio' }
        add('rotacion-inventarios', 'Rotación de bienes de cambio', 'actividad', na)
        add('dias-inventario', 'Plazo de inmovilización de bienes de cambio', 'actividad', { ...na, formula: `Bienes de cambio promedio / CMV × ${DAYS}` })
    } else {
        const rot = calc('CMV / Bienes de cambio promedio', input('Costo de ventas', cmv, 'ER: costo de ventas'), avgBC.input, {
            unit: 'times',
            interpretation: v => `Los bienes de cambio se renovaron ${fmt(v)} veces en el ejercicio.`,
            warnings: [avgBC.warning],
        })
        add('rotacion-inventarios', 'Rotación de bienes de cambio', 'actividad', rot)
        const dias = calc(`Bienes de cambio promedio / CMV × ${DAYS}`, avgBC.input, input('Costo de ventas', cmv, 'ER: costo de ventas'), {
            unit: 'days', factor: DAYS, factorLabel: String(DAYS), dayCountPolicy: DAYS,
            interpretation: v => `Una mercadería permanece en promedio ${Math.round(v)} días en stock antes de venderse.`,
            warnings: [avgBC.warning],
        })
        add('dias-inventario', 'Plazo de inmovilización de bienes de cambio', 'actividad', dias,
            [variant('Como 365 / rotación', `${DAYS} / Rotación`, DAYS, valueOf(rot) ?? 0, 'days')])
        daysInventory = valueOf(dias)
    }

    const vatFactor = 1 + opts.vatRate
    const vatNote = opts.vatRate > 0
        ? `ventas × ${fmt(vatFactor)} (IVA ${fmt(opts.vatRate * 100)}%), porque los créditos incluyen el IVA facturado`
        : 'ventas sin IVA'
    const creditSales = ventas * vatFactor * opts.creditSalesShare
    const creditShareNote = opts.creditSalesShare < 1 ? `; solo el ${fmt(opts.creditSalesShare * 100)}% de las ventas fue a crédito` : ''

    let daysReceivable: number | null = null
    const hasReceivables = toCents(end.CxV) !== 0 || (ctx.start ? toCents(ctx.start.values.CxV) !== 0 : false)
    if (toCents(ventas) !== 0 && !hasReceivables) {
        const na: MetricResult = {
            status: 'NOT_APPLICABLE',
            reason: 'No hay créditos por ventas ni al inicio ni al cierre: las ventas se cobran al contado (o los créditos están en otro rubro, como cuotas sociales a cobrar).',
            formula: `Créditos por ventas promedio / Ventas a crédito con IVA × ${DAYS}`,
        }
        add('rotacion-creditos', 'Rotación de créditos por ventas', 'actividad', na)
        add('dias-cobranza', 'Plazo de cobranza', 'actividad', na)
    } else if (toCents(ventas) === 0) {
        const na = notCalculable(`Créditos por ventas promedio / Ventas a crédito con IVA × ${DAYS}`, 'No hay ventas en el ejercicio.', ['Ventas'])
        add('rotacion-creditos', 'Rotación de créditos por ventas', 'actividad', na)
        add('dias-cobranza', 'Plazo de cobranza', 'actividad', na)
    } else {
        const salesInput = input('Ventas a crédito con IVA', creditSales, `ER: ventas netas ${fmt(ventas)}; ${vatNote}${creditShareNote}`)
        add('rotacion-creditos', 'Rotación de créditos por ventas', 'actividad',
            calc('Ventas a crédito con IVA / Créditos por ventas promedio', salesInput, avgCxV.input, {
                unit: 'times',
                interpretation: v => `Los créditos por ventas se cobraron y renovaron ${fmt(v)} veces en el ejercicio.`,
                warnings: [avgCxV.warning],
            }))
        const dias = calc(`Créditos por ventas promedio / Ventas a crédito con IVA × ${DAYS}`, avgCxV.input, salesInput, {
            unit: 'days', factor: DAYS, factorLabel: String(DAYS), dayCountPolicy: DAYS,
            interpretation: v => `Desde que se vende hasta que se cobra pasan, en promedio, ${Math.round(v)} días.`,
            warnings: [avgCxV.warning],
        })
        add('dias-cobranza', 'Plazo de cobranza', 'actividad', dias,
            [variant('Sin IVA (ventas netas)', `Créditos promedio / Ventas netas × ${DAYS}`, avgCxV.input.value * DAYS, ventas, 'days',
                'Algunas cátedras no ajustan por IVA; el plazo queda más largo porque el saldo de créditos sí incluye IVA.')])
        daysReceivable = valueOf(dias)
    }

    let daysPayable: number | null = null
    {
        const formula = `Deudas comerciales promedio / Compras a crédito con IVA × ${DAYS}`
        const purchases = purchasesOf(ctx)
        if (!hasInventories && toCents(end.DC) === 0) {
            add('dias-pago', 'Plazo de pago a proveedores', 'actividad', { status: 'NOT_APPLICABLE', reason: 'No hay compras de bienes de cambio ni deudas comerciales.', formula })
        } else if (!purchases || toCents(purchases.amount) <= 0) {
            add('dias-pago', 'Plazo de pago a proveedores', 'actividad',
                notCalculable(formula, 'No se pudieron determinar las compras del ejercicio (hacen falta la existencia inicial o el detalle de compras).', ['Compras del ejercicio']))
        } else {
            const creditPurchases = purchases.amount * vatFactor * opts.creditPurchasesShare
            const purchasesInput = input('Compras a crédito con IVA', creditPurchases,
                `${purchases.source} ${fmt(purchases.amount)}; ${opts.vatRate > 0 ? `× ${fmt(vatFactor)} por IVA` : 'sin IVA'}${opts.creditPurchasesShare < 1 ? `; ${fmt(opts.creditPurchasesShare * 100)}% a crédito` : ''}`)
            const dias = calc(formula, avgDC.input, purchasesInput, {
                unit: 'days', factor: DAYS, factorLabel: String(DAYS), dayCountPolicy: DAYS,
                interpretation: v => `Los proveedores financian, en promedio, ${Math.round(v)} días de compras.`,
                warnings: [avgDC.warning],
            })
            add('dias-pago', 'Plazo de pago a proveedores', 'actividad', dias)
            daysPayable = valueOf(dias)
        }
    }

    {
        const formula = 'Plazo de bienes de cambio + Plazo de cobranza'
        if (!hasInventories && !hasReceivables) {
            add('ciclo-operativo', 'Ciclo operativo', 'actividad',
                { status: 'NOT_APPLICABLE', reason: 'Sin bienes de cambio ni créditos por ventas no hay ciclo de compra, venta y cobro que medir.', formula })
        } else if (daysReceivable === null && hasReceivables) {
            add('ciclo-operativo', 'Ciclo operativo', 'actividad',
                notCalculable(formula, 'Requiere el plazo de cobranza.', ['Plazo de cobranza']))
        } else if (hasInventories && daysInventory === null) {
            add('ciclo-operativo', 'Ciclo operativo', 'actividad',
                notCalculable(formula, 'Requiere los plazos de bienes de cambio y de cobranza.', ['Plazo de bienes de cambio', 'Plazo de cobranza']))
        } else {
            const inv = daysInventory ?? 0
            const cob = daysReceivable ?? 0
            const value = r2(inv + cob)
            add('ciclo-operativo', 'Ciclo operativo', 'actividad', {
                status: 'CALCULATED', value, formula,
                substitution: `${fmt(inv)} + ${fmt(cob)}`,
                inputs: [input('Plazo de bienes de cambio (días)', inv, 'Indicador de actividad'), input('Plazo de cobranza (días)', cob, hasReceivables ? 'Indicador de actividad' : 'Ventas al contado: sin plazo de cobranza')],
                interpretation: `Desde que entra la mercadería hasta que se cobra la venta pasan ${Math.round(value)} días.`,
                warnings: [], unit: 'days', dayCountPolicy: DAYS,
            })
            const formulaCash = 'Ciclo operativo − Plazo de pago'
            if (daysPayable === null) {
                add('ciclo-conversion', 'Ciclo de efectivo (ciclo operativo neto)', 'actividad',
                    notCalculable(formulaCash, 'Requiere el plazo de pago a proveedores.', ['Plazo de pago']))
            } else {
                const net = r2(value - daysPayable)
                add('ciclo-conversion', 'Ciclo de efectivo (ciclo operativo neto)', 'actividad', {
                    status: 'CALCULATED', value: net, formula: formulaCash,
                    substitution: `${fmt(value)} − ${fmt(daysPayable)}`,
                    inputs: [input('Ciclo operativo (días)', value, 'Indicador de actividad'), input('Plazo de pago (días)', daysPayable, 'Indicador de actividad')],
                    interpretation: net >= 0
                        ? `La empresa tiene que financiar con fondos propios o de terceros ${Math.round(net)} días del ciclo, porque cobra después de pagar.`
                        : `Los proveedores financian todo el ciclo y sobran ${Math.round(-net)} días: se cobra antes de pagar.`,
                    warnings: [], unit: 'days', dayCountPolicy: DAYS,
                    reference: { value: 0, label: 'cobra cuando paga' },
                })
            }
        }
    }

    if (!entries.some(e => e.id === 'ciclo-conversion')) {
        // sin ciclo operativo tampoco hay ciclo de efectivo: se expone el porqué
        const cycle = entries.find(e => e.id === 'ciclo-operativo')!.result
        const formula = 'Ciclo operativo − Plazo de pago'
        add('ciclo-conversion', 'Ciclo de efectivo (ciclo operativo neto)', 'actividad',
            cycle.status === 'NOT_APPLICABLE'
                ? { status: 'NOT_APPLICABLE', reason: cycle.reason, formula }
                : notCalculable(formula, 'Requiere el ciclo operativo.', ['Ciclo operativo']))
    }

    // ═════════════════════════════════════════════════════════
    // SITUACIÓN PATRIMONIAL — Estructura, solvencia y endeudamiento
    // ═════════════════════════════════════════════════════════
    add('solvencia', 'Solvencia', 'solvencia',
        calc('PN / Pasivo', input('Patrimonio neto', end.PN, 'ESP'), input('Pasivo total', end.PT, 'ESP'), {
            interpretation: v => `Por cada $1 aportado por terceros (pasivo), los propietarios aportan ${pesos(v)}.`,
            reference: { value: 1, label: 'PN = Pasivo' },
        }),
        [variant('Solvencia total', 'Activo / Pasivo', end.AT, end.PT, 'ratio',
            'Varias cátedras la llaman simplemente "solvencia": cuántos pesos de activo respaldan cada peso de deuda.')])
    add('endeudamiento', 'Endeudamiento', 'solvencia',
        toCents(end.PN) <= 0
            ? { status: 'NOT_APPLICABLE', reason: 'El patrimonio neto es cero o negativo: el cociente no admite la lectura habitual (el ente está en situación de quiebra técnica).', formula: 'Pasivo / PN' }
            : calc('Pasivo / PN', input('Pasivo total', end.PT, 'ESP'), input('Patrimonio neto', end.PN, 'ESP'), {
                interpretation: v => `Por cada $1 de capital propio hay ${pesos(v)} de deuda con terceros.`,
                reference: { value: 1, label: 'Pasivo = PN' },
            }),
        [
            variant('Razón de endeudamiento', 'Pasivo / Activo', end.PT, end.AT, 'percentage', 'Porción del activo financiada por terceros.'),
            variant('Autonomía financiera', 'PN / Activo', end.PN, end.AT, 'percentage', 'Porción del activo financiada por los propietarios.'),
            variant('Endeudamiento de corto plazo', 'PC / PN', end.PC, end.PN, 'ratio'),
            variant('Endeudamiento de largo plazo', 'PNC / PN', end.PNC, end.PN, 'ratio'),
        ])
    add('composicion-deuda', 'Composición del pasivo (corto plazo)', 'solvencia',
        calc('PC / Pasivo', input('Pasivo corriente', end.PC, 'ESP'), input('Pasivo total', end.PT, 'ESP'), {
            unit: 'percentage',
            interpretation: v => `El ${pct(v)} de la deuda vence dentro de los próximos 12 meses.`,
        }))
    add('inmovilizacion', 'Inmovilización del activo', 'solvencia',
        calc('ANC / Activo', input('Activo no corriente', end.ANC, 'ESP'), input('Activo total', end.AT, 'ESP'), {
            unit: 'percentage',
            interpretation: v => `El ${pct(v)} del activo es de lenta conversión en dinero (no corriente).`,
        }))
    add('financiacion-inmovilizacion', 'Financiación de la inmovilización', 'solvencia',
        calc('PN / ANC', input('Patrimonio neto', end.PN, 'ESP'), input('Activo no corriente', end.ANC, 'ESP'), {
            interpretation: v => `El capital propio cubre ${fmt(v)} veces el activo inmovilizado.`,
            reference: { value: 1, label: 'PN cubre el ANC' },
        }),
        [variant('Con fondos de largo plazo', '(PN + PNC) / ANC', end.PN + end.PNC, end.ANC, 'ratio',
            'Si supera 1, todo el activo inmovilizado está financiado con recursos de largo plazo.')])

    const fc = financialCost(ctx)
    {
        const rai = er.preTaxResult.amount
        const formula = '(Resultado antes de impuesto + Intereses) / Intereses'
        add('cobertura-intereses', 'Cobertura de intereses', 'solvencia',
            toCents(fc.amount) <= 0
                ? notCalculable(formula, 'No hay intereses ni costos de la deuda en el ejercicio.', ['Intereses del pasivo'])
                : calc(formula,
                    input('Resultado antes de intereses e impuestos', rai + fc.amount, `ER: resultado antes de impuesto ${fmt(rai)} + intereses ${fmt(fc.amount)}`),
                    input('Intereses del pasivo', fc.amount, fc.source), {
                        unit: 'times',
                        interpretation: v => `El resultado antes de intereses e impuestos alcanza para pagar ${fmt(v)} veces los intereses.`,
                        warnings: [fc.warning],
                        reference: { value: 1, label: 'apenas cubre los intereses' },
                    }))
    }

    // ═════════════════════════════════════════════════════════
    // SITUACIÓN ECONÓMICA — Rentabilidad
    // ═════════════════════════════════════════════════════════
    if (toCents(ventas) === 0) {
        for (const [id, label, formula] of [
            ['margen-bruto', 'Margen bruto', 'Resultado bruto / Ventas'],
            ['margen-operativo', 'Margen operativo', 'Resultado operativo / Ventas'],
            ['margen-neto', opts.nonProfit ? 'Superávit sobre recursos' : 'Margen neto', `${resultLabel} / ${salesLabel}`],
        ] as const) add(id, label, 'rentabilidad', notCalculable(formula, `No hay ${salesLabel.toLowerCase()} en el ejercicio.`, [salesLabel]))
    } else {
        add('margen-bruto', 'Margen bruto', 'rentabilidad',
            calc('Resultado bruto / Ventas', input('Resultado bruto', er.grossProfit.amount, 'ER'), input(salesLabel, ventas, 'ER'), {
                unit: 'percentage', interpretation: v => `De cada $100 vendidos quedan $${fmt(v)} después de cubrir el costo de lo vendido.`,
            }))
        add('margen-operativo', 'Margen operativo', 'rentabilidad',
            calc('Resultado operativo / Ventas', input('Resultado operativo', er.operatingResult.amount, 'ER'), input(salesLabel, ventas, 'ER'), {
                unit: 'percentage', interpretation: v => `De cada $100 vendidos quedan $${fmt(v)} después de los gastos de administración y comercialización.`,
            }))
        add('margen-neto', opts.nonProfit ? 'Superávit sobre recursos' : 'Margen neto', 'rentabilidad',
            calc(`${resultLabel} / ${salesLabel}`, input(resultLabel, resultado, 'ER'), input(salesLabel, ventas, 'ER'), {
                unit: 'percentage', interpretation: v => `De cada $100 de ${salesLabel.toLowerCase()} llegan $${fmt(v)} al ${resultLabel.toLowerCase()}.`,
            }))
        const dep = bundle.fixedAssetsAnnex.totals.periodDepreciation
        const ebitda = er.operatingResult.amount + dep
        add('margen-ebitda', 'Margen EBITDA', 'rentabilidad',
            calc('(Resultado operativo + Depreciaciones) / Ventas',
                input('EBITDA', ebitda, `Resultado operativo ${fmt(er.operatingResult.amount)} + depreciaciones del ejercicio ${fmt(dep)} (anexo de bienes de uso)`),
                input(salesLabel, ventas, 'ER'), {
                    unit: 'percentage',
                    interpretation: v => `Antes de depreciaciones, intereses e impuestos, la operación genera $${fmt(v)} por cada $100 vendidos (EBITDA = ${money(ebitda)}).`,
                    warnings: ['Indicador de gestión: no surge de las normas contables profesionales.'],
                }))
    }

    const avgAT = averaged(ctx, 'Activo total', b => b.AT, 'ESP: total del activo')
    const avgPN = averaged(ctx, 'Patrimonio neto', b => b.PN, 'ESP: patrimonio neto')
    const avgPT = averaged(ctx, 'Pasivo total', b => b.PT, 'ESP: total del pasivo')

    if (opts.nonProfit) {
        const reason = 'En un ente sin fines de lucro el superávit no retribuye a propietarios: la rentabilidad del patrimonio y el efecto palanca no tienen la lectura habitual.'
        add('roa', 'Rentabilidad del activo', 'rentabilidad', { status: 'NOT_APPLICABLE', reason, formula: '(Resultado + Intereses) / Activo promedio' })
        add('roe', 'Rentabilidad del patrimonio neto', 'rentabilidad', { status: 'NOT_APPLICABLE', reason, formula: 'Resultado / PN promedio' })
        add('efecto-palanca', 'Efecto palanca', 'rentabilidad', { status: 'NOT_APPLICABLE', reason, formula: 'RPN / RA' })
        const gastos = cmv + er.adminExpenses.amount + er.sellingExpenses.amount
        add('autosuficiencia', 'Autosuficiencia (cobertura de gastos)', 'rentabilidad',
            calc('Recursos ordinarios / Gastos ordinarios', input('Recursos ordinarios', ventas, 'Estado de recursos y gastos'),
                input('Gastos ordinarios', gastos, 'Estado de recursos y gastos: costos + gastos de administración + gastos específicos'), {
                    interpretation: v => `Por cada $1 de gastos ordinarios, la entidad obtuvo ${pesos(v)} de recursos.`,
                    reference: { value: 1, label: 'recursos = gastos' },
                }))
    } else {
        const raNum = resultado + fc.amount
        const ra = calc('(Resultado + Intereses del pasivo) / Activo promedio',
            input('Resultado + intereses', raNum, `ER: resultado ${fmt(resultado)} + intereses ${fmt(fc.amount)}`), avgAT.input, {
                unit: 'percentage',
                interpretation: v => `Cada $100 invertidos en el activo generaron $${fmt(v)}, sin importar cómo se financiaron.`,
                warnings: [avgAT.warning, fc.warning],
            })
        add('roa', 'Rentabilidad del activo (RA)', 'rentabilidad', ra, [
            variant('Sobre resultado neto (ROA)', 'Resultado / Activo promedio', resultado, avgAT.input.value, 'percentage',
                'Versión internacional: no suma los intereses, por eso mezcla la rentabilidad del negocio con el costo de financiarlo.'),
            variant('Margen (R + I) / Ventas', '(Resultado + Intereses) / Ventas', raNum, ventas, 'percentage', 'RA = margen × rotación del activo.'),
            variant('Rotación del activo', 'Ventas / Activo promedio', ventas, avgAT.input.value, 'times'),
        ])

        const roe = toCents(avgPN.input.value) <= 0
            ? { status: 'NOT_APPLICABLE' as const, reason: 'El patrimonio neto promedio es cero o negativo.', formula: 'Resultado / PN promedio' }
            : calc('Resultado / PN promedio', input(resultLabel, resultado, 'ER'), avgPN.input, {
                unit: 'percentage',
                interpretation: v => `Cada $100 aportados por los propietarios rindieron $${fmt(v)} en el ejercicio.`,
                warnings: [avgPN.warning],
            })
        add('roe', 'Rentabilidad del patrimonio neto (RPN)', 'rentabilidad', roe)

        const costOfDebt = toCents(avgPT.input.value) > 0 && toCents(fc.amount) > 0 ? r2((fc.amount / avgPT.input.value) * 100) : null
        add('costo-deuda', 'Costo del endeudamiento', 'rentabilidad',
            toCents(fc.amount) <= 0
                ? notCalculable('Intereses / Pasivo promedio', 'No hay intereses ni costos de la deuda en el ejercicio.', ['Intereses del pasivo'])
                : calc('Intereses / Pasivo promedio', input('Intereses del pasivo', fc.amount, fc.source), avgPT.input, {
                    unit: 'percentage',
                    interpretation: v => `Cada $100 de deuda costaron $${fmt(v)} de intereses en el ejercicio (incluye deudas que no devengan interés).`,
                    warnings: [avgPT.warning, fc.warning],
                }))

        const raV = valueOf(ra)
        const roeV = valueOf(roe)
        add('efecto-palanca', 'Efecto palanca (leverage)', 'rentabilidad',
            raV === null || roeV === null || toCents(raV) === 0
                ? notCalculable('RPN / RA', 'Requiere la rentabilidad del activo (distinta de cero) y la del patrimonio neto.', ['RA', 'RPN'])
                : {
                    status: 'CALCULATED',
                    value: r2(roeV / raV),
                    formula: 'RPN / RA',
                    substitution: `${fmt(roeV)}% / ${fmt(raV)}%`,
                    inputs: [input('Rentabilidad del PN (%)', roeV, 'Indicador RPN'), input('Rentabilidad del activo (%)', raV, 'Indicador RA')],
                    interpretation: roeV / raV > 1
                        ? `Favorable: endeudarse aumentó la rentabilidad de los propietarios${costOfDebt !== null ? ` porque el activo rindió ${pct(raV)} y la deuda costó ${pct(costOfDebt)}` : ''}.`
                        : roeV / raV < 1
                            ? `Desfavorable: la deuda le costó a la empresa más de lo que rindió el activo${costOfDebt !== null ? ` (${pct(costOfDebt)} contra ${pct(raV)})` : ''}, y eso redujo la rentabilidad de los propietarios.`
                            : 'Neutro: el endeudamiento no modificó la rentabilidad de los propietarios.',
                    warnings: [],
                    unit: 'ratio',
                    reference: { value: 1, label: 'neutro' },
                })

        // DuPont internacional: ROE = margen neto × rotación × apalancamiento
        if (toCents(ventas) !== 0 && toCents(avgAT.input.value) !== 0 && toCents(avgPN.input.value) > 0) {
            const margen = resultado / ventas
            const rotacion = ventas / avgAT.input.value
            const apalancamiento = avgAT.input.value / avgPN.input.value
            add('dupont', 'Descomposición DuPont del RPN', 'rentabilidad', {
                status: 'CALCULATED',
                value: r2(margen * rotacion * apalancamiento * 100),
                formula: '(Resultado / Ventas) × (Ventas / Activo prom.) × (Activo prom. / PN prom.)',
                substitution: `${r4(margen)} × ${r4(rotacion)} × ${r4(apalancamiento)}`,
                inputs: [input('Margen neto', r4(margen), 'ER'), input('Rotación del activo', r4(rotacion), 'ER / ESP'), input('Apalancamiento (Activo / PN)', r4(apalancamiento), 'ESP')],
                interpretation: `La rentabilidad del PN se explica por un margen de ${pct(r2(margen * 100))}, una rotación de ${fmt(r2(rotacion))} veces y un apalancamiento de ${fmt(r2(apalancamiento))}.`,
                warnings: [avgAT.warning, avgPN.warning].filter((w): w is string => !!w),
                unit: 'percentage',
            })
        } else {
            add('dupont', 'Descomposición DuPont del RPN', 'rentabilidad',
                notCalculable('(Resultado/Ventas) × (Ventas/Activo) × (Activo/PN)', 'Requiere ventas, activo promedio y PN promedio positivos.', ['Ventas ≠ 0', 'Activo promedio ≠ 0', 'PN promedio > 0']))
        }
    }

    add('rotacion-activo', 'Rotación del activo', 'actividad',
        calc('Ventas / Activo promedio', input(salesLabel, ventas, 'ER'), avgAT.input, {
            unit: 'times',
            interpretation: v => `Cada $1 invertido en el activo generó ${pesos(v)} de ventas.`,
            warnings: [avgAT.warning],
        }))

    // ═════════════════════════════════════════════════════════
    // FLUJO DE EFECTIVO
    // ═════════════════════════════════════════════════════════
    add('cfo-pc', 'Flujo operativo / Pasivo corriente', 'flujo',
        cfo === null
            ? notCalculable('Flujo operativo / PC', 'No hay estado de flujo de efectivo calculado.', ['EFE'])
            : calc('Flujo operativo / PC', input('Flujo de efectivo operativo', cfo, 'EFE: actividades operativas'), input('Pasivo corriente', end.PC, 'ESP'), {
                interpretation: v => `Con el efectivo que generó la operación en el año se podría cancelar el ${pct(r2(v * 100))} de la deuda corriente.`,
                reference: { value: 1, label: 'cubre todo el PC' },
            }))
    if (cfo !== null && efe) {
        add('cfo-resultado', 'Calidad del resultado (flujo operativo / resultado)', 'flujo',
            toCents(resultado) === 0
                ? notCalculable('Flujo operativo / Resultado', 'El resultado del ejercicio es cero.', ['Resultado ≠ 0'])
                : calc('Flujo operativo / Resultado', input('Flujo de efectivo operativo', cfo, 'EFE'), input(resultLabel, resultado, 'ER'), {
                    interpretation: v => `Por cada $1 de ${resultLabel.toLowerCase()} entraron ${pesos(v)} de efectivo por la operación.`,
                    reference: { value: 1, label: 'resultado = caja' },
                }))
        const free = r2(cfo + efe.investing.amount)
        add('flujo-libre', 'Flujo de efectivo libre', 'flujo', {
            status: 'CALCULATED',
            value: free,
            formula: 'Flujo operativo + Flujo de inversión',
            substitution: `${fmt(cfo)} + (${fmt(efe.investing.amount)})`,
            inputs: [input('Flujo operativo', cfo, 'EFE'), input('Flujo de inversión', efe.investing.amount, 'EFE')],
            interpretation: free >= 0
                ? `Después de invertir, la operación dejó ${money(free)} disponibles para pagar deudas o distribuir.`
                : `La operación no alcanzó para financiar las inversiones: faltaron ${money(-free)}, cubiertos con financiación o con efectivo previo.`,
            warnings: [],
            unit: 'currency',
            reference: { value: 0, label: 'se autofinancia' },
        })
        add('deuda-cfo', 'Años para cancelar la deuda con el flujo operativo', 'flujo',
            toCents(cfo) <= 0
                ? notCalculable('Pasivo / Flujo operativo', 'El flujo operativo es cero o negativo: el cociente no admite la lectura habitual.', ['Flujo operativo > 0'])
                : calc('Pasivo / Flujo operativo', input('Pasivo total', end.PT, 'ESP'), input('Flujo de efectivo operativo', cfo, 'EFE'), {
                    unit: 'times',
                    interpretation: v => `Al ritmo de este año, la operación necesitaría ${fmt(v)} años para cancelar toda la deuda.`,
                }))
    }

    return entries
}

/** Adosa a cada indicador su valor del ejercicio anterior (mismo id) */
export function attachPreviousMetrics(current: MetricCatalogEntry[], previous: MetricCatalogEntry[] | null): MetricCatalogEntry[] {
    if (!previous) return current
    const byId = new Map(previous.map(e => [e.id, e.result]))
    return current.map(e => ({ ...e, previous: byId.get(e.id) ?? null }))
}
