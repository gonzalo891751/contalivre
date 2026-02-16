/**
 * GastosServiciosPage — Gastos y Servicios (no inventariables)
 *
 * Registra comprobantes de gasto (FC A) a Acreedores Varios,
 * pagos vinculados, y muestra estado Pendiente/Parcial/Cancelado.
 * Genera asientos en db.entries con sourceModule='ops'.
 */

import { useState, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Plus,
    Receipt,
    Money,
    Trash,
    Eye,
    PencilSimple,
    MagnifyingGlass,
    ClockCountdown,
    CheckCircle,
    Warning,
    Notebook,
    CaretDown,
    CaretRight,
} from '@phosphor-icons/react'
import { db } from '../../storage/db'
import {
    OPS_MODULE,
    computeVoucherStatus,
    deleteExpenseVoucher,
    deleteExpensePayment,
    updateVoucherMemo,
    formatDocLabel,
} from '../../storage/ops'
import type { VoucherWithStatus, VoucherStatus } from '../../storage/ops'
import type { JournalEntry, Account } from '../../core/models'
import OperationsPageHeader from '../../components/OperationsPageHeader'
import ComprobanteGastoModal from './components/ComprobanteGastoModal'
import PagoGastoModal from './components/PagoGastoModal'
import type { VoucherIvaInfo } from './components/PagoGastoModal'

// ─── Formatting ──────────────────────────────────────────────

const fmtCurrency = (n: number): string =>
    new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)

const fmtDate = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

type TabName = 'comprobantes' | 'pagos'

// ─── Main Component ──────────────────────────────────────────

export default function GastosServiciosPage() {
    const [activeTab, setActiveTab] = useState<TabName>('comprobantes')
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | VoucherStatus>('all')

    // Modal state
    const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false)
    const [pagoModalOpen, setPagoModalOpen] = useState(false)
    const [pagoVoucherId, setPagoVoucherId] = useState<string | undefined>()
    const [pagoCounterparty, setPagoCounterparty] = useState<string | undefined>()
    const [pagoMaxAmount, setPagoMaxAmount] = useState<number | undefined>()
    const [pagoIvaInfo, setPagoIvaInfo] = useState<VoucherIvaInfo | undefined>()

    // Detail/edit state
    const [detailVoucherId, setDetailVoucherId] = useState<string | null>(null)
    const [editingMemo, setEditingMemo] = useState<{ id: string; memo: string; docNumber: string } | null>(null)

    // ── Data hooks ──
    const accounts = useLiveQuery(() => db.accounts.toArray(), [])
    // Query ops entries + fixed-assets acquisition/payment entries
    const allOpsEntries = useLiveQuery(
        () => db.entries.where('sourceModule').equals(OPS_MODULE).toArray(),
        [],
    )
    const allFaEntries = useLiveQuery(
        () => db.entries.where('sourceModule').equals('fixed-assets').toArray(),
        [],
    )

    const vouchers = useMemo(() => {
        const ops = (allOpsEntries || []).filter(e => e.sourceType === 'vendor_invoice')
        // Include fixed-assets acquisition entries (they have counterparty + totals metadata)
        const fa = (allFaEntries || []).filter(e =>
            e.sourceType === 'acquisition' && e.metadata?.totals?.total
        )
        return [...ops, ...fa].sort((a, b) => b.date.localeCompare(a.date))
    }, [allOpsEntries, allFaEntries])

    const payments = useMemo(() => {
        const ops = (allOpsEntries || []).filter(e => e.sourceType === 'payment')
        // Include fixed-assets payment entries
        const fa = (allFaEntries || []).filter(e =>
            e.sourceType === 'payment' && e.metadata?.applyTo
        )
        return [...ops, ...fa].sort((a, b) => b.date.localeCompare(a.date))
    }, [allOpsEntries, allFaEntries])

    const vouchersWithStatus = useMemo((): VoucherWithStatus[] => {
        return vouchers.map(v => computeVoucherStatus(v, payments))
    }, [vouchers, payments])

    // ── KPIs ──
    const kpis = useMemo(() => {
        const totalPending = vouchersWithStatus
            .filter(v => v.status !== 'CANCELADO')
            .reduce((sum, v) => sum + v.remaining, 0)
        const pendingCount = vouchersWithStatus.filter(v => v.status === 'PENDIENTE').length
        const partialCount = vouchersWithStatus.filter(v => v.status === 'PARCIAL').length
        return { totalPending, pendingCount, partialCount, totalVouchers: vouchers.length }
    }, [vouchersWithStatus, vouchers])

    // ── Filtered lists ──
    const filteredVouchers = useMemo(() => {
        let list = vouchersWithStatus
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase()
            list = list.filter(v => {
                const cp = v.entry.metadata?.counterparty?.name || ''
                const docNum = v.entry.metadata?.doc?.number || ''
                return cp.toLowerCase().includes(q) || docNum.toLowerCase().includes(q) || v.entry.memo.toLowerCase().includes(q)
            })
        }
        if (statusFilter !== 'all') {
            list = list.filter(v => v.status === statusFilter)
        }
        return list
    }, [vouchersWithStatus, searchQuery, statusFilter])

    const filteredPayments = useMemo(() => {
        if (!searchQuery.trim()) return payments
        const q = searchQuery.toLowerCase()
        return payments.filter(p => {
            const cp = p.metadata?.counterparty?.name || ''
            return cp.toLowerCase().includes(q) || p.memo.toLowerCase().includes(q)
        })
    }, [payments, searchQuery])

    // Account map for display
    const accountMap = useMemo(() => {
        if (!accounts) return new Map<string, Account>()
        return new Map(accounts.map(a => [a.id, a]))
    }, [accounts])

    // ── Helpers ──
    /** Extract VoucherIvaInfo from voucher metadata */
    const extractIvaInfo = useCallback((voucherId: string): VoucherIvaInfo | undefined => {
        const v = vouchers.find(e => e.id === voucherId)
        if (!v) return undefined
        const meta = v.metadata || {}
        const totals = meta.totals || { vat: 0, total: 0 }
        return {
            discriminateVat: !!meta.discriminateVat,
            vatRate: meta.vatRate || 0,
            voucherVat: totals.vat || 0,
            voucherTotal: totals.total || 0,
            docLetter: meta.doc?.docLetter || meta.doc?.type?.split('_')[1],
        }
    }, [vouchers])

    // ── Handlers ──
    const handleOpenPago = useCallback((voucherId: string, counterparty: string, maxAmount: number) => {
        setPagoVoucherId(voucherId)
        setPagoCounterparty(counterparty)
        setPagoMaxAmount(maxAmount)
        setPagoIvaInfo(extractIvaInfo(voucherId))
        setPagoModalOpen(true)
    }, [extractIvaInfo])

    const handleDeleteVoucher = useCallback(async (voucherId: string, hasPayments: boolean) => {
        const msg = hasPayments
            ? 'Se eliminara el comprobante y todos los pagos vinculados. Esta accion no se puede deshacer.'
            : 'Se eliminara el comprobante y su asiento contable. Esta accion no se puede deshacer.'
        if (!window.confirm(msg)) return
        await deleteExpenseVoucher(voucherId)
    }, [])

    const handleDeletePayment = useCallback(async (paymentId: string) => {
        if (!window.confirm('Se eliminara el pago y su asiento contable. Esta accion no se puede deshacer.')) return
        await deleteExpensePayment(paymentId)
    }, [])

    const handleSaveMemo = useCallback(async () => {
        if (!editingMemo) return
        await updateVoucherMemo(editingMemo.id, { memo: editingMemo.memo, docNumber: editingMemo.docNumber })
        setEditingMemo(null)
    }, [editingMemo])

    // ── Detail view for a specific voucher ──
    const detailVoucher = useMemo(() => {
        if (!detailVoucherId) return null
        return vouchersWithStatus.find(v => v.entry.id === detailVoucherId) || null
    }, [detailVoucherId, vouchersWithStatus])

    const detailPayments = useMemo(() => {
        if (!detailVoucherId) return []
        return payments.filter(p => p.metadata?.applyTo?.entryId === detailVoucherId)
    }, [detailVoucherId, payments])

    // ================================================================
    // RENDER
    // ================================================================

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 fade-in">
            <OperationsPageHeader
                title="Gastos y Servicios"
                subtitle="Registra comprobantes no inventariables, acreedores y pagos."
                rightSlot={
                    <button
                        onClick={() => setComprobanteModalOpen(true)}
                        className="btn-primary px-4 py-2 rounded-md font-medium text-xs flex items-center gap-2 shadow-sm"
                    >
                        <Plus size={14} weight="bold" />
                        Nuevo Comprobante
                    </button>
                }
                badges={
                    <div className="flex gap-4">
                        <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Deuda Pendiente</div>
                            <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                                {fmtCurrency(kpis.totalPending)}
                            </div>
                        </div>
                        <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Comprobantes</div>
                            <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                                {kpis.totalVouchers}
                            </div>
                        </div>
                    </div>
                }
            />

            {/* TABS */}
            <div className="border-b border-slate-200 flex gap-6 overflow-x-auto">
                {([
                    { key: 'comprobantes' as const, label: 'Comprobantes' },
                    { key: 'pagos' as const, label: 'Pagos' },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setDetailVoucherId(null) }}
                        className={`pb-3 font-medium transition-colors whitespace-nowrap ${activeTab === tab.key
                            ? 'text-teal-600 border-b-2 border-teal-600 font-semibold'
                            : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Detail view */}
            {detailVoucherId && detailVoucher && (
                <VoucherDetail
                    voucher={detailVoucher}
                    payments={detailPayments}
                    accountMap={accountMap}
                    onClose={() => setDetailVoucherId(null)}
                    onPay={() => handleOpenPago(detailVoucher.entry.id, detailVoucher.entry.metadata?.counterparty?.name || '', detailVoucher.remaining)}
                    onDelete={() => handleDeleteVoucher(detailVoucher.entry.id, detailPayments.length > 0)}
                    onDeletePayment={handleDeletePayment}
                />
            )}

            {/* Comprobantes tab */}
            {activeTab === 'comprobantes' && !detailVoucherId && (
                <ComprobantesTab
                    vouchers={filteredVouchers}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    onViewDetail={setDetailVoucherId}
                    onPay={handleOpenPago}
                    onDelete={handleDeleteVoucher}
                    onNewComprobante={() => setComprobanteModalOpen(true)}
                    editingMemo={editingMemo}
                    onStartEditMemo={setEditingMemo}
                    onSaveMemo={handleSaveMemo}
                    onCancelEditMemo={() => setEditingMemo(null)}
                    onEditingMemoChange={setEditingMemo}
                    payments={payments}
                />
            )}

            {/* Pagos tab */}
            {activeTab === 'pagos' && !detailVoucherId && (
                <PagosTab
                    payments={filteredPayments}
                    vouchers={vouchers}
                    accountMap={accountMap}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onDelete={handleDeletePayment}
                />
            )}

            {/* MODALS */}
            {comprobanteModalOpen && accounts && (
                <ComprobanteGastoModal
                    accounts={accounts}
                    onClose={() => setComprobanteModalOpen(false)}
                />
            )}

            {pagoModalOpen && accounts && pagoVoucherId && (
                <PagoGastoModal
                    accounts={accounts}
                    voucherId={pagoVoucherId}
                    counterpartyName={pagoCounterparty || ''}
                    maxAmount={pagoMaxAmount || 0}
                    voucherIvaInfo={pagoIvaInfo}
                    onClose={() => { setPagoModalOpen(false); setPagoVoucherId(undefined) }}
                />
            )}
        </div>
    )
}

// ================================================================
// SUB-COMPONENTS
// ================================================================

function StatusBadge({ status }: { status: VoucherStatus }) {
    const config = {
        PENDIENTE: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', label: 'Pendiente', Icon: ClockCountdown },
        PARCIAL: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', label: 'Parcial', Icon: Warning },
        CANCELADO: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', label: 'Cancelado', Icon: CheckCircle },
    }[status]

    return (
        <span className={`${config.bg} ${config.text} px-2.5 py-0.5 rounded text-xs font-semibold border ${config.border} inline-flex items-center gap-1`}>
            <config.Icon size={12} weight="fill" /> {config.label}
        </span>
    )
}

function ComprobantesTab({
    vouchers,
    searchQuery,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    onViewDetail,
    onPay,
    onDelete,
    onNewComprobante,
    editingMemo,
    onStartEditMemo,
    onSaveMemo,
    onCancelEditMemo,
    onEditingMemoChange,
    payments,
}: {
    vouchers: VoucherWithStatus[]
    searchQuery: string
    onSearchChange: (q: string) => void
    statusFilter: 'all' | VoucherStatus
    onStatusFilterChange: (f: 'all' | VoucherStatus) => void
    onViewDetail: (id: string) => void
    onPay: (voucherId: string, counterparty: string, maxAmount: number) => void
    onDelete: (voucherId: string, hasPayments: boolean) => void
    onNewComprobante: () => void
    editingMemo: { id: string; memo: string; docNumber: string } | null
    onStartEditMemo: (data: { id: string; memo: string; docNumber: string }) => void
    onSaveMemo: () => void
    onCancelEditMemo: () => void
    onEditingMemoChange: (data: { id: string; memo: string; docNumber: string } | null) => void
    payments: JournalEntry[]
}) {
    return (
        <div className="fade-in space-y-4">
            {/* Search + Filters */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="relative w-full md:w-80">
                    <MagnifyingGlass size={18} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Buscar por tercero, numero..."
                        className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 shadow-sm"
                    />
                </div>
                <div className="flex gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => onStatusFilterChange(e.target.value as 'all' | 'PENDIENTE' | 'PARCIAL' | 'CANCELADO')}
                        className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:border-teal-500 block p-2 px-3 shadow-sm cursor-pointer"
                    >
                        <option value="all">Todos los estados</option>
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="PARCIAL">Parcial</option>
                        <option value="CANCELADO">Cancelado</option>
                    </select>
                    <button
                        onClick={onNewComprobante}
                        className="btn-primary px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2"
                    >
                        <Plus size={14} weight="bold" /> Nuevo Comprobante
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                <th className="px-4 py-4">Fecha</th>
                                <th className="px-4 py-4">Tercero</th>
                                <th className="px-4 py-4">Tipo / Numero</th>
                                <th className="px-4 py-4">Vence</th>
                                <th className="px-4 py-4 text-right">Neto</th>
                                <th className="px-4 py-4 text-right">IVA</th>
                                <th className="px-4 py-4 text-right">Total</th>
                                <th className="px-4 py-4 text-center">Estado</th>
                                <th className="px-4 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {vouchers.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <Notebook size={32} className="text-slate-400" weight="duotone" />
                                            </div>
                                            <h3 className="text-slate-900 font-medium mb-1">Sin comprobantes</h3>
                                            <p className="text-slate-500 text-xs mb-4">Registra tu primer comprobante de gasto.</p>
                                            <button
                                                onClick={onNewComprobante}
                                                className="btn-primary px-4 py-2 rounded-lg text-sm font-medium"
                                            >
                                                <Plus size={14} weight="bold" className="inline mr-1" /> Nuevo Comprobante
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                vouchers.map(v => {
                                    const meta = v.entry.metadata || {}
                                    const cpName = meta.counterparty?.name
                                    const counterparty = cpName ? cpName : 'Acreedores Varios'
                                    const docLabel = formatDocLabel(meta)
                                    const docNumber = meta.doc?.number || ''
                                    const totals = meta.totals || { net: 0, vat: 0, total: 0 }
                                    const hasPayments = payments.some(p => p.metadata?.applyTo?.entryId === v.entry.id)
                                    const isEditing = editingMemo?.id === v.entry.id

                                    return (
                                        <tr key={v.entry.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                                                {fmtDate(v.entry.date)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className={`font-medium ${cpName ? 'text-slate-900' : 'text-slate-400 italic'}`}>{counterparty}</div>
                                                {meta.paymentCondition && (
                                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                                                        {meta.paymentCondition === 'CTA_CTE' ? 'Cta. Cte.' : meta.paymentCondition === 'DOCUMENTADO' ? 'Documentado' : 'Contado'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={editingMemo.docNumber}
                                                        onChange={e => onEditingMemoChange({ ...editingMemo, docNumber: e.target.value })}
                                                        onKeyDown={e => { if (e.key === 'Enter') onSaveMemo(); if (e.key === 'Escape') onCancelEditMemo() }}
                                                        className="border border-teal-300 rounded px-2 py-1 text-xs w-32"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <span className="text-xs">{docLabel}{docNumber ? ` #${docNumber}` : ''}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500 tabular-nums">
                                                {meta.dueDate ? fmtDate(meta.dueDate) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                                                {fmtCurrency(totals.net)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-slate-500">
                                                {totals.vat > 0 ? fmtCurrency(totals.vat) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                                                {fmtCurrency(totals.total)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <StatusBadge status={v.status} />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => onViewDetail(v.entry.id)}
                                                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                                                        title="Ver detalle"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    {isEditing ? (
                                                        <>
                                                            <button onClick={onSaveMemo} className="text-teal-600 text-[10px] font-semibold px-2 py-1 rounded hover:bg-teal-50">Guardar</button>
                                                            <button onClick={onCancelEditMemo} className="text-slate-400 text-[10px] font-semibold px-2 py-1 rounded hover:bg-slate-100">Cancelar</button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => onStartEditMemo({
                                                                id: v.entry.id,
                                                                memo: v.entry.memo,
                                                                docNumber: meta.doc?.number || '',
                                                            })}
                                                            className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                                                            title="Editar numero"
                                                        >
                                                            <PencilSimple size={14} />
                                                        </button>
                                                    )}
                                                    {v.status !== 'CANCELADO' && (
                                                        <button
                                                            onClick={() => onPay(v.entry.id, counterparty, v.remaining)}
                                                            className="text-teal-600 text-[10px] font-semibold px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                                                        >
                                                            Pagar
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => onDelete(v.entry.id, hasPayments)}
                                                        className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <Trash size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function PagosTab({
    payments,
    vouchers,
    accountMap,
    searchQuery,
    onSearchChange,
    onDelete,
}: {
    payments: JournalEntry[]
    vouchers: JournalEntry[]
    accountMap: Map<string, Account>
    searchQuery: string
    onSearchChange: (q: string) => void
    onDelete: (paymentId: string) => void
}) {
    const voucherMap = useMemo(() => new Map(vouchers.map(v => [v.id, v])), [vouchers])

    return (
        <div className="fade-in space-y-4">
            <div className="relative w-full md:w-80">
                <MagnifyingGlass size={18} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Buscar por tercero..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500 shadow-sm"
                />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                <th className="px-4 py-4">Fecha</th>
                                <th className="px-4 py-4">Tercero</th>
                                <th className="px-4 py-4">Comprobante Vinculado</th>
                                <th className="px-4 py-4 text-right">Importe</th>
                                <th className="px-4 py-4">Medio</th>
                                <th className="px-4 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                            {payments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                                <Money size={32} className="text-slate-400" weight="duotone" />
                                            </div>
                                            <h3 className="text-slate-900 font-medium mb-1">Sin pagos registrados</h3>
                                            <p className="text-slate-500 text-xs">Los pagos se registran desde la pestaña Comprobantes.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                payments.map(p => {
                                    const meta = p.metadata || {}
                                    const counterparty = meta.counterparty?.name || '—'
                                    const linkedVoucherId = meta.applyTo?.entryId
                                    const linkedVoucher = linkedVoucherId ? voucherMap.get(linkedVoucherId) : null
                                    const voucherRef = linkedVoucher
                                        ? `${formatDocLabel(linkedVoucher.metadata || {})} #${linkedVoucher.metadata?.doc?.number || linkedVoucherId?.slice(0, 8)}`
                                        : linkedVoucherId?.slice(0, 8) || '—'
                                    const amount = meta.applyTo?.amount || 0

                                    // Extract payment method from lines (haber side, excluding retentions)
                                    const haberLines = p.lines.filter(l => l.credit > 0)
                                    const medios = haberLines.map(l => {
                                        const acc = accountMap.get(l.accountId)
                                        return acc ? acc.name : 'Efectivo'
                                    }).join(', ')

                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                                                {fmtDate(p.date)}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-900">{counterparty}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600">
                                                <span className="bg-slate-100 px-2 py-0.5 rounded font-medium">{voucherRef}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                                                {fmtCurrency(amount)}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                                                {medios || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => onDelete(p.id)}
                                                    className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                                    title="Eliminar pago"
                                                >
                                                    <Trash size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function VoucherDetail({
    voucher,
    payments,
    accountMap,
    onClose,
    onPay,
    onDelete,
    onDeletePayment,
}: {
    voucher: VoucherWithStatus
    payments: JournalEntry[]
    accountMap: Map<string, Account>
    onClose: () => void
    onPay: () => void
    onDelete: () => void
    onDeletePayment: (paymentId: string) => void
}) {
    const meta = voucher.entry.metadata || {}
    const concepts: Array<{ accountId: string; description: string; amount: number }> = meta.concepts || []
    const totals = meta.totals || { net: 0, vat: 0, taxes: 0, total: 0 }
    const [showLines, setShowLines] = useState(false)

    return (
        <div className="fade-in bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 mb-2 flex items-center gap-1">
                        <CaretRight size={10} className="rotate-180" /> Volver al listado
                    </button>
                    <h2 className="font-display font-bold text-xl text-slate-900">
                        {formatDocLabel(meta)} {meta.doc?.number ? `#${meta.doc.number}` : ''}
                    </h2>
                    <p className="text-slate-500 text-sm">{meta.counterparty?.name || 'Acreedores Varios'} &middot; {fmtDate(voucher.entry.date)}</p>
                </div>
                <div className="flex items-center gap-3">
                    <StatusBadge status={voucher.status} />
                    {voucher.status !== 'CANCELADO' && (
                        <button onClick={onPay} className="btn-primary px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1">
                            <Money size={14} /> Registrar Pago
                        </button>
                    )}
                    <button onClick={onDelete} className="p-2 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Eliminar">
                        <Trash size={16} />
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Condicion</div>
                    <div className="text-sm font-medium text-slate-900">
                        {meta.paymentCondition === 'CTA_CTE' ? 'Cuenta Corriente' : meta.paymentCondition === 'DOCUMENTADO' ? 'Documentado' : 'Contado'}
                    </div>
                </div>
                {meta.dueDate && (
                    <div>
                        <div className="text-[10px] uppercase font-bold text-slate-400">Vencimiento</div>
                        <div className="text-sm font-medium text-slate-900">{fmtDate(meta.dueDate)}</div>
                    </div>
                )}
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Neto</div>
                    <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">{fmtCurrency(totals.net)}</div>
                </div>
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">IVA {meta.discriminateVat ? `${meta.vatRate}%` : '(no discrimina)'}</div>
                    <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">{fmtCurrency(totals.vat)}</div>
                </div>
                <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total</div>
                    <div className="font-mono text-sm font-bold text-slate-900 tabular-nums">{fmtCurrency(totals.total)}</div>
                </div>
            </div>

            {/* Concepts */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Conceptos</h3>
                <div className="space-y-1">
                    {concepts.map((c, i) => {
                        const acc = accountMap.get(c.accountId)
                        return (
                            <div key={i} className="flex justify-between items-center bg-slate-50 px-3 py-2 rounded text-sm">
                                <div>
                                    <span className="text-slate-900 font-medium">{c.description || 'Gasto'}</span>
                                    {acc && <span className="text-xs text-slate-400 ml-2">{acc.code} {acc.name}</span>}
                                </div>
                                <span className="font-mono tabular-nums">{fmtCurrency(c.amount)}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Journal lines (collapsible) */}
            <div>
                <button
                    onClick={() => setShowLines(!showLines)}
                    className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1 hover:text-slate-700"
                >
                    {showLines ? <CaretDown size={12} /> : <CaretRight size={12} />}
                    Asiento contable ({voucher.entry.lines.length} lineas)
                </button>
                {showLines && (
                    <div className="mt-2 bg-slate-50 rounded-lg p-3 overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-400 uppercase">
                                    <th className="text-left pb-2">Cuenta</th>
                                    <th className="text-right pb-2">Debe</th>
                                    <th className="text-right pb-2">Haber</th>
                                </tr>
                            </thead>
                            <tbody>
                                {voucher.entry.lines.map((l, i) => {
                                    const acc = accountMap.get(l.accountId)
                                    return (
                                        <tr key={i} className="border-t border-slate-100">
                                            <td className="py-1.5 text-slate-700">
                                                {acc ? `${acc.code} ${acc.name}` : l.accountId.slice(0, 8)}
                                                {l.description && <span className="text-slate-400 ml-1">({l.description})</span>}
                                            </td>
                                            <td className="py-1.5 text-right font-mono tabular-nums">{l.debit > 0 ? fmtCurrency(l.debit) : ''}</td>
                                            <td className="py-1.5 text-right font-mono tabular-nums">{l.credit > 0 ? fmtCurrency(l.credit) : ''}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Payment progress */}
            <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Pagos ({payments.length})</h3>
                {voucher.status !== 'CANCELADO' && meta.paymentCondition !== 'CONTADO' && (
                    <div className="mb-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Pagado: {fmtCurrency(voucher.totalPaid)}</span>
                            <span>Pendiente: {fmtCurrency(voucher.remaining)}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-teal-500 rounded-full transition-all"
                                style={{ width: `${totals.total > 0 ? Math.min((voucher.totalPaid / totals.total) * 100, 100) : 0}%` }}
                            />
                        </div>
                    </div>
                )}
                {payments.length === 0 && meta.paymentCondition !== 'CONTADO' ? (
                    <p className="text-slate-400 text-xs italic">Sin pagos registrados.</p>
                ) : meta.paymentCondition === 'CONTADO' ? (
                    <p className="text-slate-400 text-xs italic">Pagado al contado en el momento del registro.</p>
                ) : (
                    <div className="space-y-2">
                        {payments.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded">
                                <div className="flex items-center gap-3">
                                    <Receipt size={14} className="text-teal-500" />
                                    <div>
                                        <span className="text-sm font-medium text-slate-900">{fmtDate(p.date)}</span>
                                        <span className="text-xs text-slate-400 ml-2">{p.memo}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold tabular-nums">{fmtCurrency(p.metadata?.applyTo?.amount || 0)}</span>
                                    <button
                                        onClick={() => onDeletePayment(p.id)}
                                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                        title="Eliminar pago"
                                    >
                                        <Trash size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
