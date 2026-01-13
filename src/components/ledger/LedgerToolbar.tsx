import { Search } from 'lucide-react'
import type { AccountStatus } from './StatusBadge'

interface LedgerToolbarProps {
    search: string
    onSearchChange: (value: string) => void
    filterStatus: 'all' | AccountStatus
    onFilterStatusChange: (value: 'all' | AccountStatus) => void
    showZero: boolean
    onShowZeroChange: (value: boolean) => void
}

export default function LedgerToolbar({
    search,
    onSearchChange,
    filterStatus,
    onFilterStatusChange,
    showZero,
    onShowZeroChange,
}: LedgerToolbarProps) {
    const tabs: { label: string; value: 'all' | AccountStatus }[] = [
        { label: 'Todas', value: 'all' },
        { label: 'Deudoras', value: 'Deudor' },
        { label: 'Acreedoras', value: 'Acreedor' },
        { label: 'Saldadas', value: 'Saldada' },
    ]

    return (
        <div className="ledger-toolbar">
            {/* Search */}
            <div className="ledger-toolbar-search">
                <Search
                    className="ledger-toolbar-search-icon"
                    size={20}
                    aria-hidden="true"
                />
                <input
                    type="text"
                    placeholder="Buscar por nombre o código..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="ledger-toolbar-search-input"
                    aria-label="Buscar cuentas"
                />
            </div>

            {/* Filters & Toggles */}
            <div className="ledger-toolbar-filters">
                {/* Status Pills */}
                <div className="ledger-status-pills">
                    {tabs.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => onFilterStatusChange(tab.value)}
                            className={`ledger-status-pill ${filterStatus === tab.value ? 'active' : ''
                                }`}
                            aria-pressed={filterStatus === tab.value}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Toggle */}
                <label className="ledger-toggle-label">
                    <div className="ledger-toggle-wrapper">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={showZero}
                            onChange={(e) => onShowZeroChange(e.target.checked)}
                        />
                        <div className="ledger-toggle-track peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-focus:ring-2 peer-focus:ring-blue-300" />
                    </div>
                    <span className="ledger-toggle-text">Ver sin mov.</span>
                </label>
            </div>
        </div>
    )
}
