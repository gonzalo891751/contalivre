/**
 * PDF FORMAL del juego consolidado (Fase 2K §22).
 *
 * Mantiene el diseño de la exportación formal ya existente
 * (src/pdf/reportBundlePdfFormal.ts): identificación del ente, un estado por
 * sección, leyenda de notas y pie de provenance en cada página. No recalcula
 * nada: renderiza el ConsolidatedStatements que produjo el motor.
 *
 * Cada estado lleva "Consolidado" en su denominación, identifica al grupo y a
 * la controladora, y declara moneda, unidad de medida y período, como exige la
 * exposición formal.
 */

import { APP_VERSION, ACCOUNTING_ENGINE_VERSION, CURRENT_SCHEMA_VERSION, NORMATIVE_BASELINE } from '../../accounting/migration/versions'
import type { ReportLine } from '../../reporting/domain/types'
import type { ConsolidationWorksheet } from '../domain/types'
import type { ConsolidatedStatements } from '../engine/statements'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Row = string[]

function flatten(lines: ReportLine[]): Row[] {
    const out: Row[] = []
    const walk = (l: ReportLine, depth: number) => {
        out.push(['   '.repeat(depth) + l.label, fmt(l.amount)])
        for (const c of l.children ?? []) walk(c, depth + 1)
    }
    for (const l of lines) walk(l, 0)
    return out
}

export interface ConsolidatedPdfOptions {
    /** marca el documento como borrador aunque el juego sea emisible */
    markDraft?: boolean
    /** incluye la hoja de trabajo completa en páginas apaisadas */
    includeWorksheet?: boolean
    /** incluye el detalle de eliminaciones con su fundamento */
    includeEliminations?: boolean
    /** incluye las notas consolidadas */
    includeNotes?: boolean
}

export async function exportConsolidatedPdf(
    statements: ConsolidatedStatements,
    worksheet: ConsolidationWorksheet,
    options: ConsolidatedPdfOptions = {}
): Promise<void> {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const isDraft = !statements.canPublish || options.markDraft

    // ── Identificación del grupo ──
    let y = 54
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(15, 23, 42)
    doc.text(statements.groupName, pageW / 2, y, { align: 'center' })
    y += 17
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59)
    doc.text('Estados contables consolidados', pageW / 2, y, { align: 'center' })
    y += 16
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105)
    doc.text(`Controladora: ${statements.parentCompanyName}`, pageW / 2, y, { align: 'center' })
    y += 13
    doc.text(`Período ${statements.periodStart} al ${statements.periodEnd} — cierre ${statements.reportingDate}`, pageW / 2, y, { align: 'center' })
    y += 13
    doc.text(`Cifras en ${statements.currency} · Unidad de medida: ${statements.measurementUnit}`, pageW / 2, y, { align: 'center' })
    y += 13
    const entityList = statements.entities
        .map(e => `${e.name}${e.role === 'PARENT' ? ' (controladora)' : ` (${(e.ownership * 100).toFixed(2)} %)`}`)
        .join(' · ')
    doc.setFontSize(8)
    doc.text(`Entidades consolidadas: ${entityList}`, pageW / 2, y, { align: 'center', maxWidth: pageW - 80 })
    y += 12
    doc.setTextColor(120)
    doc.text(NORMATIVE_BASELINE, pageW / 2, y, { align: 'center' })
    y += 10
    doc.setDrawColor(203, 213, 225)
    doc.line(40, y, pageW - 40, y)
    y += 16

    const head = [['Concepto', 'Consolidado']]
    const bs = statements.balanceSheet
    const is = statements.incomeStatement

    const sections: { title: string; rows: Row[] }[] = [
        {
            title: 'Estado de Situación Patrimonial Consolidado',
            rows: [
                ...flatten([bs.currentAssets, bs.nonCurrentAssets]),
                [bs.totalAssets.label, fmt(bs.totalAssets.amount)],
                ['', ''],
                ...flatten([bs.currentLiabilities, bs.nonCurrentLiabilities]),
                [bs.totalLiabilities.label, fmt(bs.totalLiabilities.amount)],
                ['', ''],
                ...flatten([bs.equityOwners]),
                [bs.nonControllingInterest.label, fmt(bs.nonControllingInterest.amount)],
                [bs.totalEquity.label, fmt(bs.totalEquity.amount)],
                [bs.totalLiabilitiesAndEquity.label, fmt(bs.totalLiabilitiesAndEquity.amount)],
            ],
        },
        {
            title: 'Estado de Resultados Consolidado',
            rows: [
                ...flatten([
                    is.sales, is.costOfSales, is.grossProfit, is.adminExpenses, is.sellingExpenses,
                    is.operatingResult, is.financialIncome, is.financialExpenses, is.otherResults,
                    is.preTaxResult, is.incomeTax, is.netIncome,
                ]),
                ['', ''],
                [is.attributableToOwners.label, fmt(is.attributableToOwners.amount)],
                [is.attributableToNci.label, fmt(is.attributableToNci.amount)],
            ],
        },
    ]

    if (statements.cashFlow && statements.cashFlow.blockers.length === 0) {
        const cf = statements.cashFlow
        sections.push({
            title: 'Estado de Flujo de Efectivo Consolidado',
            rows: [
                ['Efectivo al inicio del ejercicio', fmt(cf.openingCash)],
                ...cf.lines.map(l => [l.label, fmt(l.consolidated)] as Row),
                ['Variación neta del efectivo', fmt(cf.netChange)],
                ['Efectivo al cierre del ejercicio', fmt(cf.closingCash)],
            ],
        })
    }

    for (const section of sections) {
        if (y > pageH - 150) { doc.addPage(); y = 54 }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text(section.title, 40, y)
        y += 8
        autoTable(doc, {
            startY: y + 6,
            head,
            body: section.rows,
            styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59] },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 1: { halign: 'right' } },
            margin: { left: 40, right: 40, bottom: 56 },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22
    }

    // ── EEPN consolidado (apaisado) ──
    doc.addPage('a4', 'landscape')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
    doc.text('Estado de Evolución del Patrimonio Neto Consolidado', 40, 50)
    autoTable(doc, {
        startY: 62,
        head: [['Concepto', ...statements.equityStatement.columns.map(c => c.label)]],
        body: statements.equityStatement.rows.map(r => [
            r.label,
            ...statements.equityStatement.columns.map(c =>
                r.insufficient ? 'Información insuficiente' : fmt(r.cells[c.id] ?? 0)),
        ]),
        styles: { fontSize: 7.5, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        columnStyles: Object.fromEntries(
            statements.equityStatement.columns.map((_, i) => [i + 1, { halign: 'right' as const }])
        ),
        margin: { left: 40, right: 40, bottom: 56 },
    })
    const ly = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(100)
    doc.text(statements.equityStatement.note, 40, ly, { maxWidth: doc.internal.pageSize.getWidth() - 80 })

    // ── Hoja de trabajo (apaisada) ──
    if (options.includeWorksheet !== false) {
        doc.addPage('a4', 'landscape')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Papel de trabajo de consolidación', 40, 50)
        autoTable(doc, {
            startY: 62,
            head: [[
                'Rubro',
                ...worksheet.entities.map(e => e.name),
                'Suma previa', 'Inv. / PN', 'Recíprocos', 'Op. internas', 'Result. no trasc.', 'Consolidado',
            ]],
            body: worksheet.rows.map(r => [
                r.label,
                ...worksheet.entities.map(e => {
                    const entry = r.byEntity.find(b => b.companyId === e.companyId)
                    return fmt((entry?.amount ?? 0) * r.naturalSign)
                }),
                fmt(r.subtotal * r.naturalSign),
                fmt((r.investmentElimination + r.nonControllingInterest) * r.naturalSign),
                fmt(r.reciprocalElimination * r.naturalSign),
                fmt(r.operationElimination * r.naturalSign),
                fmt(r.unrealizedElimination * r.naturalSign),
                fmt(r.consolidated * r.naturalSign),
            ]),
            styles: { fontSize: 7, cellPadding: 2.5 },
            headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: { 0: { cellWidth: 150 } },
            margin: { left: 30, right: 30, bottom: 56 },
        })
    }

    // ── Eliminaciones con su fundamento ──
    if (options.includeEliminations !== false) {
        doc.addPage('a4', 'landscape')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
        doc.text('Eliminaciones de consolidación', 40, 50)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100)
        doc.text(
            'Estos ajustes son extracontables: no se registran en los libros de la controladora ni de las controladas.',
            40, 64
        )
        autoTable(doc, {
            startY: 74,
            head: [['Concepto', 'Origen', 'Debe', 'Haber', 'Fundamento']],
            body: worksheet.eliminations.flatMap(e =>
                e.lines.map((l, i) => [
                    i === 0 ? e.label : '',
                    i === 0 ? (e.origin === 'AUTOMATIC' ? 'Automática' : e.origin === 'SUGGESTED' ? 'Sugerida' : 'Manual') : '',
                    l.debit > 0 ? fmt(l.debit) : '',
                    l.credit > 0 ? fmt(l.credit) : '',
                    i === 0 ? e.rationale : '',
                ])
            ),
            styles: { fontSize: 7, cellPadding: 2.5, valign: 'top' },
            headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 130 }, 1: { cellWidth: 55 },
                2: { halign: 'right', cellWidth: 60 }, 3: { halign: 'right', cellWidth: 60 },
                4: { cellWidth: 420 },
            },
            margin: { left: 30, right: 30, bottom: 56 },
        })
    }

    // ── Notas ──
    if (options.includeNotes !== false) {
        doc.addPage()
        let ny = 54
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(15, 23, 42)
        doc.text('Notas a los estados contables consolidados', 40, ny)
        ny += 22
        for (const note of statements.notes) {
            if (ny > pageH - 120) { doc.addPage(); ny = 54 }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 23, 42)
            doc.text(note.title, 40, ny)
            ny += 14
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(51, 65, 85)
            for (const p of note.paragraphs) {
                const lines = doc.splitTextToSize(p, pageW - 80) as string[]
                if (ny + lines.length * 11 > pageH - 70) { doc.addPage(); ny = 54 }
                doc.text(lines, 40, ny)
                ny += lines.length * 11 + 5
            }
            if (note.table) {
                autoTable(doc, {
                    startY: ny,
                    head: [note.table.headers],
                    body: note.table.rows,
                    styles: { fontSize: 7.5, cellPadding: 2.5 },
                    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
                    margin: { left: 40, right: 40, bottom: 56 },
                })
                ny = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
            }
            if (note.requiresNarrative) {
                doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(180, 96, 0)
                doc.text('Esta nota requiere que el emisor complete la narrativa profesional.', 40, ny)
                ny += 16
            }
            ny += 6
        }
    }

    // ── Pie en todas las páginas ──
    const provenance =
        `ContaLivre ${APP_VERSION} · Motor contable ${ACCOUNTING_ENGINE_VERSION} · esquema v${CURRENT_SCHEMA_VERSION} · ` +
        (isDraft ? 'BORRADOR' : 'VALIDADO')
    const total = doc.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
        doc.setPage(i)
        const w = doc.internal.pageSize.getWidth()
        const h = doc.internal.pageSize.getHeight()
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184)
        doc.text(provenance, 40, h - 28)
        doc.text(`Página ${i} de ${total}`, w - 40, h - 28, { align: 'right' })
        doc.text(
            'Las notas que se acompañan forman parte integrante de estos estados contables consolidados.',
            w / 2, h - 40, { align: 'center' }
        )
        if (isDraft) {
            doc.setFontSize(48); doc.setTextColor(226, 232, 240)
            doc.text('BORRADOR', w / 2, h / 2, { align: 'center', angle: 30 })
        }
    }

    const slug = statements.groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    doc.save(`estados-consolidados-${slug}-${statements.reportingDate}.pdf`)
}
