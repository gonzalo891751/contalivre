import { motion } from 'framer-motion'
import type { AccountStatus } from './StatusBadge'
import type { AccountKind } from '../../core/models'

export interface LedgerSummaryRow {
    id: string
    code: string
    name: string
    kind: AccountKind
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

const KIND_LABELS: Record<AccountKind, string> = {
    ASSET: 'Activo',
    LIABILITY: 'Pasivo',
    EQUITY: 'PN',
    INCOME: 'Ingreso',
    EXPENSE: 'Gasto',
}

const KIND_STYLES: Record<AccountKind, string> = {
    ASSET: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
    LIABILITY: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    EQUITY: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    INCOME: 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800',
    EXPENSE: 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
}

export default function LedgerSummaryTable({
    data,
    onRowClick,
    formatCurrency,
}: LedgerSummaryTableProps) {
    return (
        <div className="ledger-summary-table-container">
            <div className="ledger-summary-table-scroll">
                <table className="ledger-summary-table">
                    <thead>
                        <tr>
                            <th>Cuenta</th>
                            <th>Tipo</th>
                            <th className="text-right">Débitos</th>
                            <th className="text-right">Créditos</th>
                            <th className="text-right">Saldo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <motion.tr
                                key={row.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                whileHover={{
                                    backgroundColor: 'rgba(59, 130, 246, 0.02)',
                                    y: -1
                                }}
                                onClick={() => onRowClick(row)}
                                className="ledger-summary-row"
                            >
                                <td>
                                    <div className="ledger-account-name">
                                        {row.name}
                                    </div>
                                    <div className="ledger-account-code">
                                        {row.code}
                                    </div>
                                </td>
                                <td>
                                    <span className={`ledger-kind-badge ${KIND_STYLES[row.kind]}`}>
                                        {KIND_LABELS[row.kind]}
                                    </span>
                                </td>
                                <td className="text-right font-mono tabular-nums">
                                    {formatCurrency(row.totalDebit)}
                                </td>
                                <td className="text-right font-mono tabular-nums">
                                    {formatCurrency(row.totalCredit)}
                                </td>
                                <td className={`text-right font-mono font-bold tabular-nums ${row.status === 'Deudor'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : row.status === 'Acreedor'
                                            ? 'text-rose-600 dark:text-rose-400'
                                            : 'text-slate-400'
                                    }`}>
                                    {formatCurrency(Math.abs(row.balance))}
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {data.length === 0 && (
                <div className="ledger-empty-state">
                    <p>No encontramos cuentas con esos filtros.</p>
                </div>
            )}
        </div>
    )
}
