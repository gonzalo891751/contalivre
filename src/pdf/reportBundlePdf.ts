/**
 * PDF de estados desde el ReportingBundle — Fase 2C (§6.2).
 *
 * No recalcula: renderiza el mismo bundle que la pantalla. Incluye encabezado
 * con empresa/CUIT/ejercicio/moneda/normativa/versión y, si el reporte no es
 * publicable, marca de agua "BORRADOR — NO VALIDADO" + lista de bloqueantes.
 * jsPDF y autotable se cargan bajo demanda.
 */

import type { ReportingBundle } from '../reporting/loadReportingBundle'
import type { ReportLine } from '../reporting/domain/types'
import type { EstadosTab } from '../components/Estados/EstadosHeader'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type Row = [string, string, string] | [string, string]

function flatten(lines: ReportLine[], showComp: boolean): Row[] {
    const out: Row[] = []
    const walk = (l: ReportLine, depth: number) => {
        const label = '  '.repeat(depth) + l.label
        out.push(showComp
            ? [label, fmt(l.amount), l.comparativeAmount == null ? '—' : fmt(l.comparativeAmount)]
            : [label, fmt(l.amount)])
        for (const c of l.children ?? []) walk(c, depth + 1)
    }
    for (const l of lines) walk(l, 0)
    return out
}

function tabLines(bundle: ReportingBundle, tab: EstadosTab): { title: string; lines: ReportLine[] } {
    const s = bundle.statements
    switch (tab) {
        case 'ER': return { title: 'Estado de Resultados', lines: [s.incomeStatement.sales, s.incomeStatement.costOfSales, s.incomeStatement.grossProfit, s.incomeStatement.adminExpenses, s.incomeStatement.sellingExpenses, s.incomeStatement.operatingResult, s.incomeStatement.financialResults, s.incomeStatement.otherResults, s.incomeStatement.netIncome] }
        case 'EPN': return { title: 'Evolución del Patrimonio Neto', lines: [s.equityStatement.openingBalance, s.equityStatement.contributions, s.equityStatement.distributions, s.equityStatement.reservesMovements, s.equityStatement.otherMovements, s.equityStatement.periodResult, s.equityStatement.closingBalance] }
        case 'EFE': {
            const d = s.cashFlowDirect
            return { title: 'Estado de Flujo de Efectivo (directo)', lines: d ? [d.openingCash, d.operating, d.investing, d.financing, d.unclassified, d.netChange, d.closingCash] : [] }
        }
        case 'ESP':
        default: return { title: 'Estado de Situación Patrimonial', lines: [s.balanceSheet.currentAssets, s.balanceSheet.nonCurrentAssets, s.balanceSheet.totalAssets, s.balanceSheet.currentLiabilities, s.balanceSheet.nonCurrentLiabilities, s.balanceSheet.totalLiabilities, s.balanceSheet.equity, s.balanceSheet.totalLiabilitiesAndEquity] }
    }
}

export async function exportReportBundlePdf(bundle: ReportingBundle, tab: EstadosTab): Promise<void> {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const m = bundle.metadata
    const showComp = m.hasComparative
    const { title, lines } = tabLines(bundle, tab)
    const publishable = bundle.statements.validation.canPublish

    // Encabezado
    doc.setFontSize(15); doc.setFont('helvetica', 'bold')
    doc.text(m.companyLegalName, 40, 48)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    const sub = [
        m.companyTaxId ? `CUIT ${m.companyTaxId}` : null,
        m.exerciseLabel,
        `corte ${m.periodEnd}`,
        m.currency,
        m.normative,
    ].filter(Boolean).join('  ·  ')
    doc.text(sub, 40, 64)
    doc.setFontSize(13); doc.setFont('helvetica', 'bold')
    doc.text(title, 40, 90)

    const head = showComp ? [['Concepto', 'Ejercicio actual', 'Ejercicio anterior']] : [['Concepto', 'Ejercicio actual']]
    autoTable(doc, {
        startY: 104,
        head,
        body: flatten(lines, showComp),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: showComp
            ? { 1: { halign: 'right' }, 2: { halign: 'right' } }
            : { 1: { halign: 'right' } },
    })

    // Pie con validación / metadatos
    const afterY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
    doc.text(`Motor ${m.engineVersion} · schema v${m.schemaVersion} · reporte ${m.reportVersion} · commit ${m.commit} · ${m.status}`, 40, afterY)

    if (!publishable) {
        const blockers = bundle.statements.validation.checks.filter(c => !c.passed).map(c => `• ${c.label}`)
        doc.setTextColor(185, 28, 28)
        doc.text('Reporte de revisión — bloqueantes:', 40, afterY + 16)
        doc.text(blockers.slice(0, 8), 40, afterY + 30)
        // Marca de agua
        doc.setFontSize(60); doc.setTextColor(239, 68, 68)
        doc.saveGraphicsState()
        doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.12 }))
        doc.text('BORRADOR — NO VALIDADO', 300, 420, { align: 'center', angle: 35 })
        doc.restoreGraphicsState()
    }

    const dateStr = new Date().toISOString().slice(0, 10)
    const suffix = publishable ? '' : '_BORRADOR'
    doc.save(`contalivre-${tab}-${m.exerciseLabel.replace(/\s+/g, '_')}-${dateStr}${suffix}.pdf`)
}
