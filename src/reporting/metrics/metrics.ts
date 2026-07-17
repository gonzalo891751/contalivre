/**
 * Catálogo de indicadores — Fase 2B (§13.4–13.9).
 *
 * Todos los importes provienen del StatementsBundle del motor único
 * (mismo contexto que ESP/ER/EEPN/EFE). Promedios: (inicio + cierre) / 2
 * usando el comparativo del ejercicio anterior; sin comparativo, el
 * indicador se calcula con saldo final y se rotula expresamente
 * "aproximación con saldo final".
 *
 * Sin health score universal: la interpretación es descriptiva y prudente,
 * nunca un veredicto "bien/mal" por umbral genérico.
 */

import { toCents } from '../../accounting/domain/money'
import { isCashAccount } from '../engine/buildCashFlow'
import type { Account } from '../../core/models'
import type { StatementsBundle } from '../domain/types'
import type { MetricCatalogEntry, MetricInput, MetricResult } from './types'

const DAY_COUNT = 365

const r2 = (n: number) => Math.round(n * 100) / 100
const r4 = (n: number) => Math.round(n * 10000) / 10000

function fmt(n: number): string {
    return n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

interface Ctx {
    bundle: StatementsBundle
    accounts: Account[]
    accountsById: Map<string, Account>
    prev: StatementsBundle | null
}

function calc(
    formula: string,
    numerator: MetricInput,
    denominator: MetricInput,
    opts: {
        unit?: 'ratio' | 'percentage' | 'days' | 'times' | 'currency'
        interpretation: string
        warnings?: string[]
        scale?: number
        dayCountPolicy?: number
    }
): MetricResult {
    if (toCents(denominator.value) === 0) {
        return {
            status: 'NOT_CALCULABLE',
            reason: `${denominator.label} es cero: el cociente no está definido (no se muestra ∞).`,
            missingInputs: [denominator.label],
            formula,
        }
    }
    const raw = numerator.value / denominator.value
    const value = opts.unit === 'percentage' ? r2(raw * 100) : (opts.scale === 4 ? r4(raw) : r2(raw))
    return {
        status: 'CALCULATED',
        value,
        formula,
        substitution: `${fmt(numerator.value)} / ${fmt(denominator.value)}`,
        inputs: [numerator, denominator],
        interpretation: opts.interpretation,
        warnings: opts.warnings ?? [],
        unit: opts.unit ?? 'ratio',
        dayCountPolicy: opts.dayCountPolicy,
    }
}

/** Promedio (inicio+cierre)/2 si hay comparativo; si no, saldo final rotulado */
function averaged(label: string, current: number, previous: number | null, source: string): { input: MetricInput; warning: string | null } {
    if (previous === null) {
        return {
            input: { label: `${label} (saldo final)`, value: current, source, isAverage: false },
            warning: `Aproximación con saldo final: no hay ejercicio comparativo para promediar ${label.toLowerCase()}.`,
        }
    }
    return {
        input: { label: `${label} (promedio)`, value: r2((current + previous) / 2), source: `${source}; promedio con ejercicio anterior`, isAverage: true },
        warning: null,
    }
}

function input(label: string, value: number, source: string): MetricInput {
    return { label, value, source }
}

function cashAndEquivalents(ctx: Ctx): number {
    let cents = 0
    for (const row of ctx.bundle.trialBalance.rows) {
        if (isCashAccount(ctx.accountsById.get(row.accountId))) cents += toCents(row.closing)
    }
    return cents / 100
}

function inventories(ctx: Ctx, bundle = ctx.bundle): number {
    let cents = 0
    for (const row of bundle.trialBalance.rows) {
        if (ctx.accountsById.get(row.accountId)?.statementGroup === 'INVENTORIES') cents += toCents(row.closing)
    }
    return cents / 100
}

export function buildMetricsCatalog(bundle: StatementsBundle, accounts: Account[], prev: StatementsBundle | null = null): MetricCatalogEntry[] {
    const ctx: Ctx = { bundle, accounts, accountsById: new Map(accounts.map(a => [a.id, a])), prev }
    const bs = bundle.balanceSheet
    const er = bundle.incomeStatement
    const efe = bundle.cashFlowDirect

    const AC = bs.currentAssets.amount
    const ANC = bs.nonCurrentAssets.amount
    const AT = bs.totalAssets.amount
    const PC = bs.currentLiabilities.amount
    const PNC = bs.nonCurrentLiabilities.amount
    const PT = bs.totalLiabilities.amount
    const PN = bs.equity.amount
    const ventas = er.sales.amount
    const resultado = er.netIncome.amount
    const cfo = efe?.operating.amount ?? null

    const entries: MetricCatalogEntry[] = []
    const add = (id: string, label: string, category: MetricCatalogEntry['category'], result: MetricResult) =>
        entries.push({ id, label, category, result })

    // ── Liquidez (§13.4) ─────────────────────────────────────
    add('capital-trabajo', 'Capital de trabajo', 'liquidez', {
        status: 'CALCULATED',
        value: r2(AC - PC),
        formula: 'AC − PC',
        substitution: `${fmt(AC)} − ${fmt(PC)}`,
        inputs: [input('Activo corriente', AC, 'ESP: Activo corriente'), input('Pasivo corriente', PC, 'ESP: Pasivo corriente')],
        interpretation: 'Excedente (o déficit) de recursos corrientes sobre las obligaciones corrientes.',
        warnings: [],
        unit: 'currency',
    })
    add('liquidez-corriente', 'Liquidez corriente', 'liquidez',
        calc('AC / PC', input('Activo corriente', AC, 'ESP'), input('Pasivo corriente', PC, 'ESP'),
            { interpretation: 'Cuántos pesos corrientes hay por cada peso de deuda corriente.' }))
    const inv = inventories(ctx)
    add('prueba-acida', 'Prueba ácida', 'liquidez',
        calc('(AC − Inventarios) / PC',
            input('AC − Inventarios', r2(AC - inv), 'ESP: AC menos cuentas con grupo INVENTORIES'),
            input('Pasivo corriente', PC, 'ESP'),
            { interpretation: 'Liquidez sin depender de la realización de los bienes de cambio.' }))
    add('liquidez-inmediata', 'Liquidez inmediata', 'liquidez',
        calc('Efectivo y equivalentes / PC',
            input('Efectivo y equivalentes', cashAndEquivalents(ctx), 'Cuentas con metadata de efectivo (misma política que el EFE)'),
            input('Pasivo corriente', PC, 'ESP'),
            { interpretation: 'Cobertura de las deudas corrientes solo con el efectivo disponible.' }))
    add('cfo-pc', 'Flujo operativo / Pasivo corriente', 'flujo',
        cfo === null
            ? { status: 'NOT_CALCULABLE', reason: 'No hay EFE calculado para el contexto.', missingInputs: ['EFE'], formula: 'CFO / PC' }
            : calc('CFO / PC', input('Flujo operativo', cfo, 'EFE: actividades operativas'), input('Pasivo corriente', PC, 'ESP'),
                { interpretation: 'Capacidad del flujo operativo del ejercicio para cubrir el pasivo corriente.' }))

    // ── Solvencia y estructura (§13.5) ───────────────────────
    add('endeudamiento', 'Endeudamiento total', 'solvencia',
        calc('PT / AT', input('Pasivo total', PT, 'ESP'), input('Activo total', AT, 'ESP'),
            { unit: 'percentage', interpretation: 'Porción del activo financiada por terceros. Su lectura depende del sector y del ciclo.' }))
    add('pasivo-pn', 'Pasivo / Patrimonio neto', 'solvencia',
        toCents(PN) <= 0
            ? { status: 'NOT_APPLICABLE', reason: 'El patrimonio neto es cero o negativo: el cociente no admite la lectura habitual.', formula: 'PT / PN' }
            : calc('PT / PN', input('Pasivo total', PT, 'ESP'), input('Patrimonio neto', PN, 'ESP'),
                { interpretation: 'Deuda de terceros por cada peso de capital propio.' }))
    add('autonomia', 'Autonomía financiera', 'solvencia',
        calc('PN / AT', input('Patrimonio neto', PN, 'ESP'), input('Activo total', AT, 'ESP'),
            { unit: 'percentage', interpretation: 'Porción del activo financiada con capital propio.' }))
    add('solvencia', 'Solvencia', 'solvencia',
        calc('AT / PT', input('Activo total', AT, 'ESP'), input('Pasivo total', PT, 'ESP'),
            { interpretation: 'Respaldo del activo total sobre el pasivo total.' }))
    add('inmovilizacion', 'Inmovilización del activo', 'solvencia',
        calc('ANC / AT', input('Activo no corriente', ANC, 'ESP'), input('Activo total', AT, 'ESP'),
            { unit: 'percentage', interpretation: 'Porción del activo de baja rotación.' }))
    add('financiacion-inmovilizacion', 'Financiación de la inmovilización', 'solvencia',
        calc('(PN + PNC) / ANC',
            input('PN + Pasivo no corriente', r2(PN + PNC), 'ESP'),
            input('Activo no corriente', ANC, 'ESP'),
            { interpretation: 'Si supera 1, el activo inmovilizado está financiado con recursos de largo plazo.' }))
    add('composicion-deuda', 'Composición de la deuda (CP)', 'solvencia',
        calc('PC / PT', input('Pasivo corriente', PC, 'ESP'), input('Pasivo total', PT, 'ESP'),
            { unit: 'percentage', interpretation: 'Porción de la deuda que vence en el corto plazo.' }))

    // ── Rentabilidad (§13.6) ─────────────────────────────────
    add('margen-bruto', 'Margen bruto', 'rentabilidad',
        calc('Resultado bruto / Ventas', input('Resultado bruto', er.grossProfit.amount, 'ER'), input('Ventas', ventas, 'ER'),
            { unit: 'percentage', interpretation: 'Porción de las ventas que queda tras el costo.' }))
    add('margen-operativo', 'Margen operativo', 'rentabilidad',
        calc('Resultado operativo / Ventas', input('Resultado operativo', er.operatingResult.amount, 'ER'), input('Ventas', ventas, 'ER'),
            { unit: 'percentage', interpretation: 'Rentabilidad de la operación antes de resultados financieros.' }))
    add('margen-neto', 'Margen neto', 'rentabilidad',
        calc('Resultado neto / Ventas', input('Resultado del ejercicio', resultado, 'ER'), input('Ventas', ventas, 'ER'),
            { unit: 'percentage', interpretation: 'Porción de las ventas que llega al resultado final.' }))
    add('margen-ebitda', 'Margen EBITDA (indicador de gestión)', 'rentabilidad', {
        status: 'INSUFFICIENT_INFORMATION',
        reason: 'Las depreciaciones y amortizaciones no están identificadas con metadata estructurada (annexGroup); no se estima el EBITDA con heurísticas.',
        missingInputs: ['Cuentas de depreciación/amortización identificadas con annexGroup'],
        formula: '(Resultado operativo + Depreciaciones y amortizaciones) / Ventas',
    })
    {
        const at = averaged('Activo total', AT, prev ? prev.balanceSheet.totalAssets.amount : null, 'ESP')
        add('roa', 'ROA (retorno sobre activos)', 'rentabilidad',
            calc('Resultado / Activo total promedio', input('Resultado del ejercicio', resultado, 'ER'), at.input,
                { unit: 'percentage', interpretation: 'Rendimiento del activo total en el ejercicio.', warnings: at.warning ? [at.warning] : [] }))
        const pn = averaged('Patrimonio neto', PN, prev ? prev.balanceSheet.equity.amount : null, 'ESP')
        add('roe', 'ROE (retorno sobre el PN)', 'rentabilidad',
            toCents(pn.input.value) <= 0
                ? { status: 'NOT_APPLICABLE', reason: 'El patrimonio neto promedio es cero o negativo.', formula: 'Resultado / PN promedio' }
                : calc('Resultado / PN promedio', input('Resultado del ejercicio', resultado, 'ER'), pn.input,
                    { unit: 'percentage', interpretation: 'Rendimiento del capital propio.', warnings: pn.warning ? [pn.warning] : [] }))
        // DuPont: margen × rotación × apalancamiento
        if (toCents(ventas) !== 0 && toCents(at.input.value) !== 0 && toCents(pn.input.value) > 0) {
            const margen = resultado / ventas
            const rotacion = ventas / at.input.value
            const apalancamiento = at.input.value / pn.input.value
            add('dupont', 'Descomposición DuPont del ROE', 'rentabilidad', {
                status: 'CALCULATED',
                value: r2(margen * rotacion * apalancamiento * 100),
                formula: '(Resultado/Ventas) × (Ventas/AT prom.) × (AT prom./PN prom.)',
                substitution: `${r4(margen)} × ${r4(rotacion)} × ${r4(apalancamiento)}`,
                inputs: [input('Margen neto', r4(margen), 'ER'), input('Rotación del activo', r4(rotacion), 'ER/ESP'), input('Apalancamiento', r4(apalancamiento), 'ESP')],
                interpretation: 'El ROE explicado por margen, rotación y apalancamiento.',
                warnings: [...(at.warning ? [at.warning] : []), ...(pn.warning ? [pn.warning] : [])],
                unit: 'percentage',
            })
        } else {
            add('dupont', 'Descomposición DuPont del ROE', 'rentabilidad', {
                status: 'NOT_CALCULABLE',
                reason: 'Requiere ventas, activo promedio y PN promedio positivos.',
                missingInputs: ['ventas ≠ 0', 'AT promedio ≠ 0', 'PN promedio > 0'],
                formula: '(Resultado/Ventas) × (Ventas/AT) × (AT/PN)',
            })
        }
    }

    // ── Actividad (§13.7) ────────────────────────────────────
    {
        const invAvg = averaged('Inventarios', inv, prev ? inventories(ctx, prev) : null, 'ESP: cuentas INVENTORIES')
        const rotInv = calc('CMV / Inventario promedio',
            input('Costo de ventas', er.costOfSales.amount, 'ER'), invAvg.input,
            { unit: 'times', interpretation: 'Veces que rota el inventario en el ejercicio.', warnings: invAvg.warning ? [invAvg.warning] : [] })
        add('rotacion-inventarios', 'Rotación de inventarios', 'actividad', rotInv)
        add('dias-inventario', 'Días de inventario', 'actividad',
            rotInv.status === 'CALCULATED' && toCents(rotInv.value) !== 0
                ? {
                    status: 'CALCULATED',
                    value: r2(DAY_COUNT / rotInv.value),
                    formula: `${DAY_COUNT} / Rotación de inventarios`,
                    substitution: `${DAY_COUNT} / ${fmt(rotInv.value)}`,
                    inputs: rotInv.inputs,
                    interpretation: `Días promedio de permanencia del inventario (política de ${DAY_COUNT} días).`,
                    warnings: rotInv.warnings,
                    unit: 'days',
                    dayCountPolicy: DAY_COUNT,
                }
                : { status: 'NOT_CALCULABLE', reason: 'Requiere rotación de inventarios calculable y distinta de cero.', missingInputs: ['Rotación de inventarios'], formula: `${DAY_COUNT} / Rotación` })

        add('dias-cobranza', 'Días de cobranza', 'actividad', {
            status: 'INSUFFICIENT_INFORMATION',
            reason: 'No hay registro estructurado de ventas a crédito: no se inventan. Usar el auxiliar de clientes cuando exponga ese dato.',
            missingInputs: ['Ventas a crédito del ejercicio'],
            formula: `Créditos por ventas promedio / Ventas a crédito × ${DAY_COUNT}`,
        })
        add('dias-pago', 'Días de pago', 'actividad', {
            status: 'INSUFFICIENT_INFORMATION',
            reason: 'No hay registro estructurado de compras a crédito: no se inventan.',
            missingInputs: ['Compras a crédito del ejercicio'],
            formula: `Proveedores promedio / Compras a crédito × ${DAY_COUNT}`,
        })
        add('ciclo-conversion', 'Ciclo de conversión de efectivo', 'actividad', {
            status: 'INSUFFICIENT_INFORMATION',
            reason: 'Requiere días de cobranza y de pago, hoy no calculables con datos estructurados.',
            missingInputs: ['Días de cobranza', 'Días de pago'],
            formula: 'Días inventario + Días cobranza − Días pago',
        })
        const atAvg = averaged('Activo total', AT, prev ? prev.balanceSheet.totalAssets.amount : null, 'ESP')
        add('rotacion-activo', 'Rotación del activo', 'actividad',
            calc('Ventas / Activo total promedio', input('Ventas', ventas, 'ER'), atAvg.input,
                { unit: 'times', interpretation: 'Ventas generadas por cada peso de activo.', warnings: atAvg.warning ? [atAvg.warning] : [] }))
    }

    // ── Flujo (§13.8) ────────────────────────────────────────
    if (cfo !== null && efe) {
        add('cfo-resultado', 'Flujo operativo / Resultado neto', 'flujo',
            toCents(resultado) === 0
                ? { status: 'NOT_CALCULABLE', reason: 'El resultado del ejercicio es cero.', missingInputs: ['Resultado ≠ 0'], formula: 'CFO / Resultado' }
                : calc('CFO / Resultado', input('Flujo operativo', cfo, 'EFE'), input('Resultado del ejercicio', resultado, 'ER'),
                    { interpretation: 'Calidad del resultado: cuánto se convirtió en efectivo operativo.' }))
        add('flujo-libre', 'Flujo libre (CFO − inversiones)', 'flujo', {
            status: 'CALCULATED',
            value: r2(cfo + efe.investing.amount),
            formula: 'CFO + Flujo de inversión',
            substitution: `${fmt(cfo)} + ${fmt(efe.investing.amount)}`,
            inputs: [input('Flujo operativo', cfo, 'EFE'), input('Flujo de inversión', efe.investing.amount, 'EFE')],
            interpretation: 'Efectivo disponible después de las inversiones del ejercicio.',
            warnings: [],
            unit: 'currency',
        })
        add('deuda-cfo', 'Deuda total / Flujo operativo', 'flujo',
            toCents(cfo) <= 0
                ? { status: 'NOT_CALCULABLE', reason: 'El flujo operativo es cero o negativo: el cociente no admite la lectura habitual.', missingInputs: ['CFO > 0'], formula: 'PT / CFO' }
                : calc('PT / CFO', input('Pasivo total', PT, 'ESP'), input('Flujo operativo', cfo, 'EFE'),
                    { unit: 'times', interpretation: 'Años de flujo operativo necesarios para cancelar la deuda total.' }))
        const intereses = Math.max(0, -bundleFinancialExpenses(bundle))
        add('cobertura-intereses', 'Cobertura de intereses', 'flujo',
            toCents(intereses) === 0
                ? { status: 'NOT_CALCULABLE', reason: 'No hay gastos financieros identificados en el ejercicio.', missingInputs: ['Gastos financieros (FINANCIAL_EXPENSES)'], formula: 'Resultado operativo / Intereses' }
                : calc('Resultado operativo / Gastos financieros', input('Resultado operativo', er.operatingResult.amount, 'ER'), input('Gastos financieros', intereses, 'ER: FINANCIAL_EXPENSES'),
                    { unit: 'times', interpretation: 'Veces que el resultado operativo cubre los gastos financieros.' }))
    }

    return entries
}

/** Resultado financiero negativo (gastos) del ER, en valor con signo */
function bundleFinancialExpenses(bundle: StatementsBundle): number {
    // financialResults es neto (ganancia +); los gastos puros no están
    // separados en el modelo actual: se usa el neto cuando es negativo.
    const net = bundle.incomeStatement.financialResults.amount
    return net < 0 ? net : 0
}
