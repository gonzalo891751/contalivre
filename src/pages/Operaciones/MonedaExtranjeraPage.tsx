
/**
 * Moneda Extranjera Page (ME2)
 * UI/UX aligned with docs/prototypes/ME2.HTML
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import {
    ArrowLeft,
    ArrowsClockwise,
    ArrowsLeftRight,
    CheckCircle,
    Eye,
    Funnel,
    Info,
    MagnifyingGlass,
    MagicWand,
    PencilSimple,
    Plus,
    TrendDown,
    TrendUp,
    X,
} from '@phosphor-icons/react'

import { usePeriodYear } from '../../hooks/usePeriodYear'
import { db } from '../../storage/db'
import {
    addFxDebtDisbursement,
    addFxDebtPayment,
    calculateFxAccountBalance,
    createEntry,
    createFxAccount,
    createFxDebt,
    createFxMovement,
    generateJournalForFxMovement,
    getAllFxAccounts,
    getAllFxDebts,
    getAllFxMovements,
    getReconciliationData,
    linkFxMovementToEntries,
    loadFxSettings,
    markFxMovementAsNonAccounting,
    previewFxMovementJournal,
    saveFxSettings,
    type FxJournalPreview,
} from '../../storage'
import {
    ensureLedgerAccountExists,
    suggestLedgerAccountForFxAsset,
    suggestLedgerAccountForFxDebt,
    type LedgerAccountSuggestion,
} from '../../storage/fxMapping'
import { getExchangeRates, getQuote, getRateValue } from '../../services/exchangeRates'
import type { Account } from '../../core/models'
import type {
    CurrencyCode,
    ExchangeRate,
    FxAccount,
    FxDebt,
    FxDebtInstallment,
    FxMovement,
    FxMovementType,
    FxSettings,
    LoanSystem,
    PaymentFrequency,
    QuoteType,
    RateSide,
    ValuationMode,
    FxAssetSubtype,
    FxLiabilitySubtype,
} from '../../core/monedaExtranjera/types'
import {
    ASSET_SUBTYPE_LABELS,
    CURRENCY_LABELS,
    FREQUENCY_LABELS,
    getDefaultRateSide,
    LIABILITY_SUBTYPE_LABELS,
    LOAN_SYSTEM_LABELS,
    MOVEMENT_TYPE_LABELS,
    QUOTE_TYPE_LABELS,
} from '../../core/monedaExtranjera/types'

// ========================================
// Types & helpers
// ========================================

type TabId = 'dashboard' | 'activos' | 'pasivos' | 'movimientos' | 'conciliacion'

type JournalMode = 'auto' | 'manual' | 'none'

interface ManualEntryLine {
    accountId: string
    debit: number
    credit: number
    description?: string
}

const TABS: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'activos', label: 'Activos' },
    { id: 'pasivos', label: 'Pasivos' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'conciliacion', label: 'Conciliación' },
]

const formatCurrencyARS = (value: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)

const formatCurrencyME = (value: number, currency: CurrencyCode) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + ` ${currency}`

const formatRate = (value: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)

const formatDateShort = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })
}

const formatDateInput = (value?: string) => value || new Date().toISOString().split('T')[0]

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ')

// ========================================
// UI atoms
// ========================================

/**
 * ME2 Primary Button: gradient background + white text + hover effects
 * ME2 Secondary Button: white bg + border + dark text + hover
 * Disabled state: legible (slate bg + slate text)
 */
function FxButton({
    variant = 'primary',
    size = 'md',
    className,
    disabled,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'ghost'
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
    }
    const sizes = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2.5 text-sm',
    }
    return (
        <button
            className={cx(base, variants[variant], sizes[size], className)}
            disabled={disabled}
            {...props}
        />
    )
}

function FxBadge({
    tone = 'neutral',
    className,
    children,
}: {
    tone?: 'success' | 'warning' | 'neutral' | 'info' | 'danger'
    className?: string
    children: React.ReactNode
}) {
    const tones = {
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        neutral: 'bg-slate-100 text-slate-600',
        info: 'bg-blue-50 text-blue-700',
        danger: 'bg-rose-50 text-rose-700',
    }
    return (
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide', tones[tone], className)}>
            {children}
        </span>
    )
}

function FxInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={cx(
                'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100',
                className
            )}
            {...props}
        />
    )
}

function FxSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select
            className={cx(
                'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100',
                className
            )}
            {...props}
        >
            {children}
        </select>
    )
}

function FxModal({
    open,
    onClose,
    title,
    size = 'md',
    children,
    footer,
}: {
    open: boolean
    onClose: () => void
    title: string
    size?: 'md' | 'lg'
    children: React.ReactNode
    footer?: React.ReactNode
}) {
    if (!open) return null

    const sizeClass = size === 'lg' ? 'max-w-4xl' : 'max-w-2xl'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
            onMouseDown={e => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                className={cx('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl', sizeClass)}
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <h3 className="font-display text-lg font-bold text-slate-900">{title}</h3>
                    <FxButton variant="secondary" size="sm" onClick={onClose}>
                        <X size={14} weight="bold" />
                    </FxButton>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-8 py-6">{children}</div>
                {footer && (
                    <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}

interface SelectOption {
    value: string
    label: string
    meta?: string
}

function SearchableSelect({
    value,
    options,
    placeholder,
    onChange,
    className,
}: {
    value?: string
    options: SelectOption[]
    placeholder?: string
    onChange: (value: string) => void
    className?: string
}) {
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState(false)

    useEffect(() => {
        const selected = options.find(option => option.value === value)
        setQuery(selected?.label || '')
    }, [options, value])

    const filtered = useMemo(() => {
        const normalized = query.toLowerCase()
        if (!normalized) return options.slice(0, 50)
        return options.filter(option => option.label.toLowerCase().includes(normalized)).slice(0, 50)
    }, [options, query])

    return (
        <div className={cx('relative', className)}>
            <FxInput
                value={query}
                placeholder={placeholder}
                onChange={event => {
                    setQuery(event.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    setTimeout(() => setOpen(false), 150)
                }}
            />
            {open && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filtered.length === 0 && (
                        <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>
                    )}
                    {filtered.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            className={cx(
                                'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50',
                                option.value === value && 'bg-slate-100'
                            )}
                            onClick={() => {
                                onChange(option.value)
                                setQuery(option.label)
                                setOpen(false)
                            }}
                        >
                            <span>{option.label}</span>
                            {option.meta && <span className="text-[11px] text-slate-400">{option.meta}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function JournalStatusBadge({ status }: { status: FxMovement['journalStatus'] }) {
    const config: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' | 'danger' }> = {
        generated: { label: 'Generado', tone: 'success' },
        linked: { label: 'Vinculado', tone: 'info' },
        none: { label: 'Sin asiento', tone: 'neutral' },
        missing: { label: 'Falta asiento', tone: 'warning' },
        desync: { label: 'Desync', tone: 'danger' },
        error: { label: 'Error', tone: 'danger' },
    }
    const badge = config[status] || config.none
    return <FxBadge tone={badge.tone}>{badge.label}</FxBadge>
}

function ManualEntryEditor({
    lines,
    accounts,
    onChange,
}: {
    lines: ManualEntryLine[]
    accounts: Account[]
    onChange: (next: ManualEntryLine[]) => void
}) {
    const accountOptions = useMemo(() => accounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` })), [accounts])

    const updateLine = (index: number, patch: Partial<ManualEntryLine>) => {
        const next = lines.map((line, idx) => (idx === index ? { ...line, ...patch } : line))
        onChange(next)
    }

    return (
        <div className="space-y-3">
            {lines.map((line, index) => (
                <div key={`${line.accountId}-${index}`} className="grid grid-cols-12 gap-3">
                    <div className="col-span-6">
                        <SearchableSelect
                            value={line.accountId}
                            options={accountOptions}
                            placeholder="Cuenta contable"
                            onChange={value => updateLine(index, { accountId: value })}
                        />
                    </div>
                    <FxInput
                        className="col-span-3 text-right font-mono"
                        type="number"
                        step="0.01"
                        value={line.debit}
                        onChange={event => updateLine(index, { debit: Number(event.target.value) || 0 })}
                    />
                    <FxInput
                        className="col-span-3 text-right font-mono"
                        type="number"
                        step="0.01"
                        value={line.credit}
                        onChange={event => updateLine(index, { credit: Number(event.target.value) || 0 })}
                    />
                </div>
            ))}
        </div>
    )
}

// ========================================
// Modals (ME2)
// ========================================

function FxAssetAccountModalME2({
    open,
    onClose,
    periodId,
    rates,
    ledgerAccounts,
    onSuccess,
}: {
    open: boolean
    onClose: () => void
    periodId: string
    rates: ExchangeRate[]
    ledgerAccounts: Account[]
    onSuccess: (message: string) => void
}) {
    const [name, setName] = useState('')
    const [subtype, setSubtype] = useState<FxAssetSubtype>('CAJA')
    const [currency, setCurrency] = useState<CurrencyCode>('USD')
    const [ledgerAccountId, setLedgerAccountId] = useState<string>('')
    const [openingBalance, setOpeningBalance] = useState(0)
    const [openingRate, setOpeningRate] = useState(0)
    const [openingDate, setOpeningDate] = useState(formatDateInput())
    const [openingContraId, setOpeningContraId] = useState('')
    const [openingAutoJournal, setOpeningAutoJournal] = useState(true)
    const [suggestion, setSuggestion] = useState<LedgerAccountSuggestion | null>(null)
    const [saving, setSaving] = useState(false)
    const [manualSelection, setManualSelection] = useState(false)

    const postableAccounts = useMemo(() => ledgerAccounts.filter(acc => !acc.isHeader), [ledgerAccounts])
    const accountOptions = useMemo(
        () => postableAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` })),
        [postableAccounts]
    )

    useEffect(() => {
        if (!open) return
        const oficial = getQuote(rates, 'Oficial')
        setOpeningRate(oficial?.compra || 0)
        setOpeningDate(formatDateInput())
    }, [open, rates])

    useEffect(() => {
        if (!open) return
        const run = async () => {
            const next = await suggestLedgerAccountForFxAsset({
                name,
                subtype,
                currency,
                accounts: ledgerAccounts,
            })
            setSuggestion(next)
            if (!manualSelection && next.account) {
                setLedgerAccountId(next.account.id)
            }
        }
        run()
    }, [currency, ledgerAccounts, manualSelection, name, open, subtype])

    useEffect(() => {
        if (!open) return
        setManualSelection(false)
    }, [open])

    const confidenceLabel = suggestion?.confidence === 'high'
        ? 'Alta confianza'
        : suggestion?.confidence === 'medium'
            ? 'Confianza media'
            : 'Baja confianza'

    const previewAmount = openingBalance > 0 ? openingBalance * (openingRate || 0) : 0

    const handleCreateAccount = async () => {
        if (!suggestion) return
        const created = await ensureLedgerAccountExists({
            name: name || 'Cartera ME',
            kind: 'ASSET',
            accounts: ledgerAccounts,
            parentId: suggestion.parentHint?.id || null,
            group: suggestion.parentHint?.group || 'Caja y Bancos',
            section: suggestion.parentHint?.section || 'CURRENT',
            statementGroup: suggestion.parentHint?.statementGroup || 'CASH_AND_BANKS',
        })
        setLedgerAccountId(created.id)
        setManualSelection(true)
        onSuccess('Cuenta contable creada')
    }

    const handleSubmit = async () => {
        if (!name.trim()) {
            onSuccess('El nombre de la cartera es obligatorio')
            return
        }
        if (!ledgerAccountId) {
            onSuccess('Selecciona una cuenta contable para vincular')
            return
        }
        if (openingBalance > 0 && openingAutoJournal) {
            if (!openingContraId) {
                onSuccess('Selecciona la contrapartida ARS del saldo inicial')
                return
            }
            if (!openingRate || openingRate <= 0) {
                onSuccess('Tipo de cambio historico requerido')
                return
            }
        }

        setSaving(true)
        try {
            const account = await createFxAccount({
                name,
                type: 'ASSET',
                subtype,
                currency,
                periodId,
                accountId: ledgerAccountId,
                openingBalance,
                openingRate,
                openingDate,
            })

            if (openingBalance > 0 && openingAutoJournal) {
                await createEntry({
                    date: openingDate,
                    memo: `Apertura cartera ME - ${account.name}`,
                    lines: [
                        {
                            accountId: ledgerAccountId,
                            debit: previewAmount,
                            credit: 0,
                            description: `Apertura ${currency}`,
                        },
                        {
                            accountId: openingContraId,
                            debit: 0,
                            credit: previewAmount,
                            description: 'Contrapartida apertura',
                        },
                    ],
                    sourceModule: 'fx',
                    sourceId: account.id,
                    sourceType: 'fx_opening',
                    createdAt: new Date().toISOString(),
                })
            }

            onSuccess('Cartera creada')
            onClose()
            setName('')
            setOpeningBalance(0)
            setOpeningContraId('')
        } catch (error) {
            console.error(error)
            onSuccess(error instanceof Error ? error.message : 'Error al crear cartera')
        } finally {
            setSaving(false)
        }
    }

    return (
        <FxModal
            open={open}
            onClose={onClose}
            title="Nuevo Activo en Moneda Extranjera"
            footer={
                <>
                    <FxButton variant="secondary" onClick={onClose}>Cancelar</FxButton>
                    <FxButton onClick={handleSubmit} disabled={saving}>Crear Cartera</FxButton>
                </>
            }
        >
            <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500">Nombre de la Cartera / Lugar</label>
                    <FxInput value={name} onChange={event => setName(event.target.value)} placeholder="Ej: Caja de Ahorro USD" />
                    <div className="mt-3 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="flex gap-3">
                            <div className="text-blue-500">
                                <MagicWand size={20} weight="fill" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-slate-900">Sugerencia contable</h4>
                                    <FxBadge tone="info">{confidenceLabel}</FxBadge>
                                </div>
                                <p className="text-xs text-slate-600">{suggestion?.reason || 'Asignaremos una cuenta sugerida segun el nombre y tipo.'}</p>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <SearchableSelect
                                        value={ledgerAccountId}
                                        options={accountOptions}
                                        placeholder="Selecciona cuenta contable"
                                        onChange={value => {
                                            setLedgerAccountId(value)
                                            setManualSelection(true)
                                        }}
                                    />
                                    {!suggestion?.account && (
                                        <FxButton variant="secondary" size="sm" onClick={handleCreateAccount}>
                                            <Plus size={14} /> Crear cuenta
                                        </FxButton>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Tipo</label>
                        <FxSelect value={subtype} onChange={event => setSubtype(event.target.value as FxAssetSubtype)}>
                            {Object.entries(ASSET_SUBTYPE_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </FxSelect>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500">Moneda</label>
                        <FxSelect value={currency} onChange={event => setCurrency(event.target.value as CurrencyCode)}>
                            {Object.entries(CURRENCY_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </FxSelect>
                    </div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                    <label className="text-xs font-semibold text-slate-500">Saldo inicial (opcional)</label>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                        <FxInput
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={openingBalance}
                            onChange={event => setOpeningBalance(Number(event.target.value) || 0)}
                        />
                        <FxInput
                            type="number"
                            step="0.01"
                            placeholder="TC historico"
                            value={openingRate}
                            onChange={event => setOpeningRate(Number(event.target.value) || 0)}
                            disabled={openingBalance <= 0}
                        />
                        <FxInput
                            type="date"
                            value={openingDate}
                            onChange={event => setOpeningDate(event.target.value)}
                            disabled={openingBalance <= 0}
                        />
                    </div>

                    {openingBalance > 0 && (
                        <div className="mt-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <label className="text-xs font-semibold text-slate-500">Contrapartida ARS</label>
                                <SearchableSelect
                                    value={openingContraId}
                                    options={accountOptions}
                                    placeholder="Cuenta contrapartida"
                                    onChange={setOpeningContraId}
                                    className="flex-1"
                                />
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    <Eye size={14} /> Vista previa asiento (ARS)
                                </div>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2">
                                        <span className="font-medium text-slate-800">{ledgerAccountId ? accountOptions.find(o => o.value === ledgerAccountId)?.label : 'Cuenta ME'}</span>
                                        <span className="font-mono text-slate-500">{formatCurrencyARS(previewAmount)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-slate-800">{openingContraId ? accountOptions.find(o => o.value === openingContraId)?.label : 'Contrapartida'}</span>
                                        <span className="font-mono text-slate-500">{formatCurrencyARS(previewAmount)}</span>
                                    </div>
                                </div>
                                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                    <input
                                        type="checkbox"
                                        checked={openingAutoJournal}
                                        onChange={event => setOpeningAutoJournal(event.target.checked)}
                                    />
                                    Generar asiento automaticamente
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </FxModal>
    )
}

function FxDebtCreateModalME2({
    open,
    onClose,
    periodId,
    ledgerAccounts,
    fxAssetAccounts,
    onSuccess,
    onOpenAssetModal,
}: {
    open: boolean
    onClose: () => void
    periodId: string
    ledgerAccounts: Account[]
    fxAssetAccounts: FxAccount[]
    onSuccess: (message: string) => void
    onOpenAssetModal: () => void
}) {
    const [name, setName] = useState('')
    const [subtype, setSubtype] = useState<FxLiabilitySubtype>('PRESTAMO')
    const [creditor, setCreditor] = useState('')
    const [currency, setCurrency] = useState<CurrencyCode>('USD')
    const [principal, setPrincipal] = useState(0)
    const [rate, setRate] = useState(0)
    const [originDate, setOriginDate] = useState(formatDateInput())
    const [firstDueDate, setFirstDueDate] = useState(formatDateInput())
    const [installments, setInstallments] = useState(12)
    const [frequency, setFrequency] = useState<PaymentFrequency>('MENSUAL')
    const [system, setSystem] = useState<LoanSystem>('FRANCES')
    const [tna, setTna] = useState(0)
    const [targetAssetId, setTargetAssetId] = useState('')
    const [ledgerAccountId, setLedgerAccountId] = useState('')
    const [suggestion, setSuggestion] = useState<LedgerAccountSuggestion | null>(null)
    const [manualSelection, setManualSelection] = useState(false)
    const [autoJournal, setAutoJournal] = useState(true)
    const [saving, setSaving] = useState(false)

    const postableAccounts = useMemo(() => ledgerAccounts.filter(acc => !acc.isHeader), [ledgerAccounts])
    const accountOptions = useMemo(
        () => postableAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` })),
        [postableAccounts]
    )
    // Filter asset accounts by selected currency (P1: only show matching currency)
    const assetOptions = useMemo(
        () => fxAssetAccounts
            .filter(acc => acc.currency === currency)
            .map(acc => ({ value: acc.id, label: acc.name, meta: acc.currency })),
        [fxAssetAccounts, currency]
    )

    useEffect(() => {
        if (!open) return
        const run = async () => {
            const next = await suggestLedgerAccountForFxDebt({
                name,
                creditor,
                subtype,
                currency,
                accounts: ledgerAccounts,
            })
            setSuggestion(next)
            if (!manualSelection && next.account) {
                setLedgerAccountId(next.account.id)
            }
        }
        run()
    }, [creditor, currency, ledgerAccounts, manualSelection, name, open, subtype])

    useEffect(() => {
        if (!open) return
        setManualSelection(false)
    }, [open])

    // Reset target asset when currency changes (P1: ensure valid selection)
    useEffect(() => {
        if (!open) return
        // Check if current target is still valid for the new currency
        const currentTargetValid = fxAssetAccounts.some(acc => acc.id === targetAssetId && acc.currency === currency)
        if (!currentTargetValid) {
            setTargetAssetId('')
        }
    }, [currency, fxAssetAccounts, open, targetAssetId])

    const confidenceLabel = suggestion?.confidence === 'high'
        ? 'Alta confianza'
        : suggestion?.confidence === 'medium'
            ? 'Confianza media'
            : 'Baja confianza'

    const previewAmount = principal > 0 ? principal * (rate || 0) : 0

    const handleCreateAccount = async () => {
        if (!suggestion) return
        const created = await ensureLedgerAccountExists({
            name: name || 'Pasivo ME',
            kind: 'LIABILITY',
            accounts: ledgerAccounts,
            parentId: suggestion.parentHint?.id || null,
            group: suggestion.parentHint?.group || 'Prestamos y deudas financieras',
            section: suggestion.parentHint?.section || 'CURRENT',
            statementGroup: suggestion.parentHint?.statementGroup || 'LOANS',
        })
        setLedgerAccountId(created.id)
        setManualSelection(true)
        onSuccess('Cuenta contable creada')
    }

    const handleSubmit = async () => {
        if (!name.trim()) {
            onSuccess('El nombre de la deuda es obligatorio')
            return
        }
        if (!ledgerAccountId) {
            onSuccess('Selecciona la cuenta contable del pasivo')
            return
        }
        if (!principal || principal <= 0) {
            onSuccess('Ingresa el monto principal')
            return
        }
        if (!rate || rate <= 0) {
            onSuccess('Ingresa el tipo de cambio historico')
            return
        }
        if (!targetAssetId) {
            onSuccess('Selecciona la cartera destino del desembolso')
            return
        }

        setSaving(true)
        try {
            const liabilityAccount = await createFxAccount({
                name,
                type: 'LIABILITY',
                subtype,
                currency,
                periodId,
                accountId: ledgerAccountId,
                creditor,
                openingBalance: 0,
                openingRate: rate,
                openingDate: originDate,
            })

            await createFxDebt(
                {
                    name,
                    accountId: liabilityAccount.id,
                    periodId,
                    principalME: principal,
                    currency,
                    rateInicial: rate,
                    rateType: 'custom',
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
                    creditor,
                    autoJournal,
                },
                {
                    disbursementAccountId: targetAssetId,
                    disbursementDate: originDate,
                    disbursementRate: rate,
                    autoJournal,
                }
            )

            onSuccess('Deuda creada y asentada')
            onClose()
            setName('')
            setPrincipal(0)
            setLedgerAccountId('')
            setTargetAssetId('')
        } catch (error) {
            console.error(error)
            onSuccess(error instanceof Error ? error.message : 'Error al crear deuda')
        } finally {
            setSaving(false)
        }
    }

    return (
        <FxModal
            open={open}
            onClose={onClose}
            title="Alta de Pasivo en Moneda Extranjera"
            size="lg"
            footer={
                <>
                    <FxButton variant="secondary" onClick={onClose}>Cancelar</FxButton>
                    <FxButton onClick={handleSubmit} disabled={saving}>Crear Deuda y Asentar</FxButton>
                </>
            }
        >
            <div className="space-y-6">
                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">A. Identidad y Contabilidad</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Nombre / Alias</label>
                            <FxInput value={name} onChange={event => setName(event.target.value)} placeholder="Ej: Prestamo Socio A" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Tipo</label>
                            <FxSelect value={subtype} onChange={event => setSubtype(event.target.value as FxLiabilitySubtype)}>
                                {Object.entries(LIABILITY_SUBTYPE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </FxSelect>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Acreedor</label>
                            <FxInput value={creditor} onChange={event => setCreditor(event.target.value)} placeholder="Nombre persona o entidad" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Moneda</label>
                            <FxSelect value={currency} onChange={event => setCurrency(event.target.value as CurrencyCode)}>
                                {Object.entries(CURRENCY_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </FxSelect>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-3">
                        <div className="flex gap-3">
                            <div className="text-blue-500">
                                <MagicWand size={20} weight="fill" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-slate-900">Sugerencia contable</h4>
                                    <FxBadge tone="info">{confidenceLabel}</FxBadge>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <SearchableSelect
                                        value={ledgerAccountId}
                                        options={accountOptions}
                                        placeholder="Selecciona cuenta pasivo"
                                        onChange={value => {
                                            setLedgerAccountId(value)
                                            setManualSelection(true)
                                        }}
                                    />
                                    {!suggestion?.account && (
                                        <FxButton variant="secondary" size="sm" onClick={handleCreateAccount}>
                                            <Plus size={14} /> Crear cuenta
                                        </FxButton>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">B. Alta Inicial (Desembolso)</div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Monto principal (ME)</label>
                            <FxInput type="number" step="0.01" value={principal} onChange={event => setPrincipal(Number(event.target.value) || 0)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">TC historico (ARS/ME)</label>
                            <FxInput type="number" step="0.01" value={rate} onChange={event => setRate(Number(event.target.value) || 0)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Fecha de alta</label>
                            <FxInput type="date" value={originDate} onChange={event => setOriginDate(event.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Primer vencimiento</label>
                            <FxInput type="date" value={firstDueDate} onChange={event => setFirstDueDate(event.target.value)} />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">C. Condiciones Financieras (Plan)</div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Cuotas</label>
                            <FxInput type="number" value={installments} onChange={event => setInstallments(Number(event.target.value) || 0)} />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Frecuencia</label>
                            <FxSelect value={frequency} onChange={event => setFrequency(event.target.value as PaymentFrequency)}>
                                {Object.entries(FREQUENCY_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </FxSelect>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Sistema</label>
                            <FxSelect value={system} onChange={event => setSystem(event.target.value as LoanSystem)}>
                                {Object.entries(LOAN_SYSTEM_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </FxSelect>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">TNA %</label>
                            <FxInput type="number" step="0.01" value={tna} onChange={event => setTna(Number(event.target.value) || 0)} />
                        </div>
                    </div>
                </div>

                <div>
                    <div className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">D. Destino de fondos (Activo ME)</div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <SearchableSelect
                            value={targetAssetId}
                            options={assetOptions}
                            placeholder="Selecciona cartera destino"
                            onChange={setTargetAssetId}
                            className="flex-1"
                        />
                        <FxButton variant="secondary" size="sm" onClick={onOpenAssetModal}>
                            <Plus size={14} /> Crear activo
                        </FxButton>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Se acreditara en el activo seleccionado al TC historico.</div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <Eye size={14} /> Vista previa asiento (ARS)
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2">
                            <span className="font-medium text-slate-800">Activo ME</span>
                            <span className="font-mono text-slate-500">{formatCurrencyARS(previewAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-800">{ledgerAccountId ? accountOptions.find(o => o.value === ledgerAccountId)?.label : 'Pasivo ME'}</span>
                            <span className="font-mono text-slate-500">{formatCurrencyARS(previewAmount)}</span>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                        <input
                            type="checkbox"
                            checked={autoJournal}
                            onChange={event => setAutoJournal(event.target.checked)}
                        />
                        Generar asiento automaticamente
                    </div>
                </div>
            </div>
        </FxModal>
    )
}

function FxDebtPlanModalME2({
    open,
    onClose,
    debt,
}: {
    open: boolean
    onClose: () => void
    debt: FxDebt | null
}) {
    if (!debt) return null

    const remainingInstallments = debt.schedule?.length ? debt.schedule.filter(item => !item.paid).length : 0

    return (
        <FxModal
            open={open}
            onClose={onClose}
            title={debt.name}
            size="lg"
            footer={<FxButton onClick={onClose}>Cerrar</FxButton>}
        >
            <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">Saldo capital</div>
                        <div className="font-mono text-lg font-semibold">{formatCurrencyME(debt.saldoME, debt.currency)}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">TC historico</div>
                        <div className="font-mono text-lg font-semibold">{formatRate(debt.rateInicial)}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="text-xs text-amber-700">Prox. venc.</div>
                        <div className="font-mono text-lg font-semibold text-amber-700">
                            {formatDateShort(debt.schedule?.find(item => !item.paid)?.dueDate)}
                        </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <div className="text-xs text-slate-500">Cuotas rest.</div>
                        <div className="font-mono text-lg font-semibold">{remainingInstallments} / {debt.installments}</div>
                    </div>
                </div>

                <div>
                    <div className="mb-2 text-sm font-semibold text-slate-700">Cuadro de amortización</div>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="max-h-72 overflow-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">#</th>
                                        <th className="px-3 py-2 text-left">Vencimiento</th>
                                        <th className="px-3 py-2 text-right">Capital</th>
                                        <th className="px-3 py-2 text-right">Interes</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(debt.schedule || []).map((item: FxDebtInstallment) => (
                                        <tr key={item.number} className="border-t border-slate-200">
                                            <td className="px-3 py-2">{item.number}</td>
                                            <td className="px-3 py-2">{formatDateShort(item.dueDate)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{item.capitalME.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{item.interestME.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{item.totalME.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-center">
                                                {item.paid ? <FxBadge tone="success">Pagada</FxBadge> : <FxBadge tone="warning">Pendiente</FxBadge>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </FxModal>
    )
}

function FxOperationModalME2({
    open,
    onClose,
    periodId,
    settings,
    rates,
    fxAccounts,
    fxDebts,
    ledgerAccounts,
    onSuccess,
}: {
    open: boolean
    onClose: () => void
    periodId: string
    settings: FxSettings | null
    rates: ExchangeRate[]
    fxAccounts: FxAccount[]
    fxDebts: FxDebt[]
    ledgerAccounts: Account[]
    onSuccess: (message: string) => void
}) {
    const [activeTab, setActiveTab] = useState<'compra' | 'venta' | 'pago' | 'refi'>('compra')
    const [journalMode, setJournalMode] = useState<JournalMode>('auto')
    const [manualLines, setManualLines] = useState<ManualEntryLine[]>([])
    const [preview, setPreview] = useState<FxJournalPreview | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)

    const assetAccounts = useMemo(() => fxAccounts.filter(acc => acc.type === 'ASSET'), [fxAccounts])
    const assetOptions = useMemo(() => assetAccounts.map(acc => ({ value: acc.id, label: acc.name, meta: acc.currency })), [assetAccounts])
    const debtOptions = useMemo(() => fxDebts.map(debt => ({ value: debt.id, label: debt.name, meta: debt.currency })), [fxDebts])

    const postableAccounts = useMemo(() => ledgerAccounts.filter(acc => !acc.isHeader), [ledgerAccounts])
    const ledgerOptions = useMemo(
        () => postableAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` })),
        [postableAccounts]
    )

    const [compra, setCompra] = useState({
        accountId: '',
        date: formatDateInput(),
        amount: 0,
        rate: 0,
        rateType: 'custom' as QuoteType | 'custom',
        rateSide: getDefaultRateSide('COMPRA'),
        contrapartidaAccountId: '',
        comisionARS: 0,
        comisionAccountId: '',
        counterparty: '',
        reference: '',
    })

    const [venta, setVenta] = useState({
        accountId: '',
        date: formatDateInput(),
        amount: 0,
        rate: 0,
        rateType: 'custom' as QuoteType | 'custom',
        rateSide: getDefaultRateSide('VENTA'),
        contrapartidaAccountId: '',
        comisionARS: 0,
        comisionAccountId: '',
        counterparty: '',
        reference: '',
    })

    const [pago, setPago] = useState({
        debtId: '',
        date: formatDateInput(),
        capitalME: 0,
        rate: 0,
        interestARS: 0,
        contrapartidaAccountId: '',
        comisionARS: 0,
        comisionAccountId: '',
        source: 'ARS' as 'ARS' | 'ME',
        sourceFxAccountId: '',
    })

    const [refi, setRefi] = useState({
        debtId: '',
        date: formatDateInput(),
        amount: 0,
        rate: 0,
        targetAccountId: '',
    })

    useEffect(() => {
        if (!open) return
        const oficial = getQuote(rates, 'Oficial')
        const defaultRate = oficial?.venta || 0
        setCompra(prev => ({ ...prev, rate: defaultRate }))
        setVenta(prev => ({ ...prev, rate: oficial?.compra || 0 }))
        setPago(prev => ({ ...prev, rate: defaultRate }))
        setRefi(prev => ({ ...prev, rate: defaultRate }))
        setJournalMode('auto')
        setManualLines([])
    }, [open, rates])

    const buildPreviewMovement = (): Omit<FxMovement, 'id' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'> | null => {
        if (!settings) return null

        if (activeTab === 'compra' && compra.accountId) {
            return {
                date: compra.date,
                type: 'COMPRA',
                accountId: compra.accountId,
                periodId,
                amount: compra.amount,
                currency: assetAccounts.find(acc => acc.id === compra.accountId)?.currency || 'USD',
                rate: compra.rate,
                rateType: compra.rateType,
                rateSide: compra.rateSide as RateSide,
                rateSource: 'Manual',
                arsAmount: compra.amount * compra.rate,
                contrapartidaAccountId: compra.contrapartidaAccountId,
                comisionARS: compra.comisionARS,
                comisionAccountId: compra.comisionAccountId,
                autoJournal: journalMode !== 'none',
                counterparty: compra.counterparty,
                reference: compra.reference,
            }
        }

        if (activeTab === 'venta' && venta.accountId) {
            return {
                date: venta.date,
                type: 'VENTA',
                accountId: venta.accountId,
                periodId,
                amount: venta.amount,
                currency: assetAccounts.find(acc => acc.id === venta.accountId)?.currency || 'USD',
                rate: venta.rate,
                rateType: venta.rateType,
                rateSide: venta.rateSide as RateSide,
                rateSource: 'Manual',
                arsAmount: venta.amount * venta.rate,
                contrapartidaAccountId: venta.contrapartidaAccountId,
                comisionARS: venta.comisionARS,
                comisionAccountId: venta.comisionAccountId,
                autoJournal: journalMode !== 'none',
                counterparty: venta.counterparty,
                reference: venta.reference,
            }
        }

        if (activeTab === 'pago' && pago.debtId) {
            const debt = fxDebts.find(item => item.id === pago.debtId)
            if (!debt) return null
            return {
                date: pago.date,
                type: 'PAGO_DEUDA',
                accountId: debt.accountId,
                periodId,
                amount: pago.capitalME,
                currency: debt.currency,
                rate: pago.rate,
                rateType: debt.rateType || 'custom',
                rateSide: debt.rateSide,
                rateSource: 'Manual',
                arsAmount: pago.capitalME * pago.rate,
                autoJournal: journalMode !== 'none',
                debtId: debt.id,
                capitalAmount: pago.capitalME,
                interestARS: pago.interestARS,
                contrapartidaAccountId: pago.contrapartidaAccountId,
                comisionARS: pago.comisionARS,
                comisionAccountId: pago.comisionAccountId,
            }
        }

        if (activeTab === 'refi' && refi.debtId) {
            const debt = fxDebts.find(item => item.id === refi.debtId)
            if (!debt) return null
            return {
                date: refi.date,
                type: 'DESEMBOLSO_DEUDA',
                accountId: debt.accountId,
                targetAccountId: refi.targetAccountId,
                periodId,
                amount: refi.amount,
                currency: debt.currency,
                rate: refi.rate,
                rateType: debt.rateType || 'custom',
                rateSide: debt.rateSide,
                rateSource: 'Manual',
                arsAmount: refi.amount * refi.rate,
                autoJournal: journalMode !== 'none',
                debtId: debt.id,
            }
        }

        return null
    }

    useEffect(() => {
        if (!open) return
        const run = async () => {
            const movement = buildPreviewMovement()
            if (!movement || journalMode === 'none') {
                setPreview(null)
                setPreviewError(null)
                return
            }
            const result = await previewFxMovementJournal(movement)
            setPreview(result)
            setPreviewError(result.error || null)
            if (journalMode === 'manual' && result.lines.length > 0) {
                setManualLines(result.lines.map(line => ({
                    accountId: line.accountId,
                    debit: line.debit,
                    credit: line.credit,
                    description: line.description,
                })))
            }
        }
        run()
    }, [activeTab, compra, fxDebts, journalMode, open, pago, refi, venta])

    const manualTotals = useMemo(() => {
        const debit = manualLines.reduce((sum, line) => sum + (line.debit || 0), 0)
        const credit = manualLines.reduce((sum, line) => sum + (line.credit || 0), 0)
        return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 }
    }, [manualLines])

    const handleRegister = async () => {
        try {
            if (activeTab === 'compra') {
                if (!compra.accountId || compra.amount <= 0 || compra.rate <= 0) {
                    onSuccess('Completa cuenta, monto y TC')
                    return
                }
                if (journalMode !== 'none' && !compra.contrapartidaAccountId) {
                    onSuccess('Selecciona la contrapartida ARS')
                    return
                }

                const movement = await createFxMovement({
                    date: compra.date,
                    type: 'COMPRA',
                    accountId: compra.accountId,
                    periodId,
                    amount: compra.amount,
                    currency: assetAccounts.find(acc => acc.id === compra.accountId)?.currency || 'USD',
                    rate: compra.rate,
                    rateType: compra.rateType,
                    rateSide: compra.rateSide as RateSide,
                    rateSource: 'Manual',
                    arsAmount: compra.amount * compra.rate,
                    contrapartidaAccountId: compra.contrapartidaAccountId,
                    comisionARS: compra.comisionARS,
                    comisionAccountId: compra.comisionAccountId,
                    autoJournal: journalMode === 'auto',
                })

                if (journalMode === 'manual') {
                    if (!manualTotals.balanced) {
                        onSuccess('El asiento manual no balancea')
                        return
                    }
                    const entry = await createEntry({
                        date: compra.date,
                        memo: `Compra ${compra.amount} ${movement.currency}`,
                        lines: manualLines.map(line => ({
                            accountId: line.accountId,
                            debit: line.debit,
                            credit: line.credit,
                            description: line.description,
                        })),
                        createdAt: new Date().toISOString(),
                    })
                    await linkFxMovementToEntries(movement.id, [entry.id])
                    await db.fxMovements.update(movement.id, { journalStatus: 'desync', autoJournal: true })
                }

                onSuccess('Operación registrada')
                onClose()
                return
            }

            if (activeTab === 'venta') {
                if (!venta.accountId || venta.amount <= 0 || venta.rate <= 0) {
                    onSuccess('Completa cuenta, monto y TC')
                    return
                }
                if (journalMode !== 'none' && !venta.contrapartidaAccountId) {
                    onSuccess('Selecciona la contrapartida ARS')
                    return
                }

                const balanceCheck = await calculateFxAccountBalance(venta.accountId, periodId, venta.date)
                if (venta.amount > balanceCheck.balance) {
                    onSuccess(`Saldo insuficiente. Disponible: ${balanceCheck.balance.toFixed(2)}`)
                    return
                }

                const movement = await createFxMovement({
                    date: venta.date,
                    type: 'VENTA',
                    accountId: venta.accountId,
                    periodId,
                    amount: venta.amount,
                    currency: assetAccounts.find(acc => acc.id === venta.accountId)?.currency || 'USD',
                    rate: venta.rate,
                    rateType: venta.rateType,
                    rateSide: venta.rateSide as RateSide,
                    rateSource: 'Manual',
                    arsAmount: venta.amount * venta.rate,
                    contrapartidaAccountId: venta.contrapartidaAccountId,
                    comisionARS: venta.comisionARS,
                    comisionAccountId: venta.comisionAccountId,
                    autoJournal: journalMode === 'auto',
                })

                if (journalMode === 'manual') {
                    if (!manualTotals.balanced) {
                        onSuccess('El asiento manual no balancea')
                        return
                    }
                    const entry = await createEntry({
                        date: venta.date,
                        memo: `Venta ${venta.amount} ${movement.currency}`,
                        lines: manualLines.map(line => ({
                            accountId: line.accountId,
                            debit: line.debit,
                            credit: line.credit,
                            description: line.description,
                        })),
                        createdAt: new Date().toISOString(),
                    })
                    await linkFxMovementToEntries(movement.id, [entry.id])
                    await db.fxMovements.update(movement.id, { journalStatus: 'desync', autoJournal: true })
                }

                onSuccess('Operación registrada')
                onClose()
                return
            }

            if (activeTab === 'pago') {
                if (!pago.debtId || pago.capitalME <= 0 || pago.rate <= 0) {
                    onSuccess('Completa deuda, monto y TC')
                    return
                }
                if (journalMode !== 'none' && !pago.contrapartidaAccountId) {
                    onSuccess('Selecciona contrapartida')
                    return
                }

                const debt = fxDebts.find(item => item.id === pago.debtId)
                if (!debt) {
                    onSuccess('Deuda no encontrada')
                    return
                }

                const result = await addFxDebtPayment({
                    debtId: debt.id,
                    capitalME: pago.capitalME,
                    interestARS: pago.interestARS,
                    rate: pago.rate,
                    date: pago.date,
                    contrapartidaAccountId: pago.contrapartidaAccountId,
                    comisionARS: pago.comisionARS,
                    comisionAccountId: pago.comisionAccountId,
                    autoJournal: journalMode === 'auto',
                })

                if (pago.source === 'ME' && pago.sourceFxAccountId) {
                    await createFxMovement({
                        date: pago.date,
                        type: 'EGRESO',
                        accountId: pago.sourceFxAccountId,
                        periodId,
                        amount: pago.capitalME,
                        currency: debt.currency,
                        rate: pago.rate,
                        rateType: debt.rateType || 'custom',
                        rateSide: debt.rateSide,
                        rateSource: 'Manual',
                        arsAmount: pago.capitalME * pago.rate,
                        autoJournal: false,
                    })
                }

                if (journalMode === 'manual') {
                    if (!manualTotals.balanced) {
                        onSuccess('El asiento manual no balancea')
                        return
                    }
                    const entry = await createEntry({
                        date: pago.date,
                        memo: `Pago deuda ${debt.name}`,
                        lines: manualLines.map(line => ({
                            accountId: line.accountId,
                            debit: line.debit,
                            credit: line.credit,
                            description: line.description,
                        })),
                        createdAt: new Date().toISOString(),
                    })
                    await linkFxMovementToEntries(result.movement.id, [entry.id])
                    await db.fxMovements.update(result.movement.id, { journalStatus: 'desync', autoJournal: true })
                }

                onSuccess('Pago registrado')
                onClose()
                return
            }

            if (activeTab === 'refi') {
                if (!refi.debtId || refi.amount <= 0 || refi.rate <= 0 || !refi.targetAccountId) {
                    onSuccess('Completa deuda, monto, TC y destino')
                    return
                }

                const debt = fxDebts.find(item => item.id === refi.debtId)
                if (!debt) {
                    onSuccess('Deuda no encontrada')
                    return
                }

                await addFxDebtDisbursement({
                    debtId: debt.id,
                    amount: refi.amount,
                    rate: refi.rate,
                    date: refi.date,
                    targetAccountId: refi.targetAccountId,
                    autoJournal: journalMode === 'auto',
                })

                if (journalMode === 'manual') {
                    onSuccess('Refinanciación registrada. Ajusta el asiento en conciliación si es necesario.')
                } else {
                    onSuccess('Refinanciación registrada')
                }

                onClose()
            }
        } catch (error) {
            console.error(error)
            onSuccess(error instanceof Error ? error.message : 'Error al Registrar Operación')
        }
    }

    const activePreview = journalMode === 'manual' ? null : preview

    return (
        <FxModal
            open={open}
            onClose={onClose}
            title="Registrar Operación ME"
            footer={
                <>
                    <FxButton variant="secondary" onClick={onClose}>Cancelar</FxButton>
                    <FxButton variant="secondary" title="Editar asiento" onClick={() => setJournalMode(journalMode === 'manual' ? 'auto' : 'manual')}>
                        <PencilSimple size={16} weight="bold" />
                    </FxButton>
                    <FxButton onClick={handleRegister}>Registrar Operación</FxButton>
                </>
            }
        >
            <div className="space-y-6">
                <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
                    {[
                        { id: 'compra', label: 'Compra (Activo)' },
                        { id: 'venta', label: 'Venta (Activo)' },
                        { id: 'pago', label: 'Pago Deuda' },
                        { id: 'refi', label: 'Refinanciación' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            className={cx(
                                'flex-1 rounded-md px-3 py-2 text-xs font-semibold transition',
                                activeTab === tab.id
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            )}
                            onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'compra' && (
                    <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cuenta destino (ME)</label>
                                <SearchableSelect
                                    value={compra.accountId}
                                    options={assetOptions}
                                    placeholder="Selecciona cartera"
                                    onChange={value => setCompra(prev => ({ ...prev, accountId: value }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Fecha operación</label>
                                <FxInput type="date" value={compra.date} onChange={event => setCompra(prev => ({ ...prev, date: event.target.value }))} />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Monto compra</label>
                                <FxInput type="number" step="0.01" value={compra.amount} onChange={event => setCompra(prev => ({ ...prev, amount: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cotizacion</label>
                                <div className="flex gap-2">
                                    <FxInput type="number" step="0.01" value={compra.rate} onChange={event => setCompra(prev => ({ ...prev, rate: Number(event.target.value) || 0 }))} />
                                    <FxButton variant="secondary" size="sm" onClick={() => {
                                        const quote = getQuote(rates, 'Oficial')
                                        if (quote) setCompra(prev => ({ ...prev, rate: quote.venta || prev.rate }))
                                    }}>
                                        <ArrowsClockwise size={14} />
                                    </FxButton>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Origen fondos (ARS)</label>
                            <SearchableSelect
                                value={compra.contrapartidaAccountId}
                                options={ledgerOptions}
                                placeholder="Cuenta ARS"
                                onChange={value => setCompra(prev => ({ ...prev, contrapartidaAccountId: value }))}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Comisiones ARS</label>
                                <FxInput type="number" step="0.01" value={compra.comisionARS} onChange={event => setCompra(prev => ({ ...prev, comisionARS: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cuenta comision</label>
                                <SearchableSelect
                                    value={compra.comisionAccountId}
                                    options={ledgerOptions}
                                    placeholder="Cuenta gasto"
                                    onChange={value => setCompra(prev => ({ ...prev, comisionAccountId: value }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'venta' && (
                    <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cuenta origen (ME)</label>
                                <SearchableSelect
                                    value={venta.accountId}
                                    options={assetOptions}
                                    placeholder="Selecciona cartera"
                                    onChange={value => setVenta(prev => ({ ...prev, accountId: value }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Destino ARS</label>
                                <SearchableSelect
                                    value={venta.contrapartidaAccountId}
                                    options={ledgerOptions}
                                    placeholder="Cuenta ARS"
                                    onChange={value => setVenta(prev => ({ ...prev, contrapartidaAccountId: value }))}
                                />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Monto venta</label>
                                <FxInput type="number" step="0.01" value={venta.amount} onChange={event => setVenta(prev => ({ ...prev, amount: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cotizacion</label>
                                <FxInput type="number" step="0.01" value={venta.rate} onChange={event => setVenta(prev => ({ ...prev, rate: Number(event.target.value) || 0 }))} />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Comisiones ARS</label>
                                <FxInput type="number" step="0.01" value={venta.comisionARS} onChange={event => setVenta(prev => ({ ...prev, comisionARS: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cuenta comision</label>
                                <SearchableSelect
                                    value={venta.comisionAccountId}
                                    options={ledgerOptions}
                                    placeholder="Cuenta gasto"
                                    onChange={value => setVenta(prev => ({ ...prev, comisionAccountId: value }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'pago' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Pasivo a pagar</label>
                            <SearchableSelect
                                value={pago.debtId}
                                options={debtOptions}
                                placeholder="Selecciona deuda"
                                onChange={value => setPago(prev => ({ ...prev, debtId: value }))}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Monto capital (ME)</label>
                                <FxInput type="number" step="0.01" value={pago.capitalME} onChange={event => setPago(prev => ({ ...prev, capitalME: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">TC pago</label>
                                <FxInput type="number" step="0.01" value={pago.rate} onChange={event => setPago(prev => ({ ...prev, rate: Number(event.target.value) || 0 }))} />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Interes ARS</label>
                                <FxInput type="number" step="0.01" value={pago.interestARS} onChange={event => setPago(prev => ({ ...prev, interestARS: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Fecha pago</label>
                                <FxInput type="date" value={pago.date} onChange={event => setPago(prev => ({ ...prev, date: event.target.value }))} />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Origen del pago</label>
                            <FxSelect value={pago.source} onChange={event => setPago(prev => ({ ...prev, source: event.target.value as 'ARS' | 'ME' }))}>
                                <option value="ARS">Desde ARS</option>
                                <option value="ME">Desde Activo ME</option>
                            </FxSelect>
                        </div>
                        {pago.source === 'ME' ? (
                            <SearchableSelect
                                value={pago.sourceFxAccountId}
                                options={assetOptions}
                                placeholder="Selecciona cartera ME"
                                onChange={value => setPago(prev => ({ ...prev, sourceFxAccountId: value, contrapartidaAccountId: fxAccounts.find(a => a.id === value)?.accountId || prev.contrapartidaAccountId }))}
                            />
                        ) : (
                            <SearchableSelect
                                value={pago.contrapartidaAccountId}
                                options={ledgerOptions}
                                placeholder="Cuenta ARS"
                                onChange={value => setPago(prev => ({ ...prev, contrapartidaAccountId: value }))}
                            />
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Comisiones ARS</label>
                                <FxInput type="number" step="0.01" value={pago.comisionARS} onChange={event => setPago(prev => ({ ...prev, comisionARS: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Cuenta comision</label>
                                <SearchableSelect
                                    value={pago.comisionAccountId}
                                    options={ledgerOptions}
                                    placeholder="Cuenta gasto"
                                    onChange={value => setPago(prev => ({ ...prev, comisionAccountId: value }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'refi' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-semibold text-slate-500">Pasivo</label>
                            <SearchableSelect
                                value={refi.debtId}
                                options={debtOptions}
                                placeholder="Selecciona deuda"
                                onChange={value => setRefi(prev => ({ ...prev, debtId: value }))}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Monto adicional (ME)</label>
                                <FxInput type="number" step="0.01" value={refi.amount} onChange={event => setRefi(prev => ({ ...prev, amount: Number(event.target.value) || 0 }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">TC historico</label>
                                <FxInput type="number" step="0.01" value={refi.rate} onChange={event => setRefi(prev => ({ ...prev, rate: Number(event.target.value) || 0 }))} />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Fecha</label>
                                <FxInput type="date" value={refi.date} onChange={event => setRefi(prev => ({ ...prev, date: event.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-500">Destino fondos (Activo ME)</label>
                                <SearchableSelect
                                    value={refi.targetAccountId}
                                    options={assetOptions}
                                    placeholder="Selecciona cartera"
                                    onChange={value => setRefi(prev => ({ ...prev, targetAccountId: value }))}
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            <Eye size={14} /> Vista previa del asiento (ARS)
                        </div>
                        {previewError && <FxBadge tone="warning">{previewError}</FxBadge>}
                    </div>

                    {journalMode === 'manual' && (
                        <div className="mt-3">
                            <ManualEntryEditor lines={manualLines} accounts={postableAccounts} onChange={setManualLines} />
                            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                                <span>Debe: {formatCurrencyARS(manualTotals.debit)}</span>
                                <span>Haber: {formatCurrencyARS(manualTotals.credit)}</span>
                                <span className={manualTotals.balanced ? 'text-emerald-600' : 'text-rose-600'}>
                                    {manualTotals.balanced ? 'Balanceado' : 'No balancea'}
                                </span>
                            </div>
                        </div>
                    )}

                    {journalMode !== 'manual' && activePreview && (
                        <div className="mt-3 space-y-2 text-sm">
                            {activePreview.lines.map((line: FxJournalPreview['lines'][number], index: number) => (
                                <div key={`${line.accountId}-${index}`} className="flex items-center justify-between border-b border-dashed border-slate-200 pb-2 last:border-b-0">
                                    <span className="font-medium text-slate-800">
                                        {line.accountCode ? `${line.accountCode} - ${line.accountName}` : line.accountName}
                                    </span>
                                    <span className="font-mono text-slate-500">
                                        {line.debit > 0 ? formatCurrencyARS(line.debit) : '-'} / {line.credit > 0 ? formatCurrencyARS(line.credit) : '-'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 space-y-2 text-xs text-slate-500">
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="journalMode"
                                checked={journalMode === 'auto'}
                                onChange={() => setJournalMode('auto')}
                            />
                            Generar asiento automaticamente
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="journalMode"
                                checked={journalMode === 'none'}
                                onChange={() => setJournalMode('none')}
                            />
                            No generar asiento (no contable)
                        </label>
                    </div>
                </div>
            </div>
        </FxModal>
    )
}

function LinkEntryModal({
    open,
    onClose,
    movement,
    entries,
    onLink,
}: {
    open: boolean
    onClose: () => void
    movement: FxMovement | null
    entries: { id: string; memo: string; date: string; total?: number }[]
    onLink: (entryId: string) => void
}) {
    const [selected, setSelected] = useState('')

    useEffect(() => {
        if (!open) return
        setSelected('')
    }, [open])

    if (!movement) return null

    return (
        <FxModal
            open={open}
            onClose={onClose}
            title="Vincular asiento existente"
            footer={
                <>
                    <FxButton variant="secondary" onClick={onClose}>Cancelar</FxButton>
                    <FxButton onClick={() => selected && onLink(selected)} disabled={!selected}>Vincular</FxButton>
                </>
            }
        >
            <div className="space-y-3">
                <div className="text-xs text-slate-500">Movimiento: {movement.type} - {movement.date}</div>
                <div className="space-y-2">
                    {entries.map(entry => (
                        <button
                            key={entry.id}
                            type="button"
                            className={cx(
                                'w-full rounded-lg border px-3 py-2 text-left text-sm',
                                selected === entry.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
                            )}
                            onClick={() => setSelected(entry.id)}
                        >
                            <div className="font-medium text-slate-800">{entry.memo}</div>
                            <div className="text-xs text-slate-500">{entry.date} · {entry.total ? formatCurrencyARS(entry.total) : ''}</div>
                        </button>
                    ))}
                </div>
            </div>
        </FxModal>
    )
}

// ========================================
// Main Page
// ========================================

export default function MonedaExtranjeraPage() {
    const navigate = useNavigate()
    const { year } = usePeriodYear()
    const periodId = String(year)

    const [activeTab, setActiveTab] = useState<TabId>('dashboard')
    const [settings, setSettings] = useState<FxSettings | null>(null)
    const [valuationMode, setValuationMode] = useState<ValuationMode>('contable')
    const [rates, setRates] = useState<ExchangeRate[]>([])
    const [ratesError, setRatesError] = useState<string | null>(null)
    const [ratesLoading, setRatesLoading] = useState(false)

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const [assetModalOpen, setAssetModalOpen] = useState(false)
    const [debtModalOpen, setDebtModalOpen] = useState(false)
    const [operationModalOpen, setOperationModalOpen] = useState(false)
    const [planModalOpen, setPlanModalOpen] = useState(false)
    const [selectedDebt, setSelectedDebt] = useState<FxDebt | null>(null)

    const [linkModalOpen, setLinkModalOpen] = useState(false)
    const [linkTargetMovement, setLinkTargetMovement] = useState<FxMovement | null>(null)

    const [reconciliation, setReconciliation] = useState<{ movementsWithoutEntry: FxMovement[]; orphanEntries: any[] }>({
        movementsWithoutEntry: [],
        orphanEntries: [],
    })

    const fxAccounts = useLiveQuery(() => getAllFxAccounts(periodId), [periodId]) || []
    const fxDebts = useLiveQuery(() => getAllFxDebts(periodId), [periodId]) || []
    const movements = useLiveQuery(() => getAllFxMovements(periodId), [periodId]) || []
    const ledgerAccounts = useLiveQuery(() => db.accounts.toArray(), []) || []

    const assetAccounts = useMemo(() => fxAccounts.filter(acc => acc.type === 'ASSET'), [fxAccounts])

    const accountMap = useMemo(() => new Map(fxAccounts.map(acc => [acc.id, acc])), [fxAccounts])
    const ledgerMap = useMemo(() => new Map(ledgerAccounts.map(acc => [acc.id, acc])), [ledgerAccounts])

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3500)
    }, [])

    useEffect(() => {
        loadFxSettings().then(value => {
            setSettings(value)
            setValuationMode(value.defaultValuationMode)
        })
    }, [])

    const fetchRates = useCallback(async (force = false) => {
        setRatesLoading(true)
        const result = await getExchangeRates(force)
        setRates(result.rates || [])
        setRatesError(result.error || null)
        setRatesLoading(false)
    }, [])

    useEffect(() => {
        fetchRates(false)
    }, [fetchRates])

    const currentQuoteType: QuoteType = useMemo(() => {
        if (valuationMode === 'gestion') {
            return settings?.gestionQuoteType || 'Blue'
        }
        return 'Oficial'
    }, [settings?.gestionQuoteType, valuationMode])

    const currentRate = useMemo(() => getQuote(rates, currentQuoteType), [rates, currentQuoteType])

    const accountValuations = useMemo(() => {
        if (!settings || !currentRate) return []

        return assetAccounts.map(account => {
            let balance = account.openingBalance
            let totalArsHistorical = account.openingBalance * account.openingRate

            const accountMovements = movements.filter(m => m.accountId === account.id)
            for (const m of accountMovements) {
                const sign = ['COMPRA', 'INGRESO', 'AJUSTE'].includes(m.type) ? 1 : -1
                balance += sign * m.amount
                totalArsHistorical += sign * m.arsAmount
            }

            const incomingTransfers = movements.filter(m =>
                (m.type === 'TRANSFERENCIA' || m.type === 'TOMA_DEUDA' || m.type === 'DESEMBOLSO_DEUDA') &&
                m.targetAccountId === account.id
            )
            for (const m of incomingTransfers) {
                balance += m.amount
                totalArsHistorical += m.arsAmount
            }

            const rateHistorical = balance > 0 ? totalArsHistorical / balance : account.openingRate
            const arsHistorical = balance * rateHistorical

            const rateRule = settings.assetRateRule
            const rateCurrent = getRateValue(currentRate, rateRule)
            const arsCurrent = balance * rateCurrent

            return {
                account,
                balance,
                rateHistorical,
                arsHistorical,
                rateCurrent,
                arsCurrent,
            }
        })
    }, [assetAccounts, currentRate, movements, settings])

    const debtSummaries = useMemo(() => {
        if (!settings || !currentRate) return []
        return fxDebts.map(debt => {
            const rateHistorical = debt.rateInicial
            const arsHistorical = debt.saldoME * rateHistorical
            const rateCurrent = getRateValue(currentRate, settings.liabilityRateRule)
            const arsCurrent = debt.saldoME * rateCurrent
            const nextDue = debt.schedule?.find(item => !item.paid)?.dueDate
            return {
                debt,
                rateHistorical,
                arsHistorical,
                rateCurrent,
                arsCurrent,
                nextDue,
            }
        })
    }, [fxDebts, currentRate, settings])

    const kpis = useMemo(() => {
        const totalAssetsUSD = accountValuations.reduce((sum, v) => sum + v.balance, 0)
        const totalLiabilitiesUSD = debtSummaries.reduce((sum, v) => sum + v.debt.saldoME, 0)
        const totalAssetsArs = accountValuations.reduce((sum, v) => sum + v.arsCurrent, 0)
        const totalLiabilitiesArs = debtSummaries.reduce((sum, v) => sum + v.arsCurrent, 0)
        const latentDifference = accountValuations.reduce((sum, v) => sum + (v.arsCurrent - v.arsHistorical), 0)

        return {
            totalAssetsUSD,
            totalLiabilitiesUSD,
            netPositionUSD: totalAssetsUSD - totalLiabilitiesUSD,
            totalAssetsArs,
            totalLiabilitiesArs,
            netPositionArs: totalAssetsArs - totalLiabilitiesArs,
            latentDifference,
        }
    }, [accountValuations, debtSummaries])

    const reconciliationStats = useMemo(() => {
        const desync = movements.filter(m => m.journalStatus === 'desync')
        const ok = movements.filter(m => ['generated', 'linked'].includes(m.journalStatus))
        return { desync, ok }
    }, [movements])

    const refreshReconciliation = useCallback(async () => {
        const result = await getReconciliationData(periodId)
        setReconciliation({
            movementsWithoutEntry: result.movementsWithoutEntry,
            orphanEntries: result.orphanEntries,
        })
    }, [periodId])

    useEffect(() => {
        if (activeTab === 'conciliacion') {
            refreshReconciliation()
        }
    }, [activeTab, refreshReconciliation, movements])

    const handleToggleMode = async () => {
        const next: ValuationMode = valuationMode === 'contable' ? 'gestion' : 'contable'
        setValuationMode(next)
        if (settings) {
            const updated = { ...settings, defaultValuationMode: next }
            setSettings(updated)
            await saveFxSettings(updated)
        }
    }

    const movementSearchOptions = useMemo(() => {
        return movements.filter(m => !['TRANSFERENCIA'].includes(m.type))
    }, [movements])

    const [movementSearch, setMovementSearch] = useState('')

    const filteredMovements = useMemo(() => {
        const query = movementSearch.toLowerCase().trim()
        if (!query) return movementSearchOptions
        return movementSearchOptions.filter(movement => {
            const accountName = accountMap.get(movement.accountId)?.name || ''
            const debtName = movement.debtId ? fxDebts.find(debt => debt.id === movement.debtId)?.name || '' : ''
            return (
                accountName.toLowerCase().includes(query) ||
                debtName.toLowerCase().includes(query) ||
                (movement.reference || '').toLowerCase().includes(query) ||
                (movement.counterparty || '').toLowerCase().includes(query)
            )
        })
    }, [accountMap, fxDebts, movementSearch, movementSearchOptions])

    const conciliationCount = reconciliation.movementsWithoutEntry.length + reconciliation.orphanEntries.length + reconciliationStats.desync.length

    const handleGenerateJournal = async (movementId: string) => {
        try {
            await generateJournalForFxMovement(movementId)
            showToast('Asiento generado', 'success')
            refreshReconciliation()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al generar asiento', 'error')
        }
    }

    const handleLinkEntry = async (movement: FxMovement, entryId: string) => {
        try {
            await linkFxMovementToEntries(movement.id, [entryId])
            showToast('Asiento vinculado', 'success')
            setLinkModalOpen(false)
            refreshReconciliation()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al vincular', 'error')
        }
    }

    const handleMarkNonAccounting = async (movementId: string) => {
        try {
            await markFxMovementAsNonAccounting(movementId)
            showToast('Marcado como no contable', 'success')
            refreshReconciliation()
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Error al actualizar', 'error')
        }
    }

    return (
        <div className="space-y-6">
            {/* Ticker */}
            <div className="flex items-center gap-6 overflow-x-auto rounded-xl bg-slate-900 px-6 py-2 text-xs font-mono text-white">
                {['Oficial', 'Blue', 'MEP', 'CCL', 'Cripto'].map(type => {
                    const quote = getQuote(rates, type as QuoteType)
                    return (
                        <div key={type} className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-slate-300">USD {type.toUpperCase()}:</span>
                            <span className="text-emerald-300">C {quote ? formatRate(quote.compra) : '--'}</span>
                            <span className="text-emerald-300">V {quote ? formatRate(quote.venta) : '--'}</span>
                        </div>
                    )
                })}
            </div>

            {/* Header */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4">
                <div className="flex items-center justify-between text-sm text-slate-500">
                    <button type="button" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900" onClick={() => navigate('/operaciones')}>
                        <ArrowLeft size={14} /> Operaciones
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modo valuación</span>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Contable</span>
                            <button
                                type="button"
                                className={cx(
                                    'relative inline-flex h-6 w-11 items-center rounded-full transition',
                                    valuationMode === 'gestion' ? 'bg-blue-500' : 'bg-slate-200'
                                )}
                                onClick={handleToggleMode}
                            >
                                <span
                                    className={cx(
                                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                                        valuationMode === 'gestion' ? 'translate-x-6' : 'translate-x-1'
                                    )}
                                />
                            </button>
                            <span className={cx('text-xs font-semibold', valuationMode === 'gestion' ? 'text-blue-600' : 'text-slate-400')}>Gestion</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="font-display text-2xl font-bold text-slate-900">Moneda Extranjera</h1>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        {ratesLoading ? 'Actualizando cotizaciones...' : ratesError || `Cotizacion: ${QUOTE_TYPE_LABELS[currentQuoteType]}`}
                        <FxButton variant="ghost" size="sm" onClick={() => fetchRates(true)}>
                            <ArrowsClockwise size={14} />
                        </FxButton>
                    </div>
                </div>
            </div>

            {/* Tabs header */}
            <div className="flex items-end justify-between border-b border-slate-200 pb-2">
                <div className="flex gap-6">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            className={cx(
                                'relative pb-2 text-sm font-medium transition',
                                activeTab === tab.id ? 'text-blue-600 font-semibold' : 'text-slate-500 hover:text-slate-900'
                            )}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            <span
                                className={cx(
                                    'absolute left-0 -bottom-1 h-[2px] w-full origin-left transform bg-blue-500 transition-transform duration-300',
                                    activeTab === tab.id ? 'scale-x-100' : 'scale-x-0'
                                )}
                            />
                        </button>
                    ))}
                </div>
                {activeTab === 'conciliacion' && conciliationCount > 0 && (
                    <FxBadge tone="warning">{conciliationCount} pendientes</FxBadge>
                )}
            </div>

            {/* Tab content */}

            {activeTab === 'dashboard' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="flex items-center justify-between text-sm text-slate-500">
                                Activos ME (Valuado) <TrendUp size={16} className="text-emerald-500" />
                            </div>
                            <div className="font-display text-2xl font-bold text-slate-900">{formatCurrencyARS(kpis.totalAssetsArs)}</div>
                            <div className="text-xs text-slate-400">Origen: {formatCurrencyME(kpis.totalAssetsUSD, 'USD')}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="flex items-center justify-between text-sm text-slate-500">
                                Pasivos ME (Valuado) <TrendDown size={16} className="text-rose-500" />
                            </div>
                            <div className="font-display text-2xl font-bold text-slate-600">{formatCurrencyARS(kpis.totalLiabilitiesArs)}</div>
                            <div className="text-xs text-slate-400">Origen: {formatCurrencyME(kpis.totalLiabilitiesUSD, 'USD')}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <div className="text-sm text-slate-500">Posición Neta</div>
                            <div className="font-display text-2xl font-bold text-blue-600">{formatCurrencyARS(kpis.netPositionArs)}</div>
                            <div className="text-xs text-slate-400">{formatCurrencyME(kpis.netPositionUSD, 'USD')}</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
                            <div className="text-sm text-emerald-700">Res. x Tenencia</div>
                            <div className="font-display text-2xl font-bold text-emerald-600">{formatCurrencyARS(kpis.latentDifference)}</div>
                            <div className="text-xs text-emerald-600">Impacto por valuación</div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:col-span-2">
                            <h3 className="font-display text-lg font-semibold text-slate-900">Evolución de cotización promedio</h3>
                            <div className="mt-4 flex h-52 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
                                [Chart Placeholder]
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                            <h3 className="font-display text-lg font-semibold text-slate-900">Acciones rapidas</h3>
                            <div className="mt-4 flex flex-col gap-3">
                                <FxButton onClick={() => setOperationModalOpen(true)}>
                                    <ArrowsLeftRight size={16} /> Registrar Operación
                                </FxButton>
                                <FxButton variant="secondary" onClick={() => { setActiveTab('activos'); setAssetModalOpen(true) }}>
                                    <Plus size={16} /> Nuevo activo ME
                                </FxButton>
                                <FxButton variant="secondary" onClick={() => { setActiveTab('pasivos'); setDebtModalOpen(true) }}>
                                    <Plus size={16} /> Nueva deuda ME
                                </FxButton>
                                <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                                    <Info size={14} className="inline-block mr-2" /> Todo movimiento ME genera un asiento en ARS.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'activos' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-semibold text-slate-900">Cartera de Activos</h2>
                        <FxButton onClick={() => setAssetModalOpen(true)}>
                            <Plus size={16} /> Agregar cartera
                        </FxButton>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Tipo</th>
                                        <th className="px-4 py-3 text-left">Cartera</th>
                                        <th className="px-4 py-3 text-left">Nombre</th>
                                        <th className="px-4 py-3 text-left">Moneda</th>
                                        <th className="px-4 py-3 text-right">Saldo ME</th>
                                        <th className="px-4 py-3 text-right">TC</th>
                                        <th className="px-4 py-3 text-right">Valuacion ARS</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                        <th className="px-4 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {accountValuations.map(item => {
                                        const ledgerName = item.account.accountId ? ledgerMap.get(item.account.accountId)?.name : 'Sin vinculo'
                                        const hasIssues = movements.some(m => m.accountId === item.account.id && ['missing', 'desync'].includes(m.journalStatus))
                                        return (
                                            <tr key={item.account.id} className="border-t border-slate-200">
                                                <td className="px-4 py-3 font-medium">{ASSET_SUBTYPE_LABELS[item.account.subtype as FxAssetSubtype]}</td>
                                                <td className="px-4 py-3">{item.account.name}</td>
                                                <td className="px-4 py-3 text-slate-500">{ledgerName || 'Sin cuenta'}</td>
                                                <td className="px-4 py-3">
                                                    <FxBadge>{item.account.currency}</FxBadge>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">{formatRate(item.balance)}</td>
                                                <td className="px-4 py-3 text-right font-mono">{formatRate(item.rateHistorical)}</td>
                                                <td className="px-4 py-3 text-right font-mono">{formatCurrencyARS(item.arsHistorical)}</td>
                                                <td className="px-4 py-3 text-center">
                                                    {hasIssues ? <FxBadge tone="warning">Pendiente</FxBadge> : <FxBadge tone="success">Conciliado</FxBadge>}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <FxButton variant="ghost" size="sm"><PencilSimple size={14} /></FxButton>
                                                    <FxButton variant="ghost" size="sm"><Eye size={14} /></FxButton>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {accountValuations.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
                                                No hay activos ME registrados.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'pasivos' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-semibold text-slate-900">Pasivos en M.E.</h2>
                        <FxButton onClick={() => setDebtModalOpen(true)}>
                            <Plus size={16} /> Nueva deuda
                        </FxButton>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Tipo</th>
                                        <th className="px-4 py-3 text-left">Acreedor</th>
                                        <th className="px-4 py-3 text-left">Deuda / Nombre</th>
                                        <th className="px-4 py-3 text-left">Moneda</th>
                                        <th className="px-4 py-3 text-right">Saldo ME</th>
                                        <th className="px-4 py-3 text-right">TC Hist.</th>
                                        <th className="px-4 py-3 text-right">Val. ARS Hist.</th>
                                        <th className="px-4 py-3 text-right">TC Actual</th>
                                        <th className="px-4 py-3 text-right">Val. ARS Actual</th>
                                        <th className="px-4 py-3 text-right">Prox. Venc.</th>
                                        <th className="px-4 py-3 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {debtSummaries.map(item => (
                                        <tr key={item.debt.id} className="border-t border-slate-200">
                                            <td className="px-4 py-3">{LIABILITY_SUBTYPE_LABELS[item.debt.accountId ? (accountMap.get(item.debt.accountId)?.subtype as FxLiabilitySubtype) : 'PRESTAMO']}</td>
                                            <td className="px-4 py-3">{item.debt.creditor}</td>
                                            <td className="px-4 py-3 text-slate-500">{item.debt.name}</td>
                                            <td className="px-4 py-3"><FxBadge>{item.debt.currency}</FxBadge></td>
                                            <td className="px-4 py-3 text-right font-mono">{formatRate(item.debt.saldoME)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatRate(item.rateHistorical)}</td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-400">{formatCurrencyARS(item.arsHistorical)}</td>
                                            <td className="px-4 py-3 text-right font-mono">{formatRate(item.rateCurrent)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrencyARS(item.arsCurrent)}</td>
                                            <td className="px-4 py-3 text-right">{formatDateShort(item.nextDue)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <FxButton
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedDebt(item.debt)
                                                        setPlanModalOpen(true)
                                                    }}
                                                >
                                                    Ver plan
                                                </FxButton>
                                            </td>
                                        </tr>
                                    ))}
                                    {debtSummaries.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="px-4 py-6 text-center text-sm text-slate-500">
                                                No hay deudas ME registradas.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'movimientos' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-semibold text-slate-900">Libro de Movimientos</h2>
                        <FxButton onClick={() => setOperationModalOpen(true)}>
                            <ArrowsLeftRight size={16} /> Registrar Operación
                        </FxButton>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex w-full max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <MagnifyingGlass size={16} className="text-slate-400" />
                            <input
                                className="w-full border-none text-sm focus:outline-none"
                                placeholder="Buscar por detalle..."
                                value={movementSearch}
                                onChange={event => setMovementSearch(event.target.value)}
                            />
                        </div>
                        <FxButton variant="ghost" size="sm"><Funnel size={14} /> Todo el periodo</FxButton>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Fecha</th>
                                        <th className="px-4 py-3 text-left">Tipo</th>
                                        <th className="px-4 py-3 text-left">Cuenta ME</th>
                                        <th className="px-4 py-3 text-left">Detalle</th>
                                        <th className="px-4 py-3 text-right">Monto ME</th>
                                        <th className="px-4 py-3 text-right">TC Op.</th>
                                        <th className="px-4 py-3 text-right">Total ARS</th>
                                        <th className="px-4 py-3 text-right">Asiento</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMovements.map(movement => {
                                        const account = accountMap.get(movement.accountId)
                                        const debt = movement.debtId ? fxDebts.find(d => d.id === movement.debtId) : null
                                        const sign = ['COMPRA', 'INGRESO', 'TOMA_DEUDA', 'DESEMBOLSO_DEUDA'].includes(movement.type) ? '+' : '-'
                                        const amountColor = sign === '+' ? 'text-emerald-600' : 'text-rose-600'
                                        return (
                                            <tr key={movement.id} className="border-t border-slate-200">
                                                <td className="px-4 py-3">{formatDateShort(movement.date)}</td>
                                                <td className="px-4 py-3">
                                                    <FxBadge tone={movement.type === 'COMPRA' ? 'success' : movement.type === 'PAGO_DEUDA' ? 'warning' : 'neutral'}>
                                                        {MOVEMENT_TYPE_LABELS[movement.type as FxMovementType] || movement.type}
                                                    </FxBadge>
                                                </td>
                                                <td className="px-4 py-3">{debt?.name || account?.name || 'N/A'}</td>
                                                <td className="px-4 py-3 text-slate-500">{movement.reference || movement.counterparty || '-'}</td>
                                                <td className={cx('px-4 py-3 text-right font-mono', amountColor)}>
                                                    {sign} {formatRate(movement.amount)}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">{formatRate(movement.rate)}</td>
                                                <td className="px-4 py-3 text-right font-mono">{formatCurrencyARS(movement.arsAmount)}</td>
                                                <td className="px-4 py-3 text-right"><JournalStatusBadge status={movement.journalStatus} /></td>
                                            </tr>
                                        )
                                    })}
                                    {filteredMovements.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                                                No hay movimientos en el periodo.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'conciliacion' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200 space-y-6">
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h2 className="font-display text-xl font-semibold text-slate-900">Centro de Conciliación</h2>
                                <p className="text-sm text-slate-500">Asegura que operaciones ME coincidan con el Libro Diario.</p>
                            </div>
                            <FxButton variant="secondary" onClick={refreshReconciliation}>
                                <MagicWand size={16} /> Conciliar automaticamente
                            </FxButton>
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-2xl border-t-4 border-amber-400 bg-white px-5 py-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">Movimientos sin asiento</h4>
                                <FxBadge tone="warning">{reconciliation.movementsWithoutEntry.length} pendientes</FxBadge>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Operaciones ME sin impacto en Diario.</p>
                            <div className="mt-3 space-y-2">
                                {reconciliation.movementsWithoutEntry.map(item => (
                                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="text-xs font-semibold">{MOVEMENT_TYPE_LABELS[item.type as FxMovementType]} · {formatRate(item.amount)} {item.currency}</div>
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="font-mono text-slate-500">{formatDateShort(item.date)}</span>
                                            <div className="flex gap-2">
                                                <FxButton variant="secondary" size="sm" onClick={() => handleGenerateJournal(item.id)}>Generar</FxButton>
                                                <FxButton variant="ghost" size="sm" onClick={() => { setLinkTargetMovement(item); setLinkModalOpen(true) }}>Vincular</FxButton>
                                                <FxButton variant="ghost" size="sm" onClick={() => handleMarkNonAccounting(item.id)}>No contable</FxButton>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {reconciliation.movementsWithoutEntry.length === 0 && (
                                    <div className="text-xs text-slate-400">Sin pendientes.</div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border-t-4 border-blue-400 bg-white px-5 py-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">Asientos huerfanos</h4>
                                <FxBadge tone="info">{reconciliation.orphanEntries.length} detectados</FxBadge>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Asientos en Diario que usan cuentas ME sin vinculo.</p>
                            <div className="mt-3 space-y-2">
                                {reconciliation.orphanEntries.map(entry => (
                                    <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="text-xs font-semibold">{entry.memo}</div>
                                        <div className="mt-2 flex items-center justify-between text-xs">
                                            <span className="font-mono text-slate-500">{formatDateShort(entry.date)}</span>
                                            <FxButton variant="secondary" size="sm" onClick={() => showToast('Selecciona un movimiento para vincular', 'error')}>Vincular</FxButton>
                                        </div>
                                    </div>
                                ))}
                                {reconciliation.orphanEntries.length === 0 && (
                                    <div className="text-xs text-slate-400">No se detectan asientos huerfanos.</div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-2xl border-t-4 border-emerald-400 bg-white px-5 py-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">Desync / OK</h4>
                                <FxBadge tone={reconciliationStats.desync.length > 0 ? 'warning' : 'success'}>
                                    {reconciliationStats.desync.length > 0 ? `${reconciliationStats.desync.length} desync` : `${reconciliationStats.ok.length} OK`}
                                </FxBadge>
                            </div>
                            <p className="mt-2 text-xs text-slate-500">Movimientos con asiento editado o conciliados.</p>
                            <div className="mt-3 space-y-2">
                                {reconciliationStats.desync.length > 0 ? (
                                    reconciliationStats.desync.map(item => (
                                        <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
                                            {MOVEMENT_TYPE_LABELS[item.type as FxMovementType]} · {formatDateShort(item.date)}
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center gap-2 py-4 text-emerald-600">
                                        <CheckCircle size={32} weight="fill" />
                                        <span className="text-sm font-semibold">Todo en orden</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <FxAssetAccountModalME2
                open={assetModalOpen}
                onClose={() => setAssetModalOpen(false)}
                periodId={periodId}
                rates={rates}
                ledgerAccounts={ledgerAccounts}
                onSuccess={message => showToast(message, 'success')}
            />
            <FxDebtCreateModalME2
                open={debtModalOpen}
                onClose={() => setDebtModalOpen(false)}
                periodId={periodId}
                ledgerAccounts={ledgerAccounts}
                fxAssetAccounts={assetAccounts}
                onSuccess={message => showToast(message, 'success')}
                onOpenAssetModal={() => setAssetModalOpen(true)}
            />
            <FxOperationModalME2
                open={operationModalOpen}
                onClose={() => setOperationModalOpen(false)}
                periodId={periodId}
                settings={settings}
                rates={rates}
                fxAccounts={fxAccounts}
                fxDebts={fxDebts}
                ledgerAccounts={ledgerAccounts}
                onSuccess={message => showToast(message, 'success')}
            />
            <FxDebtPlanModalME2
                open={planModalOpen}
                onClose={() => setPlanModalOpen(false)}
                debt={selectedDebt}
            />
            <LinkEntryModal
                open={linkModalOpen}
                onClose={() => setLinkModalOpen(false)}
                movement={linkTargetMovement}
                entries={reconciliation.orphanEntries.map((entry: any) => ({
                    id: entry.id,
                    memo: entry.memo,
                    date: entry.date,
                    total: entry.lines?.reduce((sum: number, line: any) => sum + line.debit + line.credit, 0) / 2,
                }))}
                onLink={entryId => linkTargetMovement && handleLinkEntry(linkTargetMovement, entryId)}
            />

            {toast && (
                <div className={cx(
                    'fixed bottom-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg',
                    toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                )}>
                    {toast.message}
                </div>
            )}
        </div>
    )
}



