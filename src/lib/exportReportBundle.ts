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

/**
 * Construye las hojas del workbook desde el bundle (pura y testeable).
 * Garantiza que la exportación usa EXACTAMENTE las cifras del motor.
 */
export function buildReportSheets(bundle: ReportingBundle): WorkbookSheet[] {
    const showComp = bundle.metadata.hasComparative
    const headerRow = (): Cell[] => showComp ? ['Concepto', 'Ejercicio actual', 'Ejercicio anterior'] : ['Concepto', 'Ejercicio actual']

    const bs = bundle.statements.balanceSheet
    const er = bundle.statements.incomeStatement
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
        rows: [headerRow(), ...flattenLines([er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.netIncome], showComp)],
    })

    // ── EEPN ─────────────────────────────────────────────────
    sheets.push({
        name: 'EEPN',
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
        const er = s.incomeStatement
        sheets.push({ name: 'ER', rows: [headerRow(), ...flattenLines([er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.netIncome], showComp)] })
    }
    if (c.eepn) {
        const e = s.equityStatement
        sheets.push({ name: 'EEPN', rows: [headerRow(), ...flattenLines([e.openingBalance, e.contributions, e.distributions, e.reservesMovements, e.otherMovements, e.periodResult, e.closingBalance], showComp)] })
    }
    if (c.efe) {
        const restated = bundle.cashFlowRestated
        const wantClosing = options.currency === 'CLOSING' && !!restated
        const src = wantClosing && restated ? { direct: restated.direct, indirect: restated.indirect } : { direct: s.cashFlowDirect, indirect: s.cashFlowIndirect }
        const cf: CashFlowStatement2B | null = options.efeMethod === 'INDIRECT' ? src.indirect : src.direct
        if (cf) {
            const name = `EFE ${options.efeMethod === 'INDIRECT' ? 'indirecto' : 'directo'}${wantClosing ? ' (cierre)' : ''}`
            sheets.push({ name, rows: [['Concepto', 'Importe'], ...flattenLines([cf.openingCash, cf.operating, cf.investing, cf.financing, cf.unclassified, cf.netChange, cf.closingCash], false)] })
        }
    }
    if (c.notas) {
        const notasRows: Cell[][] = [['Nota', 'Concepto', 'Importe', 'Origen', 'Reconcilia']]
        for (const note of bundle.notes) {
            notasRows.push([note.title, note.text ?? '', note.total ?? '', '', note.reconciled == null ? '' : note.reconciled ? 'Sí' : 'No'])
            for (const l of note.lines) notasRows.push(['', l.label, l.amount ?? '', l.origin, ''])
        }
        sheets.push({ name: 'Notas', rows: notasRows })
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
