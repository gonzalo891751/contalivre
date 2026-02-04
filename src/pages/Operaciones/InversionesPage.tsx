/**
 * Inversiones Page
 *
 * Investment management module following prototype docs/prototypes/Inversiones.html
 * Supports: Acciones/CEDEARs, Bonos, FCI, Plazos Fijos, Cripto, Rentas, VPP
 */

import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    ArrowLeft,
    ArrowsClockwise,
    FilePdf,
    ChartBar,
    Scroll,
    ChartPieSlice,
    Bank,
    CurrencyBtc,
    HouseLine,
    Buildings,
    CaretDown,
    CaretRight,
    Plus,
    CheckCircle,
    Warning,
    Clock,
    Info,
    X,
} from '@phosphor-icons/react'
import { db } from '../../storage/db'
import { usePeriodYear } from '../../hooks/usePeriodYear'
import {
    type InvestmentRubro,
    type InvestmentMovementType,
    type InvestmentInstrument,
    type InvestmentMovement,
    type JournalPreview,
    type InstrumentPosition,
    type RubroSummary,
    RUBRO_LABELS,
    MOVEMENT_TYPE_LABELS,
    getMovementTypesForRubro,
    calculateTEA,
    calculatePFInterest,
} from '../../core/inversiones/types'
import {
    getAllInstruments,
    getAllMovements,
    calculateRubroSummary,
    createInstrument,
    createMovement,
    buildJournalPreview,
    createJournalEntryFromMovement,
    loadInvestmentSettings,
    syncFromCierreValuacion,
    checkPFMaturityNotifications,
    getInvestmentNotifications,
    dismissNotification,
} from '../../storage/inversiones'

// ============================================
// Constants
// ============================================

const RUBROS: InvestmentRubro[] = ['ACCIONES', 'BONOS', 'FCI', 'PLAZO_FIJO', 'CRIPTO', 'RENTAS', 'VPP']

const RUBRO_ICONS: Record<InvestmentRubro, typeof ChartBar> = {
    ACCIONES: ChartBar,
    BONOS: Scroll,
    FCI: ChartPieSlice,
    PLAZO_FIJO: Bank,
    CRIPTO: CurrencyBtc,
    RENTAS: HouseLine,
    VPP: Buildings,
}

const RUBRO_COLORS: Record<InvestmentRubro, { bg: string; text: string; border: string }> = {
    ACCIONES: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    BONOS: { bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200' },
    FCI: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
    PLAZO_FIJO: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    CRIPTO: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    RENTAS: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    VPP: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
}

// ============================================
// Helpers
// ============================================

const formatCurrency = (value: number, currency: string = 'ARS'): string => {
    if (currency === 'USD' || currency === 'USDT') {
        return `USD ${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const formatPercent = (value: number): string => {
    return `${value.toFixed(1)}%`
}

const formatDate = (date: string): string => {
    if (!date) return '—'
    const [year, month, day] = date.split('-')
    return `${day}/${month}/${year.slice(2)}`
}

// ============================================
// Main Component
// ============================================

export default function InversionesPage() {
    const navigate = useNavigate()
    const { year: periodYear } = usePeriodYear()
    const periodId = String(periodYear)

    // State
    const [expandedRubros, setExpandedRubros] = useState<Set<InvestmentRubro>>(new Set())
    const [wizardOpen, setWizardOpen] = useState(false)
    const [wizardStep, setWizardStep] = useState(1)
    const [wizardRubro, setWizardRubro] = useState<InvestmentRubro>('ACCIONES')
    const [wizardType, setWizardType] = useState<InvestmentMovementType | null>(null)
    const [wizardForm, setWizardForm] = useState<Record<string, unknown>>({})
    const [wizardPreview, setWizardPreview] = useState<JournalPreview | null>(null)
    const [wizardError, setWizardError] = useState<string | null>(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncMessage, setSyncMessage] = useState<string | null>(null)

    // Data queries
    const instruments = useLiveQuery(() => getAllInstruments(periodId), [periodId])
    const movements = useLiveQuery(() => getAllMovements(periodId), [periodId])
    const accounts = useLiveQuery(() => db.accounts.toArray(), [])
    const settings = useLiveQuery(() => loadInvestmentSettings(), [])
    const notifications = useLiveQuery(() => getInvestmentNotifications(), [])

    // Calculate summaries for each rubro
    const rubroSummaries = useLiveQuery(async () => {
        const summaries: Record<InvestmentRubro, RubroSummary> = {} as Record<InvestmentRubro, RubroSummary>
        for (const rubro of RUBROS) {
            summaries[rubro] = await calculateRubroSummary(rubro, periodId)
        }
        return summaries
    }, [periodId, instruments, movements])

    // Total metrics
    const totalMetrics = useMemo(() => {
        if (!rubroSummaries) return { totalValue: 0, totalGainLoss: 0, pendingCount: 0 }

        let totalValue = 0
        let totalGainLoss = 0
        let pendingCount = 0

        for (const summary of Object.values(rubroSummaries)) {
            totalValue += summary.totalValue
            totalGainLoss += summary.unrealizedGainLoss + summary.realizedGainLoss
            pendingCount += summary.pendingValuations
        }

        return { totalValue, totalGainLoss, pendingCount }
    }, [rubroSummaries])

    // Active notifications
    const activeNotifications = useMemo(() => {
        return notifications?.filter(n => !n.dismissed) || []
    }, [notifications])

    // Handlers
    const toggleRubro = useCallback((rubro: InvestmentRubro) => {
        setExpandedRubros(prev => {
            const next = new Set(prev)
            if (next.has(rubro)) {
                next.delete(rubro)
            } else {
                next.add(rubro)
            }
            return next
        })
    }, [])

    const handleSync = useCallback(async () => {
        setIsSyncing(true)
        setSyncMessage(null)
        try {
            const result = await syncFromCierreValuacion()
            await checkPFMaturityNotifications(periodId)
            setSyncMessage(result.synced > 0
                ? `Sincronizados ${result.synced} instrumentos`
                : 'Sin nuevos datos para sincronizar')
        } catch (err) {
            setSyncMessage('Error al sincronizar')
        } finally {
            setIsSyncing(false)
            setTimeout(() => setSyncMessage(null), 3000)
        }
    }, [periodId])

    const handlePrint = useCallback(() => {
        window.print()
    }, [])

    const openWizard = useCallback((rubro: InvestmentRubro, preselectedType?: InvestmentMovementType) => {
        setWizardRubro(rubro)
        setWizardType(preselectedType || null)
        setWizardStep(preselectedType ? 2 : 1)
        setWizardForm({
            date: new Date().toISOString().split('T')[0],
            rubro,
        })
        setWizardPreview(null)
        setWizardError(null)
        setWizardOpen(true)
    }, [])

    const closeWizard = useCallback(() => {
        setWizardOpen(false)
        setWizardStep(1)
        setWizardType(null)
        setWizardForm({})
        setWizardPreview(null)
        setWizardError(null)
    }, [])

    const handleWizardNext = useCallback(async () => {
        setWizardError(null)

        if (wizardStep === 1) {
            if (!wizardType) {
                setWizardError('Selecciona un tipo de operacion')
                return
            }
            setWizardStep(2)
            return
        }

        if (wizardStep === 2) {
            // Validate form and build preview
            try {
                const form = wizardForm

                // Find or create instrument
                let instrument: InvestmentInstrument | undefined

                if (form.instrumentId && typeof form.instrumentId === 'string') {
                    instrument = instruments?.find(i => i.id === form.instrumentId)
                } else if (form.newInstrument && wizardType) {
                    // Create new instrument
                    const newInstr = await createInstrument({
                        periodId,
                        rubro: wizardRubro,
                        ticker: (form.ticker as string) || '',
                        name: (form.instrumentName as string) || (form.ticker as string) || '',
                        currency: (form.currency as 'ARS' | 'USD') || 'ARS',
                        costMethod: 'PPP',
                        ivaComision: true,
                        pfBankName: form.pfBank as string,
                        pfTna: form.pfTna as number,
                        pfDays: form.pfDays as number,
                        vppCompanyName: form.vppCompany as string,
                        vppPercentage: form.vppPercentage as number,
                        rentaPropertyName: form.rentaProperty as string,
                    })
                    instrument = newInstr
                    setWizardForm(prev => ({ ...prev, instrumentId: newInstr.id }))
                }

                // Build movement data
                const movementData: Omit<InvestmentMovement, 'id' | 'createdAt' | 'updatedAt'> = {
                    periodId,
                    date: (form.date as string) || new Date().toISOString().split('T')[0],
                    rubro: wizardRubro,
                    type: wizardType!,
                    instrumentId: instrument?.id,
                    quantity: form.quantity as number,
                    price: form.price as number,
                    amount: ((form.quantity as number) || 1) * ((form.price as number) || (form.amount as number) || 0),
                    fees: form.fees as number,
                    feesIva: (form.feesIva as boolean) ? ((form.fees as number) || 0) * 0.21 : 0,
                    contraAccountId: form.contraAccountId as string,
                    pfCapital: form.pfCapital as number,
                    pfTna: form.pfTna as number,
                    pfTea: form.pfTna ? calculateTEA(form.pfTna as number, (form.pfDays as number) || 30) : undefined,
                    pfStartDate: form.pfStartDate as string,
                    pfEndDate: form.pfEndDate as string,
                    pfDays: form.pfDays as number,
                    pfInterestExpected: form.pfCapital && form.pfTna && form.pfDays
                        ? calculatePFInterest(form.pfCapital as number, form.pfTna as number, form.pfDays as number)
                        : undefined,
                    vppPnBase: form.vppPnBase as number,
                    vppCarryingValue: form.vppPercentage && form.vppPnBase
                        ? ((form.vppPercentage as number) / 100) * (form.vppPnBase as number)
                        : undefined,
                    valuationPrice: form.valuationPrice as number,
                    valuationTc: form.valuationTc as number,
                    notes: form.notes as string,
                }

                // Handle amount calculation for different types
                if (wizardType === 'PF_CONSTITUTE') {
                    movementData.amount = form.pfCapital as number
                } else if (wizardType === 'VPP_ALTA') {
                    movementData.amount = form.amount as number || 0
                } else if (wizardType === 'INCOME') {
                    movementData.amount = form.amount as number || 0
                }

                // Build journal preview
                const preview = await buildJournalPreview(movementData, instrument)

                if (preview.error) {
                    setWizardError(preview.error)
                    return
                }

                setWizardPreview(preview)
                setWizardForm(prev => ({ ...prev, _movementData: movementData }))
                setWizardStep(3)
            } catch (err) {
                setWizardError(err instanceof Error ? err.message : 'Error al generar vista previa')
            }
            return
        }

        if (wizardStep === 3) {
            // Confirm and create
            try {
                const movementData = wizardForm._movementData as Omit<InvestmentMovement, 'id' | 'createdAt' | 'updatedAt'>
                const movement = await createMovement(movementData)

                if (wizardPreview && wizardPreview.isBalanced) {
                    await createJournalEntryFromMovement(movement.id, wizardPreview)
                }

                closeWizard()
            } catch (err) {
                setWizardError(err instanceof Error ? err.message : 'Error al confirmar operacion')
            }
        }
    }, [wizardStep, wizardType, wizardForm, wizardRubro, wizardPreview, instruments, periodId, closeWizard])

    const handleWizardBack = useCallback(() => {
        if (wizardStep === 1) {
            closeWizard()
        } else {
            setWizardStep(prev => prev - 1)
        }
    }, [wizardStep, closeWizard])

    // Render helpers
    const renderRubroCard = (rubro: InvestmentRubro) => {
        const summary = rubroSummaries?.[rubro]
        const Icon = RUBRO_ICONS[rubro]
        const colors = RUBRO_COLORS[rubro]

        const hasWarning = summary?.status === 'warning' || summary?.status === 'error'

        return (
            <div
                key={rubro}
                className={`bg-white rounded-xl border ${hasWarning ? 'border-amber-300' : 'border-slate-200'} p-5 flex flex-col hover:shadow-md hover:border-blue-400 transition-all`}
            >
                <div className="flex justify-between items-start mb-3">
                    <div className={`w-10 h-10 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center`}>
                        <Icon weight="duotone" size={24} />
                    </div>
                    {hasWarning ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200">
                            {summary?.statusMessage || 'Pendiente'}
                        </span>
                    ) : summary && summary.instrumentCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100">
                            Activo
                        </span>
                    ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">
                            Vacio
                        </span>
                    )}
                </div>

                <h4 className="font-display font-semibold text-slate-900 mb-3">{RUBRO_LABELS[rubro]}</h4>

                <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">
                        {rubro === 'PLAZO_FIJO' ? 'Capital + Interes' : 'Valor Actual'}
                    </div>
                    <div className="font-mono font-bold text-lg text-slate-900">
                        {summary ? formatCurrency(summary.totalValue) : '—'}
                    </div>
                </div>

                <div className="flex justify-between text-xs border-t border-dashed border-slate-200 pt-2 mb-4">
                    <span className="text-slate-500">
                        {rubro === 'PLAZO_FIJO' ? 'A Devengar' : 'Tenencia (NR)'}
                    </span>
                    <span className={`font-mono ${summary && summary.unrealizedGainLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {summary ? (summary.unrealizedGainLoss >= 0 ? '+' : '') + formatCurrency(summary.unrealizedGainLoss) : '—'}
                    </span>
                </div>

                <div className="mt-auto flex gap-2">
                    <button
                        className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-lg text-sm font-medium transition-colors"
                        onClick={() => openWizard(rubro)}
                    >
                        Gestionar
                    </button>
                    <button
                        className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                        onClick={() => toggleRubro(rubro)}
                    >
                        <CaretDown size={16} weight="bold" className={`transition-transform ${expandedRubros.has(rubro) ? 'rotate-180' : ''}`} />
                    </button>
                </div>
            </div>
        )
    }

    const renderAccordion = (rubro: InvestmentRubro) => {
        if (!expandedRubros.has(rubro)) return null

        const summary = rubroSummaries?.[rubro]
        const positions = summary?.positions || []

        return (
            <div key={`acc-${rubro}`} className="bg-white rounded-xl border border-slate-200 mb-4 overflow-hidden print:break-inside-avoid">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <span className="font-semibold text-slate-900 flex items-center gap-2">
                        <CaretDown size={14} weight="fill" />
                        Detalle: {RUBRO_LABELS[rubro]}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                        {positions.length} Posicion(es)
                    </span>
                </div>

                <div className="overflow-x-auto">
                    {positions.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            <Info size={32} className="mx-auto mb-2 text-slate-300" />
                            <p>Sin posiciones en este rubro</p>
                            <button
                                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                                onClick={() => openWizard(rubro)}
                            >
                                <Plus size={14} className="inline mr-1" /> Agregar
                            </button>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Cuenta</th>
                                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Especie</th>
                                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Cant.</th>
                                    <th className="text-right px-4 py-2 font-semibold text-slate-600">PPP</th>
                                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Actual</th>
                                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Total</th>
                                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Tenencia</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map((pos: InstrumentPosition) => (
                                    <tr key={pos.instrument.id} className="border-t border-slate-100 hover:bg-slate-50">
                                        <td className="px-4 py-2 text-xs text-slate-500">{pos.instrument.accountCode || '—'}</td>
                                        <td className="px-4 py-2 font-semibold">{pos.instrument.ticker || pos.instrument.name}</td>
                                        <td className="px-4 py-2 text-right font-mono">{pos.currentQuantity.toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right font-mono">{formatCurrency(pos.averageCost, pos.instrument.currency)}</td>
                                        <td className="px-4 py-2 text-right font-mono">{pos.currentPrice ? formatCurrency(pos.currentPrice, pos.instrument.currency) : '—'}</td>
                                        <td className="px-4 py-2 text-right font-mono font-semibold">{formatCurrency(pos.currentValue || pos.totalCost, pos.instrument.currency)}</td>
                                        <td className={`px-4 py-2 text-right font-mono ${pos.unrealizedGainLoss && pos.unrealizedGainLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {pos.unrealizedGainLoss !== undefined ? (pos.unrealizedGainLoss >= 0 ? '+' : '') + formatCurrency(pos.unrealizedGainLoss, pos.instrument.currency) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        )
    }

    // Render wizard modal
    const renderWizard = () => {
        if (!wizardOpen) return null

        const movementTypes = getMovementTypesForRubro(wizardRubro)
        const bankAccounts = accounts?.filter(a => a.statementGroup === 'CASH_AND_BANKS' && !a.isHeader) || []
        const rubroInstruments = instruments?.filter(i => i.rubro === wizardRubro) || []

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm print:hidden">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-display font-semibold text-lg">Nuevo Movimiento: {RUBRO_LABELS[wizardRubro]}</h3>
                        <button onClick={closeWizard} className="text-slate-400 hover:text-slate-600">
                            <X size={20} weight="bold" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {/* Step indicator */}
                        <div className="flex gap-2 mb-6">
                            {[1, 2, 3].map(step => (
                                <div
                                    key={step}
                                    className={`flex-1 h-1 rounded-full ${wizardStep >= step ? 'bg-blue-500' : 'bg-slate-200'}`}
                                />
                            ))}
                        </div>

                        {/* Step 1: Type selection */}
                        {wizardStep === 1 && (
                            <div>
                                <p className="text-sm text-slate-600 mb-4 font-medium">Selecciona el tipo de operacion:</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {movementTypes.map(type => (
                                        <button
                                            key={type}
                                            className={`p-4 rounded-xl border text-left transition-all ${
                                                wizardType === type
                                                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                                                    : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                                            }`}
                                            onClick={() => setWizardType(type)}
                                        >
                                            <div className="font-semibold text-slate-900">{MOVEMENT_TYPE_LABELS[type]}</div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {type === 'BUY' && 'Alta de activos'}
                                                {type === 'SELL' && 'Baja y resultado'}
                                                {type === 'INCOME' && 'Cobro de renta'}
                                                {type === 'VALUATION' && 'Ajuste tenencia'}
                                                {type === 'OPENING' && 'Saldo inicial'}
                                                {type === 'PF_CONSTITUTE' && 'Alta plazo fijo'}
                                                {type === 'PF_MATURITY' && 'Capital + interes'}
                                                {type === 'PF_RENEW' && 'Reinversion'}
                                                {type === 'VPP_ALTA' && 'Compra inicial'}
                                                {type === 'VPP_UPDATE' && 'Ajuste por PN'}
                                                {type === 'VPP_DIVIDEND' && 'Cobro dividendo'}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Form */}
                        {wizardStep === 2 && (
                            <div className="space-y-4">
                                {/* Common fields */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Fecha</label>
                                        <input
                                            type="date"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            value={(wizardForm.date as string) || ''}
                                            onChange={e => setWizardForm(prev => ({ ...prev, date: e.target.value }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Rubro</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                                            value={RUBRO_LABELS[wizardRubro]}
                                            readOnly
                                        />
                                    </div>
                                </div>

                                {/* Type-specific fields */}
                                {(wizardType === 'BUY' || wizardType === 'SELL' || wizardType === 'OPENING' || wizardType === 'VALUATION') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">Instrumento</label>
                                                <select
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                    value={(wizardForm.instrumentId as string) || ''}
                                                    onChange={e => {
                                                        if (e.target.value === '__new__') {
                                                            setWizardForm(prev => ({ ...prev, instrumentId: '', newInstrument: true }))
                                                        } else {
                                                            setWizardForm(prev => ({ ...prev, instrumentId: e.target.value, newInstrument: false }))
                                                        }
                                                    }}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {rubroInstruments.map(i => (
                                                        <option key={i.id} value={i.id}>{i.ticker} - {i.name}</option>
                                                    ))}
                                                    <option value="__new__">+ Crear Nuevo</option>
                                                </select>
                                            </div>
                                            {Boolean(wizardForm.newInstrument) && (
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-600 mb-1">Ticker</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                        placeholder="Ej: AAPL"
                                                        value={(wizardForm.ticker as string) || ''}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, ticker: e.target.value }))}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {wizardType !== 'VALUATION' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-600 mb-1">Cantidad</label>
                                                    <input
                                                        type="number"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                        value={(wizardForm.quantity as number) || ''}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-600 mb-1">Precio Unitario</label>
                                                    <input
                                                        type="number"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                        value={(wizardForm.price as number) || ''}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {wizardType === 'VALUATION' && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-600 mb-1">Precio Cierre</label>
                                                    <input
                                                        type="number"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                        value={(wizardForm.valuationPrice as number) || ''}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, valuationPrice: parseFloat(e.target.value) || 0 }))}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-600 mb-1">Tipo Cambio (si USD)</label>
                                                    <input
                                                        type="number"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                        value={(wizardForm.valuationTc as number) || ''}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, valuationTc: parseFloat(e.target.value) || 0 }))}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {wizardType === 'BUY' && (
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-sm font-medium text-slate-600 mb-1">Comisiones</label>
                                                    <input
                                                        type="number"
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                        value={(wizardForm.fees as number) || ''}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, fees: parseFloat(e.target.value) || 0 }))}
                                                    />
                                                </div>
                                                <label className="flex items-center gap-2 mt-6">
                                                    <input
                                                        type="checkbox"
                                                        checked={(wizardForm.feesIva as boolean) ?? true}
                                                        onChange={e => setWizardForm(prev => ({ ...prev, feesIva: e.target.checked }))}
                                                    />
                                                    <span className="text-sm text-slate-600">Aplica IVA (21%)</span>
                                                </label>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Plazo Fijo fields */}
                                {(wizardType === 'PF_CONSTITUTE' || wizardType === 'PF_MATURITY') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">Entidad Bancaria</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                    placeholder="Ej: Banco Galicia"
                                                    value={(wizardForm.pfBank as string) || ''}
                                                    onChange={e => setWizardForm(prev => ({ ...prev, pfBank: e.target.value, newInstrument: true, ticker: e.target.value }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">Capital</label>
                                                <input
                                                    type="number"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                    value={(wizardForm.pfCapital as number) || ''}
                                                    onChange={e => setWizardForm(prev => ({ ...prev, pfCapital: parseFloat(e.target.value) || 0 }))}
                                                />
                                            </div>
                                        </div>
                                        {wizardType === 'PF_CONSTITUTE' && (
                                            <>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-600 mb-1">Plazo (dias)</label>
                                                        <input
                                                            type="number"
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                            value={(wizardForm.pfDays as number) || ''}
                                                            onChange={e => setWizardForm(prev => ({ ...prev, pfDays: parseInt(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-600 mb-1">TNA %</label>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                            value={(wizardForm.pfTna as number) || ''}
                                                            onChange={e => setWizardForm(prev => ({ ...prev, pfTna: parseFloat(e.target.value) || 0 }))}
                                                        />
                                                    </div>
                                                </div>
                                                {Boolean(wizardForm.pfCapital && wizardForm.pfTna && wizardForm.pfDays) && (
                                                    <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
                                                        <strong>Interes estimado:</strong> {formatCurrency(calculatePFInterest(
                                                            wizardForm.pfCapital as number,
                                                            wizardForm.pfTna as number,
                                                            wizardForm.pfDays as number
                                                        ))} (TEA {formatPercent(calculateTEA(wizardForm.pfTna as number, wizardForm.pfDays as number))})
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}

                                {/* VPP fields */}
                                {(wizardType === 'VPP_ALTA' || wizardType === 'VPP_UPDATE') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">Empresa Participada</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                    value={(wizardForm.vppCompany as string) || ''}
                                                    onChange={e => setWizardForm(prev => ({ ...prev, vppCompany: e.target.value, newInstrument: true, ticker: e.target.value }))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">% Participacion</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                    value={(wizardForm.vppPercentage as number) || ''}
                                                    onChange={e => setWizardForm(prev => ({ ...prev, vppPercentage: parseFloat(e.target.value) || 0 }))}
                                                />
                                            </div>
                                        </div>
                                        {wizardType === 'VPP_ALTA' && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">Monto Inversion</label>
                                                <input
                                                    type="number"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                    value={(wizardForm.amount as number) || ''}
                                                    onChange={e => setWizardForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                                />
                                            </div>
                                        )}
                                        {wizardType === 'VPP_UPDATE' && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-600 mb-1">PN Total al Cierre</label>
                                                <input
                                                    type="number"
                                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                                    value={(wizardForm.vppPnBase as number) || ''}
                                                    onChange={e => setWizardForm(prev => ({ ...prev, vppPnBase: parseFloat(e.target.value) || 0 }))}
                                                />
                                            </div>
                                        )}
                                        {Boolean(wizardForm.vppPercentage && wizardForm.vppPnBase) && (
                                            <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">
                                                <strong>VPP Resultante:</strong> {formatCurrency(
                                                    ((wizardForm.vppPercentage as number) / 100) * (wizardForm.vppPnBase as number)
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Income fields */}
                                {wizardType === 'INCOME' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Monto Cobrado</label>
                                        <input
                                            type="number"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                                            value={(wizardForm.amount as number) || ''}
                                            onChange={e => setWizardForm(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))}
                                        />
                                    </div>
                                )}

                                {/* Contrapartida (common for most types) */}
                                {wizardType !== 'OPENING' && (
                                    <div className="pt-4 border-t border-dashed border-slate-200">
                                        <label className="block text-sm font-medium text-slate-600 mb-1">Cuenta Contrapartida / Origen Fondos</label>
                                        <select
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            value={(wizardForm.contraAccountId as string) || ''}
                                            onChange={e => setWizardForm(prev => ({ ...prev, contraAccountId: e.target.value }))}
                                        >
                                            <option value="">Seleccionar cuenta...</option>
                                            {bankAccounts.map(a => (
                                                <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Preview */}
                        {wizardStep === 3 && wizardPreview && (
                            <div>
                                <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm mb-4">
                                    <CheckCircle size={18} weight="fill" />
                                    Asiento generado automaticamente. Revisa antes de confirmar.
                                </div>

                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-800 text-white">
                                                <th className="text-left px-4 py-2 font-medium">Cuenta Contable</th>
                                                <th className="text-right px-4 py-2 font-medium">Debe</th>
                                                <th className="text-right px-4 py-2 font-medium">Haber</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {wizardPreview.lines.map((line, idx) => (
                                                <tr key={idx} className="border-t border-slate-100">
                                                    <td className="px-4 py-2">
                                                        <span className="text-xs text-slate-500">{line.accountCode}</span>{' '}
                                                        {line.accountName}
                                                        {line.description && (
                                                            <span className="block text-xs text-slate-400">{line.description}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono">
                                                        {line.debit > 0 ? formatCurrency(line.debit) : ''}
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono">
                                                        {line.credit > 0 ? formatCurrency(line.credit) : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-50 font-bold">
                                                <td className="px-4 py-2">TOTALES</td>
                                                <td className="px-4 py-2 text-right font-mono">{formatCurrency(wizardPreview.totalDebit)}</td>
                                                <td className="px-4 py-2 text-right font-mono">{formatCurrency(wizardPreview.totalCredit)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>

                                {!wizardPreview.isBalanced && (
                                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                        <Warning size={16} className="inline mr-1" />
                                        El asiento no esta balanceado. Revisa los montos.
                                    </div>
                                )}

                                {wizardPreview.warning && (
                                    <div className="mt-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                                        <Warning size={16} className="inline mr-1" />
                                        {wizardPreview.warning}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error display */}
                        {wizardError && (
                            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                <Warning size={16} className="inline mr-1" />
                                {wizardError}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                        <button
                            className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100"
                            onClick={handleWizardBack}
                        >
                            {wizardStep === 1 ? 'Cancelar' : 'Atras'}
                        </button>
                        <button
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-lg font-medium hover:from-blue-500 hover:to-emerald-400 flex items-center gap-2"
                            onClick={handleWizardNext}
                        >
                            {wizardStep === 3 ? 'Confirmar Asiento' : 'Siguiente'}
                            <CaretRight size={16} weight="bold" />
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Main render
    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-6 scroll-smooth bg-slate-50">
            {/* Breadcrumb */}
            <div className="print:hidden">
                <button
                    className="text-slate-500 hover:text-slate-900 flex items-center gap-2 text-sm"
                    onClick={() => navigate('/operaciones')}
                >
                    <ArrowLeft size={16} /> Volver al Panel
                </button>
            </div>

            {/* Header */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="font-display font-bold text-2xl text-slate-900 mb-2">Cartera de Inversiones</h1>
                    <p className="text-slate-500 max-w-xl">
                        Gestion integral de cartera propia. Plazos fijos, Acciones, Cripto y VPP.
                    </p>
                </div>
                <div className="flex gap-2 print:hidden">
                    <button
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={handleSync}
                        disabled={isSyncing}
                    >
                        <ArrowsClockwise size={16} className={isSyncing ? 'animate-spin' : ''} />
                        {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                    <button
                        className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        onClick={handlePrint}
                    >
                        <FilePdf size={16} /> Reporte PDF
                    </button>
                </div>
            </div>

            {/* Integration Panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-center print:hidden">
                <div>
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Ultima Sincronizacion</div>
                    <div className="font-medium flex items-center gap-2">
                        {settings?.lastSyncDate ? formatDate(settings.lastSyncDate.split('T')[0]) : 'Nunca'}
                        {syncMessage && <span className="text-xs text-blue-600">{syncMessage}</span>}
                    </div>
                </div>
                <div>
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Valuacion Contable</div>
                    <div className="font-medium flex items-center gap-2">
                        {settings?.lastSyncStatus === 'ok' ? (
                            <>
                                <CheckCircle size={16} className="text-emerald-500" weight="fill" />
                                <span className="text-emerald-600">Cierre OK</span>
                            </>
                        ) : (
                            <span className="text-slate-600">Pendiente</span>
                        )}
                    </div>
                </div>
                <div>
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Pendientes</div>
                    <div className={`font-medium ${totalMetrics.pendingCount > 0 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {totalMetrics.pendingCount > 0 ? `${totalMetrics.pendingCount} Rubros` : 'Ninguno'}
                    </div>
                </div>
                <div className="text-right">
                    <button className="text-sm text-blue-600 hover:underline">Ver Auditoria</button>
                </div>
            </div>

            {/* Alert Panel */}
            {activeNotifications.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 print:hidden">
                    <h4 className="text-sm font-bold text-amber-800 mb-3">Alertas & Vencimientos</h4>
                    <div className="space-y-2">
                        {activeNotifications.slice(0, 3).map(notif => (
                            <div key={notif.id} className="flex justify-between items-center bg-white/50 p-2 rounded-lg">
                                <div className="flex items-center gap-2">
                                    {notif.type === 'PF_MATURITY' && <Clock size={16} className="text-amber-600" weight="bold" />}
                                    {notif.type === 'VALUATION_PENDING' && <Warning size={16} className="text-red-500" weight="bold" />}
                                    <div>
                                        <strong className="text-amber-900">{notif.title}</strong>
                                        <span className="text-amber-700 ml-2">{notif.description}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="px-3 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200"
                                        onClick={() => notif.instrumentId && openWizard(
                                            instruments?.find(i => i.id === notif.instrumentId)?.rubro || 'PLAZO_FIJO',
                                            notif.type === 'PF_MATURITY' ? 'PF_MATURITY' : undefined
                                        )}
                                    >
                                        Resolver
                                    </button>
                                    <button
                                        className="px-2 py-1 text-amber-600 hover:text-amber-800"
                                        onClick={() => dismissNotification(notif.id)}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* KPI Strip */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:grid-cols-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Valor Total Cartera</div>
                    <div className="font-mono text-2xl font-bold text-slate-900">{formatCurrency(totalMetrics.totalValue)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Resultado Total</div>
                    <div className={`font-mono text-2xl font-bold ${totalMetrics.totalGainLoss >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {totalMetrics.totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalMetrics.totalGainLoss)}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Instrumentos Activos</div>
                    <div className="font-mono text-2xl font-bold text-slate-900">{instruments?.length || 0}</div>
                </div>
            </div>

            {/* Rubro Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {RUBROS.map(renderRubroCard)}
            </div>

            {/* Accordion Details */}
            <div className="space-y-4">
                {RUBROS.map(renderAccordion)}
            </div>

            {/* Wizard Modal */}
            {renderWizard()}

            {/* Print Styles */}
            <style>{`
                @media print {
                    body { background: white; }
                    .print\\:hidden { display: none !important; }
                    .print\\:break-inside-avoid { break-inside: avoid; }
                    .print\\:grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
                }
            `}</style>
        </div>
    )
}
