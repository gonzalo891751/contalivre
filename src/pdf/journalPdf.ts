import { JournalEntry, Account } from '../core/models'
import { resolveAccountDisplay } from '../core/displayAccount'

interface PdfMeta {
    entityName?: string
    cuit?: string
    address?: string
    ivaCondition?: string
    periodStart?: string
    periodEnd?: string
    currency?: string
    generatedBy?: string
}

// Format numbers like "1.234,56"
const formatNumber = (n: number) => {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
}

export const downloadJournalPdf = async (
    entries: JournalEntry[],
    accounts: Account[],
    meta: PdfMeta
) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
    ])

    const doc = new jsPDF()

    const today = new Date().toLocaleDateString('es-AR')

    const renderHeader = () => {
        const pageWidth = doc.internal.pageSize.width
        const margin = 14

        // Top Header Block
        doc.setFillColor(248, 250, 252) // lighter gray
        doc.setDrawColor(226, 232, 240) // border color
        doc.rect(margin, 10, pageWidth - (margin * 2), 35, 'FD')

        // Title
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.setTextColor(30, 41, 59)
        doc.text('LIBRO DIARIO', margin + 5, 20)

        // Subtitle
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(100, 116, 139)
        doc.text('Asientos registrados', margin + 5, 26)

        // Date right aligned
        doc.setFontSize(8)
        doc.text(`Emitido: ${today}`, pageWidth - margin - 5, 20, { align: 'right' })

        // Divider
        doc.setDrawColor(203, 213, 225)
        doc.line(margin + 5, 29, pageWidth - margin - 5, 29)

        // Info Grid
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(51, 65, 85)

        const leftColX = margin + 5
        const rightColX = pageWidth / 2 + 10
        const topY = 35
        const lineHeight = 5

        // Left Col
        doc.setFont('helvetica', 'bold'); doc.text('Ente:', leftColX, topY)
        doc.setFont('helvetica', 'normal'); doc.text(meta.entityName || '______________________', leftColX + 15, topY)

        doc.setFont('helvetica', 'bold'); doc.text('Domicilio:', leftColX, topY + lineHeight)
        doc.setFont('helvetica', 'normal'); doc.text(meta.address || '______________________', leftColX + 18, topY + lineHeight)

        doc.setFont('helvetica', 'bold'); doc.text('IVA:', leftColX, topY + lineHeight * 2)
        doc.setFont('helvetica', 'normal'); doc.text(meta.ivaCondition || 'Resp. Inscripto', leftColX + 15, topY + lineHeight * 2)

        // Right Col
        doc.setFont('helvetica', 'bold'); doc.text('CUIT:', rightColX, topY)
        doc.setFont('helvetica', 'normal'); doc.text(meta.cuit || '______________________', rightColX + 12, topY)

        doc.setFont('helvetica', 'bold'); doc.text('Período:', rightColX, topY + lineHeight)
        doc.setFont('helvetica', 'normal'); doc.text(meta.periodStart && meta.periodEnd
            ? `Del ${formatDate(meta.periodStart)} al ${formatDate(meta.periodEnd)}`
            : 'Del __/__/____ al __/__/____',
            rightColX + 15, topY + lineHeight)

        doc.setFont('helvetica', 'bold'); doc.text('Moneda:', rightColX, topY + lineHeight * 2)
        doc.setFont('helvetica', 'normal'); doc.text(meta.currency || 'Pesos Argentinos (ARS)', rightColX + 15, topY + lineHeight * 2)
    }

    const renderFooter = () => {
        const pageCount = doc.getNumberOfPages()
        const str = 'Página ' + pageCount

        doc.setFontSize(8)
        doc.setTextColor(150)

        const pageSize = doc.internal.pageSize
        const pageHeight = pageSize.height
        const pageWidth = pageSize.width

        doc.text(str, pageWidth - 20, pageHeight - 10, { align: 'right' })

        // Optional branding
        if (meta.generatedBy) {
            doc.text(meta.generatedBy, 14, pageHeight - 10)
        }
    }

    // Prepare content
    let startY = 50 // Start after header

    // If no entries
    if (entries.length === 0) {
        renderHeader()
        doc.setFontSize(12)
        doc.setTextColor(100)
        doc.text('No hay asientos para mostrar en este período.', 14, 60)
        renderFooter()
        doc.save(`libro_diario_${meta.entityName || 'export'}.pdf`)
        return
    }

    // Render tables for each entry
    // Strategy: We can't put everything in ONE big table because we need headers for each entry.
    // So we loop and call autoTable for each entry.

    // We register a hook to draw header on new pages
    // But autoTable's didDrawPage only triggers when IT creates a page.
    // If we manually addPage, we need to draw header manually.

    // Initial header
    renderHeader()

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const entryNum = entries.length - i // Assuming reverse order in UI, but passed as is?
        // In AsientosDesktop, entries are sorted reverse time (newest first).
        // Usually Journal is printed Chronologically (Oldest first).
        // The user asked for "Asiento N XX".
        // Let's assume the array passed is what the user sees.
        // We will respect the order passed.

        // Calculate if we need a page break before starting this entry
        // Crude estimation: Header (10) + Lines * 7 + Footer space
        // Better: let autoTable handle breaks, but we want the Entry Header to stick with the table.
        // If Y is too low, add page.

        const pageHeight = doc.internal.pageSize.height
        const estimatedHeight = 15 + (entry.lines.length + 1) * 7 // Header + rows + total row

        if (startY + estimatedHeight > pageHeight - 15) {
            doc.addPage()
            renderHeader()
            startY = 50
        }

        // Draw Entry Header
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(0)

        // Background for entry header
        doc.setFillColor(240, 240, 240)
        doc.rect(14, startY, doc.internal.pageSize.width - 28, 8, 'F')

        // Entry Text
        const entryDate = formatDate(entry.date)
        const entryTitle = `Asiento N° ${entryNum}  |  ${entryDate}  |  ${entry.memo || ''}`

        doc.text(entryTitle, 16, startY + 5.5)

        // Prepare Table Body
        // Use 'any' type to bypass strict autoTable RowInput check for objects
        const tableBody: any[] = entry.lines.map(line => {
            const display = resolveAccountDisplay(line.accountId, accounts)
            const primaryName = display.name
            const detail = display.terceroDetail
                ? display.terceroDetail
                : line.description || null
            return [
                detail ? `${primaryName}\n   → ${detail}` : primaryName,
                line.debit > 0 ? formatNumber(line.debit) : '',
                line.credit > 0 ? formatNumber(line.credit) : ''
            ]
        })

        // Add Totals
        const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit, 0)
        const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit, 0)

        tableBody.push([
            { content: 'Totales', styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatNumber(totalDebit), styles: { fontStyle: 'bold' } },
            { content: formatNumber(totalCredit), styles: { fontStyle: 'bold' } }
        ])

        autoTable(doc, {
            startY: startY + 8,
            head: [['Cuenta', 'Debe', 'Haber']],
            body: tableBody,
            theme: 'plain',
            styles: {
                fontSize: 9,
                cellPadding: 3,
                lineColor: [220, 220, 220],
                lineWidth: 0.1,
            },
            headStyles: {
                fillColor: [255, 255, 255],
                textColor: [100, 100, 100],
                fontStyle: 'bold',
                lineWidth: 0,
                // borderBottomWidth replaced by lineWidth adjustment or just accepting default
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 35, halign: 'right' },
                2: { cellWidth: 35, halign: 'right' }
            },
            margin: { top: 50, bottom: 20 },
            showHead: 'firstPage', // For this table instance
            pageBreak: 'auto',
            didDrawPage: () => {
                // This is called when autoTable splits a table across pages
                // We need to re-render header/footer
                renderHeader()
                renderFooter()
            },
        })

        // Update startY for next loop
        startY = (doc as any).lastAutoTable.finalY + 10
    }

    // Add page numbers to all pages
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150)
        const text = `Página ${i} de ${pageCount}`
        const pageWidth = doc.internal.pageSize.width
        const pageHeight = doc.internal.pageSize.height
        doc.text(text, pageWidth - 20, pageHeight - 10, { align: 'right' })

        if (meta.generatedBy) {
            doc.setFontSize(8)
            doc.setTextColor(150)
            doc.text(meta.generatedBy, 14, pageHeight - 10)
        }
    }

    doc.save(`libro_diario_${new Date().toISOString().split('T')[0]}.pdf`)
}
