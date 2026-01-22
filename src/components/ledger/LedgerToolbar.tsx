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
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-center mb-6">
            <div className="relative w-full lg:w-96 group">
                <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"
                    size={20}
                    aria-hidden="true"
                />
                <input
                    type="text"
                    placeholder="Buscar por nombre, código o rubro..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm text-slate-700"
                    aria-label="Buscar cuentas"
                />
            </div>

            <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto justify-between lg:justify-end">
                <div className="flex p-1 bg-slate-100 rounded-lg">
                    {tabs.map((tab) => {
                        const isActive = filterStatus === tab.value

                        return (
                            <button
                                key={tab.value}
                                onClick={() => onFilterStatusChange(tab.value)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${isActive
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                aria-pressed={isActive}
                            >
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div className="relative">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={showZero}
                            onChange={(e) => onShowZeroChange(e.target.checked)}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                    </div>
                    <span className="text-xs font-medium text-slate-600">Ver sin mov.</span>
                </label>
            </div>
        </div>
    )
}
