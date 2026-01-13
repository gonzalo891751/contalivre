import { useState, useMemo, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLedger } from '../hooks/useLedger'
import { formatCurrencyARS } from '../core/amortizaciones/calc'
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

/**
 * Determines account status based on balance and account kind
 */
function getAccountStatus(balance: number, kind: string): AccountStatus {
    if (balance === 0) return 'Saldada'

    // For ASSET/EXPENSE: positive balance is natural (Deudor)
    // For LIABILITY/EQUITY/INCOME: positive balance is natural (Acreedor)
    const isDebitNatural = kind === 'ASSET' || kind === 'EXPENSE'

    if (isDebitNatural) {
        return balance > 0 ? 'Deudor' : 'Acreedor'
    } else {
        return balance > 0 ? 'Acreedor' : 'Deudor'
    }
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

            const status = getAccountStatus(la.balance, la.account.kind)

            rows.push({
                id: la.account.id,
                code: la.account.code,
                name: la.account.name,
                kind: la.account.kind,
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
            const matchesSearch =
                !search ||
                row.name.toLowerCase().includes(search.toLowerCase()) ||
                row.code.toLowerCase().includes(search.toLowerCase())

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

        const status = getAccountStatus(la.balance, la.account.kind)
        const lastMovements = la.movements.slice(-5).reverse()

        return {
            id: la.account.id,
            code: la.account.code,
            name: la.account.name,
            kind: la.account.kind,
            group: la.account.group,
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

        const status = getAccountStatus(la.balance, la.account.kind)

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
        console.log('Export PDF clicked')
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
            <div className="ledger-page">
                <div className="ledger-loading">
                    <p>Cargando libro mayor...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="ledger-page">
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
                />
            )}
        </div>
    )
}
