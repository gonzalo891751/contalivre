/**
 * Exportación tabular de estados — Fase 2C (§6.3).
 *
 * Genera un .xlsx desde el MISMO ReportingBundle que ve la pantalla: nadie
 * recalcula. Incluye ESP/ER/EEPN/EFE/notas/indicadores/análisis + una hoja
 * "Metadatos" con contexto, versión y validaciones.
 */

import { writeWorkbook, type WorkbookSheet } from './spreadsheet'
import type { ReportingBundle } from '../reporting/loadReportingBundle'
import type { ReportLine } from '../reporting/domain/types'

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

export async function exportReportBundleWorkbook(bundle: ReportingBundle): Promise<void> {
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

    const dateStr = new Date().toISOString().slice(0, 10)
    await writeWorkbook(sheets, `contalivre-estados-${bundle.metadata.exerciseLabel.replace(/\s+/g, '_')}-${dateStr}.xlsx`)
}
