import { useState, useMemo, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLedger } from '../hooks/useLedger'
import { formatCurrencyARS } from '../core/amortizaciones/calc'
import type { Account, Ledger, LedgerMovement } from '../core/models'
import { isMovimientoBienesDeCambio } from '../core/cierre-valuacion/auto-partidas-rt6'
import {
    buildAccountHierarchy,
    computeRollupTotals,
    getDirectTotalsFromLedger,
    type AccountHierarchy,
} from '../core/ledger/rollupBalances'
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

function getDescendantAccountIds(accountId: string, hierarchy: AccountHierarchy): string[] {
    const result: string[] = []
    const stack: string[] = [accountId]
    const visited = new Set<string>()

    while (stack.length > 0) {
        const current = stack.pop()!
        if (visited.has(current)) continue
        visited.add(current)
        result.push(current)
        const children = hierarchy.childrenById.get(current) ?? []
        for (const childId of children) {
            stack.push(childId)
        }
    }

    return result
}

function buildConsolidatedMovements(
    account: Account,
    ledger: Ledger,
    hierarchy: AccountHierarchy
): LedgerMovement[] {
    const descendants = getDescendantAccountIds(account.id, hierarchy)
    const movementRows: Array<{
        movement: LedgerMovement
        account: Account
        order: number
    }> = []

    for (const id of descendants) {
        const la = ledger.get(id)
        if (!la) continue
        la.movements.forEach((movement, index) => {
            movementRows.push({
                movement,
                account: la.account,
                order: index,
            })
        })
    }

    movementRows.sort((a, b) => {
        const dateDiff = a.movement.date.localeCompare(b.movement.date)
        if (dateDiff !== 0) return dateDiff
        const entryDiff = a.movement.entryId.localeCompare(b.movement.entryId)
        if (entryDiff !== 0) return entryDiff
        return a.order - b.order
    })

    let runningBalance = 0
    const normalSide = account.normalSide || (['ASSET', 'EXPENSE'].includes(account.kind) ? 'DEBIT' : 'CREDIT')

    return movementRows.map((row) => {
        const netMovement = row.movement.debit - row.movement.credit
        runningBalance = normalSide === 'DEBIT'
            ? runningBalance + netMovement
            : runningBalance - netMovement

        const originLabel = row.account.id === account.id
            ? ''
            : ` (${row.account.code} ${row.account.name})`

        return {
            ...row.movement,
            memo: `${row.movement.memo}${originLabel}`,
            balance: runningBalance,
        }
    })
}

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

function getRubroLabel(account?: Account): string {
    if (account && isMovimientoBienesDeCambio(account)) {
        return 'Movimiento Bienes de cambio'
    }

    const kind = account?.kind
    const type = account?.type
    const code = account?.code

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

    const rollupData = useMemo(() => {
        if (!ledger || !accounts) return null
        const hierarchy = buildAccountHierarchy(accounts)
        const directTotals = getDirectTotalsFromLedger(ledger)
        const rollupTotals = computeRollupTotals(accounts, directTotals, hierarchy)
        return { hierarchy, rollupTotals }
    }, [ledger, accounts])

    // State
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus>('all')
    const [showZero, setShowZero] = useState(false)
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
    const [isFullView, setIsFullView] = useState(false)

    // Transform ledger data to summary rows
    const summaryRows = useMemo<LedgerSummaryRow[]>(() => {
        if (!ledger || !accounts || !rollupData) return []

        const rows: LedgerSummaryRow[] = []

        ledger.forEach((la) => {
            // Filter out header accounts (non-imputable)
            if (la.account.isHeader) return

            const rollup = rollupData.rollupTotals.get(la.account.id)
            if (!rollup) return

            const status = getAccountStatus(rollup.balance)
            const rubroLabel = getRubroLabel(la.account)

            rows.push({
                id: la.account.id,
                code: la.account.code,
                name: la.account.name,
                kind: la.account.kind,
                group: la.account.group,
                rubroLabel,
                totalDebit: rollup.totalDebit,
                totalCredit: rollup.totalCredit,
                balance: rollup.balance,
                status,
            })
        })

        // Sort by code
        return rows.sort((a, b) => a.code.localeCompare(b.code))
    }, [ledger, accounts, rollupData])

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
        if (!selectedAccountId || !ledger || !rollupData) return null

        const la = ledger.get(selectedAccountId)
        if (!la) return null

        const rollup = rollupData.rollupTotals.get(selectedAccountId)
        if (!rollup) return null

        const movements = buildConsolidatedMovements(la.account, ledger, rollupData.hierarchy)
        const lastMovements = [...movements]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5)

        const status = getAccountStatus(rollup.balance)

        return {
            id: la.account.id,
            code: la.account.code,
            name: la.account.name,
            kind: la.account.kind,
            group: la.account.group,
            rubroLabel: getRubroLabel(la.account),
            totalDebit: rollup.totalDebit,
            totalCredit: rollup.totalCredit,
            balance: rollup.balance,
            status,
            lastMovements,
        }
    }, [selectedAccountId, ledger, rollupData])

    // Get selected account data for full view
    const selectedFullAccount = useMemo<FullViewAccount | null>(() => {
        if (!selectedAccountId || !ledger || !rollupData) return null

        const la = ledger.get(selectedAccountId)
        if (!la) return null

        const rollup = rollupData.rollupTotals.get(selectedAccountId)
        if (!rollup) return null

        const movements = buildConsolidatedMovements(la.account, ledger, rollupData.hierarchy)
        const status = getAccountStatus(rollup.balance)

        return {
            id: la.account.id,
            code: la.account.code,
            name: la.account.name,
            kind: la.account.kind,
            totalDebit: rollup.totalDebit,
            totalCredit: rollup.totalCredit,
            balance: rollup.balance,
            status,
            movements,
        }
    }, [selectedAccountId, ledger, rollupData])

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
            <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-body text-slate-900 transition-colors duration-300">
                <div className="max-w-7xl mx-auto">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                        Cargando libro mayor...
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-body text-slate-900 transition-colors duration-300">
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
