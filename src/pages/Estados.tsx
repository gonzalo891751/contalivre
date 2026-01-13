import { useMemo, useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { computeTrialBalance } from '../core/balance'
import { computeStatements } from '../core/statements'
import { excludeClosingEntries } from '../utils/resultsStatement'
import { HelpPanel } from '../ui/HelpPanel'
import SegmentedTabs from '../ui/SegmentedTabs'
import { exportElementToPdf } from '../utils/exportPdf'
import type { StatementSection, BalanceSheet } from '../core/models'
import {
    EstadoSituacionPatrimonialGemini,
    type SectionData,
    type AccountLine
} from '../components/Estados/EstadoSituacionPatrimonialGemini'

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
                <div className="statement-header-wrapper">
                    <div className="statement-group-title">
                        {section.label}
                    </div>
                </div>
            )}

            <div className="statement-rows-container">
                {section.accounts.map((item) => (
                    <div
                        key={item.account.id}
                        className={`statement-row ${item.isContra ? 'text-muted' : ''}`}
                        style={{ fontStyle: item.isContra ? 'italic' : 'normal' }}
                    >
                        <span className="row-label">
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
            </div>

            <div className={`statement-subtotal theme-${colorTheme}`}>
                <span className="subtotal-label">Total {section.label}</span>
                <span className="subtotal-value">
                    ${formatAmount(showNetTotal ? section.netTotal : section.subtotal)}
                </span>
            </div>
        </div>
    )
}

function KeyResultRow({ label, amount, type = 'default' }: { label: string, amount: number, type?: 'default' | 'operating' | 'gross' }) {
    const formatAmount = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 })

    return (
        <div className={`key-result-row type-${type}`}>
            <span className="key-label">{label}</span>
            <span className="key-amount">${formatAmount(amount)}</span>
        </div>
    )
}

function NetGroupResultRow({ label, amount }: { label: string, amount: number }) {
    const formatAmount = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 })
    const isGain = amount >= 0

    return (
        <div className="net-group-row">
            <span className="net-label">{label}</span>
            <span className={`net-amount ${isGain ? 'text-success-dark' : 'text-error-dark'}`}>
                {isGain ? '' : '-'}${formatAmount(Math.abs(amount))}
            </span>
        </div>
    )
}

// ============================================
// Data Adapter: BalanceSheet → Gemini Format
// ============================================
function adaptSectionToGemini(section: StatementSection): SectionData {
    const items: AccountLine[] = section.accounts.map((item, idx) => ({
        id: item.account.id || `item-${idx}`,
        label: item.account.name,
        amount: item.balance,
        level: 2 as const,
        isContra: item.isContra
    }))

    // Add total row
    if (items.length > 0) {
        items.push({
            id: `${section.key}-total`,
            label: `Total ${section.label}`,
            amount: section.netTotal,
            level: 2 as const,
            isTotal: true
        })
    }

    return {
        title: section.label,
        items
    }
}

function adaptBalanceSheetToGemini(bs: BalanceSheet) {
    const TOLERANCE = 0.05
    const diff = bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)
    const isBalanced = Math.abs(diff) < TOLERANCE

    return {
        activoSections: [
            adaptSectionToGemini(bs.currentAssets),
            adaptSectionToGemini(bs.nonCurrentAssets)
        ].filter(s => s.items.length > 0),
        pasivoSections: [
            adaptSectionToGemini(bs.currentLiabilities),
            adaptSectionToGemini(bs.nonCurrentLiabilities)
        ].filter(s => s.items.length > 0),
        patrimonioNetoSection: {
            title: 'Patrimonio Neto',
            items: [
                ...bs.equity.accounts.map((item, idx): AccountLine => ({
                    id: item.account.id || `pn-${idx}`,
                    label: item.account.name,
                    amount: item.balance,
                    level: 2,
                    isContra: item.isContra
                })),
                ...(bs.equity.accounts.length > 0 ? [{
                    id: 'pn-total',
                    label: 'Total Patrimonio Neto',
                    amount: bs.totalEquity,
                    level: 2 as const,
                    isTotal: true
                } as AccountLine] : [])
            ]
        },
        totalActivo: bs.totalAssets,
        totalPasivo: bs.totalLiabilities,
        totalPN: bs.totalEquity,
        isBalanced,
        diff
    }
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

        // Filter closing entries (Task 3)
        const entriesWithoutClosing = excludeClosingEntries(entries, accounts)

        const ledger = computeLedger(entriesWithoutClosing, accounts)
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
    const isNetIncomePositive = incomeStatement.netIncome >= 0

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
                        El <strong>Estado de Resultados</strong> muestra la performance económica.
                        Los ingresos suman y los gastos restan para determinar el resultado del ejercicio, excluyendo movimientos de cierre.
                    </p>
                )}
            </HelpPanel>

            <div style={{ marginTop: 'var(--space-lg)' }}>
                {viewMode === 'ESP' && (
                    <div className="animate-slide-up">
                        {(() => {
                            const geminiData = adaptBalanceSheetToGemini(balanceSheet)
                            return (
                                <EstadoSituacionPatrimonialGemini
                                    loading={false}
                                    entidad="Mi Empresa S.A."
                                    fechaCorte={new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    activoSections={geminiData.activoSections}
                                    pasivoSections={geminiData.pasivoSections}
                                    patrimonioNetoSection={geminiData.patrimonioNetoSection}
                                    totalActivo={geminiData.totalActivo}
                                    totalPasivo={geminiData.totalPasivo}
                                    totalPN={geminiData.totalPN}
                                    isBalanced={geminiData.isBalanced}
                                    diff={geminiData.diff}
                                    onExportPdf={handleDownload}
                                    isExporting={isExporting}
                                    pdfRef={espRef}
                                />
                            )
                        })()}
                    </div>
                )}

                {viewMode === 'ER' && (
                    <div className="animate-slide-up">
                        <div ref={erRef} className="er-container-export">
                            <div className="paper-card">
                                <h2 className="er-main-title">Estado de Resultados</h2>
                                <p className="er-date text-center text-muted-foreground mb-8">
                                    Correspondiente al ejercicio actual
                                </p>

                                <div className="er-body">
                                    {/* Bloque Operativo */}
                                    <SectionDisplay section={incomeStatement.sales} colorTheme="primary" />
                                    <SectionDisplay section={incomeStatement.cogs} colorTheme="default" />

                                    <div className="my-6">
                                        <KeyResultRow
                                            label="RESULTADO BRUTO"
                                            amount={incomeStatement.grossProfit}
                                            type="gross"
                                        />
                                    </div>

                                    <SectionDisplay section={incomeStatement.adminExpenses} />
                                    <SectionDisplay section={incomeStatement.sellingExpenses} />

                                    <div className="my-6">
                                        <KeyResultRow
                                            label="RESULTADO OPERATIVO"
                                            amount={incomeStatement.operatingIncome}
                                            type="operating"
                                        />
                                    </div>

                                    {/* Bloque Financiero y Otros */}
                                    <div className="grid gap-6 md:grid-cols-2">
                                        <div className="er-subsection">
                                            <SectionDisplay section={incomeStatement.financialIncome} />
                                            <SectionDisplay section={incomeStatement.financialExpenses} />
                                            <div className="mt-2">
                                                <NetGroupResultRow
                                                    label="Resultado financiero neto"
                                                    amount={incomeStatement.netFinancialResult}
                                                />
                                            </div>
                                        </div>

                                        <div className="er-subsection">
                                            <SectionDisplay section={incomeStatement.otherIncome} />
                                            <SectionDisplay section={incomeStatement.otherExpenses} />
                                            <div className="mt-2">
                                                <NetGroupResultRow
                                                    label="Otros resultados neto"
                                                    amount={incomeStatement.netOtherResult}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* FOOTER RESULTADO DEL EJERCICIO */}
                                <div className={`er-final-result ${isNetIncomePositive ? 'is-gain' : 'is-loss'}`}>
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="final-label">RESULTADO DEL EJERCICIO</span>
                                        {isNetIncomePositive ? (
                                            <span className="final-badge badge-gain">✓ Ganancia</span>
                                        ) : (
                                            <span className="final-badge badge-loss">⚠ Pérdida</span>
                                        )}
                                    </div>
                                    <div className="final-amount">
                                        ${formatAmount(Math.abs(incomeStatement.netIncome))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Download Button */}
                        <div className="flex justify-center mt-10 mb-8">
                            <button
                                onClick={handleDownload}
                                disabled={isExporting}
                                className="btn-download"
                            >
                                {isExporting ? (
                                    <>
                                        <span className="animate-spin text-lg">⏳</span>
                                        <span>Generando PDF...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-xl">📥</span>
                                        <span>Descargar PDF</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                /* PDF Container Styles */
                .er-container-export {
                    background: #f1f5f9;
                    padding: 32px;
                    border-radius: 8px;
                    max-width: 900px;
                    margin: 0 auto;
                }
                
                .paper-card {
                    background: white;
                    padding: 40px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    border: 1px solid rgba(0,0,0,0.05);
                }

                .er-main-title {
                    text-align: center;
                    font-size: 1.8rem;
                    font-weight: 800;
                    color: #1e293b;
                    letter-spacing: -0.02em;
                    margin-bottom: 0.5rem;
                    text-transform: uppercase;
                }

                /* Section Headers Premium */
                .statement-header-wrapper {
                    border-bottom: 2px solid #e2e8f0;
                    margin-bottom: 12px;
                    padding-bottom: 4px;
                }

                .statement-group-title {
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    color: #334155; /* Blue-grey */
                    font-weight: 700;
                    letter-spacing: 0.05em;
                }

                /* Row Styles */
                .statement-rows-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1px; /* Tighter gap */
                    margin-bottom: 8px;
                }

                .statement-group {
                    margin-bottom: 24px;
                }

                .statement-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 8px;
                    font-size: 0.95rem;
                    border-radius: 4px;
                    transition: background 0.1s;
                    color: #475569;
                }

                .statement-row:hover {
                    background-color: #f8fafc;
                }

                .statement-value {
                    font-variant-numeric: tabular-nums;
                    font-weight: 500;
                    color: #1e293b;
                }

                /* Subtotals */
                .statement-subtotal {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 12px;
                    background: #f8fafc;
                    border-radius: 4px;
                    font-weight: 600;
                    font-size: 0.95rem;
                    color: #334155;
                    border-top: 1px solid #e2e8f0;
                }
                
                .statement-subtotal.theme-primary {
                    background: #eff6ff; /* Blue tint */
                    color: #1e40af;
                    border-color: #dbeafe;
                }

                /* Key Results Rows (Bruto / Operativo) */
                .key-result-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-radius: 8px;
                    margin: 16px 0;
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                }

                .key-result-row.type-gross {
                    background: #f8fafc;
                    border-left: 4px solid #94a3b8;
                }

                .key-result-row.type-operating {
                    background: #f1f5f9;
                    border-left: 4px solid #475569;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                }

                .key-label {
                    font-weight: 700;
                    font-size: 1rem;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                    color: #334155;
                }

                .key-amount {
                    font-size: 1.25rem;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    color: #1e293b;
                }

                /* Net Group Results */
                .net-group-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 12px 0;
                    border-top: 1px dashed #cbd5e1;
                    font-size: 0.95rem;
                }

                .net-label {
                    font-style: italic;
                    color: #64748b;
                    font-weight: 500;
                }

                .net-amount {
                    font-weight: 700;
                }

                .text-success-dark { color: #15803d; }
                .text-error-dark { color: #b91c1c; }

                /* Final Result */
                .er-final-result {
                    margin-top: 40px;
                    padding: 32px;
                    border-radius: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border: 1px solid transparent;
                }

                .er-final-result.is-gain {
                    background: linear-gradient(to right, #f0fdf4, #dcfce7);
                    border-color: #bbf7d0;
                    color: #166534;
                }

                .er-final-result.is-loss {
                    background: linear-gradient(to right, #fef2f2, #fee2e2);
                    border-color: #fecaca;
                    color: #991b1b;
                }

                .final-label {
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    font-weight: 700;
                    letter-spacing: 0.1em;
                    opacity: 0.9;
                }

                .final-badge {
                    font-size: 0.8rem;
                    padding: 4px 10px;
                    border-radius: 9999px;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .badge-gain {
                    background: white;
                    color: #15803d;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }

                .badge-loss {
                    background: white;
                    color: #b91c1c;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }

                .final-amount {
                    font-size: 2.2rem;
                    font-weight: 800;
                    font-variant-numeric: tabular-nums;
                    letter-spacing: -0.02em;
                }

                /* ESP Grid Styles (existing) */
                .esp-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: var(--space-xl);
                }
                @media (min-width: 1024px) {
                    .esp-grid { grid-template-columns: 1fr 1fr; }
                }
                .esp-column { display: flex; flex-direction: column; gap: var(--space-lg); }
                .section-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    margin-bottom: var(--space-md);
                    border-bottom: 2px solid currentColor;
                    padding-bottom: var(--space-xs);
                    display: inline-block;
                }
                .text-primary { color: #2563EB; }
                .text-success { color: #7C3AED; }
                .text-error { color: #DC2626; }
                .h-full { height: 100%; }
                .mt-auto { margin-top: auto; }
                .flex-1 { flex: 1; }
                .card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
                .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                .animate-slide-up { animation: slideUp 0.4s ease-out forwards; }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .statement-grand-total {
                    display: flex; justify-content: space-between;
                    font-size: 1.2rem; font-weight: 800;
                }
                .btn-download {
                    display: inline-flex; align-items: center; gap: 12px;
                    background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%);
                    color: white; padding: 12px 28px; border-radius: 9999px;
                    font-weight: 600; font-size: 1rem; cursor: pointer;
                    box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
                    transition: all 0.2s ease; border: none;
                }
                .btn-download:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3);
                    filter: brightness(1.05);
                }
                .btn-download:disabled { opacity: 0.7; cursor: not-allowed; filter: grayscale(0.5); }
            `}</style>
        </div>
    )
}

