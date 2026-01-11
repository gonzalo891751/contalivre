import { useState, useMemo } from 'react'
import { useLedger } from '../../../hooks/useLedger'
import type { Account } from '../../../core/models'
import ImportModal from './ImportModal'
import AccountSearchSelect from '../../../ui/AccountSearchSelect'
import BrandSwitch from '../../../ui/BrandSwitch'
import BankReconciliationCard from './BankReconciliationCard'

// Helper to determine if an account is likely cash/bank
const isCashOrBank = (account: Account) => {
    const name = account.name.toLowerCase()
    return name.includes('banco') ||
        name.includes('caja') ||
        name.includes('efectivo') ||
        name.includes('cta cte') ||
        name.includes('valores') ||
        name.includes('recaudacion')
}

// Helper to extract reference from concept
const extractRef = (concept: string): string | null => {
    if (!concept) return null
    // Matches patterns like DEP-301, CH-101, TR-812, INT-09, DA-044
    // Should be case insensitive and ignore "REF " prefix if present
    const match = concept.match(/([A-Z]{2,5})-(\d{1,5})/i)
    if (match) {
        return match[0].toUpperCase()
    }
    return null
}

// CONSTANTS
const GRID_TEMPLATE = "120px minmax(0, 1fr) 130px 130px 48px"

export default function ConciliacionesPage() {
    const { accounts, ledger } = useLedger()

    const [tipo] = useState<'bancaria' | 'arqueo'>('bancaria')
    const [cuentaId, setCuentaId] = useState('') // Selected Account ID
    const [showAllAccounts, setShowAllAccounts] = useState(false)
    const [desde, setDesde] = useState('2026-01-01')
    const [hasta, setHasta] = useState('2026-01-31')
    const [searchText, setSearchText] = useState('')

    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [importSuccessMsg, setImportSuccessMsg] = useState('')

    // State for difference widget expansion
    const [isDiffExpanded, setIsDiffExpanded] = useState(false)

    // --- New Features: Logic ---
    const [showRefs, setShowRefs] = useState(false)
    const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
    const [isExternalEditing, setIsExternalEditing] = useState(false)
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

    // --- PDF Handler (Vector) ---
    const handleDownloadPDF = async () => {
        setIsGeneratingPdf(true)
        try {
            const jsPDF = (await import('jspdf')).default
            const autoTable = (await import('jspdf-autotable')).default

            // 1. Setup Document
            const doc = new jsPDF()
            const pageWidth = doc.internal.pageSize.width
            const margin = 14
            let finalY = margin

            // --- HEADER ---
            doc.setFontSize(8)
            doc.setTextColor(100)

            // Company Info (Placeholders)
            const company = {
                name: "EMPRESA DEMO S.A.", // Placeholder/Future Config
                address: "Av. Corrientes 1234, CABA",
                cuit: "30-12345678-9",
                iva: "Responsable Inscripto"
            }

            doc.text(`${company.name}`, margin, finalY)
            doc.text(`${company.address}`, margin, finalY + 4)
            doc.text(`IVA: ${company.iva}`, margin, finalY + 8)

            // Right Side Header
            const dateStr = new Date().toLocaleDateString('es-AR')
            const accName = accountOptions.find(a => a.id === cuentaId)?.name || 'Cuenta'

            doc.text(`Emitido: ${dateStr}`, pageWidth - margin, finalY, { align: 'right' })
            doc.text(`CUIT: ${company.cuit}`, pageWidth - margin, finalY + 4, { align: 'right' })
            doc.text(`Moneda: Pesos Argentinos`, pageWidth - margin, finalY + 8, { align: 'right' })

            finalY += 16

            // Title
            doc.setFontSize(14)
            doc.setTextColor(0)
            doc.setFont('helvetica', 'bold')
            doc.text("CONCILIACIÓN BANCARIA", pageWidth / 2, finalY, { align: 'center' })

            finalY += 6
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text(`Cuenta: ${accName}`, pageWidth / 2, finalY, { align: 'center' })
            finalY += 5
            doc.setFontSize(9)
            doc.text(`Período: ${formatDateAR(desde)} al ${formatDateAR(hasta)}`, pageWidth / 2, finalY, { align: 'center' })

            finalY += 10

            // Helper for currency
            const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

            // --- TABLE 1: LIBROS (MAYOR) ---
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            doc.text("1. Libros (Mayor)", margin, finalY)
            finalY += 2

            const librosData = filteredLibros.map(r => [
                formatDateAR(r.fecha),
                r.concepto,
                r.debe > 0 ? fmt(r.debe) : '',
                r.haber > 0 ? fmt(r.haber) : ''
            ])

            // Add Totals Row
            librosData.push([
                'TOTALES',
                '',
                fmt(filteredLibros.reduce((s, r) => s + r.debe, 0)),
                fmt(filteredLibros.reduce((s, r) => s + r.haber, 0))
            ])

            autoTable(doc, {
                startY: finalY,
                head: [['Fecha', 'Concepto', 'Debe', 'Haber']],
                body: librosData,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 'auto' }, // Concepto takes available space
                    2: { cellWidth: 28, halign: 'right' },
                    3: { cellWidth: 28, halign: 'right' },
                },
                margin: { left: margin, right: margin }
            })

            // @ts-ignore
            finalY = doc.lastAutoTable.finalY + 8

            // --- TABLE 2: EXTERNO (EXTRACTO) ---
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            doc.text("2. Externo (Extracto Bancario)", margin, finalY)
            finalY += 2

            const externoData = filteredExterno.map(r => [
                formatDateAR(r.fecha),
                r.concepto,
                r.debe > 0 ? fmt(r.debe) : '',
                r.haber > 0 ? fmt(r.haber) : ''
            ])
            // Add Totals Row
            externoData.push([
                'TOTALES',
                '',
                fmt(filteredExterno.reduce((s, r) => s + r.debe, 0)),
                fmt(filteredExterno.reduce((s, r) => s + r.haber, 0))
            ])

            autoTable(doc, {
                startY: finalY,
                head: [['Fecha', 'Concepto', 'Debe', 'Haber']],
                body: externoData,
                theme: 'striped',
                headStyles: { fillColor: [71, 85, 105], fontSize: 8 },
                bodyStyles: { fontSize: 8 },
                columnStyles: {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 'auto' },
                    2: { cellWidth: 28, halign: 'right' },
                    3: { cellWidth: 28, halign: 'right' },
                },
                margin: { left: margin, right: margin }
            })

            // @ts-ignore
            finalY = doc.lastAutoTable.finalY + 10

            // Check if we need a new page for summary
            if (finalY > 200) {
                doc.addPage()
                finalY = 20
            }

            // --- SUMMARY BLOCK ---
            doc.setFillColor(241, 245, 249)
            doc.rect(margin, finalY, pageWidth - (margin * 2), 70, 'F')
            doc.setDrawColor(203, 213, 225)
            doc.rect(margin, finalY, pageWidth - (margin * 2), 70, 'S')

            const leftX = margin + 5
            const rightX = pageWidth / 2 + 5
            let currentY = finalY + 8

            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            doc.text("RESUMEN DE CONCILIACIÓN", margin + 5, currentY)
            currentY += 8

            // Setup columns
            // const colWidth = (pageWidth - (margin * 2)) / 2 - 10
            const rowH = 6
            const valX1 = pageWidth / 2 - 10
            const valX2 = pageWidth - margin - 10

            doc.setFontSize(9)

            // Function to draw row
            const drawRow = (label: string, val: number, x: number, valX: number, isTotal = false, color: [number, number, number] = [0, 0, 0]) => {
                doc.setTextColor(...color)
                if (isTotal) doc.setFont('helvetica', 'bold')
                else doc.setFont('helvetica', 'normal')

                doc.text(label, x, currentY)
                doc.text(fmt(Math.abs(val)), valX, currentY, { align: 'right' })
            }

            // --- Left Column (Bank Side) ---
            const startYCols = currentY

            drawRow("Saldo según extracto", totalsExterno.saldo, leftX, valX1)
            currentY += rowH
            drawRow("+ Depósitos en tránsito", depositsInTransit.reduce((a, r) => a + r.debe, 0), leftX, valX1, false, [21, 128, 61])
            currentY += rowH
            drawRow("- Pagos pendientes", outstandingPayments.reduce((a, r) => a + r.haber, 0), leftX, valX1, false, [220, 38, 38])
            currentY += rowH + 2

            doc.setDrawColor(200)
            doc.line(leftX, currentY - 4, valX1, currentY - 4)
            drawRow("Saldo Conciliado", reconciledBankBalance, leftX, valX1, true)

            // --- Right Column (Book Side) ---
            currentY = startYCols // Reset Y

            drawRow("Saldo según libros", totalsLibros.saldo, rightX, valX2)
            currentY += rowH
            drawRow("+ Créditos bancarios (no reg.)", bankCredits.reduce((a, r) => a + r.haber, 0), rightX, valX2, false, [21, 128, 61])
            currentY += rowH
            drawRow("- Débitos bancarios (no reg.)", bankDebits.reduce((a, r) => a + r.debe, 0), rightX, valX2, false, [220, 38, 38])
            currentY += rowH + 2

            doc.setDrawColor(200)
            doc.line(rightX, currentY - 4, valX2, currentY - 4)
            drawRow("Saldo Libros Ajustado", adjustedBookBalance, rightX, valX2, true)

            // --- Footer Status ---
            currentY += 12
            doc.setFontSize(10)
            if (isReconBalanced) {
                doc.setTextColor(21, 128, 61)
                doc.setFont('helvetica', 'bold')
                doc.text("✓ CONCILIACIÓN OK", pageWidth / 2, currentY, { align: 'center' })
            } else {
                doc.setTextColor(180, 83, 9)
                doc.setFont('helvetica', 'bold')
                doc.text(`⚠ REVISAR DIFERENCIAS (Residual: ${fmt(Math.abs(reconDiff))})`, pageWidth / 2, currentY, { align: 'center' })
            }

            // Page Numbers Footer
            const pageCount = doc.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)
                doc.setFontSize(8)
                doc.setTextColor(150)
                doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, doc.internal.pageSize.height - 10, { align: 'right' })
                doc.text(`Generado por ContaLivre`, margin, doc.internal.pageSize.height - 10)
            }

            doc.save(`Conciliacion_${cuentaId}_${desde}_${hasta}.pdf`)

        } catch (error) {
            console.error('Error generating PDF:', error)
            alert('Error al generar el PDF. Revise la consola.')
        } finally {
            setIsGeneratingPdf(false)
        }
    }

    const handleRowClick = (key: string) => {
        const newSet = new Set(selectedRowKeys)
        if (newSet.has(key)) {
            newSet.delete(key)
        } else {
            newSet.add(key)
        }
        setSelectedRowKeys(newSet)
    }

    // --- Account Selector Logic ---
    const accountOptions = useMemo(() => {
        if (!accounts) return []
        const relevant = accounts.filter(a => isCashOrBank(a))

        let list = showAllAccounts ? accounts : relevant
        if (cuentaId && !list.find(a => a.id === cuentaId)) {
            const current = accounts.find(a => a.id === cuentaId)
            if (current) list = [...list, current].sort((a, b) => a.name.localeCompare(b.name))
        }
        return list
    }, [accounts, showAllAccounts, cuentaId])

    useMemo(() => {
        if (!cuentaId && accountOptions.length > 0) {
            setCuentaId(accountOptions[0].id)
        }
    }, [accountOptions, cuentaId])

    // --- Real Data: Libros ---
    const librosRows = useMemo(() => {
        if (!ledger || !cuentaId) return []
        const acc = ledger.get(cuentaId)
        if (!acc) return []

        return acc.movements.filter(m => {
            const d = m.date.substring(0, 10)
            return d >= desde && d <= hasta
        }).map((m, idx) => ({
            id: m.entryId + '_' + idx,
            fecha: m.date,
            concepto: m.memo || m.description || 'Sin concepto',
            debe: m.debit,
            haber: m.credit
        }))
    }, [ledger, cuentaId, desde, hasta])

    // --- Mock Data: Externo ---
    const [externoRows, setExternoRows] = useState([
        { id: 101, fecha: '2026-01-02', concepto: 'DEP-001 Depósito efectivo', debe: 100000, haber: 0 },
        { id: 102, fecha: '2026-01-06', concepto: 'OP-023 Cheque 4522 pagado', debe: 0, haber: 25000 },
        { id: 103, fecha: '2026-01-08', concepto: 'REC-110 Transferencia A. Pérez', debe: 15500, haber: 0 },
    ])

    const handleImportData = (rows: any[], mode: 'replace' | 'append') => {
        const newRows = rows.map((r, i) => ({
            id: Date.now() + i,
            fecha: r.fecha,
            concepto: r.concepto,
            debe: r.debe,
            haber: r.haber
        }))

        if (mode === 'replace') {
            setExternoRows(newRows)
            setImportSuccessMsg(`Se reemplazaron las filas con ${newRows.length} registros nuevos.`)
        } else {
            setExternoRows(prev => [...prev, ...newRows])
            setImportSuccessMsg(`Se agregaron ${newRows.length} registros nuevos.`)
        }
        setIsImportModalOpen(false)
        setTimeout(() => setImportSuccessMsg(''), 4000)
    }

    // --- Helpers ---
    const formatMoney = (val: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val)
    }

    const formatShortMoney = (val: number) => {
        return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)
    }

    const formatDateAR = (isoDate: string) => {
        if (!isoDate) return ''
        const [y, m, d] = isoDate.substring(0, 10).split('-')
        return `${d}/${m}/${y}`
    }

    const handleAddRow = () => {
        const newRow = {
            id: Date.now(),
            fecha: desde,
            concepto: '',
            debe: 0,
            haber: 0
        }
        setExternoRows([...externoRows, newRow])
    }

    const handleDeleteRow = (id: number) => {
        setExternoRows(externoRows.filter(r => r.id !== id))
    }

    const handleExternoChange = (id: number, field: string, value: any) => {
        setExternoRows(externoRows.map(r => {
            if (r.id === id) {
                return { ...r, [field]: value }
            }
            return r
        }))
    }

    const [editingDateId, setEditingDateId] = useState<string | number | null>(null)

    // --- Filtering & Totals ---
    const matchFilter = (row: any) => {
        if (!searchText) return true
        const s = searchText.toLowerCase()
        const txtMatch = row.concepto.toLowerCase().includes(s)
        const numMatch = row.debe.toString().includes(s) || row.haber.toString().includes(s)
        return txtMatch || numMatch
    }

    const filteredLibros = useMemo(() => librosRows.filter(matchFilter), [librosRows, searchText])
    const filteredExterno = useMemo(() => externoRows.filter(matchFilter), [externoRows, searchText])

    const calculateTotals = (rows: any[]) => {
        const tDebe = rows.reduce((acc, r) => acc + (Number(r.debe) || 0), 0)
        const tHaber = rows.reduce((acc, r) => acc + (Number(r.haber) || 0), 0)
        return { tDebe, tHaber, saldo: tDebe - tHaber }
    }

    const totalsLibros = useMemo(() => calculateTotals(filteredLibros), [filteredLibros])
    const totalsExterno = useMemo(() => {
        const { tDebe, tHaber } = calculateTotals(filteredExterno)
        // For External/Bank: Credit (Haber) increases balance, Debit (Debe) decreases it.
        // Formula: Haber - Debe
        return { tDebe, tHaber, saldo: tHaber - tDebe }
    }, [filteredExterno])

    // --- Reference Matching Logic ---
    const commonRefs = useMemo(() => {
        if (!showRefs) return new Set<string>()

        const refsLibros = new Set<string>()
        filteredLibros.forEach(r => {
            const ref = extractRef(r.concepto)
            if (ref) refsLibros.add(ref)
        })

        const refsExterno = new Set<string>()
        filteredExterno.forEach(r => {
            const ref = extractRef(r.concepto)
            if (ref) refsExterno.add(ref)
        })

        // Return intersection
        return new Set([...refsLibros].filter(x => refsExterno.has(x)))
    }, [showRefs, filteredLibros, filteredExterno])

    const getRowClass = (row: any, side: 'libros' | 'externo') => {
        // Construct stable key logic
        // For Libros, row.id is usually unique enough (entry_idx). 
        // For Externo, row.id is unique (timestamp).
        // BUT user asked for stable key if ID not enough. Here IDs seem fine.
        // Let's use `side:row.id` as unique key for selection.
        const key = `${side}:${row.id}`

        if (selectedRowKeys.has(key)) return 'grid-row row-selected'

        if (showRefs) {
            const ref = extractRef(row.concepto)
            if (ref && commonRefs.has(ref)) {
                return 'grid-row row-ref-match'
            }
        }
        return 'grid-row'
    }

    // --- Reconciliation Calculations (Lifted State) ---
    // Rule: Matched = In selectedRowKeys set (key format "libros:id" or "externo:id")

    // Filter unmatched rows
    const unmatchedLibros = useMemo(() => {
        return filteredLibros.filter(r => !selectedRowKeys.has(`libros:${r.id}`))
    }, [filteredLibros, selectedRowKeys])

    const unmatchedExterno = useMemo(() => {
        return filteredExterno.filter(r => !selectedRowKeys.has(`externo:${r.id}`))
    }, [filteredExterno, selectedRowKeys])

    // 1. Bank Side Adjustments (from Books unmatched)
    // "Depósitos en tránsito" = Unmatched Books DEBE (Inflows) => Adds to bank balance
    // "Pagos pendientes" = Unmatched Books HABER (Outflows) => Subtracts from bank balance
    const depositsInTransit = useMemo(() => unmatchedLibros.filter(r => r.debe > 0), [unmatchedLibros])
    const outstandingPayments = useMemo(() => unmatchedLibros.filter(r => r.haber > 0), [unmatchedLibros])

    const totalDepositsInTransit = depositsInTransit.reduce((acc, r) => acc + r.debe, 0)
    const totalOutstandingPayments = outstandingPayments.reduce((acc, r) => acc + r.haber, 0)

    // Saldo Conciliado (Bank Side) = SaldoExtracto (Haber-Debe) + Depósitos - Pagos
    const reconciledBankBalance = totalsExterno.saldo + totalDepositsInTransit - totalOutstandingPayments

    // 2. Book Side Adjustments (from External unmatched)
    // "Créditos bancarios no reg" (External Credit/Haber unmatched) => Increases Books Balance (Income/Inflow)
    // "Débitos bancarios no reg" (External Debit/Debe unmatched) => Decreases Books Balance (Expense/Outflow)
    const bankCredits = useMemo(() => unmatchedExterno.filter(r => r.haber > 0), [unmatchedExterno])
    const bankDebits = useMemo(() => unmatchedExterno.filter(r => r.debe > 0), [unmatchedExterno])

    const totalBankCredits = bankCredits.reduce((acc, r) => acc + r.haber, 0)
    const totalBankDebits = bankDebits.reduce((acc, r) => acc + r.debe, 0)

    // Saldo Libros Ajustado = SaldoLibros + Creditos - Debitos
    const adjustedBookBalance = totalsLibros.saldo + totalBankCredits - totalBankDebits

    // Difference and Balance Check
    const reconDiff = reconciledBankBalance - adjustedBookBalance
    const isReconBalanced = Math.abs(reconDiff) < 0.01

    // --- ABS Difference Logic (Magnitude for Top Widget) ---
    const absLibros = Math.abs(totalsLibros.saldo)
    const absExterno = Math.abs(totalsExterno.saldo)

    // Difference based on magnitude (volume), ignoring accounting sign
    // If External > Books => Falta (Missing in books)
    // If External < Books => Sobra (Excess in books)
    const difference = absExterno - absLibros
    const isBalanced = Math.abs(difference) <= 0.01

    return (
        <div className="conciliaciones-page fade-in">
            {/* Header Section */}
            <div className="conciliaciones-header">
                <div className="header-top">
                    <div>
                        <h1 className="page-title">Conciliaciones</h1>
                        <p className="page-subtitle">Compará tus libros con una fuente externa (extracto o conteo).</p>
                    </div>
                </div>

                {/* Simplified Controls Card */}
                <div className="card controls-card">
                    <div className="controls-flex-row">
                        {/* Control: Fechas */}
                        <div className="control-group">
                            <label className="control-label">PERÍODO</label>
                            <div className="date-inputs-wrapper">
                                <input
                                    type="date"
                                    className="premium-input"
                                    value={desde}
                                    onChange={e => setDesde(e.target.value)}
                                />
                                <span className="separator">→</span>
                                <input
                                    type="date"
                                    className="premium-input"
                                    value={hasta}
                                    onChange={e => setHasta(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Control: Search */}
                        <div className="control-group flex-grow">
                            <label className="control-label">BUSCAR</label>
                            <div className="search-row-flex">
                                <div className="search-wrapper">
                                    <input
                                        type="text"
                                        className="premium-input search-input"
                                        placeholder="Concepto, importe..."
                                        value={searchText}
                                        onChange={e => setSearchText(e.target.value)}
                                    />
                                    <div className="search-icon">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8"></circle>
                                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                        </svg>
                                    </div>
                                </div>
                                <button
                                    className={`btn-ref-toggle ${showRefs ? 'active' : ''}`}
                                    onClick={() => setShowRefs(!showRefs)}
                                    title="Resaltar referencias coincidentes"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                                    </svg>
                                    <span className="hidden-mobile">Resaltar refs</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Show success message if any */}
            {importSuccessMsg && (
                <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded mb-4 flex justify-between items-center animate-pulse-once">
                    <span>{importSuccessMsg}</span>
                    <button onClick={() => setImportSuccessMsg('')} className="text-green-600 font-bold">&times;</button>
                </div>
            )}

            {/* Tables Grid */}
            <div className="tables-grid">

                {/* Table 1: Libros (Read Only) */}
                <div className="table-card">
                    <div className="table-header header-row-aligned">
                        <div className="title-section">
                            <h3 className="panel-title">Libros <span className="text-muted font-normal text-sm ml-1">(Mayor)</span></h3>
                        </div>
                        <div className="header-controls-right">
                            <div className="account-select-compact">
                                <AccountSearchSelect
                                    accounts={accountOptions}
                                    value={cuentaId}
                                    onChange={setCuentaId}
                                    placeholder="Seleccioná cuenta..."
                                />
                                <div className="select-chevron-sm">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                                </div>
                            </div>
                            <BrandSwitch
                                label="Ver todas"
                                checked={showAllAccounts}
                                onCheckedChange={setShowAllAccounts}
                            />
                        </div>
                    </div>

                    {/* Grid Head */}
                    <div className="grid-header" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                        <div className="gh-cell">Fecha</div>
                        <div className="gh-cell">Concepto</div>
                        <div className="gh-cell text-right">Debe</div>
                        <div className="gh-cell text-right">Haber</div>
                        <div className="gh-cell"></div> {/* Empty action col for alignment */}
                    </div>

                    {/* Grid Body */}
                    <div className="table-container">
                        {filteredLibros.map(row => (
                            <div
                                key={row.id}
                                className={getRowClass(row, 'libros')}
                                style={{ gridTemplateColumns: GRID_TEMPLATE }}
                                onClick={() => handleRowClick(`libros:${row.id}`)}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleRowClick(`libros:${row.id}`)
                                    }
                                }}
                            >
                                <div className="gd-cell text-secondary">{formatDateAR(row.fecha)}</div>
                                <div className="gd-cell cell-concept" title={row.concepto}>{row.concepto}</div>
                                <div className="gd-cell text-right text-debit tabular-nums" title={formatMoney(row.debe)}>
                                    {row.debe > 0 ? formatShortMoney(row.debe) : '-'}
                                </div>
                                <div className="gd-cell text-right text-credit tabular-nums" title={formatMoney(row.haber)}>
                                    {row.haber > 0 ? formatShortMoney(row.haber) : '-'}
                                </div>
                                <div className="gd-cell"></div>
                            </div>
                        ))}
                        {filteredLibros.length === 0 && (
                            <div className="empty-state-container">
                                {cuentaId
                                    ? "No se encontraron movimientos."
                                    : "Seleccione una cuenta."}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="table-footer-custom">
                        {/* Totals Row */}
                        <div className="grid-footer-row totals-row" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                            <div className="gf-cell font-bold text-dark">Totales</div>
                            <div className="gf-cell"></div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsLibros.tDebe)}</div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsLibros.tHaber)}</div>
                            <div className="gf-cell"></div>
                        </div>

                        {/* Saldo Row */}
                        <div className="saldo-row">
                            <span className="saldo-label">SALDO</span>
                            <span className={`saldo-badge ${totalsLibros.saldo >= 0 ? 'badge-deudor' : 'badge-acreedor'}`}>
                                {totalsLibros.saldo >= 0 ? 'DEUDOR' : 'ACREEDOR'} {formatMoney(Math.abs(totalsLibros.saldo))}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Table 2: Externo (Editable) */}
                <div className="table-card">
                    <div className="table-header">
                        <div className="header-title-group">
                            <h3 className="panel-title">Externo <span className="text-muted font-normal text-sm ml-1">({tipo === 'bancaria' ? 'Extracto' : 'Conteo'})</span></h3>
                        </div>
                        <div className="actions">
                            <button
                                className={`btn-premium-toggle ${isExternalEditing ? 'active-mode' : ''}`}
                                onClick={() => setIsExternalEditing(!isExternalEditing)}
                                title={isExternalEditing ? "Finalizar edición" : "Habilitar edición"}
                            >
                                {isExternalEditing ? (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                        <span className="hidden-mobile">Listo</span>
                                    </>
                                ) : (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                        </svg>
                                        <span className="hidden-mobile">Editar</span>
                                    </>
                                )}
                            </button>
                            <div className="divider-v"></div>
                            <button
                                className="btn-brand-gradient"
                                onClick={() => setIsImportModalOpen(true)}
                                title="Importar desde Excel o CSV"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <span className="hidden-mobile">Importar</span>
                            </button>
                            <button className="btn-premium-secondary" onClick={handleAddRow}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                <span className="hidden-mobile">Fila</span>
                            </button>
                        </div>
                    </div>

                    {/* Grid Head */}
                    <div className="grid-header" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                        <div className="gh-cell">Fecha</div>
                        <div className="gh-cell">Concepto</div>
                        <div className="gh-cell text-right">Debe</div>
                        <div className="gh-cell text-right">Haber</div>
                        <div className="gh-cell"></div>
                    </div>

                    <div className="table-container">
                        {filteredExterno.map(row => (
                            <div
                                key={row.id}
                                className={`${isExternalEditing ? 'grid-row editable-row' : getRowClass(row, 'externo')}`}
                                style={{ gridTemplateColumns: GRID_TEMPLATE }}
                                onClick={(e) => {
                                    if (isExternalEditing) return // Disable selection in edit mode
                                    // Avoid toggling when clicking inputs/buttons (though in Read mode there are no inputs)
                                    if ((e.target as HTMLElement).closest('button')) return
                                    handleRowClick(`externo:${row.id}`)
                                }}
                            >
                                {/* Date Cell */}
                                <div className={`gd-cell ${isExternalEditing ? 'p-0' : 'text-secondary'}`}>
                                    {isExternalEditing ? (
                                        editingDateId === row.id ? (
                                            <input
                                                type="date"
                                                className="edit-input"
                                                value={row.fecha}
                                                onChange={e => handleExternoChange(row.id, 'fecha', e.target.value)}
                                                onBlur={() => setEditingDateId(null)}
                                                autoFocus
                                            />
                                        ) : (
                                            <div
                                                className="edit-placeholder"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditingDateId(row.id)
                                                }}
                                            >
                                                {row.fecha ? formatDateAR(row.fecha) : 'dd/mm'}
                                            </div>
                                        )
                                    ) : (
                                        formatDateAR(row.fecha)
                                    )}
                                </div>

                                {/* Concepto Cell */}
                                <div className={`gd-cell ${isExternalEditing ? 'p-0' : 'cell-concept'}`} title={row.concepto}>
                                    {isExternalEditing ? (
                                        <input
                                            type="text"
                                            className="edit-input"
                                            value={row.concepto}
                                            onChange={e => handleExternoChange(row.id, 'concepto', e.target.value)}
                                        />
                                    ) : (
                                        row.concepto
                                    )}
                                </div>

                                {/* Debe Cell */}
                                <div className={`gd-cell ${isExternalEditing ? 'p-0' : 'text-right text-debit tabular-nums'}`} title={formatMoney(row.debe)}>
                                    {isExternalEditing ? (
                                        <input
                                            type="number"
                                            className="edit-input text-right tabular-nums"
                                            value={row.debe}
                                            onChange={e => handleExternoChange(row.id, 'debe', parseFloat(e.target.value) || 0)}
                                        />
                                    ) : (
                                        row.debe > 0 ? formatShortMoney(row.debe) : '-'
                                    )}
                                </div>

                                {/* Haber Cell */}
                                <div className={`gd-cell ${isExternalEditing ? 'p-0' : 'text-right text-credit tabular-nums'}`} title={formatMoney(row.haber)}>
                                    {isExternalEditing ? (
                                        <input
                                            type="number"
                                            className="edit-input text-right tabular-nums"
                                            value={row.haber}
                                            onChange={e => handleExternoChange(row.id, 'haber', parseFloat(e.target.value) || 0)}
                                        />
                                    ) : (
                                        row.haber > 0 ? formatShortMoney(row.haber) : '-'
                                    )}
                                </div>

                                {/* Actions Cell */}
                                <div className="gd-cell flex-center">
                                    <button
                                        className="btn-delete-action"
                                        onClick={(e) => {
                                            e.stopPropagation() // Prevent selection
                                            handleDeleteRow(row.id)
                                        }}
                                        title="Eliminar fila"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {filteredExterno.length === 0 && (
                            <div className="empty-state-container">
                                Sin datos externos.
                            </div>
                        )}
                    </div>

                    <div className="table-footer-custom">
                        {/* Totals Row */}
                        <div className="grid-footer-row totals-row" style={{ gridTemplateColumns: GRID_TEMPLATE }}>
                            <div className="gf-cell font-bold text-dark">Totales</div>
                            <div className="gf-cell"></div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsExterno.tDebe)}</div>
                            <div className="gf-cell text-right font-bold tabular-nums text-dark">{formatMoney(totalsExterno.tHaber)}</div>
                            <div className="gf-cell"></div>
                        </div>

                        {/* Saldo Row */}
                        <div className="saldo-row">
                            <span className="saldo-label">SALDO</span>
                            <span className={`saldo-badge ${totalsExterno.saldo >= 0 ? 'badge-deudor' : 'badge-acreedor'}`}>
                                {totalsExterno.saldo >= 0 ? 'DEUDOR' : 'ACREEDOR'} {formatMoney(Math.abs(totalsExterno.saldo))}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Difference Widget & Bank Reconciliation Card */}
            <div className="bottom-widget-container">
                <button
                    className={`diff-pill ${isBalanced ? 'status-ok' : (difference > 0 ? 'status-surplus' : 'status-missing')}`}
                    onClick={() => setIsDiffExpanded(!isDiffExpanded)}
                >
                    <div className="pill-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </div>
                    <div className="pill-content">
                        <span className="pill-label">Diferencia</span>
                        <span className="pill-amount tabular-nums">{formatMoney(Math.abs(difference))}</span>
                    </div>
                    <div className="pill-tag">
                        {isBalanced ? 'OK' : (difference > 0 ? 'Falta' : 'Sobra')}
                    </div>
                    <div className="pill-chevron">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isDiffExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </div>
                </button>

                {isDiffExpanded && (
                    <div className="diff-details-popover fade-in-up">
                        <div className="popover-row">
                            <span className="pop-label">Saldo Externo:</span>
                            <span className={`pop-value ${totalsExterno.saldo >= 0 ? 'text-deudor' : 'text-acreedor'}`}>
                                {formatMoney(Math.abs(totalsExterno.saldo))} ({totalsExterno.saldo >= 0 ? 'D' : 'A'})
                            </span>
                        </div>
                        <div className="popover-row">
                            <span className="pop-label">Saldo Libros:</span>
                            <span className={`pop-value ${totalsLibros.saldo >= 0 ? 'text-deudor' : 'text-acreedor'}`}>
                                {formatMoney(Math.abs(totalsLibros.saldo))} ({totalsLibros.saldo >= 0 ? 'D' : 'A'})
                            </span>
                        </div>
                        <div className="popover-divider"></div>
                        <div className="popover-explanation text-xs text-muted">
                            Diferencia = Saldo Externo - Saldo Libros
                        </div>
                    </div>
                )}
            </div>

            {/* Bank Reconciliation Card Integration */}
            <div className="mt-6">
                <BankReconciliationCard
                    saldoLibros={totalsLibros.saldo}
                    saldoExterno={totalsExterno.saldo}

                    // Detail Lists
                    depositsInTransit={depositsInTransit}
                    outstandingPayments={outstandingPayments}
                    bankCredits={bankCredits}
                    bankDebits={bankDebits}

                    // Pre-calculated Totals
                    reconciledBankBalance={reconciledBankBalance}
                    adjustedBookBalance={adjustedBookBalance}
                    diff={reconDiff}
                    isBalanced={isReconBalanced}

                    onFocusRow={(side, id) => {
                        // Optional: Implementation for scrolling/focusing
                        // For now, we can log or just let it be.
                        console.log('Focus request:', side, id)
                    }}
                />
            </div>

            {/* Premium PDF Download Button */}
            <div className="flex justify-end mt-8 mb-8">
                <button
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPdf}
                    className={`
                        group relative flex items-center gap-3 px-6 h-12 rounded-2xl
                        bg-gradient-to-r from-blue-600 to-emerald-500
                        text-white font-bold text-sm tracking-wide shadow-md
                        transition-all duration-200 ease-out
                        hover:from-blue-700 hover:to-emerald-600 hover:shadow-lg hover:-translate-y-0.5
                        disabled:opacity-75 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0
                    `}
                >
                    {isGeneratingPdf ? (
                        <>
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>GENERANDO...</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>DESCARGAR PDF (Conciliación bancaria)</span>
                        </>
                    )}
                </button>
            </div>

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImportData}
            />

            <style>{`
                .conciliaciones-page {
                    padding: var(--space-md);
                    /* Removed fixed height/overflow to allow full page scroll */
                    min-height: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }
                
                /* Typography & Header */
                .conciliaciones-header {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-md);
                    flex-shrink: 0;
                }
                .page-title {
                    font-size: 1.8rem;
                    font-weight: 800;
                    color: var(--text-primary);
                    margin: 0;
                    line-height: 1.2;
                    letter-spacing: -0.02em;
                }
                .page-subtitle {
                    color: var(--text-secondary);
                    margin: 4px 0 0;
                    font-size: 1rem;
                    font-weight: 400;
                }

                /* Controls Card */
                .controls-card {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 16px 24px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .controls-flex-row {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                @media (min-width: 768px) {
                    .controls-flex-row {
                        flex-direction: row;
                        align-items: flex-end;
                    }
                }

                .control-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .flex-grow { flex: 1; }
                
                .control-label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    letter-spacing: 0.05em;
                }

                /* Premium Inputs */
                .premium-input {
                    display: block;
                    width: 100%;
                    padding: 0 12px;
                    height: 40px;
                    background-color: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    color: #1e293b;
                    outline: none;
                    transition: all 0.2s ease;
                }
                .premium-input:focus {
                    background-color: #ffffff;
                    border-color: var(--primary-color);
                    box-shadow: 0 0 0 3px var(--primary-color-alpha);
                }
                
                .date-inputs-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .separator { font-size: 1.2rem; color: #cbd5e1; padding-bottom: 2px; }

                /* Search Input & Button */
                .search-row-flex {
                    display: flex;
                    gap: 8px;
                    width: 100%;
                }
                .search-wrapper { position: relative; width: 100%; }
                .search-input { padding-left: 36px; }
                .search-icon {
                    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
                    pointer-events: none; color: #94a3b8; display: flex; align-items: center;
                }

                .btn-ref-toggle {
                    display: flex; align-items: center; gap: 6px;
                    background: #ffffff; border: 1px solid #e2e8f0;
                    color: #64748b; padding: 0 12px;
                    border-radius: 8px; font-size: 0.85rem; font-weight: 600;
                    white-space: nowrap; cursor: pointer;
                    transition: all 0.2s;
                    height: 40px;
                }
                .btn-ref-toggle:hover { background: #f8fafc; border-color: #cbd5e1; }
                .btn-ref-toggle.active {
                    background: #f0fdf4; border-color: #86efac; color: #15803d;
                }

                /* Tables Grid Layout */
                .tables-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: var(--space-lg);
                    /* Removed flex:1/overflow to allow natural growth */
                }
                @media (min-width: 1024px) {
                    .tables-grid {
                        grid-template-columns: 1fr 1fr;
                    }
                }

                .table-card {
                    background: var(--bg-paper);
                    border-radius: var(--radius-lg);
                    box-shadow: var(--shadow-sm);
                    display: flex;
                    flex-direction: column;
                    border: 1px solid var(--border-color);
                    /* Removed height:100% and overflow:hidden */
                }

                .table-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #ffffff;
                    min-height: 72px;
                }
                .header-row-aligned {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                }
                .header-controls-right {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .panel-title {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: var(--text-primary);
                }

                /* Compact Account Select in Header */
                .account-select-compact {
                    position: relative;
                    width: 320px;
                    min-width: 200px;
                }
                .account-select-compact input {
                    height: 36px;
                    font-size: 0.9rem;
                    border-radius: 6px;
                    padding-right: 24px;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                }
                .select-chevron-sm {
                    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                    pointer-events: none; color: #94a3b8;
                }

                /* Actions */
                .actions { display: flex; gap: 8px; }

                 .btn-brand-gradient {
                    display: flex; align-items: center; gap: 8px;
                    background: linear-gradient(135deg, #2563eb 0%, #10b981 100%);
                    color: white; border: none; padding: 6px 14px;
                    border-radius: 6px; font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); height: 36px;
                }
                .btn-premium-secondary {
                    display: flex; align-items: center; gap: 6px;
                    background-color: white; color: var(--text-secondary);
                    border: 1px solid var(--border-color); padding: 6px 14px;
                    border-radius: 6px; font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; height: 36px;
                }

                .btn-premium-toggle {
                    display: flex; align-items: center; gap: 6px;
                    background-color: white; color: var(--text-secondary);
                    border: 1px solid var(--border-color); padding: 6px 14px;
                    border-radius: 6px; font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; height: 36px;
                    transition: all 0.2s;
                }
                .btn-premium-toggle:hover { background-color: #f8fafc; border-color: #cbd5e1; }
                .btn-premium-toggle.active-mode {
                    background-color: #0f172a; color: white; border-color: #0f172a;
                }

                .divider-v {
                    width: 1px; height: 24px; background-color: #e2e8f0; margin: 0 4px;
                }
                
                @media (max-width: 640px) {
                    .hidden-mobile { display: none; }
                }

                /* GRID LAYOUT IMPLEMENTATION */
                .grid-header {
                    display: grid;
                    /* grid-template-columns set inline */
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--text-secondary);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .gh-cell { padding: 10px 12px; }

                .table-container {
                    /* Removed flex:1 and overflow-y:auto */
                    overflow-x: hidden;
                    background: #ffffff;
                    position: relative;
                }
                
                .grid-row {
                    display: grid;
                    /* grid-template-columns set inline */
                    border-bottom: 1px solid #f1f5f9;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                    align-items: center; /* Vertical center */
                    transition: background 0.1s;
                    cursor: pointer;
                }
                .grid-row:hover { background-color: #f8fafc; }
                
                /* Selection & Highlighting States */
                .grid-row.row-ref-match {
                    background-color: #fef9c3 !important; /* Yellow-50 */
                    border-left: 3px solid #facc15;
                    padding-left: 0; /* Adjust for border if needed, or keep standard */
                }
                .grid-row.row-selected {
                    background-color: #ecfdf5 !important; /* Emerald-50 */
                    border-left: 3px solid #10b981;
                }
                
                .gd-cell {
                    padding: 8px 12px;
                    overflow: hidden;
                    white-space: nowrap;
                    text-overflow: ellipsis;
                    height: 100%;
                    min-height: 40px;
                    display: flex;
                    align-items: center;
                }
                .p-0 { padding: 0 !important; }
                .text-right { justify-content: flex-end; text-align: right; }
                .text-center { justify-content: center; }
                .flex-center { justify-content: center; display: flex; align-items: center; }

                /* Editable Inputs in Grid */
                .edit-input {
                    width: 100%; height: 100%;
                    padding: 0 8px; border: none;
                    background: #f1f5f9;
                    font-family: inherit; font-size: inherit;
                    outline: 2px solid var(--primary-color);
                    border-radius: 0;
                }
                .edit-placeholder {
                    cursor: text;
                    width: 100%; height: 100%;
                    display: flex; align-items: center; padding: 0 12px;
                }
                .edit-placeholder:hover { background: #f1f5f9; }

                .btn-delete-action {
                    width: 28px; height: 28px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 99px; color: #94a3b8;
                    background: transparent; border: none; cursor: pointer;
                }
                .btn-delete-action:hover { background-color: #fef2f2; color: #dc2626; }

                /* Empty State */
                .empty-state-container {
                    padding: 40px; text-align: center; color: #94a3b8; font-weight: 500; font-size: 0.95rem;
                }

                /* Footer Totals & Saldo */
                .table-footer-custom {
                    background: #ffffff;
                    border-top: 1px solid var(--border-color);
                    display: flex;
                    flex-direction: column;
                }
                
                .grid-footer-row {
                    display: grid;
                    align-items: center;
                    padding: 0;
                    font-size: 0.9rem;
                    color: var(--text-primary);
                }
                .totals-row {
                    background-color: #f8fafc; /* Slate 50 approx */
                    border-bottom: 1px solid #f1f5f9;
                }
                .gf-cell {
                    padding: 10px 12px;
                }
                .text-dark { color: #0f172a; }
                
                .saldo-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 20px 8px 12px; /* Extra padding right for alignment */
                    background-color: #ffffff;
                }
                .saldo-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    letter-spacing: 0.05em;
                }
                
                .saldo-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 999px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    border: 1px solid transparent;
                }
                .badge-deudor {
                    background-color: #eff6ff; /* Blue 50 */
                    color: #1d4ed8;       /* Blue 700 */
                    border-color: #dbeafe;    /* Blue 200 */
                }
                .badge-acreedor {
                    background-color: #fef2f2; /* Red 50 */
                    color: #b91c1c;       /* Red 700 */
                    border-color: #fecaca;    /* Red 200 */
                }
                
                /* Bottom Widget */
                .bottom-widget-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding-bottom: 8px;
                    position: relative;
                }
                
                .diff-pill {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 6px 8px 6px 16px;
                    border-radius: 999px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    cursor: pointer;
                    transition: all 0.2s;
                    min-width: 280px;
                }
                .diff-pill:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.12); }
                
                .status-ok { border-color: #86efac; background: #f0fdf4; color: #15803d; }
                .status-surplus { border-color: #93c5fd; background: #eff6ff; color: #1e40af; }
                .status-missing { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
                
                .pill-icon { display: flex; align-items: center; }
                .pill-content { display: flex; flex-direction: column; align-items: flex-start; flex: 1; }
                .pill-label { font-size: 0.65rem; text-transform: uppercase; font-weight: 700; opacity: 0.8; }
                .pill-amount { font-size: 1rem; font-weight: 800; line-height: 1.1; }
                
                .pill-tag {
                    font-size: 0.75rem; font-weight: 700;
                    background: rgba(255,255,255,0.6);
                    padding: 2px 8px; border-radius: 4px;
                }
                .pill-chevron { margin-left: 8px; opacity: 0.5; transition: transform 0.2s; }
                
                .diff-details-popover {
                    position: absolute;
                    bottom: 70px; /* Above the pill */
                    background: white;
                    border-radius: 12px;
                    padding: 16px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    border: 1px solid #e2e8f0;
                    width: 300px;
                    z-index: 50;
                }
                .popover-row {
                    display: flex; justify-content: space-between;
                    margin-bottom: 8px; font-size: 0.9rem;
                }
                .pop-label { color: #64748b; }
                .pop-value { font-weight: 600; }
                .popover-divider { height: 1px; background: #f1f5f9; margin: 8px 0; }
                
                .text-deudor { color: #1e3a8a; } 
                .text-acreedor { color: #7f1d1d; }

                /* Animation */
                .fade-in { animation: fadeIn 0.3s ease-out; }
                .fade-in-up { animation: fadeInUp 0.2s ease-out; }
                
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

            `}</style>
        </div>
    )
}
