/**
 * Balance Sheet Print View
 * Formal RT9 style for printing/PDF export
 */
import { forwardRef } from 'react'
import type { BalanceSheetViewModel, Rubro } from '../adapters/balanceSheetViewModel'
import { filterVisibleRubros } from '../adapters/balanceSheetViewModel'
import { formatCurrencyARS } from '../../../core/amortizaciones/calc'

// ============================================
// Props
// ============================================

interface BalanceSheetPrintViewProps {
    viewModel: BalanceSheetViewModel
    showComparative: boolean
}

// ============================================
// Helper Components
// ============================================

interface PrintSectionProps {
    title: string
    rubros: Rubro[]
    showComparative: boolean
}

function PrintSection({ title, rubros, showComparative }: PrintSectionProps) {
    const visibleRubros = filterVisibleRubros(rubros, showComparative)

    if (visibleRubros.length === 0) return null

    const total = visibleRubros.reduce((s, r) => s + r.currentAmount, 0)
    const totalPrev = visibleRubros.reduce((s, r) => s + (r.prevAmount ?? 0), 0)

    return (
        <>
            <tr className="print-section-header">
                <td colSpan={showComparative ? 3 : 2}>{title}</td>
            </tr>
            {visibleRubros.map(rubro => (
                <tr key={rubro.id} className="print-rubro-row">
                    <td className="print-rubro-name">
                        {rubro.label}
                        {rubro.noteNumber && ` (Nota ${rubro.noteNumber})`}
                    </td>
                    <td className="print-amount">{formatCurrencyARS(rubro.currentAmount)}</td>
                    {showComparative && (
                        <td className="print-amount print-prev">{formatCurrencyARS(rubro.prevAmount ?? 0)}</td>
                    )}
                </tr>
            ))}
            <tr className="print-subtotal-row">
                <td className="print-subtotal-label">Total {title}</td>
                <td className="print-amount">{formatCurrencyARS(total)}</td>
                {showComparative && (
                    <td className="print-amount print-prev">{formatCurrencyARS(totalPrev)}</td>
                )}
            </tr>
        </>
    )
}

// ============================================
// Main Component
// ============================================

export const BalanceSheetPrintView = forwardRef<HTMLDivElement, BalanceSheetPrintViewProps>(
    function BalanceSheetPrintView({ viewModel, showComparative }, ref) {
        const { meta, sections, totals, comparativeTotals } = viewModel

        return (
            <div ref={ref} className="print-view">
                {/* Header */}
                <div className="print-header">
                    <h1 className="print-company">{meta.empresa || 'EMPRESA S.A.'}</h1>
                    <h2 className="print-title">ESTADO DE SITUACIÓN PATRIMONIAL</h2>
                    <p className="print-date">
                        Correspondiente al ejercicio finalizado el {meta.fechaCorte}
                    </p>
                    {showComparative && (
                        <p className="print-comparative-note">
                            (Expresado en pesos argentinos - Comparativo con ejercicio {meta.ejercicioAnterior})
                        </p>
                    )}
                </div>

                {/* Two-Column Layout */}
                <div className="print-columns">
                    {/* Left: ACTIVO */}
                    <div className="print-column">
                        <table className="print-table">
                            <thead>
                                <tr>
                                    <th className="print-th-main">ACTIVO</th>
                                    <th className="print-th-amount">{meta.ejercicioActual}</th>
                                    {showComparative && (
                                        <th className="print-th-amount">{meta.ejercicioAnterior}</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                <PrintSection
                                    title="ACTIVO CORRIENTE"
                                    rubros={sections.activo.corriente}
                                    showComparative={showComparative}
                                />
                                <PrintSection
                                    title="ACTIVO NO CORRIENTE"
                                    rubros={sections.activo.noCorriente}
                                    showComparative={showComparative}
                                />
                                <tr className="print-grand-total">
                                    <td>TOTAL DEL ACTIVO</td>
                                    <td className="print-amount">{formatCurrencyARS(totals.totalActivo)}</td>
                                    {showComparative && (
                                        <td className="print-amount print-prev">
                                            {formatCurrencyARS(comparativeTotals?.totalActivo ?? 0)}
                                        </td>
                                    )}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Right: PASIVO + PN */}
                    <div className="print-column">
                        <table className="print-table">
                            <thead>
                                <tr>
                                    <th className="print-th-main">PASIVO</th>
                                    <th className="print-th-amount">{meta.ejercicioActual}</th>
                                    {showComparative && (
                                        <th className="print-th-amount">{meta.ejercicioAnterior}</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                <PrintSection
                                    title="PASIVO CORRIENTE"
                                    rubros={sections.pasivo.corriente}
                                    showComparative={showComparative}
                                />
                                <PrintSection
                                    title="PASIVO NO CORRIENTE"
                                    rubros={sections.pasivo.noCorriente}
                                    showComparative={showComparative}
                                />
                                <tr className="print-subtotal-row">
                                    <td className="print-subtotal-label">Total del Pasivo</td>
                                    <td className="print-amount">{formatCurrencyARS(totals.totalPasivo)}</td>
                                    {showComparative && (
                                        <td className="print-amount print-prev">
                                            {formatCurrencyARS(comparativeTotals?.totalPasivo ?? 0)}
                                        </td>
                                    )}
                                </tr>
                            </tbody>
                        </table>

                        {/* Patrimonio Neto */}
                        <table className="print-table print-table-pn">
                            <thead>
                                <tr>
                                    <th className="print-th-main">PATRIMONIO NETO</th>
                                    <th className="print-th-amount">{meta.ejercicioActual}</th>
                                    {showComparative && (
                                        <th className="print-th-amount">{meta.ejercicioAnterior}</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filterVisibleRubros(sections.patrimonioNeto, showComparative).map(rubro => (
                                    <tr key={rubro.id} className="print-rubro-row">
                                        <td className="print-rubro-name">
                                            {rubro.label}
                                            {rubro.noteNumber && ` (Nota ${rubro.noteNumber})`}
                                        </td>
                                        <td className="print-amount">{formatCurrencyARS(rubro.currentAmount)}</td>
                                        {showComparative && (
                                            <td className="print-amount print-prev">
                                                {formatCurrencyARS(rubro.prevAmount ?? 0)}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                <tr className="print-subtotal-row">
                                    <td className="print-subtotal-label">Total del Patrimonio Neto</td>
                                    <td className="print-amount">{formatCurrencyARS(totals.totalPN)}</td>
                                    {showComparative && (
                                        <td className="print-amount print-prev">
                                            {formatCurrencyARS(comparativeTotals?.totalPN ?? 0)}
                                        </td>
                                    )}
                                </tr>
                                <tr className="print-grand-total">
                                    <td>TOTAL PASIVO + P.N.</td>
                                    <td className="print-amount">{formatCurrencyARS(totals.totalPasivoPN)}</td>
                                    {showComparative && (
                                        <td className="print-amount print-prev">
                                            {formatCurrencyARS(comparativeTotals?.totalPasivoPN ?? 0)}
                                        </td>
                                    )}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="print-footer">
                    <p>Las notas adjuntas son parte integrante de este estado.</p>
                    <p>Generado por ContaLivre el {new Date().toLocaleDateString('es-AR')}</p>
                </div>

                <style>{printStyles}</style>
            </div>
        )
    }
)

// ============================================
// Styles
// ============================================

const printStyles = `
/* Hide print view on screen */
.print-view {
    display: none;
}

/* Print Media Styles */
@media print {
    /* Hide everything except print view */
    body > *:not(.print-view) {
        display: none !important;
    }

    .print-view {
        display: block !important;
        width: 100%;
        margin: 0;
        padding: 0;
        background: white;
        color: black;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        font-size: 10pt;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }

    @page {
        size: A4;
        margin: 15mm;
    }

    /* Header */
    .print-header {
        text-align: center;
        margin-bottom: 10mm;
        padding-bottom: 5mm;
        border-bottom: 2px solid #000;
    }

    .print-company {
        font-size: 14pt;
        font-weight: 800;
        margin: 0 0 2mm;
        text-transform: uppercase;
    }

    .print-title {
        font-size: 12pt;
        font-weight: 700;
        margin: 0 0 2mm;
    }

    .print-date {
        font-size: 10pt;
        margin: 0;
        color: #333;
    }

    .print-comparative-note {
        font-size: 9pt;
        font-style: italic;
        color: #666;
        margin: 2mm 0 0;
    }

    /* Two-Column Layout */
    .print-columns {
        display: flex;
        gap: 10mm;
    }

    .print-column {
        flex: 1;
    }

    /* Tables */
    .print-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10pt;
        margin-bottom: 5mm;
    }

    .print-table-pn {
        margin-top: 5mm;
    }

    .print-table th {
        text-align: left;
        padding: 3mm 2mm;
        border-bottom: 2px solid #000;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11pt;
    }

    .print-th-main {
        width: 60%;
    }

    .print-th-amount {
        width: 20%;
        text-align: right;
        font-size: 9pt;
    }

    /* Section Headers */
    .print-section-header td {
        padding: 4mm 2mm 2mm;
        font-weight: 700;
        text-decoration: underline;
        font-size: 10pt;
    }

    /* Rubro Rows */
    .print-rubro-row td {
        padding: 1.5mm 2mm;
        border-bottom: 1px dotted #ccc;
    }

    .print-rubro-name {
        padding-left: 5mm !important;
    }

    .print-amount {
        text-align: right;
        font-family: 'JetBrains Mono', 'Consolas', monospace;
        font-variant-numeric: tabular-nums;
    }

    .print-prev {
        color: #666;
    }

    /* Subtotal Rows */
    .print-subtotal-row td {
        padding: 2mm;
        border-top: 1px solid #000;
        font-weight: 600;
    }

    .print-subtotal-label {
        padding-left: 3mm !important;
    }

    /* Grand Total Rows */
    .print-grand-total td {
        padding: 3mm 2mm;
        border-top: 1px solid #000;
        border-bottom: 2px solid #000;
        font-weight: 800;
        font-size: 11pt;
    }

    /* Footer */
    .print-footer {
        margin-top: 10mm;
        padding-top: 3mm;
        border-top: 1px solid #000;
        font-size: 8pt;
        color: #666;
    }

    .print-footer p {
        margin: 0;
    }
}
`

export default BalanceSheetPrintView
