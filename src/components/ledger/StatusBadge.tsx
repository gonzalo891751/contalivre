export type AccountStatus = 'Deudor' | 'Acreedor' | 'Saldada'

interface StatusBadgeProps {
    status: AccountStatus
}

export default function StatusBadge({ status }: StatusBadgeProps) {
    const baseClasses = 'px-2.5 py-0.5 rounded-md text-xs font-semibold border inline-block'

    const statusStyles: Record<AccountStatus, string> = {
        Deudor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
        Acreedor: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
        Saldada: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    }

    return (
        <span className={`${baseClasses} ${statusStyles[status]}`}>
            {status.toUpperCase()}
        </span>
    )
}
