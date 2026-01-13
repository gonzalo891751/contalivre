import { Search, Download, ChevronDown, ChevronUp } from 'lucide-react'
import type { AccountKind } from '../../core/models'

const KIND_OPTIONS: { value: AccountKind | ''; label: string }[] = [
    { value: '', label: 'Todos los tipos' },
    { value: 'ASSET', label: 'Activo' },
    { value: 'LIABILITY', label: 'Pasivo' },
    { value: 'EQUITY', label: 'Patrimonio Neto' },
    { value: 'INCOME', label: 'Ingreso' },
    { value: 'EXPENSE', label: 'Gasto/Costo' },
]

interface AccountsToolbarProps {
    search: string
    onSearchChange: (value: string) => void
    filterKind: AccountKind | ''
    onFilterChange: (kind: AccountKind | '') => void
    onExpandAll: () => void
    onCollapseAll: () => void
    onExport?: () => void
}

export default function AccountsToolbar({
    search,
    onSearchChange,
    filterKind,
    onFilterChange,
    onExpandAll,
    onCollapseAll,
    onExport,
}: AccountsToolbarProps) {
    return (
        <div className="accounts-toolbar">
            <div className="accounts-toolbar-search">
                <Search className="accounts-toolbar-search-icon" />
                <input
                    type="text"
                    className="accounts-toolbar-search-input"
                    placeholder="Buscar por código o nombre..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
            </div>

            <div className="accounts-toolbar-actions">
                <select
                    className="form-select"
                    value={filterKind}
                    onChange={(e) => onFilterChange(e.target.value as AccountKind | '')}
                    style={{
                        minHeight: '38px',
                        fontSize: '0.875rem',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    {KIND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>

                <button
                    className="btn-premium btn-premium-secondary"
                    onClick={onExpandAll}
                    title="Expandir todo"
                    style={{ padding: '0.5rem 0.75rem' }}
                >
                    <ChevronDown size={16} />
                </button>

                <button
                    className="btn-premium btn-premium-secondary"
                    onClick={onCollapseAll}
                    title="Colapsar todo"
                    style={{ padding: '0.5rem 0.75rem' }}
                >
                    <ChevronUp size={16} />
                </button>

                {onExport && (
                    <button
                        className="btn-premium btn-premium-secondary"
                        onClick={onExport}
                        title="Exportar"
                        style={{ padding: '0.5rem 0.75rem' }}
                    >
                        <Download size={16} />
                    </button>
                )}
            </div>
        </div>
    )
}
