import { useState, useMemo, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLedger } from '../hooks/useLedger'
import { formatCurrencyARS } from '../core/amortizaciones/calc'
import type { AccountKind, AccountType } from '../core/models'
import {
    LedgerHero,
    LedgerToolbar,
    LedgerSummaryTable,
    LedgerQuickDrawer,
    LedgerFullView,
    type AccountStatus,
    type LedgerSummaryRow,
    type DrawerAccount,
    type FullViewAccount,
} from '../components/ledger'

const ZERO_EPSILON = 0.0001

/**
 * Determines account status based on balance sign
 */
function getAccountStatus(balance: number): AccountStatus {
    if (Math.abs(balance) < ZERO_EPSILON) return 'Saldada'
    return balance > 0 ? 'Deudor' : 'Acreedor'
}

function inferRubroFromCode(code: string): string {
    const firstSegment = code.split('.')[0]
    const firstDigit = Number.parseInt(firstSegment, 10)

    if (firstDigit === 1) return 'Activo'
    if (firstDigit === 2) return 'Pasivo'
    if (firstDigit === 3) return 'PN'
    if (firstDigit === 4) return 'Resultado'

    return 'Movimiento'
}

function getRubroLabel(kind?: AccountKind, type?: AccountType, code?: string): string {
    if (kind) {
        if (kind === 'ASSET') return 'Activo'
        if (kind === 'LIABILITY') return 'Pasivo'
        if (kind === 'EQUITY') return 'PN'
        if (kind === 'INCOME' || kind === 'EXPENSE') return 'Resultado'
    }

    if (type) {
        if (type === 'Activo') return 'Activo'
        if (type === 'Pasivo') return 'Pasivo'
        if (type === 'PatrimonioNeto') return 'PN'
        if (type === 'Ingreso' || type === 'Gasto') return 'Resultado'
    }

    return code ? inferRubroFromCode(code) : 'Movimiento'
}

export default function Mayor() {
    const { ledger, accounts } = useLedger()

    // State
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus>('all')
    const [showZero, setShowZero] = useState(false)
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
    const [isFullView, setIsFullView] = useState(false)

    // Transform ledger data to summary rows
    const summaryRows = useMemo<LedgerSummaryRow[]>(() => {
        if (!ledger || !accounts) return []

        const rows: LedgerSummaryRow[] = []

        ledger.forEach((la) => {
            // Filter out header accounts (non-imputable)
            if (la.account.isHeader) return

            const status = getAccountStatus(la.balance)
            const rubroLabel = getRubroLabel(
                la.account.kind,
                la.account.type,
                la.account.code
            )

            rows.push({
                id: la.account.id,
                code: la.account.code,
                name: la.account.name,
                kind: la.account.kind,
                group: la.account.group,
                rubroLabel,
                totalDebit: la.totalDebit,
                totalCredit: la.totalCredit,
                balance: la.balance,
                status,
            })
        })

        // Sort by code
        return rows.sort((a, b) => a.code.localeCompare(b.code))
    }, [ledger, accounts])

    // Apply filters
    const filteredRows = useMemo(() => {
        return summaryRows.filter((row) => {
            // Search filter
            const query = search.trim().toLowerCase()
            const matchesSearch =
                !query ||
                row.name.toLowerCase().includes(query) ||
                row.code.toLowerCase().includes(query) ||
                row.group.toLowerCase().includes(query) ||
                row.rubroLabel.toLowerCase().includes(query)

            // Status filter
            const matchesStatus = filterStatus === 'all' || row.status === filterStatus

            // ShowZero filter
            const hasMovements = row.totalDebit > 0 || row.totalCredit > 0
            const matchesZero = showZero || hasMovements

            return matchesSearch && matchesStatus && matchesZero
        })
    }, [summaryRows, search, filterStatus, showZero])

    // Get selected account data for drawer
    const selectedDrawerAccount = useMemo<DrawerAccount | null>(() => {
        if (!selectedAccountId || !ledger) return null

        const la = ledger.get(selectedAccountId)
        if (!la) return null

        const status = getAccountStatus(la.balance)
        const lastMovements = [...la.movements]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5)

        return {
            id: la.account.id,
            code: la.account.code,
            name: la.account.name,
            kind: la.account.kind,
            group: la.account.group,
            rubroLabel: getRubroLabel(
                la.account.kind,
                la.account.type,
                la.account.code
            ),
            totalDebit: la.totalDebit,
            totalCredit: la.totalCredit,
            balance: la.balance,
            status,
            lastMovements,
        }
    }, [selectedAccountId, ledger])

    // Get selected account data for full view
    const selectedFullAccount = useMemo<FullViewAccount | null>(() => {
        if (!selectedAccountId || !ledger) return null

        const la = ledger.get(selectedAccountId)
        if (!la) return null

        const status = getAccountStatus(la.balance)

        return {
            id: la.account.id,
            code: la.account.code,
            name: la.account.name,
            kind: la.account.kind,
            totalDebit: la.totalDebit,
            totalCredit: la.totalCredit,
            balance: la.balance,
            status,
            movements: la.movements,
        }
    }, [selectedAccountId, ledger])

    // Handlers
    const handleRowClick = useCallback((row: LedgerSummaryRow) => {
        setSelectedAccountId(row.id)
    }, [])

    const handleCloseDrawer = useCallback(() => {
        setSelectedAccountId(null)
    }, [])

    const handleOpenFull = useCallback(() => {
        setIsFullView(true)
    }, [])

    const handleBackToSummary = useCallback(() => {
        setIsFullView(false)
        setSelectedAccountId(null)
    }, [])

    const handleExportPDF = useCallback(() => {
        // TODO: Implement PDF export
    }, [])

    const handleDownloadSummaryPDF = useCallback(() => {
        // TODO: Implement summary PDF export
    }, [])

    const handleDownloadDetailPDF = useCallback(() => {
        // TODO: Implement detail PDF export
    }, [])

    // Close drawer on ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedAccountId && !isFullView) {
                handleCloseDrawer()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [selectedAccountId, isFullView, handleCloseDrawer])

    // Loading state
    if (!ledger || !accounts) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 font-body text-slate-900 dark:text-slate-100 transition-colors duration-300">
                <div className="max-w-7xl mx-auto">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-500 dark:text-slate-400">
                        Cargando libro mayor...
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 font-body text-slate-900 dark:text-slate-100 transition-colors duration-300">
            <div className="max-w-7xl mx-auto">
                <AnimatePresence mode="wait">
                {!isFullView ? (
                    <motion.div
                        key="summary"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                    >
                        <LedgerHero onExportPDF={handleExportPDF} />

                        <LedgerToolbar
                            search={search}
                            onSearchChange={setSearch}
                            filterStatus={filterStatus}
                            onFilterStatusChange={setFilterStatus}
                            showZero={showZero}
                            onShowZeroChange={setShowZero}
                        />

                        <LedgerSummaryTable
                            data={filteredRows}
                            onRowClick={handleRowClick}
                            formatCurrency={formatCurrencyARS}
                        />
                    </motion.div>
                ) : (
                    selectedFullAccount && (
                        <LedgerFullView
                            key="fullview"
                            account={selectedFullAccount}
                            onBack={handleBackToSummary}
                            formatCurrency={formatCurrencyARS}
                            onDownloadDetail={handleDownloadDetailPDF}
                        />
                    )
                )}
                </AnimatePresence>

                {/* Drawer - only show when not in full view */}
                {!isFullView && (
                    <LedgerQuickDrawer
                        account={selectedDrawerAccount}
                        onClose={handleCloseDrawer}
                        onOpenFull={handleOpenFull}
                        formatCurrency={formatCurrencyARS}
                        onDownloadSummary={handleDownloadSummaryPDF}
                    />
                )}
            </div>
        </div>
    )
}
