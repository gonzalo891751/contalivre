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
}

function efeStatement(bundle: ReportingBundle, options: ExportEstadosOptions): { cf: CashFlowStatement2B | null; closingUsed: boolean } {
    const restated = bundle.cashFlowRestated
    const wantClosing = options.currency === 'CLOSING' && !!restated
    const src = wantClosing && restated
        ? { direct: restated.direct, indirect: restated.indirect }
        : { direct: bundle.statements.cashFlowDirect, indirect: bundle.statements.cashFlowIndirect }
    const cf = options.efeMethod === 'INDIRECT' ? src.indirect : src.direct
    return { cf, closingUsed: wantClosing }
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
        const er = s.incomeStatement
        sections.push({
            title: 'Estado de Resultados',
            lines: [er.sales, er.costOfSales, er.grossProfit, er.adminExpenses, er.sellingExpenses, er.operatingResult, er.financialResults, er.otherResults, er.netIncome],
        })
    }
    if (c.eepn) {
        const e = s.equityStatement
        sections.push({
            title: 'Estado de Evolución del Patrimonio Neto',
            lines: [e.openingBalance, e.contributions, e.distributions, e.reservesMovements, e.otherMovements, e.periodResult, e.closingBalance],
        })
    }
    if (c.efe) {
        const { cf, closingUsed } = efeStatement(bundle, options)
        if (cf) {
            const suffix = `${options.efeMethod === 'INDIRECT' ? 'método indirecto' : 'método directo'}${closingUsed ? ' — moneda de cierre' : ''}`
            sections.push({
                title: `Estado de Flujo de Efectivo (${suffix})`,
                lines: [cf.openingCash, cf.operating, cf.investing, cf.financing, ...(cf.unclassified.amount !== 0 ? [cf.unclassified] : []), cf.netChange, cf.closingCash],
            })
        }
    }
    return sections
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
            body: flatten(section.lines, showComp),
            styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: showComp ? { 1: { halign: 'right' }, 2: { halign: 'right' } } : { 1: { halign: 'right' } },
            margin: { left: 40, right: 40, bottom: 56 },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22
    }

    // ── Notas ────────────────────────────────────────────────
    if (options.content.notas && notesCount > 0) {
        if (y > pageH - 140) { doc.addPage(); y = 54 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Notas a los estados contables', 40, y)
        y += 6
        for (const note of bundle.notes) {
            const body: Row[] = note.lines.map(l => [
                l.label + (l.origin === 'MANUAL' ? ' (carga manual)' : l.origin === 'NOT_AVAILABLE' ? ' (no disponible)' : ''),
                l.amount == null ? '' : fmt(l.amount),
            ])
            if (note.total != null) body.push(['Total', fmt(note.total)])
            autoTable(doc, {
                startY: y + 6,
                head: [[note.title, '']],
                body: body.length > 0 ? body : [[note.text ?? '—', '']],
                styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85] },
                headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
                columnStyles: { 1: { halign: 'right' } },
                margin: { left: 40, right: 40, bottom: 56 },
            })
            y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
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
        // marca de agua
        if (isDraft) {
            doc.setFontSize(58); doc.setTextColor(239, 68, 68)
            doc.saveGraphicsState()
            doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.10 }))
            doc.text('BORRADOR', pageW / 2, pageH / 2, { align: 'center', angle: 35 })
            doc.restoreGraphicsState()
        }
        // pie
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120)
        doc.text(notesLegend, 40, pageH - 40)
        doc.text(
            `Motor ${m.engineVersion} · schema v${m.schemaVersion} · reporte ${m.reportVersion} · ${isDraft ? 'BORRADOR' : m.status}`,
            40, pageH - 30,
        )
        doc.text(`Página ${p} de ${pageCount}`, pageW - 40, pageH - 30, { align: 'right' })
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const suffix = isDraft ? '_BORRADOR' : ''
    doc.save(`contalivre-estados-formal-${m.exerciseLabel.replace(/\s+/g, '_')}-${dateStr}${suffix}.pdf`)
}
