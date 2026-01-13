import { X, ArrowRight, Download, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import StatusBadge, { type AccountStatus } from './StatusBadge'
import type { LedgerMovement, AccountKind } from '../../core/models'

export interface DrawerAccount {
    id: string
    code: string
    name: string
    kind: AccountKind
    group: string
    totalDebit: number
    totalCredit: number
    balance: number
    status: AccountStatus
    lastMovements: LedgerMovement[]
}

interface LedgerQuickDrawerProps {
    account: DrawerAccount | null
    onClose: () => void
    onOpenFull: () => void
    formatCurrency: (value: number) => string
}

const KIND_LABELS: Record<AccountKind, string> = {
    ASSET: 'Activo',
    LIABILITY: 'Pasivo',
    EQUITY: 'Patrimonio Neto',
    INCOME: 'Ingreso',
    EXPENSE: 'Gasto',
}

export default function LedgerQuickDrawer({
    account,
    onClose,
    onOpenFull,
    formatCurrency,
}: LedgerQuickDrawerProps) {
    // Calculate bar percentages
    const maxAmount = account
        ? Math.max(account.totalDebit, account.totalCredit, 1)
        : 1
    const debitPercent = account ? (account.totalDebit / maxAmount) * 100 : 0
    const creditPercent = account ? (account.totalCredit / maxAmount) * 100 : 0

    return (
        <AnimatePresence>
            {account && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="ledger-drawer-backdrop"
                        aria-hidden="true"
                    />

                    {/* Panel */}
                    <motion.aside
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="ledger-drawer"
                        role="dialog"
                        aria-labelledby="drawer-title"
                        aria-modal="true"
                    >
                        {/* Header */}
                        <header className="ledger-drawer-header">
                            <div className="ledger-drawer-header-top">
                                <span className="ledger-drawer-code">
                                    {account.code}
                                </span>
                                <button
                                    onClick={onClose}
                                    className="ledger-drawer-close"
                                    aria-label="Cerrar panel"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <h2 id="drawer-title" className="ledger-drawer-title">
                                {account.name}
                            </h2>
                            <div className="ledger-drawer-meta">
                                <span>{KIND_LABELS[account.kind]}</span>
                                <span>•</span>
                                <span>{account.group}</span>
                            </div>
                        </header>

                        {/* Body */}
                        <div className="ledger-drawer-body">
                            {/* Big Balance Card */}
                            <div className="ledger-balance-card">
                                <div className="ledger-balance-card-decor" />
                                <p className="ledger-balance-label">Saldo Actual</p>
                                <div className={`ledger-balance-value ${account.status === 'Deudor'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : account.status === 'Acreedor'
                                            ? 'text-rose-600 dark:text-rose-400'
                                            : 'text-slate-500'
                                    }`}>
                                    {formatCurrency(Math.abs(account.balance))}
                                </div>
                                <StatusBadge status={account.status} />
                            </div>

                            {/* Visual Bars */}
                            <div className="ledger-bars-section">
                                <h3 className="ledger-section-title">Resumen del Período</h3>
                                <div className="ledger-bars">
                                    <div className="ledger-bar-item">
                                        <div className="ledger-bar-header">
                                            <span className="ledger-bar-label">Total Debe</span>
                                            <span className="ledger-bar-value font-mono">
                                                {formatCurrency(account.totalDebit)}
                                            </span>
                                        </div>
                                        <div className="ledger-bar-track">
                                            <div
                                                className="ledger-bar-fill bg-blue-500"
                                                style={{ width: `${debitPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="ledger-bar-item">
                                        <div className="ledger-bar-header">
                                            <span className="ledger-bar-label">Total Haber</span>
                                            <span className="ledger-bar-value font-mono">
                                                {formatCurrency(account.totalCredit)}
                                            </span>
                                        </div>
                                        <div className="ledger-bar-track">
                                            <div
                                                className="ledger-bar-fill bg-emerald-500"
                                                style={{ width: `${creditPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Movements */}
                            <div className="ledger-movements-section">
                                <h3 className="ledger-section-title">
                                    <Calendar size={14} className="text-slate-400" />
                                    Últimos Movimientos
                                </h3>
                                <div className="ledger-timeline">
                                    {account.lastMovements.length > 0 ? (
                                        account.lastMovements.map((mov, i) => (
                                            <div key={`${mov.entryId}-${i}`} className="ledger-timeline-item">
                                                <div className="ledger-timeline-dot" />
                                                <div className="ledger-timeline-content">
                                                    <div className="ledger-timeline-left">
                                                        <p className="ledger-timeline-date">{mov.date}</p>
                                                        <p className="ledger-timeline-memo">{mov.memo}</p>
                                                    </div>
                                                    <div className="ledger-timeline-right">
                                                        <p className={`ledger-timeline-amount font-mono font-bold ${mov.debit > 0 ? 'text-blue-600' : 'text-emerald-600'
                                                            }`}>
                                                            {mov.debit > 0
                                                                ? `+${formatCurrency(mov.debit)}`
                                                                : `-${formatCurrency(mov.credit)}`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="ledger-empty-movements">
                                            No hay movimientos recientes.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <footer className="ledger-drawer-footer">
                            <button
                                onClick={onOpenFull}
                                className="btn-premium btn-premium-primary w-full"
                            >
                                <span>Ver Mayor Completo</span>
                                <ArrowRight size={18} />
                            </button>
                            <button className="btn-premium btn-premium-secondary w-full">
                                <Download size={18} />
                                Descargar Resumen PDF
                            </button>
                        </footer>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    )
}
