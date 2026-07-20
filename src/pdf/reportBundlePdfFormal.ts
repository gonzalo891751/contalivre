/**
 * PDF FORMAL de estados contables — Fase 2D (§3).
 *
 * A diferencia de la vista web amigable, este documento sigue la presentación
 * formal (RT 54 T.O. por RT 59 — FACPCE/CENCyA): identificación del ente,
 * un estado por sección con cifras comparativas, referencias a notas, la
 * leyenda de que las notas forman parte integrante y un pie con versión de
 * motor/estado en cada página. No recalcula: renderiza el ReportingBundle.
 *
 * jsPDF y autotable se cargan bajo demanda.
 */

import type { ReportingBundle } from '../reporting/loadReportingBundle'
import type { ReportLine, CashFlowStatement2B } from '../reporting/domain/types'
import type { ExportEstadosOptions } from '../lib/exportOptions'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Row = string[]

function flatten(lines: ReportLine[], showComp: boolean): Row[] {
    const out: Row[] = []
    const walk = (l: ReportLine, depth: number) => {
        const label = '   '.repeat(depth) + l.label + (l.noteRef ? `  (Nota ${l.noteRef})` : '')
        out.push(showComp
            ? [label, fmt(l.amount), l.comparativeAmount == null ? '—' : fmt(l.comparativeAmount)]
            : [label, fmt(l.amount)])
        for (const c of l.children ?? []) walk(c, depth + 1)
    }
    for (const l of lines) walk(l, 0)
    return out
}

interface Section {
    title: string
    lines: ReportLine[]
    /** filas ya resueltas (para renglones con estado, ej. impuesto sin mapping) */
    extraRows?: Row[]
}

/** Filas del ER con la secuencia completa (Fase 2E, §5 / §13.1) */
function incomeStatementRows(bundle: ReportingBundle, showComp: boolean): Row[] {
    const er = bundle.statements.incomeStatement
    const rows = flatten([er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses,
        er.operatingResult, er.financialResults, er.otherResults, er.preTaxResult], showComp)
    if (er.incomeTaxStatus === 'CALCULATED') {
        rows.push(...flatten([er.incomeTax], showComp))
    } else {
        const label = er.incomeTaxStatus === 'NOT_APPLICABLE' ? 'No aplicable' : 'Información insuficiente (sin mapping)'
        rows.push(showComp ? ['Impuesto a las ganancias', label, '—'] : ['Impuesto a las ganancias', label])
    }
    rows.push(...flatten([er.continuingResult, er.netIncome], showComp))
    return rows
}

function efeStatements(bundle: ReportingBundle, options: ExportEstadosOptions): { cf: CashFlowStatement2B; method: 'DIRECT' | 'INDIRECT'; closingUsed: boolean }[] {
    const restated = bundle.cashFlowRestated
    const wantClosing = options.currency === 'CLOSING' && !!restated
    const src = wantClosing && restated
        ? { direct: restated.direct, indirect: restated.indirect }
        : { direct: bundle.statements.cashFlowDirect, indirect: bundle.statements.cashFlowIndirect }
    const methods: ('DIRECT' | 'INDIRECT')[] = options.efeMethod === 'BOTH' ? ['DIRECT', 'INDIRECT'] : [options.efeMethod]
    const out: { cf: CashFlowStatement2B; method: 'DIRECT' | 'INDIRECT'; closingUsed: boolean }[] = []
    for (const method of methods) {
        const cf = method === 'INDIRECT' ? src.indirect : src.direct
        if (cf) out.push({ cf, method, closingUsed: wantClosing })
    }
    return out
}

function buildSections(bundle: ReportingBundle, options: ExportEstadosOptions): Section[] {
    const s = bundle.statements
    const sections: Section[] = []
    const c = options.content

    if (c.esp) {
        const bs = s.balanceSheet
        sections.push({
            title: 'Estado de Situación Patrimonial',
            lines: [bs.currentAssets, bs.nonCurrentAssets, bs.totalAssets, bs.currentLiabilities, bs.nonCurrentLiabilities, bs.totalLiabilities, bs.equity, bs.totalLiabilitiesAndEquity],
        })
    }
    if (c.er) {
        sections.push({
            title: 'Estado de Resultados',
            lines: [],
            extraRows: incomeStatementRows(bundle, options.comparative && bundle.metadata.hasComparative),
        })
    }
    if (c.efe) {
        for (const { cf, method, closingUsed } of efeStatements(bundle, options)) {
            const suffix = `${method === 'INDIRECT' ? 'método indirecto' : 'método directo'}${closingUsed ? ' — moneda de cierre' : ''}`
            sections.push({
                title: `Estado de Flujo de Efectivo (${suffix})`,
                lines: [cf.openingCash, cf.operating, cf.investing, cf.financing, ...(cf.unclassified.amount !== 0 ? [cf.unclassified] : []), cf.netChange, cf.closingCash],
            })
        }
    }
    return sections
}

/**
 * EEPN matricial en página apaisada (§13.2): encabezados agrupados en dos
 * filas, comparativo como columna final y subtotales. Devuelve las tablas
 * head/body para autotable; no recalcula nada.
 */
function equityMatrixTable(bundle: ReportingBundle, showComp: boolean): { head: Row[]; body: Row[] } {
    const m = bundle.statements.equityMatrix
    const groupRow: Row = ['', ...m.columns.map(col => {
        const g = m.columnGroups.find(gr => gr.components.includes(col.component))
        return g?.label ?? ''
    }), 'Total PN']
    const headRow: Row = ['Movimiento', ...m.columns.map(col => col.label), '']
    if (showComp) { groupRow.push('Ej. anterior'); headRow.push('') }

    const rowOf = (row: typeof m.openingRow, compTotal?: number | null): Row => {
        const cells: Row = [row.label,
            ...m.columns.map(col => {
                const v = row.cells[col.component]
                return v === undefined ? '–' : fmt(v)
            }),
            fmt(row.total)]
        if (showComp) cells.push(compTotal == null ? '–' : fmt(compTotal))
        return cells
    }

    const body: Row[] = [rowOf(m.openingRow, showComp ? m.comparative?.openingTotal : undefined)]
    if (m.priorAdjustmentRow.hasData) {
        body.push(rowOf(m.priorAdjustmentRow))
        body.push(rowOf(m.adjustedOpeningRow))
    }
    for (const r of m.movementRows) {
        if (r.hasData) body.push(rowOf(r))
    }
    body.push(rowOf(m.totalVariationsRow))
    body.push(rowOf(m.closingRow, showComp ? m.comparative?.closingTotal : undefined))
    return { head: [groupRow, headRow], body }
}

export async function exportReportBundlePdfFormal(bundle: ReportingBundle, options: ExportEstadosOptions): Promise<void> {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const m = bundle.metadata
    const showComp = m.hasComparative && options.comparative
    const publishable = bundle.statements.validation.canPublish
    const isDraft = !publishable || options.markDraft

    // Cantidad de notas (para la leyenda "las notas 1 a N…")
    const notesCount = bundle.notes.length

    // ── Encabezado / identificación del ente (página 1) ──────
    let y = 54
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42)
    doc.text(m.companyLegalName, pageW / 2, y, { align: 'center' })
    y += 18
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    const idLine1 = [m.companyTaxId ? `CUIT ${m.companyTaxId}` : null, `Jurisdicción ${m.jurisdiction}`].filter(Boolean).join('   ·   ')
    doc.text(idLine1, pageW / 2, y, { align: 'center' })
    y += 13
    doc.text(`${m.exerciseLabel} — período ${m.periodStart} a ${m.periodEnd}`, pageW / 2, y, { align: 'center' })
    y += 13
    const idLine3 = [`Cifras en ${m.currency} (${m.unit})`, showComp ? 'con cifras comparativas del ejercicio anterior' : 'sin comparativo'].join('   ·   ')
    doc.text(idLine3, pageW / 2, y, { align: 'center' })
    y += 13
    doc.setFontSize(8); doc.setTextColor(120)
    doc.text(m.normative, pageW / 2, y, { align: 'center' })
    y += 10
    doc.setDrawColor(203, 213, 225)
    doc.line(40, y, pageW - 40, y)
    y += 16

    // ── Estados seleccionados ────────────────────────────────
    const sections = buildSections(bundle, options)
    const head = showComp ? [['Concepto', 'Ejercicio actual', 'Ejercicio anterior']] : [['Concepto', 'Ejercicio actual']]

    for (const section of sections) {
        // Título del estado (deja respiro; autotable pagina el resto)
        if (y > pageH - 140) { doc.addPage(); y = 54 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text(section.title, 40, y)
        y += 8

        autoTable(doc, {
            startY: y + 6,
            head,
            body: section.extraRows ?? flatten(section.lines, showComp),
            styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: showComp ? { 1: { halign: 'right' }, 2: { halign: 'right' } } : { 1: { halign: 'right' } },
            margin: { left: 40, right: 40, bottom: 56 },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22
    }

    // ── EEPN matricial en página apaisada (§13.2) ────────────
    if (options.content.eepn) {
        doc.addPage('a4', 'landscape')
        const lw = doc.internal.pageSize.getWidth()
        y = 54
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Estado de Evolución del Patrimonio Neto', 40, y)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100)
        doc.text('Cuadro de doble entrada: movimientos por componente del patrimonio neto', 40, y + 12)

        const { head: matrixHead, body: matrixBody } = equityMatrixTable(bundle, showComp)
        const numericCols: Record<number, { halign: 'right' }> = {}
        for (let i = 1; i < matrixHead[1].length; i++) numericCols[i] = { halign: 'right' }
        autoTable(doc, {
            startY: y + 20,
            head: matrixHead,
            body: matrixBody,
            styles: { fontSize: 7.2, cellPadding: 2.5, textColor: [30, 41, 59] },
            headStyles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold', halign: 'center' },
            alternateRowStyles: { fillColor: [250, 249, 255] },
            columnStyles: numericCols,
            margin: { left: 40, right: 40, bottom: 56 },
            tableWidth: lw - 80,
        })

        const hasMore = options.content.notas || options.content.anexos || options.content.indicadores || options.content.analisis
        if (hasMore) { doc.addPage('a4', 'portrait'); y = 54 } else { y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22 }
    }

    // ── Notas (numeradas, con comparativo) ───────────────────
    if (options.content.notas && notesCount > 0) {
        if (y > pageH - 140) { doc.addPage(); y = 54 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Notas a los estados contables', 40, y)
        y += 6
        for (const note of bundle.notes) {
            const body: Row[] = note.lines.map(l => {
                const row: Row = [
                    l.label + (l.origin === 'MANUAL' ? ' (carga manual)' : l.origin === 'NOT_AVAILABLE' ? ' (no disponible)' : ''),
                    l.amount == null ? '' : fmt(l.amount),
                ]
                if (showComp) row.push(l.comparativeAmount == null ? '' : fmt(l.comparativeAmount))
                return row
            })
            if (note.total != null) {
                const totalRow: Row = ['Total', fmt(note.total)]
                if (showComp) totalRow.push(note.comparativeTotal == null ? '' : fmt(note.comparativeTotal))
                body.push(totalRow)
            }
            const headRow: Row = [`Nota ${note.number} — ${note.title}`, '']
            if (showComp) headRow.push('')
            autoTable(doc, {
                startY: y + 6,
                head: [headRow],
                body: body.length > 0 ? body : [[note.text ?? '—', '', ...(showComp ? [''] : [])]],
                styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85] },
                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
                columnStyles: showComp ? { 1: { halign: 'right' }, 2: { halign: 'right' } } : { 1: { halign: 'right' } },
                margin: { left: 40, right: 40, bottom: 56 },
            })
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
        }
    }

    // ── Anexos 2E (§13.4) ────────────────────────────────────
    if (options.content.anexos) {
        const s2 = bundle.statements
        const annexTable = (title: string, head: Row[], body: Row[], numericFrom = 1) => {
            if (y > pageH - 140) { doc.addPage(); y = 54 }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
            doc.text(title, 40, y)
            const cols: Record<number, { halign: 'right' }> = {}
            for (let i = numericFrom; i < head[head.length - 1].length; i++) cols[i] = { halign: 'right' }
            autoTable(doc, {
                startY: y + 10,
                head,
                body,
                styles: { fontSize: 7.6, cellPadding: 2.5, textColor: [30, 41, 59] },
                headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: cols,
                margin: { left: 40, right: 40, bottom: 56 },
            })
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
        }

        // Gastos por función
        const ebf = s2.expensesByFunction
        if (ebf.rows.length > 0 || ebf.unmappedExpenses.length > 0) {
            const head: Row = ['Cuenta', 'Total', ...ebf.columns.map(c2 => c2.label)]
            const body: Row[] = ebf.rows.map(r => [
                `${r.code} ${r.name}`, fmt(r.total),
                ...ebf.columns.map(c2 => (r.cells[c2.function] === undefined ? '–' : fmt(r.cells[c2.function]!))),
            ])
            for (const u of ebf.unmappedExpenses) {
                body.push([`${u.code} ${u.name} (SIN FUNCIÓN)`, fmt(u.total), ...ebf.columns.map(() => '–')])
            }
            body.push(['Total', fmt(ebf.totals.total),
                ...ebf.columns.map(c2 => (ebf.totals.byFunction[c2.function] === undefined ? '–' : fmt(ebf.totals.byFunction[c2.function]!)))])
            annexTable('Anexo — Gastos por función', [head], body)
        }

        // Determinación del costo de ventas
        if (s2.costOfSales.mode !== 'NOT_APPLICABLE') {
            const b = s2.costOfSales
            const cell = (v: { amount: number | null; status: string }) =>
                v.status === 'CALCULATED' && v.amount != null ? fmt(v.amount)
                    : v.status === 'NOT_APPLICABLE' ? 'No aplicable' : 'Información insuficiente'
            const body: Row[] = [
                ['Existencia inicial', cell(b.openingInventory)],
                ['Compras', cell(b.purchases)],
            ]
            if (b.purchaseReturns.status === 'CALCULATED') body.push(['(−) Devoluciones y bonificaciones', cell(b.purchaseReturns)])
            if (b.acquisitionCosts.status === 'CALCULATED') body.push(['(+) Costos de adquisición (fletes)', cell(b.acquisitionCosts)])
            if (b.incorporableCosts.status === 'CALCULATED') body.push(['(+) Otros costos incorporables', cell(b.incorporableCosts)])
            body.push(['Bienes disponibles para la venta', cell(b.goodsAvailableForSale)])
            body.push(['Existencia final', cell(b.closingInventory)])
            if (b.abnormalLosses.status === 'CALCULATED') body.push(['(−) Bajas / pérdidas anormales', cell(b.abnormalLosses)])
            body.push(['Costo de ventas (puente)', cell(b.costOfSales)])
            body.push(['Costo de ventas según el ER', fmt(b.costOfSalesPerIncomeStatement)])
            annexTable('Anexo — Determinación del costo de ventas', [['Concepto', 'Importe']], body)
        }

        // Bienes de uso
        if (s2.fixedAssetsAnnex.rows.length > 0) {
            const head: Row = ['Clase', 'VO inicio', 'Altas', 'Bajas', 'VO cierre',
                'Dep. inicio', 'Dep. ejercicio', 'Bajas dep.', 'Dep. cierre', 'Residual']
            const body: Row[] = [...s2.fixedAssetsAnnex.rows, s2.fixedAssetsAnnex.totals].map(r => [
                r.assetClass, fmt(r.grossOpening), fmt(r.additions), fmt(r.disposals), fmt(r.grossClosing),
                fmt(r.accumDepOpening), fmt(r.periodDepreciation), fmt(r.depDisposals), fmt(r.accumDepClosing), fmt(r.residual),
            ])
            annexTable('Anexo — Bienes de uso', [head], body)
        }

        // Moneda extranjera
        if (s2.foreignCurrency.applicable) {
            const body: Row[] = s2.foreignCurrency.rows.map(r => [
                `${r.code} ${r.name}`, r.currency,
                r.side === 'ASSET' ? 'Activo' : r.side === 'LIABILITY' ? 'Pasivo' : 'Otro',
                'Insuf.', 'Insuf.', fmt(r.measurement),
            ])
            annexTable('Anexo — Moneda extranjera',
                [['Cuenta', 'Moneda', 'Tipo', 'Cantidad', 'Cotización', 'Medición']], body, 3)
        }
    }

    // ── Indicadores / análisis (opcionales) ──────────────────
    if (options.content.indicadores && bundle.metrics.length > 0) {
        if (y > pageH - 140) { doc.addPage(); y = 54 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Indicadores', 40, y)
        const body: Row[] = bundle.metrics.map(e => {
            const r = e.result
            return [e.label, e.category, r.status === 'CALCULATED' ? fmt(r.value) : r.status]
        })
        autoTable(doc, {
            startY: y + 12,
            head: [['Indicador', 'Categoría', 'Valor']],
            body,
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            columnStyles: { 2: { halign: 'right' } },
            margin: { left: 40, right: 40, bottom: 56 },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22
    }

    if (options.content.analisis) {
        if (y > pageH - 140) { doc.addPage(); y = 54 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Análisis vertical y horizontal', 40, y)
        const av = [...bundle.analysis.verticalBalanceSheet, ...bundle.analysis.verticalIncomeStatement]
        autoTable(doc, {
            startY: y + 12,
            head: [['Renglón', 'Importe', 'Base', '%']],
            body: av.map(r => [r.label, fmt(r.amount), r.baseLabel, r.percentage == null ? 'N/D' : `${r.percentage.toFixed(1)}%`]),
            styles: { fontSize: 8, cellPadding: 2.5 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            columnStyles: { 1: { halign: 'right' }, 3: { halign: 'right' } },
            margin: { left: 40, right: 40, bottom: 56 },
        })
    }

    // ── Pie corrido + marca de agua en cada página ───────────
    const pageCount = doc.getNumberOfPages()
    const notesLegend = notesCount > 0
        ? `Las notas 1 a ${notesCount} que se acompañan forman parte integrante de estos estados contables.`
        : 'Estados contables generados por ContaLivre.'
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p)
        // dimensiones de ESTA página (el EEPN matricial va en apaisado)
        const pw = doc.internal.pageSize.getWidth()
        const ph = doc.internal.pageSize.getHeight()
        // marca de agua
        if (isDraft) {
            doc.setFontSize(58); doc.setTextColor(239, 68, 68)
            doc.saveGraphicsState()
            doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.10 }))
            doc.text('BORRADOR', pw / 2, ph / 2, { align: 'center', angle: 35 })
            doc.restoreGraphicsState()
        }
        // pie
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120)
        doc.text(notesLegend, 40, ph - 40)
        doc.text(
            `Motor ${m.engineVersion} · schema v${m.schemaVersion} · reporte ${m.reportVersion} · ${isDraft ? 'BORRADOR' : m.status}`,
            40, ph - 30,
        )
        doc.text(`Página ${p} de ${pageCount}`, pw - 40, ph - 30, { align: 'right' })
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const suffix = isDraft ? '_BORRADOR' : ''
    doc.save(`contalivre-estados-formal-${m.exerciseLabel.replace(/\s+/g, '_')}-${dateStr}${suffix}.pdf`)
}
