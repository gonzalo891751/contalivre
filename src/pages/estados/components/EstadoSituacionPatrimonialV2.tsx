/**
 * Estado de Situación Patrimonial V2
 * Pixel-perfect implementation based on ESP2.html prototype
 */
import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
    BalanceSheetViewModel,
    Rubro
} from '../adapters/balanceSheetViewModel'
import {
    filterVisibleRubros,
    exportBalanceSheetToCSV
} from '../adapters/balanceSheetViewModel'
import { BalanceSheetDrawer } from './BalanceSheetDrawer'
import { BalanceSheetPrintView } from './BalanceSheetPrintView'
import { formatCurrencyARS } from '../../../core/amortizaciones/calc'

// ============================================
// Props
// ============================================

interface EstadoSituacionPatrimonialV2Props {
    viewModel: BalanceSheetViewModel
    showComparative: boolean
    onToggleComparative: (value: boolean) => void
    hasComparativeData: boolean
    onImportClick: () => void
}

// ============================================
// Helpers
// ============================================

function formatDelta(current: number, prev: number | null): { text: string; class: string } {
    if (prev === null || prev === 0) {
        if (current === 0) return { text: '', class: '' }
        return { text: '—', class: 'delta-neutral' }
    }
    const diff = ((current - prev) / Math.abs(prev)) * 100
    const sign = diff > 0 ? '+' : ''
    const text = `${sign}${diff.toFixed(1)}%`
    const cls = diff > 0 ? 'delta-positive' : diff < 0 ? 'delta-negative' : 'delta-neutral'
    return { text, class: cls }
}

// ============================================
// Subcomponents
// ============================================

interface RubroRowProps {
    rubro: Rubro
    showComparative: boolean
    currentYear: number
    prevYear: number
    onClick: () => void
}

function RubroRow({ rubro, showComparative, currentYear, prevYear, onClick }: RubroRowProps) {
    const delta = showComparative ? formatDelta(rubro.currentAmount, rubro.prevAmount) : null

    return (
        <div className="esp2-rubro-row group" onClick={onClick}>
            {/* Label and Note */}
            <div className="esp2-rubro-label">
                <i className="ph-bold ph-caret-right esp2-caret"></i>
                <span className="esp2-rubro-name">{rubro.label}</span>
                {rubro.noteNumber && (
                    <span className="esp2-note-badge">Nota {rubro.noteNumber}</span>
                )}
            </div>

            {/* Values */}
            {showComparative ? (
                <div className="esp2-rubro-values-comparative">
                    <div className="esp2-value-cell">
                        <span className="esp2-mobile-label">{currentYear}</span>
                        <span className="esp2-amount">{formatCurrencyARS(rubro.currentAmount)}</span>
                    </div>
                    <div className="esp2-value-cell">
                        <span className="esp2-mobile-label">{prevYear}</span>
                        <span className="esp2-amount esp2-amount-prev">
                            {formatCurrencyARS(rubro.prevAmount ?? 0)}
                        </span>
                    </div>
                    <div className="esp2-value-cell esp2-delta-cell">
                        {delta && delta.text && (
                            <span className={`esp2-delta-pill ${delta.class}`}>
                                {delta.text}
                                {delta.class === 'delta-positive' && <i className="ph-bold ph-trend-up"></i>}
                                {delta.class === 'delta-negative' && <i className="ph-bold ph-trend-down"></i>}
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="esp2-rubro-value-single">
                    <span className="esp2-amount">{formatCurrencyARS(rubro.currentAmount)}</span>
                </div>
            )}
        </div>
    )
}

interface SectionCardProps {
    title: string
    icon: string
    iconColor: 'green' | 'red' | 'blue'
    rubros: { corriente: Rubro[]; noCorriente: Rubro[] }
    totalLabel: string
    totalAmount: number
    showComparative: boolean
    currentYear: number
    prevYear: number
    onRubroClick: (rubro: Rubro) => void
}

function SectionCard({
    title,
    icon,
    iconColor,
    rubros,
    totalLabel,
    totalAmount,
    showComparative,
    currentYear,
    prevYear,
    onRubroClick
}: SectionCardProps) {
    const visibleCorriente = filterVisibleRubros(rubros.corriente, showComparative)
    const visibleNoCorriente = filterVisibleRubros(rubros.noCorriente, showComparative)

    const corrienteTotal = visibleCorriente.reduce((s, r) => s + r.currentAmount, 0)
    const noCorrienteTotal = visibleNoCorriente.reduce((s, r) => s + r.currentAmount, 0)

    const iconColorClass = {
        green: 'text-brand-secondary',
        red: 'text-red-500',
        blue: 'text-brand-primary'
    }[iconColor]

    return (
        <div className="esp2-section-card">
            {/* Header */}
            <div className="esp2-section-header">
                <h2 className="esp2-section-title">
                    <i className={`ph-duotone ${icon} ${iconColorClass}`}></i>
                    {title}
                </h2>
                <span className="esp2-section-total-header">
                    {formatCurrencyARS(totalAmount)}
                </span>
            </div>

            {/* Corriente Section */}
            {visibleCorriente.length > 0 && (
                <div className="esp2-subsection">
                    <div className="esp2-subsection-header">
                        <span className="esp2-subsection-title">{title} Corriente</span>
                    </div>

                    {/* Column Headers (Comparative Mode) */}
                    {showComparative && (
                        <div className="esp2-column-headers">
                            <div className="esp2-col-rubro">Rubro</div>
                            <div className="esp2-col-current">{currentYear}</div>
                            <div className="esp2-col-prev">{prevYear}</div>
                            <div className="esp2-col-delta">Δ</div>
                        </div>
                    )}

                    <div className="esp2-rubros-list">
                        {visibleCorriente.map(rubro => (
                            <RubroRow
                                key={rubro.id}
                                rubro={rubro}
                                showComparative={showComparative}
                                currentYear={currentYear}
                                prevYear={prevYear}
                                onClick={() => onRubroClick(rubro)}
                            />
                        ))}
                    </div>

                    {/* Subtotal */}
                    <div className="esp2-subtotal-row">
                        <span className="esp2-subtotal-label">Total {title} Corriente</span>
                        <span className="esp2-subtotal-amount">{formatCurrencyARS(corrienteTotal)}</span>
                    </div>
                </div>
            )}

            {/* Divider */}
            {visibleCorriente.length > 0 && visibleNoCorriente.length > 0 && (
                <hr className="esp2-divider" />
            )}

            {/* No Corriente Section */}
            {visibleNoCorriente.length > 0 && (
                <div className="esp2-subsection">
                    <div className="esp2-subsection-header">
                        <span className="esp2-subsection-title">{title} No Corriente</span>
                    </div>

                    {/* Column Headers (Comparative Mode) */}
                    {showComparative && (
                        <div className="esp2-column-headers">
                            <div className="esp2-col-rubro">Rubro</div>
                            <div className="esp2-col-current">{currentYear}</div>
                            <div className="esp2-col-prev">{prevYear}</div>
                            <div className="esp2-col-delta">Δ</div>
                        </div>
                    )}

                    <div className="esp2-rubros-list">
                        {visibleNoCorriente.map(rubro => (
                            <RubroRow
                                key={rubro.id}
                                rubro={rubro}
                                showComparative={showComparative}
                                currentYear={currentYear}
                                prevYear={prevYear}
                                onClick={() => onRubroClick(rubro)}
                            />
                        ))}
                    </div>

                    {/* Subtotal */}
                    <div className="esp2-subtotal-row">
                        <span className="esp2-subtotal-label">Total {title} No Corriente</span>
                        <span className="esp2-subtotal-amount">{formatCurrencyARS(noCorrienteTotal)}</span>
                    </div>
                </div>
            )}

            {/* Footer Total */}
            <div className="esp2-section-footer">
                <span className="esp2-footer-label">{totalLabel}</span>
                <span className="esp2-footer-amount">{formatCurrencyARS(totalAmount)}</span>
            </div>
        </div>
    )
}

interface PNCardProps {
    rubros: Rubro[]
    totalPN: number
    totalPasivoPN: number
    isBalanced: boolean
    diff: number
    showComparative: boolean
    currentYear: number
    prevYear: number
    onRubroClick: (rubro: Rubro) => void
}

function PNCard({
    rubros,
    totalPN,
    totalPasivoPN,
    isBalanced,
    diff,
    showComparative,
    currentYear,
    prevYear,
    onRubroClick
}: PNCardProps) {
    const visibleRubros = filterVisibleRubros(rubros, showComparative)

    return (
        <div className="esp2-section-card">
            {/* Header */}
            <div className="esp2-section-header">
                <h2 className="esp2-section-title">
                    <i className="ph-duotone ph-scales text-brand-primary"></i>
                    Patrimonio Neto
                </h2>
                <span className="esp2-section-total-header">
                    {formatCurrencyARS(totalPN)}
                </span>
            </div>

            {/* Rubros */}
            <div className="esp2-subsection">
                {showComparative && visibleRubros.length > 0 && (
                    <div className="esp2-column-headers">
                        <div className="esp2-col-rubro">Rubro</div>
                        <div className="esp2-col-current">{currentYear}</div>
                        <div className="esp2-col-prev">{prevYear}</div>
                        <div className="esp2-col-delta">Δ</div>
                    </div>
                )}

                <div className="esp2-rubros-list">
                    {visibleRubros.map(rubro => (
                        <RubroRow
                            key={rubro.id}
                            rubro={rubro}
                            showComparative={showComparative}
                            currentYear={currentYear}
                            prevYear={prevYear}
                            onClick={() => onRubroClick(rubro)}
                        />
                    ))}
                </div>
            </div>

            {/* Total Pasivo + PN Footer */}
            <div className="esp2-section-footer esp2-footer-dark">
                <div className="esp2-footer-main">
                    <span className="esp2-footer-label">Total Pasivo + PN</span>
                    <span className="esp2-footer-amount">{formatCurrencyARS(totalPasivoPN)}</span>
                </div>
                {/* Integrity Check */}
                <div className={`esp2-integrity-chip ${isBalanced ? 'balanced' : 'unbalanced'}`}>
                    {isBalanced ? (
                        <>
                            <i className="ph-fill ph-check-circle"></i>
                            Balanceado correctamente
                        </>
                    ) : (
                        <>
                            <i className="ph-fill ph-warning-circle"></i>
                            Diferencia: {formatCurrencyARS(diff)}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ============================================
// Main Component
// ============================================

export function EstadoSituacionPatrimonialV2({
    viewModel,
    showComparative,
    onToggleComparative,
    hasComparativeData,
    onImportClick
}: EstadoSituacionPatrimonialV2Props) {
    const navigate = useNavigate()
    const printRef = useRef<HTMLDivElement>(null)

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [selectedRubro, setSelectedRubro] = useState<Rubro | null>(null)
    const [dropdownOpen, setDropdownOpen] = useState(false)

    const { meta, integrity, sections, totals } = viewModel

    const handleRubroClick = useCallback((rubro: Rubro) => {
        setSelectedRubro(rubro)
        setDrawerOpen(true)
    }, [])

    const handleCloseDrawer = useCallback(() => {
        setDrawerOpen(false)
        setSelectedRubro(null)
    }, [])

    const handleToggleChange = useCallback(() => {
        const newValue = !showComparative
        onToggleComparative(newValue)
    }, [showComparative, onToggleComparative])

    const handleExportCSV = useCallback(() => {
        exportBalanceSheetToCSV({
            viewModel,
            showComparative
        })
        setDropdownOpen(false)
    }, [viewModel, showComparative])

    const handlePrint = useCallback(() => {
        // Set print comparative attribute
        document.body.setAttribute('data-print-comparative', String(showComparative))
        window.print()
        setDropdownOpen(false)
    }, [showComparative])

    const handleOfficialReport = useCallback(() => {
        // Force comparative ON for official report
        const wasComparative = showComparative
        if (!wasComparative) {
            onToggleComparative(true)
        }

        // Print after short delay for state update
        setTimeout(() => {
            document.body.setAttribute('data-print-comparative', 'true')

            // Restore state after print
            if (!wasComparative) {
                window.addEventListener('afterprint', function restoreState() {
                    onToggleComparative(false)
                    window.removeEventListener('afterprint', restoreState)
                }, { once: true })
            }

            window.print()
        }, 100)
    }, [showComparative, onToggleComparative])

    const handleGoToAccounts = useCallback(() => {
        navigate('/cuentas')
    }, [navigate])

    return (
        <div className="esp2-wrapper">
            {/* Integrity Banner (P0) */}
            {integrity.unmappedAccountsCount > 0 && (
                <div className="esp2-integrity-banner">
                    <i className="ph-fill ph-warning text-orange-500"></i>
                    <div className="esp2-banner-content">
                        <h4>Hay cuentas sin asignar a rubros</h4>
                        <p>
                            Encontramos <strong>{integrity.unmappedAccountsCount}</strong> cuentas
                            con saldo que no pertenecen a ningún rubro del balance. Esto afecta los totales.
                        </p>
                    </div>
                    <div className="esp2-banner-actions">
                        <button
                            className="esp2-banner-btn-secondary"
                            onClick={() => {
                                setSelectedRubro({
                                    id: '__unmapped__',
                                    statementGroup: 'UNMAPPED',
                                    label: 'Cuentas sin Rubro Asignado',
                                    currentAmount: 0,
                                    prevAmount: null,
                                    accounts: integrity.unmappedAccounts.map(ua => ({
                                        code: ua.code,
                                        name: ua.name,
                                        amount: ua.balance,
                                        isContra: false
                                    }))
                                })
                                setDrawerOpen(true)
                            }}
                        >
                            Ver cuentas
                        </button>
                        <button className="esp2-banner-btn-primary" onClick={handleGoToAccounts}>
                            Ir a Plan de Cuentas
                        </button>
                    </div>
                </div>
            )}

            {/* Page Header */}
            <header className="esp2-header">
                <div className="esp2-header-info">
                    <h1 className="esp2-main-title">Estado de Situación Patrimonial</h1>
                    <p className="esp2-subtitle">Balance general al cierre del ejercicio.</p>
                </div>

                {/* Toolbar */}
                <div className="esp2-toolbar">
                    {/* Period Chips */}
                    <div className="esp2-period-chips">
                        <div className="esp2-chip">
                            Actual: <strong>{meta.ejercicioActual}</strong>
                        </div>
                        <div className="esp2-chip">
                            Anterior: <strong>{meta.ejercicioAnterior}</strong>
                        </div>
                    </div>

                    {/* Toggle Comparative */}
                    <label className="esp2-toggle-wrapper">
                        <div
                            className={`esp2-toggle-bg ${showComparative ? 'active' : ''}`}
                            onClick={handleToggleChange}
                        >
                            <span className={`esp2-toggle-dot ${showComparative ? 'active' : ''}`}></span>
                        </div>
                        <span className="esp2-toggle-label">Comparar períodos</span>
                    </label>

                    {/* Export Dropdown */}
                    <div className="esp2-dropdown-wrapper">
                        <button
                            className="esp2-btn-secondary"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                        >
                            <i className="ph ph-export"></i>
                            Exportar
                            <i className="ph-bold ph-caret-down"></i>
                        </button>
                        {dropdownOpen && (
                            <>
                                <div className="esp2-dropdown-backdrop" onClick={() => setDropdownOpen(false)}></div>
                                <div className="esp2-dropdown-menu">
                                    <button onClick={handlePrint}>
                                        <i className="ph ph-printer"></i>
                                        Imprimir / PDF
                                    </button>
                                    <button onClick={handleExportCSV}>
                                        <i className="ph ph-file-csv"></i>
                                        Descargar CSV
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Official Report Button */}
                    <button className="esp2-btn-dark" onClick={handleOfficialReport}>
                        <i className="ph-bold ph-file-text"></i>
                        Reporte Oficial
                    </button>

                    {/* Import Comparative */}
                    {!hasComparativeData && (
                        <button className="esp2-btn-primary" onClick={onImportClick}>
                            <i className="ph ph-upload-simple"></i>
                            Importar comparativo
                        </button>
                    )}
                </div>
            </header>

            {/* Main Grid */}
            <main className="esp2-grid">
                {/* Left Column: ACTIVO */}
                <section className="esp2-column">
                    <SectionCard
                        title="Activo"
                        icon="ph-arrow-fat-lines-up"
                        iconColor="green"
                        rubros={sections.activo}
                        totalLabel="Total del Activo"
                        totalAmount={totals.totalActivo}
                                                showComparative={showComparative && hasComparativeData}
                        currentYear={meta.ejercicioActual}
                        prevYear={meta.ejercicioAnterior}
                        onRubroClick={handleRubroClick}
                    />
                </section>

                {/* Right Column: PASIVO + PN */}
                <section className="esp2-column esp2-column-stack">
                    {/* Pasivo */}
                    <SectionCard
                        title="Pasivo"
                        icon="ph-arrow-fat-lines-down"
                        iconColor="red"
                        rubros={sections.pasivo}
                        totalLabel="Total Pasivo"
                        totalAmount={totals.totalPasivo}
                                                showComparative={showComparative && hasComparativeData}
                        currentYear={meta.ejercicioActual}
                        prevYear={meta.ejercicioAnterior}
                        onRubroClick={handleRubroClick}
                    />

                    {/* Patrimonio Neto */}
                    <PNCard
                        rubros={sections.patrimonioNeto}
                        totalPN={totals.totalPN}
                        totalPasivoPN={totals.totalPasivoPN}
                                                isBalanced={integrity.isBalanced}
                        diff={integrity.diff}
                        showComparative={showComparative && hasComparativeData}
                        currentYear={meta.ejercicioActual}
                        prevYear={meta.ejercicioAnterior}
                        onRubroClick={handleRubroClick}
                    />
                </section>
            </main>

            {/* Drawer */}
            <BalanceSheetDrawer
                isOpen={drawerOpen}
                onClose={handleCloseDrawer}
                rubro={selectedRubro}
            />

            {/* Print View (Hidden) */}
            <BalanceSheetPrintView
                ref={printRef}
                viewModel={viewModel}
                showComparative={showComparative && hasComparativeData}
            />

            {/* Styles */}
            <style>{espV2Styles}</style>
        </div>
    )
}

// ============================================
// Styles
// ============================================

const espV2Styles = `
/* ============================================
   ESP V2 Styles (Pixel-perfect from prototype)
   ============================================ */

.esp2-wrapper {
    min-height: 100%;
}

/* ---- Integrity Banner ---- */
.esp2-integrity-banner {
    background: #fffbeb;
    border-bottom: 1px solid #fde68a;
    padding: 12px 24px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.esp2-integrity-banner > i {
    font-size: 1.25rem;
    margin-top: 2px;
}

.esp2-banner-content {
    flex: 1;
}

.esp2-banner-content h4 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #92400e;
    margin: 0;
}

.esp2-banner-content p {
    font-size: 0.875rem;
    color: #a16207;
    margin: 4px 0 0;
}

.esp2-banner-actions {
    display: flex;
    gap: 8px;
}

.esp2-banner-btn-secondary {
    font-size: 0.75rem;
    font-weight: 600;
    background: white;
    border: 1px solid #fde68a;
    color: #92400e;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.esp2-banner-btn-secondary:hover {
    background: #fef3c7;
}

.esp2-banner-btn-primary {
    font-size: 0.75rem;
    font-weight: 600;
    background: #f59e0b;
    border: none;
    color: white;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.esp2-banner-btn-primary:hover {
    background: #d97706;
}

/* ---- Header ---- */
.esp2-header {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
    padding: 0 8px;
}

@media (min-width: 1024px) {
    .esp2-header {
        flex-direction: row;
        justify-content: space-between;
        align-items: flex-end;
    }
}

.esp2-header-info {
    flex: 1;
}

.esp2-main-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.75rem;
    font-weight: 800;
    background: linear-gradient(135deg, #2563EB 0%, #10B981 100%);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0 0 4px;
}

@media (min-width: 768px) {
    .esp2-main-title {
        font-size: 2.25rem;
    }
}

.esp2-subtitle {
    color: #64748b;
    font-size: 1rem;
    margin: 0;
}

/* ---- Toolbar ---- */
.esp2-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.esp2-period-chips {
    display: none;
    gap: 8px;
}

@media (min-width: 768px) {
    .esp2-period-chips {
        display: flex;
    }
}

.esp2-chip {
    font-size: 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    color: #64748b;
    padding: 6px 10px;
    border-radius: 6px;
    font-weight: 500;
}

.esp2-chip strong {
    color: #0f172a;
}

/* Toggle */
.esp2-toggle-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;
    background: white;
    padding: 10px 16px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    cursor: pointer;
    user-select: none;
    transition: border-color 0.15s ease;
}

.esp2-toggle-wrapper:hover {
    border-color: rgba(59, 130, 246, 0.5);
}

.esp2-toggle-bg {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 9999px;
    background: #cbd5e1;
    transition: background-color 0.2s ease;
}

.esp2-toggle-bg.active {
    background: #10B981;
}

.esp2-toggle-dot {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.esp2-toggle-dot.active {
    transform: translateX(16px);
}

.esp2-toggle-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #0f172a;
}

/* Buttons */
.esp2-btn-secondary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #0f172a;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: all 0.15s ease;
}

.esp2-btn-secondary:hover {
    background: #f8fafc;
}

.esp2-btn-dark {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #0f172a;
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.25);
    transition: all 0.15s ease;
}

.esp2-btn-dark:hover {
    background: #1e293b;
    transform: translateY(-1px);
}

.esp2-btn-primary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #2563EB 0%, #10B981 100%);
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
    transition: all 0.2s ease;
}

.esp2-btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
}

/* Dropdown */
.esp2-dropdown-wrapper {
    position: relative;
}

.esp2-dropdown-backdrop {
    position: fixed;
    inset: 0;
    z-index: 15;
}

.esp2-dropdown-menu {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 8px;
    width: 200px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    z-index: 20;
    overflow: hidden;
    padding: 4px;
}

.esp2-dropdown-menu button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: none;
    background: none;
    font-size: 0.875rem;
    color: #0f172a;
    cursor: pointer;
    border-radius: 8px;
    transition: all 0.15s ease;
}

.esp2-dropdown-menu button:hover {
    background: #f8fafc;
    color: #3B82F6;
}

/* ---- Main Grid ---- */
.esp2-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    align-items: start;
}

@media (min-width: 1024px) {
    .esp2-grid {
        grid-template-columns: 1fr 1fr;
    }
}

.esp2-column {
    display: flex;
    flex-direction: column;
}

.esp2-column-stack {
    gap: 24px;
}

/* ---- Section Card ---- */
.esp2-section-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    border: 1px solid #e2e8f0;
    overflow: hidden;
}

.esp2-section-header {
    padding: 20px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(248, 250, 252, 0.8);
}

.esp2-section-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.esp2-section-title i {
    font-size: 1.5rem;
}

.text-brand-secondary { color: #10B981; }
.text-brand-primary { color: #3B82F6; }
.text-red-500 { color: #ef4444; }

.esp2-section-total-header {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-weight: 700;
    font-size: 1.125rem;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
}

/* Subsections */
.esp2-subsection {
    padding: 8px;
}

.esp2-subsection-header {
    padding: 8px 12px;
}

.esp2-subsection-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
}

.esp2-divider {
    border: 0;
    border-top: 1px solid #e2e8f0;
    margin: 8px 0;
}

/* Column Headers (Comparative) */
.esp2-column-headers {
    display: none;
    padding: 8px 12px;
    border-bottom: 1px dashed #e2e8f0;
    margin-bottom: 8px;
}

@media (min-width: 1024px) {
    .esp2-column-headers {
        display: grid;
        grid-template-columns: 1fr 140px 140px 90px;
        gap: 16px;
    }
}

.esp2-column-headers > div {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
}

.esp2-col-current,
.esp2-col-prev {
    text-align: right;
}

.esp2-col-delta {
    text-align: center;
}

/* Rubros List */
.esp2-rubros-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

/* Rubro Row */
.esp2-rubro-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
}

.esp2-rubro-row:hover {
    background: #f8fafc;
    border-color: #f1f5f9;
}

.esp2-rubro-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
}

.esp2-caret {
    color: #3B82F6;
    opacity: 0;
    transition: opacity 0.15s ease;
    font-size: 0.875rem;
    display: none;
}

@media (min-width: 1024px) {
    .esp2-caret {
        display: block;
    }
}

.esp2-rubro-row:hover .esp2-caret {
    opacity: 1;
}

.esp2-rubro-name {
    font-weight: 500;
    color: #0f172a;
    transition: color 0.15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.esp2-rubro-row:hover .esp2-rubro-name {
    color: #3B82F6;
}

.esp2-note-badge {
    font-size: 0.625rem;
    font-weight: 700;
    background: #f1f5f9;
    color: #64748b;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
    flex-shrink: 0;
}

/* Values */
.esp2-rubro-value-single {
    flex-shrink: 0;
}

.esp2-rubro-values-comparative {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: right;
}

@media (min-width: 1024px) {
    .esp2-rubro-values-comparative {
        display: grid;
        grid-template-columns: 140px 140px 90px;
        gap: 16px;
        align-items: center;
    }
}

.esp2-value-cell {
    display: flex;
    flex-direction: column;
    text-align: right;
}

@media (min-width: 1024px) {
    .esp2-value-cell {
        display: block;
    }
}

.esp2-mobile-label {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 2px;
}

@media (min-width: 1024px) {
    .esp2-mobile-label {
        display: none;
    }
}

.esp2-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-weight: 600;
    font-size: 0.9375rem;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
}

.esp2-amount-prev {
    color: #64748b;
    font-size: 0.875rem;
}

.esp2-delta-cell {
    display: flex;
    justify-content: flex-end;
}

@media (min-width: 1024px) {
    .esp2-delta-cell {
        justify-content: center;
    }
}

.esp2-delta-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.625rem;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 9999px;
    border: 1px solid;
}

.esp2-delta-pill.delta-positive {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #16a34a;
}

.esp2-delta-pill.delta-negative {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
}

.esp2-delta-pill.delta-neutral {
    background: #f8fafc;
    border-color: #e2e8f0;
    color: #64748b;
}

/* Subtotal Row */
.esp2-subtotal-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    margin-top: 8px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px dashed #e2e8f0;
}

.esp2-subtotal-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #64748b;
}

.esp2-subtotal-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-weight: 700;
    color: #0f172a;
}

/* Section Footer */
.esp2-section-footer {
    padding: 20px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.esp2-section-footer.esp2-footer-dark {
    background: #0f172a;
    flex-direction: column;
    gap: 8px;
}

.esp2-footer-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
}

.esp2-footer-dark .esp2-footer-label,
.esp2-footer-dark .esp2-footer-amount {
    color: white;
}

.esp2-footer-label {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1rem;
    font-weight: 700;
}

.esp2-footer-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
}

/* Integrity Chip */
.esp2-integrity-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    opacity: 0.8;
}

.esp2-integrity-chip.balanced {
    color: #34d399;
}

.esp2-integrity-chip.unbalanced {
    color: #fca5a5;
}

.esp2-integrity-chip i {
    font-size: 1.125rem;
}

/* ---- Print Styles ---- */
@media print {
    .esp2-wrapper {
        display: none !important;
    }
}
`

export default EstadoSituacionPatrimonialV2
