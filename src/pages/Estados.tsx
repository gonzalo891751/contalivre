import { useMemo, useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { computeTrialBalance } from '../core/balance'
import { computeStatements } from '../core/statements'
import { HelpPanel } from '../ui/HelpPanel'
import { EquationBar } from './estados/EquationBar'
import SegmentedTabs from '../ui/SegmentedTabs'
import { exportElementToPdf } from '../utils/exportPdf'
import type { StatementSection } from '../core/models'

// Subcomponent for reusable sections
interface SectionDisplayProps {
    section: StatementSection
    showNetTotal?: boolean
    className?: string
    colorTheme?: 'primary' | 'error' | 'success' | 'default'
    hideTitle?: boolean
}

function SectionDisplay({
    section,
    showNetTotal = false,
    className = '',
    colorTheme = 'default',
    hideTitle = false
}: SectionDisplayProps) {
    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    if (section.accounts.length === 0) {
        return null
    }

    return (
        <div className={`statement-group ${className}`}>
            {!hideTitle && (
                <div className={`statement-group-title text-${colorTheme}`}>
                    {section.label}
                </div>
            )}

            {section.accounts.map((item) => (
                <div
                    key={item.account.id}
                    className={`statement-row ${item.isContra ? 'text-muted' : ''}`}
                    style={{ fontStyle: item.isContra ? 'italic' : 'normal' }}
                >
                    <span>
                        {item.account.id === '__current_result__' && '👉 '}
                        {item.isContra ? '(-) ' : ''}
                        {item.account.name}
                    </span>
                    <span className="statement-value">
                        {item.balance < 0 ? '(' : ''}${formatAmount(Math.abs(item.balance))}
                        {item.balance < 0 ? ')' : ''}
                    </span>
                </div>
            ))}

            <div className={`statement-row statement-row-total theme-${colorTheme}`}>
                <span>Total {section.label}</span>
                <span className="statement-value">
                    ${formatAmount(showNetTotal ? section.netTotal : section.subtotal)}
                </span>
            </div>
        </div>
    )
}

export default function Estados() {
    const [viewMode, setViewMode] = useState<'ESP' | 'ER'>('ESP')
    const [isExporting, setIsExporting] = useState(false)

    // Refs for PDF capture
    const espRef = useRef<HTMLDivElement>(null)
    const erRef = useRef<HTMLDivElement>(null)

    const handleDownload = async () => {
        setIsExporting(true)
        const dateStr = new Date().toISOString().split('T')[0]

        try {
            if (viewMode === 'ESP' && espRef.current) {
                await exportElementToPdf(espRef.current, `situacion_patrimonial_${dateStr}`)
            } else if (viewMode === 'ER' && erRef.current) {
                await exportElementToPdf(erRef.current, `estado_resultados_${dateStr}`)
            }
        } finally {
            setIsExporting(false)
        }
    }

    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    const statements = useMemo(() => {
        if (!accounts || !entries || entries.length === 0) return null
        const ledger = computeLedger(entries, accounts)
        const trialBalance = computeTrialBalance(ledger, accounts)
        return computeStatements(trialBalance, accounts)
    }, [accounts, entries])

    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    if (!entries?.length) {
        return (
            <div>
                <header className="page-header">
                    <h1 className="page-title">Estados Contables</h1>
                </header>
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">📈</div>
                        <p>No hay asientos registrados. Cargá algunos para ver los estados contables.</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!statements) { // Loading
        return (
            <div>
                <header className="page-header">
                    <h1 className="page-title">Estados Contables</h1>
                </header>
                <div className="empty-state">
                    <div className="empty-state-icon">⏳</div>
                    <p>Cargando información...</p>
                </div>
            </div>
        )
    }

    const { balanceSheet, incomeStatement } = statements

    return (
        <div className="fade-in">
            <header className="page-header">
                <div>
                    <h1 className="page-title">Estados Contables</h1>
                    <p className="page-subtitle">
                        Seguimiento patrimonial y de resultados.
                    </p>
                </div>

                <div style={{ marginTop: 'var(--space-md)' }}>
                    <SegmentedTabs
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'ESP' | 'ER')}
                        options={[
                            { value: 'ESP', label: 'Estado de Situación Patrimonial' },
                            { value: 'ER', label: 'Estado de Resultados' },
                        ]}
                    />
                </div>
            </header>

            <HelpPanel title={viewMode === 'ESP' ? "Sobre el Estado de Situación Patrimonial" : "Sobre el Estado de Resultados"}>
                {viewMode === 'ESP' ? (
                    <p>
                        El <strong>Estado de Situación Patrimonial</strong> muestra la estructura financiera de la empresa en un momento dado.
                        Verificá que <em>Activo = Pasivo + Patrimonio Neto</em>.
                    </p>
                ) : (
                    <p>
                        El <strong>Estado de Resultados</strong> muestra las ganancias y pérdidas generadas durante el ejercicio.
                        El resultado final se traslada al Patrimonio Neto.
                    </p>
                )}
            </HelpPanel>

            <div style={{ marginTop: 'var(--space-lg)' }}>
                {viewMode === 'ESP' && (
                    <div className="animate-slide-up">
                        {/* Wrap content for PDF Capture */}
                        <div ref={espRef} style={{ background: '#f8fafc', padding: '24px', borderRadius: '8px' }}>
                            <h2 className="text-center text-xl font-bold text-slate-700 mb-6 hidden-print-header">Estado de Situación Patrimonial</h2>

                            {/* 2-Column Grid Layout */}
                            <div className="esp-grid">

                                {/* Left Column: ACTIVO */}
                                <div className="esp-column">
                                    <div className="card h-full">
                                        <h2 className="section-title text-primary">ACTIVO</h2>

                                        <div className="esp-section-content">
                                            <SectionDisplay section={balanceSheet.currentAssets} showNetTotal colorTheme="primary" />
                                            <SectionDisplay section={balanceSheet.nonCurrentAssets} showNetTotal colorTheme="primary" />
                                        </div>

                                        <div className="statement-grand-total mt-auto">
                                            <span>TOTAL ACTIVO</span>
                                            <span>${formatAmount(balanceSheet.totalAssets)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: PASIVO + PN */}
                                <div className="esp-column flex flex-col gap-4">
                                    {/* PASIVO */}
                                    <div className="card">
                                        <h2 className="section-title text-error">PASIVO</h2>

                                        <div className="esp-section-content">
                                            <SectionDisplay section={balanceSheet.currentLiabilities} showNetTotal colorTheme="error" />
                                            <SectionDisplay section={balanceSheet.nonCurrentLiabilities} showNetTotal colorTheme="error" />
                                        </div>

                                        <div className="statement-grand-total mt-4">
                                            <span>TOTAL PASIVO</span>
                                            <span>${formatAmount(balanceSheet.totalLiabilities)}</span>
                                        </div>
                                    </div>

                                    {/* PATRIMONIO NETO */}
                                    <div className="card flex-1">
                                        <h2 className="section-title text-success">PATRIMONIO NETO</h2>

                                        <div className="esp-section-content">
                                            {/* Hide the duplicate "Patrimonio Neto" subtitle since the card header already says it */}
                                            <SectionDisplay section={balanceSheet.equity} showNetTotal colorTheme="success" hideTitle />
                                        </div>

                                        <div className="statement-grand-total mt-auto">
                                            <span>TOTAL PATRIMONIO NETO</span>
                                            <span>${formatAmount(balanceSheet.totalEquity)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Equation Validation Bar */}
                            <EquationBar
                                totalAssets={balanceSheet.totalAssets}
                                totalLiabilities={balanceSheet.totalLiabilities}
                                totalEquity={balanceSheet.totalEquity}
                            />
                        </div>

                        {/* Download Button */}
                        <div className="flex justify-center mt-8">
                            <button
                                onClick={handleDownload}
                                disabled={isExporting}
                                className="btn-primary flex items-center gap-2 px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all"
                            >
                                {isExporting ? 'Generando PDF...' : '📥 Descargar Estado de Situación Patrimonial'}
                            </button>
                        </div>
                    </div>
                )}

                {viewMode === 'ER' && (
                    <div className="animate-slide-up">
                        <div ref={erRef} style={{ background: '#f8fafc', padding: '24px', borderRadius: '8px', maxWidth: '800px', margin: '0 auto' }}>
                            <div className="card p-6">
                                <h2 className="statement-header text-center mb-6">Estado de Resultados</h2>

                                <div className="statement-body">
                                    <SectionDisplay section={incomeStatement.sales} />
                                    <SectionDisplay section={incomeStatement.cogs} />

                                    <div className="statement-row statement-row-total bg-bg-surface p-2 rounded">
                                        <span>RESULTADO BRUTO</span>
                                        <span className="statement-value">${formatAmount(incomeStatement.grossProfit)}</span>
                                    </div>

                                    <div className="h-4" />

                                    <SectionDisplay section={incomeStatement.adminExpenses} />
                                    <SectionDisplay section={incomeStatement.sellingExpenses} />

                                    <div className="statement-row statement-row-total bg-bg-surface p-2 rounded">
                                        <span>RESULTADO OPERATIVO</span>
                                        <span className="statement-value">${formatAmount(incomeStatement.operatingIncome)}</span>
                                    </div>

                                    <div className="h-4" />

                                    <SectionDisplay section={incomeStatement.financialIncome} />
                                    <SectionDisplay section={incomeStatement.financialExpenses} />
                                    {incomeStatement.netFinancialResult !== 0 && (
                                        <div className="statement-row text-sm text-muted-foreground italic">
                                            <span>Resultado financiero neto</span>
                                            <span>${formatAmount(incomeStatement.netFinancialResult)}</span>
                                        </div>
                                    )}

                                    <SectionDisplay section={incomeStatement.otherIncome} />
                                    <SectionDisplay section={incomeStatement.otherExpenses} />
                                    {incomeStatement.netOtherResult !== 0 && (
                                        <div className="statement-row text-sm text-muted-foreground italic">
                                            <span>Otros resultados neto</span>
                                            <span>${formatAmount(incomeStatement.netOtherResult)}</span>
                                        </div>
                                    )}
                                </div>

                                <div
                                    className="statement-grand-total mt-8 p-4 rounded-lg"
                                    style={{
                                        background: incomeStatement.netIncome >= 0 ? 'var(--color-success-bg)' : 'var(--color-error-bg)',
                                        color: incomeStatement.netIncome >= 0 ? 'var(--color-success)' : 'var(--color-error)',
                                    }}
                                >
                                    <span>{incomeStatement.netIncome >= 0 ? 'GANANCIA DEL EJERCICIO' : 'PÉRDIDA DEL EJERCICIO'}</span>
                                    <span>${formatAmount(Math.abs(incomeStatement.netIncome))}</span>
                                </div>
                            </div>
                        </div>

                        {/* Download Button */}
                        <div className="flex justify-center mt-8">
                            <button
                                onClick={handleDownload}
                                disabled={isExporting}
                                className="btn-primary flex items-center gap-2 px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all"
                            >
                                {isExporting ? 'Generando PDF...' : '📥 Descargar Estado de Resultados'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .esp-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: var(--space-xl);
                }

                @media (min-width: 1024px) {
                    .esp-grid {
                        grid-template-columns: 1fr 1fr;
                    }
                }

                .esp-column {
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-lg);
                }

                .section-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    margin-bottom: var(--space-md);
                    border-bottom: 2px solid currentColor;
                    padding-bottom: var(--space-xs);
                    display: inline-block;
                }

                .text-primary { color: #2563EB; }
                .text-success { color: #7C3AED; } /* PN Purple consistency */
                .text-error { color: #DC2626; } /* Pasivo Red consistency */

                .h-full { height: 100%; }
                .mt-auto { margin-top: auto; }
                .flex-1 { flex: 1; }

                /* Hover effect on cards */
                .card {
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .card:hover {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                }

                .animate-slide-up {
                    animation: slideUp 0.4s ease-out forwards;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Reuse existing statement styles but refine spacing */
                .statement-group {
                    margin-bottom: var(--space-md);
                }
                
                .statement-group-title {
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    /* Default color overwritten by specific classes */
                    color: var(--color-text-secondary); 
                    margin-bottom: var(--space-xs);
                    font-weight: 800; /* Bold as requested */
                    border-bottom: 2px solid currentColor; /* Stronger divider */
                    display: inline-block;
                    opacity: 0.9;
                }
                
                .statement-group-title.text-primary { color: #1e40af; } /* Dark Blue */
                .statement-group-title.text-error { color: #991b1b; } /* Dark Red */
                .statement-group-title.text-success { color: #6d28d9; } /* Dark Violet */

                .statement-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 12px;
                    border-bottom: 1px dashed rgba(203, 213, 225, 0.5);
                    font-size: 0.95rem;
                    border-radius: 4px;
                    transition: background-color 0.15s ease;
                }
                
                .statement-row:hover {
                    background-color: rgba(248, 250, 252, 0.5);
                }

                .statement-row:last-child {
                    border-bottom: none;
                }

                .statement-row-total {
                    font-weight: 700; /* Bold totals */
                    font-size: 0.95rem;
                    border-top: 1px solid rgba(0,0,0,0.1);
                    border-bottom: none;
                    margin-top: 4px;
                    padding-top: 8px;
                    padding-bottom: 8px; /* Added padding bottom */
                    color: #334155;
                    background: rgba(241, 245, 249, 0.5); /* Default tint */
                }

                /* Themed Totals Backgrounds */
                .statement-row-total.theme-primary { background: rgba(37, 99, 235, 0.04); color: #1e3a8a; }
                .statement-row-total.theme-error { background: rgba(220, 38, 38, 0.04); color: #7f1d1d; }
                .statement-row-total.theme-success { background: rgba(124, 58, 237, 0.04); color: #5b21b6; }

                .statement-row-total:hover {
                    background: rgba(0,0,0,0.02); /* Subtle hover override check */
                }

                .statement-grand-total {
                    display: flex;
                    justify-content: space-between;
                    font-size: 1.2rem;
                    font-weight: 800;
                    padding: var(--space-sm);
                    background: var(--color-bg-surface-hover);
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--color-border);
                }
            `}</style>
        </div>
    )
}

