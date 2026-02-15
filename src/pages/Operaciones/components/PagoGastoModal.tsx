/**
 * PagoGastoModal — Registrar pago vinculado a un comprobante de gasto
 *
 * 1:1 model: each payment applies to exactly one voucher.
 * Features:
 *   - Toggle "Practicar retenciones (agente)" (OFF by default)
 *   - Proportional IVA base for partial payments
 *   - Live journal preview
 */

import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
    X,
    Plus,
    Trash,
    Info,
    CheckCircle,
    Warning,
} from '@phosphor-icons/react'
import type { Account } from '../../../core/models'
import type { TaxLine, TaxLineKind, TaxType } from '../../../core/inventario/types'
import { createExpensePayment } from '../../../storage/ops'
import { ACCOUNT_FALLBACKS } from '../../../storage/bienes'
import AccountSearchSelect from '../../../ui/AccountSearchSelect'
import { generateId } from '../../../storage/db'

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

export interface VoucherIvaInfo {
    discriminateVat: boolean
    vatRate: number
    voucherVat: number
    voucherTotal: number
    docLetter?: string
}

interface Props {
    accounts: Account[]
    voucherId: string
    counterpartyName: string
    maxAmount: number
    voucherIvaInfo?: VoucherIvaInfo
    onClose: () => void
}

export default function PagoGastoModal({ accounts, voucherId, counterpartyName, maxAmount, voucherIvaInfo, onClose }: Props) {
    const [date, setDate] = useState(() => {
        const now = new Date()
        const y = now.getFullYear()
        const m = String(now.getMonth() + 1).padStart(2, '0')
        const d = String(now.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    })
    const [amount, setAmount] = useState(maxAmount)

    // Payment splits
    const [splits, setSplits] = useState<Array<{ id: string; accountId: string; amount: number }>>([
        { id: generateId(), accountId: '', amount: maxAmount },
    ])

    // Retentions
    const [enableRetentions, setEnableRetentions] = useState(false)
    const [retentions, setRetentions] = useState<TaxLine[]>([])
    const [showRetPanel, setShowRetPanel] = useState(false)
    const [newRetForm, setNewRetForm] = useState({ taxType: 'IVA' as TaxType, rate: 0, amount: 0 })

    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Can this voucher have retentions? Only if IVA was discriminated and letter != C
    const canHaveRetentions = voucherIvaInfo
        ? voucherIvaInfo.discriminateVat && voucherIvaInfo.docLetter !== 'C'
        : true // fallback: allow if no info (legacy vouchers)

    // Proportional IVA base for partial payments
    const proportionalIvaBase = useMemo(() => {
        if (!voucherIvaInfo || !voucherIvaInfo.discriminateVat || voucherIvaInfo.voucherTotal <= 0) return 0
        return round2(voucherIvaInfo.voucherVat * (amount / voucherIvaInfo.voucherTotal))
    }, [voucherIvaInfo, amount])

    // Filter: monetary accounts for payment
    const monetaryAccountFilter = useCallback((acc: Account) => {
        if (acc.isHeader) return false
        return acc.code.startsWith('1.1.01')
    }, [])

    // Computed
    const retentionsTotal = retentions.reduce((sum, t) => sum + t.amount, 0)
    const splitsTotal = splits.reduce((sum, s) => sum + s.amount, 0)
    const expectedSplitsTotal = Math.max(0, amount - retentionsTotal)

    // Validation
    const canSave = useMemo(() => {
        if (!date) return false
        if (amount <= 0) return false
        if (amount > maxAmount + 0.01) return false
        const validSplits = splits.filter(s => s.accountId && s.amount > 0)
        if (validSplits.length === 0) return false
        if (Math.abs(splitsTotal + retentionsTotal - amount) > 0.01) return false
        return true
    }, [date, amount, maxAmount, splits, splitsTotal, retentionsTotal])

    // Handlers
    const addSplit = () => setSplits(prev => [...prev, { id: generateId(), accountId: '', amount: 0 }])
    const removeSplit = (id: string) => setSplits(prev => prev.filter(s => s.id !== id))
    const updateSplit = (id: string, field: string, value: string | number) => {
        setSplits(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    }

    const addRetention = () => {
        if (newRetForm.amount <= 0) return
        setRetentions(prev => [...prev, {
            id: generateId(),
            kind: 'RETENCION' as TaxLineKind,
            taxType: newRetForm.taxType,
            amount: round2(newRetForm.amount),
            rate: newRetForm.rate || undefined,
        }])
        setNewRetForm({ taxType: 'IVA', rate: 0, amount: 0 })
        setShowRetPanel(false)
    }
    const removeRetention = (id: string) => setRetentions(prev => prev.filter(r => r.id !== id))

    // Auto-calculate retention amount when rate changes
    const handleRetRateChange = (rate: number) => {
        setNewRetForm(prev => ({
            ...prev,
            rate,
            amount: rate > 0 && proportionalIvaBase > 0 ? round2(proportionalIvaBase * rate / 100) : prev.amount,
        }))
    }

    // Recalculate split amount when amount or retentions change
    const handleAmountChange = (newAmount: number) => {
        setAmount(newAmount)
        if (splits.length === 1) {
            const newSplitAmount = Math.max(0, newAmount - retentionsTotal)
            setSplits(prev => [{ ...prev[0], amount: newSplitAmount }])
        }
    }

    // ── Live journal preview lines ──
    const previewLines = useMemo(() => {
        const lines: Array<{ account: string; debit: number; credit: number; desc: string }> = []

        const cpLabel = counterpartyName
            ? `2.1.06.01.xx ${counterpartyName}`
            : '2.1.06.01 Acreedores Varios'
        lines.push({
            account: cpLabel,
            debit: round2(amount),
            credit: 0,
            desc: counterpartyName ? `Pago a ${counterpartyName}` : 'Pago Acreedores Varios',
        })

        for (const s of splits) {
            if (s.accountId && s.amount > 0) {
                const acc = accounts.find(a => a.id === s.accountId)
                lines.push({
                    account: acc ? `${acc.code} ${acc.name}` : '(medio de pago)',
                    debit: 0,
                    credit: round2(s.amount),
                    desc: 'Pago efectivo/banco',
                })
            }
        }

        for (const ret of retentions) {
            if (ret.amount > 0) {
                const retCode = ACCOUNT_FALLBACKS.retencionPracticada
                lines.push({
                    account: `${retCode.code} Retenciones a depositar`,
                    debit: 0,
                    credit: round2(ret.amount),
                    desc: `Retención ${ret.taxType}`,
                })
            }
        }

        return lines
    }, [amount, counterpartyName, splits, accounts, retentions])

    const previewDebit = previewLines.reduce((sum, l) => sum + l.debit, 0)
    const previewCredit = previewLines.reduce((sum, l) => sum + l.credit, 0)
    const isBalanced = previewLines.length >= 2 && Math.abs(previewDebit - previewCredit) < 0.01

    const handleSave = async () => {
        if (!canSave || saving) return
        setSaving(true)
        setError(null)

        try {
            await createExpensePayment({
                date,
                counterpartyName,
                voucherId,
                amount,
                paymentSplits: splits
                    .filter(s => s.accountId && s.amount > 0)
                    .map(s => ({ accountId: s.accountId, amount: s.amount })),
                retentions,
            })
            onClose()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al guardar pago')
        } finally {
            setSaving(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex"
                onClick={e => e.stopPropagation()}
            >
                {/* ── LEFT: Form ── */}
                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                        <div>
                            <h2 className="font-display font-bold text-lg text-slate-900">Registrar Pago</h2>
                            <p className="text-xs text-slate-500">A: {counterpartyName || 'Genérico'} &middot; Pendiente: ${maxAmount.toFixed(2)}</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
                        {/* Date + Amount */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha *</label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="form-input w-full h-10"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Importe a Pagar *</label>
                                <input
                                    type="number"
                                    value={amount || ''}
                                    onChange={e => handleAmountChange(Number(e.target.value))}
                                    className="form-input w-full h-10 font-mono text-right"
                                    min={0}
                                    max={maxAmount}
                                    step={0.01}
                                />
                                {amount > maxAmount + 0.01 && (
                                    <p className="text-[10px] text-red-500 mt-0.5">El importe supera el saldo pendiente.</p>
                                )}
                            </div>
                        </div>

                        {/* Payment Splits */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-semibold text-slate-600">Medios de Pago *</label>
                                <button onClick={addSplit} className="text-teal-600 text-[10px] font-semibold flex items-center gap-1 hover:text-teal-700">
                                    <Plus size={12} weight="bold" /> Agregar
                                </button>
                            </div>
                            <div className="space-y-2">
                                {splits.map(s => (
                                    <div key={s.id} className="flex gap-2 items-start">
                                        <div className="flex-1">
                                            <AccountSearchSelect
                                                accounts={accounts}
                                                value={s.accountId}
                                                onChange={v => updateSplit(s.id, 'accountId', v)}
                                                placeholder="Caja / Banco..."
                                                filter={monetaryAccountFilter}
                                                inputClassName="h-9 text-xs"
                                            />
                                        </div>
                                        <input
                                            type="number"
                                            value={s.amount || ''}
                                            onChange={e => updateSplit(s.id, 'amount', Number(e.target.value))}
                                            placeholder="Importe"
                                            className="form-input w-28 h-9 text-xs text-right font-mono"
                                            min={0}
                                            step={0.01}
                                        />
                                        {splits.length > 1 && (
                                            <button onClick={() => removeSplit(s.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 mt-0.5">
                                                <Trash size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Retentions */}
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <label className="text-xs font-semibold text-slate-600">Retenciones (a depositar)</label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={enableRetentions}
                                        onChange={e => {
                                            setEnableRetentions(e.target.checked)
                                            if (!e.target.checked) { setRetentions([]); setShowRetPanel(false) }
                                        }}
                                        disabled={!canHaveRetentions}
                                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:opacity-50"
                                    />
                                    <span className="text-[10px] text-slate-500">Practicar retenciones (agente)</span>
                                </label>
                            </div>

                            {!canHaveRetentions && (
                                <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-2">
                                    <Info size={10} /> No disponible: el comprobante no discrimina IVA o es letra C.
                                </p>
                            )}

                            {enableRetentions && canHaveRetentions && (
                                <>
                                    {proportionalIvaBase > 0 && (
                                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-2">
                                            <Info size={10} /> Base IVA proporcional: ${proportionalIvaBase.toFixed(2)}
                                            {voucherIvaInfo && amount < voucherIvaInfo.voucherTotal - 0.01 && (
                                                <span className="text-slate-400"> (pago parcial: {round2(amount / voucherIvaInfo.voucherTotal * 100)}% del total)</span>
                                            )}
                                        </p>
                                    )}

                                    {retentions.length > 0 && (
                                        <div className="space-y-1 mb-2">
                                            {retentions.map(r => (
                                                <div key={r.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-xs">
                                                    <span className="font-medium text-slate-700">
                                                        Retención {r.taxType}
                                                        {r.rate ? ` (${r.rate}%)` : ''}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono tabular-nums">${r.amount.toFixed(2)}</span>
                                                        <button onClick={() => removeRetention(r.id)} className="text-slate-400 hover:text-red-500">
                                                            <Trash size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex justify-end mb-2">
                                        <button onClick={() => setShowRetPanel(!showRetPanel)} className="text-teal-600 text-[10px] font-semibold flex items-center gap-1 hover:text-teal-700">
                                            <Plus size={12} weight="bold" /> Agregar retención
                                        </button>
                                    </div>

                                    {showRetPanel && (
                                        <div className="bg-blue-50 rounded-lg p-3 flex items-end gap-3 border border-blue-100">
                                            <div>
                                                <label className="text-[10px] font-medium text-slate-500">Impuesto</label>
                                                <select
                                                    value={newRetForm.taxType}
                                                    onChange={e => setNewRetForm(prev => ({ ...prev, taxType: e.target.value as TaxType }))}
                                                    className="form-input h-8 text-xs w-full cursor-pointer"
                                                >
                                                    <option value="IVA">IVA</option>
                                                    <option value="GANANCIAS">Ganancias</option>
                                                    <option value="IIBB">IIBB</option>
                                                    <option value="SUSS">SUSS</option>
                                                    <option value="OTRO">Otro</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium text-slate-500">% s/IVA</label>
                                                <input
                                                    type="number"
                                                    value={newRetForm.rate || ''}
                                                    onChange={e => handleRetRateChange(Number(e.target.value))}
                                                    className="form-input h-8 text-xs w-16 font-mono text-right"
                                                    min={0}
                                                    step={0.01}
                                                    placeholder="%"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium text-slate-500">Importe</label>
                                                <input
                                                    type="number"
                                                    value={newRetForm.amount || ''}
                                                    onChange={e => setNewRetForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                                    className="form-input h-8 text-xs w-24 font-mono text-right"
                                                    min={0}
                                                    step={0.01}
                                                />
                                            </div>
                                            <button onClick={addRetention} className="btn-primary px-3 h-8 text-xs font-semibold rounded">
                                                Agregar
                                            </button>
                                        </div>
                                    )}

                                    {retentionsTotal > 0 && (
                                        <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                            <Info size={10} /> Efectivo a pagar: ${expectedSplitsTotal.toFixed(2)} (total - retenciones)
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Validation feedback */}
                        {Math.abs(splitsTotal + retentionsTotal - amount) > 0.01 && amount > 0 && (
                            <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-xs">
                                Medios ({splitsTotal.toFixed(2)}) + Retenciones ({retentionsTotal.toFixed(2)}) = {(splitsTotal + retentionsTotal).toFixed(2)} — debe ser igual al importe ({amount.toFixed(2)}).
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-bl-2xl">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canSave || saving}
                            className="btn-primary px-6 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Guardando...' : `Registrar Pago ($${amount.toFixed(2)})`}
                        </button>
                    </div>
                </div>

                {/* ── RIGHT: Journal Preview ── */}
                <div className="w-64 border-l border-slate-200 bg-slate-50/50 flex flex-col rounded-r-2xl">
                    <div className="px-4 py-4 border-b border-slate-200">
                        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Vista previa</h3>
                        <div className="mt-1">
                            {isBalanced ? (
                                <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-semibold">
                                    <CheckCircle size={10} weight="fill" /> Balanceado
                                </span>
                            ) : (
                                <span className="text-[10px] text-amber-600 flex items-center gap-1 font-semibold">
                                    <Warning size={10} weight="fill" /> Falta imputar
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                        {previewLines.map((line, i) => (
                            <div key={i} className={`text-[11px] px-2 py-1.5 rounded ${line.debit > 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                                <div className="font-medium text-slate-700 truncate" title={line.account}>{line.account}</div>
                                <div className="flex justify-between text-slate-500">
                                    <span className="truncate">{line.desc}</span>
                                    <span className="font-mono tabular-nums font-medium ml-1">
                                        {line.debit > 0 ? `D $${line.debit.toFixed(2)}` : `H $${line.credit.toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="px-4 py-3 border-t border-slate-200 text-[11px]">
                        <div className="flex justify-between font-semibold">
                            <span className="text-blue-600">D: ${previewDebit.toFixed(2)}</span>
                            <span className="text-orange-600">H: ${previewCredit.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )
}
