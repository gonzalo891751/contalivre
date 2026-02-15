/**
 * ComprobanteGastoModal — Registrar comprobante de gasto (no inventariable)
 *
 * Campos: fecha, tercero (o genérico), tipo (FC/NC/ND), letra (A/B/C),
 * nro, condicion, plazo, vencimiento auto, conceptos (multi-line),
 * IVA inteligente por letra, percepciones con % sobre neto,
 * medios de pago (si contado), vista previa del asiento en vivo.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
    X,
    Plus,
    Trash,
    Info,
    PencilSimple,
    ArrowsClockwise,
    CheckCircle,
    Warning,
} from '@phosphor-icons/react'
import type { Account } from '../../../core/models'
import type { TaxLine, TaxLineKind, TaxType } from '../../../core/inventario/types'
import { createExpenseVoucher, computeVoucherTotals } from '../../../storage/ops'
import type { ExpenseConceptLine, DocType, DocLetter } from '../../../storage/ops'
import { ACCOUNT_FALLBACKS } from '../../../storage/bienes'
import AccountSearchSelect from '../../../ui/AccountSearchSelect'
import { generateId } from '../../../storage/db'

interface Props {
    accounts: Account[]
    onClose: () => void
}

const IVA_RATES = [21, 10.5, 27, 0] as const

function addDaysToDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function round2(n: number): number {
    return Math.round(n * 100) / 100
}

export default function ComprobanteGastoModal({ accounts, onClose }: Props) {
    // ── Form state ──
    const [date, setDate] = useState(() => {
        const now = new Date()
        const y = now.getFullYear()
        const m = String(now.getMonth() + 1).padStart(2, '0')
        const d = String(now.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    })
    const [useGenericCounterparty, setUseGenericCounterparty] = useState(false)
    const [counterpartyName, setCounterpartyName] = useState('')
    const [docType, setDocType] = useState<DocType>('FC')
    const [docLetter, setDocLetter] = useState<DocLetter>('A')
    const [docNumber, setDocNumber] = useState('')
    const [paymentCondition, setPaymentCondition] = useState<'CTA_CTE' | 'CONTADO' | 'DOCUMENTADO'>('CTA_CTE')
    const [termDays, setTermDays] = useState(30)
    const [dueDate, setDueDate] = useState('')
    const [dueDateOverride, setDueDateOverride] = useState(false)

    // Concepts (multi-line)
    const [concepts, setConcepts] = useState<Array<{ id: string; accountId: string; description: string; amount: number }>>([
        { id: generateId(), accountId: '', description: '', amount: 0 },
    ])

    // IVA
    const [discriminateVat, setDiscriminateVat] = useState(true)
    const [vatRate, setVatRate] = useState<number>(21)

    // Percepciones (only percepciones in comprobante — retenciones go in pago)
    const [taxes, setTaxes] = useState<TaxLine[]>([])
    const [showTaxPanel, setShowTaxPanel] = useState(false)
    const [newTaxForm, setNewTaxForm] = useState({ taxType: 'IIBB' as TaxType, rate: 0, amount: 0 })

    // Payment splits (only for CONTADO)
    const [splits, setSplits] = useState<Array<{ id: string; accountId: string; amount: number }>>([
        { id: generateId(), accountId: '', amount: 0 },
    ])

    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // ── IVA inteligente por letra ──
    useEffect(() => {
        if (docLetter === 'C') {
            setDiscriminateVat(false)
        } else if (docLetter === 'A') {
            setDiscriminateVat(true)
        }
        // B: mantener estado actual (OFF por defecto pero editable)
    }, [docLetter])

    // ── Vencimiento automático ──
    useEffect(() => {
        if (dueDateOverride || paymentCondition === 'CONTADO') return
        if (date && termDays > 0) {
            setDueDate(addDaysToDate(date, termDays))
        } else {
            setDueDate('')
        }
    }, [date, termDays, dueDateOverride, paymentCondition])

    // Existing terceros from child accounts under Acreedores (2.1.06.01)
    const acreedoresTerceros = useMemo(() => {
        const acreedoresParent = accounts.find(a => a.code === '2.1.06.01')
        if (!acreedoresParent) return []
        return accounts
            .filter(a => a.parentId === acreedoresParent.id && !a.isHeader)
            .map(a => a.name)
            .sort()
    }, [accounts])

    const expenseAccountFilter = useCallback((acc: Account) => !acc.isHeader, [])
    const monetaryAccountFilter = useCallback((acc: Account) => {
        if (acc.isHeader) return false
        return acc.code.startsWith('1.1.01')
    }, [])

    // ── Computed totals ──
    const conceptLines: ExpenseConceptLine[] = concepts
        .filter(c => c.accountId && c.amount > 0)
        .map(c => ({ accountId: c.accountId, description: c.description, amount: c.amount }))

    const totals = useMemo(() => computeVoucherTotals({
        concepts: conceptLines,
        discriminateVat,
        vatRate,
        taxes,
    }), [conceptLines, discriminateVat, vatRate, taxes])

    // ── Concept handlers ──
    const addConcept = () => setConcepts(prev => [...prev, { id: generateId(), accountId: '', description: '', amount: 0 }])
    const removeConcept = (id: string) => setConcepts(prev => prev.filter(c => c.id !== id))
    const updateConcept = (id: string, field: string, value: string | number) => {
        setConcepts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
    }

    // ── Tax (percepcion) handlers ──
    const addTax = () => {
        if (newTaxForm.amount <= 0) return
        setTaxes(prev => [...prev, {
            id: generateId(),
            kind: 'PERCEPCION' as TaxLineKind,
            taxType: newTaxForm.taxType,
            amount: round2(newTaxForm.amount),
            rate: newTaxForm.rate || undefined,
        }])
        setNewTaxForm({ taxType: 'IIBB', rate: 0, amount: 0 })
        setShowTaxPanel(false)
    }
    const removeTax = (id: string) => setTaxes(prev => prev.filter(t => t.id !== id))

    // Auto-calculate percepcion amount when rate changes
    const handleTaxRateChange = (rate: number) => {
        const net = totals.net
        setNewTaxForm(prev => ({
            ...prev,
            rate,
            amount: rate > 0 && net > 0 ? round2(net * rate / 100) : prev.amount,
        }))
    }

    // ── Split handlers ──
    const addSplit = () => setSplits(prev => [...prev, { id: generateId(), accountId: '', amount: 0 }])
    const removeSplit = (id: string) => setSplits(prev => prev.filter(s => s.id !== id))
    const updateSplit = (id: string, field: string, value: string | number) => {
        setSplits(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
    }

    const splitsTotal = splits.reduce((sum, s) => sum + s.amount, 0)

    // ── Validation ──
    const canSave = useMemo(() => {
        if (!date) return false
        if (!useGenericCounterparty && !counterpartyName.trim()) return false
        if (conceptLines.length === 0) return false
        if (totals.total <= 0) return false
        if (paymentCondition === 'CONTADO') {
            const validSplits = splits.filter(s => s.accountId && s.amount > 0)
            if (validSplits.length === 0) return false
            const splitSum = validSplits.reduce((sum, s) => sum + s.amount, 0)
            if (Math.abs(splitSum - totals.total) > 0.01) return false
        }
        return true
    }, [date, useGenericCounterparty, counterpartyName, conceptLines, totals, paymentCondition, splits])

    // ── Live journal preview lines ──
    const previewLines = useMemo(() => {
        const lines: Array<{ account: string; debit: number; credit: number; desc: string }> = []

        for (const c of conceptLines) {
            const acc = accounts.find(a => a.id === c.accountId)
            lines.push({
                account: acc ? `${acc.code} ${acc.name}` : '(seleccionar cuenta)',
                debit: round2(c.amount),
                credit: 0,
                desc: c.description || 'Gasto',
            })
        }

        if (discriminateVat && totals.vat > 0) {
            const ivaCF = ACCOUNT_FALLBACKS.ivaCF
            const ivaAcc = accounts.find(a => a.code === ivaCF.code)
            lines.push({
                account: ivaAcc ? `${ivaAcc.code} ${ivaAcc.name}` : `${ivaCF.code} IVA CF`,
                debit: totals.vat,
                credit: 0,
                desc: `IVA CF ${vatRate}%`,
            })
        }

        for (const tax of taxes) {
            if (tax.amount > 0) {
                lines.push({
                    account: `Percepción ${tax.taxType}`,
                    debit: round2(tax.amount),
                    credit: 0,
                    desc: `Percepción ${tax.taxType} sufrida`,
                })
            }
        }

        if (paymentCondition === 'CONTADO') {
            for (const s of splits) {
                if (s.accountId && s.amount > 0) {
                    const acc = accounts.find(a => a.id === s.accountId)
                    lines.push({
                        account: acc ? `${acc.code} ${acc.name}` : '(medio de pago)',
                        debit: 0,
                        credit: round2(s.amount),
                        desc: 'Pago contado',
                    })
                }
            }
        } else {
            const cpLabel = useGenericCounterparty || !counterpartyName.trim()
                ? '2.1.06.01 Acreedores Varios'
                : `2.1.06.01.xx ${counterpartyName.trim()}`
            lines.push({
                account: cpLabel,
                debit: 0,
                credit: totals.total,
                desc: useGenericCounterparty ? 'Acreedores Varios' : `Acreedor - ${counterpartyName.trim() || '...'}`,
            })
        }

        return lines
    }, [conceptLines, accounts, discriminateVat, totals, vatRate, taxes, paymentCondition, splits, useGenericCounterparty, counterpartyName])

    const previewDebit = previewLines.reduce((sum, l) => sum + l.debit, 0)
    const previewCredit = previewLines.reduce((sum, l) => sum + l.credit, 0)
    const isBalanced = previewLines.length >= 2 && Math.abs(previewDebit - previewCredit) < 0.01
    const isIncomplete = conceptLines.length === 0

    // ── Save ──
    const handleSave = async () => {
        if (!canSave || saving) return
        setSaving(true)
        setError(null)

        try {
            await createExpenseVoucher({
                date,
                counterpartyName: useGenericCounterparty ? '' : counterpartyName.trim(),
                docType,
                docLetter,
                docNumber: docNumber.trim(),
                paymentCondition,
                termDays: paymentCondition !== 'CONTADO' ? termDays : undefined,
                dueDate: paymentCondition !== 'CONTADO' ? (dueDate || undefined) : undefined,
                concepts: conceptLines,
                discriminateVat,
                vatRate,
                taxes,
                paymentSplits: paymentCondition === 'CONTADO'
                    ? splits.filter(s => s.accountId && s.amount > 0).map(s => ({ accountId: s.accountId, amount: s.amount }))
                    : undefined,
            })
            onClose()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al guardar')
        } finally {
            setSaving(false)
        }
    }

    // ================================================================
    // RENDER
    // ================================================================

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 my-auto flex"
                onClick={e => e.stopPropagation()}
            >
                {/* ── LEFT: Form ── */}
                <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                        <div>
                            <h2 className="font-display font-bold text-lg text-slate-900">Nuevo Comprobante de Gasto</h2>
                            <p className="text-xs text-slate-500">{docType} {docLetter} — Gastos no inventariables</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
                        {/* Row 1: Date + Tipo + Letra + Numero */}
                        <div className="grid grid-cols-4 gap-3">
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
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo *</label>
                                <select
                                    value={docType}
                                    onChange={e => setDocType(e.target.value as DocType)}
                                    className="form-input w-full h-10 cursor-pointer"
                                >
                                    <option value="FC">Factura</option>
                                    <option value="NC">Nota de Crédito</option>
                                    <option value="ND">Nota de Débito</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Letra *</label>
                                <select
                                    value={docLetter}
                                    onChange={e => setDocLetter(e.target.value as DocLetter)}
                                    className="form-input w-full h-10 cursor-pointer"
                                >
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Número</label>
                                <input
                                    type="text"
                                    value={docNumber}
                                    onChange={e => setDocNumber(e.target.value)}
                                    placeholder="0001-00000123"
                                    className="form-input w-full h-10"
                                />
                            </div>
                        </div>

                        {/* Row 2: Counterparty */}
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <label className="text-xs font-semibold text-slate-600">
                                    {useGenericCounterparty ? 'Acreedor: Genérico' : 'Tercero (Acreedor) *'}
                                </label>
                                <button
                                    onClick={() => { setUseGenericCounterparty(!useGenericCounterparty); if (!useGenericCounterparty) setCounterpartyName('') }}
                                    className="text-[10px] text-teal-600 font-semibold hover:text-teal-700"
                                >
                                    {useGenericCounterparty ? 'Usar tercero específico' : 'Usar genérico (sin tercero)'}
                                </button>
                            </div>
                            {!useGenericCounterparty && (
                                <div>
                                    <input
                                        type="text"
                                        value={counterpartyName}
                                        onChange={e => setCounterpartyName(e.target.value)}
                                        placeholder="Ej: Empresa de limpieza SA"
                                        className="form-input w-full h-10"
                                        list="acreedores-list"
                                    />
                                    <datalist id="acreedores-list">
                                        {acreedoresTerceros.map(name => (
                                            <option key={name} value={name} />
                                        ))}
                                    </datalist>
                                </div>
                            )}
                            {useGenericCounterparty && (
                                <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                                    <Info size={10} /> Se imputará directamente a Acreedores Varios (2.1.06.01)
                                </p>
                            )}
                        </div>

                        {/* Row 3: Condición + Plazo + Vencimiento */}
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Condición *</label>
                                <select
                                    value={paymentCondition}
                                    onChange={e => setPaymentCondition(e.target.value as 'CTA_CTE' | 'CONTADO' | 'DOCUMENTADO')}
                                    className="form-input w-full h-10 cursor-pointer"
                                >
                                    <option value="CTA_CTE">Cuenta Corriente</option>
                                    <option value="CONTADO">Contado</option>
                                    <option value="DOCUMENTADO">Documentado</option>
                                </select>
                            </div>
                            {paymentCondition !== 'CONTADO' && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Plazo (días)</label>
                                    <input
                                        type="number"
                                        value={termDays}
                                        onChange={e => setTermDays(Number(e.target.value))}
                                        min={0}
                                        className="form-input w-full h-10"
                                    />
                                </div>
                            )}
                            {paymentCondition !== 'CONTADO' && (
                                <div>
                                    <div className="flex items-center gap-1 mb-1">
                                        <label className="text-xs font-semibold text-slate-600">Vencimiento</label>
                                        {dueDateOverride ? (
                                            <button
                                                onClick={() => setDueDateOverride(false)}
                                                className="text-[10px] text-teal-600 hover:text-teal-700 flex items-center gap-0.5"
                                                title="Restaurar cálculo automático"
                                            >
                                                <ArrowsClockwise size={10} /> Auto
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setDueDateOverride(true)}
                                                className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5"
                                                title="Editar vencimiento manualmente"
                                            >
                                                <PencilSimple size={10} />
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        type="date"
                                        value={dueDate}
                                        onChange={e => setDueDate(e.target.value)}
                                        readOnly={!dueDateOverride}
                                        className={`form-input w-full h-10 ${!dueDateOverride ? 'bg-slate-50 text-slate-500' : ''}`}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Concepts */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-semibold text-slate-600">Conceptos *</label>
                                <button onClick={addConcept} className="text-teal-600 text-[10px] font-semibold flex items-center gap-1 hover:text-teal-700">
                                    <Plus size={12} weight="bold" /> Agregar línea
                                </button>
                            </div>
                            <div className="space-y-2">
                                {concepts.map((c) => (
                                    <div key={c.id} className="flex gap-2 items-start">
                                        <div className="flex-1 min-w-0">
                                            <AccountSearchSelect
                                                accounts={accounts}
                                                value={c.accountId}
                                                onChange={v => updateConcept(c.id, 'accountId', v)}
                                                placeholder="Cuenta de gasto..."
                                                filter={expenseAccountFilter}
                                                inputClassName="h-9 text-xs"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={c.description}
                                            onChange={e => updateConcept(c.id, 'description', e.target.value)}
                                            placeholder="Descripción"
                                            className="form-input w-32 h-9 text-xs"
                                        />
                                        <input
                                            type="number"
                                            value={c.amount || ''}
                                            onChange={e => updateConcept(c.id, 'amount', Number(e.target.value))}
                                            placeholder="Neto"
                                            className="form-input w-28 h-9 text-xs text-right font-mono"
                                            min={0}
                                            step={0.01}
                                        />
                                        {concepts.length > 1 && (
                                            <button onClick={() => removeConcept(c.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 mt-0.5">
                                                <Trash size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* IVA */}
                        <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-semibold text-slate-600">Discriminar IVA</label>
                                    <input
                                        type="checkbox"
                                        checked={discriminateVat}
                                        onChange={e => setDiscriminateVat(e.target.checked)}
                                        disabled={docLetter === 'C'}
                                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:opacity-50"
                                    />
                                </div>
                                {discriminateVat && docLetter !== 'C' && (
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-slate-500">Alícuota:</label>
                                        <select
                                            value={vatRate}
                                            onChange={e => setVatRate(Number(e.target.value))}
                                            className="form-input h-8 text-xs w-20 cursor-pointer"
                                        >
                                            {IVA_RATES.map(r => (
                                                <option key={r} value={r}>{r}%</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                            {docLetter === 'C' && (
                                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                    <Warning size={12} /> Comprobante C: no se discrimina IVA. El importe se registra como gasto total.
                                </p>
                            )}
                            {docLetter === 'B' && discriminateVat && (
                                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                    <Warning size={12} /> Comprobante B con IVA discriminado. Solo si el comprobante efectivamente discrimina IVA.
                                </p>
                            )}
                            {!discriminateVat && docLetter !== 'C' && (
                                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Info size={12} /> El IVA se incluye como parte del gasto (no se genera IVA CF).
                                </p>
                            )}
                        </div>

                        {/* Percepciones */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-semibold text-slate-600">Percepciones / Otros impuestos</label>
                                <button onClick={() => setShowTaxPanel(!showTaxPanel)} className="text-teal-600 text-[10px] font-semibold flex items-center gap-1 hover:text-teal-700">
                                    <Plus size={12} weight="bold" /> Agregar
                                </button>
                            </div>
                            {taxes.length > 0 && (
                                <div className="space-y-1 mb-2">
                                    {taxes.map(t => (
                                        <div key={t.id} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded text-xs">
                                            <span className="font-medium text-slate-700">
                                                Percepción {t.taxType}
                                                {t.rate ? ` (${t.rate}%)` : ''}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono tabular-nums">${t.amount.toFixed(2)}</span>
                                                <button onClick={() => removeTax(t.id)} className="text-slate-400 hover:text-red-500">
                                                    <Trash size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {showTaxPanel && (
                                <div className="bg-blue-50 rounded-lg p-3 flex items-end gap-3 border border-blue-100">
                                    <div>
                                        <label className="text-[10px] font-medium text-slate-500">Impuesto</label>
                                        <select
                                            value={newTaxForm.taxType}
                                            onChange={e => setNewTaxForm(prev => ({ ...prev, taxType: e.target.value as TaxType }))}
                                            className="form-input h-8 text-xs w-full cursor-pointer"
                                        >
                                            <option value="IIBB">IIBB</option>
                                            <option value="IVA">IVA</option>
                                            <option value="GANANCIAS">Ganancias</option>
                                            <option value="SUSS">SUSS</option>
                                            <option value="OTRO">Otro</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-medium text-slate-500">% s/Neto</label>
                                        <input
                                            type="number"
                                            value={newTaxForm.rate || ''}
                                            onChange={e => handleTaxRateChange(Number(e.target.value))}
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
                                            value={newTaxForm.amount || ''}
                                            onChange={e => setNewTaxForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                            className="form-input h-8 text-xs w-24 font-mono text-right"
                                            min={0}
                                            step={0.01}
                                        />
                                    </div>
                                    <button onClick={addTax} className="btn-primary px-3 h-8 text-xs font-semibold rounded">
                                        Agregar
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Payment Splits (CONTADO only) */}
                        {paymentCondition === 'CONTADO' && (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-semibold text-slate-600">Medios de Pago *</label>
                                    <button onClick={addSplit} className="text-teal-600 text-[10px] font-semibold flex items-center gap-1 hover:text-teal-700">
                                        <Plus size={12} weight="bold" /> Agregar medio
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
                                {Math.abs(splitsTotal - totals.total) > 0.01 && totals.total > 0 && (
                                    <p className="text-[10px] text-red-500 mt-1">
                                        Diferencia: ${(totals.total - splitsTotal).toFixed(2)} (medios deben sumar {totals.total.toFixed(2)})
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Totals Summary */}
                        <div className="bg-slate-900 text-white rounded-xl p-4">
                            <div className="grid grid-cols-4 gap-4 text-center">
                                <div>
                                    <div className="text-[10px] uppercase text-slate-400 font-bold">Neto</div>
                                    <div className="font-mono text-lg font-bold tabular-nums">${totals.net.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase text-slate-400 font-bold">IVA</div>
                                    <div className="font-mono text-lg font-bold tabular-nums">${totals.vat.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase text-slate-400 font-bold">Perc.</div>
                                    <div className="font-mono text-lg font-bold tabular-nums">${totals.taxes.toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-[10px] uppercase text-teal-400 font-bold">Total</div>
                                    <div className="font-mono text-2xl font-bold text-teal-400 tabular-nums">${totals.total.toFixed(2)}</div>
                                </div>
                            </div>
                        </div>

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
                            {saving ? 'Guardando...' : 'Registrar Comprobante'}
                        </button>
                    </div>
                </div>

                {/* ── RIGHT: Journal Preview ── */}
                <div className="w-72 border-l border-slate-200 bg-slate-50/50 flex flex-col rounded-r-2xl">
                    <div className="px-4 py-4 border-b border-slate-200">
                        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide">Vista previa del asiento</h3>
                        <div className="mt-1">
                            {isIncomplete ? (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Info size={10} /> Datos incompletos
                                </span>
                            ) : isBalanced ? (
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
                                    <span>{line.desc}</span>
                                    <span className="font-mono tabular-nums font-medium">
                                        {line.debit > 0 ? `D $${line.debit.toFixed(2)}` : `H $${line.credit.toFixed(2)}`}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {previewLines.length === 0 && (
                            <p className="text-[10px] text-slate-400 text-center py-4">Agregá conceptos para ver el asiento.</p>
                        )}
                    </div>
                    <div className="px-4 py-3 border-t border-slate-200 text-[11px]">
                        <div className="flex justify-between font-semibold">
                            <span className="text-blue-600">Debe: ${previewDebit.toFixed(2)}</span>
                            <span className="text-orange-600">Haber: ${previewCredit.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    )
}
