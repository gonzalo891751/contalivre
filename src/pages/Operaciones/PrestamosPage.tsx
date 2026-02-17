/**
 * Préstamos y Deudas Financieras
 *
 * Módulo dedicado para gestión de préstamos ARS y ME.
 * - Alta de préstamos ARS (rate=1) y ME (TC Oficial BNA)
 * - Tabla con saldos, pagos acumulados, valuación ARS
 * - Modal "Ver" con cronograma, movimientos, asientos, acciones
 * - Devengamiento de intereses (manual + auto fin de mes)
 * - Revaluación ME con asiento diferencia de cambio
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ArrowLeft,
    CalendarCheck,
    CurrencyCircleDollar,
    Eye,
    Info,
    MagicWand,
    Plus,
    Trash,
    TrendDown,
    TrendUp,
    X,
} from '@phosphor-icons/react'
import OperationsPageHeader from '../../components/OperationsPageHeader'
import NumberTicker from '../../ui/NumberTicker'

import { usePeriodYear } from '../../hooks/usePeriodYear'
import { db } from '../../storage/db'
import {
    addFxDebtDisbursement,
    createEntry,
    createFxAccount,
    createFxDebt,
    createFxMovement,
    deleteFxDebt,
    deleteFxMovementWithJournal,
    getAllFxAccounts,
    getAllFxDebts,
    getAllFxMovements,
    loadFxSettings,
    reconcileFxJournalLinks,
    updateFxDebt,
} from '../../storage'
import { createAccount, generateNextCode } from '../../storage/accounts'
import { getExchangeRates, getQuote, getRateValue } from '../../services/exchangeRates'
import type { Account, JournalEntry } from '../../core/models'
import type {
    CurrencyCode,
    ExchangeRate,
    FxDebt,
    FxDebtInstallment,
    FxMovement,
    FxSettings,
    LoanSystem,
    PaymentFrequency,
    FxLiabilitySubtype,
} from '../../core/monedaExtranjera/types'
import {
    FREQUENCY_LABELS,
    LIABILITY_SUBTYPE_LABELS,
    LOAN_SYSTEM_LABELS,
    MOVEMENT_TYPE_LABELS,
    DEBT_STATUS_LABELS,
} from '../../core/monedaExtranjera/types'
import LoanPaymentModal from './prestamos/LoanPaymentModal'

// ========================================
// Shared UI Primitives (local copies)
// ========================================

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

function LoanButton({
    variant = 'primary',
    size = 'md',
    className,
    disabled,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
}) {
    const base = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all'
    const variants = {
        primary: disabled
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-sm hover:shadow-soft hover:-translate-y-0.5 hover:from-blue-500 hover:to-emerald-400',
        secondary: disabled
            ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 hover:border-slate-300',
        ghost: disabled
            ? 'bg-transparent text-slate-300 cursor-not-allowed'
            : 'bg-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100',
        danger: disabled
            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-rose-600 text-white shadow-sm hover:bg-rose-500',
    }
    const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm' }
    return <button className={cx(base, variants[variant], sizes[size], className)} disabled={disabled} {...props} />
}

function LoanBadge({ tone = 'neutral', className, children }: { tone?: 'success' | 'warning' | 'neutral' | 'info' | 'danger'; className?: string; children: React.ReactNode }) {
    const tones = { success: 'bg-emerald-50 text-emerald-700', warning: 'bg-amber-50 text-amber-700', neutral: 'bg-slate-100 text-slate-600', info: 'bg-blue-50 text-blue-700', danger: 'bg-rose-50 text-rose-700' }
    return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide', tones[tone], className)}>{children}</span>
}

function LoanInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input className={cx('w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100', className)} {...props} />
}

function LoanSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return <select className={cx('w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100', className)} {...props}>{children}</select>
}

function LoanModal({ open, onClose, title, size = 'md', children, footer }: { open: boolean; onClose: () => void; title: string; size?: 'md' | 'lg' | 'xl'; children: React.ReactNode; footer?: React.ReactNode }) {
    if (!open) return null
    const sizeClass = size === 'xl' ? 'max-w-6xl' : size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className={cx('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl', sizeClass)} onMouseDown={e => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
                    <LoanButton variant="secondary" size="sm" onClick={onClose}><X size={14} weight="bold" /></LoanButton>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-8 py-6">{children}</div>
                {footer && <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</div>}
            </div>
        </div>
    )
}

interface SelectOption { value: string; label: string; meta?: string }

function LoanSearchableSelect({ value, options, placeholder, onChange, className }: { value?: string; options: SelectOption[]; placeholder?: string; onChange: (v: string) => void; className?: string }) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)
    useEffect(() => { const sel = options.find(o => o.value === value); setQuery(sel?.label || '') }, [options, value])
    const filtered = useMemo(() => { const n = query.toLowerCase(); if (!n) return options.slice(0, 50); return options.filter(o => o.label.toLowerCase().includes(n)).slice(0, 50) }, [options, query])
    return (
        <div className={cx('relative', className)}>
            <LoanInput value={query} placeholder={placeholder} onChange={e => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
            {open && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filtered.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>}
                    {filtered.map(o => (
                        <button key={o.value} type="button" className={cx('flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50', o.value === value && 'bg-slate-100')} onClick={() => { onChange(o.value); setQuery(o.label); setOpen(false) }}>
                            <span>{o.label}</span>
                            {o.meta && <span className="text-[11px] text-slate-400">{o.meta}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ========================================
// Formatters
// ========================================

const formatCurrencyARS = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
const formatRate = (value: number | undefined | null) => value != null && !Number.isNaN(value) ? value.toFixed(2) : '—'
const formatDateShort = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
}
const formatDateInput = () => new Date().toISOString().split('T')[0]
const resolveDefaultDate = (periodEnd?: string) => /^\d{4}-\d{2}-\d{2}$/.test(periodEnd || '') ? periodEnd as string : formatDateInput()

// ========================================
// Helpers
// ========================================

type TabId = 'prestamos' | 'movimientos' | 'conciliacion'
const TABS: { id: TabId; label: string }[] = [
    { id: 'prestamos', label: 'Préstamos Activos' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'conciliacion', label: 'Conciliación' },
]

interface DebtSummary {
    debt: FxDebt
    rateHistorical: number
    arsHistorical: number
    rateCurrent: number
    arsCurrent: number
    nextDue: string | null
    paidAcumME: number
    paidAcumARS: number
    saldoPendienteME: number
    saldoPendienteARS: number
}

function computeDebtSummary(debt: FxDebt, oficialRate: number): DebtSummary {
    const isARS = debt.currency === 'ARS'
    const rateHistorical = isARS ? 1 : debt.rateInicial
    const rateCurrent = isARS ? 1 : oficialRate
    const arsHistorical = debt.saldoME * rateHistorical
    const arsCurrent = debt.saldoME * rateCurrent
    const nextUnpaid = debt.schedule?.find(i => !i.paid)
    const paidInstallments = debt.schedule?.filter(i => i.paid) || []
    const paidAcumME = paidInstallments.reduce((s, i) => s + (i.capitalME || 0), 0)
    const paidAcumARS = paidAcumME * rateHistorical
    return {
        debt,
        rateHistorical,
        arsHistorical,
        rateCurrent,
        arsCurrent,
        nextDue: nextUnpaid?.dueDate || null,
        paidAcumME,
        paidAcumARS,
        saldoPendienteME: debt.saldoME,
        saldoPendienteARS: arsCurrent,
    }
}

// ========================================
// Main Page
// ========================================

export default function PrestamosPage() {
    const { year: periodYear, end: periodEndDate } = usePeriodYear()
    const periodId = String(periodYear)
    const defaultDate = resolveDefaultDate(periodEndDate)

    // State
    const [activeTab, setActiveTab] = useState<TabId>('prestamos')
    const [rates, setRates] = useState<ExchangeRate[]>([])
    const [settings, setSettings] = useState<FxSettings | null>(null)
    const [toast, setToast] = useState('')

    // Modals
    const [newLoanModalOpen, setNewLoanModalOpen] = useState(false)
    const [viewDebt, setViewDebt] = useState<FxDebt | null>(null)
    const [viewModalOpen, setViewModalOpen] = useState(false)

    // Auto-devengo flag
    const autoDevengoRan = useRef(false)

    // Live data
    const fxDebts = useLiveQuery(() => getAllFxDebts(periodId), [periodId]) || []
    const fxMovements = useLiveQuery(() => getAllFxMovements(periodId), [periodId]) || []
    const ledgerAccounts = useLiveQuery(() => db.accounts.toArray(), []) || []
    const allEntries = useLiveQuery(() => db.entries.toArray(), []) || []

    // Load rates + settings
    useEffect(() => {
        getExchangeRates().then(r => setRates(r.rates))
        loadFxSettings().then(s => setSettings(s))
    }, [])

    const oficialRate = useMemo(() => {
        const oficial = getQuote(rates, 'Oficial')
        return oficial ? getRateValue(oficial, 'venta') : 0
    }, [rates])

    // Debt summaries
    const debtSummaries = useMemo(
        () => fxDebts.map(d => computeDebtSummary(d, oficialRate)),
        [fxDebts, oficialRate]
    )

    const activeDebts = useMemo(() => debtSummaries.filter(s => s.debt.status === 'ACTIVE'), [debtSummaries])

    // KPIs
    const totalPasivoARS = useMemo(() => activeDebts.reduce((s, d) => s + d.saldoPendienteARS, 0), [activeDebts])

    const proxVencimientos30d = useMemo(() => {
        const now = new Date()
        const in30 = new Date(now.getTime() + 30 * 86400000)
        const nowStr = now.toISOString().split('T')[0]
        const in30Str = in30.toISOString().split('T')[0]
        return activeDebts.filter(d => d.nextDue && d.nextDue >= nowStr && d.nextDue <= in30Str).length
    }, [activeDebts])

    // Debt-related movements
    const debtMovements = useMemo(
        () => fxMovements.filter(m => m.debtId || ['TOMA_DEUDA', 'DESEMBOLSO_DEUDA', 'PAGO_DEUDA', 'DEVENGO_INTERES', 'REVALUACION_DEUDA'].includes(m.type)),
        [fxMovements]
    )

    // Auto-devengo fin de mes
    useEffect(() => {
        if (autoDevengoRan.current || fxDebts.length === 0 || !oficialRate) return
        autoDevengoRan.current = true
        runAutoDevengo(fxDebts, oficialRate, periodId, ledgerAccounts, settings).then(count => {
            if (count > 0) showToast(`Devengamiento automático: ${count} período(s) asentados`)
        }).catch(err => console.warn('Auto-devengo error:', err))
    }, [fxDebts, oficialRate, periodId, ledgerAccounts, settings])

    const showToast = useCallback((msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(''), 3000)
    }, [])

    const handleOpenView = useCallback((debt: FxDebt) => {
        setViewDebt(debt)
        setViewModalOpen(true)
    }, [])

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 bg-slate-50">
            {/* Toast */}
            {toast && (
                <div className="fixed top-4 right-4 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg animate-in fade-in slide-in-from-top-2">
                    {toast}
                </div>
            )}

            {/* Header */}
            <OperationsPageHeader
                title="Préstamos y Deudas Financieras"
                subtitle="Gestión de préstamos ARS y ME con asientos automáticos en ARS"
                shimmer
            />

            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                        Total Pasivo (ARS) <TrendDown size={16} className="text-rose-500" />
                    </div>
                    <div className="font-display text-2xl font-bold text-slate-900"><NumberTicker value={totalPasivoARS} /></div>
                    <div className="text-xs text-slate-400">{activeDebts.length} préstamo(s) activo(s)</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
                    <div className="text-sm text-amber-700">Próx. Vencimientos (30d)</div>
                    <div className="font-display text-2xl font-bold text-amber-700">{proxVencimientos30d}</div>
                    <div className="text-xs text-amber-600">cuota(s) por vencer</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="text-sm text-slate-500">Devengamientos</div>
                    <div className="font-display text-2xl font-bold text-emerald-600">Al día</div>
                    <div className="text-xs text-slate-400">Automático fin de mes</div>
                </div>
                <div className="group relative">
                    <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500 opacity-30 blur-sm group-hover:opacity-50 transition-opacity animate-pulse" />
                    <LoanButton className="relative w-full h-full min-h-[88px] text-base" onClick={() => setNewLoanModalOpen(true)}>
                        <Plus size={20} weight="bold" /> Nuevo Préstamo
                    </LoanButton>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cx(
                            'flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all',
                            activeTab === tab.id
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab: Préstamos Activos */}
            {activeTab === 'prestamos' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Acreedor</th>
                                        <th className="px-4 py-3 text-left">Moneda</th>
                                        <th className="px-4 py-3 text-right">Saldo Original</th>
                                        <th className="px-4 py-3 text-right">Pagado Acum.</th>
                                        <th className="px-4 py-3 text-right">Saldo Pendiente</th>
                                        <th className="px-4 py-3 text-right">TC Actual</th>
                                        <th className="px-4 py-3 text-right">Valuación ARS</th>
                                        <th className="px-4 py-3 text-right">Próx. Venc.</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                        <th className="px-4 py-3 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {debtSummaries.map(item => {
                                        const isARS = item.debt.currency === 'ARS'
                                        return (
                                            <tr key={item.debt.id} className="border-t border-slate-200 hover:bg-slate-50">
                                                <td className="px-4 py-3 font-medium">{item.debt.creditor || '—'}</td>
                                                <td className="px-4 py-3"><LoanBadge tone={isARS ? 'neutral' : 'info'}>{item.debt.currency}</LoanBadge></td>
                                                <td className="px-4 py-3 text-right font-mono">{formatRate(item.debt.principalME)}</td>
                                                <td className="px-4 py-3 text-right font-mono text-emerald-600">{formatRate(item.paidAcumME)}</td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold">{formatRate(item.saldoPendienteME)}</td>
                                                <td className="px-4 py-3 text-right font-mono">{isARS ? '—' : formatRate(item.rateCurrent)}</td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrencyARS(item.saldoPendienteARS)}</td>
                                                <td className="px-4 py-3 text-right">{formatDateShort(item.nextDue)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <LoanBadge tone={item.debt.status === 'ACTIVE' ? 'success' : item.debt.status === 'PAID' ? 'neutral' : 'danger'}>
                                                        {DEBT_STATUS_LABELS[item.debt.status]}
                                                    </LoanBadge>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <LoanButton variant="secondary" size="sm" onClick={() => handleOpenView(item.debt)}>
                                                        <Eye size={14} /> Ver
                                                    </LoanButton>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {debtSummaries.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                                                No hay préstamos registrados. Creá uno con "Nuevo Préstamo".
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Movimientos */}
            {activeTab === 'movimientos' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Fecha</th>
                                        <th className="px-4 py-3 text-left">Tipo</th>
                                        <th className="px-4 py-3 text-left">Préstamo</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                        <th className="px-4 py-3 text-right">TC Op.</th>
                                        <th className="px-4 py-3 text-right">Total ARS</th>
                                        <th className="px-4 py-3 text-center">Asiento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {debtMovements.map(m => {
                                        const debt = m.debtId ? fxDebts.find(d => d.id === m.debtId) : null
                                        const hasEntry = (m.linkedJournalEntryIds || []).length > 0
                                        return (
                                            <tr key={m.id} className="border-t border-slate-200">
                                                <td className="px-4 py-3">{formatDateShort(m.date)}</td>
                                                <td className="px-4 py-3"><LoanBadge tone={m.type === 'PAGO_DEUDA' ? 'success' : m.type === 'DEVENGO_INTERES' ? 'warning' : 'neutral'}>{MOVEMENT_TYPE_LABELS[m.type] || m.type}</LoanBadge></td>
                                                <td className="px-4 py-3 text-slate-600">{debt?.creditor || debt?.name || m.counterparty || '—'}</td>
                                                <td className="px-4 py-3 text-right font-mono">{formatRate(m.amount)} {m.currency}</td>
                                                <td className="px-4 py-3 text-right font-mono">{formatRate(m.rate)}</td>
                                                <td className="px-4 py-3 text-right font-mono">{formatCurrencyARS(m.arsAmount)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {hasEntry ? <LoanBadge tone="success">OK</LoanBadge> : m.journalStatus === 'missing' ? <LoanBadge tone="danger">Missing</LoanBadge> : <LoanBadge>—</LoanBadge>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {debtMovements.length === 0 && (
                                        <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">Sin movimientos de préstamos.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab: Conciliación */}
            {activeTab === 'conciliacion' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center">
                        <Info size={32} className="mx-auto text-slate-400 mb-3" />
                        <h3 className="font-semibold text-slate-700">Conciliación de Préstamos</h3>
                        <p className="text-sm text-slate-500 mt-1">Ejecutá la reconciliación para verificar la integridad movimiento ↔ asiento.</p>
                        <LoanButton variant="secondary" className="mt-4" onClick={async () => {
                            const result = await reconcileFxJournalLinks(periodId)
                            showToast(`Reconciliación: ${result.updated} actualizados`)
                        }}>
                            Reconciliar ahora
                        </LoanButton>
                    </div>
                </div>
            )}

            {/* Modal: Nuevo Préstamo */}
            <NewLoanModal
                open={newLoanModalOpen}
                onClose={() => setNewLoanModalOpen(false)}
                periodId={periodId}
                defaultDate={defaultDate}
                ledgerAccounts={ledgerAccounts}
                oficialRate={oficialRate}
                onSuccess={showToast}
            />

            {/* Modal: Ver Préstamo */}
            <ViewLoanModal
                open={viewModalOpen}
                onClose={() => { setViewModalOpen(false); setViewDebt(null) }}
                debt={viewDebt}
                fxMovements={fxMovements}
                ledgerAccounts={ledgerAccounts}
                allEntries={allEntries}
                oficialRate={oficialRate}
                periodId={periodId}
                defaultDate={defaultDate}
                settings={settings}
                onSuccess={showToast}
            />
        </div>
    )
}

// ========================================
// Modal: Nuevo Préstamo (ARS + ME)
// ========================================

function NewLoanModal({
    open,
    onClose,
    periodId,
    defaultDate,
    ledgerAccounts,
    oficialRate,
    onSuccess,
}: {
    open: boolean
    onClose: () => void
    periodId: string
    defaultDate: string
    ledgerAccounts: Account[]
    oficialRate: number
    onSuccess: (msg: string) => void
}) {
    const fxAccounts = useLiveQuery(() => getAllFxAccounts(periodId), [periodId]) || []
    // Form state
    const [currency, setCurrency] = useState<CurrencyCode>('ARS')
    const [creditor, setCreditor] = useState('')
    const [subtype, setSubtype] = useState<FxLiabilitySubtype>('PRESTAMO')
    const [principal, setPrincipal] = useState(0)
    const [rate, setRate] = useState(1)
    const [originDate, setOriginDate] = useState(defaultDate)
    const [firstDueDate, setFirstDueDate] = useState(defaultDate)
    const [installments, setInstallments] = useState(1)
    const [frequency, setFrequency] = useState<PaymentFrequency>('MENSUAL')
    const [system, setSystem] = useState<LoanSystem>('FRANCES')
    const [tna, setTna] = useState(0)
    const [autoJournal, setAutoJournal] = useState(true)
    const [ledgerAccountId, setLedgerAccountId] = useState('')
    const [targetAccountId, setTargetAccountId] = useState('')
    const [saving, setSaving] = useState(false)

    const isARS = currency === 'ARS'

    // Reset on open
    useEffect(() => {
        if (!open) return
        setCurrency('ARS')
        setCreditor('')
        setSubtype('PRESTAMO')
        setPrincipal(0)
        setRate(1)
        setOriginDate(defaultDate)
        setFirstDueDate(defaultDate)
        setInstallments(1)
        setFrequency('MENSUAL')
        setSystem('FRANCES')
        setTna(0)
        setAutoJournal(true)
        setLedgerAccountId('')
        setTargetAccountId('')
        setSaving(false)
    }, [open, periodId, defaultDate])

    // When currency changes, update rate
    useEffect(() => {
        if (currency === 'ARS') {
            setRate(1)
        } else {
            setRate(oficialRate || 0)
        }
    }, [currency, oficialRate])

    const cpMother = useMemo(
        () => ledgerAccounts.find(a => a.code === '2.1.05.02' && !a.isHeader) || null,
        [ledgerAccounts]
    )
    const lpMother = useMemo(
        () => ledgerAccounts.find(a => a.code === '2.2.01.01' && !a.isHeader) || null,
        [ledgerAccounts]
    )

    const preferredMother = useMemo(() => {
        const origin = parseISODateUTC(originDate)
        const firstDue = parseISODateUTC(firstDueDate)
        if (!origin || !firstDue || !cpMother || !lpMother) return cpMother || lpMother
        const monthsPerPeriod = frequencyMonths[frequency] ?? 1
        const maturity = installments <= 1 || monthsPerPeriod === 0
            ? firstDue
            : addMonthsUTC(firstDue, monthsPerPeriod * (installments - 1))
        const totalDays = Math.floor((maturity.getTime() - origin.getTime()) / DAY_MS) + 1
        return totalDays <= 365 ? cpMother : lpMother
    }, [originDate, firstDueDate, installments, frequency, cpMother, lpMother])

    useEffect(() => {
        if (!open) return
        if (preferredMother && ledgerAccountId !== preferredMother.id) {
            setLedgerAccountId(preferredMother.id)
        }
    }, [open, preferredMother, ledgerAccountId])

    const accountOptions = useMemo(
        () => [cpMother, lpMother]
            .filter((a): a is Account => !!a)
            .map(a => ({ value: a.id, label: `${a.code} - ${a.name}` })),
        [cpMother, lpMother]
    )

    // For ARS: target is a postable account (Caja/Banco); for ME: target is an FX asset account
    const targetOptions = useMemo(() => {
        if (isARS) {
            return ledgerAccounts
                .filter(a => !a.isHeader && (a.code.startsWith('1.1.01') || a.code.startsWith('1.1.02')))
                .map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }))
        }
        return fxAccounts
            .filter(a => a.type === 'ASSET' && a.currency === currency)
            .map(a => ({ value: a.id, label: a.name, meta: a.currency }))
    }, [isARS, ledgerAccounts, fxAccounts, currency])

    const previewAmount = principal > 0 ? principal * (rate || 0) : 0
    const normalizeName = (value: string) => value.trim().toLowerCase()

    const handleSubmit = async () => {
        const entityName = creditor.trim()
        if (!entityName) { onSuccess('El acreedor/entidad es obligatorio'); return }
        if (!ledgerAccountId) { onSuccess('Selecciona la cuenta madre del pasivo'); return }
        if (!principal || principal <= 0) { onSuccess('Ingresa el monto principal'); return }
        if (!isARS && (!rate || rate <= 0)) { onSuccess('Ingresa el tipo de cambio'); return }
        if (!targetAccountId) { onSuccess('Selecciona el destino de fondos'); return }

        setSaving(true)
        try {
            const motherAccount = ledgerAccounts.find(a => a.id === ledgerAccountId && !a.isHeader)
            if (!motherAccount) throw new Error('No se encontro la cuenta madre del prestamo')

            const subAccountBaseName = `${entityName} - Prestamo ${originDate.slice(0, 7)}`
            const siblingSubaccounts = ledgerAccounts.filter(a => !a.isHeader && a.parentId === motherAccount.id)
            const existingSub = siblingSubaccounts.find(a =>
                normalizeName(a.name) === normalizeName(subAccountBaseName)
            )

            const liabilitySubAccount = existingSub || await (async () => {
                const existingWithBase = siblingSubaccounts.filter(a => normalizeName(a.name).startsWith(normalizeName(subAccountBaseName)))
                const subAccountName = existingWithBase.length === 0
                    ? subAccountBaseName
                    : `${subAccountBaseName} #${existingWithBase.length + 1}`
                const code = await generateNextCode(motherAccount.id)
                return createAccount({
                    code,
                    name: subAccountName,
                    kind: motherAccount.kind,
                    section: motherAccount.section,
                    group: motherAccount.group,
                    statementGroup: motherAccount.statementGroup,
                    parentId: motherAccount.id,
                    normalSide: motherAccount.normalSide,
                    isContra: false,
                    isHeader: false,
                })
            })()

            if (isARS) {
                // ARS loan: create FxAccount (LIABILITY) + FxDebt with rate=1
                const liabilityAccount = await createFxAccount({
                    name: entityName,
                    type: 'LIABILITY',
                    subtype,
                    currency: 'ARS',
                    periodId,
                    accountId: liabilitySubAccount.id,
                    creditor: entityName,
                    openingBalance: 0,
                    openingRate: 1,
                    openingDate: originDate,
                })

                // For ARS, disbursementAccountId points to a ledger account, not an FX account
                // We create a TOMA_DEUDA movement manually with the journal entry
                const newDebt = await createFxDebt(
                    {
                        name: entityName,
                        accountId: liabilityAccount.id,
                        periodId,
                        principalME: principal,
                        currency: 'ARS',
                        rateInicial: 1,
                        rateType: 'Oficial',
                        rateSide: 'venta',
                        principalARS: principal,
                        originDate,
                        interestRateAnnual: tna / 100,
                        installments,
                        frequency,
                        system,
                        firstDueDate,
                        schedule: [],
                        saldoME: principal,
                        paidInstallments: 0,
                        status: 'ACTIVE',
                        creditor: entityName,
                        autoJournal,
                    }
                )

                // Generate opening journal entry manually for ARS
                if (autoJournal) {
                    const entry = await createEntry({
                        date: originDate,
                        memo: `Alta prestamo ARS - ${entityName}`,
                        lines: [
                            { accountId: targetAccountId, debit: principal, credit: 0, description: `Desembolso prestamo ${entityName}` },
                            { accountId: liabilitySubAccount.id, debit: 0, credit: principal, description: `Prestamo ${entityName}` },
                        ],
                        sourceModule: 'fx',
                        sourceId: newDebt.id,
                        sourceType: 'toma_deuda',
                        createdAt: new Date().toISOString(),
                        metadata: { sourceModule: 'fx', sourceId: newDebt.id, journalRole: 'FX_DEBT_OPEN' },
                    })
                    await updateFxDebt(newDebt.id, {
                        linkedJournalEntryIds: [entry.id],
                        journalStatus: 'generated',
                    })
                }
            } else {
                // ME loan: use existing createFxDebt flow with disbursement
                const liabilityAccount = await createFxAccount({
                    name: entityName,
                    type: 'LIABILITY',
                    subtype,
                    currency,
                    periodId,
                    accountId: liabilitySubAccount.id,
                    creditor: entityName,
                    openingBalance: 0,
                    openingRate: rate,
                    openingDate: originDate,
                })

                await createFxDebt(
                    {
                        name: entityName,
                        accountId: liabilityAccount.id,
                        periodId,
                        principalME: principal,
                        currency,
                        rateInicial: rate,
                        rateType: 'Oficial',
                        rateSide: 'venta',
                        principalARS: principal * rate,
                        originDate,
                        interestRateAnnual: tna / 100,
                        installments,
                        frequency,
                        system,
                        firstDueDate,
                        schedule: [],
                        saldoME: principal,
                        paidInstallments: 0,
                        status: 'ACTIVE',
                        creditor: entityName,
                        autoJournal,
                    },
                    {
                        disbursementAccountId: targetAccountId,
                        disbursementDate: originDate,
                        disbursementRate: rate,
                        disbursementRateType: 'Oficial',
                        autoJournal,
                    }
                )
            }

            onSuccess('Préstamo creado correctamente')
            onClose()
        } catch (error) {
            console.error(error)
            onSuccess(error instanceof Error ? error.message : 'Error al crear préstamo')
        } finally {
            setSaving(false)
        }
    }

    // Currency options for loans (no USDT)
    const loanCurrencies: { value: CurrencyCode; label: string }[] = [
        { value: 'ARS', label: 'Peso Argentino (ARS)' },
        { value: 'USD', label: 'Dólar (USD)' },
        { value: 'EUR', label: 'Euro (EUR)' },
    ]

    return (
        <LoanModal
            open={open}
            onClose={onClose}
            title="Nuevo Préstamo"
            size="lg"
            footer={
                <>
                    <LoanButton variant="secondary" onClick={onClose}>Cancelar</LoanButton>
                    <LoanButton onClick={handleSubmit} disabled={saving}>{saving ? 'Creando...' : 'Crear Préstamo y Asentar'}</LoanButton>
                </>
            }
        >
            <div className="space-y-6">
                {/* A. Identidad */}
                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">A. Identidad y Contabilidad</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Acreedor / Entidad</label>
                            <LoanInput value={creditor} onChange={e => setCreditor(e.target.value)} placeholder="Ej: Banco Galicia" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Moneda</label>
                            <LoanSelect value={currency} onChange={e => setCurrency(e.target.value as CurrencyCode)}>
                                {loanCurrencies.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </LoanSelect>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Tipo</label>
                            <LoanSelect value={subtype} onChange={e => setSubtype(e.target.value as FxLiabilitySubtype)}>
                                {Object.entries(LIABILITY_SUBTYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </LoanSelect>
                        </div>
                    </div>

                    {/* Cuenta contable */}
                    <div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="flex gap-3">
                            <div className="text-blue-500"><MagicWand size={20} weight="fill" /></div>
                            <div className="space-y-2 flex-1">
                                <h4 className="text-sm font-semibold text-slate-900">Cuenta contable (pasivo)</h4>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <LoanSearchableSelect
                                        value={ledgerAccountId}
                                        options={accountOptions}
                                        placeholder="Selecciona cuenta madre (CP/LP)"
                                        onChange={v => setLedgerAccountId(v)}
                                        className="flex-1"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* B. Alta Inicial */}
                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">B. Alta Inicial (Desembolso)</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Monto principal {isARS ? '(ARS)' : `(${currency})`}</label>
                            <LoanInput type="number" step="0.01" value={principal || ''} onChange={e => setPrincipal(Number(e.target.value) || 0)} />
                        </div>
                        {!isARS && (
                            <div>
                                <label className="text-xs font-semibold text-slate-500">TC Oficial (BNA) — ARS/{currency}</label>
                                <div className="flex items-center gap-2">
                                    <LoanInput type="number" step="0.01" value={rate || ''} onChange={e => setRate(Number(e.target.value) || 0)} />
                                    <LoanBadge tone="info" className="whitespace-nowrap">Oficial BNA</LoanBadge>
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Fecha de alta</label>
                            <LoanInput type="date" value={originDate} onChange={e => setOriginDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Primer vencimiento</label>
                            <LoanInput type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* C. Condiciones financieras */}
                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">C. Condiciones Financieras</div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Cuotas</label>
                            <LoanInput type="number" value={installments || ''} onChange={e => setInstallments(Number(e.target.value) || 0)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Frecuencia</label>
                            <LoanSelect value={frequency} onChange={e => setFrequency(e.target.value as PaymentFrequency)}>
                                {Object.entries(FREQUENCY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </LoanSelect>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Sistema</label>
                            <LoanSelect value={system} onChange={e => setSystem(e.target.value as LoanSystem)}>
                                {Object.entries(LOAN_SYSTEM_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </LoanSelect>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">TNA %</label>
                            <LoanInput type="number" step="0.01" value={tna || ''} onChange={e => setTna(Number(e.target.value) || 0)} />
                        </div>
                    </div>
                </div>

                {/* D. Destino fondos */}
                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">D. Destino de fondos ({isARS ? 'Cuenta Activo' : 'Cartera ME'})</div>
                    <LoanSearchableSelect
                        value={targetAccountId}
                        options={targetOptions}
                        placeholder={isARS ? 'Selecciona cuenta destino (Caja/Banco)' : 'Selecciona cartera ME destino'}
                        onChange={setTargetAccountId}
                    />
                    <div className="mt-2 text-xs text-slate-500">Se acreditará en el activo seleccionado {!isARS ? 'al TC Oficial BNA' : ''}.</div>
                </div>

                {/* Vista previa asiento */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <Eye size={14} /> Vista previa asiento (ARS)
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2">
                            <span className="font-medium text-slate-800">{isARS ? 'Activo destino' : 'Activo ME'}</span>
                            <span className="font-mono text-slate-500">D: {formatCurrencyARS(previewAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{ledgerAccountId ? accountOptions.find(o => o.value === ledgerAccountId)?.label : 'Pasivo'}</span>
                            <span className="font-mono text-slate-500">H: {formatCurrencyARS(previewAmount)}</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <input type="checkbox" checked={autoJournal} onChange={e => setAutoJournal(e.target.checked)} />
                        Generar asiento automáticamente
                    </div>
                </div>
            </div>
        </LoanModal>
    )
}

// ========================================
// Modal: Ver Préstamo (detail + cronograma + acciones)
// ========================================

function ViewLoanModal({
    open,
    onClose,
    debt,
    fxMovements,
    ledgerAccounts,
    allEntries,
    oficialRate,
    periodId,
    defaultDate,
    settings,
    onSuccess,
}: {
    open: boolean
    onClose: () => void
    debt: FxDebt | null
    fxMovements: FxMovement[]
    ledgerAccounts: Account[]
    allEntries: JournalEntry[]
    oficialRate: number
    periodId: string
    defaultDate: string
    settings: FxSettings | null
    onSuccess: (msg: string) => void
}) {
    const [activeSection, setActiveSection] = useState<'resumen' | 'cronograma' | 'movimientos' | 'asientos'>('resumen')
    const [payModalOpen, setPayModalOpen] = useState(false)
    const [refiModalOpen, setRefiModalOpen] = useState(false)
    const [devengoLoading, setDevengoLoading] = useState(false)
    const [revalLoading, setRevalLoading] = useState(false)

    if (!debt) return null

    const isARS = debt.currency === 'ARS'
    const rateHistorical = isARS ? 1 : debt.rateInicial
    const rateCurrent = isARS ? 1 : oficialRate
    const remainingInstallments = debt.schedule?.filter(i => !i.paid).length || 0
    const debtMovements = fxMovements.filter(m => m.debtId === debt.id)
    const linkedEntryIds = new Set([...(debt.linkedJournalEntryIds || []), ...debtMovements.flatMap(m => m.linkedJournalEntryIds || [])])
    const linkedEntries = allEntries.filter(e => linkedEntryIds.has(e.id))

    const sections = [
        { id: 'resumen' as const, label: 'Resumen' },
        { id: 'cronograma' as const, label: 'Cronograma' },
        { id: 'movimientos' as const, label: 'Movimientos' },
        { id: 'asientos' as const, label: 'Asientos' },
    ]

    const handleDevengoManual = async () => {
        setDevengoLoading(true)
        try {
            const count = await runDevengoForDebt(debt, oficialRate, periodId, ledgerAccounts, settings)
            if (count > 0) {
                onSuccess(`Devengo registrado: ${count} período(s)`)
            } else {
                onSuccess('No hay períodos pendientes de devengar')
            }
        } catch (err) {
            onSuccess(err instanceof Error ? err.message : 'Error al devengar')
        } finally {
            setDevengoLoading(false)
        }
    }

    const handleRevaluacion = async () => {
        if (isARS) { onSuccess('Revaluación solo aplica a préstamos en ME'); return }
        setRevalLoading(true)
        try {
            await runRevaluacionDebt(debt, oficialRate, periodId, ledgerAccounts, settings)
            onSuccess('Revaluación registrada con asiento')
        } catch (err) {
            onSuccess(err instanceof Error ? err.message : 'Error al revaluar')
        } finally {
            setRevalLoading(false)
        }
    }

    const handleDeleteDebt = async () => {
        const debtLabel = debt.creditor || debt.name
        if (!confirm(`¿Eliminar préstamo "${debtLabel}"? Los movimientos y asientos asociados serán eliminados.`)) return
        try {
            // Delete all movements with their journal entries
            for (const m of debtMovements) {
                await deleteFxMovementWithJournal(m.id, { keepManualEntries: true })
            }
            await deleteFxDebt(debt.id)
            onSuccess('Préstamo eliminado')
            onClose()
        } catch (err) {
            onSuccess(err instanceof Error ? err.message : 'Error al eliminar')
        }
    }

    return (
        <LoanModal
            open={open}
            onClose={onClose}
            title={debt.creditor || debt.name}
            size="xl"
            footer={
                <div className="flex w-full justify-between">
                    <LoanButton variant="danger" size="sm" onClick={handleDeleteDebt}><Trash size={14} /> Eliminar</LoanButton>
                    <LoanButton variant="secondary" onClick={onClose}>Cerrar</LoanButton>
                </div>
            }
        >
            <div className="space-y-6">
                {/* KPI row */}
                <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">Saldo capital {isARS ? '' : `(${debt.currency})`}</div>
                        <div className="font-mono text-lg font-semibold">{formatRate(debt.saldoME)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">{isARS ? 'Monto ARS' : 'TC histórico'}</div>
                        <div className="font-mono text-lg font-semibold">{isARS ? formatCurrencyARS(debt.principalARS) : formatRate(rateHistorical)}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="text-xs text-amber-700">Próx. venc.</div>
                        <div className="font-mono text-lg font-semibold text-amber-700">{formatDateShort(debt.schedule?.find(i => !i.paid)?.dueDate)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">Cuotas rest.</div>
                        <div className="font-mono text-lg font-semibold">{remainingInstallments} / {debt.installments}</div>
                    </div>
                </div>

                {/* Info row */}
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div><span className="text-slate-500">Acreedor:</span> <span className="font-medium">{debt.creditor || '—'}</span></div>
                    <div><span className="text-slate-500">TNA:</span> <span className="font-medium">{((debt.interestRateAnnual || 0) * 100).toFixed(2)}%</span></div>
                    <div><span className="text-slate-500">Sistema:</span> <span className="font-medium">{LOAN_SYSTEM_LABELS[debt.system] || debt.system}</span></div>
                    <div><span className="text-slate-500">Frecuencia:</span> <span className="font-medium">{FREQUENCY_LABELS[debt.frequency]}</span></div>
                    <div><span className="text-slate-500">Fecha alta:</span> <span className="font-medium">{formatDateShort(debt.originDate)}</span></div>
                    {!isARS && <div><span className="text-slate-500">Valuación ARS:</span> <span className="font-mono font-semibold">{formatCurrencyARS(debt.saldoME * rateCurrent)}</span></div>}
                </div>

                {/* Actions row */}
                <div className="flex flex-wrap gap-3">
                    <LoanButton variant="secondary" size="sm" onClick={() => setPayModalOpen(true)}>
                        <CurrencyCircleDollar size={16} /> Registrar pago
                    </LoanButton>
                    <LoanButton variant="secondary" size="sm" onClick={() => setRefiModalOpen(true)}>
                        <ArrowLeft size={16} className="rotate-180" /> Refinanciar
                    </LoanButton>
                    <LoanButton variant="secondary" size="sm" onClick={handleDevengoManual} disabled={devengoLoading}>
                        <CalendarCheck size={16} /> {devengoLoading ? 'Devengando...' : 'Devengar intereses'}
                    </LoanButton>
                    {!isARS && (
                        <LoanButton variant="secondary" size="sm" onClick={handleRevaluacion} disabled={revalLoading}>
                            <TrendUp size={16} /> {revalLoading ? 'Revaluando...' : 'Revaluar ME'}
                        </LoanButton>
                    )}
                </div>

                {/* Section tabs */}
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)} className={cx('flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all', activeSection === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Resumen */}
                {activeSection === 'resumen' && (
                    <div className="text-sm text-slate-600 space-y-2">
                        <p>Principal original: <span className="font-mono font-semibold">{formatRate(debt.principalME)} {debt.currency}</span> ({formatCurrencyARS(debt.principalARS)})</p>
                        <p>Saldo pendiente: <span className="font-mono font-semibold">{formatRate(debt.saldoME)} {debt.currency}</span></p>
                        <p>Cuotas pagadas: {debt.paidInstallments} / {debt.installments}</p>
                        <p>Estado: <LoanBadge tone={debt.status === 'ACTIVE' ? 'success' : 'neutral'}>{DEBT_STATUS_LABELS[debt.status]}</LoanBadge></p>
                    </div>
                )}

                {/* Cronograma */}
                {activeSection === 'cronograma' && (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="max-h-72 overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">#</th>
                                        <th className="px-3 py-2 text-left">Vencimiento</th>
                                        <th className="px-3 py-2 text-right">Capital</th>
                                        <th className="px-3 py-2 text-right">Interés</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(debt.schedule || []).map((item: FxDebtInstallment) => (
                                        <tr key={item.number} className="border-t border-slate-200">
                                            <td className="px-3 py-2">{item.number}</td>
                                            <td className="px-3 py-2">{formatDateShort(item.dueDate)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{(item.capitalME || 0).toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{(item.interestME || 0).toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{(item.totalME || 0).toFixed(2)}</td>
                                            <td className="px-3 py-2 text-center">
                                                {item.paid ? <LoanBadge tone="success">Pagada</LoanBadge> : <LoanBadge tone="warning">Pendiente</LoanBadge>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Movimientos */}
                {activeSection === 'movimientos' && (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left">Fecha</th>
                                    <th className="px-3 py-2 text-left">Tipo</th>
                                    <th className="px-3 py-2 text-right">Monto</th>
                                    <th className="px-3 py-2 text-right">ARS</th>
                                    <th className="px-3 py-2 text-center">Asiento</th>
                                </tr>
                            </thead>
                            <tbody>
                                {debtMovements.map(m => (
                                    <tr key={m.id} className="border-t border-slate-200">
                                        <td className="px-3 py-2">{formatDateShort(m.date)}</td>
                                        <td className="px-3 py-2"><LoanBadge>{MOVEMENT_TYPE_LABELS[m.type] || m.type}</LoanBadge></td>
                                        <td className="px-3 py-2 text-right font-mono">{formatRate(m.amount)} {m.currency}</td>
                                        <td className="px-3 py-2 text-right font-mono">{formatCurrencyARS(m.arsAmount)}</td>
                                        <td className="px-3 py-2 text-center">
                                            {(m.linkedJournalEntryIds || []).length > 0
                                                ? <LoanBadge tone="success">OK</LoanBadge>
                                                : m.journalStatus === 'missing'
                                                    ? <LoanBadge tone="danger">Missing</LoanBadge>
                                                    : <LoanBadge>—</LoanBadge>
                                            }
                                        </td>
                                    </tr>
                                ))}
                                {debtMovements.length === 0 && (
                                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Sin movimientos</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Asientos vinculados */}
                {activeSection === 'asientos' && (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                <tr>
                                    <th className="px-3 py-2 text-left">Fecha</th>
                                    <th className="px-3 py-2 text-left">Memo</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {linkedEntries.map(e => {
                                    const total = e.lines.reduce((s, l) => s + l.debit, 0)
                                    return (
                                        <tr key={e.id} className="border-t border-slate-200">
                                            <td className="px-3 py-2">{formatDateShort(e.date)}</td>
                                            <td className="px-3 py-2 text-slate-600">{e.memo || '—'}</td>
                                            <td className="px-3 py-2 text-right font-mono">{formatCurrencyARS(total)}</td>
                                        </tr>
                                    )
                                })}
                                {linkedEntries.length === 0 && (
                                    <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">Sin asientos vinculados</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Sub-modal: Pago */}
            <LoanPaymentModal
                open={payModalOpen}
                onClose={() => setPayModalOpen(false)}
                debt={debt}
                ledgerAccounts={ledgerAccounts}
                oficialRate={oficialRate}
                periodId={periodId}
                defaultDate={defaultDate}
                onSuccess={(msg) => { onSuccess(msg); setPayModalOpen(false) }}
            />
            {/* Sub-modal: Refinanciación */}
            <RefinanciacionSubModal
                open={refiModalOpen}
                onClose={() => setRefiModalOpen(false)}
                debt={debt}
                oficialRate={oficialRate}
                periodId={periodId}
                defaultDate={defaultDate}
                onSuccess={(msg) => { onSuccess(msg); setRefiModalOpen(false) }}
            />
        </LoanModal>
    )
}

// ========================================
// Sub-modal: Refinanciación MVP
// ========================================

function RefinanciacionSubModal({
    open,
    onClose,
    debt,
    oficialRate,
    periodId,
    defaultDate,
    onSuccess,
}: {
    open: boolean
    onClose: () => void
    debt: FxDebt
    oficialRate: number
    periodId: string
    defaultDate: string
    onSuccess: (msg: string) => void
}) {
    const isARS = debt.currency === 'ARS'
    const fxAccounts = useLiveQuery(() => getAllFxAccounts(periodId), [periodId]) || []

    const [additionalAmount, setAdditionalAmount] = useState(0)
    const [newInstallments, setNewInstallments] = useState(debt.installments)
    const [newFrequency, setNewFrequency] = useState<PaymentFrequency>(debt.frequency)
    const [newSystem, setNewSystem] = useState<LoanSystem>(debt.system)
    const [newTNA, setNewTNA] = useState(debt.interestRateAnnual * 100)
    const [rate, setRate] = useState(isARS ? 1 : oficialRate)
    const [date, setDate] = useState(defaultDate)
    const [targetAccountId, setTargetAccountId] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!open) return
        setAdditionalAmount(0)
        setNewInstallments(debt.installments)
        setNewFrequency(debt.frequency)
        setNewSystem(debt.system)
        setNewTNA(debt.interestRateAnnual * 100)
        setRate(isARS ? 1 : oficialRate)
        setDate(defaultDate)
        setTargetAccountId('')
    }, [open, debt, isARS, oficialRate, periodId, defaultDate])

    const meAssetOptions = useMemo(
        () => fxAccounts.filter(a => a.type === 'ASSET' && a.currency === debt.currency).map(a => ({ value: a.id, label: a.name, meta: a.currency })),
        [fxAccounts, debt.currency]
    )

    const handleRefinanciar = async () => {
        setSaving(true)
        try {
            // If additional disbursement
            if (additionalAmount > 0) {
                if (!isARS && !targetAccountId) {
                    onSuccess('Selecciona cartera destino para fondos adicionales')
                    setSaving(false)
                    return
                }
                await addFxDebtDisbursement({
                    debtId: debt.id,
                    amount: additionalAmount,
                    rate,
                    date,
                    targetAccountId: isARS ? '' : targetAccountId,
                    autoJournal: true,
                })
            }

            // Update conditions (new schedule)
            const newSaldo = debt.saldoME + additionalAmount
            const tnaDecimal = newTNA / 100
            const monthlyRate = tnaDecimal / 12
            const freqMonths = newFrequency === 'MENSUAL' ? 1 : newFrequency === 'BIMESTRAL' ? 2 : newFrequency === 'TRIMESTRAL' ? 3 : newFrequency === 'SEMESTRAL' ? 6 : newFrequency === 'ANUAL' ? 12 : 1
            const schedule: FxDebtInstallment[] = []

            for (let i = 0; i < newInstallments; i++) {
                const dueDate = new Date(date)
                dueDate.setMonth(dueDate.getMonth() + (i + 1) * freqMonths)
                const dueDateStr = dueDate.toISOString().split('T')[0]

                let capitalME = 0
                let interestME = 0
                if (newSystem === 'FRANCES') {
                    const pmt = newSaldo * (monthlyRate * freqMonths) / (1 - Math.pow(1 + monthlyRate * freqMonths, -newInstallments))
                    const outstandingBefore = newSaldo - schedule.reduce((s, inst) => s + inst.capitalME, 0)
                    interestME = outstandingBefore * monthlyRate * freqMonths
                    capitalME = pmt - interestME
                } else if (newSystem === 'ALEMAN') {
                    capitalME = newSaldo / newInstallments
                    const outstandingBefore = newSaldo - i * capitalME
                    interestME = outstandingBefore * monthlyRate * freqMonths
                } else if (newSystem === 'AMERICANO') {
                    interestME = newSaldo * monthlyRate * freqMonths
                    capitalME = i === newInstallments - 1 ? newSaldo : 0
                } else { // BULLET
                    interestME = 0
                    capitalME = i === newInstallments - 1 ? newSaldo : 0
                }

                const capFinal = Math.max(0, capitalME)
                const intFinal = Math.max(0, interestME)
                schedule.push({ number: i + 1, dueDate: dueDateStr, capitalME: capFinal, interestME: intFinal, totalME: capFinal + intFinal, paid: false })
            }

            await updateFxDebt(debt.id, {
                saldoME: newSaldo,
                installments: newInstallments,
                frequency: newFrequency,
                system: newSystem,
                interestRateAnnual: tnaDecimal,
                schedule,
                status: 'ACTIVE',
            })

            onSuccess('Refinanciación registrada' + (additionalAmount > 0 ? ' con desembolso adicional' : ''))
        } catch (err) {
            onSuccess(err instanceof Error ? err.message : 'Error al refinanciar')
        } finally {
            setSaving(false)
        }
    }

    return (
        <LoanModal open={open} onClose={onClose} title={`Refinanciar - ${debt.creditor || debt.name}`} size="md" footer={
            <>
                <LoanButton variant="secondary" onClick={onClose}>Cancelar</LoanButton>
                <LoanButton onClick={handleRefinanciar} disabled={saving}>{saving ? 'Procesando...' : 'Refinanciar'}</LoanButton>
            </>
        }>
            <div className="space-y-4">
                <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                    <Info size={14} className="inline-block mr-1" /> Saldo actual: {formatRate(debt.saldoME)} {debt.currency}. Podés agregar monto adicional o solo cambiar condiciones.
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Monto adicional {isARS ? '(ARS)' : `(${debt.currency})`}</label>
                        <LoanInput type="number" step="0.01" value={additionalAmount || ''} onChange={e => setAdditionalAmount(Number(e.target.value) || 0)} placeholder="0 = solo cambio condiciones" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Fecha refinanciación</label>
                        <LoanInput type="date" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                </div>

                {additionalAmount > 0 && !isARS && (
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Destino fondos adicionales (Cartera ME)</label>
                        <LoanSearchableSelect value={targetAccountId} options={meAssetOptions} placeholder="Selecciona cartera" onChange={setTargetAccountId} />
                    </div>
                )}

                <hr className="border-slate-200" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nuevas condiciones</p>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="text-xs font-semibold text-slate-500">TNA (%)</label>
                        <LoanInput type="number" step="0.01" value={newTNA || ''} onChange={e => setNewTNA(Number(e.target.value) || 0)} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Cuotas restantes</label>
                        <LoanInput type="number" step="1" value={newInstallments || ''} onChange={e => setNewInstallments(Number(e.target.value) || 1)} />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Sistema</label>
                        <LoanSelect value={newSystem} onChange={e => setNewSystem(e.target.value as LoanSystem)}>
                            {Object.entries(LOAN_SYSTEM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </LoanSelect>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Frecuencia</label>
                        <LoanSelect value={newFrequency} onChange={e => setNewFrequency(e.target.value as PaymentFrequency)}>
                            {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </LoanSelect>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <div className="flex justify-between"><span>Saldo nuevo:</span><span className="font-mono font-semibold">{formatRate(debt.saldoME + additionalAmount)} {debt.currency}</span></div>
                    {!isARS && <div className="flex justify-between"><span>TC Oficial:</span><span className="font-mono">{formatRate(oficialRate)}</span></div>}
                    <div className="flex justify-between"><span>Valuación ARS:</span><span className="font-mono">{formatCurrencyARS((debt.saldoME + additionalAmount) * rate)}</span></div>
                </div>
            </div>
        </LoanModal>
    )
}

// ========================================
// Devengamiento de intereses
// ========================================

const DAY_MS = 24 * 60 * 60 * 1000
const frequencyMonths: Record<PaymentFrequency, number> = {
    MENSUAL: 1,
    BIMESTRAL: 2,
    TRIMESTRAL: 3,
    SEMESTRAL: 6,
    ANUAL: 12,
    UNICO: 0,
}

type AccrualSlice = {
    periodKey: string
    periodStart: Date
    periodEnd: Date
    days: number
}

function parseISODateUTC(value?: string | null): Date | null {
    if (!value) return null
    const [y, m, d] = value.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(Date.UTC(y, m - 1, d))
}

function formatISODateUTC(date: Date): string {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function getMonthKeyUTC(date: Date): string {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
}

function startOfMonthUTC(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function endOfMonthUTC(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function addMonthsUTC(date: Date, months: number): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

function minDateUTC(a: Date, b: Date): Date {
    return a.getTime() <= b.getTime() ? a : b
}

function maxDateUTC(a: Date, b: Date): Date {
    return a.getTime() >= b.getTime() ? a : b
}

function diffDaysInclusiveUTC(start: Date, end: Date): number {
    return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1
}

function round(value: number, decimals = 2): number {
    const factor = 10 ** decimals
    return Math.round(value * factor) / factor
}

function getLastClosedMonthEndUTC(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
}

function buildDevengoKey(debtId: string, periodKey: string): string {
    return `${debtId}|DEVENGO_INTERES|${periodKey}`
}

function getMaturityDateUTC(debt: FxDebt): Date | null {
    const validScheduleDates = (debt.schedule || [])
        .map(item => parseISODateUTC(item.dueDate))
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime())
    if (validScheduleDates.length > 0) {
        return validScheduleDates[validScheduleDates.length - 1]
    }

    const firstDueDate = parseISODateUTC(debt.firstDueDate)
    if (!firstDueDate) return null

    const installments = Math.max(1, debt.installments || 1)
    const monthsPerPeriod = frequencyMonths[debt.frequency] ?? 1
    if (installments <= 1 || monthsPerPeriod === 0) {
        return firstDueDate
    }

    return addMonthsUTC(firstDueDate, monthsPerPeriod * (installments - 1))
}

function getAccruedPeriods(movements: FxMovement[], debtId: string): Set<string> {
    const periods = new Set<string>()
    movements.forEach(m => {
        if (m.debtId !== debtId || m.type !== 'DEVENGO_INTERES') return
        if (m.reference && /^\d{4}-\d{2}$/.test(m.reference)) {
            periods.add(m.reference)
        }
    })
    return periods
}

function getAccrualSlicesToPost(debt: FxDebt, existingPeriods: Set<string>): AccrualSlice[] {
    if (debt.status !== 'ACTIVE' || debt.interestRateAnnual <= 0 || debt.saldoME <= 0) return []

    const originDate = parseISODateUTC(debt.originDate)
    const maturityDate = getMaturityDateUTC(debt)
    if (!originDate || !maturityDate) return []

    const lastClosedEnd = getLastClosedMonthEndUTC(new Date())
    const accrualEnd = minDateUTC(lastClosedEnd, maturityDate)
    if (accrualEnd.getTime() < originDate.getTime()) return []

    const slices: AccrualSlice[] = []
    let cursor = startOfMonthUTC(originDate)

    while (cursor.getTime() <= accrualEnd.getTime()) {
        const periodKey = getMonthKeyUTC(cursor)
        if (!existingPeriods.has(periodKey)) {
            const monthStart = cursor
            const monthEnd = endOfMonthUTC(cursor)
            const periodStart = maxDateUTC(monthStart, originDate)
            const periodEnd = minDateUTC(monthEnd, accrualEnd)
            const days = diffDaysInclusiveUTC(periodStart, periodEnd)

            if (days > 0) {
                slices.push({ periodKey, periodStart, periodEnd, days })
            }
        }

        cursor = startOfMonthUTC(addMonthsUTC(cursor, 1))
    }

    return slices
}

async function runDevengoForDebt(
    debt: FxDebt,
    oficialRate: number,
    periodId: string,
    ledgerAccounts: Account[],
    _settings: FxSettings | null,
): Promise<number> {
    const debtMovements = await db.fxMovements.where('debtId').equals(debt.id).toArray()
    const existingPeriods = getAccruedPeriods(debtMovements, debt.id)
    const slicesToAccrue = getAccrualSlicesToPost(debt, existingPeriods)

    if (slicesToAccrue.length === 0) return 0

    const isARS = debt.currency === 'ARS'

    // Resolve accounts
    const interesesPerdidosAcc = ledgerAccounts.find(a => a.code === '4.6.02' && !a.isHeader)
    if (!interesesPerdidosAcc) throw new Error('No se encontró cuenta "Intereses perdidos" (4.6.02)')

    // Prefer regularizadora 2.1.05.90 "Intereses a devengar (neg)" for contra
    let interesesDevengadosAcc = ledgerAccounts.find(a => a.code === '2.1.05.90' && !a.isHeader)
    if (!interesesDevengadosAcc) {
        // Fallback: search by name
        interesesDevengadosAcc = ledgerAccounts.find(a =>
            a.name.toLowerCase().includes('intereses devengados') && !a.isHeader
        ) || ledgerAccounts.find(a =>
            a.name.toLowerCase().includes('intereses a devengar') && !a.isHeader
        )
    }
    if (!interesesDevengadosAcc) {
        // Last fallback: use the liability account itself
        const pasivoAcc = debt.accountId
            ? await db.fxAccounts.get(debt.accountId).then(fa => fa?.accountId ? ledgerAccounts.find(a => a.id === fa.accountId) : null)
            : null
        if (pasivoAcc) interesesDevengadosAcc = pasivoAcc
    }
    if (!interesesDevengadosAcc) throw new Error('No se encontró cuenta de pasivo para intereses devengados')

    let count = 0
    for (const slice of slicesToAccrue) {
        const period = slice.periodKey
        const devengoKey = buildDevengoKey(debt.id, period)
        const interestME = round(debt.saldoME * debt.interestRateAnnual * (slice.days / 365), 8)
        const rate = isARS ? 1 : oficialRate
        const interestARS = round(interestME * rate, 2)

        if (interestARS <= 0) continue

        const entryDate = formatISODateUTC(slice.periodEnd)

        // Create journal entry
        await createEntry({
            date: entryDate,
            memo: `Devengo intereses ${debt.creditor || debt.name} - ${period}`,
            lines: [
                { accountId: interesesPerdidosAcc.id, debit: interestARS, credit: 0, description: `Intereses devengados ${period}` },
                { accountId: interesesDevengadosAcc.id, debit: 0, credit: interestARS, description: `Intereses devengados a pagar ${period}` },
            ],
            sourceModule: 'fx',
            sourceId: debt.id,
            sourceType: 'devengo_interes',
            createdAt: new Date().toISOString(),
            metadata: {
                sourceModule: 'fx',
                sourceId: debt.id,
                journalRole: 'FX_ACCRUAL',
                period,
                days: slice.days,
                periodStart: formatISODateUTC(slice.periodStart),
                periodEnd: formatISODateUTC(slice.periodEnd),
                devengoKey,
            },
        })

        // Create movement
        await createFxMovement({
            date: entryDate,
            type: 'DEVENGO_INTERES',
            accountId: debt.accountId,
            periodId,
            amount: interestME,
            currency: debt.currency,
            rate,
            rateType: 'Oficial',
            rateSide: 'venta',
            rateSource: 'BNA',
            arsAmount: interestARS,
            autoJournal: false, // we already created the entry
            debtId: debt.id,
            counterparty: debt.creditor || debt.name,
            reference: period,
            notes: `devengoKey=${devengoKey}; days=${slice.days}; base=365`,
        })

        count++
    }

    return count
}

async function runAutoDevengo(
    debts: FxDebt[],
    oficialRate: number,
    periodId: string,
    ledgerAccounts: Account[],
    settings: FxSettings | null,
): Promise<number> {
    let total = 0
    for (const debt of debts) {
        if (debt.status !== 'ACTIVE') continue
        try {
            const count = await runDevengoForDebt(debt, oficialRate, periodId, ledgerAccounts, settings)
            total += count
        } catch (err) {
            console.warn(`Auto-devengo failed for debt ${debt.id}:`, err)
        }
    }
    return total
}

// ========================================
// Revaluación ME
// ========================================

async function runRevaluacionDebt(
    debt: FxDebt,
    oficialRate: number,
    periodId: string,
    ledgerAccounts: Account[],
    _settings: FxSettings | null,
): Promise<void> {
    if (debt.currency === 'ARS') throw new Error('Revaluación solo aplica a ME')
    if (debt.saldoME <= 0) throw new Error('El saldo es 0, no hay nada que revaluar')

    const rateHistorical = debt.rateInicial
    const valuacionAnterior = debt.saldoME * rateHistorical
    const valuacionActual = debt.saldoME * oficialRate
    const diferencia = valuacionActual - valuacionAnterior

    if (Math.abs(diferencia) < 0.01) throw new Error('No hay diferencia significativa')

    // Resolve accounts: prefer 4.6.08 (loss) / 4.6.07 (gain); fallback 4.6.03
    const difCambioPerdidaAcc = ledgerAccounts.find(a => a.code === '4.6.08' && !a.isHeader)
    const difCambioGananciaAcc = ledgerAccounts.find(a => a.code === '4.6.07' && !a.isHeader)
    const difCambioGenericAcc = ledgerAccounts.find(a => a.code === '4.6.03' && !a.isHeader)

    const difCambioForLoss = difCambioPerdidaAcc || difCambioGenericAcc
    const difCambioForGain = difCambioGananciaAcc || difCambioGenericAcc
    if (!difCambioForLoss || !difCambioForGain) throw new Error('No se encontró cuenta de diferencia de cambio (4.6.03/07/08)')

    const fxAccount = await db.fxAccounts.get(debt.accountId)
    const pasivoAccountId = fxAccount?.accountId
    if (!pasivoAccountId) throw new Error('No se encontró cuenta contable del pasivo')

    const entryDate = new Date().toISOString().split('T')[0]
    const lines = diferencia > 0
        ? [
            // Pasivo aumentó (pérdida por dif. de cambio)
            { accountId: difCambioForLoss.id, debit: Math.abs(diferencia), credit: 0, description: 'Pérdida por diferencia de cambio' },
            { accountId: pasivoAccountId, debit: 0, credit: Math.abs(diferencia), description: `Revaluación ${debt.currency} ${debt.name}` },
        ]
        : [
            // Pasivo disminuyó (ganancia por dif. de cambio)
            { accountId: pasivoAccountId, debit: Math.abs(diferencia), credit: 0, description: `Revaluación ${debt.currency} ${debt.name}` },
            { accountId: difCambioForGain.id, debit: 0, credit: Math.abs(diferencia), description: 'Ganancia por diferencia de cambio' },
        ]

    await createEntry({
        date: entryDate,
        memo: `Revaluación deuda ME - ${debt.name} (TC ${formatRate(rateHistorical)} → ${formatRate(oficialRate)})`,
        lines,
        sourceModule: 'fx',
        sourceId: debt.id,
        sourceType: 'revaluacion_deuda',
        createdAt: new Date().toISOString(),
        metadata: { sourceModule: 'fx', sourceId: debt.id, journalRole: 'FX_REVAL', rateOld: rateHistorical, rateNew: oficialRate },
    })

    // Create movement
    await createFxMovement({
        date: entryDate,
        type: 'REVALUACION_DEUDA',
        accountId: debt.accountId,
        periodId,
        amount: 0, // no FC movement, only ARS adjustment
        currency: debt.currency,
        rate: oficialRate,
        rateType: 'Oficial',
        rateSide: 'venta',
        rateSource: 'BNA',
        arsAmount: Math.abs(diferencia),
        autoJournal: false,
        debtId: debt.id,
        counterparty: debt.creditor || debt.name,
        reference: `Reval ${entryDate}`,
    })

    // Update debt with new rate reference (for future revaluations)
    await updateFxDebt(debt.id, {
        rateInicial: oficialRate, // update to current rate so next reval compares from here
    })
}




