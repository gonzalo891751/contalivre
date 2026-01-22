import { motion } from 'framer-motion'
import type { AccountStatus } from './StatusBadge'
import type { AccountKind } from '../../core/models'

export interface LedgerSummaryRow {
    id: string
    code: string
    name: string
    kind: AccountKind
    group: string
    rubroLabel: string
    totalDebit: number
    totalCredit: number
    balance: number
    status: AccountStatus
}

interface LedgerSummaryTableProps {
    data: LedgerSummaryRow[]
    onRowClick: (row: LedgerSummaryRow) => void
    formatCurrency: (value: number) => string
}

const RUBRO_STYLES: Record<string, string> = {
    Activo: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    Pasivo: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    Resultado: 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
}

export default function LedgerSummaryTable({
    data,
    onRowClick,
    formatCurrency,
}: LedgerSummaryTableProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider font-display">
                                Cuenta
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider font-display">
                                Rubro
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider font-display text-right">
                                Débitos
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider font-display text-right">
                                Créditos
                            </th>
                            <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider font-display text-right">
                                Saldo
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {data.map((row) => (
                            <motion.tr
                                key={row.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                whileHover={{
                                    backgroundColor: 'rgba(59, 130, 246, 0.02)',
                                    y: -1,
                                }}
                                onClick={() => onRowClick(row)}
                                className="cursor-pointer group transition-colors"
                            >
                                <td className="py-4 px-6">
                                    <div className="font-medium text-slate-900 dark:text-slate-100">
                                        {row.name}
                                    </div>
                                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                                        {row.code}
                                    </div>
                                </td>
                                <td className="py-4 px-6 text-sm text-slate-500">
                                    <span
                                        className={`px-2 py-1 rounded text-xs font-medium border ${RUBRO_STYLES[row.rubroLabel] ?? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}
                                    >
                                        {row.rubroLabel}
                                    </span>
                                </td>
                                <td className="py-4 px-6 text-sm text-slate-500 font-mono text-right tabular-nums">
                                    {formatCurrency(row.totalDebit)}
                                </td>
                                <td className="py-4 px-6 text-sm text-slate-500 font-mono text-right tabular-nums">
                                    {formatCurrency(row.totalCredit)}
                                </td>
                                <td
                                    className={`py-4 px-6 text-sm font-bold font-mono text-right tabular-nums ${row.balance > 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : row.balance < 0
                                            ? 'text-rose-600 dark:text-rose-400'
                                            : 'text-slate-400'
                                        }`}
                                >
                                    {formatCurrency(Math.abs(row.balance))}
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length === 0 && (
                <div className="p-12 text-center text-slate-400">
                    <p>No encontramos cuentas con esos filtros.</p>
                </div>
            )}
        </div>
    )
}
