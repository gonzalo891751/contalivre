/**
 * Estados contables consolidados (Fase 2K §14, §15, §16).
 *
 * Este módulo NO recalcula estados: consume la hoja de consolidación (que ya
 * hizo la suma línea por línea y todas las eliminaciones) y la expone con la
 * estructura normalizada de ContaLivre, usando el mismo tipo `ReportLine` que
 * los estados individuales para que la UI, el PDF y el Excel puedan reutilizar
 * los presentadores existentes.
 *
 * El EFE consolidado tampoco duplica lógica: parte del `CashFlowStatement2B`
 * canónico que el motor individual ya produjo para cada entidad y le aplica las
 * eliminaciones de flujos intragrupo. No existe una segunda teoría del EFE.
 */

import { toCents } from '../../accounting/domain/money'
import type {
    CashFlowStatement2B,
    ReportLine,
    ValidationCheck,
} from '../../reporting/domain/types'
import { getLineSpec } from '../domain/lines'
import type {
    CashFlowActivity,
    ConsolidatedLineId,
    ConsolidationEngineInput,
    ConsolidationWorksheet,
    WorksheetRow,
} from '../domain/types'

const fromCents = (c: number) => c / 100

// ─────────────────────────────────────────────────────────────
// Tipos de salida
// ─────────────────────────────────────────────────────────────

export interface ConsolidatedBalanceSheet {
    currentAssets: ReportLine
    nonCurrentAssets: ReportLine
    totalAssets: ReportLine
    currentLiabilities: ReportLine
    nonCurrentLiabilities: ReportLine
    totalLiabilities: ReportLine
    /** patrimonio atribuible a los propietarios de la controladora */
    equityOwners: ReportLine
    /** participación no controladora: DENTRO del patrimonio neto (RT 54) */
    nonControllingInterest: ReportLine
    totalEquity: ReportLine
    totalLiabilitiesAndEquity: ReportLine
    equationDifference: number
}

export interface ConsolidatedIncomeStatement {
    sales: ReportLine
    costOfSales: ReportLine
    grossProfit: ReportLine
    adminExpenses: ReportLine
    sellingExpenses: ReportLine
    operatingResult: ReportLine
    financialIncome: ReportLine
    financialExpenses: ReportLine
    otherResults: ReportLine
    preTaxResult: ReportLine
    incomeTax: ReportLine
    /** resultado del ejercicio del GRUPO, antes de atribuirlo */
    netIncome: ReportLine
    /** atribuible a los propietarios de la controladora */
    attributableToOwners: ReportLine
    /** atribuible a la participación no controladora */
    attributableToNci: ReportLine
}

export type EquityColumnId =
    | 'CAPITAL' | 'RESERVAS' | 'RESULTADOS_ACUMULADOS' | 'RESULTADO_EJERCICIO'
    | 'TOTAL_PROPIETARIOS' | 'PNC' | 'TOTAL'

export interface ConsolidatedEquityRow {
    id: string
    label: string
    cells: Partial<Record<EquityColumnId, number>>
    isSubtotal: boolean
    /** el importe no puede determinarse con la información disponible */
    insufficient?: boolean
}

export interface ConsolidatedEquityStatement {
    columns: { id: EquityColumnId; label: string }[]
    rows: ConsolidatedEquityRow[]
    /**
     * Sin la consolidación del ejercicio anterior no hay saldo inicial
     * consolidado: no se estima ni se deja en cero como si fuera un dato.
     */
    openingAvailable: boolean
    note: string
}

export interface ConsolidatedCashFlowLine {
    activity: CashFlowActivity
    label: string
    /** suma de los EFE individuales */
    subtotal: number
    /** eliminación de flujos intragrupo */
    elimination: number
    consolidated: number
    /** aportes por entidad */
    byEntity: { companyId: string; amount: number }[]
}

export interface ConsolidatedCashFlow {
    method: CashFlowStatement2B['method']
    openingCash: number
    lines: ConsolidatedCashFlowLine[]
    netChange: number
    closingCash: number
    /** suma de los efectivos finales individuales, sin depurar */
    sumOfEntityClosingCash: number
    eliminations: {
        id: string
        description: string
        amount: number
        payerActivity: CashFlowActivity
        receiverActivity: CashFlowActivity
        payerCompanyId: string
        receiverCompanyId: string
    }[]
    checks: ValidationCheck[]
    /** motivos por los que el EFE consolidado no puede emitirse */
    blockers: string[]
}

export interface ConsolidatedNote {
    id: string
    title: string
    /** párrafos derivados de datos reales; nunca afirmaciones inventadas */
    paragraphs: string[]
    /** filas de una tabla, cuando la nota expone un cuadro */
    table?: { headers: string[]; rows: string[][] }
    /**
     * true si la nota necesita redacción del usuario para quedar completa.
     * El sistema aporta los datos; la narrativa profesional no se inventa.
     */
    requiresNarrative: boolean
}

export interface ConsolidatedStatements {
    groupName: string
    parentCompanyName: string
    reportingDate: string
    periodStart: string
    periodEnd: string
    currency: string
    measurementUnit: string
    entities: ConsolidationWorksheet['entities']
    balanceSheet: ConsolidatedBalanceSheet
    incomeStatement: ConsolidatedIncomeStatement
    equityStatement: ConsolidatedEquityStatement
    cashFlow: ConsolidatedCashFlow | null
    notes: ConsolidatedNote[]
    checks: ValidationCheck[]
    blockers: string[]
    warnings: string[]
    /** true si el juego puede emitirse formalmente */
    canPublish: boolean
}

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

const noNegZero = (v: number) => (v === 0 ? 0 : v)

function line(id: string, label: string, level: number, amount: number, children?: ReportLine[]): ReportLine {
    return {
        id,
        label,
        level,
        amount: noNegZero(amount),
        accountIds: [],
        children: children && children.length > 0 ? children : undefined,
    }
}

/** Importe de exposición (positivo en su naturaleza) de una fila */
function exposed(row: WorksheetRow): number {
    return noNegZero(row.consolidated * row.naturalSign)
}

function rowsOf(ws: ConsolidationWorksheet, section: WorksheetRow['section']): WorksheetRow[] {
    return ws.rows.filter(r => r.section === section)
}

function amountOf(ws: ConsolidationWorksheet, lineId: ConsolidatedLineId): number {
    const row = ws.rows.find(r => r.lineId === lineId)
    return row ? exposed(row) : 0
}

function childLines(rows: WorksheetRow[], prefix: string): ReportLine[] {
    return rows
        .filter(r => toCents(r.consolidated) !== 0)
        .map(r => {
            const l = line(`${prefix}:${r.lineId}`, r.label, 2, exposed(r))
            l.accountIds = r.byEntity.flatMap(e => e.accountIds)
            return l
        })
}

function sumRows(rows: WorksheetRow[]): number {
    return noNegZero(fromCents(rows.reduce((s, r) => s + toCents(r.consolidated) * r.naturalSign, 0)))
}

// ─────────────────────────────────────────────────────────────
// Estado de Situación Patrimonial Consolidado
// ─────────────────────────────────────────────────────────────

export function buildConsolidatedBalanceSheet(ws: ConsolidationWorksheet): ConsolidatedBalanceSheet {
    const acRows = rowsOf(ws, 'ASSET_CURRENT')
    const ancRows = rowsOf(ws, 'ASSET_NON_CURRENT')
    const pcRows = rowsOf(ws, 'LIABILITY_CURRENT')
    const pncRows = rowsOf(ws, 'LIABILITY_NON_CURRENT')
    const equityRows = rowsOf(ws, 'EQUITY').filter(r => r.lineId !== 'PN_PARTICIPACION_NO_CONTROLADORA')
    const resultRows = rowsOf(ws, 'RESULT')

    const currentAssets = line('esp-cons:ac', 'Activo corriente', 1, sumRows(acRows), childLines(acRows, 'esp-cons:ac'))
    const nonCurrentAssets = line('esp-cons:anc', 'Activo no corriente', 1, sumRows(ancRows), childLines(ancRows, 'esp-cons:anc'))
    const totalAssets = line('esp-cons:activo', 'Total del activo', 0,
        currentAssets.amount + nonCurrentAssets.amount, [currentAssets, nonCurrentAssets])

    const currentLiabilities = line('esp-cons:pc', 'Pasivo corriente', 1, sumRows(pcRows), childLines(pcRows, 'esp-cons:pc'))
    const nonCurrentLiabilities = line('esp-cons:pnc', 'Pasivo no corriente', 1, sumRows(pncRows), childLines(pncRows, 'esp-cons:pnc'))
    const totalLiabilities = line('esp-cons:pasivo', 'Total del pasivo', 0,
        currentLiabilities.amount + nonCurrentLiabilities.amount, [currentLiabilities, nonCurrentLiabilities])

    // El resultado del ejercicio atribuible a los propietarios integra su
    // patrimonio: la suma de las filas de resultado (con la línea de la PNC ya
    // descontada dentro) es exactamente ese importe.
    const resultOwners = noNegZero(fromCents(-resultRows.reduce((s, r) => s + toCents(r.consolidated), 0)))
    const equityChildren = childLines(equityRows, 'esp-cons:pn')
    if (toCents(resultOwners) !== 0) {
        equityChildren.push(line('esp-cons:pn:resultado', 'Resultado del ejercicio', 2, resultOwners))
    }
    const equityOwners = line('esp-cons:pn-propietarios',
        'Patrimonio neto atribuible a los propietarios de la controladora', 1,
        sumRows(equityRows) + resultOwners, equityChildren)

    const nci = line('esp-cons:pnc-participacion', 'Participación no controladora', 1,
        amountOf(ws, 'PN_PARTICIPACION_NO_CONTROLADORA'))

    const totalEquity = line('esp-cons:pn', 'Total del patrimonio neto', 0,
        equityOwners.amount + nci.amount, [equityOwners, nci])

    const totalLE = line('esp-cons:pasivo-pn', 'Total del pasivo y del patrimonio neto', 0,
        totalLiabilities.amount + totalEquity.amount)

    return {
        currentAssets,
        nonCurrentAssets,
        totalAssets,
        currentLiabilities,
        nonCurrentLiabilities,
        totalLiabilities,
        equityOwners,
        nonControllingInterest: nci,
        totalEquity,
        totalLiabilitiesAndEquity: totalLE,
        equationDifference: fromCents(toCents(totalAssets.amount) - toCents(totalLE.amount)),
    }
}

// ─────────────────────────────────────────────────────────────
// Estado de Resultados Consolidado
// ─────────────────────────────────────────────────────────────

export function buildConsolidatedIncomeStatement(ws: ConsolidationWorksheet): ConsolidatedIncomeStatement {
    const at = (id: ConsolidatedLineId) => amountOf(ws, id)

    const sales = line('er-cons:ventas', getLineSpec('ER_VENTAS').label, 1, at('ER_VENTAS'))
    const costOfSales = line('er-cons:cmv', getLineSpec('ER_COSTO_VENTAS').label, 1, at('ER_COSTO_VENTAS'))
    const grossProfit = line('er-cons:bruto', 'Resultado bruto', 0, sales.amount - costOfSales.amount)
    const adminExpenses = line('er-cons:admin', getLineSpec('ER_GASTOS_ADMINISTRACION').label, 1, at('ER_GASTOS_ADMINISTRACION'))
    const sellingExpenses = line('er-cons:comerc', getLineSpec('ER_GASTOS_COMERCIALIZACION').label, 1, at('ER_GASTOS_COMERCIALIZACION'))
    const operatingResult = line('er-cons:operativo', 'Resultado operativo', 0,
        grossProfit.amount - adminExpenses.amount - sellingExpenses.amount)

    const financialIncome = line('er-cons:fin-ing', getLineSpec('ER_INGRESOS_FINANCIEROS').label, 1, at('ER_INGRESOS_FINANCIEROS'))
    const financialExpenses = line('er-cons:fin-gas', getLineSpec('ER_GASTOS_FINANCIEROS').label, 1, at('ER_GASTOS_FINANCIEROS'))
    const otherResults = line('er-cons:otros', getLineSpec('ER_OTROS_RESULTADOS').label, 1,
        at('ER_OTROS_RESULTADOS') + at('ER_RESULTADO_INVERSIONES_PERMANENTES'))

    const preTaxResult = line('er-cons:antes-impuesto', 'Resultado antes del impuesto a las ganancias', 0,
        operatingResult.amount + financialIncome.amount - financialExpenses.amount + otherResults.amount)
    const incomeTax = line('er-cons:impuesto', getLineSpec('ER_IMPUESTO_GANANCIAS').label, 1, at('ER_IMPUESTO_GANANCIAS'))

    const netIncome = line('er-cons:neto', 'Resultado del ejercicio', 0, preTaxResult.amount - incomeTax.amount)
    const toNci = line('er-cons:pnc', 'Resultado atribuible a la participación no controladora', 1,
        at('ER_RESULTADO_PNC'))
    const toOwners = line('er-cons:propietarios',
        'Resultado atribuible a los propietarios de la controladora', 1,
        netIncome.amount - toNci.amount)

    return {
        sales, costOfSales, grossProfit, adminExpenses, sellingExpenses, operatingResult,
        financialIncome, financialExpenses, otherResults, preTaxResult, incomeTax,
        netIncome, attributableToOwners: toOwners, attributableToNci: toNci,
    }
}

// ─────────────────────────────────────────────────────────────
// Estado de Evolución del Patrimonio Neto Consolidado
// ─────────────────────────────────────────────────────────────

const EQUITY_COLUMNS: { id: EquityColumnId; label: string }[] = [
    { id: 'CAPITAL', label: 'Capital' },
    { id: 'RESERVAS', label: 'Reservas' },
    { id: 'RESULTADOS_ACUMULADOS', label: 'Resultados acumulados' },
    { id: 'RESULTADO_EJERCICIO', label: 'Resultado del ejercicio' },
    { id: 'TOTAL_PROPIETARIOS', label: 'Total propietarios de la controladora' },
    { id: 'PNC', label: 'Participación no controladora' },
    { id: 'TOTAL', label: 'Total del patrimonio neto' },
]

export function buildConsolidatedEquityStatement(
    ws: ConsolidationWorksheet,
    incomeStatement: ConsolidatedIncomeStatement,
    comparative?: ConsolidationWorksheet | null
): ConsolidatedEquityStatement {
    const capital = amountOf(ws, 'PN_CAPITAL')
    const reservas = amountOf(ws, 'PN_RESERVAS')
    const acumulados = amountOf(ws, 'PN_RESULTADOS_ACUMULADOS')
    const resultado = incomeStatement.attributableToOwners.amount
    const pnc = amountOf(ws, 'PN_PARTICIPACION_NO_CONTROLADORA')

    const totalOwners = capital + reservas + acumulados + resultado
    const rows: ConsolidatedEquityRow[] = []

    const openingAvailable = !!comparative
    if (comparative) {
        const oCapital = amountOf(comparative, 'PN_CAPITAL')
        const oReservas = amountOf(comparative, 'PN_RESERVAS')
        // El resultado del ejercicio anterior, al cierre de aquel ejercicio,
        // pasa a integrar los resultados acumulados de este.
        const prevIncome = buildConsolidatedIncomeStatement(comparative)
        const oAcumulados = amountOf(comparative, 'PN_RESULTADOS_ACUMULADOS') + prevIncome.attributableToOwners.amount
        const oPnc = amountOf(comparative, 'PN_PARTICIPACION_NO_CONTROLADORA')
        rows.push({
            id: 'eepn-cons:inicio',
            label: 'Saldos al inicio del ejercicio',
            cells: {
                CAPITAL: oCapital, RESERVAS: oReservas, RESULTADOS_ACUMULADOS: oAcumulados,
                RESULTADO_EJERCICIO: 0,
                TOTAL_PROPIETARIOS: oCapital + oReservas + oAcumulados,
                PNC: oPnc,
                TOTAL: oCapital + oReservas + oAcumulados + oPnc,
            },
            isSubtotal: false,
        })
        rows.push({
            id: 'eepn-cons:variaciones',
            label: 'Variaciones del ejercicio (aportes, distribuciones y reservas)',
            cells: {
                CAPITAL: capital - oCapital,
                RESERVAS: reservas - oReservas,
                RESULTADOS_ACUMULADOS: acumulados - oAcumulados,
                RESULTADO_EJERCICIO: 0,
                TOTAL_PROPIETARIOS: (capital - oCapital) + (reservas - oReservas) + (acumulados - oAcumulados),
                PNC: pnc - oPnc - incomeStatement.attributableToNci.amount,
                TOTAL: 0,
            },
            isSubtotal: false,
        })
    } else {
        rows.push({
            id: 'eepn-cons:inicio',
            label: 'Saldos al inicio del ejercicio',
            cells: {},
            isSubtotal: false,
            insufficient: true,
        })
    }

    rows.push({
        id: 'eepn-cons:resultado',
        label: 'Resultado del ejercicio',
        cells: {
            RESULTADO_EJERCICIO: resultado,
            TOTAL_PROPIETARIOS: resultado,
            PNC: incomeStatement.attributableToNci.amount,
            TOTAL: resultado + incomeStatement.attributableToNci.amount,
        },
        isSubtotal: false,
    })

    rows.push({
        id: 'eepn-cons:cierre',
        label: 'Saldos al cierre del ejercicio',
        cells: {
            CAPITAL: capital, RESERVAS: reservas, RESULTADOS_ACUMULADOS: acumulados,
            RESULTADO_EJERCICIO: resultado,
            TOTAL_PROPIETARIOS: totalOwners,
            PNC: pnc,
            TOTAL: totalOwners + pnc,
        },
        isSubtotal: true,
    })

    // Recalcular la fila de variaciones para que cierre contra el saldo final
    if (comparative) {
        const start = rows[0].cells
        const variation = rows[1].cells
        variation.TOTAL = (variation.TOTAL_PROPIETARIOS ?? 0) + (variation.PNC ?? 0)
        const closing = rows[3].cells
        const drift = (closing.TOTAL ?? 0) - ((start.TOTAL ?? 0) + (variation.TOTAL ?? 0) + resultado + incomeStatement.attributableToNci.amount)
        if (Math.abs(drift) >= 0.005) {
            rows[1].label += ' — revisar: la evolución no cierra contra el saldo final'
        }
    }

    return {
        columns: EQUITY_COLUMNS,
        rows,
        openingAvailable,
        note: openingAvailable
            ? 'Los saldos al inicio provienen de la consolidación del ejercicio anterior.'
            : 'No se vinculó la consolidación del ejercicio anterior: el saldo inicial consolidado no puede determinarse ' +
              'y no se estima. Vinculá el ejercicio comparativo para completar la evolución.',
    }
}

// ─────────────────────────────────────────────────────────────
// Estado de Flujo de Efectivo Consolidado
// ─────────────────────────────────────────────────────────────

const ACTIVITY_LABEL: Record<CashFlowActivity, string> = {
    OPERATING: 'Actividades operativas',
    INVESTING: 'Actividades de inversión',
    FINANCING: 'Actividades de financiación',
}

export function buildConsolidatedCashFlow(
    input: ConsolidationEngineInput,
    ws: ConsolidationWorksheet
): ConsolidatedCashFlow | null {
    const included = input.entities.filter(e =>
        e.companyId === input.group.parentCompanyId || e.method === 'FULL')

    const blockers: string[] = []
    const statements = included.map(e => ({
        companyId: e.companyId,
        companyName: e.companyName,
        cf: e.statements?.cashFlowDirect ?? e.statements?.cashFlowIndirect ?? null,
    }))

    const missing = statements.filter(s => !s.cf)
    if (missing.length > 0) {
        blockers.push(
            `No hay Estado de Flujo de Efectivo individual para: ${missing.map(m => m.companyName).join(', ')}. ` +
            'El EFE consolidado se construye sobre los EFE individuales: sin ellos no se emite (y no se simula).'
        )
        return {
            method: 'DIRECT',
            openingCash: 0,
            lines: [],
            netChange: 0,
            closingCash: 0,
            sumOfEntityClosingCash: 0,
            eliminations: [],
            checks: [],
            blockers,
        }
    }

    const method = statements[0].cf!.method
    const openingCents = statements.reduce((s, e) => s + toCents(e.cf!.openingCash.amount), 0)
    const closingSumCents = statements.reduce((s, e) => s + toCents(e.cf!.closingCash.amount), 0)

    const activityTotal = (activity: CashFlowActivity, companyId: string): number => {
        const entry = statements.find(s => s.companyId === companyId)!
        const cf = entry.cf!
        const source = activity === 'OPERATING' ? cf.operating : activity === 'INVESTING' ? cf.investing : cf.financing
        return toCents(source.amount)
    }

    // Eliminaciones de flujos intragrupo: lo que una entidad pagó es lo que la
    // otra cobró. Se quitan AMBOS lados, así el efectivo total del grupo no cambia.
    const eliminations: ConsolidatedCashFlow['eliminations'] = []
    const elimByActivity: Record<CashFlowActivity, number> = { OPERATING: 0, INVESTING: 0, FINANCING: 0 }
    const includedIds = new Set(included.map(e => e.companyId))

    for (const op of input.operations) {
        if (!op.cashFlow || toCents(op.cashFlow.amount) === 0) continue
        if (!includedIds.has(op.sellerCompanyId) || !includedIds.has(op.buyerCompanyId)) continue
        const cents = toCents(op.cashFlow.amount)
        // El comprador paga (salida) y el vendedor cobra (entrada)
        elimByActivity[op.cashFlow.payerActivity] += cents      // se anula la salida
        elimByActivity[op.cashFlow.receiverActivity] -= cents   // se anula la entrada
        eliminations.push({
            id: `efe-elim-${op.id}`,
            description: op.description,
            amount: op.cashFlow.amount,
            payerActivity: op.cashFlow.payerActivity,
            receiverActivity: op.cashFlow.receiverActivity,
            payerCompanyId: op.buyerCompanyId,
            receiverCompanyId: op.sellerCompanyId,
        })
    }

    const lines: ConsolidatedCashFlowLine[] = (['OPERATING', 'INVESTING', 'FINANCING'] as CashFlowActivity[])
        .map(activity => {
            const byEntity = included.map(e => ({
                companyId: e.companyId,
                amount: fromCents(activityTotal(activity, e.companyId)),
            }))
            const subtotalCents = byEntity.reduce((s, e) => s + toCents(e.amount), 0)
            const elimCents = elimByActivity[activity]
            return {
                activity,
                label: ACTIVITY_LABEL[activity],
                subtotal: fromCents(subtotalCents),
                elimination: fromCents(elimCents),
                consolidated: fromCents(subtotalCents + elimCents),
                byEntity,
            }
        })

    const netCents = lines.reduce((s, l) => s + toCents(l.consolidated), 0)
    const closingCents = openingCents + netCents

    const checks: ValidationCheck[] = [
        {
            id: 'efe-cons-efectivo-final',
            label: 'El efectivo final consolidado coincide con la suma depurada del efectivo real del grupo',
            passed: closingCents === closingSumCents,
            expected: fromCents(closingSumCents),
            actual: fromCents(closingCents),
            difference: fromCents(closingCents - closingSumCents),
            detail: closingCents !== closingSumCents
                ? 'Las eliminaciones de flujos intragrupo alteraron el efectivo del grupo, lo que es imposible: ' +
                  'un pago entre entidades del grupo no cambia el efectivo total. Revisá las actividades declaradas.'
                : undefined,
        },
        {
            id: 'efe-cons-flujos-internos-cero',
            label: 'Los flujos de efectivo intragrupo quedan eliminados por igual importe en ambos lados',
            passed: elimByActivity.OPERATING + elimByActivity.INVESTING + elimByActivity.FINANCING === 0,
            actual: fromCents(elimByActivity.OPERATING + elimByActivity.INVESTING + elimByActivity.FINANCING),
        },
    ]

    for (const check of checks) {
        if (!check.passed) blockers.push(`${check.label}${check.detail ? `: ${check.detail}` : ''}`)
    }

    // El efectivo consolidado del ESP tiene que ser el mismo efectivo del EFE
    const espCash = toCents(amountOf(ws, 'AC_CAJA_BANCOS'))
    checks.push({
        id: 'efe-cons-vs-esp',
        label: 'El efectivo final del EFE consolidado coincide con Caja y bancos del ESP consolidado',
        passed: closingCents === espCash,
        expected: fromCents(espCash),
        actual: fromCents(closingCents),
        difference: fromCents(closingCents - espCash),
    })
    if (closingCents !== espCash) {
        blockers.push(
            `El efectivo final del EFE consolidado (${fromCents(closingCents)}) no coincide con Caja y bancos del ESP ` +
            `consolidado (${fromCents(espCash)}).`
        )
    }

    return {
        method,
        openingCash: fromCents(openingCents),
        lines,
        netChange: fromCents(netCents),
        closingCash: fromCents(closingCents),
        sumOfEntityClosingCash: fromCents(closingSumCents),
        eliminations,
        checks,
        blockers,
    }
}

// ─────────────────────────────────────────────────────────────
// Notas consolidadas
// ─────────────────────────────────────────────────────────────

const pct = (v: number) => `${(v * 100).toFixed(2).replace('.', ',')} %`
const money = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function buildConsolidatedNotes(
    input: ConsolidationEngineInput,
    ws: ConsolidationWorksheet
): ConsolidatedNote[] {
    const notes: ConsolidatedNote[] = []
    const parentName = ws.entities.find(e => e.companyId === ws.parentCompanyId)?.name ?? ws.parentCompanyId

    notes.push({
        id: 'nota-bases',
        title: 'Bases de consolidación',
        paragraphs: [
            `Los presentes estados contables consolidados presentan a ${parentName} y a sus entidades controladas ` +
            'como si constituyeran una única entidad económica.',
            'Se aplicó el método de consolidación total: se incorporó el 100 % de los activos, pasivos, ingresos y ' +
            'gastos de cada controlada, se eliminó la inversión de la controladora contra el patrimonio neto de la ' +
            'controlada y se reconoció la participación no controladora dentro del patrimonio neto.',
            'Se eliminaron íntegramente los saldos recíprocos, las operaciones entre entidades del grupo, los flujos ' +
            'de efectivo entre ellas y los resultados no trascendidos a terceros contenidos en los activos que ' +
            'permanecen dentro del grupo.',
            `Moneda de presentación: ${ws.presentationCurrency}. Unidad de medida: ${ws.measurementUnit}.`,
            'Marco normativo: RT 54 (texto ordenado por RT 59).',
        ],
        requiresNarrative: false,
    })

    const memberRows = input.entities.map(e => {
        const link = input.entities.find(x => x.companyId === e.companyId)!
        return [
            e.companyName,
            e.relation === 'PARENT' ? 'Controladora'
                : e.relation === 'SUBSIDIARY' ? 'Controlada'
                    : e.relation === 'ASSOCIATE' ? 'Asociada' : 'Negocio conjunto',
            e.relation === 'PARENT' ? '—' : pct(link.ownership),
            e.method === 'FULL' ? 'Consolidación total'
                : e.method === 'EQUITY_METHOD' ? 'Medición por valor patrimonial proporcional'
                    : 'Excluida',
            e.periodEnd,
        ]
    })
    notes.push({
        id: 'nota-composicion',
        title: 'Composición del grupo económico',
        paragraphs: [
            'El perímetro de consolidación se determinó por la existencia de CONTROL, no por el mero porcentaje de ' +
            'participación. Las asociadas y los negocios conjuntos no se consolidan: se miden por valor patrimonial ' +
            'proporcional y su medición se expone en una única línea del activo.',
        ],
        table: {
            headers: ['Entidad', 'Relación', 'Participación', 'Tratamiento', 'Cierre del ejercicio'],
            rows: memberRows,
        },
        requiresNarrative: false,
    })

    if (ws.nci.length > 0) {
        notes.push({
            id: 'nota-pnc',
            title: 'Participación no controladora',
            paragraphs: [
                'La participación no controladora representa la porción del patrimonio neto de las controladas que ' +
                'pertenece a accionistas ajenos al grupo. Integra el patrimonio neto consolidado y NO constituye una ' +
                'deuda del grupo.',
            ],
            table: {
                headers: [
                    'Controlada', '% no controlado', 'PN de la controlada', 'Resultados no trascendidos',
                    'PN ajustado', 'PNC al cierre', 'Resultado atribuible a la PNC',
                ],
                rows: ws.nci.map(d => [
                    d.companyName,
                    pct(d.nonControllingRatio),
                    money(d.subsidiaryEquity),
                    money(-d.unrealizedFromSubsidiary),
                    money(d.adjustedEquity),
                    money(d.closingNci),
                    money(d.nciResult),
                ]),
            },
            requiresNarrative: false,
        })
    }

    if (input.operations.length > 0) {
        notes.push({
            id: 'nota-operaciones-intragrupo',
            title: 'Operaciones entre entidades consolidadas',
            paragraphs: [
                'Las operaciones detalladas se realizaron entre entidades que integran el perímetro de consolidación y ' +
                'fueron eliminadas en su totalidad: para la entidad económica única no existieron.',
                'Esta nota NO reemplaza la información sobre partes relacionadas NO consolidadas (asociadas, negocios ' +
                'conjuntos, personal clave), que debe revelarse por separado y requiere redacción del emisor.',
            ],
            table: {
                headers: ['Operación', 'Vendedora', 'Compradora', 'Importe', 'Realizado a terceros', 'Resultado no trascendido'],
                rows: input.operations.map(op => {
                    const internal = op.transferAmount - op.groupCost
                    const unrealized = op.manualUnrealizedAmount ?? internal * (1 - op.realizedRatio)
                    return [
                        op.description,
                        ws.entities.find(e => e.companyId === op.sellerCompanyId)?.name ?? op.sellerCompanyId,
                        ws.entities.find(e => e.companyId === op.buyerCompanyId)?.name ?? op.buyerCompanyId,
                        money(op.transferAmount),
                        pct(op.realizedRatio),
                        money(unrealized),
                    ]
                }),
            },
            requiresNarrative: true,
        })
    }

    const pending = input.reciprocals.filter(r => r.status !== 'RECONCILED')
    if (input.reciprocals.length > 0) {
        notes.push({
            id: 'nota-reciprocos',
            title: 'Saldos recíprocos',
            paragraphs: [
                `Se conciliaron ${input.reciprocals.length} partidas recíprocas entre entidades del grupo, que fueron ` +
                'eliminadas por el importe conciliado.',
                pending.length > 0
                    ? `Quedan ${pending.length} partidas sin conciliar. Las diferencias se exponen y no se compensan.`
                    : 'No quedan partidas recíprocas sin conciliar.',
            ],
            requiresNarrative: pending.length > 0,
        })
    }

    notes.push({
        id: 'nota-juicios',
        title: 'Juicios significativos y ajustes de consolidación',
        paragraphs: [
            'Los ajustes y eliminaciones de consolidación son EXTRACONTABLES: no se registran en los libros diarios ni ' +
            'en los mayores de la controladora ni de las controladas, no modifican sus balances individuales ni su ' +
            'patrimonio neto legal, y pueden recalcularse sin alterar los datos fuente.',
            `Se aplicaron ${ws.eliminations.length} asientos de eliminación, todos con Debe igual a Haber.`,
            'La conclusión sobre la existencia de control en cada entidad, y su fundamento, se registran en el perímetro ' +
            'de consolidación. Esta nota requiere que el emisor complete los juicios significativos que correspondan.',
        ],
        requiresNarrative: true,
    })

    return notes
}

// ─────────────────────────────────────────────────────────────
// Orquestador
// ─────────────────────────────────────────────────────────────

export function buildConsolidatedStatements(
    input: ConsolidationEngineInput,
    ws: ConsolidationWorksheet
): ConsolidatedStatements {
    const balanceSheet = buildConsolidatedBalanceSheet(ws)
    const incomeStatement = buildConsolidatedIncomeStatement(ws)
    const equityStatement = buildConsolidatedEquityStatement(ws, incomeStatement, input.comparative)
    const cashFlow = buildConsolidatedCashFlow(input, ws)
    const notes = buildConsolidatedNotes(input, ws)

    const checks: ValidationCheck[] = [...ws.checks]
    checks.push({
        id: 'esp-cons-ecuacion',
        label: 'ESP consolidado: activo = pasivo + patrimonio neto (propietarios + participación no controladora)',
        passed: toCents(balanceSheet.equationDifference) === 0,
        expected: 0,
        actual: balanceSheet.equationDifference,
        difference: balanceSheet.equationDifference,
    })
    checks.push({
        id: 'er-cons-atribucion',
        label: 'ER consolidado: resultado del ejercicio = atribuible a propietarios + atribuible a la PNC',
        passed: toCents(incomeStatement.netIncome.amount) ===
            toCents(incomeStatement.attributableToOwners.amount) + toCents(incomeStatement.attributableToNci.amount),
        expected: incomeStatement.netIncome.amount,
        actual: incomeStatement.attributableToOwners.amount + incomeStatement.attributableToNci.amount,
    })
    checks.push({
        id: 'esp-er-consistencia',
        label: 'El resultado del ejercicio del ER consolidado integra el patrimonio del ESP consolidado',
        passed: (() => {
            const inEquity = balanceSheet.equityOwners.children?.find(c => c.id === 'esp-cons:pn:resultado')
            return toCents(inEquity?.amount ?? 0) === toCents(incomeStatement.attributableToOwners.amount)
        })(),
        expected: incomeStatement.attributableToOwners.amount,
    })
    if (cashFlow) checks.push(...cashFlow.checks)

    const blockers = [...ws.blockers, ...(cashFlow?.blockers ?? [])]
    for (const check of checks) {
        if (!check.passed && !blockers.some(b => b.startsWith(check.label))) {
            blockers.push(`${check.label}${check.detail ? `: ${check.detail}` : ''}`)
        }
    }

    const parentName = ws.entities.find(e => e.companyId === ws.parentCompanyId)?.name ?? ws.parentCompanyId

    return {
        groupName: ws.groupName,
        parentCompanyName: parentName,
        reportingDate: ws.reportingDate,
        periodStart: ws.periodStart,
        periodEnd: ws.periodEnd,
        currency: ws.presentationCurrency,
        measurementUnit: ws.measurementUnit,
        entities: ws.entities,
        balanceSheet,
        incomeStatement,
        equityStatement,
        cashFlow,
        notes,
        checks,
        blockers: Array.from(new Set(blockers)),
        warnings: ws.warnings,
        canPublish: blockers.length === 0,
    }
}
