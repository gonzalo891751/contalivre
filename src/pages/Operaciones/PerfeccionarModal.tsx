/**
 * PerfeccionarModal - Modal reutilizable para Perfeccionar Crédito/Pasivo
 *
 * Soporta multi-destino (split), vista previa de asiento, override flags,
 * y campos de instrumento por destino.
 *
 * Usado por ClientesDeudoresPage y ProveedoresAcreedoresPage.
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import {
    ArrowsLeftRight,
    X,
    Plus,
    Trash,
    CheckCircle,
    WarningCircle,
    CurrencyCircleDollar,
    Info,
} from '@phosphor-icons/react'
import AccountSearchSelect from '../../ui/AccountSearchSelect'
import type { Account } from '../../core/models'

// ================================================================
// TYPES
// ================================================================

export interface PendingDocOption {
    movementId: string
    date: string
    counterparty: string
    reference: string
    total: number
    saldoPendiente: number
}

export interface SplitRow {
    id: string
    accountId: string
    amount: number
    instrumentType: '' | 'PAGARE' | 'ECHEQ' | 'CHEQUE'
    instrumentNumber: string
    instrumentBank: string
    dueDate: string
    termDays: number
    notes: string
}

interface PreviewLine {
    accountName: string
    accountCode: string
    debit: number
    credit: number
}

export type PerfeccionarSide = 'clientes' | 'proveedores' | 'acreedores'

/**
 * Whitelist de cuentas destino permitidas por lado.
 * Perfeccionar = SOLO instrumentación (cheques/pagarés/valores/documentos).
 * Dinero real (Caja/Bancos/QR/Transferencia/Tarjeta) va por Pagos.
 */
const ALLOWED_DEST_CODES: Record<PerfeccionarSide, string[]> = {
    clientes: [
        '1.1.02.02', // Documentos a cobrar
        '1.1.01.04', // Valores a depositar
        '1.1.01.05', // Valores a depositar diferidos
    ],
    proveedores: [
        '2.1.01.02', // Documentos a pagar
        '2.1.01.04', // Valores a pagar
        '2.1.01.05', // Valores a pagar diferidos
    ],
    acreedores: [
        '2.1.01.02', // Documentos a pagar
        '2.1.01.04', // Valores a pagar
        '2.1.01.05', // Valores a pagar diferidos
    ],
}

interface PerfeccionarModalProps {
    open: boolean
    onClose: () => void
    onSave: (data: PerfeccionarSaveData) => Promise<void>
    side: PerfeccionarSide
    terceroName: string
    accounts: Account[]
    pendingDocs: PendingDocOption[]
    /** Pre-selected sourceMovementId (from subfila click) */
    initialSourceMovementId?: string
    /** Pre-filled amount (from subfila click) */
    initialAmount?: number
    /** Accent color class prefix: 'emerald' for clientes, 'amber' for proveedores */
    accentColor: 'emerald' | 'amber'
    /** Source account display (e.g. "Deudores por Ventas (1.1.02.01)") */
    sourceLabel: string
    /** Control codes that need per-tercero subcuenta resolution */
    destControlCodes: string[]
    /** Callback to redirect to Pagos (Cobrar/Pagar) flow */
    onGoToPagos?: (data: { counterpartyName: string; suggestedAmount: number }) => void
}

export interface PerfeccionarSaveData {
    date: string
    totalAmount: number
    sourceMovementId: string
    splits: SplitRow[]
    notes: string
}

/** Format number as ARS currency */
const fmtCurrency = (n: number): string =>
    new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n)

/** Format ISO date to short locale string */
const fmtDate = (iso: string): string => {
    const d = new Date(iso + 'T12:00:00')
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

let splitIdCounter = 0
function nextSplitId() {
    return `split-${++splitIdCounter}-${Math.random().toString(36).slice(2, 7)}`
}

// ================================================================
// COMPONENT
// ================================================================

export default function PerfeccionarModal({
    open,
    onClose,
    onSave,
    side,
    terceroName,
    accounts,
    pendingDocs,
    initialSourceMovementId,
    initialAmount,
    accentColor,
    sourceLabel,
    destControlCodes,
    onGoToPagos,
}: PerfeccionarModalProps) {
    // --- Form state ---
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [sourceMovementId, setSourceMovementId] = useState('')
    const [notes, setNotes] = useState('')
    const [splits, setSplits] = useState<SplitRow[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Override flags — don't auto-fill if user manually edited
    const [userOverrodeDate, setUserOverrodeDate] = useState(false)
    const [userOverrodeAmount, setUserOverrodeAmount] = useState(false)

    // Whitelist filter: only allow instrument accounts as destinations
    const allowedDestFilter = useMemo(() => {
        const allowedCodes = new Set(ALLOWED_DEST_CODES[side])
        const allowedParentIds = new Set(
            accounts.filter(a => allowedCodes.has(a.code)).map(a => a.id)
        )
        return (a: Account) => {
            if (a.isHeader) return false
            // Direct match (the control account itself)
            if (allowedCodes.has(a.code)) return true
            // Child of an allowed control account (subcuenta per tercero)
            if (a.parentId && allowedParentIds.has(a.parentId)) return true
            return false
        }
    }, [accounts, side])

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            const defaultAmount = initialAmount || 0
            setDate(new Date().toISOString().split('T')[0])
            setSourceMovementId(initialSourceMovementId || '')
            setNotes('')
            setSplits([{
                id: nextSplitId(),
                accountId: '',
                amount: defaultAmount,
                instrumentType: '',
                instrumentNumber: '',
                instrumentBank: '',
                dueDate: '',
                termDays: 0,
                notes: '',
            }])
            setSaving(false)
            setError(null)
            setUserOverrodeDate(false)
            setUserOverrodeAmount(false)

            // If initial source movement, try to prefill date from it
            if (initialSourceMovementId) {
                const doc = pendingDocs.find(d => d.movementId === initialSourceMovementId)
                if (doc) {
                    setDate(doc.date)
                }
            }
        }
    }, [open, initialSourceMovementId, initialAmount, pendingDocs])

    // Total from splits
    const totalSplits = useMemo(() => splits.reduce((s, r) => s + (r.amount || 0), 0), [splits])

    // Filtered docs for this tercero
    const terceroDocs = useMemo(() => {
        const norm = terceroName.toLowerCase().trim()
        return pendingDocs.filter(d => d.counterparty.toLowerCase().trim() === norm)
    }, [pendingDocs, terceroName])

    // Handle comprobante origen change
    const handleSourceChange = useCallback((movId: string) => {
        setSourceMovementId(movId)
        if (movId) {
            const doc = pendingDocs.find(d => d.movementId === movId)
            if (doc) {
                if (!userOverrodeDate) {
                    setDate(doc.date)
                }
                if (!userOverrodeAmount && splits.length === 1) {
                    setSplits(prev => [{
                        ...prev[0],
                        amount: doc.saldoPendiente,
                    }])
                }
            }
        }
    }, [pendingDocs, userOverrodeDate, userOverrodeAmount, splits.length])

    // Determine if a dest account needs instrument fields
    const needsInstrumentFields = useCallback((accountId: string) => {
        if (!accountId) return false
        const acc = accounts.find(a => a.id === accountId)
        if (!acc) return false
        // Instrument fields for control accounts that hold documents/valores
        return destControlCodes.includes(acc.code)
    }, [accounts, destControlCodes])

    // Add split row
    const addSplit = useCallback(() => {
        setSplits(prev => [...prev, {
            id: nextSplitId(),
            accountId: '',
            amount: 0,
            instrumentType: '',
            instrumentNumber: '',
            instrumentBank: '',
            dueDate: '',
            termDays: 0,
            notes: '',
        }])
    }, [])

    // Remove split row
    const removeSplit = useCallback((id: string) => {
        setSplits(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev)
    }, [])

    // Update a split field
    const updateSplit = useCallback((id: string, field: keyof SplitRow, value: any) => {
        setSplits(prev => prev.map(r => {
            if (r.id !== id) return r
            const updated = { ...r, [field]: value }
            // Auto-calc dueDate from termDays
            if (field === 'termDays' && typeof value === 'number' && value > 0 && date) {
                const d = new Date(date + 'T12:00:00')
                d.setDate(d.getDate() + value)
                updated.dueDate = d.toISOString().split('T')[0]
            }
            return updated
        }))
    }, [date])

    // Journal preview lines
    const previewLines = useMemo((): PreviewLine[] => {
        const lines: PreviewLine[] = []
        const isClientes = side === 'clientes'

        for (const split of splits) {
            if (!split.accountId || !split.amount) continue
            const acc = accounts.find(a => a.id === split.accountId)
            if (!acc) continue

            // Check if this is a control account (needs subcuenta) — show parent name + tercero
            const isControl = destControlCodes.includes(acc.code)
            const displayName = isControl ? `${acc.name} / ${terceroName}` : acc.name

            if (isClientes) {
                // Clientes: D destino
                lines.push({
                    accountName: displayName,
                    accountCode: acc.code,
                    debit: split.amount,
                    credit: 0,
                })
            } else {
                // Proveedores: H destino
                lines.push({
                    accountName: displayName,
                    accountCode: acc.code,
                    debit: 0,
                    credit: split.amount,
                })
            }
        }

        // Source line
        if (totalSplits > 0) {
            if (isClientes) {
                // Clientes: H Deudores por Ventas / tercero
                lines.push({
                    accountName: `${sourceLabel.split('(')[0].trim()} / ${terceroName}`,
                    accountCode: sourceLabel.match(/\(([^)]+)\)/)?.[1] || '',
                    debit: 0,
                    credit: totalSplits,
                })
            } else {
                // Proveedores: D Proveedores / tercero
                lines.push({
                    accountName: `${sourceLabel.split('(')[0].trim()} / ${terceroName}`,
                    accountCode: sourceLabel.match(/\(([^)]+)\)/)?.[1] || '',
                    debit: totalSplits,
                    credit: 0,
                })
            }
        }

        return lines
    }, [splits, accounts, side, totalSplits, terceroName, sourceLabel, destControlCodes])

    const totalDebit = useMemo(() => previewLines.reduce((s, l) => s + l.debit, 0), [previewLines])
    const totalCredit = useMemo(() => previewLines.reduce((s, l) => s + l.credit, 0), [previewLines])
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

    // Validate and save
    const handleSave = useCallback(async () => {
        if (totalSplits <= 0) {
            setError('El importe total debe ser mayor a 0')
            return
        }
        const emptyAccounts = splits.some(s => !s.accountId)
        if (emptyAccounts) {
            setError('Todas las filas deben tener cuenta destino')
            return
        }
        const zeroAmounts = splits.some(s => s.amount <= 0)
        if (zeroAmounts) {
            setError('Todos los importes deben ser mayores a 0')
            return
        }
        if (!isBalanced) {
            setError('El asiento no balancea')
            return
        }

        setSaving(true)
        setError(null)

        try {
            await onSave({
                date,
                totalAmount: totalSplits,
                sourceMovementId,
                splits,
                notes,
            })
            onClose()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al perfeccionar')
        } finally {
            setSaving(false)
        }
    }, [totalSplits, splits, isBalanced, date, sourceMovementId, notes, onSave, onClose])

    if (!open) return null

    const ringColor = accentColor === 'emerald' ? 'focus:ring-emerald-500' : 'focus:ring-amber-500'
    const bgAccent = accentColor === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
    const btnBg = accentColor === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
    const title = side === 'clientes' ? 'Perfeccionar Credito' : 'Perfeccionar Pasivo'
    const subtitle = side === 'clientes'
        ? `Deudores por Ventas → Destinos (${terceroName})`
        : `${side === 'proveedores' ? 'Proveedores' : 'Acreedores'} → Destinos (${terceroName})`

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-8">
                {/* HEADER */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                        <div className={`${bgAccent} p-2 rounded-lg`}>
                            <ArrowsLeftRight size={20} weight="duotone" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 font-display">{title}</h2>
                            <p className="text-xs text-slate-500">{subtitle}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
                        <X size={20} />
                    </button>
                </div>

                {/* BODY: two columns on desktop */}
                <div className="flex flex-col lg:flex-row">
                    {/* LEFT: Form */}
                    <div className="flex-1 p-6 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto max-h-[70vh]">
                        {/* Date + Comprobante origen */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={e => {
                                        setDate(e.target.value)
                                        setUserOverrodeDate(true)
                                    }}
                                    className={`w-full text-sm border-slate-300 rounded-lg px-3 py-2 bg-white border focus:ring-1 ${ringColor} outline-none`}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1">Comprobante origen</label>
                                <select
                                    value={sourceMovementId}
                                    onChange={e => handleSourceChange(e.target.value)}
                                    className={`w-full text-sm border-slate-300 rounded-lg px-3 py-2 bg-white border focus:ring-1 ${ringColor} outline-none`}
                                >
                                    <option value="">(Todos / sin comprobante especifico)</option>
                                    {terceroDocs.map(d => (
                                        <option key={d.movementId} value={d.movementId}>
                                            {d.reference} — {fmtDate(d.date)} — Saldo: {fmtCurrency(d.saldoPendiente)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Origen (read-only) */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Origen</label>
                            <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 border border-slate-200">
                                {sourceLabel} — {terceroName}
                            </div>
                        </div>

                        {/* HELPER TEXT */}
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-start gap-2">
                            <Info size={16} weight="fill" className="text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-blue-800 leading-relaxed">
                                <strong>Perfeccionar</strong> es para documentar (cheques, pagares, valores).
                                Si {side === 'clientes' ? 'cobras' : 'pagas'} en Caja/Bancos/QR/Transferencia, usa{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (onGoToPagos) {
                                            onClose()
                                            onGoToPagos({ counterpartyName: terceroName, suggestedAmount: totalSplits || initialAmount || 0 })
                                        }
                                    }}
                                    className="text-blue-600 font-semibold underline hover:text-blue-800"
                                >
                                    Pagos ({side === 'clientes' ? 'Cobrar' : 'Pagar'})
                                </button>.
                            </p>
                        </div>

                        {/* SPLIT ROWS */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-semibold text-slate-700">Destinos</label>
                                <button
                                    type="button"
                                    onClick={addSplit}
                                    className={`text-xs font-semibold px-2 py-1 rounded flex items-center gap-1 ${
                                        accentColor === 'emerald'
                                            ? 'text-emerald-600 hover:bg-emerald-50'
                                            : 'text-amber-600 hover:bg-amber-50'
                                    } transition-colors`}
                                >
                                    <Plus size={12} weight="bold" /> Agregar destino
                                </button>
                            </div>

                            <div className="space-y-3">
                                {splits.map((split, idx) => (
                                    <SplitRowEditor
                                        key={split.id}
                                        split={split}
                                        index={idx}
                                        accounts={accounts}
                                        canRemove={splits.length > 1}
                                        onUpdate={(field, value) => updateSplit(split.id, field, value)}
                                        onRemove={() => removeSplit(split.id)}
                                        showInstrument={needsInstrumentFields(split.accountId)}
                                        ringColor={ringColor}
                                        accentColor={accentColor}
                                        onAmountChange={() => setUserOverrodeAmount(true)}
                                        accountFilter={allowedDestFilter}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Notas (opcional)</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Observaciones..."
                                className={`w-full text-sm border-slate-300 rounded-lg px-3 py-2 bg-white border focus:ring-1 ${ringColor} outline-none`}
                            />
                        </div>

                        {/* NOTA CASO MIXTO */}
                        <div className="text-[10px] text-slate-400 italic leading-relaxed">
                            Si una parte es al contado y otra documentada: registra primero el {side === 'clientes' ? 'cobro' : 'pago'} en Pagos y despues perfecciona el saldo restante.
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
                                <WarningCircle size={16} weight="fill" />
                                {error}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Journal Preview */}
                    <div className="w-full lg:w-[380px] p-6 bg-slate-50/70 flex flex-col">
                        <h3 className="text-sm font-bold text-slate-700 mb-3 font-display">Asiento a generar</h3>

                        {previewLines.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center text-xs text-slate-400 italic">
                                Completa al menos un destino para ver el asiento.
                            </div>
                        ) : (
                            <>
                                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-100 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                                                <th className="px-3 py-2 text-left">Cuenta</th>
                                                <th className="px-3 py-2 text-right">Debe</th>
                                                <th className="px-3 py-2 text-right">Haber</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {previewLines.map((line, i) => (
                                                <tr key={i} className="hover:bg-slate-50">
                                                    <td className="px-3 py-2">
                                                        <div className="text-slate-800 font-medium leading-tight">{line.accountName}</div>
                                                        <div className="text-[10px] text-slate-400 font-mono">{line.accountCode}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                                                        {line.debit > 0 ? fmtCurrency(line.debit) : ''}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                                                        {line.credit > 0 ? fmtCurrency(line.credit) : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t-2 border-slate-300 font-bold text-xs">
                                                <td className="px-3 py-2 text-slate-700">Total</td>
                                                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtCurrency(totalDebit)}</td>
                                                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtCurrency(totalCredit)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                <div className="mt-3 flex justify-center">
                                    {isBalanced ? (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                                            <CheckCircle size={14} weight="fill" /> Balanceado
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
                                            <WarningCircle size={14} weight="fill" /> Diferencia: {fmtCurrency(Math.abs(totalDebit - totalCredit))}
                                        </span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* FOOTER */}
                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 bg-slate-50">
                    {onGoToPagos ? (
                        <button
                            type="button"
                            onClick={() => {
                                onClose()
                                onGoToPagos({ counterpartyName: terceroName, suggestedAmount: totalSplits || initialAmount || 0 })
                            }}
                            className="px-4 py-2 text-sm font-semibold text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <CurrencyCircleDollar size={16} weight="duotone" />
                            Ir a Pagos ({side === 'clientes' ? 'Cobrar' : 'Pagar'})
                        </button>
                    ) : <div />}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !isBalanced}
                            className={`px-5 py-2 text-sm font-semibold ${btnBg} text-white rounded-lg disabled:opacity-50 flex items-center gap-2 shadow-sm`}
                        >
                            <ArrowsLeftRight size={14} weight="bold" />
                            {saving ? 'Guardando...' : 'Perfeccionar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ================================================================
// SPLIT ROW EDITOR
// ================================================================

function SplitRowEditor({
    split,
    index,
    accounts,
    canRemove,
    onUpdate,
    onRemove,
    showInstrument,
    ringColor,
    accentColor,
    onAmountChange,
    accountFilter,
}: {
    split: SplitRow
    index: number
    accounts: Account[]
    canRemove: boolean
    onUpdate: (field: keyof SplitRow, value: any) => void
    onRemove: () => void
    showInstrument: boolean
    ringColor: string
    accentColor: 'emerald' | 'amber'
    onAmountChange: () => void
    accountFilter?: (account: Account) => boolean
}) {
    const borderAccent = accentColor === 'emerald' ? 'border-l-emerald-400' : 'border-l-amber-400'

    return (
        <div className={`bg-white rounded-lg border border-slate-200 border-l-4 ${borderAccent} p-3 space-y-3`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Destino {index + 1}</span>
                {canRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                        title="Eliminar destino"
                    >
                        <Trash size={14} />
                    </button>
                )}
            </div>

            {/* Account + Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Cuenta destino</label>
                    <AccountSearchSelect
                        accounts={accounts}
                        value={split.accountId}
                        onChange={val => onUpdate('accountId', val)}
                        placeholder="Buscar cuenta destino..."
                        filter={accountFilter || (a => !a.isHeader)}
                        inputClassName="h-9 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Importe</label>
                    <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={split.amount || ''}
                        onChange={e => {
                            onUpdate('amount', Number(e.target.value))
                            onAmountChange()
                        }}
                        placeholder="0.00"
                        className={`w-full text-sm border-slate-300 rounded-lg px-3 py-2 bg-white border font-mono text-right focus:ring-1 ${ringColor} outline-none h-9`}
                    />
                </div>
            </div>

            {/* Instrument fields — only shown for Documentos/Valores */}
            {showInstrument && (
                <>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Tipo instrumento</label>
                            <select
                                value={split.instrumentType}
                                onChange={e => onUpdate('instrumentType', e.target.value)}
                                className={`w-full text-sm border-slate-300 rounded-lg px-3 py-1.5 bg-white border focus:ring-1 ${ringColor} outline-none`}
                            >
                                <option value="">Seleccionar...</option>
                                <option value="PAGARE">Pagare</option>
                                <option value="ECHEQ">Echeq</option>
                                <option value="CHEQUE">Cheque diferido</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Numero</label>
                            <input
                                type="text"
                                value={split.instrumentNumber}
                                onChange={e => onUpdate('instrumentNumber', e.target.value)}
                                placeholder="Nro. documento"
                                className={`w-full text-sm border-slate-300 rounded-lg px-3 py-1.5 bg-white border focus:ring-1 ${ringColor} outline-none`}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Dias plazo</label>
                            <input
                                type="number"
                                min={0}
                                value={split.termDays || ''}
                                onChange={e => onUpdate('termDays', parseInt(e.target.value) || 0)}
                                placeholder="0"
                                className={`w-full text-sm border-slate-300 rounded-lg px-3 py-1.5 bg-white border font-mono text-center focus:ring-1 ${ringColor} outline-none`}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Vencimiento</label>
                            <input
                                type="date"
                                value={split.dueDate}
                                onChange={e => onUpdate('dueDate', e.target.value)}
                                className={`w-full text-sm border-slate-300 rounded-lg px-3 py-1.5 bg-white border focus:ring-1 ${ringColor} outline-none`}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-1">Banco</label>
                            <input
                                type="text"
                                value={split.instrumentBank}
                                onChange={e => onUpdate('instrumentBank', e.target.value)}
                                placeholder="Banco emisor"
                                className={`w-full text-sm border-slate-300 rounded-lg px-3 py-1.5 bg-white border focus:ring-1 ${ringColor} outline-none`}
                            />
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
