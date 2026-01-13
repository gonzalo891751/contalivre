import { ArrowLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import StatusBadge, { type AccountStatus } from './StatusBadge'
import type { LedgerMovement, AccountKind } from '../../core/models'

export interface FullViewAccount {
    id: string
    code: string
    name: string
    kind: AccountKind
    totalDebit: number
    totalCredit: number
    balance: number
    status: AccountStatus
    movements: LedgerMovement[]
}

interface LedgerFullViewProps {
    account: FullViewAccount
    onBack: () => void
    formatCurrency: (value: number) => string
}

export default function LedgerFullView({
    account,
    onBack,
    formatCurrency,
}: LedgerFullViewProps) {
    // Separate movements by type
    const debitMovements = account.movements.filter((m) => m.debit > 0)
    const creditMovements = account.movements.filter((m) => m.credit > 0)

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="ledger-full-view"
        >
            {/* Header */}
            <header className="ledger-full-header">
                <button
                    onClick={onBack}
                    className="ledger-full-back-btn"
                    aria-label="Volver al resumen"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="ledger-full-title-group">
                    <h2 className="ledger-full-title">
                        {account.name}
                        <span className="ledger-full-code">{account.code}</span>
                    </h2>
                </div>
                <div className="ledger-full-badge">
                    <StatusBadge status={account.status} />
                </div>
            </header>

            {/* T-Account Visualization */}
            <div className="ledger-t-account">
                <div className="ledger-t-divider" />

                {/* DEBE */}
                <div className="ledger-t-column ledger-t-debe">
                    <h3 className="ledger-t-header">Debe</h3>
                    <div className="ledger-t-items">
                        {debitMovements.map((m, i) => (
                            <div key={`d-${i}`} className="ledger-t-item">
                                <span className="ledger-t-concept">{m.memo}</span>
                                <span className="ledger-t-amount font-mono">
                                    {formatCurrency(m.debit)}
                                </span>
                            </div>
                        ))}
                        <div className="ledger-t-total">
                            <span className="ledger-t-total-label">TOTAL DEBE</span>
                            <span className="ledger-t-total-value text-blue-600 font-mono font-bold">
                                {formatCurrency(account.totalDebit)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* HABER */}
                <div className="ledger-t-column ledger-t-haber">
                    <h3 className="ledger-t-header">Haber</h3>
                    <div className="ledger-t-items">
                        {creditMovements.map((m, i) => (
                            <div key={`c-${i}`} className="ledger-t-item">
                                <span className="ledger-t-concept">{m.memo}</span>
                                <span className="ledger-t-amount font-mono">
                                    {formatCurrency(m.credit)}
                                </span>
                            </div>
                        ))}
                        <div className="ledger-t-total">
                            <span className="ledger-t-total-label">TOTAL HABER</span>
                            <span className="ledger-t-total-value text-emerald-600 font-mono font-bold">
                                {formatCurrency(account.totalCredit)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Movements Table */}
            <div className="ledger-detail-table-container">
                <header className="ledger-detail-table-header">
                    <h3 className="ledger-detail-table-title">Detalle de Movimientos</h3>
                    <button className="ledger-detail-download">
                        Descargar Detalle
                    </button>
                </header>
                <table className="ledger-detail-table">
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
                        {account.movements.map((m, idx) => (
                            <tr key={`${m.entryId}-${idx}`}>
                                <td className="font-mono text-xs text-slate-600 dark:text-slate-400">
                                    {m.date}
                                </td>
                                <td className="text-slate-800 dark:text-slate-200 font-medium">
                                    {m.memo}
                                </td>
                                <td className="text-right font-mono text-slate-500">
                                    {m.debit > 0 ? formatCurrency(m.debit) : '-'}
                                </td>
                                <td className="text-right font-mono text-slate-500">
                                    {m.credit > 0 ? formatCurrency(m.credit) : '-'}
                                </td>
                                <td className="text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                                    {formatCurrency(m.balance)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    )
}
