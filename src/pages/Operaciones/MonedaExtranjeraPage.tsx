/**
 * Moneda Extranjera Page
 *
 * Main foreign currency management page with dashboard, assets, liabilities,
 * movements, and reconciliation tabs.
 * Follows the prototype at docs/prototypes/ME.HTML
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ArrowLeft,
    Gear,
    Plus,
    PencilSimple,
    Trash,
    ArrowsLeftRight,
    TrendUp,
    TrendDown,
    Scales,
    ChartLineUp,
    Link as LinkIcon,
    Warning,
    X,
    CheckCircle,
    MagnifyingGlass,
    Funnel,
} from '@phosphor-icons/react'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import { db } from '../../storage/db'
import {
    loadFxSettings,
    saveFxSettings,
    getAllFxAccounts,
    createFxAccount,
    updateFxAccount,
    deleteFxAccount,
    getAllFxMovements,
    createFxMovement,
    updateFxMovementWithJournal,
    generateJournalForFxMovement,
    deleteFxMovementWithJournal,
    reconcileFxJournalLinks,
    previewFxMovementJournal,
} from '../../storage'
import type { FxJournalPreview } from '../../storage'
import {
    getExchangeRates,
    getQuote,
    getRateValue,
} from '../../services/exchangeRates'
import type {
    FxSettings,
    FxAccount,
    FxMovement,
    ExchangeRate,
    QuoteType,
    ValuationMode,
    FxAccountMappingKey,
    FxMovementType,
    CurrencyCode,
    FxAssetSubtype,
    FxLiabilitySubtype,
    RateSide,
} from '../../core/monedaExtranjera/types'
import {
    QUOTE_TYPE_LABELS,
    MOVEMENT_TYPE_LABELS,
    CURRENCY_LABELS,
    ASSET_SUBTYPE_LABELS,
    LIABILITY_SUBTYPE_LABELS,
} from '../../core/monedaExtranjera/types'
import type { Account } from '../../core/models'

type TabId = 'dashboard' | 'activos' | 'pasivos' | 'movimientos' | 'conciliacion'

const TABS: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'activos', label: 'Activos' },
    { id: 'pasivos', label: 'Pasivos' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'conciliacion', label: 'Conciliación' },
]

// ========================================
// Helper Components
// ========================================

function formatCurrency(value: number, currency: 'ARS' | 'USD' = 'ARS'): string {
    if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
    }
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
}

function formatRate(value: number): string {
    return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function JournalStatusBadge({ status, onClick }: { status: FxMovement['journalStatus']; onClick?: () => void }) {
    const config: Record<string, { label: string; className: string }> = {
        generated: { label: 'Generado', className: 'bg-green-50 text-emerald-600 border-green-100' },
        linked: { label: 'Vinculado', className: 'bg-blue-50 text-blue-600 border-blue-100' },
        none: { label: 'Sin asiento', className: 'bg-slate-100 text-slate-500 border-slate-200' },
        missing: { label: 'Falta asiento', className: 'bg-amber-50 text-amber-600 border-amber-100' },
        desync: { label: 'Desync', className: 'bg-red-50 text-red-500 border-red-100' },
        error: { label: 'Error', className: 'bg-red-50 text-red-500 border-red-100' },
    }
    const { label, className } = config[status] || config.none

    return (
        <span
            onClick={onClick}
            className={`text-[10px] font-bold px-2 py-1 rounded border uppercase tracking-wide ${className} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        >
            {label}
        </span>
    )
}

// ========================================
// Modals
// ========================================

interface AccountModalProps {
    open: boolean
    onClose: () => void
    onSave: (account: Omit<FxAccount, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
    editing?: FxAccount | null
    type: 'ASSET' | 'LIABILITY'
    periodId: string
    rates: ExchangeRate[]
}

function AccountModal({ open, onClose, onSave, editing, type, periodId, rates }: AccountModalProps) {
    const [name, setName] = useState('')
    const [subtype, setSubtype] = useState<FxAssetSubtype | FxLiabilitySubtype>(type === 'ASSET' ? 'CAJA' : 'PROVEEDOR')
    const [currency, setCurrency] = useState<CurrencyCode>('USD')
    const [openingBalance, setOpeningBalance] = useState(0)
    const [openingRate, setOpeningRate] = useState(0)
    const [openingDate, setOpeningDate] = useState(new Date().toISOString().split('T')[0])
    const [creditor, setCreditor] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (editing) {
            setName(editing.name)
            setSubtype(editing.subtype)
            setCurrency(editing.currency)
            setOpeningBalance(editing.openingBalance)
            setOpeningRate(editing.openingRate)
            setOpeningDate(editing.openingDate)
            setCreditor(editing.creditor || '')
            setNotes(editing.notes || '')
        } else {
            setName('')
            setSubtype(type === 'ASSET' ? 'CAJA' : 'PROVEEDOR')
            setCurrency('USD')
            setOpeningBalance(0)
            const oficialRate = getQuote(rates, 'Oficial')
            setOpeningRate(oficialRate ? oficialRate.compra : 0)
            setOpeningDate(new Date().toISOString().split('T')[0])
            setCreditor('')
            setNotes('')
        }
    }, [editing, type, rates])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            await onSave({
                name,
                type,
                subtype,
                currency,
                periodId,
                openingBalance,
                openingRate,
                openingDate,
                creditor: type === 'LIABILITY' ? creditor : undefined,
                notes: notes || undefined,
            })
            onClose()
        } catch (error) {
            console.error('Error saving account:', error)
        } finally {
            setSaving(false)
        }
    }

    if (!open) return null

    const subtypeOptions = type === 'ASSET' ? ASSET_SUBTYPE_LABELS : LIABILITY_SUBTYPE_LABELS

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-lg font-bold font-display text-slate-900">
                        {editing ? 'Editar' : 'Nuevo'} {type === 'ASSET' ? 'Activo' : 'Pasivo'} ME
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500">
                        <X size={20} weight="bold" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre / Cartera</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                placeholder={type === 'ASSET' ? 'Ej: Caja Fuerte USD' : 'Ej: Deuda AWS'}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
                            <select
                                value={subtype}
                                onChange={e => setSubtype(e.target.value as any)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                {Object.entries(subtypeOptions).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Moneda</label>
                            <select
                                value={currency}
                                onChange={e => setCurrency(e.target.value as CurrencyCode)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                {Object.entries(CURRENCY_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {type === 'LIABILITY' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Acreedor</label>
                            <input
                                type="text"
                                value={creditor}
                                onChange={e => setCreditor(e.target.value)}
                                placeholder="Nombre del acreedor"
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Saldo Inicial</label>
                            <input
                                type="number"
                                step="0.01"
                                value={openingBalance}
                                onChange={e => setOpeningBalance(parseFloat(e.target.value) || 0)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">TC Historico</label>
                            <input
                                type="number"
                                step="0.01"
                                value={openingRate}
                                onChange={e => setOpeningRate(parseFloat(e.target.value) || 0)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={openingDate}
                                onChange={e => setOpeningDate(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Notas (opcional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none resize-none"
                        />
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !name}
                            className="px-6 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-emerald-500 rounded-lg shadow disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

interface MovementModalProps {
    open: boolean
    onClose: () => void
    onSave: (movement: Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => Promise<void>
    editing?: FxMovement | null
    accounts: FxAccount[]
    ledgerAccounts: Account[] // All ledger accounts for contrapartida selection
    periodId: string
    rates: ExchangeRate[]
    settings: FxSettings
}

function MovementModal({ open, onClose, onSave, editing, accounts, ledgerAccounts, periodId, rates, settings: _settings }: MovementModalProps) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [type, setType] = useState<FxMovementType>('COMPRA')
    const [accountId, setAccountId] = useState('')
    const [targetAccountId, setTargetAccountId] = useState('')
    const [amount, setAmount] = useState(0)
    const [currency, setCurrency] = useState<CurrencyCode>('USD')
    const [rate, setRate] = useState(0)
    const [rateType, setRateType] = useState<QuoteType | 'custom'>('Oficial')
    const [counterparty, setCounterparty] = useState('')
    const [reference, setReference] = useState('')
    const [notes, setNotes] = useState('')
    const [autoJournal, setAutoJournal] = useState(true)
    const [capitalAmount, setCapitalAmount] = useState(0)
    const [interestAmount, setInterestAmount] = useState(0)
    // New fields for contrapartida and comision
    const [contrapartidaAccountId, setContrapartidaAccountId] = useState('')
    const [comisionARS, setComisionARS] = useState(0)
    const [comisionAccountId, setComisionAccountId] = useState('')
    const [saving, setSaving] = useState(false)
    // Preview state
    const [preview, setPreview] = useState<FxJournalPreview | null>(null)
    const [loadingPreview, setLoadingPreview] = useState(false)

    const arsAmount = useMemo(() => amount * rate, [amount, rate])

    // Determine rateSide based on movement type
    const rateSide = useMemo((): RateSide => {
        switch (type) {
            case 'COMPRA':
            case 'PAGO_DEUDA':
                return 'venta' // You buy FC, they sell to you
            case 'VENTA':
                return 'compra' // You sell FC, they buy from you
            default:
                return 'compra'
        }
    }, [type])

    // Filter ledger accounts for selectors
    const arsAccounts = useMemo(() =>
        ledgerAccounts.filter(a =>
            a.kind === 'ASSET' && // Assets only for contrapartida
            !a.name.toLowerCase().includes('me') &&
            !a.name.toLowerCase().includes('usd') &&
            !a.name.toLowerCase().includes('dolar') &&
            !a.name.toLowerCase().includes('extranjera')
        ),
        [ledgerAccounts]
    )
    const expenseAccounts = useMemo(() =>
        ledgerAccounts.filter(a => a.kind === 'EXPENSE'), // Gastos
        [ledgerAccounts]
    )

    useEffect(() => {
        if (editing) {
            setDate(editing.date)
            setType(editing.type)
            setAccountId(editing.accountId)
            setTargetAccountId(editing.targetAccountId || '')
            setAmount(editing.amount)
            setCurrency(editing.currency)
            setRate(editing.rate)
            setRateType(editing.rateType)
            setCounterparty(editing.counterparty || '')
            setReference(editing.reference || '')
            setNotes(editing.notes || '')
            setAutoJournal(editing.autoJournal)
            setCapitalAmount(editing.capitalAmount || 0)
            setInterestAmount(editing.interestAmount || 0)
            setContrapartidaAccountId(editing.contrapartidaAccountId || '')
            setComisionARS(editing.comisionARS || 0)
            setComisionAccountId(editing.comisionAccountId || '')
        } else {
            setDate(new Date().toISOString().split('T')[0])
            setType('COMPRA')
            setAccountId(accounts.find(a => a.type === 'ASSET')?.id || '')
            setTargetAccountId('')
            setAmount(0)
            setCurrency('USD')
            const oficialRate = getQuote(rates, 'Oficial')
            setRate(oficialRate ? oficialRate.venta : 0) // Default to venta for COMPRA
            setRateType('Oficial')
            setCounterparty('')
            setReference('')
            setNotes('')
            setAutoJournal(true)
            setCapitalAmount(0)
            setInterestAmount(0)
            // Set default contrapartida (first Banco ARS or Caja ARS)
            const defaultContra = arsAccounts.find(a => a.name.toLowerCase().includes('banco'))
                || arsAccounts.find(a => a.name.toLowerCase().includes('caja'))
                || arsAccounts[0]
            setContrapartidaAccountId(defaultContra?.id || '')
            setComisionARS(0)
            // Set default comision account
            const defaultComision = expenseAccounts.find(a => a.name.toLowerCase().includes('comision'))
                || expenseAccounts.find(a => a.name.toLowerCase().includes('bancar'))
                || expenseAccounts[0]
            setComisionAccountId(defaultComision?.id || '')
        }
    }, [editing, accounts, rates, arsAccounts, expenseAccounts])

    // Update rate when rateType or type changes
    useEffect(() => {
        if (rateType !== 'custom') {
            const quote = getQuote(rates, rateType as QuoteType)
            if (quote) {
                const side = (type === 'COMPRA' || type === 'PAGO_DEUDA') ? 'venta' : 'compra'
                setRate(getRateValue(quote, side))
            }
        }
    }, [rateType, rates, type])

    // Load preview when autoJournal is ON and data changes
    useEffect(() => {
        if (!autoJournal || !accountId || amount <= 0 || rate <= 0) {
            setPreview(null)
            return
        }

        const loadPreview = async () => {
            setLoadingPreview(true)
            try {
                const fxAccount = accounts.find(a => a.id === accountId)
                const result = await previewFxMovementJournal({
                    date,
                    type,
                    accountId,
                    targetAccountId: type === 'TRANSFERENCIA' ? targetAccountId : undefined,
                    periodId,
                    amount,
                    currency,
                    rate,
                    rateType,
                    rateSide,
                    rateSource: rateType === 'custom' ? 'Manual' : 'DolarAPI',
                    arsAmount,
                    contrapartidaAccountId: contrapartidaAccountId || undefined,
                    comisionARS: comisionARS > 0 ? comisionARS : undefined,
                    comisionAccountId: comisionARS > 0 ? comisionAccountId : undefined,
                    capitalAmount: type === 'PAGO_DEUDA' ? capitalAmount : undefined,
                    interestAmount: type === 'PAGO_DEUDA' ? interestAmount : undefined,
                    autoJournal: true,
                }, fxAccount)
                setPreview(result)
            } catch (error) {
                console.error('Error loading preview:', error)
                setPreview(null)
            } finally {
                setLoadingPreview(false)
            }
        }

        const timeout = setTimeout(loadPreview, 300) // Debounce
        return () => clearTimeout(timeout)
    }, [autoJournal, accountId, amount, rate, type, currency, arsAmount, contrapartidaAccountId, comisionARS, comisionAccountId, targetAccountId, periodId, rateType, rateSide, capitalAmount, interestAmount, accounts])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Validate preview if autoJournal is ON
        if (autoJournal && preview?.error) {
            alert(`Error en el asiento: ${preview.error}`)
            return
        }

        setSaving(true)
        try {
            await onSave({
                date,
                type,
                accountId,
                targetAccountId: type === 'TRANSFERENCIA' ? targetAccountId : undefined,
                periodId,
                amount,
                currency,
                rate,
                rateType,
                rateSide,
                rateSource: rateType === 'custom' ? 'Manual' : 'DolarAPI',
                arsAmount,
                contrapartidaAccountId: contrapartidaAccountId || undefined,
                comisionARS: comisionARS > 0 ? comisionARS : undefined,
                comisionAccountId: comisionARS > 0 ? comisionAccountId : undefined,
                capitalAmount: type === 'PAGO_DEUDA' ? capitalAmount : undefined,
                interestAmount: type === 'PAGO_DEUDA' ? interestAmount : undefined,
                counterparty: counterparty || undefined,
                reference: reference || undefined,
                notes: notes || undefined,
                autoJournal,
            })
            onClose()
        } catch (error) {
            console.error('Error saving movement:', error)
            alert(error instanceof Error ? error.message : 'Error al guardar')
        } finally {
            setSaving(false)
        }
    }

    if (!open) return null

    const assetAccounts = accounts.filter(a => a.type === 'ASSET')
    const liabilityAccounts = accounts.filter(a => a.type === 'LIABILITY')
    const showTargetAccount = type === 'TRANSFERENCIA'
    const showDebtFields = type === 'PAGO_DEUDA'
    const showContrapartida = type === 'COMPRA' || type === 'VENTA' || type === 'PAGO_DEUDA'

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-lg font-bold font-display text-slate-900">
                        {editing ? 'Editar Movimiento' : 'Registrar Movimiento'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500">
                        <X size={20} weight="bold" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Type selector */}
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                        {(['COMPRA', 'VENTA', 'TRANSFERENCIA', 'AJUSTE'] as FxMovementType[]).map(t => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setType(t)}
                                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded ${type === t ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {MOVEMENT_TYPE_LABELS[t]}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Fecha</label>
                            <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                required
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Cuenta ME</label>
                            <select
                                value={accountId}
                                onChange={e => setAccountId(e.target.value)}
                                required
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                <option value="">Seleccionar...</option>
                                {assetAccounts.length > 0 && (
                                    <optgroup label="Activos">
                                        {assetAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                                {liabilityAccounts.length > 0 && (
                                    <optgroup label="Pasivos">
                                        {liabilityAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>

                    {showTargetAccount && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Cuenta Destino</label>
                            <select
                                value={targetAccountId}
                                onChange={e => setTargetAccountId(e.target.value)}
                                required
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                <option value="">Seleccionar...</option>
                                {accounts.filter(a => a.id !== accountId).map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Monto ME</label>
                            <input
                                type="number"
                                step="0.01"
                                value={amount || ''}
                                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                                required
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Moneda</label>
                            <select
                                value={currency}
                                onChange={e => setCurrency(e.target.value as CurrencyCode)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                {Object.entries(CURRENCY_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                Cotización <span className="text-[10px] text-slate-400">({rateSide === 'venta' ? 'VENTA' : 'COMPRA'})</span>
                            </label>
                            <select
                                value={rateType}
                                onChange={e => setRateType(e.target.value as QuoteType | 'custom')}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                {Object.entries(QUOTE_TYPE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                                <option value="custom">Manual</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">TC (ARS/{currency})</label>
                            <input
                                type="number"
                                step="0.01"
                                value={rate || ''}
                                onChange={e => setRate(parseFloat(e.target.value) || 0)}
                                disabled={rateType !== 'custom'}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono disabled:bg-slate-50"
                            />
                        </div>
                        <div className="bg-blue-50 rounded-lg p-3 flex flex-col justify-center">
                            <span className="text-[10px] uppercase font-bold text-blue-600 mb-0.5">Total Bruto ARS</span>
                            <span className="font-mono font-bold text-blue-900">{formatCurrency(arsAmount)}</span>
                        </div>
                    </div>

                    {/* Contrapartida selector for buy/sell operations */}
                    {showContrapartida && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                Contrapartida ARS <span className="text-[10px] text-slate-400">(Banco/Caja origen/destino)</span>
                            </label>
                            <select
                                value={contrapartidaAccountId}
                                onChange={e => setContrapartidaAccountId(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            >
                                <option value="">Sin especificar (usará default)</option>
                                {arsAccounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Comision fields */}
                    {showContrapartida && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Comisión ARS</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={comisionARS || ''}
                                    onChange={e => setComisionARS(parseFloat(e.target.value) || 0)}
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Cuenta Comisión</label>
                                <select
                                    value={comisionAccountId}
                                    onChange={e => setComisionAccountId(e.target.value)}
                                    disabled={comisionARS <= 0}
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none disabled:bg-slate-50"
                                >
                                    <option value="">Gastos bancarios (default)</option>
                                    {expenseAccounts.map(a => (
                                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {showDebtFields && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Capital ({currency})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={capitalAmount || ''}
                                    onChange={e => setCapitalAmount(parseFloat(e.target.value) || 0)}
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Intereses ARS</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={interestAmount || ''}
                                    onChange={e => setInterestAmount(parseFloat(e.target.value) || 0)}
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none font-mono"
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Contraparte</label>
                            <input
                                type="text"
                                value={counterparty}
                                onChange={e => setCounterparty(e.target.value)}
                                placeholder="Ej: Casa de cambio"
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Referencia</label>
                            <input
                                type="text"
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder="Ej: Ticket #123"
                                className="w-full text-sm border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Auto journal toggle with preview */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <div className="flex items-center justify-between mb-3">
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={autoJournal}
                                        onChange={e => setAutoJournal(e.target.checked)}
                                        className="sr-only"
                                    />
                                    <div className={`w-10 h-6 rounded-full shadow-inner transition-colors ${autoJournal ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${autoJournal ? 'translate-x-4' : ''}`} />
                                </div>
                                <span className="ml-3 text-sm font-medium text-slate-700">Generar asiento contable</span>
                            </label>
                            {autoJournal && (
                                <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                                    PREVIEW
                                </span>
                            )}
                        </div>

                        {/* Preview panel */}
                        {autoJournal && (
                            <div className="border-t border-slate-200 pt-3 mt-3">
                                {loadingPreview ? (
                                    <div className="text-xs text-slate-400 text-center py-2">Calculando...</div>
                                ) : preview?.error ? (
                                    <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                                        <Warning size={14} className="inline mr-1" />
                                        {preview.error}
                                    </div>
                                ) : preview?.lines && preview.lines.length > 0 ? (
                                    <>
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-slate-400">
                                                    <th className="text-left font-normal pb-2">Cuenta</th>
                                                    <th className="text-right font-normal pb-2">Debe</th>
                                                    <th className="text-right font-normal pb-2">Haber</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-mono text-slate-600">
                                                {preview.lines.map((line, i) => (
                                                    <tr key={i} className="border-t border-slate-100">
                                                        <td className="py-1">
                                                            <span className="text-slate-400">{line.accountCode}</span>{' '}
                                                            <span className="text-slate-700">{line.accountName}</span>
                                                        </td>
                                                        <td className="text-right py-1">
                                                            {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                                        </td>
                                                        <td className="text-right py-1">
                                                            {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="border-t border-slate-300 font-bold">
                                                <tr>
                                                    <td className="pt-2">TOTALES</td>
                                                    <td className="text-right pt-2">{formatCurrency(preview.totalDebit)}</td>
                                                    <td className="text-right pt-2">{formatCurrency(preview.totalCredit)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>

                                        {/* Show result for sales */}
                                        {type === 'VENTA' && preview.resultadoARS !== undefined && (
                                            <div className={`mt-2 p-2 rounded text-xs ${preview.resultadoARS >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                <span className="font-bold">
                                                    {preview.resultadoARS >= 0 ? 'Ganancia' : 'Pérdida'} por diferencia de cambio:
                                                </span>{' '}
                                                {formatCurrency(Math.abs(preview.resultadoARS))}
                                                <div className="text-[10px] mt-1 opacity-70">
                                                    Costo FIFO: {formatCurrency(preview.costoARS || 0)} | Producido: {formatCurrency(arsAmount - comisionARS)}
                                                </div>
                                            </div>
                                        )}

                                        {!preview.isBalanced && (
                                            <div className="mt-2 text-xs text-red-600">
                                                <Warning size={14} className="inline mr-1" />
                                                El asiento no balancea
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-xs text-slate-400 text-center py-2">
                                        Completa los campos para ver el asiento
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !accountId || amount <= 0 || (autoJournal && !!preview?.error)}
                            className="px-6 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-emerald-500 rounded-lg shadow disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

interface SettingsModalProps {
    open: boolean
    onClose: () => void
    settings: FxSettings
    onSave: (settings: FxSettings) => Promise<void>
    accounts: Account[]
}

function SettingsModal({ open, onClose, settings, onSave, accounts }: SettingsModalProps) {
    const [mappings, setMappings] = useState<Partial<Record<FxAccountMappingKey, string>>>({})
    const [assetRule, setAssetRule] = useState<'compra' | 'venta'>('compra')
    const [liabilityRule, setLiabilityRule] = useState<'compra' | 'venta'>('venta')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setMappings(settings.accountMappings || {})
        setAssetRule(settings.assetRateRule)
        setLiabilityRule(settings.liabilityRateRule)
    }, [settings])

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSave({
                ...settings,
                accountMappings: mappings,
                assetRateRule: assetRule,
                liabilityRateRule: liabilityRule,
            })
            onClose()
        } finally {
            setSaving(false)
        }
    }

    if (!open) return null

    const mappingFields: { key: FxAccountMappingKey; label: string }[] = [
        { key: 'cajaME', label: 'Caja Moneda Extranjera (USD)' },
        { key: 'bancoME', label: 'Banco Moneda Extranjera (USD)' },
        { key: 'pasivoME', label: 'Pasivo ME (Dólares/USD)' },
        { key: 'diferenciaCambio', label: 'Diferencias de Cambio' },
        { key: 'interesesGanados', label: 'Intereses Ganados ME' },
        { key: 'interesesPerdidos', label: 'Intereses Perdidos ME' },
        { key: 'cajaARS', label: 'Contrapartida Caja ARS' },
        { key: 'bancoARS', label: 'Contrapartida Banco ARS' },
        { key: 'comisionesBancarias', label: 'Gastos y Comisiones' },
    ]

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="text-lg font-bold font-display text-slate-900">Configuracion ME</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500">
                        <X size={20} weight="bold" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Cuentas por Defecto</label>
                        <div className="space-y-2">
                            {mappingFields.map(field => (
                                <select
                                    key={field.key}
                                    value={mappings[field.key] || ''}
                                    onChange={e => setMappings(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50"
                                >
                                    <option value="">{field.label} (auto-detectar)</option>
                                    {accounts.filter(a => !a.isHeader).map(a => (
                                        <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                                    ))}
                                </select>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reglas de Valuacion</label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm text-slate-700 p-2 border border-slate-200 rounded-lg">
                                <span>Activos usan TC</span>
                                <div className="flex bg-slate-100 rounded p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setAssetRule('compra')}
                                        className={`px-2 py-0.5 text-xs font-bold rounded ${assetRule === 'compra' ? 'bg-white shadow' : 'text-slate-500'}`}
                                    >
                                        Compra
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAssetRule('venta')}
                                        className={`px-2 py-0.5 text-xs font-bold rounded ${assetRule === 'venta' ? 'bg-white shadow' : 'text-slate-500'}`}
                                    >
                                        Venta
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-sm text-slate-700 p-2 border border-slate-200 rounded-lg">
                                <span>Pasivos usan TC</span>
                                <div className="flex bg-slate-100 rounded p-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setLiabilityRule('compra')}
                                        className={`px-2 py-0.5 text-xs font-bold rounded ${liabilityRule === 'compra' ? 'bg-white shadow' : 'text-slate-500'}`}
                                    >
                                        Compra
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLiabilityRule('venta')}
                                        className={`px-2 py-0.5 text-xs font-bold rounded ${liabilityRule === 'venta' ? 'bg-white shadow' : 'text-slate-500'}`}
                                    >
                                        Venta
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
                    >
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ========================================
// Main Page Component
// ========================================

export default function MonedaExtranjeraPage() {
    const navigate = useNavigate()
    const { year: periodYear } = usePeriodYear()
    const periodId = String(periodYear)

    // State
    const [activeTab, setActiveTab] = useState<TabId>('dashboard')
    const [settings, setSettings] = useState<FxSettings | null>(null)
    const [fxAccounts, setFxAccounts] = useState<FxAccount[]>([])
    const [movements, setMovements] = useState<FxMovement[]>([])
    const [rates, setRates] = useState<ExchangeRate[]>([])
    const [ratesError, setRatesError] = useState<string | null>(null)
    const [ratesLoading, setRatesLoading] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [valuationMode, setValuationMode] = useState<ValuationMode>('contable')
    const [gestionQuoteType, setGestionQuoteType] = useState<QuoteType>('Blue')

    // Modal state
    const [accountModalOpen, setAccountModalOpen] = useState(false)
    const [accountModalType, setAccountModalType] = useState<'ASSET' | 'LIABILITY'>('ASSET')
    const [editingAccount, setEditingAccount] = useState<FxAccount | null>(null)
    const [movementModalOpen, setMovementModalOpen] = useState(false)
    const [editingMovement, setEditingMovement] = useState<FxMovement | null>(null)
    const [settingsModalOpen, setSettingsModalOpen] = useState(false)

    // Toast
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray(), [])
    const journalEntries = useLiveQuery(() => db.entries.orderBy('date').reverse().toArray(), [])

    const showToast = useCallback((message: string, type: 'success' | 'error') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }, [])

    // Load data
    const loadData = useCallback(async () => {
        try {
            setIsLoading(true)
            await reconcileFxJournalLinks(periodId)
            const [loadedSettings, loadedAccounts, loadedMovements] = await Promise.all([
                loadFxSettings(),
                getAllFxAccounts(periodId),
                getAllFxMovements(periodId),
            ])
            setSettings(loadedSettings)
            setFxAccounts(loadedAccounts)
            setMovements(loadedMovements)
            setValuationMode(loadedSettings.defaultValuationMode)
            setGestionQuoteType(loadedSettings.gestionQuoteType)
        } catch (error) {
            console.error('Error loading FX data:', error)
            showToast('Error al cargar datos', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [periodId, showToast])

    const loadRates = useCallback(async (forceRefresh = false) => {
        setRatesLoading(true)
        try {
            const result = await getExchangeRates(forceRefresh)
            setRates(result.rates)
            setRatesError(result.error || null)
        } catch (error) {
            setRatesError('Error al cargar cotizaciones')
        } finally {
            setRatesLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
        loadRates()
    }, [loadData, loadRates])

    // Computed values
    const assetAccounts = useMemo(() => fxAccounts.filter(a => a.type === 'ASSET'), [fxAccounts])
    const liabilityAccounts = useMemo(() => fxAccounts.filter(a => a.type === 'LIABILITY'), [fxAccounts])

    const currentRate = useMemo(() => {
        const quoteType = valuationMode === 'contable' ? 'Oficial' : gestionQuoteType
        return getQuote(rates, quoteType)
    }, [rates, valuationMode, gestionQuoteType])

    // Calculate account balances and valuations
    const accountValuations = useMemo(() => {
        if (!settings || !currentRate) return []

        return fxAccounts.map(account => {
            // Calculate balance from movements
            let balance = account.openingBalance
            let totalArsHistorical = account.openingBalance * account.openingRate

            const accountMovements = movements.filter(m => m.accountId === account.id)
            for (const m of accountMovements) {
                const sign = account.type === 'ASSET'
                    ? (['COMPRA', 'INGRESO'].includes(m.type) ? 1 : -1)
                    : (m.type === 'PAGO_DEUDA' ? -1 : 1)
                balance += sign * m.amount
                totalArsHistorical += sign * m.arsAmount
            }

            // Handle incoming transfers
            const incomingTransfers = movements.filter(m => m.type === 'TRANSFERENCIA' && m.targetAccountId === account.id)
            for (const m of incomingTransfers) {
                balance += m.amount
                totalArsHistorical += m.arsAmount
            }

            const rateHistorical = balance > 0 ? totalArsHistorical / balance : account.openingRate
            const arsHistorical = balance * rateHistorical

            const rateRule = account.type === 'LIABILITY' ? settings.liabilityRateRule : settings.assetRateRule
            const rateCurrent = getRateValue(currentRate, rateRule)
            const arsCurrent = balance * rateCurrent

            const differenceArs = account.type === 'ASSET'
                ? arsCurrent - arsHistorical
                : arsHistorical - arsCurrent // For liabilities, positive diff means debt increased

            return {
                account,
                balance,
                rateHistorical,
                arsHistorical,
                rateCurrent,
                arsCurrent,
                differenceArs,
            }
        })
    }, [fxAccounts, movements, settings, currentRate])

    // KPIs
    const kpis = useMemo(() => {
        const assetValuations = accountValuations.filter(v => v.account.type === 'ASSET')
        const liabilityValuations = accountValuations.filter(v => v.account.type === 'LIABILITY')

        const oficialRate = getQuote(rates, 'Oficial')
        const oficialCompra = oficialRate?.compra || 1
        const oficialVenta = oficialRate?.venta || 1

        const totalAssetsUSD = assetValuations.reduce((sum, v) => sum + v.balance, 0)
        const totalLiabilitiesUSD = liabilityValuations.reduce((sum, v) => sum + v.balance, 0)

        const totalAssetsArsOficial = totalAssetsUSD * oficialCompra
        const totalLiabilitiesArsOficial = totalLiabilitiesUSD * oficialVenta

        const totalAssetsArsHistorical = assetValuations.reduce((sum, v) => sum + v.arsHistorical, 0)
        const totalAssetsArsCurrent = assetValuations.reduce((sum, v) => sum + v.arsCurrent, 0)

        return {
            totalAssetsUSD,
            totalLiabilitiesUSD,
            netPositionUSD: totalAssetsUSD - totalLiabilitiesUSD,
            totalAssetsArsOficial,
            totalLiabilitiesArsOficial,
            netPositionArsOficial: totalAssetsArsOficial - totalLiabilitiesArsOficial,
            latentDifferenceArs: totalAssetsArsCurrent - totalAssetsArsHistorical,
            totalAssetsArsHistorical,
            totalAssetsArsCurrent,
        }
    }, [accountValuations, rates])

    // Reconciliation data
    const reconciliationData = useMemo(() => {
        const movementsWithoutEntry = movements.filter(m => m.journalStatus === 'none' || m.journalStatus === 'missing')
        const fxEntries = (journalEntries || []).filter(e => e.sourceModule === 'fx')
        const linkedMovementIds = new Set(movements.flatMap(m => m.linkedJournalEntryIds || []))
        const entriesWithoutMovement = fxEntries.filter(e => !linkedMovementIds.has(e.id))

        return {
            movementsWithoutEntry,
            entriesWithoutMovement,
            totalPending: movementsWithoutEntry.length + entriesWithoutMovement.length,
        }
    }, [movements, journalEntries])

    // Handlers
    const handleSaveAccount = async (accountData: Omit<FxAccount, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (editingAccount) {
            await updateFxAccount(editingAccount.id, accountData)
            showToast('Cuenta actualizada', 'success')
        } else {
            await createFxAccount(accountData)
            showToast('Cuenta creada', 'success')
        }
        await loadData()
        setEditingAccount(null)
    }

    const handleDeleteAccount = async (id: string) => {
        if (!confirm('Eliminar esta cuenta?')) return
        const result = await deleteFxAccount(id)
        if (result.success) {
            showToast('Cuenta eliminada', 'success')
            await loadData()
        } else {
            showToast(result.error || 'Error al eliminar', 'error')
        }
    }

    const handleSaveMovement = async (movementData: Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>) => {
        if (editingMovement) {
            await updateFxMovementWithJournal(editingMovement.id, movementData)
            showToast('Movimiento actualizado', 'success')
        } else {
            await createFxMovement(movementData)
            showToast(movementData.autoJournal ? 'Movimiento y asiento creados' : 'Movimiento registrado', 'success')
        }
        await loadData()
        setEditingMovement(null)
    }

    const handleGenerateJournal = async (movementId: string) => {
        try {
            await generateJournalForFxMovement(movementId)
            showToast('Asiento generado', 'success')
            await loadData()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al generar asiento', 'error')
        }
    }

    const handleDeleteMovement = async (id: string) => {
        if (!confirm('Eliminar este movimiento?')) return
        const result = await deleteFxMovementWithJournal(id, { keepManualEntries: true })
        if (result.success) {
            showToast('Movimiento eliminado', 'success')
            await loadData()
        } else {
            showToast(result.error || 'Error al eliminar', 'error')
        }
    }

    const handleSaveSettings = async (newSettings: FxSettings) => {
        await saveFxSettings(newSettings)
        setSettings(newSettings)
        showToast('Configuracion guardada', 'success')
    }

    const openAccountModal = (type: 'ASSET' | 'LIABILITY', account?: FxAccount) => {
        setAccountModalType(type)
        setEditingAccount(account || null)
        setAccountModalOpen(true)
    }

    const openMovementModal = (movement?: FxMovement) => {
        setEditingMovement(movement || null)
        setMovementModalOpen(true)
    }

    if (isLoading || !settings) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-slate-400">Cargando...</div>
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/operaciones')}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-display font-bold text-slate-900">Moneda Extranjera</h1>
                </div>
                <button
                    onClick={() => setSettingsModalOpen(true)}
                    className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-slate-50"
                >
                    <Gear size={24} />
                </button>
            </header>

            {/* Ticker Bar */}
            <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-6 flex-shrink-0">
                <div className="flex items-center gap-6 overflow-x-auto flex-1">
                    {rates.map(rate => (
                        <div key={rate.type} className="flex flex-col min-w-[100px] border-r border-slate-200 pr-6 last:border-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{rate.type}</span>
                                <span className="text-[10px] text-slate-400 bg-slate-50 px-1 rounded">{rate.source}</span>
                            </div>
                            <div className="flex gap-3 font-mono text-xs">
                                <div><span className="text-slate-400">C:</span> <span className="text-slate-600 font-medium">${formatRate(rate.compra)}</span></div>
                                <div><span className="text-slate-400">V:</span> <span className="text-blue-600 font-bold">${formatRate(rate.venta)}</span></div>
                            </div>
                        </div>
                    ))}
                    {rates.length === 0 && !ratesLoading && (
                        <div className="text-sm text-slate-400">{ratesError || 'Sin cotizaciones disponibles'}</div>
                    )}
                    {ratesLoading && (
                        <div className="text-sm text-slate-400">Cargando cotizaciones...</div>
                    )}
                    {ratesError && rates.length > 0 && (
                        <div className="text-xs text-amber-600 flex items-center gap-1">
                            <Warning size={12} /> {ratesError}
                        </div>
                    )}
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center gap-4 border-l border-slate-200 pl-6 flex-shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Modo de Valuacion</span>
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                            <button
                                onClick={() => setValuationMode('contable')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${valuationMode === 'contable' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Contable
                            </button>
                            <button
                                onClick={() => setValuationMode('gestion')}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${valuationMode === 'gestion' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Gestion
                            </button>
                        </div>
                    </div>

                    {valuationMode === 'gestion' && (
                        <div className="flex flex-col items-start w-32">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Cotizacion Ref.</span>
                            <select
                                value={gestionQuoteType}
                                onChange={e => setGestionQuoteType(e.target.value as QuoteType)}
                                className="w-full text-xs font-medium bg-white border border-slate-200 rounded-md py-1 px-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                            >
                                {Object.entries(QUOTE_TYPE_LABELS).filter(([k]) => k !== 'Oficial').map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-slate-200 px-6 pt-2 flex-shrink-0">
                <nav className="flex gap-6">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 border-b-2 font-medium transition-colors flex items-center gap-2 ${activeTab === tab.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab.label}
                            {tab.id === 'conciliacion' && reconciliationData.totalPending > 0 && (
                                <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {reconciliationData.totalPending}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Activos ME</span>
                                    <div className="p-1.5 bg-green-50 rounded-lg text-emerald-500"><TrendUp weight="fill" /></div>
                                </div>
                                <div className="text-2xl font-mono font-bold text-slate-900">
                                    {formatCurrency(kpis.totalAssetsUSD, 'USD')}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    ARS oficial: {formatCurrency(kpis.totalAssetsArsOficial)}
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pasivos ME</span>
                                    <div className="p-1.5 bg-red-50 rounded-lg text-red-500"><TrendDown weight="fill" /></div>
                                </div>
                                <div className="text-2xl font-mono font-bold text-slate-900">
                                    {formatCurrency(kpis.totalLiabilitiesUSD, 'USD')}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    ARS oficial: {formatCurrency(kpis.totalLiabilitiesArsOficial)}
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm border-l-4 border-l-blue-500">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Posicion Neta</span>
                                    <div className="p-1.5 bg-blue-50 rounded-lg text-blue-500"><Scales weight="fill" /></div>
                                </div>
                                <div className="text-2xl font-mono font-bold text-blue-600">
                                    {formatCurrency(kpis.netPositionUSD, 'USD')}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                    ARS oficial: {formatCurrency(kpis.netPositionArsOficial)}
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Diferencia Latente</span>
                                    <div className="p-1.5 bg-slate-50 rounded-lg text-slate-400"><ChartLineUp weight="fill" /></div>
                                </div>
                                <div className={`text-2xl font-mono font-bold ${kpis.latentDifferenceArs >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {kpis.latentDifferenceArs >= 0 ? '+' : ''}{formatCurrency(kpis.latentDifferenceArs)}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">Resultado por tenencia (ARS)</div>
                            </div>
                        </div>

                        {/* Chart & Quick Actions */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold text-slate-900 mb-6">Valuacion en Pesos (Historico vs Actual)</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-medium text-slate-600">Valor Historico (Al ingreso)</span>
                                            <span className="font-mono">{formatCurrency(kpis.totalAssetsArsHistorical)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-3">
                                            <div
                                                className="bg-slate-400 h-3 rounded-full transition-all"
                                                style={{ width: `${Math.min(100, (kpis.totalAssetsArsHistorical / Math.max(kpis.totalAssetsArsCurrent, kpis.totalAssetsArsHistorical, 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-medium text-blue-600">Valor Actual (Mercado)</span>
                                            <span className="font-mono text-blue-600">{formatCurrency(kpis.totalAssetsArsCurrent)}</span>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-3">
                                            <div
                                                className="bg-gradient-to-r from-blue-500 to-emerald-500 h-3 rounded-full transition-all"
                                                style={{ width: `${Math.min(100, (kpis.totalAssetsArsCurrent / Math.max(kpis.totalAssetsArsCurrent, kpis.totalAssetsArsHistorical, 1)) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center gap-3">
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Acciones Rapidas</h3>
                                <button
                                    onClick={() => openAccountModal('ASSET')}
                                    className="w-full py-3 px-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus weight="bold" /> Agregar Activo
                                </button>
                                <button
                                    onClick={() => openAccountModal('LIABILITY')}
                                    className="w-full py-3 px-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                                >
                                    <Plus weight="bold" /> Agregar Pasivo
                                </button>
                                <button
                                    onClick={() => openMovementModal()}
                                    className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-medium shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                                >
                                    <ArrowsLeftRight weight="bold" /> Registrar Movimiento
                                </button>
                            </div>
                        </div>

                        {/* Empty state */}
                        {fxAccounts.length === 0 && (
                            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                                <div className="text-slate-400 mb-4">
                                    <Scales size={48} className="mx-auto" />
                                </div>
                                <h3 className="text-lg font-semibold text-slate-700 mb-2">Comenza a gestionar tus divisas</h3>
                                <p className="text-sm text-slate-500 mb-4">Crea tu primera cuenta en moneda extranjera para empezar a trackear tus activos y pasivos.</p>
                                <button
                                    onClick={() => openAccountModal('ASSET')}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                                >
                                    Crear Primera Cuenta
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Activos Tab */}
                {activeTab === 'activos' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900">Cartera de Activos</h2>
                            <button
                                onClick={() => openAccountModal('ASSET')}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 text-white text-sm font-bold shadow"
                            >
                                <Plus weight="bold" /> Nuevo Activo
                            </button>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="p-4 font-semibold">Cartera</th>
                                        <th className="p-4 font-semibold">Moneda</th>
                                        <th className="p-4 font-semibold text-right">Saldo ME</th>
                                        <th className="p-4 font-semibold text-right">TC Hist.</th>
                                        <th className="p-4 font-semibold text-right">Valor Hist. (ARS)</th>
                                        <th className="p-4 font-semibold text-right">TC Actual</th>
                                        <th className="p-4 font-semibold text-right">Valor Actual (ARS)</th>
                                        <th className="p-4 font-semibold text-right">Dif. ARS</th>
                                        <th className="p-4 font-semibold text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accountValuations.filter(v => v.account.type === 'ASSET').map(v => (
                                        <tr key={v.account.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-medium text-slate-700">{v.account.name}</td>
                                            <td className="p-4">
                                                <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2 py-1 rounded border border-blue-100">
                                                    {v.account.currency}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-900 font-bold">
                                                {v.account.currency} {v.balance.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-500 text-xs">{formatRate(v.rateHistorical)}</td>
                                            <td className="p-4 text-right font-mono text-slate-500 text-xs font-medium bg-slate-50/50">
                                                {formatCurrency(v.arsHistorical)}
                                            </td>
                                            <td className="p-4 text-right font-mono text-blue-600 font-medium text-xs">{formatRate(v.rateCurrent)}</td>
                                            <td className="p-4 text-right font-mono text-slate-900">{formatCurrency(v.arsCurrent)}</td>
                                            <td className={`p-4 text-right font-mono text-xs font-bold ${v.differenceArs >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {v.differenceArs >= 0 ? '+' : ''}{formatCurrency(v.differenceArs)}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => openAccountModal('ASSET', v.account)}
                                                    className="text-slate-400 hover:text-blue-600 transition-colors mr-2"
                                                >
                                                    <PencilSimple weight="bold" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAccount(v.account.id)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash weight="bold" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {assetAccounts.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-slate-400">
                                                No hay activos registrados. Crea uno para comenzar.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Pasivos Tab */}
                {activeTab === 'pasivos' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900">Deudas en M.E.</h2>
                            <button
                                onClick={() => openAccountModal('LIABILITY')}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 text-white text-sm font-bold shadow"
                            >
                                <Plus weight="bold" /> Nuevo Pasivo
                            </button>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="p-4 font-semibold">Acreedor / Concepto</th>
                                        <th className="p-4 font-semibold">Moneda</th>
                                        <th className="p-4 font-semibold text-right">Saldo ME</th>
                                        <th className="p-4 font-semibold text-right">TC Hist.</th>
                                        <th className="p-4 font-semibold text-right">Valor Hist. (ARS)</th>
                                        <th className="p-4 font-semibold text-right">TC Actual</th>
                                        <th className="p-4 font-semibold text-right">Valor Actual (ARS)</th>
                                        <th className="p-4 font-semibold text-right">Dif. ARS</th>
                                        <th className="p-4 font-semibold text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accountValuations.filter(v => v.account.type === 'LIABILITY').map(v => (
                                        <tr key={v.account.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-medium text-slate-700">{v.account.creditor || v.account.name}</td>
                                            <td className="p-4">
                                                <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2 py-1 rounded">
                                                    {v.account.currency}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-900 font-bold">
                                                {v.account.currency} {v.balance.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right font-mono text-slate-500 text-xs">{formatRate(v.rateHistorical)}</td>
                                            <td className="p-4 text-right font-mono text-slate-500 text-xs font-medium bg-slate-50/50">
                                                {formatCurrency(v.arsHistorical)}
                                            </td>
                                            <td className="p-4 text-right font-mono text-blue-600 font-medium text-xs">{formatRate(v.rateCurrent)}</td>
                                            <td className="p-4 text-right font-mono text-slate-900">{formatCurrency(v.arsCurrent)}</td>
                                            <td className={`p-4 text-right font-mono text-xs font-bold ${v.differenceArs <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {/* For liabilities, positive difference = bad (debt increased), negative = good (debt decreased) */}
                                                {v.differenceArs > 0 ? '+' : ''}{formatCurrency(v.differenceArs)}
                                            </td>
                                            <td className="p-4 text-center">
                                                <button
                                                    onClick={() => openAccountModal('LIABILITY', v.account)}
                                                    className="text-slate-400 hover:text-blue-600 transition-colors mr-2"
                                                >
                                                    <PencilSimple weight="bold" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteAccount(v.account.id)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash weight="bold" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {liabilityAccounts.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-slate-400">
                                                No hay pasivos registrados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Movimientos Tab */}
                {activeTab === 'movimientos' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex gap-2">
                                <div className="relative">
                                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Buscar movimiento..."
                                        className="bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-blue-500 outline-none w-64"
                                    />
                                </div>
                                <button className="bg-white border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50">
                                    <Funnel size={16} />
                                </button>
                            </div>
                            <button
                                onClick={() => openMovementModal()}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-emerald-500 text-white text-sm font-bold shadow"
                            >
                                <ArrowsLeftRight weight="bold" /> Registrar
                            </button>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider">
                                        <th className="p-4 font-semibold">Fecha</th>
                                        <th className="p-4 font-semibold">Tipo</th>
                                        <th className="p-4 font-semibold">Detalle</th>
                                        <th className="p-4 font-semibold text-right">Monto ME</th>
                                        <th className="p-4 font-semibold text-right">TC Op.</th>
                                        <th className="p-4 font-semibold text-right">Total ARS</th>
                                        <th className="p-4 font-semibold text-center">Estado Asiento</th>
                                        <th className="p-4 font-semibold text-center"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movements.map(m => {
                                        const account = fxAccounts.find(a => a.id === m.accountId)
                                        return (
                                            <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                                <td className="p-4 text-xs text-slate-500">
                                                    {new Date(m.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                                </td>
                                                <td className="p-4 text-sm font-medium text-slate-700">{MOVEMENT_TYPE_LABELS[m.type]}</td>
                                                <td className="p-4 text-xs text-slate-500">{account?.name || m.accountId}</td>
                                                <td className="p-4 text-right font-mono text-slate-900">{m.currency} {m.amount.toFixed(2)}</td>
                                                <td className="p-4 text-right font-mono text-xs text-slate-500">{formatRate(m.rate)}</td>
                                                <td className="p-4 text-right font-mono text-xs font-bold text-slate-900">{formatCurrency(m.arsAmount)}</td>
                                                <td className="p-4 text-center">
                                                    <JournalStatusBadge
                                                        status={m.journalStatus}
                                                        onClick={m.journalStatus === 'none' || m.journalStatus === 'missing'
                                                            ? () => handleGenerateJournal(m.id)
                                                            : undefined
                                                        }
                                                    />
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => openMovementModal(m)}
                                                        className="text-slate-400 hover:text-blue-600 transition-colors mr-2"
                                                    >
                                                        <PencilSimple weight="bold" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteMovement(m.id)}
                                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash weight="bold" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {movements.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-400">
                                                No hay movimientos registrados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Conciliacion Tab */}
                {activeTab === 'conciliacion' && (
                    <div className="space-y-6 h-full flex flex-col">
                        {reconciliationData.totalPending > 0 && (
                            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg flex items-start gap-3">
                                <Warning weight="fill" className="text-amber-500 text-xl mt-0.5" />
                                <div>
                                    <h4 className="font-bold text-amber-600 text-sm">Conciliacion Pendiente</h4>
                                    <p className="text-xs text-slate-600 mt-1">
                                        Tenes {reconciliationData.movementsWithoutEntry.length} movimiento(s) sin asiento
                                        {reconciliationData.entriesWithoutMovement.length > 0 && ` y ${reconciliationData.entriesWithoutMovement.length} asiento(s) sin vincular`}.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-6 flex-1 min-h-[400px]">
                            {/* Panel A - Movimientos */}
                            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                                    <h3 className="font-bold text-sm text-slate-700">Movimientos (Operativos)</h3>
                                    <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        {reconciliationData.movementsWithoutEntry.length}
                                    </span>
                                </div>
                                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                                    {reconciliationData.movementsWithoutEntry.map(m => {
                                        const account = fxAccounts.find(a => a.id === m.accountId)
                                        return (
                                            <div key={m.id} className="border border-slate-200 rounded-lg p-3 hover:border-blue-400 transition-colors cursor-pointer group relative overflow-hidden">
                                                {m.journalStatus === 'none' && (
                                                    <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                                                        SUGERIDO
                                                    </div>
                                                )}
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-xs font-bold text-slate-700">{MOVEMENT_TYPE_LABELS[m.type]} ({account?.name})</span>
                                                    <span className="text-xs font-mono text-blue-600">{m.currency} {m.amount.toFixed(2)}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 mb-3">
                                                    {new Date(m.date).toLocaleDateString('es-AR')} • {formatCurrency(m.arsAmount)}
                                                </div>
                                                <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleGenerateJournal(m.id)}
                                                        className="flex-1 bg-blue-600 text-white text-xs font-bold py-1.5 rounded hover:bg-blue-700"
                                                    >
                                                        Generar Asiento
                                                    </button>
                                                    <button className="px-2 border border-slate-200 rounded text-xs hover:bg-slate-50 text-slate-500">
                                                        Vincular
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {reconciliationData.movementsWithoutEntry.length === 0 && (
                                        <div className="text-center text-slate-400 py-8">
                                            <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500" />
                                            <p className="text-sm">Todos los movimientos tienen asiento</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Link Icon */}
                            <div className="flex items-center justify-center text-slate-300">
                                <LinkIcon size={24} weight="duotone" />
                            </div>

                            {/* Panel B - Asientos */}
                            <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                                    <h3 className="font-bold text-sm text-slate-700">Libro Diario (Contable)</h3>
                                    <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        {reconciliationData.entriesWithoutMovement.length}
                                    </span>
                                </div>
                                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                                    {reconciliationData.entriesWithoutMovement.map(e => (
                                        <div key={e.id} className="border border-slate-200 rounded-lg p-3 hover:border-blue-400 transition-colors cursor-pointer group">
                                            <div className="flex justify-between mb-1">
                                                <span className="text-xs font-bold text-slate-700">Asiento #{e.id.slice(-4)}</span>
                                                <span className="text-xs font-mono text-slate-700">
                                                    {formatCurrency(e.lines.reduce((sum, l) => sum + l.debit, 0))}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-slate-500 mb-3">
                                                {new Date(e.date).toLocaleDateString('es-AR')} • {e.memo}
                                            </div>
                                            <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <button className="flex-1 border border-blue-600 text-blue-600 text-xs font-bold py-1.5 rounded hover:bg-blue-50">
                                                    Vincular Seleccion
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {reconciliationData.entriesWithoutMovement.length === 0 && (
                                        <div className="text-center text-slate-400 py-8">
                                            <CheckCircle size={32} className="mx-auto mb-2 text-emerald-500" />
                                            <p className="text-sm">No hay asientos huerfanos</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <AccountModal
                open={accountModalOpen}
                onClose={() => {
                    setAccountModalOpen(false)
                    setEditingAccount(null)
                }}
                onSave={handleSaveAccount}
                editing={editingAccount}
                type={accountModalType}
                periodId={periodId}
                rates={rates}
            />

            <MovementModal
                open={movementModalOpen}
                onClose={() => {
                    setMovementModalOpen(false)
                    setEditingMovement(null)
                }}
                onSave={handleSaveMovement}
                editing={editingMovement}
                accounts={fxAccounts}
                ledgerAccounts={accounts || []}
                periodId={periodId}
                rates={rates}
                settings={settings}
            />

            <SettingsModal
                open={settingsModalOpen}
                onClose={() => setSettingsModalOpen(false)}
                settings={settings}
                onSave={handleSaveSettings}
                accounts={accounts || []}
            />

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
                    }`}>
                    {toast.message}
                </div>
            )}
        </div>
    )
}
