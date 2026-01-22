import React from 'react'
import {
    Download,
    TrendingUp,
    TrendingDown,
    Building2,
    Scale,
    CheckCircle2,
    AlertCircle,
    Share2
} from 'lucide-react'
import { formatCurrencyARS } from '../../core/amortizaciones/calc'

// ============================================
// Types
// ============================================

export type AccountLine = {
    id: string
    code?: string
    label: string
    amount: number
    level: 1 | 2 | 3
    isTotal?: boolean
    isContra?: boolean
    comparativeAmount?: number
}

export type SectionData = {
    title: string
    items: AccountLine[]
}

interface EstadoSituacionPatrimonialGeminiProps {
    loading: boolean
    entidad: string
    fechaCorte: string
    activoSections: SectionData[]
    pasivoSections: SectionData[]
    patrimonioNetoSection: SectionData
    totalActivo: number
    totalPasivo: number
    totalPN: number
    isBalanced: boolean
    diff: number
    onExportPdf: () => Promise<void>
    isExporting: boolean
    pdfRef?: React.Ref<HTMLDivElement>
    // Comparative props
    showComparative?: boolean
    comparativeYear?: number
    currentYear?: number
    comparativeTotalActivo?: number
    comparativeTotalPasivo?: number
    comparativeTotalPN?: number
}

// ============================================
// Subcomponents
// ============================================

const AccountRow = ({ item, showComparative = false }: { item: AccountLine; showComparative?: boolean }) => {
    const isHeader = item.level === 1
    const isTotal = item.isTotal

    const paddingLeft = item.level === 1 ? 'pl-0' : item.level === 2 ? 'pl-4' : 'pl-8'
    const fontSize = isHeader || isTotal ? 'row-header' : 'row-normal'
    const textColor = isHeader ? 'row-title' : item.isContra ? 'row-contra' : 'row-default'

    // Calculate variation
    const hasComparative = showComparative && item.comparativeAmount !== undefined
    let varPercent: string | null = null
    let varClass = ''

    if (hasComparative) {
        const compAmount = item.comparativeAmount!
        if (compAmount === 0 && item.amount > 0) {
            varPercent = 'NEW'
            varClass = 'var-new'
        } else if (item.amount === 0 && compAmount > 0) {
            varPercent = '—'
            varClass = 'var-neutral'
        } else if (compAmount !== 0) {
            const pct = ((item.amount - compAmount) / Math.abs(compAmount)) * 100
            varPercent = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
            varClass = pct > 0 ? 'var-positive' : pct < 0 ? 'var-negative' : 'var-neutral'
        }
    }

    return (
        <div className={`account-row ${isTotal ? 'is-total' : ''} ${showComparative ? 'with-comparative' : ''}`}>
            <span className={`row-label ${paddingLeft} ${fontSize} ${textColor}`}>
                {item.isContra ? '(-) ' : ''}
                {item.label}
            </span>
            <span className={`row-amount ${isTotal ? 'is-total' : ''}`}>
                {formatCurrencyARS(item.amount)}
            </span>
            {showComparative && (
                <>
                    <span className={`row-amount comparative ${isTotal ? 'is-total' : ''}`}>
                        {hasComparative ? formatCurrencyARS(item.comparativeAmount!) : '—'}
                    </span>
                    <span className={`row-var ${varClass} ${isTotal ? 'is-total' : ''}`}>
                        {varPercent || '—'}
                    </span>
                </>
            )}
        </div>
    )
}

const SectionCard = ({
    title,
    icon: Icon,
    sections,
    totalAmount,
    accentColor,
    showComparative = false,
    comparativeTotal
}: {
    title: string
    icon: React.ElementType
    sections: SectionData[]
    totalAmount: number
    accentColor: 'blue' | 'emerald' | 'slate'
    showComparative?: boolean
    comparativeTotal?: number
}) => {
    const accentClasses = {
        blue: { icon: 'accent-blue', gradient: 'gradient-blue', bar: 'bar-blue' },
        emerald: { icon: 'accent-emerald', gradient: 'gradient-emerald', bar: 'bar-emerald' },
        slate: { icon: 'accent-slate', gradient: 'gradient-slate', bar: 'bar-slate' }
    }[accentColor]

    // Calculate section total variation
    let totalVarPercent: string | null = null
    let totalVarClass = ''
    if (showComparative && comparativeTotal !== undefined) {
        if (comparativeTotal === 0 && totalAmount > 0) {
            totalVarPercent = 'NEW'
            totalVarClass = 'var-new'
        } else if (totalAmount === 0 && comparativeTotal > 0) {
            totalVarPercent = '—'
            totalVarClass = 'var-neutral'
        } else if (comparativeTotal !== 0) {
            const pct = ((totalAmount - comparativeTotal) / Math.abs(comparativeTotal)) * 100
            totalVarPercent = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
            totalVarClass = pct > 0 ? 'var-positive' : pct < 0 ? 'var-negative' : 'var-neutral'
        }
    }

    return (
        <div className={`section-card ${showComparative ? 'show-comparative' : ''}`}>
            {/* Header */}
            <div className="section-card-header">
                <div className="header-icon-row">
                    <div className={`icon-wrapper ${accentClasses.icon}`}>
                        <Icon className="section-icon" />
                    </div>
                    <h3 className={`section-title ${accentClasses.gradient}`}>
                        {title}
                    </h3>
                </div>
                <div className={`accent-bar ${accentClasses.bar}`}></div>
            </div>

            {/* Body */}
            <div className="section-card-body">
                {sections.map((section, idx) => (
                    <div key={idx} className="subsection">
                        <h4 className="subsection-title">
                            {section.title}
                            <div className="subsection-line"></div>
                        </h4>
                        <div className="subsection-rows">
                            {section.items.map(item => (
                                <AccountRow key={item.id} item={item} showComparative={showComparative} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className={`section-card-footer ${showComparative ? 'with-comparative' : ''}`}>
                <span className="footer-label">Total {title}</span>
                <span className={`footer-amount ${accentColor === 'emerald' ? 'accent-emerald-text' : ''}`}>
                    {formatCurrencyARS(totalAmount)}
                </span>
                {showComparative && (
                    <>
                        <span className="footer-amount comparative">
                            {comparativeTotal !== undefined ? formatCurrencyARS(comparativeTotal) : '—'}
                        </span>
                        <span className={`footer-var ${totalVarClass}`}>
                            {totalVarPercent || '—'}
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}

// ============================================
// Main Component
// ============================================

export function EstadoSituacionPatrimonialGemini({
    loading,
    entidad,
    fechaCorte,
    activoSections,
    pasivoSections,
    patrimonioNetoSection,
    totalActivo,
    totalPasivo,
    totalPN,
    isBalanced,
    diff,
    onExportPdf,
    isExporting,
    pdfRef,
    // Comparative props
    showComparative = false,
    // comparativeYear, // Unused
    // currentYear, // Unused
    comparativeTotalActivo,
    comparativeTotalPasivo,
    comparativeTotalPN
}: EstadoSituacionPatrimonialGeminiProps) {

    const handleDownload = async () => {
        await onExportPdf()
    }

    // Loading Skeleton
    if (loading) {
        return (
            <div className="esp-gemini-wrapper">
                <div className="esp-gemini-skeleton">
                    <div className="skeleton-header"></div>
                    <div className="skeleton-grid">
                        <div className="skeleton-card"></div>
                        <div className="skeleton-card"></div>
                        <div className="skeleton-card"></div>
                    </div>
                </div>
                <style>{skeletonStyles}</style>
            </div>
        )
    }

    // Empty State
    const hasData = activoSections.some(s => s.items.length > 0) ||
        pasivoSections.some(s => s.items.length > 0) ||
        patrimonioNetoSection.items.length > 0

    if (!hasData) {
        return (
            <div className="esp-gemini-wrapper">
                <div className="esp-empty-state">
                    <div className="empty-icon">📊</div>
                    <p className="empty-text">Sin datos para el período seleccionado</p>
                </div>
                <style>{mainStyles}</style>
            </div>
        )
    }

    return (
        <div className="esp-gemini-wrapper">
            {/* PDF Capture Container */}
            <div ref={pdfRef} className="esp-gemini-container">

                {/* Header */}
                <header className="esp-header">
                    <div className="header-info">
                        <div className="entity-row">
                            <Building2 className="entity-icon" />
                            <span>{entidad || 'Mi Empresa S.A.'}</span>
                        </div>
                        <h1 className="main-title">Estado de Situación Patrimonial</h1>
                        <div className="date-badge">
                            <span>Al {fechaCorte || 'fecha no especificada'}</span>
                        </div>
                    </div>

                    <div className="header-actions">
                        <button className="btn-secondary" disabled>
                            <Share2 className="btn-icon-sm" />
                            <span className="btn-text-hide-mobile">Compartir</span>
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={isExporting}
                            className="btn-brand"
                        >
                            {isExporting ? (
                                <>
                                    <span className="spinner"></span>
                                    <span>Generando...</span>
                                </>
                            ) : (
                                <>
                                    <Download className="btn-icon-sm" />
                                    <span>Descargar PDF</span>
                                </>
                            )}
                        </button>
                    </div>
                </header>

                {/* Grid Contable */}
                <main className="esp-grid">
                    {/* Left Column: ACTIVO */}
                    <div className="esp-column">
                        <SectionCard
                            title="Activo"
                            icon={TrendingUp}
                            accentColor="blue"
                            sections={activoSections}
                            totalAmount={totalActivo}
                            showComparative={showComparative}
                            comparativeTotal={comparativeTotalActivo}
                        />
                    </div>

                    {/* Right Column: PASIVO + PN */}
                    <div className="esp-column esp-column-stack">
                        <SectionCard
                            title="Pasivo"
                            icon={TrendingDown}
                            accentColor="slate"
                            sections={pasivoSections}
                            totalAmount={totalPasivo}
                            showComparative={showComparative}
                            comparativeTotal={comparativeTotalPasivo}
                        />

                        <SectionCard
                            title="Patrimonio Neto"
                            icon={Building2}
                            accentColor="emerald"
                            sections={[patrimonioNetoSection]}
                            totalAmount={totalPN}
                            showComparative={showComparative}
                            comparativeTotal={comparativeTotalPN}
                        />
                    </div>
                </main>

                {/* Ecuación Patrimonial */}
                <section className={`equation-section ${isBalanced ? 'balanced' : 'unbalanced'}`}>
                    <div className="equation-content">
                        <div className="equation-left">
                            <div className={`equation-icon-wrapper ${isBalanced ? 'success' : 'error'}`}>
                                <Scale className="equation-icon" />
                            </div>
                            <div className="equation-text">
                                <h3 className="equation-title">Ecuación Patrimonial</h3>
                                <p className="equation-subtitle">Validación de consistencia contable</p>
                            </div>
                        </div>

                        <div className="equation-right">
                            <div className="formula">
                                <span className="formula-bold">ACTIVO</span>
                                <span className="formula-op">=</span>
                                <span>PASIVO</span>
                                <span className="formula-op">+</span>
                                <span>PN</span>
                            </div>

                            <div className={`status-chip ${isBalanced ? 'success' : 'error'}`}>
                                {isBalanced ? (
                                    <>
                                        <CheckCircle2 className="chip-icon" />
                                        BALANCEADO
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="chip-icon" />
                                        DESBALANCEADO
                                    </>
                                )}
                            </div>

                            {!isBalanced && (
                                <div className="diff-amount">
                                    Diferencia: {formatCurrencyARS(Math.abs(diff))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer className="esp-footer">
                    <p>Este reporte es de uso interno provisorio. Generado por ContaLivre el {new Date().toLocaleDateString('es-AR')}.</p>
                </footer>
            </div>

            <style>{mainStyles}</style>
        </div>
    )
}

// ============================================
// Styles
// ============================================

const skeletonStyles = `
.esp-gemini-skeleton {
    padding: 32px;
    background: var(--surface-2, #f8fafc);
    border-radius: 8px;
}
.skeleton-header {
    height: 80px;
    background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 8px;
    margin-bottom: 24px;
}
.skeleton-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
}
.skeleton-card {
    height: 300px;
    background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 12px;
}
@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}
@media (max-width: 1023px) {
    .skeleton-grid { grid-template-columns: 1fr; }
}
`

const mainStyles = `
.esp-gemini-wrapper {
    width: 100%;
}

.esp-gemini-container {
    background: var(--surface-2, #f8fafc);
    padding: 24px;
    border-radius: var(--radius-lg, 12px);
}

@media (min-width: 768px) {
    .esp-gemini-container {
        padding: 32px;
    }
}

/* ---- Header ---- */
.esp-header {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 32px;
}

@media (min-width: 768px) {
    .esp-header {
        flex-direction: row;
        justify-content: space-between;
        align-items: flex-end;
    }
}

.header-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.entity-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    color: var(--text-muted, #64748b);
    font-weight: 500;
}

.entity-icon {
    width: 16px;
    height: 16px;
}

.main-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text-strong, #0f172a);
    letter-spacing: -0.02em;
    margin: 0;
}

@media (min-width: 768px) {
    .main-title {
        font-size: 2rem;
    }
}

.date-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-1, white);
    border: 1px solid var(--border, rgba(15, 23, 42, 0.1));
    border-radius: 9999px;
    padding: 4px 12px;
    font-size: 0.875rem;
    color: var(--text-muted, #64748b);
    width: fit-content;
    margin-top: 8px;
}

.header-actions {
    display: flex;
    gap: 12px;
}

.btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--surface-1, white);
    border: 1px solid var(--border, rgba(15, 23, 42, 0.1));
    color: var(--text, #111827);
    font-weight: 500;
    border-radius: var(--radius-md, 10px);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.875rem;
}

.btn-secondary:hover:not(:disabled) {
    background: var(--surface-2, #f8fafc);
}

.btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--brand-gradient, linear-gradient(135deg, #2563EB 0%, #10B981 100%));
    color: white;
    font-weight: 600;
    border-radius: var(--radius-md, 10px);
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);
    transition: all 0.2s ease;
    font-size: 0.875rem;
}

.btn-brand:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}

.btn-brand:disabled {
    opacity: 0.8;
    cursor: not-allowed;
}

.btn-icon-sm {
    width: 16px;
    height: 16px;
}

.btn-text-hide-mobile {
    display: none;
}

@media (min-width: 640px) {
    .btn-text-hide-mobile {
        display: inline;
    }
}

.spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* ---- Grid Layout ---- */
.esp-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    margin-bottom: 32px;
}

@media (min-width: 1024px) {
    .esp-grid {
        grid-template-columns: 1fr 1fr;
    }
}

.esp-column {
    display: flex;
    flex-direction: column;
}

.esp-column-stack {
    gap: 24px;
}

/* ---- Section Card ---- */
.section-card {
    background: var(--surface-1, white);
    border-radius: var(--radius-lg, 12px);
    border: 1px solid var(--border, rgba(15, 23, 42, 0.08));
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(15, 23, 42, 0.06));
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    transition: box-shadow 0.2s ease;
}

.section-card:hover {
    box-shadow: var(--shadow-md, 0 8px 24px rgba(15, 23, 42, 0.1));
}

.section-card-header {
    padding: 20px;
    border-bottom: 1px solid var(--border, rgba(15, 23, 42, 0.05));
    background: var(--surface-2, #f8fafc);
}

.header-icon-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.icon-wrapper {
    padding: 6px;
    border-radius: 8px;
}

.icon-wrapper.accent-blue {
    background: rgba(37, 99, 235, 0.1);
}

.icon-wrapper.accent-emerald {
    background: rgba(16, 185, 129, 0.1);
}

.icon-wrapper.accent-slate {
    background: rgba(100, 116, 139, 0.1);
}

.section-icon {
    width: 16px;
    height: 16px;
}

.accent-blue .section-icon { color: #2563eb; }
.accent-emerald .section-icon { color: #10b981; }
.accent-slate .section-icon { color: #64748b; }

.section-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.gradient-blue {
    background-image: linear-gradient(135deg, #2563eb, #60a5fa);
}

.gradient-emerald {
    background-image: linear-gradient(135deg, #10b981, #34d399);
}

.gradient-slate {
    background-image: linear-gradient(135deg, #475569, #94a3b8);
}

.accent-bar {
    height: 2px;
    width: 48px;
    border-radius: 9999px;
    margin-top: 8px;
    opacity: 0.5;
}

.bar-blue { background: #2563eb; }
.bar-emerald { background: #10b981; }
.bar-slate { background: #64748b; }

.section-card-body {
    padding: 20px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.subsection {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.subsection-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted, #64748b);
    margin: 0;
}

.subsection-line {
    flex: 1;
    height: 1px;
    background: var(--border, rgba(15, 23, 42, 0.08));
}

.subsection-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

/* ---- Account Row ---- */
.account-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 6px 8px;
    margin: 0 -8px;
    border-radius: 4px;
    transition: background 0.1s ease;
}

.account-row:hover {
    background: var(--surface-2, #f8fafc);
}

.account-row.is-total {
    border-top: 1px solid var(--border, rgba(15, 23, 42, 0.1));
    margin-top: 4px;
    padding-top: 8px;
}

.row-label {
    font-size: 0.875rem;
    color: var(--text-muted, #64748b);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-right: 16px;
}

.row-label.pl-0 { padding-left: 0; }
.row-label.pl-4 { padding-left: 16px; }
.row-label.pl-8 { padding-left: 32px; }

.row-label.row-header { font-weight: 600; }
.row-label.row-title { color: var(--text-strong, #0f172a); }
.row-label.row-contra { font-style: italic; color: var(--text-muted, #94a3b8); }

.row-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text, #111827);
    white-space: nowrap;
}

.row-amount.is-total {
    font-weight: 700;
    color: var(--text-strong, #0f172a);
}

/* ---- Section Footer ---- */
.section-card-footer {
    padding: 20px;
    background: var(--surface-2, #f8fafc);
    border-top: 1px solid var(--border, rgba(15, 23, 42, 0.08));
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
}

.footer-label {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 0.875rem;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-muted, #64748b);
}

.footer-amount {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-strong, #0f172a);
}

.footer-amount.accent-emerald-text {
    color: #10b981;
}

/* ---- Equation Section ---- */
.equation-section {
    border-radius: var(--radius-lg, 12px);
    padding: 24px;
    overflow: hidden;
    position: relative;
}

@media (min-width: 768px) {
    .equation-section {
        padding: 32px;
    }
}

.equation-section.balanced {
    background: #0f172a;
    color: white;
}

.equation-section.unbalanced {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #1f2937;
}

.equation-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
    position: relative;
    z-index: 1;
}

@media (min-width: 768px) {
    .equation-content {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
    }
}

.equation-left {
    display: flex;
    align-items: center;
    gap: 16px;
}

.equation-icon-wrapper {
    padding: 12px;
    border-radius: 12px;
}

.equation-icon-wrapper.success {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
}

.equation-icon-wrapper.error {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
}

.equation-icon {
    width: 32px;
    height: 32px;
}

.equation-title {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.125rem;
    font-weight: 700;
    margin: 0 0 4px 0;
}

.equation-section.balanced .equation-title { color: white; }
.equation-section.unbalanced .equation-title { color: #0f172a; }

.equation-subtitle {
    font-size: 0.875rem;
    margin: 0;
}

.equation-section.balanced .equation-subtitle { color: rgba(255, 255, 255, 0.6); }
.equation-section.unbalanced .equation-subtitle { color: #64748b; }

.equation-right {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
}

@media (min-width: 768px) {
    .equation-right {
        flex-direction: row;
        align-items: center;
        gap: 24px;
    }
}

.formula {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.875rem;
    opacity: 0.8;
}

.formula-bold { font-weight: 700; }
.formula-op { opacity: 0.6; }

.status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 0.8rem;
    font-weight: 600;
    border: 1px solid transparent;
}

.status-chip.success {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.3);
    color: #34d399;
}

.status-chip.error {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: #dc2626;
}

.chip-icon {
    width: 14px;
    height: 14px;
}

.diff-amount {
    font-size: 0.875rem;
    font-weight: 500;
    color: #dc2626;
}

/* ---- Footer ---- */
.esp-footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid var(--border, rgba(15, 23, 42, 0.08));
    text-align: center;
}

.esp-footer p {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
    margin: 0;
}

/* ---- Empty State ---- */
.esp-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 32px;
    text-align: center;
}

.empty-icon {
    font-size: 3rem;
    margin-bottom: 16px;
    opacity: 0.5;
}

.empty-text {
    font-size: 1rem;
    color: var(--text-muted, #64748b);
    margin: 0;
}

/* ---- Comparative Mode Styles ---- */
.account-row.with-comparative {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 8px;
    align-items: baseline;
}

.row-amount.comparative {
    color: var(--text-muted, #64748b);
    font-size: 0.8rem;
}

.row-var {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    min-width: 50px;
    text-align: center;
}

.row-var.is-total {
    font-weight: 700;
}

.row-var.var-positive {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
}

.row-var.var-negative {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
}

.row-var.var-new {
    background: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
}

.row-var.var-neutral {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
}

/* Section footer comparative */
.section-card-footer.with-comparative {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 12px;
    align-items: center;
}

.footer-amount.comparative {
    font-size: 0.95rem;
    color: var(--text-muted, #64748b);
}

.footer-var {
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    font-size: 0.875rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 6px;
    min-width: 60px;
    text-align: center;
}

.footer-var.var-positive {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
}

.footer-var.var-negative {
    background: rgba(239, 68, 68, 0.15);
    color: #dc2626;
}

.footer-var.var-new {
    background: rgba(59, 130, 246, 0.15);
    color: #2563eb;
}

.footer-var.var-neutral {
    background: rgba(100, 116, 139, 0.1);
    color: #64748b;
}

/* Responsive: scroll horizontally on mobile when comparative */
.section-card.show-comparative .section-card-body {
    overflow-x: auto;
}

.section-card.show-comparative .subsection-rows {
    min-width: 400px;
}

@media (max-width: 640px) {
    .account-row.with-comparative {
        grid-template-columns: 1fr auto;
        gap: 4px;
    }
    
    .row-amount.comparative,
    .row-var {
        display: none;
    }
    
    .section-card-footer.with-comparative {
        grid-template-columns: 1fr auto;
    }
    
    .footer-amount.comparative,
    .footer-var {
        display: none;
    }
}

@media (min-width: 641px) and (max-width: 1023px) {
    .row-amount.comparative {
        font-size: 0.75rem;
    }
    
    .row-var {
        font-size: 0.65rem;
        min-width: 40px;
    }
}
`

export default EstadoSituacionPatrimonialGemini
