import { useState, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { getAccountClass, RUBRO_CONFIG } from '../core/account-classification' // [NEW] Import

import AccountSearchSelect, { AccountSearchSelectRef } from '../ui/AccountSearchSelect'
import BrandSegmentedToggle from '../ui/BrandSegmentedToggle'
import BrandSwitch from '../ui/BrandSwitch'

type ViewMode = 'single' | 'all'
type SortField = 'balance' | 'name' | 'code' | 'rubro' // [MODIFIED] added rubro
type SortOrder = 'asc' | 'desc'

// Badge Component Logic (Moved outside)
const RubroBadge = ({ config }: { config: typeof RUBRO_CONFIG['activo'] }) => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        fontSize: '0.70rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: config.color,
        backgroundColor: `rgba(${config.bgTint}, 0.12)`,
        border: `1px solid rgba(${config.bgTint}, 0.2)`,
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
        transition: 'all 0.2s ease',
        cursor: 'default'
    }} className="rubro-badge">
        {/* Optional Icon if desired, user said "sutil" */}
        {/* <span style={{ opacity: 0.8, fontSize: '0.8rem' }}>{config.icon}</span> */}
        {/* User said "chip/pill con color + texto (y si podés, un ícono sutil)" */}
        {/* Let's try text only for cleaner look first, or very small icon */}
        <span style={{ opacity: 0.7, fontSize: '0.85em', filter: 'grayscale(0.2)' }}>{config.icon}</span>
        <span>{config.label}</span>
    </span>
)

export default function Mayor() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    // --- State ---
    // User Requirement: ALWAYS default to 'all' when entering. Ignore localStorage for initial state.
    const [viewMode, setViewMode] = useState<ViewMode>('all')

    // Filters for "Todas las cuentas"
    const [showZeroMovement, setShowZeroMovement] = useState(false)
    const [showParents, setShowParents] = useState(false)

    const [selectedAccountId, setSelectedAccountId] = useState('')

    // "Todas las cuentas" table state
    const [filterText, setFilterText] = useState('')
    const [sortField, setSortField] = useState<SortField>('rubro') // [MODIFIED] Default sort by Rubro (which usually implies code structure too)
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc') // Ascending for rubros

    const searchRef = useRef<AccountSearchSelectRef>(null)

    // --- Actions ---
    const handleViewModeChange = (mode: ViewMode) => {
        setViewMode(mode)
        // We still save it in case we want it later, but current req is forced default.
        localStorage.setItem('mayor_view_mode', mode)
    }

    const switchToSingleAccount = (accountId: string) => {
        setSelectedAccountId(accountId)
        handleViewModeChange('single')
    }

    // --- Computations ---
    const ledger = useMemo(() => {
        if (!accounts || !entries) return null
        return computeLedger(entries, accounts)
    }, [accounts, entries])

    // Single view derived data
    const selectedAccount = accounts?.find((a) => a.id === selectedAccountId)
    const ledgerAccount = ledger && selectedAccountId ? ledger.get(selectedAccountId) : null

    // [NEW] Selected Account Rubro for Badge in Single View
    // We pass the total balance from ledgerAccount if available
    const selectedAccountRubro = selectedAccount
        ? getAccountClass(selectedAccount, ledgerAccount ? { debit: ledgerAccount.totalDebit, credit: ledgerAccount.totalCredit } : undefined)
        : 'unknown'
    const selectedRubroConfig = RUBRO_CONFIG[selectedAccountRubro]

    // Parent Aggregation Logic
    // We calculate "Aggregated Totals" (Direct + Children) to support the "Include Parents" toggle properly.
    const aggregatedData = useMemo(() => {
        const map = new Map<string, { debit: number, credit: number }>()
        if (!ledger || !accounts) return map

        // 1. Start with direct movements from the ledger
        // ledger contains all accounts, but we only care about those with actual values eventually
        for (const [id, acc] of ledger.entries()) {
            if (!map.has(id)) map.set(id, { debit: 0, credit: 0 })
            const current = map.get(id)!
            current.debit += acc.totalDebit
            current.credit += acc.totalCredit
        }

        // 2. Propagate up the tree
        // We need to ensure we process leaves first or just iterate enough. 
        // A simple way is to iterate all accounts and walk up the chain for each non-zero value.
        // But since we pre-filled map with direct values, we can just walk up for every account that has value.
        // Optimisation: Sort by level desc to process leaves first?
        // Simpler/Robust: For every account with direct activity, add to all ancestors.

        // Let's rebuild the map to be safe and clear.
        const aggMap = new Map<string, { debit: number, credit: number }>()

        // Initialize aggMap with 0 for all known accounts (to avoid undefined)
        accounts.forEach(a => aggMap.set(a.id, { debit: 0, credit: 0 }))

        // For each account in ledger with DIRECT activity:
        for (const [id, acc] of ledger.entries()) {
            if (acc.totalDebit === 0 && acc.totalCredit === 0) continue

            // Add to self
            const self = aggMap.get(id)!
            self.debit += acc.totalDebit
            self.credit += acc.totalCredit

            // Add to ancestors
            let curr = accounts.find(a => a.id === id)
            while (curr && curr.parentId) {
                const parentId = curr.parentId
                const parentAgg = aggMap.get(parentId)
                if (parentAgg) {
                    parentAgg.debit += acc.totalDebit
                    parentAgg.credit += acc.totalCredit
                }
                curr = accounts.find(a => a.id === parentId)
            }
        }

        return aggMap
    }, [ledger, accounts])


    // All view derived data (Summary list)
    const allAccountsSummary = useMemo(() => {
        if (!ledger || !accounts) return []
        const list = []
        for (const account of accounts) {
            const ledgerDirect = ledger.get(account.id)
            if (!ledgerDirect) continue

            const agg = aggregatedData.get(account.id) || { debit: 0, credit: 0 }

            // DECISION: Which numbers to show?
            // If showing parents, we likely want to show the AGGREGATED numbers for parents.
            // For leaves, aggregated === direct.
            // If !showParents, we usually want to hide parents, OR show them with 0 if forced?
            // User requirement: "If Include Parents ON: Show mothers with summed totals."

            // Values to use for display/logic depending on mode
            const displayDebit = showParents ? agg.debit : ledgerDirect.totalDebit
            const displayCredit = showParents ? agg.credit : ledgerDirect.totalCredit

            const hasDirectMovement = ledgerDirect.totalDebit > 0 || ledgerDirect.totalCredit > 0
            const hasAggregatedMovement = agg.debit > 0 || agg.credit > 0

            // Filtering Rules

            // 1. Zero Movement Filter
            // If we hide zero movements, we check the RELEVANT movement type (Aggregated or Direct)
            const relevantMovement = showParents ? hasAggregatedMovement : hasDirectMovement
            if (!showZeroMovement && !relevantMovement) {
                continue
            }

            // 2. Parent/Header Filter
            // If !showParents, we hide accounts that are headers/parents.
            // We use `account.isHeader` if available, otherwise heuristic (no direct movement but children exist? hard to know here).
            // We trust `isHeader` from the model or assume standard accounts.
            if (!showParents && account.isHeader) {
                continue
            }

            // Calculation
            const rawDelta = displayDebit - displayCredit

            let type: 'Deudor' | 'Acreedor' | 'Saldada' = 'Saldada'
            if (rawDelta > 0.005) type = 'Deudor'
            else if (rawDelta < -0.005) type = 'Acreedor'

            // [NEW] Classification - Now passing balance for Dynamic Results
            const rubroKey = getAccountClass(account, { debit: displayDebit, credit: displayCredit })
            const rubroConfig = RUBRO_CONFIG[rubroKey]

            list.push({
                id: account.id,
                code: account.code,
                name: account.name,
                debit: displayDebit,
                credit: displayCredit,
                balance: Math.abs(rawDelta),
                balanceTypeLabel: type, // Renamed to avoid confusion with Rubro config
                rawDelta,
                isHeader: account.isHeader,
                kind: account.kind, // Pass kind for KPIs
                rubroKey,     // [NEW]
                rubroConfig,  // [NEW]
            })
        }
        return list
    }, [ledger, accounts, aggregatedData, showZeroMovement, showParents])

    const filteredAndSortedAccounts = useMemo(() => {
        let result = [...allAccountsSummary]

        if (filterText) {
            const lower = filterText.toLowerCase()
            result = result.filter(a =>
                a.name.toLowerCase().includes(lower) ||
                (a.code && a.code.toLowerCase().includes(lower))
            )
        }

        result.sort((a, b) => {
            let valA: string | number = 0
            let valB: string | number = 0

            if (sortField === 'name') {
                valA = a.name
                valB = b.name
            } else if (sortField === 'code') {
                valA = a.code || ''
                valB = b.code || ''
            } else if (sortField === 'rubro') {
                // Sorting by Rubro usually means sorting by Code (as code dictates hierarchy)
                // However, we can also sort by Rubro Type Label if desired, but user likely wants logical order.
                // Let's sort by Code as "Rubro" primary sort because Rubro is derived from it often.
                // User requirement: "El código sigue disponible... pero que la primera columna visible sea el rubro."
                // Sorting by Rubro Name might split the chart of accounts weirdly (Activo -> Ingreso -> Pasivo alphabetical).
                // It's safer to sort by CODE when Rubro is selected, OR sort by Rubro ID logic (1,2,3..).
                // Let's assume standard Code sort produces correct Rubro grouping.
                valA = a.code || ''
                valB = b.code || ''
            } else {
                valA = a.balance
                valB = b.balance
            }

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1
            return 0
        })

        return result
    }, [allAccountsSummary, filterText, sortField, sortOrder])

    const kpis = useMemo(() => {
        // New Requirements: Count displayed accounts by Kind
        let countAsset = 0
        let countLiability = 0
        let countEquity = 0

        filteredAndSortedAccounts.forEach(acc => {
            if (acc.kind === 'ASSET') countAsset++
            else if (acc.kind === 'LIABILITY') countLiability++
            else if (acc.kind === 'EQUITY') countEquity++
        })

        return { countAsset, countLiability, countEquity }
    }, [filteredAndSortedAccounts])

    // --- Helpers ---
    const formatAmount = (n: number) =>
        n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
        })
    }

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortOrder('asc') // Default asc for text/rubro
        }
    }

    // Badge Component Logic (Inline for reusability within file)
    // Note: Auto-focus removed per user request - user must manually click to interact with search

    return (
        <div>
            {/* Header Area */}
            <div className="mayor-header">
                <h1 className="page-title">Libro mayor</h1>
                <BrandSegmentedToggle
                    options={[
                        { value: 'all', label: 'Todas las cuentas' },
                        { value: 'single', label: 'Por cuenta' }
                    ]}
                    value={viewMode}
                    onChange={(val) => handleViewModeChange(val as ViewMode)}
                />
            </div>

            <style>{`
                /* Layout */
                .mayor-header {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    margin-bottom: var(--space-lg);
                }
                @media (min-width: 768px) {
                    .mayor-header {
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                    }
                }
                .mayor-header .page-title {
                    margin: 0;
                }

                /* KPI Grid */
                .kpi-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: var(--space-md);
                    margin-bottom: var(--space-xl);
                }

                /* Badge Pills (Legacy / Balance Types) */
                .badge-pill {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 4px 12px;
                    border-radius: 999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }
                .badge-deudor { background: #dbeafe; color: #1e40af; } 
                .badge-acreedor { background: #fee2e2; color: #991b1b; } 
                .badge-saldada { background: #f3f4f6; color: #6b7280; } 

                .rubro-badge:hover {
                    box-shadow: 0 0 12px rgba(var(--primary-rgb), 0.15); /* Soft glow simulation - needs var but we use inline styles mostly */
                    transform: translateY(-1px);
                    filter: brightness(1.02);
                }

                .text-balance-deudor { color: #1e40af; }
                .text-balance-acreedor { color: #991b1b; }
                .text-balance-neutral { color: var(--text-secondary); }

                /* KPI Cards */
                .kpi-card-light {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    transition: all 0.2s;
                }
                .kpi-card-light:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .kpi-title {
                    font-size: 0.85rem;
                    color: #64748b;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 8px;
                }
                .kpi-number {
                    font-size: 2.5rem;
                    font-weight: 700;
                    line-height: 1.1;
                }
                .kpi-subtitle {
                    margin-top: 4px;
                    font-size: 0.8rem;
                    color: #94a3b8;
                }

                /* Switches Row */
                .switches-row {
                    display: flex;
                    gap: 1.5rem;
                    flex-wrap: wrap;
                    padding: 0.75rem 0;
                    border-top: 1px solid var(--color-border);
                }
            `}</style>

            <div style={{ marginTop: 'var(--space-md)' }}>
                {viewMode === 'single' ? (
                    <>
                        {/* SINGLE ACCOUNT VIEW */}
                        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" htmlFor="account-select">
                                    Seleccioná una cuenta
                                </label>
                                <div style={{ maxWidth: '400px' }}>
                                    <AccountSearchSelect
                                        ref={searchRef}
                                        accounts={accounts || []}
                                        value={selectedAccountId}
                                        onChange={setSelectedAccountId}
                                        placeholder="Buscar cuenta..."
                                    />
                                </div>
                            </div>
                        </div>

                        {selectedAccount && ledgerAccount && (
                            <>
                                {/* Balance Summary Card */}
                                <div className="card" style={{ maxWidth: '600px', marginBottom: 'var(--space-xl)' }}>
                                    <div className="flex-between">
                                        <div>
                                            {/* [NEW] Show Rubro Badge above name or near it */}
                                            <div style={{ marginBottom: '8px' }}>
                                                <RubroBadge config={selectedRubroConfig} />
                                            </div>

                                            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                                                {selectedAccount.name}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px', fontFamily: 'monospace' }}>
                                                {selectedAccount.code}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div
                                                className={`font-mono ${(ledgerAccount.totalDebit - ledgerAccount.totalCredit) > 0.005 ? 'text-balance-deudor' :
                                                    (ledgerAccount.totalDebit - ledgerAccount.totalCredit) < -0.005 ? 'text-balance-acreedor' : 'text-balance-neutral'
                                                    }`}
                                                style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1 }}
                                            >
                                                ${formatAmount(Math.abs(ledgerAccount.totalDebit - ledgerAccount.totalCredit))}
                                            </div>
                                            <div style={{
                                                marginTop: '8px'
                                            }}>
                                                <span className={`badge-pill ${(ledgerAccount.totalDebit - ledgerAccount.totalCredit) > 0.005 ? 'badge-deudor' :
                                                    (ledgerAccount.totalDebit - ledgerAccount.totalCredit) < -0.005 ? 'badge-acreedor' : 'badge-saldada'
                                                    }`}>
                                                    {(ledgerAccount.totalDebit - ledgerAccount.totalCredit) > 0.005 ? 'Saldo Deudor' :
                                                        (ledgerAccount.totalDebit - ledgerAccount.totalCredit) < -0.005 ? 'Saldo Acreedor' : 'Saldada'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* T-Account View */}
                                <div className="t-account" style={{ maxWidth: '800px', marginBottom: 'var(--space-xl)' }}>
                                    <div className="t-account-header">
                                        Esquema de Mayor (T)
                                    </div>
                                    <div className="t-account-body">
                                        <div className="t-account-side debit">
                                            <div className="t-account-side-header">Debe</div>
                                            {ledgerAccount.movements
                                                .filter((m) => m.debit > 0)
                                                .map((m, i) => (
                                                    <div key={i} className="t-account-row">
                                                        <span>{formatDate(m.date)}</span>
                                                        <span>${formatAmount(m.debit)}</span>
                                                    </div>
                                                ))}
                                            <div className="t-account-row t-account-total">
                                                <span>Total Debe</span>
                                                <span>${formatAmount(ledgerAccount.totalDebit)}</span>
                                            </div>
                                        </div>

                                        <div className="t-account-side credit">
                                            <div className="t-account-side-header">Haber</div>
                                            {ledgerAccount.movements
                                                .filter((m) => m.credit > 0)
                                                .map((m, i) => (
                                                    <div key={i} className="t-account-row">
                                                        <span>{formatDate(m.date)}</span>
                                                        <span>${formatAmount(m.credit)}</span>
                                                    </div>
                                                ))}
                                            <div className="t-account-row t-account-total">
                                                <span>Total Haber</span>
                                                <span>${formatAmount(ledgerAccount.totalCredit)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed List */}
                                <div className="card">
                                    <div className="card-header">
                                        <h3 className="card-title">Movimientos detallados</h3>
                                    </div>
                                    {ledgerAccount.movements.length === 0 ? (
                                        <div className="empty-state">
                                            <p>Esta cuenta no tiene movimientos</p>
                                        </div>
                                    ) : (
                                        <div className="table-container">
                                            <table className="table">
                                                <thead>
                                                    <tr>
                                                        <th>Fecha</th>
                                                        <th>Concepto</th>
                                                        <th className="text-right">Debe</th>
                                                        <th className="text-right">Haber</th>
                                                        <th className="text-right">Saldo Parcial</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {ledgerAccount.movements.map((m, i) => (
                                                        <tr key={i}>
                                                            <td>{formatDate(m.date)}</td>
                                                            <td>{m.memo || m.description || '-'}</td>
                                                            <td className="table-number text-balance-deudor">
                                                                {m.debit > 0 ? `$${formatAmount(m.debit)}` : '-'}
                                                            </td>
                                                            <td className="table-number text-balance-acreedor">
                                                                {m.credit > 0 ? `$${formatAmount(m.credit)}` : '-'}
                                                            </td>
                                                            <td className="table-number">
                                                                ${formatAmount(Math.abs(m.balance))}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {!selectedAccountId && (
                            <div className="empty-state">
                                <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</span>
                                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
                                    Busca una cuenta arriba para ver su mayor completo
                                </p>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        {/* VIEW MODE: ALL ACCOUNTS (Summary) */}

                        {/* New KPI Cards */}
                        <div className="kpi-grid">
                            <div className="kpi-card-light">
                                <span className="kpi-title">Cuentas de Activo</span>
                                <span className="kpi-number" style={{ color: '#2563eb' }}>{kpis.countAsset}</span>
                                <span className="kpi-subtitle">visibles en tabla</span>
                            </div>
                            <div className="kpi-card-light">
                                <span className="kpi-title">Cuentas de Pasivo</span>
                                <span className="kpi-number" style={{ color: '#b91c1c' }}>{kpis.countLiability}</span>
                                <span className="kpi-subtitle">visibles en tabla</span>
                            </div>
                            <div className="kpi-card-light">
                                <span className="kpi-title">Patrimonio Neto</span>
                                <span className="kpi-number" style={{ color: '#059669' }}>{kpis.countEquity}</span>
                                <span className="kpi-subtitle">visibles en tabla</span>
                            </div>
                        </div>

                        {/* Controls & Summary Table */}
                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="flex-between">
                                    <h3 className="card-title">Resumen de Cuentas</h3>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="Filtrar por nombre..."
                                        style={{ maxWidth: '250px' }}
                                        value={filterText}
                                        onChange={e => setFilterText(e.target.value)}
                                    />
                                </div>

                                {/* Secondary Toggles */}
                                <div className="switches-row">
                                    <BrandSwitch
                                        label="Mostrar cuentas sin movimiento"
                                        checked={showZeroMovement}
                                        onCheckedChange={setShowZeroMovement}
                                    />
                                    <BrandSwitch
                                        label="Incluir cuentas madre (sumatorias)"
                                        checked={showParents}
                                        onCheckedChange={setShowParents}
                                    />
                                </div>
                            </div>

                            <div className="table-container">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            {/* [MODIFIED] Changed Code to Rubro */}
                                            <th onClick={() => handleSort('rubro')} className="cursor-pointer hover:text-primary" style={{ width: '180px' }}>
                                                Rubro {sortField === 'rubro' && (sortOrder === 'asc' ? '↓' : '↑')}
                                            </th>
                                            <th onClick={() => handleSort('name')} className="cursor-pointer hover:text-primary">
                                                Cuenta {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                                            </th>
                                            <th className="text-right hidden-mobile">Total Debe</th>
                                            <th className="text-right hidden-mobile">Total Haber</th>
                                            <th onClick={() => handleSort('balance')} className="text-right cursor-pointer hover:text-primary" style={{ width: '20%' }}>
                                                Saldo {sortField === 'balance' && (sortOrder === 'asc' ? '↑' : '↓')}
                                            </th>
                                            <th className="text-center" style={{ width: '15%' }}>Tipo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredAndSortedAccounts.map((acc) => (
                                            <tr
                                                key={acc.id}
                                                onClick={() => switchToSingleAccount(acc.id)}
                                                style={{
                                                    cursor: 'pointer',
                                                    // Mother Account Styling
                                                    ...(acc.isHeader ? {
                                                        background: 'linear-gradient(to right, rgba(0,0,0,0.02), transparent)',
                                                        fontWeight: 700,
                                                        color: 'var(--color-heading)'
                                                    } : {})
                                                }}
                                                className={`hover:bg-slate-50 transition-colors ${acc.isHeader ? '' : ''}`}
                                            >
                                                {/* [MODIFIED] Render Rubro Badge instead of Code */}
                                                <td>
                                                    <RubroBadge config={acc.rubroConfig} />
                                                </td>
                                                <td style={{ fontSize: acc.isHeader ? '1.05rem' : '1rem' }}>
                                                    <div title={acc.code ? `#${acc.code}` : undefined}>
                                                        {acc.name}
                                                    </div>
                                                </td>
                                                <td className="text-right text-muted hidden-mobile" style={{ fontSize: '0.9rem' }}>${formatAmount(acc.debit)}</td>
                                                <td className="text-right text-muted hidden-mobile" style={{ fontSize: '0.9rem' }}>${formatAmount(acc.credit)}</td>
                                                <td className="text-right" style={{
                                                    fontSize: '1.25rem',
                                                    fontWeight: acc.isHeader ? 800 : 700,
                                                    color: acc.balanceTypeLabel === 'Deudor'
                                                        ? '#0F2A5F'
                                                        : acc.balanceTypeLabel === 'Acreedor'
                                                            ? '#7F1D1D'
                                                            : 'var(--text-secondary)',
                                                    transition: 'color 0.2s ease'
                                                }}>
                                                    ${formatAmount(acc.balance)}
                                                </td>
                                                <td className="text-center">
                                                    <span className={`badge-pill badge-${acc.balanceTypeLabel.toLowerCase()}`}>
                                                        {acc.balanceTypeLabel}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredAndSortedAccounts.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="text-center py-12">
                                                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</div>
                                                    <div className="text-muted">
                                                        No se encontraron cuentas con los filtros actuales.<br />
                                                        <small>Prueba activando "Mostrar cuentas sin movimiento".</small>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
