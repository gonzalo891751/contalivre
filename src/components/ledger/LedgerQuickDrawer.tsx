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
    rubroLabel: string
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
    onDownloadSummary?: () => void
}

export default function LedgerQuickDrawer({
    account,
    onClose,
    onOpenFull,
    formatCurrency,
    onDownloadSummary,
}: LedgerQuickDrawerProps) {
    const maxAmount = account ? Math.max(account.totalDebit, account.totalCredit) : 0
    const debitPercent = account && maxAmount > 0 ? (account.totalDebit / maxAmount) * 100 : 0
    const creditPercent = account && maxAmount > 0 ? (account.totalCredit / maxAmount) * 100 : 0

    return (
        <AnimatePresence>
            {account && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-200/60 dark:bg-slate-900/30 backdrop-blur-sm z-40"
                        aria-hidden="true"
                    />

                    <motion.aside
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed top-0 right-0 h-full w-full md:w-[480px] bg-white dark:bg-slate-900 shadow-2xl z-50 flex flex-col border-l border-slate-200 dark:border-slate-800"
                        role="dialog"
                        aria-labelledby="drawer-title"
                        aria-modal="true"
                    >
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-mono text-xs text-blue-500 font-medium bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                    {account.code}
                                </span>
                                <button
                                    onClick={onClose}
                                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                                    aria-label="Cerrar panel"
                                    type="button"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <h2 id="drawer-title" className="text-2xl font-bold font-display text-slate-900 dark:text-white mb-1">
                                {account.name}
                            </h2>
                            <div className="flex gap-2 text-sm text-slate-500">
                                <span>{account.rubroLabel}</span>
                                <span>•</span>
                                <span>{account.group}</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-center relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-500/10 to-transparent rounded-bl-full" />

                                <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold mb-2">Saldo Actual</p>
                                <div
                                    className={`text-4xl font-bold font-mono tracking-tight mb-3 ${account.balance > 0
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : account.balance < 0
                                            ? 'text-rose-600 dark:text-rose-400'
                                            : 'text-slate-500'
                                        }`}
                                >
                                    {formatCurrency(Math.abs(account.balance))}
                                </div>
                                <StatusBadge status={account.status} />
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Resumen del Periodo</h3>
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-slate-500">Total Debe</span>
                                            <span className="font-mono text-slate-700 dark:text-slate-300">
                                                {formatCurrency(account.totalDebit)}
                                            </span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${debitPercent}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-slate-500">Total Haber</span>
                                            <span className="font-mono text-slate-700 dark:text-slate-300">
                                                {formatCurrency(account.totalCredit)}
                                            </span>
                                        </div>
                                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${creditPercent}%` }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Calendar size={14} className="text-slate-400" />
                                    Últimos Movimientos
                                </h3>
                                <div className="relative border-l-2 border-slate-200 dark:border-slate-700 pl-4 space-y-6">
                                    {account.lastMovements.length > 0 ? (
                                        account.lastMovements.map((mov, i) => (
                                            <div key={`${mov.entryId}-${i}`} className="relative">
                                                <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-white border-2 border-slate-300 dark:border-slate-600 dark:bg-slate-800" />

                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <p className="text-xs text-slate-400 mb-0.5">{mov.date}</p>
                                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{mov.memo}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p
                                                            className={`text-sm font-mono font-bold ${mov.debit > 0 ? 'text-blue-600' : 'text-emerald-600'}`}
                                                        >
                                                            {mov.debit > 0
                                                                ? `+${formatCurrency(mov.debit)}`
                                                                : `-${formatCurrency(mov.credit)}`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-slate-400 italic">No hay movimientos recientes.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col gap-3">
                            <button
                                onClick={onOpenFull}
                                className="w-full py-3 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                type="button"
                            >
                                <span>Ver Mayor Completo</span>
                                <ArrowRight size={18} />
                            </button>
                            <button
                                className="w-full py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                                onClick={onDownloadSummary}
                                type="button"
                            >
                                <Download size={18} />
                                Descargar Resumen PDF
                            </button>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    )
}
