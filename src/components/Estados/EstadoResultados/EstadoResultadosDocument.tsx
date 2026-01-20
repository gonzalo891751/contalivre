/**
 * Estado de Resultados Document Component
 * 
 * Renders the income statement in a premium paper-like layout following
 * the ContaLivre brand design with floating toolbar, collapsible sections,
 * and print-ready output.
 */

import { useState, useRef, useMemo, useCallback } from 'react'
import {
    ChevronDown,
    Calendar,
    FileText,
    Eye,
    Upload,
    Trash2,
} from 'lucide-react'
import type {
    EstadoResultadosData,
    StatementSectionResult,
    SectionRow
} from '../../../domain/reports/estadoResultados'
import {
    formatAccounting
} from '../../../utils/formatters'

// ============================================
// Types
// ============================================

export interface EstadoResultadosDocumentProps {
    data: EstadoResultadosData
    comparativeData?: EstadoResultadosData
    showComparative: boolean
    showDetails: boolean
    fiscalYear: number
    fiscalYears: number[]
    onToggleComparative: () => void
    onToggleDetails: () => void
    onYearChange: (year: number) => void
    onPrint: () => void
    onImportComparative?: () => void
    onDeleteComparative?: () => void
    hasComparativeData?: boolean
}

interface CollapsedSections {
    [key: string]: boolean
}

// ============================================
// Subcomponents
// ============================================

/** Toggle Switch */
function Toggle({
    id,
    checked,
    onChange,
    label
}: {
    id: string
    checked: boolean
    onChange: () => void
    label: string
}) {
    return (
        <div className="er-toggle-container" onClick={onChange}>
            <div className="er-toggle-wrapper">
                <input
                    type="checkbox"
                    id={id}
                    checked={checked}
                    onChange={onChange}
                    className="er-toggle-checkbox"
                />
                <label htmlFor={id} className="er-toggle-label" />
            </div>
            <span className="er-toggle-text">{label}</span>
        </div>
    )
}

/** Section Row (Detail) */
function DetailRow({
    row,
    showComparative,
    comparativeAmount
}: {
    row: SectionRow
    showComparative: boolean
    comparativeAmount?: number
}) {
    // Reconstruct signed amount
    const signedAmount = row.isNegative ? -Math.abs(row.amount) : Math.abs(row.amount)
    const formatted = formatAccounting(signedAmount)

    // Comparative
    let compFormatted = { text: '—', isNegative: false }
    if (comparativeAmount !== undefined) {
        compFormatted = formatAccounting(comparativeAmount)
    }

    return (
        <div className="er-detail-row">
            <div className="er-col-label er-detail-label">
                {row.accountName}
            </div>
            <div className={`er-col-amount er-detail-amount ${formatted.isNegative ? 'er-negative' : ''}`}>
                {formatted.text}
            </div>
            {showComparative && (
                <div className={`er-col-amount er-detail-amount er-comparative ${compFormatted.isNegative ? 'er-negative' : ''}`}>
                    {compFormatted.text}
                </div>
            )}
        </div>
    )
}

/** Collapsible Section */
function CollapsibleSection({
    section,
    comparativeSection,
    showDetails,
    showComparative,
    collapsed,
    onToggle,
    isSubtraction = false,
}: {
    section: StatementSectionResult
    comparativeSection?: StatementSectionResult
    showDetails: boolean
    showComparative: boolean
    collapsed: boolean
    onToggle: () => void
    isSubtraction?: boolean
}) {
    // Don't render if no rows
    if (section.rows.length === 0 && Math.abs(section.subtotal) < 0.01) {
        return null
    }

    const isExpanded = showDetails && !collapsed

    // Build a map for comparative amounts
    const comparativeAmounts = useMemo(() => {
        if (!comparativeSection) return new Map<string, number>()
        const map = new Map<string, number>()
        comparativeSection.rows.forEach(r => map.set(r.accountId, r.amount * (r.isNegative ? -1 : 1)))
        return map
    }, [comparativeSection])

    // Format amounts
    const sectionFormatted = formatAccounting(section.subtotal)

    let compFormatted = { text: '—', isNegative: false }
    if (comparativeSection) {
        compFormatted = formatAccounting(comparativeSection.subtotal)
    }

    return (
        <div className="er-section-group">
            {/* Section Header (clickable) */}
            <div
                className="er-section-header"
                onClick={onToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle() }}
            >
                <div className="er-col-label er-section-label">
                    <ChevronDown
                        className={`er-caret-icon ${isExpanded ? '' : 'er-caret-collapsed'}`}
                        size={12}
                    />
                    {isSubtraction ? `(-) ${section.label}` : section.label}
                </div>
                <div className={`er-col-amount er-section-amount ${sectionFormatted.isNegative ? 'er-negative' : ''}`}>
                    {sectionFormatted.text}
                </div>
                {showComparative && (
                    <div className={`er-col-amount er-section-amount er-comparative ${compFormatted.isNegative ? 'er-negative' : ''}`}>
                        {compFormatted.text}
                    </div>
                )}
            </div>

            {/* Detail Rows */}
            <div className={`er-details-container ${isExpanded ? '' : 'er-collapsed'}`}>
                {section.rows.map((row) => (
                    <DetailRow
                        key={row.accountId}
                        row={row}
                        showComparative={showComparative}
                        comparativeAmount={comparativeAmounts.get(row.accountId)}
                    />
                ))}
            </div>
        </div>
    )
}

/** Subtotal Row (emphasized) */
function SubtotalRow({
    label,
    amount,
    comparativeAmount,
    showComparative,
    type = 'default'
}: {
    label: string
    amount: number
    comparativeAmount?: number
    showComparative: boolean
    type?: 'default' | 'gross' | 'operating' | 'pretax'
}) {
    const formatted = formatAccounting(amount)
    let compFormatted = { text: '—', isNegative: false }
    if (comparativeAmount !== undefined) {
        compFormatted = formatAccounting(comparativeAmount)
    }

    return (
        <div className={`er-subtotal-row er-subtotal-${type}`}>
            <div className="er-col-label er-subtotal-label">{label}</div>
            <div className={`er-col-amount er-subtotal-amount ${formatted.isNegative ? 'er-negative' : ''}`}>
                {formatted.text}
            </div>
            {showComparative && (
                <div className={`er-col-amount er-subtotal-amount er-comparative ${compFormatted.isNegative ? 'er-negative' : ''}`}>
                    {compFormatted.text}
                </div>
            )}
        </div>
    )
}

/** Simple Amount Row (e.g., Tax) */
function SimpleRow({
    label,
    amount,
    comparativeAmount,
    showComparative,
    isSubtraction = false
}: {
    label: string
    amount: number
    comparativeAmount?: number
    showComparative: boolean
    isSubtraction?: boolean
}) {
    // For simple row with forced subtraction (e.g. Tax), we treat amount as negative if isSubtraction is true
    const realAmount = isSubtraction ? -Math.abs(amount) : amount
    const formatted = formatAccounting(realAmount)

    let realCompAmount: number | undefined = comparativeAmount
    if (comparativeAmount !== undefined && isSubtraction) {
        realCompAmount = -Math.abs(comparativeAmount)
    }

    let compFormatted = { text: '—', isNegative: false }
    if (realCompAmount !== undefined) {
        compFormatted = formatAccounting(realCompAmount)
    }

    return (
        <div className="er-simple-row">
            <div className="er-col-label">
                {label}
            </div>
            <div className={`er-col-amount ${formatted.isNegative ? 'er-negative' : ''}`}>
                {formatted.text}
            </div>
            {showComparative && (
                <div className={`er-col-amount er-comparative ${compFormatted.isNegative ? 'er-negative' : ''}`}>
                    {compFormatted.text}
                </div>
            )}
        </div>
    )
}

/** Final Result Box */
function FinalResultBox({
    resultadoNeto,
    comparativeResultado,
    showComparative,
    yoyChange,
    isGain
}: {
    resultadoNeto: number
    comparativeResultado?: number
    showComparative: boolean
    yoyChange?: number
    isGain: boolean
}) {
    return (
        <div className={`er-final-result ${isGain ? 'er-gain' : 'er-loss'}`}>
            <div className="er-final-left">
                <span className="er-final-label">Resultado del Ejercicio</span>
                <span className="er-final-badge">
                    {isGain ? 'GANANCIA NETA' : 'PÉRDIDA NETA'}
                </span>
            </div>
            <div className="er-final-amounts">
                <div className="er-final-primary">
                    <span className="er-final-amount">
                        $ {formatAccounting(resultadoNeto).text}
                    </span>
                    {yoyChange !== undefined && (
                        <span className={`er-yoy-chip ${yoyChange >= 0 ? 'er-yoy-positive' : 'er-yoy-negative'}`}>
                            {yoyChange >= 0 ? '+' : ''}{yoyChange.toFixed(1)}% YoY
                        </span>
                    )}
                </div>
                {showComparative && comparativeResultado !== undefined && (
                    <div className="er-final-comparative">
                        $ {formatAccounting(comparativeResultado).text}
                    </div>
                )}
            </div>
        </div>
    )
}

// ============================================
// Main Component
// ============================================

export function EstadoResultadosDocument({
    data,
    showComparative,
    showDetails,
    fiscalYear,
    fiscalYears,
    onToggleComparative,
    onToggleDetails,
    onYearChange,
    onPrint,
    onImportComparative,
    onDeleteComparative,
    hasComparativeData
}: EstadoResultadosDocumentProps) {
    const paperRef = useRef<HTMLDivElement>(null)
    const [printMode, setPrintMode] = useState(false)
    const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>({})

    const toggleSection = useCallback((key: string) => {
        setCollapsedSections(prev => ({
            ...prev,
            [key]: !prev[key]
        }))
    }, [])

    const togglePrintMode = useCallback(() => {
        setPrintMode(prev => !prev)
    }, [])

    const comparative = data.comparative

    // Current date for footer
    const today = new Date()
    const emisionDate = today.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })

    return (
        <div className={`er-container ${printMode ? 'er-print-preview' : ''}`}>
            {/* Floating Toolbar */}
            <div className="er-toolbar no-print">
                <div className="er-toolbar-inner">
                    {/* Toggles */}
                    <div className="er-toolbar-group er-toolbar-toggles">
                        <Toggle
                            id="toggle-comp"
                            checked={showComparative}
                            onChange={onToggleComparative}
                            label="Comparativo"
                        />
                        <Toggle
                            id="toggle-detail"
                            checked={showDetails}
                            onChange={onToggleDetails}
                            label="Ver Detalle"
                        />
                    </div>

                    {/* Year Selector */}
                    <div className="er-toolbar-group">
                        <Calendar size={16} className="er-toolbar-icon" />
                        <select
                            className="er-year-select"
                            value={fiscalYear}
                            onChange={(e) => onYearChange(Number(e.target.value))}
                        >
                            {fiscalYears.map(y => (
                                <option key={y} value={y}>{y} (Cierre)</option>
                            ))}
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="er-toolbar-group er-toolbar-actions">
                        {showComparative && onImportComparative && (
                            <button
                                className="er-btn-secondary"
                                onClick={onImportComparative}
                                title="Importar comparativo (.xlsx/.csv)"
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '9999px',
                                    background: 'white',
                                    border: '1px solid #cbd5e1',
                                    color: '#475569',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    marginRight: 8
                                }}
                            >
                                <Upload size={16} />
                                {hasComparativeData ? 'Reemplazar Comp.' : 'Cargar Comp.'}
                            </button>
                        )}
                        {showComparative && hasComparativeData && onDeleteComparative && (
                            <button
                                className="er-btn-icon"
                                onClick={onDeleteComparative}
                                title="Borrar comparativo importado"
                                style={{ color: '#ef4444', marginRight: 8 }}
                            >
                                <Trash2 size={18} />
                            </button>
                        )}
                        <button
                            className="er-btn-icon"
                            onClick={togglePrintMode}
                            title="Vista impresión"
                        >
                            <Eye size={18} />
                        </button>
                        <button className="er-btn-primary" onClick={onPrint}>
                            <FileText size={18} />
                            <span>Descargar</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Document Paper */}
            <main ref={paperRef} id="document-paper" className="er-paper">
                {/* Header */}
                <header className="er-header">
                    <h1 className="er-title">Estado de Resultados</h1>
                    <p className="er-subtitle">
                        Ejercicio finalizado el {data.fechaCorte}
                    </p>
                    <p className="er-currency-note">
                        Cifras expresadas en pesos argentinos ($)
                    </p>
                </header>

                {/* Column Headers */}
                <div className="er-column-headers">
                    <div className="er-col-label er-header-label">Rubro / Cuenta</div>
                    <div className="er-col-amount er-header-amount">{fiscalYear}</div>
                    {showComparative && (
                        <div className="er-col-amount er-header-amount er-comparative">{fiscalYear - 1}</div>
                    )}
                </div>

                {/* Content Body */}
                <div className="er-body">
                    {/* VENTAS NETAS */}
                    <CollapsibleSection
                        section={{
                            label: 'Ventas netas',
                            rows: [
                                ...data.ventasBrutas.rows,
                                ...data.devolucionesYBonificaciones.rows.map(r => ({
                                    ...r,
                                    accountName: `(-) ${r.accountName}`,
                                    isNegative: true
                                }))
                            ],
                            subtotal: data.ventasNetas
                        }}
                        comparativeSection={comparative ? {
                            label: 'Ventas netas',
                            rows: [
                                ...comparative.ventasBrutas.rows,
                                ...comparative.devolucionesYBonificaciones.rows.map(r => ({
                                    ...r,
                                    accountName: `(-) ${r.accountName}`,
                                    isNegative: true
                                }))
                            ],
                            subtotal: comparative.ventasNetas
                        } : undefined}
                        showDetails={showDetails}
                        showComparative={showComparative}
                        collapsed={collapsedSections['ventas'] ?? false}
                        onToggle={() => toggleSection('ventas')}
                    />

                    {/* COSTO DE VENTAS */}
                    <CollapsibleSection
                        section={data.costoVentas}
                        comparativeSection={comparative?.costoVentas}
                        showDetails={showDetails}
                        showComparative={showComparative}
                        collapsed={collapsedSections['costo'] ?? false}
                        onToggle={() => toggleSection('costo')}
                        isSubtraction
                    />

                    {/* RESULTADO BRUTO */}
                    <SubtotalRow
                        label="(=) Resultado Bruto"
                        amount={data.resultadoBruto}
                        comparativeAmount={comparative?.resultadoBruto}
                        showComparative={showComparative}
                        type="gross"
                    />

                    {/* GASTOS OPERATIVOS */}
                    <div className="er-operating-expenses">
                        <CollapsibleSection
                            section={data.gastosComercializacion}
                            comparativeSection={comparative?.gastosComercializacion}
                            showDetails={showDetails}
                            showComparative={showComparative}
                            collapsed={collapsedSections['comercializacion'] ?? false}
                            onToggle={() => toggleSection('comercializacion')}
                            isSubtraction
                        />

                        <CollapsibleSection
                            section={data.gastosAdministracion}
                            comparativeSection={comparative?.gastosAdministracion}
                            showDetails={showDetails}
                            showComparative={showComparative}
                            collapsed={collapsedSections['administracion'] ?? false}
                            onToggle={() => toggleSection('administracion')}
                            isSubtraction
                        />

                        {data.otrosGastosOperativos.rows.length > 0 && (
                            <CollapsibleSection
                                section={data.otrosGastosOperativos}
                                comparativeSection={comparative?.otrosGastosOperativos}
                                showDetails={showDetails}
                                showComparative={showComparative}
                                collapsed={collapsedSections['otrosOp'] ?? false}
                                onToggle={() => toggleSection('otrosOp')}
                                isSubtraction
                            />
                        )}
                    </div>

                    {/* RESULTADO OPERATIVO */}
                    <SubtotalRow
                        label="(=) Resultado Operativo"
                        amount={data.resultadoOperativo}
                        comparativeAmount={comparative?.resultadoOperativo}
                        showComparative={showComparative}
                        type="operating"
                    />

                    {/* FINANCIEROS */}
                    <CollapsibleSection
                        section={data.resultadosFinancieros}
                        comparativeSection={comparative?.resultadosFinancieros}
                        showDetails={showDetails}
                        showComparative={showComparative}
                        collapsed={collapsedSections['financieros'] ?? false}
                        onToggle={() => toggleSection('financieros')}
                    />

                    {/* OTROS */}
                    {(data.otrosResultados.rows.length > 0 || Math.abs(data.otrosResultados.subtotal) > 0.01) && (
                        <CollapsibleSection
                            section={data.otrosResultados}
                            comparativeSection={comparative?.otrosResultados}
                            showDetails={showDetails}
                            showComparative={showComparative}
                            collapsed={collapsedSections['otros'] ?? false}
                            onToggle={() => toggleSection('otros')}
                        />
                    )}

                    {/* RESULTADO ANTES IMPUESTO */}
                    <SubtotalRow
                        label="(=) Res. antes de Impuestos"
                        amount={data.resultadoAntesImpuesto}
                        comparativeAmount={comparative?.resultadoAntesImpuesto}
                        showComparative={showComparative}
                        type="pretax"
                    />

                    {/* IMPUESTO */}
                    {data.impuestoGanancias > 0 && (
                        <SimpleRow
                            label="Impuesto a las ganancias"
                            amount={data.impuestoGanancias}
                            comparativeAmount={comparative?.impuestoGanancias}
                            showComparative={showComparative}
                            isSubtraction
                        />
                    )}
                </div>

                {/* Final Result */}
                <FinalResultBox
                    resultadoNeto={data.resultadoNeto}
                    comparativeResultado={comparative?.resultadoNeto}
                    showComparative={showComparative}
                    yoyChange={data.yoyChange}
                    isGain={data.isGain}
                />

                {/* Footer */}
                <footer className="er-footer">
                    <div className="er-signatures">
                        <div className="er-signature">
                            <div className="er-signature-line" />
                            <p>Firma del Presidente</p>
                        </div>
                        <div className="er-signature">
                            <div className="er-signature-line" />
                            <p>Firma del Contador Público</p>
                        </div>
                    </div>
                    <div className="er-footer-notes">
                        <p>El presente estado contable debe leerse conjuntamente con las notas y anexos que lo acompañan.</p>
                        <p>Página 1/1 — Emitido el {emisionDate}</p>
                    </div>
                </footer>
            </main>

            {/* Styles */}
            <style>{styles}</style>
        </div>
    )
}

// ============================================
// Component Styles
// ============================================

const styles = `
/* Container */
.er-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-bottom: 80px;
    min-height: 100vh;
}

.er-container.er-print-preview {
    background-color: #525252;
}

/* Toolbar */
.er-toolbar {
    position: sticky;
    top: 16px;
    z-index: 50;
    margin-bottom: 24px;
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.er-toolbar-inner {
    display: flex;
    align-items: center;
    gap: 24px;
    background: rgba(255, 255, 255, 0.90);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(226, 232, 240, 1);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    border-radius: 9999px;
    padding: 12px 24px;
}

.er-toolbar-group {
    display: flex;
    align-items: center;
    gap: 16px;
}

.er-toolbar-toggles {
    border-right: 1px solid rgba(226, 232, 240, 1);
    padding-right: 16px;
}

.er-toolbar-actions {
    border-left: 1px solid rgba(226, 232, 240, 1);
    padding-left: 16px;
    gap: 12px;
}

.er-toolbar-icon {
    color: #94a3b8;
}

/* Toggle Switch */
.er-toggle-container {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.er-toggle-wrapper {
    position: relative;
    width: 40px;
    height: 20px;
}

.er-toggle-checkbox {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
}

.er-toggle-label {
    display: block;
    width: 100%;
    height: 100%;
    background-color: #cbd5e1;
    border-radius: 9999px;
    cursor: pointer;
    transition: background-color 0.3s;
}

.er-toggle-label::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform 0.3s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.er-toggle-checkbox:checked + .er-toggle-label {
    background-color: #10B981;
}

.er-toggle-checkbox:checked + .er-toggle-label::after {
    transform: translateX(20px);
}

.er-toggle-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #475569;
    font-family: var(--font-display);
}

/* Year Select */
.er-year-select {
    background: transparent;
    border: none;
    font-size: 0.875rem;
    font-weight: 600;
    color: #334155;
    cursor: pointer;
    font-family: var(--font-display);
    padding-right: 8px;
}

.er-year-select:focus {
    outline: none;
}

/* Buttons */
.er-btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    color: #64748b;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s;
}

.er-btn-icon:hover {
    color: #3B82F6;
    background: rgba(59, 130, 246, 0.1);
}

.er-btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #2563EB 0%, #10B981 100%);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
    transition: all 0.2s;
}

.er-btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
}

.er-btn-primary:active {
    transform: translateY(0);
}

/* Paper */
.er-paper {
    background: white;
    width: 100%;
    max-width: 620px;
    min-height: 800px;
    padding: 40px 48px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    border-radius: 16px;
    border: 1px solid rgba(241, 245, 249, 1);
    position: relative;
    animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.er-print-preview .er-paper {
    box-shadow: none;
}

/* Header */
.er-header {
    text-align: center;
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 1px solid rgba(241, 245, 249, 1);
}

.er-title {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.875rem;
    color: #0f172a;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
}

.er-subtitle {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 0.875rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
}

.er-currency-note {
    font-family: var(--font-body);
    font-size: 0.75rem;
    color: #94a3b8;
    font-style: italic;
    margin: 8px 0 0 0;
}

/* Column Headers */
.er-column-headers {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid rgba(241, 245, 249, 1);
    font-size: 0.75rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    position: sticky;
    top: 0;
    background: white;
    z-index: 10;
}

.er-column-headers:not(:has(.er-comparative)) {
    grid-template-columns: 1fr 1fr;
}

.er-col-label {
    grid-column: span 1;
    padding-left: 8px;
}

.er-col-amount {
    text-align: right;
    padding-right: 8px;
}

/* Body */
.er-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.875rem;
}

/* Section Group */
.er-section-group {
    margin-top: 8px;
}

/* Section Header (clickable) */
.er-section-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s;
    align-items: center;
}

.er-section-header:not(:has(.er-comparative)) {
    grid-template-columns: 1fr 1fr;
}

.er-section-header:hover {
    background-color: #f8fafc;
}

.er-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-weight: 600;
    color: #1e293b;
}

.er-section-amount {
    font-family: var(--font-mono);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
}

/* Caret Icon */
.er-caret-icon {
    color: #cbd5e1;
    transition: transform 0.2s;
    flex-shrink: 0;
}

.er-caret-collapsed {
    transform: rotate(-90deg);
}

/* Details Container */
.er-details-container {
    overflow: hidden;
    max-height: 500px;
    opacity: 1;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.er-details-container.er-collapsed {
    max-height: 0;
    opacity: 0;
    padding: 0;
}

/* Detail Row */
.er-detail-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    padding: 4px 8px;
}

.er-detail-row:not(:has(.er-comparative)) {
    grid-template-columns: 1fr 1fr;
}

.er-detail-label {
    padding-left: 32px;
    font-size: 0.75rem;
    color: #475569;
}

.er-detail-amount {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: #475569;
}

/* Comparative (muted) */
.er-comparative {
    color: #94a3b8 !important;
}

/* Negative amounts */
.er-negative {
    color: #ef4444 !important;
}

/* Subtotal Rows */
.er-subtotal-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    padding: 12px;
    margin: 16px 0;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    background: rgba(248, 250, 252, 0.5);
    border-radius: 4px;
    align-items: center;
}

.er-subtotal-row:not(:has(.er-comparative)) {
    grid-template-columns: 1fr 1fr;
}

.er-subtotal-label {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0f172a;
}

.er-subtotal-amount {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
}

.er-subtotal-gross {
    background: rgba(248, 250, 252, 0.5);
    border-left: 4px solid #94a3b8;
}

.er-subtotal-operating {
    background: #f1f5f9;
    border-left: 4px solid #475569;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.er-subtotal-pretax {
    background: #f8fafc;
}

/* Simple Row */
.er-simple-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    padding: 8px;
    font-family: var(--font-display);
    font-weight: 500;
    color: #475569;
    align-items: center;
}

.er-simple-row:not(:has(.er-comparative)) {
    grid-template-columns: 1fr 1fr;
}

/* Operating Expenses Group */
.er-operating-expenses {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

/* Final Result Box */
.er-final-result {
    margin-top: 32px;
    padding: 24px;
    border-radius: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    overflow: hidden;
    border: 1px solid transparent;
}

.er-final-result::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 6px;
    height: 100%;
    background: linear-gradient(180deg, #3B82F6 0%, #10B981 100%);
}

.er-final-result.er-gain {
    background: linear-gradient(to right, #f0fdf4, #dcfce7);
    border-color: #bbf7d0;
}

.er-final-result.er-loss {
    background: linear-gradient(to right, #fef2f2, #fee2e2);
    border-color: #fecaca;
}

.er-final-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.er-final-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #64748b;
}

.er-final-badge {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
}

.er-gain .er-final-badge {
    color: #166534;
}

.er-loss .er-final-badge {
    color: #991b1b;
}

.er-final-amounts {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
}

.er-final-primary {
    display: flex;
    align-items: center;
    gap: 8px;
}

.er-final-amount {
    font-family: var(--font-mono);
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #0f172a;
}

.er-final-comparative {
    font-family: var(--font-mono);
    font-size: 1.125rem;
    font-weight: 700;
    color: #94a3b8;
}

.er-yoy-chip {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.625rem;
    font-weight: 700;
}

.er-yoy-positive {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
}

.er-yoy-negative {
    background: rgba(239, 68, 68, 0.15);
    color: #dc2626;
}

/* Footer */
.er-footer {
    margin-top: 48px;
    padding-top: 32px;
    border-top: 1px solid #e2e8f0;
}

.er-signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
}

.er-signature {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: #94a3b8;
}

.er-signature p {
    margin: 0;
}

.er-signature-line {
    width: 128px;
    border-bottom: 1px solid #cbd5e1;
    margin-bottom: 8px;
}

.er-footer-notes {
    margin-top: 16px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: #94a3b8;
}

.er-footer-notes p {
    margin: 4px 0;
}

/* Animation */
@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Print Styles */
@media print {
    .no-print {
        display: none !important;
    }
    
    .er-container {
        padding: 0;
        min-height: auto;
    }
    
    .er-paper {
        box-shadow: none;
        max-width: 100%;
        width: 100%;
        padding: 0;
        margin: 0;
        border: none;
        border-radius: 0;
    }
    
    .er-negative {
        color: black !important;
        font-weight: normal;
    }
    
    .er-comparative {
        color: #666 !important;
    }
    
    .er-final-result::before {
        display: none;
    }
    
    .er-gain,
    .er-loss {
        background: none !important;
        border: 1px solid #000;
    }
    
    .er-gain .er-final-badge,
    .er-loss .er-final-badge {
        color: black;
    }
    
    .er-yoy-chip {
        display: none;
    }
    
    .er-caret-icon {
        display: none;
    }
    
    .er-section-header:hover {
        background: none;
    }
    
    .er-subtotal-row {
        background: none !important;
    }
    
    @page {
        size: A4;
        margin: 15mm;
    }
    
    /* Avoid page breaks in subtotals */
    .er-subtotal-row,
    .er-final-result {
        break-inside: avoid;
    }
}
`

export default EstadoResultadosDocument
