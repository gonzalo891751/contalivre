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
    onDownloadDetail?: () => void
}

export default function LedgerFullView({
    account,
    onBack,
    formatCurrency,
    onDownloadDetail,
}: LedgerFullViewProps) {
    const debitMovements = account.movements.filter((m) => m.debit > 0)
    const creditMovements = account.movements.filter((m) => m.credit > 0)

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="space-y-6"
        >
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={onBack}
                    className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"
                    aria-label="Volver al resumen"
                    type="button"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="text-2xl font-bold font-display text-slate-900 flex items-center gap-3">
                        {account.name}
                        <span className="text-sm font-mono font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                            {account.code}
                        </span>
                    </h2>
                </div>
                <div className="ml-auto flex gap-2">
                    <StatusBadge status={account.status} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative">
                <div className="absolute top-12 bottom-4 left-1/2 w-px bg-slate-200 hidden md:block" />

                <div className="p-6">
                    <h3 className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Debe</h3>
                    <div className="space-y-2">
                        {debitMovements.map((m, i) => (
                            <div
                                key={`d-${i}`}
                                className="flex justify-between text-sm group hover:bg-slate-50 p-1.5 rounded cursor-default transition-colors"
                            >
                                <span className="text-slate-500 truncate mr-2">{m.memo}</span>
                                <span className="font-mono font-medium text-slate-700">
                                    {formatCurrency(m.debit)}
                                </span>
                            </div>
                        ))}
                        <div className="border-t border-slate-200 mt-4 pt-3 flex justify-between items-center">
                            <span className="text-xs font-semibold text-slate-400">TOTAL DEBE</span>
                            <span className="font-mono font-bold text-lg text-blue-600">
                                {formatCurrency(account.totalDebit)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-slate-50/30">
                    <h3 className="text-center text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Haber</h3>
                    <div className="space-y-2">
                        {creditMovements.map((m, i) => (
                            <div
                                key={`c-${i}`}
                                className="flex justify-between text-sm group hover:bg-slate-100 p-1.5 rounded cursor-default transition-colors"
                            >
                                <span className="text-slate-500 truncate mr-2">{m.memo}</span>
                                <span className="font-mono font-medium text-slate-700">
                                    {formatCurrency(m.credit)}
                                </span>
                            </div>
                        ))}
                        <div className="border-t border-slate-200 mt-4 pt-3 flex justify-between items-center">
                            <span className="text-xs font-semibold text-slate-400">TOTAL HABER</span>
                            <span className="font-mono font-bold text-lg text-emerald-600">
                                {formatCurrency(account.totalCredit)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Detalle de Movimientos</h3>
                    <button
                        className="text-sm text-blue-600 font-medium hover:underline"
                        onClick={onDownloadDetail}
                        type="button"
                    >
                        Descargar Detalle
                    </button>
                </div>
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50">
                            <th className="py-3 px-6 font-medium text-slate-500">Fecha</th>
                            <th className="py-3 px-6 font-medium text-slate-500">Concepto</th>
                            <th className="py-3 px-6 font-medium text-slate-500 text-right">Debe</th>
                            <th className="py-3 px-6 font-medium text-slate-500 text-right">Haber</th>
                            <th className="py-3 px-6 font-medium text-slate-500 text-right">Saldo Parcial</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {account.movements.map((m, idx) => (
                            <tr key={`${m.entryId}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                <td className="py-3 px-6 text-slate-600 font-mono text-xs">
                                    {m.date}
                                </td>
                                <td className="py-3 px-6 text-slate-800 font-medium">
                                    {m.memo}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-slate-500">
                                    {m.debit > 0 ? formatCurrency(m.debit) : '-'}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-slate-500">
                                    {m.credit > 0 ? formatCurrency(m.credit) : '-'}
                                </td>
                                <td className="py-3 px-6 text-right font-mono font-bold text-slate-700">
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
