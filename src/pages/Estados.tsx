import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { computeTrialBalance } from '../core/balance'
import { computeStatements } from '../core/statements'
import { excludeClosingEntries } from '../utils/resultsStatement'
import { exportElementToPdf } from '../utils/exportPdf'
import type { StatementSection, BalanceSheet } from '../core/models'
import {
    EstadoSituacionPatrimonialGemini,
    type SectionData,
    type AccountLine
} from '../components/Estados/EstadoSituacionPatrimonialGemini'
import { EstadoResultadosDocument } from '../components/Estados/EstadoResultados'
import { buildEstadoResultados, getFiscalYearDates } from '../domain/reports/estadoResultados'
import { ImportComparativeModal, type ImportedRecord } from '../components/Estados/EstadoResultados/ImportComparativeModal'

// New components for redesigned header/toolbar
import { EstadosHeader, type EstadosTab } from '../components/Estados/EstadosHeader'
import { DocumentToolbar } from '../components/Estados/DocumentToolbar'
import { ESPImportComparativeModal } from '../components/Estados/ESPImportComparativeModal'
import {
    loadESPComparative,
    clearESPComparative,
    createComparativeLookup
} from '../storage/espComparativeStore'
import { EvolucionPNTab } from '../components/Estados/EvolucionPNTab'
import { NotasAnexosTab } from '../components/Estados/NotasAnexosTab'

// ============================================
// Data Adapter: BalanceSheet → Gemini Format
// ============================================
function adaptSectionToGemini(section: StatementSection, comparativeData?: Map<string, number>): SectionData {
    const items: AccountLine[] = section.accounts.map((item, idx) => ({
        id: item.account.id || `item-${idx}`,
        code: item.account.code,
        label: item.account.name,
        amount: item.balance,
        level: 2 as const,
        isContra: item.isContra,
        comparativeAmount: comparativeData?.get(item.account.code)
    }))

    // Add total row
    if (items.length > 0) {
        // Calculate comparative total for section
        const comparativeTotal = items.reduce((sum, item) => {
            return sum + (item.comparativeAmount ?? 0)
        }, 0)

        items.push({
            id: `${section.key}-total`,
            label: `Total ${section.label}`,
            amount: section.netTotal,
            level: 2 as const,
            isTotal: true,
            comparativeAmount: comparativeData ? comparativeTotal : undefined
        })
    }

    return {
        title: section.label,
        items
    }
}

function adaptBalanceSheetToGemini(bs: BalanceSheet, comparativeData?: Map<string, number>) {
    const TOLERANCE = 0.05
    const diff = bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)
    const isBalanced = Math.abs(diff) < TOLERANCE

    const activoSections = [
        adaptSectionToGemini(bs.currentAssets, comparativeData),
        adaptSectionToGemini(bs.nonCurrentAssets, comparativeData)
    ].filter(s => s.items.length > 0)

    const pasivoSections = [
        adaptSectionToGemini(bs.currentLiabilities, comparativeData),
        adaptSectionToGemini(bs.nonCurrentLiabilities, comparativeData)
    ].filter(s => s.items.length > 0)

    // Calculate comparative totals
    const comparativeTotalActivo = comparativeData
        ? activoSections.reduce((sum, s) => {
            const totalItem = s.items.find(i => i.isTotal)
            return sum + (totalItem?.comparativeAmount ?? 0)
        }, 0)
        : undefined

    const comparativeTotalPasivo = comparativeData
        ? pasivoSections.reduce((sum, s) => {
            const totalItem = s.items.find(i => i.isTotal)
            return sum + (totalItem?.comparativeAmount ?? 0)
        }, 0)
        : undefined

    // PN comparative
    const pnItems: AccountLine[] = bs.equity.accounts.map((item, idx) => ({
        id: item.account.id || `pn-${idx}`,
        code: item.account.code,
        label: item.account.name,
        amount: item.balance,
        level: 2,
        isContra: item.isContra,
        comparativeAmount: comparativeData?.get(item.account.code)
    }))

    const comparativeTotalPN = pnItems.reduce((sum, item) => {
        return sum + (item.comparativeAmount ?? 0)
    }, 0)

    if (bs.equity.accounts.length > 0) {
        pnItems.push({
            id: 'pn-total',
            label: 'Total Patrimonio Neto',
            amount: bs.totalEquity,
            level: 2 as const,
            isTotal: true,
            comparativeAmount: comparativeData ? comparativeTotalPN : undefined
        })
    }

    return {
        activoSections,
        pasivoSections,
        patrimonioNetoSection: {
            title: 'Patrimonio Neto',
            items: pnItems
        },
        totalActivo: bs.totalAssets,
        totalPasivo: bs.totalLiabilities,
        totalPN: bs.totalEquity,
        isBalanced,
        diff,
        comparativeTotalActivo,
        comparativeTotalPasivo,
        comparativeTotalPN: comparativeData ? comparativeTotalPN : undefined
    }
}

// ============================================
// Main Component
// ============================================
export default function Estados() {
    // Tab control (extended to support all 5 states)
    const [activeTab, setActiveTab] = useState<EstadosTab>('ESP')
    const viewMode = activeTab === 'ESP' ? 'ESP' : activeTab === 'ER' ? 'ER' : activeTab === 'EPN' ? 'EPN' : activeTab === 'NA' ? 'NA' : 'ESP'

    const [isExporting, setIsExporting] = useState(false)

    // Current year for periods
    const currentYear = new Date().getFullYear()

    // ============================================
    // Estado de Resultados (ER) Controls
    // ============================================
    const [erSelectedYear, setErSelectedYear] = useState(currentYear)
    const [erShowComparative, setErShowComparative] = useState(false)
    const [erShowDetails, setErShowDetails] = useState(true)
    const erFiscalYears = useMemo(() => [currentYear, currentYear - 1, currentYear - 2], [currentYear])
    const [erImportModalOpen, setErImportModalOpen] = useState(false)
    const [erComparativeOverrides, setErComparativeOverrides] = useState<Map<string, number>>(new Map())

    // ============================================
    // Estado de Situación Patrimonial (ESP) Controls - NEW
    // ============================================
    const [espShowComparative, setEspShowComparative] = useState(false)
    const [espComparativeYear, setEspComparativeYear] = useState(currentYear - 1)
    const [espImportModalOpen, setEspImportModalOpen] = useState(false)
    const [espComparativeData, setEspComparativeData] = useState<Map<string, number> | null>(null)
    const espAvailableYears = useMemo(() => [currentYear - 1, currentYear - 2, currentYear - 3], [currentYear])

    // Empresa ID (hardcoded for now, could be from context/store)
    const empresaId = 'default'
    const empresaName = 'Mi Empresa S.A.'

    // Load ESP comparative from storage on mount/year change
    useEffect(() => {
        const records = loadESPComparative(empresaId, espComparativeYear)
        if (records) {
            setEspComparativeData(createComparativeLookup(records))
        } else {
            setEspComparativeData(null)
        }
    }, [espComparativeYear, espImportModalOpen]) // Re-check after modal closes

    const hasEspComparativeData = espComparativeData !== null && espComparativeData.size > 0

    // ============================================
    // ER Comparative handlers (existing)
    // ============================================
    useEffect(() => {
        const comparativeYear = erSelectedYear - 1
        const key = `estadoResultados:comparativo:${comparativeYear}`
        const stored = localStorage.getItem(key)
        if (stored) {
            try {
                const parsed = JSON.parse(stored)
                if (Array.isArray(parsed)) {
                    setErComparativeOverrides(new Map(parsed))
                }
            } catch (e) {
                console.error('Error loading comparative overrides', e)
            }
        } else {
            setErComparativeOverrides(new Map())
        }
    }, [erSelectedYear])

    const handleErImportComparative = useCallback((records: ImportedRecord[]) => {
        const comparativeYear = erSelectedYear - 1
        const map = new Map<string, number>()
        records.forEach(r => map.set(r.code, r.amount))

        setErComparativeOverrides(map)
        setErImportModalOpen(false)

        const key = `estadoResultados:comparativo:${comparativeYear}`
        localStorage.setItem(key, JSON.stringify(Array.from(map.entries())))
    }, [erSelectedYear])

    const handleErDeleteComparative = useCallback(() => {
        if (!confirm('¿Estás seguro de que querés borrar los datos importados?')) return

        const comparativeYear = erSelectedYear - 1
        setErComparativeOverrides(new Map())
        localStorage.removeItem(`estadoResultados:comparativo:${comparativeYear}`)
    }, [erSelectedYear])

    // ============================================
    // ESP Comparative handlers - NEW
    // ============================================
    const handleEspToggleComparative = useCallback((value: boolean) => {
        setEspShowComparative(value)
        // If turning on without data, the toolbar will trigger import modal via onImportClick
    }, [])

    const handleEspImportSuccess = useCallback(() => {
        // Reload data from storage
        const records = loadESPComparative(empresaId, espComparativeYear)
        if (records) {
            setEspComparativeData(createComparativeLookup(records))
            setEspShowComparative(true)
        }
    }, [espComparativeYear, empresaId])

    const handleEspClearComparative = useCallback(() => {
        if (!confirm(`¿Estás seguro de que querés borrar los datos comparativos de ${espComparativeYear}?`)) return

        clearESPComparative(empresaId, espComparativeYear)
        setEspComparativeData(null)
        setEspShowComparative(false)
    }, [espComparativeYear, empresaId])

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

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

    // ============================================
    // Data Loading
    // ============================================
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    const statements = useMemo(() => {
        if (!accounts || !entries || entries.length === 0) return null

        const entriesWithoutClosing = excludeClosingEntries(entries, accounts)
        const ledger = computeLedger(entriesWithoutClosing, accounts)
        const trialBalance = computeTrialBalance(ledger, accounts)
        return computeStatements(trialBalance, accounts)
    }, [accounts, entries])

    const estadoResultadosData = useMemo(() => {
        if (!accounts || !entries) return null

        const { fromDate, toDate } = getFiscalYearDates(erSelectedYear)
        const { fromDate: compFromDate, toDate: compToDate } = getFiscalYearDates(erSelectedYear - 1)

        return buildEstadoResultados({
            accounts,
            entries,
            fromDate,
            toDate,
            fiscalYear: erSelectedYear,
            comparativeFromDate: compFromDate,
            comparativeToDate: compToDate,
            comparativeOverrides: erComparativeOverrides
        })
    }, [accounts, entries, erSelectedYear, erComparativeOverrides])

    // ============================================
    // ESP Info Items (for toolbar accordion)
    // ============================================
    const espInfoItems = [
        'Muestra lo que tenés (Activo) y lo que debés (Pasivo/PN).',
        'La ecuación fundamental debe dar cero: Activo = Pasivo + PN.',
        'Usá el modo comparativo para ver la evolución interanual.'
    ]

    /* Unused
    const erInfoItems = [
        'Muestra ingresos y gastos del período.',
        'El resultado neto indica si hay ganancia o pérdida.',
        'Comparalo con el año anterior para ver la evolución.'
    ]
    */

    // ============================================
    // Empty/Loading States (with new header)
    // ============================================
    if (!entries?.length) {
        return (
            <div className="estados-page">
                <EstadosHeader
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    empresaName={empresaName}
                />
                <main className="estados-main">
                    <div className="card">
                        <div className="empty-state">
                            <div className="empty-state-icon">📈</div>
                            <p>No hay asientos registrados. Cargá algunos para ver los estados contables.</p>
                        </div>
                    </div>
                </main>
                <style>{pageStyles}</style>
            </div>
        )
    }

    if (!statements) {
        return (
            <div className="estados-page">
                <EstadosHeader
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    empresaName={empresaName}
                />
                <main className="estados-main">
                    <div className="empty-state">
                        <div className="empty-state-icon">⏳</div>
                        <p>Cargando información...</p>
                    </div>
                </main>
                <style>{pageStyles}</style>
            </div>
        )
    }

    const { balanceSheet } = statements

    // ============================================
    // Render
    // ============================================
    return (
        <div className="estados-page">
            {/* New Header with tabs */}
            <EstadosHeader
                activeTab={activeTab}
                onTabChange={setActiveTab}
                empresaName={empresaName}
            />

            <main className="estados-main">
                {/* ESP View */}
                {viewMode === 'ESP' && (
                    <div className="animate-slide-up">
                        {/* Document Toolbar */}
                        <DocumentToolbar
                            showComparative={espShowComparative}
                            onToggleComparative={handleEspToggleComparative}
                            comparativeYear={espComparativeYear}
                            availableYears={espAvailableYears}
                            onYearChange={setEspComparativeYear}
                            hasComparativeData={hasEspComparativeData}
                            onImportClick={() => setEspImportModalOpen(true)}
                            onClearClick={handleEspClearComparative}
                            infoTitle="Sobre este estado"
                            infoItems={espInfoItems}
                            onDownloadPdf={handleDownload}
                            isExporting={isExporting}
                        />

                        {/* ESP Document */}
                        {(() => {
                            const comparativeMap = espShowComparative && hasEspComparativeData
                                ? espComparativeData
                                : undefined
                            const geminiData = adaptBalanceSheetToGemini(balanceSheet, comparativeMap ?? undefined)

                            return (
                                <EstadoSituacionPatrimonialGemini
                                    loading={false}
                                    entidad={empresaName}
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
                                    // Comparative props
                                    showComparative={espShowComparative && hasEspComparativeData}
                                    comparativeYear={espComparativeYear}
                                    currentYear={currentYear}
                                    comparativeTotalActivo={geminiData.comparativeTotalActivo}
                                    comparativeTotalPasivo={geminiData.comparativeTotalPasivo}
                                    comparativeTotalPN={geminiData.comparativeTotalPN}
                                />
                            )
                        })()}

                        {/* Overlay CTA when comparative is ON but no data */}
                        {espShowComparative && !hasEspComparativeData && (
                            <div className="esp-overlay-cta">
                                <div className="esp-overlay-card">
                                    <div className="esp-overlay-icon">📄</div>
                                    <h3>Faltan datos de {espComparativeYear}</h3>
                                    <p>Para ver la comparación, necesitás importar el balance del ejercicio anterior.</p>
                                    <button
                                        className="esp-overlay-btn"
                                        onClick={() => setEspImportModalOpen(true)}
                                    >
                                        Importar Comparativo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ER View (existing, with minimal changes) */}
                {viewMode === 'ER' && estadoResultadosData && (
                    <div className="animate-slide-up">
                        <EstadoResultadosDocument
                            data={estadoResultadosData}
                            showComparative={erShowComparative}
                            showDetails={erShowDetails}
                            fiscalYear={erSelectedYear}
                            fiscalYears={erFiscalYears}
                            onToggleComparative={() => setErShowComparative(p => !p)}
                            onToggleDetails={() => setErShowDetails(p => !p)}
                            onYearChange={setErSelectedYear}
                            onPrint={handlePrint}
                            onImportComparative={() => setErImportModalOpen(true)}
                            onDeleteComparative={handleErDeleteComparative}
                            hasComparativeData={erComparativeOverrides.size > 0}
                        />
                    </div>
                )}

                {/* EPN View - Evolución del Patrimonio Neto */}
                {viewMode === 'EPN' && accounts && entries && (
                    <div className="animate-slide-up">
                        <EvolucionPNTab
                            accounts={accounts}
                            entries={entries}
                            fiscalYear={currentYear}
                            empresaName={empresaName}
                            netIncomeFromER={estadoResultadosData?.resultadoNeto}
                            pnFromBalance={statements?.balanceSheet.totalEquity}
                        />
                    </div>
                )}

                {/* NA View - Notas y Anexos */}
                {viewMode === 'NA' && statements && accounts && entries && (
                    <div className="animate-slide-up">
                        <NotasAnexosTab
                            balanceSheet={statements.balanceSheet}
                            incomeStatement={statements.incomeStatement}
                            accounts={accounts}
                            entries={entries}
                            fiscalYear={currentYear}
                            empresaName={empresaName}
                            empresaId={empresaId}
                            comparativeData={espShowComparative && hasEspComparativeData ? espComparativeData ?? undefined : undefined}
                        />
                    </div>
                )}
            </main>

            {/* Modals */}
            <ESPImportComparativeModal
                isOpen={espImportModalOpen}
                onClose={() => setEspImportModalOpen(false)}
                onSuccess={handleEspImportSuccess}
                targetYear={espComparativeYear}
                currentYear={currentYear}
                empresaId={empresaId}
                accounts={accounts || []}
            />

            <ImportComparativeModal
                isOpen={erImportModalOpen}
                onClose={() => setErImportModalOpen(false)}
                onImport={handleErImportComparative}
                onClean={handleErDeleteComparative}
                targetYear={erSelectedYear - 1}
                accounts={accounts || []}
                hasComparativeData={erComparativeOverrides.size > 0}
            />

            <style>{pageStyles}</style>
        </div>
    )
}

// ============================================
// Page Styles
// ============================================
const pageStyles = `
.estados-page {
    min-height: 100vh;
    background: #f8fafc;
}

.estados-main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px 16px;
    position: relative;
}

@media (min-width: 640px) {
    .estados-main {
        padding: 32px 24px;
    }
}

@media (min-width: 1024px) {
    .estados-main {
        padding: 32px;
    }
}

/* Animation */
.animate-slide-up {
    animation: slideUp 0.4s ease-out forwards;
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 64px 32px;
    color: #64748b;
}

.empty-state-icon {
    font-size: 3rem;
    margin-bottom: 16px;
}

/* Card */
.card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    border: 1px solid #f1f5f9;
}

/* ESP Overlay CTA */
.esp-overlay-cta {
    position: fixed;
    inset: 0;
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(8px);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.esp-overlay-card {
    background: white;
    padding: 32px 48px;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    border: 1px solid #e2e8f0;
    text-align: center;
    max-width: 400px;
}

.esp-overlay-icon {
    font-size: 3rem;
    margin-bottom: 16px;
}

.esp-overlay-card h3 {
    font-family: var(--font-display, 'Outfit', sans-serif);
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px;
}

.esp-overlay-card p {
    color: #64748b;
    font-size: 0.9rem;
    margin: 0 0 24px;
}

.esp-overlay-btn {
    width: 100%;
    padding: 12px 24px;
    background: #3B82F6;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    transition: all 0.2s ease;
}

.esp-overlay-btn:hover {
    background: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}
`
