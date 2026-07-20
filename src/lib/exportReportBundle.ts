/**
 * Exportación tabular de estados — Fase 2C (§6.3).
 *
 * Genera un .xlsx desde el MISMO ReportingBundle que ve la pantalla: nadie
 * recalcula. Incluye ESP/ER/EEPN/EFE/notas/indicadores/análisis + una hoja
 * "Metadatos" con contexto, versión y validaciones.
 */

import { writeWorkbook, type WorkbookSheet } from './spreadsheet'
import type { ReportingBundle } from '../reporting/loadReportingBundle'
import type { ReportLine, CashFlowStatement2B } from '../reporting/domain/types'
import type { ExportEstadosOptions } from './exportOptions'

type Cell = string | number | null

function flattenLines(lines: ReportLine[], showComp: boolean): Cell[][] {
    const out: Cell[][] = []
    const walk = (l: ReportLine, depth: number) => {
        const label = '  '.repeat(depth) + l.label
        out.push(showComp ? [label, l.amount, l.comparativeAmount ?? null] : [label, l.amount])
        for (const c of l.children ?? []) walk(c, depth + 1)
    }
    for (const l of lines) walk(l, 0)
    return out
}

/** EEPN matricial (Fase 2E §13.2): una fila por movimiento, una columna por componente */
function equityMatrixSheetRows(bundle: ReportingBundle, showComp: boolean): Cell[][] {
    const m = bundle.statements.equityMatrix
    const header: Cell[] = ['Movimiento', ...m.columns.map(c => c.label), 'Total PN']
    if (showComp) header.push('Total ej. anterior')
    const groupHeader: Cell[] = ['', ...m.columns.map(c => {
        const g = m.columnGroups.find(gr => gr.components.includes(c.component))
        return g?.label ?? ''
    }), '']
    if (showComp) groupHeader.push('')

    const rowCells = (row: typeof m.openingRow, compTotal?: number | null): Cell[] => {
        const cells: Cell[] = [row.label, ...m.columns.map(c => row.cells[c.component] ?? null), row.total]
        if (showComp) cells.push(compTotal ?? null)
        return cells
    }

    const rows: Cell[][] = [groupHeader, header]
    rows.push(rowCells(m.openingRow, showComp ? m.comparative?.openingTotal : undefined))
    if (m.priorAdjustmentRow.hasData) rows.push(rowCells(m.priorAdjustmentRow))
    if (m.priorAdjustmentRow.hasData) rows.push(rowCells(m.adjustedOpeningRow))
    for (const r of m.movementRows) {
        if (r.hasData) rows.push(rowCells(r))
    }
    rows.push(rowCells(m.totalVariationsRow))
    rows.push(rowCells(m.closingRow, showComp ? m.comparative?.closingTotal : undefined))
    return rows
}

/** Hojas de anexos 2E (§13.4): gastos por función, CMV, bienes de uso, moneda extranjera */
function annexSheets(bundle: ReportingBundle, showComp: boolean): WorkbookSheet[] {
    const sheets: WorkbookSheet[] = []
    const s = bundle.statements

    // Gastos por función
    if (s.expensesByFunction.rows.length > 0 || s.expensesByFunction.unmappedExpenses.length > 0) {
        const m = s.expensesByFunction
        const header: Cell[] = ['Cuenta', 'Total', ...m.columns.map(c => c.label)]
        if (showComp) header.push('Ej. anterior')
        const rows: Cell[][] = [header]
        for (const r of m.rows) {
            const row: Cell[] = [`${r.code} ${r.name}`, r.total, ...m.columns.map(c => r.cells[c.function] ?? null)]
            if (showComp) row.push(r.comparativeTotal ?? null)
            rows.push(row)
        }
        for (const u of m.unmappedExpenses) {
            rows.push([`${u.code} ${u.name} (SIN FUNCIÓN)`, u.total, ...m.columns.map((): Cell => null)])
        }
        const totalRow: Cell[] = ['Total', m.totals.total, ...m.columns.map(c => m.totals.byFunction[c.function] ?? null)]
        if (showComp) totalRow.push(m.totals.comparativeTotal ?? null)
        rows.push(totalRow)
        sheets.push({ name: 'Gastos por función', rows })
    }

    // Determinación del costo de ventas
    if (s.costOfSales.mode !== 'NOT_APPLICABLE') {
        const b = s.costOfSales
        const val = (v: { amount: number | null; status: string }): Cell =>
            v.status === 'CALCULATED' ? v.amount : v.status === 'NOT_APPLICABLE' ? 'No aplicable' : 'Información insuficiente'
        const rows: Cell[][] = [['Concepto', 'Importe', ...(showComp ? ['Ej. anterior'] : [])]]
        const push = (label: string, v: { amount: number | null; status: string; comparativeAmount?: number | null }) => {
            const row: Cell[] = [label, val(v)]
            if (showComp) row.push(v.comparativeAmount ?? null)
            rows.push(row)
        }
        push('Existencia inicial', b.openingInventory)
        push('Compras', b.purchases)
        if (b.purchaseReturns.status === 'CALCULATED') push('(−) Devoluciones y bonificaciones', b.purchaseReturns)
        if (b.acquisitionCosts.status === 'CALCULATED') push('(+) Costos de adquisición (fletes)', b.acquisitionCosts)
        if (b.incorporableCosts.status === 'CALCULATED') push('(+) Otros costos incorporables', b.incorporableCosts)
        push('Bienes disponibles para la venta', b.goodsAvailableForSale)
        push('Existencia final', b.closingInventory)
        if (b.abnormalLosses.status === 'CALCULATED') push('(−) Bajas / pérdidas anormales', b.abnormalLosses)
        push('Costo de ventas (puente)', b.costOfSales)
        rows.push(['Costo de ventas según ER', b.costOfSalesPerIncomeStatement])
        for (const v of b.validations) rows.push([v.passed ? 'OK' : 'FALLA', v.label, v.difference && v.difference !== 0 ? v.difference : ''])
        sheets.push({ name: 'Costo de ventas', rows })
    }

    // Bienes de uso
    if (s.fixedAssetsAnnex.rows.length > 0) {
        const header: Cell[] = ['Clase', 'VO inicio', 'Altas', 'Bajas', 'VO cierre',
            'Dep. acum. inicio', 'Dep. ejercicio', 'Bajas dep.', 'Dep. acum. cierre', 'Valor residual']
        if (showComp) header.push('Residual ej. anterior')
        const rows: Cell[][] = [header]
        for (const r of [...s.fixedAssetsAnnex.rows, s.fixedAssetsAnnex.totals]) {
            const row: Cell[] = [r.assetClass, r.grossOpening, r.additions, r.disposals, r.grossClosing,
                r.accumDepOpening, r.periodDepreciation, r.depDisposals, r.accumDepClosing, r.residual]
            if (showComp) row.push(r.comparativeResidual ?? null)
            rows.push(row)
        }
        sheets.push({ name: 'Bienes de uso', rows })
    }

    // Moneda extranjera
    if (s.foreignCurrency.applicable) {
        const rows: Cell[][] = [['Cuenta', 'Moneda', 'Tipo', 'Clasificación', 'Cantidad', 'Cotización', 'Fuente', 'Fecha', 'Tipo cotiz.', 'Medición (Diario)', 'Diferencia', ...(showComp ? ['Comparativo'] : [])]]
        for (const r of s.foreignCurrency.rows) {
            const has = r.quantityStatus === 'CALCULATED'
            const row: Cell[] = [`${r.code} ${r.name}`, r.currency,
                r.side === 'ASSET' ? 'Activo' : r.side === 'LIABILITY' ? 'Pasivo' : 'Otro',
                r.monetary,
                has ? (r.quantity ?? null) : 'Información insuficiente',
                has ? (r.rate ?? null) : 'Información insuficiente',
                r.rateSource ?? '', r.rateDate ?? '', r.rateType ?? '',
                r.measurement,
                has ? (r.reconciliationDifference ?? 0) : '']
            if (showComp) row.push(r.comparativeMeasurement ?? null)
            rows.push(row)
        }
        rows.push([s.foreignCurrency.note])
        sheets.push({ name: 'Moneda extranjera', rows })
    }

    return sheets
}

/** Filas del ER con la secuencia completa 2E (impuesto con estado, no $0 ficticio) */
function incomeStatementSheetRows(bundle: ReportingBundle, showComp: boolean): Cell[][] {
    const er = bundle.statements.incomeStatement
    const rows = flattenLines([er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses,
        er.operatingResult, er.financialResults, er.otherResults, er.preTaxResult], showComp)
    if (er.incomeTaxStatus === 'CALCULATED') {
        rows.push(...flattenLines([er.incomeTax], showComp))
    } else {
        const label = er.incomeTaxStatus === 'NOT_APPLICABLE' ? 'No aplicable' : 'Información insuficiente (sin mapping)'
        rows.push(showComp ? ['Impuesto a las ganancias', label, null] : ['Impuesto a las ganancias', label])
    }
    rows.push(...flattenLines([er.continuingResult, er.netIncome], showComp))
    return rows
}

/**
 * Construye las hojas del workbook desde el bundle (pura y testeable).
 * Garantiza que la exportación usa EXACTAMENTE las cifras del motor.
 */
export function buildReportSheets(bundle: ReportingBundle): WorkbookSheet[] {
    const showComp = bundle.metadata.hasComparative
    const headerRow = (): Cell[] => showComp ? ['Concepto', 'Ejercicio actual', 'Ejercicio anterior'] : ['Concepto', 'Ejercicio actual']

    const bs = bundle.statements.balanceSheet
    const eepn = bundle.statements.equityStatement
    const efe = bundle.statements.cashFlowDirect
    const efeInd = bundle.statements.cashFlowIndirect

    const sheets: WorkbookSheet[] = []

    // ── Metadatos (primera hoja) ─────────────────────────────
    const m = bundle.metadata
    const metaRows: Cell[][] = [
        ['ContaLivre — Estados contables'],
        [],
        ['Empresa', m.companyLegalName],
        ['CUIT', m.companyTaxId ?? '—'],
        ['Ejercicio', m.exerciseLabel],
        ['Estado del ejercicio', m.exerciseStatus],
        ['Período', `${m.periodStart} a ${m.periodEnd}`],
        ['Moneda', m.currency],
        ['Unidad', m.unit],
        ['Normativa', m.normative],
        ['Jurisdicción', m.jurisdiction],
        ['Versión app', m.appVersion],
        ['Motor contable', m.engineVersion],
        ['Schema', `v${m.schemaVersion}`],
        ['Commit', m.commit],
        ['Build', m.buildDate],
        ['Versión de reporte', m.reportVersion],
        ['Generado', m.generatedAt],
        ['Estado del reporte', m.status],
        ['Comparativo', m.hasComparative ? 'Sí' : 'No'],
        [],
        ['Validaciones'],
        ...bundle.statements.validation.checks.map((c): Cell[] => [
            c.passed ? 'OK' : 'FALLA', c.label, c.difference !== undefined && c.difference !== 0 ? c.difference : '',
        ]),
    ]
    sheets.push({ name: 'Metadatos', rows: metaRows })

    // ── ESP ──────────────────────────────────────────────────
    sheets.push({
        name: 'ESP',
        rows: [headerRow(), ...flattenLines([bs.currentAssets, bs.nonCurrentAssets, bs.totalAssets, bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities, bs.equity, bs.totalLiabilitiesAndEquity], showComp)],
    })

    // ── ER ───────────────────────────────────────────────────
    sheets.push({
        name: 'ER',
        rows: [headerRow(), ...incomeStatementSheetRows(bundle, showComp)],
    })

    // ── EEPN (matriz de doble entrada, Fase 2E) ──────────────
    sheets.push({ name: 'EEPN', rows: equityMatrixSheetRows(bundle, showComp) })
    sheets.push({
        name: 'EEPN resumen',
        rows: [headerRow(), ...flattenLines([eepn.openingBalance, eepn.contributions, eepn.distributions, eepn.reservesMovements, eepn.otherMovements, eepn.periodResult, eepn.closingBalance], showComp)],
    })

    // ── EFE ──────────────────────────────────────────────────
    if (efe && efeInd) {
        sheets.push({
            name: 'EFE directo',
            rows: [['Concepto', 'Importe'], ...flattenLines([efe.openingCash, efe.operating, efe.investing, efe.financing, efe.unclassified, efe.netChange, efe.closingCash], false)],
        })
        sheets.push({
            name: 'EFE indirecto',
            rows: [['Concepto', 'Importe'], ...flattenLines([efeInd.openingCash, efeInd.operating, efeInd.investing, efeInd.financing, efeInd.netChange, efeInd.closingCash], false)],
        })
    }

    // ── Notas ────────────────────────────────────────────────
    const notasRows: Cell[][] = [['Nota', 'Concepto', 'Importe', 'Origen', 'Reconcilia']]
    for (const note of bundle.notes) {
        notasRows.push([note.title, note.text ?? '', note.total ?? '', '', note.reconciled == null ? '' : note.reconciled ? 'Sí' : 'No'])
        for (const l of note.lines) notasRows.push(['', l.label, l.amount ?? '', l.origin, ''])
    }
    sheets.push({ name: 'Notas', rows: notasRows })

    // ── Indicadores ──────────────────────────────────────────
    const indRows: Cell[][] = [['Indicador', 'Categoría', 'Estado', 'Valor', 'Fórmula', 'Detalle']]
    for (const e of bundle.metrics) {
        const r = e.result
        if (r.status === 'CALCULATED') indRows.push([e.label, e.category, 'Calculado', r.value, r.formula, r.substitution])
        else indRows.push([e.label, e.category, r.status, '', r.formula, 'reason' in r ? r.reason : ''])
    }
    sheets.push({ name: 'Indicadores', rows: indRows })

    // ── Análisis vertical / horizontal ───────────────────────
    const avRows: Cell[][] = [['Renglón', 'Importe', 'Base', 'Base importe', '%']]
    for (const row of [...bundle.analysis.verticalBalanceSheet, ...bundle.analysis.verticalIncomeStatement]) {
        avRows.push([row.label, row.amount, row.baseLabel, row.baseAmount, row.percentage ?? 'N/D'])
    }
    sheets.push({ name: 'Análisis vertical', rows: avRows })

    const ahRows: Cell[][] = [['Renglón', 'Actual', 'Anterior', 'Var. absoluta', 'Var. %', 'Nota']]
    for (const row of [...bundle.analysis.horizontalBalanceSheet, ...bundle.analysis.horizontalIncomeStatement]) {
        ahRows.push([row.label, row.current, row.previous ?? 'N/D', row.absoluteChange ?? 'N/D', row.percentageChange ?? 'N/D', row.note ?? ''])
    }
    sheets.push({ name: 'Análisis horizontal', rows: ahRows })

    // ── Anexos 2E ────────────────────────────────────────────
    sheets.push(...annexSheets(bundle, showComp))

    return sheets
}

/**
 * Hojas del workbook según las opciones de exportación (Fase 2D, §3): filtra
 * por contenido elegido, honra método/moneda del EFE y comparativo. Sigue
 * usando EXACTAMENTE las cifras del bundle.
 */
export function buildSelectedReportSheets(bundle: ReportingBundle, options: ExportEstadosOptions): WorkbookSheet[] {
    const s = bundle.statements
    const c = options.content
    const showComp = bundle.metadata.hasComparative && options.comparative
    const headerRow = (): Cell[] => showComp ? ['Concepto', 'Ejercicio actual', 'Ejercicio anterior'] : ['Concepto', 'Ejercicio actual']
    const sheets: WorkbookSheet[] = []

    // Metadatos siempre presentes (contexto + validaciones + borrador)
    const m = bundle.metadata
    const publishable = s.validation.canPublish
    const isDraft = !publishable || options.markDraft
    sheets.push({
        name: 'Metadatos', rows: [
            ['ContaLivre — Estados contables (exportación formal)'],
            [],
            ['Empresa', m.companyLegalName],
            ['CUIT', m.companyTaxId ?? '—'],
            ['Ejercicio', m.exerciseLabel],
            ['Período', `${m.periodStart} a ${m.periodEnd}`],
            ['Moneda', `${m.currency} (${m.unit})`],
            ['Normativa', m.normative],
            ['Comparativo', showComp ? 'Sí' : 'No'],
            ['Método EFE', options.efeMethod === 'INDIRECT' ? 'Indirecto' : 'Directo'],
            ['Expresión', options.currency === 'CLOSING' ? 'Moneda de cierre' : 'Moneda nominal'],
            ['Motor contable', m.engineVersion],
            ['Versión de reporte', m.reportVersion],
            ['Estado', isDraft ? 'BORRADOR' : m.status],
            [],
            ['Validaciones'],
            ...s.validation.checks.map((ch): Cell[] => [ch.passed ? 'OK' : 'FALLA', ch.label, ch.difference && ch.difference !== 0 ? ch.difference : '']),
        ],
    })

    if (c.esp) {
        const bs = s.balanceSheet
        sheets.push({ name: 'ESP', rows: [headerRow(), ...flattenLines([bs.currentAssets, bs.nonCurrentAssets, bs.totalAssets, bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities, bs.equity, bs.totalLiabilitiesAndEquity], showComp)] })
    }
    if (c.er) {
        sheets.push({ name: 'ER', rows: [headerRow(), ...incomeStatementSheetRows(bundle, showComp)] })
    }
    if (c.eepn) {
        const e = s.equityStatement
        sheets.push({ name: 'EEPN', rows: equityMatrixSheetRows(bundle, showComp) })
        sheets.push({ name: 'EEPN resumen', rows: [headerRow(), ...flattenLines([e.openingBalance, e.contributions, e.distributions, e.reservesMovements, e.otherMovements, e.periodResult, e.closingBalance], showComp)] })
    }
    if (c.efe) {
        const restated = bundle.cashFlowRestated
        const wantClosing = options.currency === 'CLOSING' && !!restated
        const src = wantClosing && restated ? { direct: restated.direct, indirect: restated.indirect } : { direct: s.cashFlowDirect, indirect: s.cashFlowIndirect }
        const methods: ('DIRECT' | 'INDIRECT')[] = options.efeMethod === 'BOTH' ? ['DIRECT', 'INDIRECT'] : [options.efeMethod]
        for (const method of methods) {
            const cf: CashFlowStatement2B | null = method === 'INDIRECT' ? src.indirect : src.direct
            if (!cf) continue
            const name = `EFE ${method === 'INDIRECT' ? 'indirecto' : 'directo'}${wantClosing ? ' (cierre)' : ''}`
            sheets.push({ name, rows: [['Concepto', 'Importe'], ...flattenLines([cf.openingCash, cf.operating, cf.investing, cf.financing, cf.unclassified, cf.netChange, cf.closingCash], false)] })
        }
    }
    if (c.notas) {
        const header: Cell[] = ['Nota', 'Concepto', 'Importe', ...(showComp ? ['Comparativo'] : []), 'Origen', 'Reconcilia']
        const notasRows: Cell[][] = [header]
        for (const note of bundle.notes) {
            const titleRow: Cell[] = [`Nota ${note.number} — ${note.title}`, note.text ?? '', note.total ?? '']
            if (showComp) titleRow.push(note.comparativeTotal ?? '')
            titleRow.push('', note.reconciled == null ? '' : note.reconciled ? 'Sí' : 'No')
            notasRows.push(titleRow)
            for (const l of note.lines) {
                const lineRow: Cell[] = ['', l.label, l.amount ?? '']
                if (showComp) lineRow.push(l.comparativeAmount ?? '')
                lineRow.push(l.origin, '')
                notasRows.push(lineRow)
            }
        }
        sheets.push({ name: 'Notas', rows: notasRows })
    }
    if (c.anexos) {
        sheets.push(...annexSheets(bundle, showComp))
    }
    if (c.indicadores) {
        const indRows: Cell[][] = [['Indicador', 'Categoría', 'Estado', 'Valor', 'Fórmula', 'Detalle']]
        for (const e of bundle.metrics) {
            const r = e.result
            if (r.status === 'CALCULATED') indRows.push([e.label, e.category, 'Calculado', r.value, r.formula, r.substitution])
            else indRows.push([e.label, e.category, r.status, '', r.formula, 'reason' in r ? r.reason : ''])
        }
        sheets.push({ name: 'Indicadores', rows: indRows })
    }
    if (c.analisis) {
        const avRows: Cell[][] = [['Renglón', 'Importe', 'Base', 'Base importe', '%']]
        for (const row of [...bundle.analysis.verticalBalanceSheet, ...bundle.analysis.verticalIncomeStatement]) {
            avRows.push([row.label, row.amount, row.baseLabel, row.baseAmount, row.percentage ?? 'N/D'])
        }
        sheets.push({ name: 'Análisis vertical', rows: avRows })
        const ahRows: Cell[][] = [['Renglón', 'Actual', 'Anterior', 'Var. absoluta', 'Var. %', 'Nota']]
        for (const row of [...bundle.analysis.horizontalBalanceSheet, ...bundle.analysis.horizontalIncomeStatement]) {
            ahRows.push([row.label, row.current, row.previous ?? 'N/D', row.absoluteChange ?? 'N/D', row.percentageChange ?? 'N/D', row.note ?? ''])
        }
        sheets.push({ name: 'Análisis horizontal', rows: ahRows })
    }

    return sheets
}

export async function exportReportBundleWorkbook(bundle: ReportingBundle, options?: ExportEstadosOptions): Promise<void> {
    const sheets = options ? buildSelectedReportSheets(bundle, options) : buildReportSheets(bundle)
    const dateStr = new Date().toISOString().slice(0, 10)
    const draft = options && (!bundle.statements.validation.canPublish || options.markDraft) ? '_BORRADOR' : ''
    await writeWorkbook(sheets, `contalivre-estados-${bundle.metadata.exerciseLabel.replace(/\s+/g, '_')}-${dateStr}${draft}.xlsx`)
}
