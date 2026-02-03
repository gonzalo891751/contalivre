/**
 * ImpuestosPage - Tax Management Module
 *
 * Pixel-perfect implementation based on docs/prototypes/IMPUESTOS.html
 * Manages IVA (RI/MT), IIBB, Retenciones/Percepciones, and tax due dates.
 */

import { useState, useEffect, useCallback, useMemo, useRef, Component, type ReactNode, type ErrorInfo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
    Calculator,
    Receipt,
    Clock,
    Notebook,
    Check,
    LockKey,
    Info,
    MagicWand,
    Copy,
    CheckCircle,
    ShieldCheck,
    CalendarCheck,
    CalendarBlank,
    CaretDown,
    CaretLeft,
    CaretRight,
    Plus,
    WarningCircle,
    ArrowLeft,
    ArrowClockwise,
} from '@phosphor-icons/react'
import { useTaxClosure } from '../../hooks/useTaxClosure'
import { useTaxNotifications } from '../../hooks/useTaxNotifications'
import { db } from '../../storage/db'
import { repairTaxAccounts } from '../../storage'
import { listAllTaxClosures, getTaxClosure } from '../../storage/impuestos'
import { getLocalDateISO } from '../../storage/entries'
import type {
    TaxRegime,
    TaxClosureSteps,
    IVAAlicuotaDetail,
    RetencionPercepcionRow,
    DueDateCard,
    AutonomosSettings,
    TaxClosePeriod,
    TaxSettlementObligation,
    TaxPaymentMethod,
    TaxPaymentLink,
} from '../../core/impuestos/types'
import { formatCurrency, formatMonth } from '../../core/impuestos/types'
import type { Account, JournalEntry } from '../../core/models'
import type { RegisterTaxPaymentInput, TaxPaymentPreviewResult } from '../../storage/impuestos'

// ========================================
// Error Boundary for Impuestos Module
// ========================================

interface ErrorBoundaryProps {
    children: ReactNode
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

class ImpuestosErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ImpuestosPage Error:', error, errorInfo)
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null })
    }

    handleClearStorage = async () => {
        try {
            // Only clear tax-related tables, not entire database
            await db.taxClosures.clear()
            await db.taxDueNotifications.clear()
            await db.taxObligations.clear()
            await db.taxPayments.clear()
            this.setState({ hasError: false, error: null })
            window.location.reload()
        } catch (e) {
            console.error('Error clearing tax storage:', e)
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
                    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md w-full text-center">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <WarningCircle size={32} weight="duotone" className="text-red-500" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Error en Modulo Impuestos</h2>
                        <p className="text-sm text-slate-500 mb-6">
                            Hubo un problema al cargar el modulo. Esto puede deberse a datos corruptos en el almacenamiento local.
                        </p>
                        {this.state.error && (
                            <div className="bg-slate-50 rounded-lg p-3 mb-6 text-left">
                                <p className="text-xs font-mono text-red-600 break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={this.handleRetry}
                                className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
                            >
                                <ArrowClockwise size={16} weight="bold" />
                                Reintentar
                            </button>
                            <button
                                onClick={this.handleClearStorage}
                                className="w-full py-2.5 px-4 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-50 transition-colors"
                            >
                                Reparar Almacenamiento de Impuestos
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-4">
                            Si el problema persiste, recarga la pagina o contacta soporte.
                        </p>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

type TabId = 'iva' | 'iibb' | 'ret' | 'alertas' | 'pagos' | 'asientos'
type TaxEntryType = 'iva' | 'iibb' | 'mt' | 'autonomos'

const MONTH_LABELS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const MONTH_SHORT_LABELS = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

const IIBB_JURISDICTIONS = [
    { value: 'CABA', label: 'CABA (Ciudad Autonoma)' },
    { value: 'BUENOS_AIRES', label: 'Buenos Aires (ARBA)' },
    { value: 'CATAMARCA', label: 'Catamarca' },
    { value: 'CHACO', label: 'Chaco' },
    { value: 'CHUBUT', label: 'Chubut' },
    { value: 'CORDOBA', label: 'Cordoba' },
    { value: 'CORRIENTES', label: 'Corrientes' },
    { value: 'ENTRE_RIOS', label: 'Entre Rios' },
    { value: 'FORMOSA', label: 'Formosa' },
    { value: 'JUJUY', label: 'Jujuy' },
    { value: 'LA_PAMPA', label: 'La Pampa' },
    { value: 'LA_RIOJA', label: 'La Rioja' },
    { value: 'MENDOZA', label: 'Mendoza' },
    { value: 'MISIONES', label: 'Misiones' },
    { value: 'NEUQUEN', label: 'Neuquen' },
    { value: 'RIO_NEGRO', label: 'Rio Negro' },
    { value: 'SALTA', label: 'Salta' },
    { value: 'SAN_JUAN', label: 'San Juan' },
    { value: 'SAN_LUIS', label: 'San Luis' },
    { value: 'SANTA_CRUZ', label: 'Santa Cruz' },
    { value: 'SANTA_FE', label: 'Santa Fe' },
    { value: 'SANTIAGO_DEL_ESTERO', label: 'Santiago del Estero' },
    { value: 'TIERRA_DEL_FUEGO', label: 'Tierra del Fuego' },
    { value: 'TUCUMAN', label: 'Tucuman' },
]

const IIBB_ACTIVITIES = [
    { value: 'COMERCIO_MINORISTA', label: 'Comercio minorista', rate: 3.0 },
    { value: 'COMERCIO_MAYORISTA', label: 'Comercio mayorista', rate: 2.5 },
    { value: 'SERVICIOS_PROF', label: 'Servicios profesionales', rate: 4.0 },
    { value: 'INDUSTRIA', label: 'Industria', rate: 1.5 },
    { value: 'TRANSPORTE', label: 'Transporte y logistica', rate: 2.0 },
]

// ========================================
// Toast Component
// ========================================

interface ToastProps {
    message: string
    isVisible: boolean
    onClose: () => void
}

function Toast({ message, isVisible, onClose }: ToastProps) {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(onClose, 3000)
            return () => clearTimeout(timer)
        }
    }, [isVisible, onClose])

    if (!isVisible) return null

    return (
        <div className="fixed bottom-6 right-6 bg-white border-l-4 border-emerald-500 shadow-lg rounded-lg p-4 flex items-center gap-3 z-50 max-w-sm animate-slide-in">
            <CheckCircle size={24} weight="fill" className="text-emerald-500" />
            <div>
                <h4 className="text-sm font-bold text-slate-900">Listo!</h4>
                <p className="text-xs text-slate-500">{message}</p>
            </div>
        </div>
    )
}

// ========================================
// Sidebar Checklist Component
// ========================================

interface SidebarChecklistProps {
    steps: TaxClosureSteps
    status: string
    isLocked: boolean
    onToggleStep: (index: number) => void
    onClosePeriod: () => void
    canClose: boolean
}

function SidebarChecklist({ steps, onToggleStep, onClosePeriod, canClose, isLocked }: SidebarChecklistProps) {
    const stepItems = [
        { key: 'operaciones', label: 'Operaciones', sublabel: 'Ventas y Compras ok' },
        { key: 'conciliacion', label: 'Conciliacion', sublabel: 'Retenciones/Perc.' },
        { key: 'asientos', label: 'Asientos', sublabel: 'Generar y exportar' },
        { key: 'presentacion', label: 'Presentacion', sublabel: 'Marcar DJ presentada' },
    ]

    const isReady = Object.values(steps).every(Boolean)
    const statusLabel = isLocked ? 'CERRADO' : (isReady ? 'LISTO PARA CERRAR' : 'BORRADOR')
    const statusClass = isLocked
        ? 'bg-slate-100 text-slate-600 border-slate-200'
        : isReady
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-blue-50 text-blue-600 border-blue-100'

    return (
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado del Cierre</h3>
                <span className={`text-xs px-2 py-1 rounded-md font-bold border ${statusClass}`}>
                    {statusLabel}
                </span>
            </div>

            <div className="space-y-1 relative">
                {/* Progress Line */}
                <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-slate-100 -z-10" />

                {stepItems.map((item, index) => {
                    const isCompleted = steps[item.key as keyof TaxClosureSteps]
                    const isActive = index === 0 || steps[stepItems[index - 1].key as keyof TaxClosureSteps]

                    return (
                        <div
                            key={item.key}
                            className={`flex gap-3 items-start group cursor-pointer ${!isActive ? 'opacity-50' : ''}`}
                            onClick={() => !isLocked && isActive && onToggleStep(index)}
                        >
                            <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm z-10 transition-colors ${
                                    isCompleted
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-white border-slate-300 text-transparent'
                                }`}
                            >
                                <Check size={12} weight="bold" />
                            </div>
                            <div className="pt-1">
                                <p className={`text-sm font-medium transition-colors ${isCompleted ? 'font-semibold text-slate-900' : 'text-slate-500'} group-hover:text-blue-600`}>
                                    {item.label}
                                </p>
                                <p className="text-xs text-slate-400">{item.sublabel}</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            <button
                onClick={onClosePeriod}
                disabled={!isLocked && !canClose}
                className={`w-full mt-6 py-2.5 px-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    isLocked || canClose
                        ? 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-lg shadow-blue-500/30 hover:opacity-95 hover:-translate-y-0.5'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
            >
                {isLocked ? <ArrowClockwise size={16} weight="bold" /> : <LockKey size={16} weight="bold" />}
                {isLocked ? 'Desbloquear Mes' : 'Cerrar Mes'}
            </button>
        </div>
    )
}

// ========================================
// Period Picker Component
// ========================================

interface PeriodPickerProps {
    value: string
    onChange: (value: string) => void
    onClear?: () => void
}

function PeriodPicker({ value, onChange, onClear }: PeriodPickerProps) {
    const [open, setOpen] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const [yearStr, monthStr] = value ? value.split('-') : []
    const selectedYear = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear()
    const selectedMonthIndex = monthStr ? Math.max(0, parseInt(monthStr, 10) - 1) : null
    const [viewYear, setViewYear] = useState(selectedYear)

    useEffect(() => {
        if (open) {
            setViewYear(selectedYear)
        }
    }, [open, selectedYear])

    useEffect(() => {
        if (!open) return
        const handleClick = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    const displayLabel = value
        ? `${MONTH_LABELS[selectedMonthIndex ?? 0]} de ${selectedYear}`
        : 'Seleccionar periodo'

    const current = new Date()
    const currentMonthValue = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`

    const years = useMemo(() => {
        const nowYear = new Date().getFullYear()
        const start = nowYear - 10
        const end = nowYear + 1
        const list: number[] = []
        for (let y = end; y >= start; y -= 1) {
            list.push(y)
        }
        if (!list.includes(viewYear)) {
            list.unshift(viewYear)
        }
        return list
    }, [viewYear])

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
            >
                <CalendarBlank size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-900">{displayLabel}</span>
                <CaretDown size={12} weight="bold" className="text-slate-400" />
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3 z-40">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setViewYear(prev => prev - 1)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
                                aria-label="Anio anterior"
                            >
                                <CaretLeft size={14} weight="bold" />
                            </button>
                            <select
                                value={viewYear}
                                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                                className="text-sm font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none"
                            >
                                {years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => setViewYear(prev => prev + 1)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500"
                                aria-label="Anio siguiente"
                            >
                                <CaretRight size={14} weight="bold" />
                            </button>
                        </div>
                        <span className="text-xs text-slate-400 font-medium">Mes</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {MONTH_SHORT_LABELS.map((label, index) => {
                            const isSelected = selectedMonthIndex === index && selectedYear === viewYear
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => {
                                        const next = `${viewYear}-${String(index + 1).padStart(2, '0')}`
                                        onChange(next)
                                        setOpen(false)
                                    }}
                                    className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                        isSelected
                                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    {label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => {
                                onChange(currentMonthValue)
                                setOpen(false)
                            }}
                            className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                            Este mes
                        </button>
                        {onClear && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClear()
                                    setOpen(false)
                                }}
                                className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                            >
                                Borrar
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ========================================
// Tab Navigation Component
// ========================================

interface TabNavigationProps {
    activeTab: TabId
    onTabChange: (tab: TabId) => void
    regime: TaxRegime
    hasRetWarning: boolean
}

function TabNavigation({ activeTab, onTabChange, regime, hasRetWarning }: TabNavigationProps) {
    const tabs: { id: TabId; label: string; badge?: string; warning?: boolean }[] = regime === 'MT'
        ? [
            { id: 'iva', label: 'Monotributo' },
            { id: 'iibb', label: 'Ingresos Brutos' },
            { id: 'alertas', label: 'Vencimientos' },
            { id: 'pagos', label: 'Pagos' },
            { id: 'asientos', label: 'Asientos' },
        ]
        : [
            { id: 'iva', label: 'IVA', badge: regime === 'RI' ? 'RI' : undefined },
            { id: 'iibb', label: 'Ingresos Brutos' },
            { id: 'ret', label: 'Retenciones', warning: hasRetWarning },
            { id: 'alertas', label: 'Vencimientos' },
            { id: 'pagos', label: 'Pagos' },
            { id: 'asientos', label: 'Asientos' },
        ]

    return (
        <nav className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map(tab => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm transition-all flex items-center gap-2 ${
                        activeTab === tab.id
                            ? 'bg-blue-50 text-blue-600 font-semibold border border-blue-100'
                            : 'text-slate-500 border border-transparent hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                    {tab.label}
                    {tab.badge && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                            {tab.badge}
                        </span>
                    )}
                    {tab.warning && (
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                    )}
                </button>
            ))}
        </nav>
    )
}

// ========================================
// IVA Tab (Responsable Inscripto)
// ========================================

interface IVATabRIProps {
    df: number
    cf: number
    pagosACuenta: number
    saldo: number
    ivaFavorAnterior?: number
    ivaFavorAnteriorDisponible?: boolean
    posicionMesSinArrastre?: number
    posicionMesConArrastre?: number
    alicuotas: IVAAlicuotaDetail[]
    onGenerateEntry: () => void
    isGenerating: boolean
    isLocked: boolean
    onPayNow?: (card: DueDateCard) => void
}

function IVATabRI({
    df,
    cf,
    pagosACuenta,
    saldo,
    ivaFavorAnterior,
    ivaFavorAnteriorDisponible,
    posicionMesSinArrastre,
    posicionMesConArrastre,
    alicuotas,
    onGenerateEntry,
    isGenerating,
    isLocked,
}: IVATabRIProps) {
    const dfChange = df > 0 ? '+12%' : ''
    const hasCarryInfo = ivaFavorAnteriorDisponible !== undefined
    const isCarryAvailable = ivaFavorAnteriorDisponible === true
    const carryValue = isCarryAvailable ? (ivaFavorAnterior || 0) : 0
    const rawPosition = posicionMesSinArrastre ?? saldo
    const finalPosition = posicionMesConArrastre ?? saldo
    const saldoTecnicoTotal = rawPosition + pagosACuenta

    return (
        <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Debito Fiscal (Ventas)
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900 font-mono">
                            {formatCurrency(df)}
                        </span>
                        {dfChange && (
                            <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                                {dfChange}
                            </span>
                        )}
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Credito Fiscal (Compras)
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900 font-mono">
                            {formatCurrency(cf)}
                        </span>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-emerald-500 opacity-5 group-hover:opacity-10 transition-opacity" />
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                        Posicion Mensual (con arrastre)
                    </p>
                    <div className="flex flex-col">
                        <span className={`text-2xl font-bold font-mono ${finalPosition >= 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {formatCurrency(Math.abs(finalPosition))}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                            {finalPosition >= 0 ? 'A Pagar' : 'A Favor'}
                        </span>
                    </div>
                    <button
                        onClick={onGenerateEntry}
                        disabled={isGenerating || isLocked}
                        className="absolute bottom-4 right-4 bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-2 text-xs font-semibold"
                        title="Generar asiento de liquidacion"
                    >
                        <MagicWand size={16} weight="bold" />
                        Generar asiento
                    </button>
                </div>
            </div>

            {/* Arrastre */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Saldo a favor anterior (arrastre)
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-slate-900 font-mono">
                            {isCarryAvailable ? formatCurrency(carryValue) : '—'}
                        </span>
                        {!isCarryAvailable && hasCarryInfo && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                                Mes anterior no cerrado
                            </span>
                        )}
                    </div>
                </div>

                <div className="bg-white border border-slate-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Posicion del mes (sin arrastre)
                    </p>
                    <div className="flex flex-col">
                        <span className={`text-lg font-bold font-mono ${rawPosition >= 0 ? 'text-slate-900' : 'text-emerald-600'}`}>
                            {formatCurrency(Math.abs(rawPosition))}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                            {rawPosition >= 0 ? 'A Pagar' : 'A Favor'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Pagos a Cuenta */}
            {pagosACuenta > 0 && (
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-semibold text-emerald-800">Pagos a Cuenta</p>
                            <p className="text-xs text-emerald-600">Retenciones y percepciones sufridas</p>
                        </div>
                        <span className="text-lg font-bold text-emerald-700 font-mono">
                            - {formatCurrency(pagosACuenta)}
                        </span>
                    </div>
                </div>
            )}

            {/* Detalle por Alícuota */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-900">Detalle por Alicuota</h3>
                    <button className="text-xs text-blue-600 font-semibold hover:underline">
                        Ver Libro IVA Digital
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Alicuota</th>
                                <th className="px-6 py-3 text-right">Neto Gravado</th>
                                <th className="px-6 py-3 text-right">Debito Fiscal</th>
                                <th className="px-6 py-3 text-right">Credito Fiscal</th>
                                <th className="px-6 py-3 text-right">Saldo Tecnico</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-900 font-mono text-sm">
                            {alicuotas.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-slate-400 font-sans">
                                        No hay movimientos en el periodo
                                    </td>
                                </tr>
                            ) : (
                                alicuotas.map(a => (
                                    <tr key={a.alicuota}>
                                        <td className="px-6 py-3 font-sans font-medium">{a.label}</td>
                                        <td className="px-6 py-3 text-right text-slate-500">{formatCurrency(a.netoGravado)}</td>
                                        <td className="px-6 py-3 text-right font-semibold">{formatCurrency(a.debitoFiscal)}</td>
                                        <td className="px-6 py-3 text-right text-slate-500">{formatCurrency(a.creditoFiscal)}</td>
                                        <td className={`px-6 py-3 text-right font-bold ${a.saldoTecnico >= 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                                            {a.saldoTecnico < 0 && '- '}{formatCurrency(Math.abs(a.saldoTecnico))}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        {alicuotas.length > 0 && (
                            <tfoot className="bg-slate-50 font-bold">
                                <tr>
                                    <td className="px-6 py-3">TOTALES</td>
                                    <td className="px-6 py-3 text-right">-</td>
                                    <td className="px-6 py-3 text-right text-blue-600">{formatCurrency(df)}</td>
                                    <td className="px-6 py-3 text-right text-emerald-600">{formatCurrency(cf)}</td>
                                    <td className="px-6 py-3 text-right text-slate-900">{formatCurrency(saldoTecnicoTotal)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    )
}

// ========================================
// IVA Tab (Monotributo)
// ========================================

interface IVATabMTProps {
    categoria: string
    monto: number
    onUpdateCategoria: (cat: string) => void
    onUpdateMonto: (monto: number) => void
    onGenerateEntry: () => void
    isGenerating: boolean
    isLocked: boolean
}

function IVATabMT({ categoria, monto, onUpdateMonto, onGenerateEntry, isGenerating, isLocked }: IVATabMTProps) {
    return (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white text-blue-600 text-3xl mb-4 shadow-sm">
                <ShieldCheck size={32} weight="duotone" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Regimen Simplificado</h2>
            <p className="text-slate-500 max-w-lg mx-auto mb-6">
                Como Monotributista, no liquidas IVA Debito/Credito. El IVA de tus compras se considera costo. Solo debes abonar tu cuota mensual fija.
            </p>

            <div className="bg-white max-w-md mx-auto rounded-xl p-6 shadow-sm border border-slate-100 text-left">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-semibold text-slate-500">Categoria Vigente</span>
                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold border border-emerald-200">
                        CATEGORIA {categoria}
                    </span>
                </div>
                <div className="mb-4">
                    <label className="block text-xs font-medium text-slate-400 mb-1">Monto Mensual</label>
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                        <span className="text-slate-500 mr-2">$</span>
                        <input
                            type="text"
                            value={monto.toLocaleString('es-AR')}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0
                                onUpdateMonto(val)
                            }}
                            disabled={isLocked}
                            className={`bg-transparent border-none w-full font-mono font-semibold focus:outline-none text-slate-900 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        />
                    </div>
                </div>
                <button
                    onClick={onGenerateEntry}
                    disabled={isGenerating || isLocked || monto <= 0}
                    className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-2 rounded-lg font-medium text-sm disabled:opacity-50"
                >
                    Generar Asiento de Pago
                </button>
            </div>
        </div>
    )
}

// ========================================
// IIBB Tab
// ========================================

interface IIBBTabProps {
    base: number
    alicuota: number
    deducciones: number
    suggestedBase: number
    jurisdiction: string
    activity: string
    activities: { value: string; label: string; rate: number }[]
    percepcionesAmount: number
    sircreb: number
    percepcionesLabel: string
    onUpdateBase: (val: number) => void
    onUpdateAlicuota: (val: number) => void
    onUpdateDeducciones: (val: number) => void
    onUpdateJurisdiction: (val: string) => void
    onUpdateActivity: (val: string) => void
    onUpdateSircreb: (val: number) => void
    onGenerateEntry: () => void
    isGenerating: boolean
    isLocked: boolean
}

function IIBBTab({
    base,
    alicuota,
    deducciones,
    suggestedBase,
    jurisdiction,
    activity,
    activities,
    percepcionesAmount,
    sircreb,
    percepcionesLabel,
    onUpdateBase,
    onUpdateAlicuota,
    onUpdateDeducciones,
    onUpdateJurisdiction,
    onUpdateActivity,
    onUpdateSircreb,
    onGenerateEntry,
    isGenerating,
    isLocked,
}: IIBBTabProps) {
    const [subtab, setSubtab] = useState<'LOCAL' | 'CM'>('LOCAL')
    const impuestoDeterminado = base * (alicuota / 100)
    const saldoFinal = impuestoDeterminado - deducciones

    return (
        <div className="space-y-6">
            {/* Subtabs */}
            <div className="flex gap-4 border-b border-slate-200 pb-1 mb-4">
                <button
                    type="button"
                    onClick={() => setSubtab('LOCAL')}
                    className={`text-sm pb-2 transition-colors ${
                        subtab === 'LOCAL'
                            ? 'font-bold text-blue-600 border-b-2 border-blue-600'
                            : 'font-medium text-slate-400 hover:text-slate-900'
                    }`}
                >
                    Local (Directo)
                </button>
                <button
                    type="button"
                    onClick={() => setSubtab('CM')}
                    className={`text-sm pb-2 transition-colors ${
                        subtab === 'CM'
                            ? 'font-bold text-blue-600 border-b-2 border-blue-600'
                            : 'font-medium text-slate-400 hover:text-slate-900'
                    }`}
                >
                    Conv. Multilateral
                </button>
            </div>

            {subtab === 'CM' ? (
                <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
                    <div className="flex items-start gap-3">
                        <Info size={20} weight="duotone" className="text-blue-600 mt-0.5" />
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 mb-1">
                                Convenio Multilateral (placeholder)
                            </h3>
                            <p className="text-xs text-slate-500">
                                Esta seccion se habilita cuando configures coeficientes por jurisdiccion.
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Calculadora */}
                    <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Calculator size={20} weight="duotone" className="text-blue-600" />
                            Calculadora
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jurisdiccion</label>
                                <select
                                    value={jurisdiction}
                                    onChange={(e) => onUpdateJurisdiction(e.target.value)}
                                    disabled={isLocked}
                                    className={`w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    {IIBB_JURISDICTIONS.map(item => (
                                        <option key={item.value} value={item.value}>{item.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Actividad</label>
                                <select
                                    value={activity}
                                    onChange={(e) => onUpdateActivity(e.target.value)}
                                    disabled={isLocked}
                                    className={`w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    {activities.map(item => (
                                        <option key={item.value} value={item.value}>
                                            {item.label}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-slate-400 mt-1">
                                    Al seleccionar actividad se sugiere la alicuota.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Base Imponible</label>
                                    <input
                                        type="text"
                                        value={base.toLocaleString('es-AR')}
                                        onChange={(e) => {
                                            const val = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0
                                            onUpdateBase(val)
                                        }}
                                        disabled={isLocked}
                                        className={`w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 font-mono ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    />
                                    {suggestedBase > 0 && base !== suggestedBase && (
                                        <button
                                            onClick={() => onUpdateBase(suggestedBase)}
                                            disabled={isLocked}
                                            className={`text-xs text-blue-600 mt-1 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:underline'}`}
                                        >
                                            Sugerido: {formatCurrency(suggestedBase)}
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Alicuota (%)</label>
                                    <input
                                        type="number"
                                        value={alicuota}
                                        step="0.1"
                                        onChange={(e) => onUpdateAlicuota(parseFloat(e.target.value) || 0)}
                                        disabled={isLocked}
                                        className={`w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 font-mono ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    />
                                </div>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center mt-4">
                                <span className="text-sm font-medium text-slate-500">Impuesto Determinado</span>
                                <span className="text-lg font-bold text-blue-600 font-mono">
                                    {formatCurrency(impuestoDeterminado)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Deducciones */}
                    <div className="bg-white rounded-xl shadow-sm p-6 border border-slate-100 flex flex-col">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Receipt size={20} weight="duotone" className="text-emerald-600" />
                            Pagos a Cuenta
                        </h3>

                        <div className="flex-1 overflow-y-auto mb-4 max-h-56">
                            <div className="flex justify-between items-center py-2 border-b border-slate-100 gap-3">
                                <div>
                                    <p className="text-sm font-medium">SIRCREB Bancario</p>
                                    <p className="text-xs text-slate-400">Revisar extracto bancario</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs text-emerald-600">-</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={sircreb}
                                        onChange={(e) => onUpdateSircreb(parseFloat(e.target.value) || 0)}
                                        disabled={isLocked}
                                        className={`w-24 text-right text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-mono ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-slate-100">
                                <div>
                                    <p className="text-sm font-medium">{percepcionesLabel}</p>
                                    <p className="text-xs text-slate-400">Comprobantes</p>
                                </div>
                                <span className="font-mono text-sm font-semibold text-emerald-600">
                                    - {formatCurrency(Math.abs(percepcionesAmount))}
                                </span>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Total Deducciones</label>
                            <input
                                type="text"
                                value={deducciones.toLocaleString('es-AR')}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0
                                    onUpdateDeducciones(val)
                                }}
                                disabled={isLocked}
                                className={`w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 font-mono ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                        </div>

                        <div className="mt-auto border-t border-slate-200 pt-4 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-900">A PAGAR</span>
                            <span className="text-xl font-bold text-slate-900 font-mono">
                                {formatCurrency(Math.max(0, saldoFinal))}
                            </span>
                        </div>
                        <button
                            onClick={onGenerateEntry}
                            disabled={isGenerating || isLocked || saldoFinal <= 0}
                            className="mt-4 w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-2 rounded-lg font-medium text-sm shadow-md disabled:opacity-50"
                        >
                            Confirmar y Generar Asiento
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ========================================
// Retenciones Tab
// ========================================

interface RetencionesTabProps {
    rows: RetencionPercepcionRow[]
    onAddManual: () => void
    isLocked: boolean
}

interface RetencionesTableProps {
    title: string
    subtitle: string
    rows: RetencionPercepcionRow[]
    totalLabel: string
}

function RetencionesTable({ title, subtitle, rows, totalLabel }: RetencionesTableProps) {
    const total = rows.reduce((sum, r) => sum + r.monto, 0)

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-slate-100">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Impuesto</th>
                        <th className="px-4 py-3">Comprobante</th>
                        <th className="px-4 py-3 text-right">Base</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-900 font-mono text-sm">
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-sans">
                                No hay retenciones o percepciones en el periodo
                            </td>
                        </tr>
                    ) : (
                        rows.map(row => (
                            <tr key={row.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-sans text-slate-500">
                                    {new Date(row.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                </td>
                                <td className="px-4 py-3 font-sans">
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                        row.tipo === 'RETENCION'
                                            ? 'bg-purple-100 text-purple-700'
                                            : 'bg-orange-100 text-orange-700'
                                    }`}>
                                        {row.tipo === 'RETENCION' ? 'Retencion' : 'Percepcion'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-sans font-medium">{row.impuesto}</td>
                                <td className="px-4 py-3 font-sans text-slate-500">{row.comprobante || row.origen}</td>
                                <td className="px-4 py-3 text-right text-slate-400">
                                    {row.base ? formatCurrency(row.base) : '-'}
                                </td>
                                <td className="px-4 py-3 text-right font-bold">{formatCurrency(row.monto)}</td>
                                <td className="px-4 py-3 text-center">
                                    <CheckCircle size={18} weight="fill" className="text-emerald-500 inline" />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
                <p className="text-xs text-slate-500">
                    {totalLabel}: <strong className="text-slate-900 text-sm font-mono ml-2">{formatCurrency(total)}</strong>
                </p>
            </div>
        </div>
    )
}

function RetencionesTab({ rows, onAddManual, isLocked }: RetencionesTabProps) {
    const sufridas = rows.filter(r => r.direction !== 'PRACTICADA')
    const practicadas = rows.filter(r => r.direction === 'PRACTICADA')

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-bold text-slate-900">Retenciones y Percepciones</h3>
                    <p className="text-xs text-slate-500">Sufridas vs practicadas (agente)</p>
                </div>
                <button
                    onClick={onAddManual}
                    disabled={isLocked}
                    className={`text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-md text-slate-500 font-medium transition-colors flex items-center gap-1 ${
                        isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-600'
                    }`}
                >
                    <Plus size={12} /> Agregar Manual
                </button>
            </div>

            <RetencionesTable
                title="Sufridas (a favor)"
                subtitle="Afectan pagos a cuenta del periodo"
                rows={sufridas}
                totalLabel="Total computable"
            />

            <RetencionesTable
                title="Practicadas (a depositar)"
                subtitle="Obligacion del agente de retencion/percepcion"
                rows={practicadas}
                totalLabel="Total a depositar"
            />
        </div>
    )
}

// ========================================
// Vencimientos Tab
// ========================================

interface VencimientosTabProps {
    cards: DueDateCard[]
    // Autónomos props (only for RI regime)
    regime: TaxRegime
    autonomosSettings?: AutonomosSettings
    onUpdateAutonomos: (settings: AutonomosSettings) => Promise<void>
    onGenerateAutonomosEntry: () => void
    isGenerating: boolean
    isLocked: boolean
    onPayNow?: (card: DueDateCard) => void
}

function VencimientosTab({
    cards,
    regime,
    autonomosSettings,
    onUpdateAutonomos,
    onGenerateAutonomosEntry,
    isGenerating,
    isLocked,
    onPayNow,
}: VencimientosTabProps) {
    const [overdueOpen, setOverdueOpen] = useState(false)
    const [historicOpen, setHistoricOpen] = useState(false)
    const [showHistoric, setShowHistoric] = useState(false)
    const [hideCompleted, setHideCompleted] = useState(true)

    const getStatusColor = (status: DueDateCard['status']) => {
        switch (status) {
            case 'PENDING': return 'border-amber-500'
            case 'OVERDUE': return 'border-red-500'
            case 'AL_DIA': return 'border-blue-600'
            case 'PAID': return 'border-emerald-500'
            case 'SUBMITTED': return 'border-emerald-500'
            default: return 'border-slate-300'
        }
    }

    const getStatusBadgeClass = (status: DueDateCard['status']) => {
        switch (status) {
            case 'PENDING': return 'bg-amber-100 text-amber-800'
            case 'OVERDUE': return 'bg-red-100 text-red-800'
            case 'AL_DIA': return 'bg-emerald-100 text-emerald-800'
            case 'PAID': return 'bg-emerald-100 text-emerald-800'
            case 'SUBMITTED': return 'bg-emerald-100 text-emerald-800'
            default: return 'bg-slate-100 text-slate-800'
        }
    }

    const uniqueCards = useMemo(() => {
        const map = new Map<string, DueDateCard>()
        for (const card of cards) {
            const key = card.uniqueKey
                || `${card.obligation || card.title}:${card.month || card.dueDate}:${card.action || 'PAGO'}:${card.jurisdiction || 'GENERAL'}`
            if (!map.has(key)) {
                map.set(key, card)
            }
        }
        return Array.from(map.values())
    }, [cards])

    const allowedObligations = useMemo(() => {
        return regime === 'RI'
            ? new Set(['IVA', 'IIBB_LOCAL', 'IIBB_CM', 'AUTONOMOS'])
            : new Set(['MONOTRIBUTO', 'IIBB_LOCAL'])
    }, [regime])

    const filtered = useMemo(() => {
        return uniqueCards.filter(card => !card.obligation || allowedObligations.has(card.obligation))
    }, [allowedObligations, uniqueCards])

    const statusFiltered = useMemo(() => {
        if (!hideCompleted) return filtered
        return filtered.filter(card => !['PAID', 'SUBMITTED'].includes(card.status))
    }, [filtered, hideCompleted])

    const sorted = useMemo(() => {
        return [...statusFiltered].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    }, [statusFiltered])

    const upcoming = sorted.filter(card => card.daysRemaining >= 0 && card.daysRemaining <= 45)
    const overdue = sorted.filter(card => card.daysRemaining < 0 && card.daysRemaining >= -45)
    const historic = sorted.filter(card => card.daysRemaining < -45 || card.daysRemaining > 45)

    const renderCards = (list: DueDateCard[], emptyLabel: string) => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {list.length === 0 ? (
                <div className="col-span-full bg-white rounded-xl shadow-sm p-6 text-center border border-slate-100">
                    <CalendarCheck size={36} weight="duotone" className="text-slate-300 mx-auto mb-2" />
                    <h3 className="text-slate-900 font-bold mb-1 text-sm">{emptyLabel}</h3>
                    <p className="text-slate-500 text-xs">No hay obligaciones en este rango.</p>
                </div>
            ) : (
                list.map(card => (
                    <div
                        key={card.uniqueKey || card.id}
                        className={`bg-white border-l-4 ${getStatusColor(card.status)} rounded-r-xl shadow-sm p-5 relative`}
                    >
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-900">{card.title}</h4>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${getStatusBadgeClass(card.status)}`}>
                                {card.statusLabel}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">{card.description}</p>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900 mb-4">
                            {card.status === 'PENDING' || card.status === 'OVERDUE' ? (
                                <Clock size={18} weight="duotone" className="text-amber-500" />
                            ) : (
                                <CalendarCheck size={18} weight="duotone" className="text-blue-600" />
                            )}
                            <span>Vence: {new Date(card.dueDate).toLocaleDateString('es-AR')}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                            <div
                                className={`h-1.5 rounded-full ${
                                    card.status === 'OVERDUE'
                                        ? 'bg-red-500'
                                        : card.status === 'PENDING'
                                            ? 'bg-amber-500'
                                            : 'bg-blue-600'
                                }`}
                                style={{ width: `${card.progress}%` }}
                            />
                        </div>
                        <p className="text-xs text-slate-400 text-right">
                            {card.daysRemaining < 0
                                ? `Vencido hace ${Math.abs(card.daysRemaining)} dias`
                                : card.daysRemaining === 0
                                    ? 'Vence hoy'
                                    : `Faltan ${card.daysRemaining} dias`}
                        </p>
                        {(card.actionLabel || (onPayNow && (card.status === 'PENDING' || card.status === 'OVERDUE'))) && (
                            <div className="flex gap-2 mt-4">
                                {card.actionLabel && (
                                    <button className="flex-1 text-xs border border-slate-200 py-1.5 rounded hover:bg-slate-50 font-medium">
                                        {card.actionLabel}
                                    </button>
                                )}
                                {onPayNow && (card.status === 'PENDING' || card.status === 'OVERDUE') && (
                                    <button
                                        type="button"
                                        onClick={() => onPayNow(card)}
                                        className="flex-1 text-xs py-1.5 rounded font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                    >
                                        Pagar ya
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setHideCompleted(prev => !prev)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        hideCompleted
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    Solo pendientes
                </button>
                <button
                    type="button"
                    onClick={() => setShowHistoric(prev => !prev)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        showHistoric
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                >
                    Historicos
                </button>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">Proximos (45 dias)</span>
                        <span className="text-xs text-slate-400 font-semibold">{upcoming.length}</span>
                    </div>
                </div>
                {renderCards(upcoming, 'Sin vencimientos proximos')}
            </div>

            <div className="space-y-3">
                <button
                    type="button"
                    onClick={() => setOverdueOpen(prev => !prev)}
                    className="flex items-center gap-2 text-sm font-bold text-slate-900"
                    aria-expanded={overdueOpen}
                >
                    <CaretDown size={14} weight="bold" className={`transition-transform ${overdueOpen ? '' : '-rotate-90'}`} />
                    Vencidos
                    <span className="text-xs text-slate-400 font-semibold">{overdue.length}</span>
                </button>
                {overdueOpen && renderCards(overdue, 'Sin vencidos recientes')}
            </div>

            {showHistoric && (
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => setHistoricOpen(prev => !prev)}
                        className="flex items-center gap-2 text-sm font-bold text-slate-900"
                        aria-expanded={historicOpen}
                    >
                        <CaretDown size={14} weight="bold" className={`transition-transform ${historicOpen ? '' : '-rotate-90'}`} />
                        Historicos
                        <span className="text-xs text-slate-400 font-semibold">{historic.length}</span>
                    </button>
                    {historicOpen && renderCards(historic, 'Sin historicos para mostrar')}
                </div>
            )}

            {/* Autonomos Card - Only for RI regime */}
            {regime === 'RI' && (
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-bold text-slate-900">Opcionales</span>
                        <span className="text-xs text-slate-400 font-semibold">Autonomos</span>
                    </div>
                    <div className="bg-white border-l-4 border-purple-500 rounded-r-xl shadow-sm p-5 relative">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-900">Autonomos (Aportes)</h4>
                            <span className={`text-xs font-bold px-2 py-1 rounded ${
                                autonomosSettings?.enabled
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-slate-100 text-slate-500'
                            }`}>
                                {autonomosSettings?.enabled ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 mb-4">
                            Aportes previsionales mensuales para trabajadores autonomos.
                        </p>

                        {/* Toggle */}
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-sm font-medium text-slate-700">Aplica</label>
                            <button
                                onClick={() => !isLocked && onUpdateAutonomos({
                                    enabled: !autonomosSettings?.enabled,
                                    monthlyAmount: autonomosSettings?.monthlyAmount || 0,
                                    dueDay: autonomosSettings?.dueDay || 15,
                                })}
                                disabled={isLocked}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    autonomosSettings?.enabled ? 'bg-purple-600' : 'bg-slate-200'
                                } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                role="switch"
                                aria-checked={autonomosSettings?.enabled}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                        autonomosSettings?.enabled ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>

                        {/* Amount input - only visible when enabled */}
                        {autonomosSettings?.enabled && (
                            <>
                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">
                                        Monto Mensual
                                    </label>
                                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                                        <span className="text-slate-500 mr-2">$</span>
                                        <input
                                            type="text"
                                            value={(autonomosSettings?.monthlyAmount || 0).toLocaleString('es-AR')}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value.replace(/\./g, '').replace(',', '.')) || 0
                                                onUpdateAutonomos({
                                                    ...autonomosSettings,
                                                    monthlyAmount: val,
                                                })
                                            }}
                                            disabled={isLocked}
                                            className={`bg-transparent border-none w-full font-mono font-semibold focus:outline-none text-slate-900 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-slate-500 mb-1">
                                        Dia de vencimiento
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={31}
                                        value={autonomosSettings?.dueDay || 15}
                                        onChange={(e) => {
                                            const val = Math.min(31, Math.max(1, parseInt(e.target.value) || 15))
                                            onUpdateAutonomos({
                                                ...autonomosSettings,
                                                dueDay: val,
                                            })
                                        }}
                                        disabled={isLocked}
                                        className={`w-full text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 font-mono focus:outline-none focus:border-purple-500 ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    />
                                    <p className="text-xs text-slate-400 mt-1">
                                        Segun terminacion de CUIT (del 1 al 31)
                                    </p>
                                </div>

                                <button
                                    onClick={onGenerateAutonomosEntry}
                                    disabled={isGenerating || isLocked || (autonomosSettings?.monthlyAmount || 0) <= 0}
                                    className="w-full bg-gradient-to-r from-purple-600 to-purple-500 text-white py-2 rounded-lg font-medium text-sm shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <MagicWand size={16} weight="bold" />
                                    Generar Asiento
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ========================================
// Pagos Tab
// ========================================

interface PagosTabProps {
    obligations: TaxSettlementObligation[]
    onRegisterSettlement: (obligation: TaxSettlementObligation) => void
    onViewPayments: (obligation: TaxSettlementObligation) => void
}

function PagosTab({ obligations, onRegisterSettlement, onViewPayments }: PagosTabProps) {
    const payables = obligations.filter(o => o.direction === 'PAYABLE' && o.amountTotal > 0)
    const receivables = obligations.filter(o => o.direction === 'RECEIVABLE' && o.amountTotal > 0)

    const formatObligationLabel = (obligation: TaxSettlementObligation) => {
        switch (obligation.tax) {
            case 'IVA':
                return 'IVA'
            case 'IIBB':
                return `IIBB ${obligation.jurisdiction && obligation.jurisdiction !== 'GENERAL' ? obligation.jurisdiction : ''}`.trim()
            case 'RET_DEPOSITAR':
                return 'Retenciones a depositar'
            case 'PER_DEPOSITAR':
                return 'Percepciones a depositar'
            case 'AUTONOMOS':
                return 'Autonomos'
            case 'MONOTRIBUTO':
                return 'Monotributo'
            default:
                return obligation.tax
        }
    }

    const getStatusBadge = (status: TaxSettlementObligation['status']) => {
        switch (status) {
            case 'PAID':
                return { label: 'CANCELADO', className: 'bg-emerald-100 text-emerald-700' }
            case 'PARTIAL':
                return { label: 'PARCIAL', className: 'bg-blue-100 text-blue-700' }
            case 'PENDING':
                return { label: 'PENDIENTE', className: 'bg-amber-100 text-amber-700' }
            default:
                return { label: 'N/A', className: 'bg-slate-100 text-slate-500' }
        }
    }

    const renderEmpty = (title: string, description: string) => (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 min-h-[200px] flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 text-xl mb-2">
                <Receipt size={22} weight="duotone" />
            </div>
            <h3 className="text-slate-900 font-bold mb-1 text-sm">{title}</h3>
            <p className="text-slate-500 text-xs max-w-xs">{description}</p>
        </div>
    )

    const renderSection = (
        title: string,
        subtitle: string,
        items: TaxSettlementObligation[],
        direction: TaxSettlementObligation['direction']
    ) => {
        if (items.length === 0) {
            return renderEmpty(
                direction === 'PAYABLE' ? 'Sin obligaciones para pagar' : 'Sin créditos a favor',
                direction === 'PAYABLE'
                    ? 'Genera la liquidacion del periodo para ver obligaciones pendientes.'
                    : 'Cuando haya saldos a favor se mostraran aqui.'
            )
        }

        const hasIvaCredit = direction === 'RECEIVABLE' && items.some(item => item.tax === 'IVA')
        const settledLabel = direction === 'PAYABLE' ? 'Pagado' : 'Cobrado'
        const actionLabel = direction === 'PAYABLE' ? 'Registrar pago' : 'Registrar cobro/transferencia'
        const actionTitle = direction === 'RECEIVABLE' ? 'Modo avanzado' : undefined

        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                        <p className="text-xs text-slate-500">{subtitle}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">{items.length}</span>
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Impuesto</th>
                                <th className="px-4 py-3 text-left font-medium">Periodo</th>
                                <th className="px-4 py-3 text-left font-medium">Jurisdiccion</th>
                                <th className="px-4 py-3 text-left font-medium">Vence</th>
                                <th className="px-4 py-3 text-right font-medium">Determinado</th>
                                <th className="px-4 py-3 text-right font-medium">{settledLabel}</th>
                                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                                <th className="px-4 py-3 text-left font-medium">Estado</th>
                                <th className="px-4 py-3 text-right font-medium">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-900">
                            {items.map(obligation => {
                                const status = getStatusBadge(obligation.status)
                                return (
                                    <tr key={obligation.id}>
                                        <td className="px-4 py-3 font-semibold">{formatObligationLabel(obligation)}</td>
                                        <td className="px-4 py-3">{formatMonth(obligation.periodKey)}</td>
                                        <td className="px-4 py-3">{obligation.jurisdiction || 'GENERAL'}</td>
                                        <td className="px-4 py-3">
                                            {obligation.suggestedDueDate
                                                ? new Date(obligation.suggestedDueDate).toLocaleDateString('es-AR')
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(obligation.amountTotal)}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(obligation.amountSettled)}</td>
                                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(obligation.amountRemaining)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded ${status.className}`}>
                                                {status.label}
                                            </span>
                                            {direction === 'RECEIVABLE' && obligation.amountRemaining > 0 && (
                                                <p className="text-[11px] text-slate-400 mt-1">Se arrastra al periodo siguiente</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onRegisterSettlement(obligation)}
                                                    disabled={obligation.amountRemaining <= 0}
                                                    title={actionTitle}
                                                    className="text-xs px-3 py-1.5 rounded border border-slate-200 font-semibold text-slate-600 hover:border-blue-500 hover:text-blue-600 disabled:opacity-50"
                                                >
                                                    {actionLabel}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onViewPayments(obligation)}
                                                    disabled={obligation.amountSettled <= 0}
                                                    className="text-xs px-3 py-1.5 rounded border border-slate-200 font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                                                >
                                                    Ver asientos
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {hasIvaCredit && (
                    <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">
                        Normalmente se arrastra al periodo siguiente. Solo registra cobro si efectivamente hubo transferencia o compensacion.
                    </div>
                )}
            </div>
        )
    }

    if (payables.length === 0 && receivables.length === 0) {
        return renderEmpty(
            'Sin obligaciones para pagar',
            'Genera la liquidacion del periodo para ver obligaciones pendientes y registrar pagos.'
        )
    }

    return (
        <div className="space-y-5">
            {renderSection(
                'Obligaciones a pagar',
                'Registra pagos parciales o totales desde esta vista.',
                payables,
                'PAYABLE'
            )}
            {renderSection(
                'Creditos a favor',
                'Saldos fiscales disponibles para arrastrar o cobrar.',
                receivables,
                'RECEIVABLE'
            )}
        </div>
    )
}

// ========================================
// Asientos Tab
// ========================================

interface AsientosTabProps {
    entries: Array<{
        id: string
        memo: string
        date: string
        lines: Array<{ accountId: string; debit: number; credit: number; description?: string }>
    }>
    accounts: Map<string, string>
    onGoToLiquidacion: () => void
}

function AsientosTab({ entries, accounts, onGoToLiquidacion }: AsientosTabProps) {
    const copyToClipboard = (entry: any) => {
        navigator.clipboard.writeText(JSON.stringify(entry, null, 2))
    }

    if (entries.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 min-h-[300px] flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 text-3xl mb-4">
                    <Notebook size={32} weight="duotone" />
                </div>
                <h3 className="text-slate-900 font-bold mb-2">Aun no hay asientos generados</h3>
                <p className="text-slate-500 text-sm max-w-xs mb-6">
                    Completa la liquidacion de IVA o IIBB y hace clic en "Generar Asiento" para verlos aca.
                </p>
                <button
                    onClick={onGoToLiquidacion}
                    className="text-blue-600 text-sm font-semibold hover:underline"
                >
                    Ir a Liquidacion
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {entries.map((entry, idx) => (
                <div key={entry.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <span className="text-xs font-bold text-slate-400 uppercase mr-2">#{idx + 1}</span>
                            <span className="text-sm font-bold text-slate-900">{entry.memo}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => copyToClipboard(entry)}
                                className="text-xs flex items-center gap-1 text-blue-600 font-medium hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                            >
                                <Copy size={12} weight="bold" /> Copiar JSON
                            </button>
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                            <tr>
                                <th className="px-6 py-2 text-left font-medium">Cuenta</th>
                                <th className="px-6 py-2 text-right font-medium">Debe</th>
                                <th className="px-6 py-2 text-right font-medium">Haber</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-mono text-slate-900">
                            {entry.lines.map((line, lineIdx) => (
                                <tr key={lineIdx}>
                                    <td className="px-6 py-2 font-sans">
                                        {accounts.get(line.accountId) || line.accountId}
                                    </td>
                                    <td className={`px-6 py-2 text-right ${line.debit ? 'text-slate-900' : 'text-slate-300'}`}>
                                        {line.debit ? formatCurrency(line.debit) : '-'}
                                    </td>
                                    <td className={`px-6 py-2 text-right ${line.credit ? 'text-slate-900' : 'text-slate-300'}`}>
                                        {line.credit ? formatCurrency(line.credit) : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    )
}

// ========================================
// Preview Modal
// ========================================

interface TaxEntryPreviewModalProps {
    open: boolean
    entry: Omit<JournalEntry, 'id'> | null
    accounts: Account[]
    onClose: () => void
    onConfirm: () => void
    onRestore: () => void
    onChange: (next: Omit<JournalEntry, 'id'>) => void
    isSaving: boolean
}

function TaxEntryPreviewModal({
    open,
    entry,
    accounts,
    onClose,
    onConfirm,
    onRestore,
    onChange,
    isSaving,
}: TaxEntryPreviewModalProps) {
    if (!open || !entry) return null

    const postableAccounts = accounts.filter(acc => !acc.isHeader)
    const totalDebit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
    const totalCredit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0)
    const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01
    const hasValidLines = entry.lines.every(line => line.accountId && ((line.debit || 0) > 0 || (line.credit || 0) > 0))
    const canConfirm = isBalanced && hasValidLines && !isSaving

    const updateLine = (index: number, patch: Partial<JournalEntry['lines'][number]>) => {
        const nextLines = entry.lines.map((line, idx) => (idx === index ? { ...line, ...patch } : line))
        onChange({ ...entry, lines: nextLines })
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">Vista Previa de Asiento</h3>
                        <p className="text-xs text-slate-500">Edita cuentas e importes antes de confirmar.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        Cerrar
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Memo</label>
                            <input
                                type="text"
                                value={entry.memo}
                                onChange={(e) => onChange({ ...entry, memo: e.target.value })}
                                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Fecha</label>
                            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono text-slate-700">
                                {entry.date}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Cuenta</th>
                                    <th className="px-4 py-3 text-right font-medium">Debe</th>
                                    <th className="px-4 py-3 text-right font-medium">Haber</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-900">
                                {entry.lines.map((line, index) => (
                                    <tr key={`${line.accountId}-${index}`}>
                                        <td className="px-4 py-2">
                                            <select
                                                value={line.accountId}
                                                onChange={(e) => updateLine(index, { accountId: e.target.value })}
                                                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-md p-2 outline-none focus:border-blue-600"
                                            >
                                                <option value="">Seleccionar cuenta</option>
                                                {postableAccounts.map(account => (
                                                    <option key={account.id} value={account.id}>
                                                        {account.code} - {account.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={line.debit || 0}
                                                onChange={(e) => updateLine(index, { debit: parseFloat(e.target.value) || 0 })}
                                                className="w-full text-right text-sm bg-slate-50 border border-slate-200 rounded-md p-2 font-mono outline-none focus:border-blue-600"
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={line.credit || 0}
                                                onChange={(e) => updateLine(index, { credit: parseFloat(e.target.value) || 0 })}
                                                className="w-full text-right text-sm bg-slate-50 border border-slate-200 rounded-md p-2 font-mono outline-none focus:border-blue-600"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={onRestore}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-2"
                        >
                            <ArrowClockwise size={14} weight="bold" />
                            Restaurar calculo automatico
                        </button>
                        <div className="text-right">
                            <p className={`text-xs font-semibold ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                                Debe: {formatCurrency(totalDebit)} / Haber: {formatCurrency(totalCredit)}
                            </p>
                            {!isBalanced && (
                                <p className="text-xs text-amber-600">El asiento debe estar balanceado.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={!canConfirm}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-emerald-500 disabled:opacity-50"
                    >
                        {isSaving ? 'Guardando...' : 'Confirmar Asiento'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ========================================
// Tax Settlement Modal
// ========================================

interface TaxSettlementModalProps {
    open: boolean
    obligations: TaxSettlementObligation[]
    accounts: Account[]
    selectedObligationId?: string | null
    currentPeriod: string
    regime: TaxRegime
    isCurrentPeriodLocked: boolean
    onClose: () => void
    onSaved: (entryId: string, obligation: TaxSettlementObligation) => void
    buildPreview: (obligation: TaxSettlementObligation, payload: RegisterTaxPaymentInput) => Promise<TaxPaymentPreviewResult>
    registerSettlement: (
        obligation: TaxSettlementObligation,
        payload: RegisterTaxPaymentInput
    ) => Promise<{
        success: boolean
        error?: string
        missingAccountLabel?: string
        missingAccountCode?: string
        missingMappingKey?: string
        entryId?: string
    }>
    onAccountsReload: () => Promise<void>
    onGoToAccounts: () => void
}

function TaxSettlementModal({
    open,
    obligations,
    accounts,
    selectedObligationId,
    currentPeriod,
    regime,
    isCurrentPeriodLocked,
    onClose,
    onSaved,
    buildPreview,
    registerSettlement,
    onAccountsReload,
    onGoToAccounts,
}: TaxSettlementModalProps) {
    const postableAccounts = accounts.filter(acc => !acc.isHeader)
    const defaultPaymentAccountId = useMemo(() => {
        const byCode = postableAccounts.find(acc => acc.code === '1.1.01.02' || acc.code === '1.1.01.01')
        if (byCode) return byCode.id
        const byName = postableAccounts.find(acc => /banco|caja/i.test(acc.name))
        return byName?.id || ''
    }, [postableAccounts])

    const [obligationId, setObligationId] = useState('')
    const [paidAt, setPaidAt] = useState(getLocalDateISO())
    const [method, setMethod] = useState<TaxPaymentMethod>('VEP')
    const [reference, setReference] = useState('')
    const [amount, setAmount] = useState(0)
    const [obligationAccountId, setObligationAccountId] = useState('')
    const [splits, setSplits] = useState<Array<{ id: string; accountId: string; amount: number }>>([])
    const [previewEntry, setPreviewEntry] = useState<Omit<JournalEntry, 'id'> | null>(null)
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [missingAccountLabel, setMissingAccountLabel] = useState<string | null>(null)
    const [missingAccountCode, setMissingAccountCode] = useState<string | null>(null)
    const [missingMappingKey, setMissingMappingKey] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isRepairingAccounts, setIsRepairingAccounts] = useState(false)
    const [dateLock, setDateLock] = useState<{ locked: boolean; periodKey: string | null }>({ locked: false, periodKey: null })
    const [previewNonce, setPreviewNonce] = useState(0)

    const selectedObligation = useMemo(() => {
        return obligations.find(o => o.id === obligationId) || null
    }, [obligations, obligationId])

    const isReceivable = selectedObligation?.direction === 'RECEIVABLE'
    const needsReference = isReceivable && selectedObligation?.tax === 'IVA'
    const referenceError = needsReference && !reference.trim()
        ? 'La referencia es obligatoria para IVA a favor.'
        : null

    const splitTotal = useMemo(() => splits.reduce((sum, s) => sum + (s.amount || 0), 0), [splits])
    const splitDiff = useMemo(() => amount - splitTotal, [amount, splitTotal])

    useEffect(() => {
        if (!open || !selectedObligation) return
        setAmount(selectedObligation.amountRemaining)
        if (splits.length === 1) {
            setSplits(prev => prev.map(s => ({ ...s, amount: selectedObligation.amountRemaining })))
        }
    }, [open, selectedObligation?.id, splits.length])

    useEffect(() => {
        if (!open) return
        const initial = selectedObligationId
            ? obligations.find(o => o.id === selectedObligationId)
            : obligations[0]

        const nextId = initial?.id || ''
        const nextAmount = initial?.amountRemaining || 0

        setObligationId(nextId)
        setPaidAt(getLocalDateISO())
        setMethod('VEP')
        setReference('')
        setAmount(nextAmount)
        setObligationAccountId('')
        setSplits([{
            id: `split-${Date.now()}`,
            accountId: defaultPaymentAccountId,
            amount: nextAmount,
        }])
        setPreviewEntry(null)
        setPreviewError(null)
        setMissingAccountLabel(null)
        setMissingAccountCode(null)
        setMissingMappingKey(null)
        setPreviewNonce(0)
    }, [open, selectedObligationId, obligations, defaultPaymentAccountId])

    useEffect(() => {
        if (!open) return
        const periodKey = paidAt ? paidAt.slice(0, 7) : ''
        if (!periodKey) return

        let active = true
        const resolveLock = async () => {
            if (periodKey === currentPeriod) {
                if (active) {
                    setDateLock({ locked: isCurrentPeriodLocked, periodKey })
                }
                return
            }
            const closureDoc = await getTaxClosure(periodKey, regime)
            if (!active) return
            setDateLock({ locked: closureDoc?.status === 'CLOSED', periodKey })
        }

        resolveLock()
        return () => { active = false }
    }, [open, paidAt, currentPeriod, isCurrentPeriodLocked, regime])

    useEffect(() => {
        if (!open || !selectedObligation) return

        let active = true
        const payload: RegisterTaxPaymentInput = {
            paidAt,
            method,
            reference,
            amount,
            splits: splits.map(s => ({ accountId: s.accountId, amount: s.amount })),
            obligationAccountId: obligationAccountId || undefined,
        }

        buildPreview(selectedObligation, payload).then(result => {
            if (!active) return
            setPreviewEntry(result.entry || null)
            setPreviewError(result.error || null)
            setMissingAccountLabel(result.missingAccountLabel || null)
            setMissingAccountCode(result.missingAccountCode || null)
            setMissingMappingKey(result.missingMappingKey || null)
        })

        return () => { active = false }
    }, [open, selectedObligation, paidAt, method, reference, amount, splits, obligationAccountId, buildPreview, previewNonce])

    useEffect(() => {
        if (splits.length === 1) {
            setSplits(prev => prev.map(s => ({ ...s, amount })))
        }
    }, [amount, splits.length])

    const handleSplitChange = (id: string, field: 'accountId' | 'amount', value: string | number) => {
        setSplits(prev => prev.map(split => (
            split.id === id ? { ...split, [field]: value } : split
        )))
    }

    const handleAddSplit = () => {
        setSplits(prev => [
            ...prev,
            { id: `split-${Date.now()}`, accountId: '', amount: 0 },
        ])
    }

    const handleRemoveSplit = (id: string) => {
        setSplits(prev => (prev.length > 1 ? prev.filter(split => split.id !== id) : prev))
    }

    const totalDebit = previewEntry?.lines.reduce((sum, line) => sum + (line.debit || 0), 0) || 0
    const totalCredit = previewEntry?.lines.reduce((sum, line) => sum + (line.credit || 0), 0) || 0
    const isBalanced = Math.abs(totalDebit - totalCredit) <= 0.01

    const amountError = selectedObligation && amount - selectedObligation.amountRemaining > 0.01
        ? 'El importe supera el saldo pendiente.'
        : null

    const isDateLocked = dateLock.locked
    const canConfirm = !previewError
        && !amountError
        && !referenceError
        && amount > 0
        && Math.abs(splitDiff) <= 0.01
        && isBalanced
        && !!selectedObligation
        && !isSaving
        && !isDateLocked

    const handleConfirm = async () => {
        if (!selectedObligation) return
        setIsSaving(true)
        const payload: RegisterTaxPaymentInput = {
            paidAt,
            method,
            reference,
            amount,
            splits: splits.map(s => ({ accountId: s.accountId, amount: s.amount })),
            obligationAccountId: obligationAccountId || undefined,
        }

        const result = await registerSettlement(selectedObligation, payload)
        setIsSaving(false)

        if (result.success && result.entryId) {
            onSaved(result.entryId, selectedObligation)
        } else {
            setPreviewError(result.error || 'No se pudo registrar el movimiento.')
            setMissingAccountLabel(result.missingAccountLabel || null)
            setMissingAccountCode(result.missingAccountCode || null)
            setMissingMappingKey(result.missingMappingKey || null)
        }
    }

    const handleRepairAccounts = async () => {
        setIsRepairingAccounts(true)
        try {
            await repairTaxAccounts()
            await onAccountsReload()
            setPreviewNonce(prev => prev + 1)
        } catch (error) {
            console.error('Error repairing tax accounts:', error)
        } finally {
            setIsRepairingAccounts(false)
        }
    }

    if (!open) return null

    const modalTitle = isReceivable ? 'Registrar cobro/transferencia' : 'Registrar pago'
    const modalSubtitle = isReceivable
        ? 'Carga el cobro y confirma el asiento.'
        : 'Carga el pago y confirma el asiento.'

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">{modalTitle}</h3>
                        <p className="text-xs text-slate-500">{modalSubtitle}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        Cerrar
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
                    <div className="lg:col-span-3 space-y-4">
                        {isDateLocked && (
                            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                                El mes {dateLock.periodKey || paidAt.slice(0, 7)} esta cerrado. Desbloquealo o elige otra fecha.
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Obligacion</label>
                                <select
                                    value={obligationId}
                                    onChange={(e) => setObligationId(e.target.value)}
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                                >
                                    <option value="">Seleccionar obligacion</option>
                                    {obligations.map(obligation => (
                                        <option key={obligation.id} value={obligation.id}>
                                            {obligation.tax} {obligation.periodKey} {obligation.jurisdiction && obligation.jurisdiction !== 'GENERAL' ? `(${obligation.jurisdiction})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    {isReceivable ? 'Fecha de cobro' : 'Fecha de pago'}
                                </label>
                                <input
                                    type="date"
                                    value={paidAt}
                                    onChange={(e) => setPaidAt(e.target.value)}
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Forma</label>
                                <select
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value as TaxPaymentMethod)}
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                                >
                                    <option value="VEP">VEP</option>
                                    <option value="BOLETA">Boleta</option>
                                    <option value="TRANSFERENCIA">Transferencia</option>
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="OTRO">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Concepto / Referencia</label>
                                <input
                                    type="text"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="Ej: VEP / transferencia / expediente"
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                                />
                                {referenceError && (
                                    <p className="text-xs text-amber-600 mt-1">{referenceError}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                {isReceivable ? 'Importe a cobrar' : 'Importe a pagar'}
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono outline-none focus:border-blue-600"
                            />
                            {selectedObligation && (
                                <p className="text-xs text-slate-400 mt-1">
                                    {isReceivable ? 'Saldo disponible' : 'Saldo pendiente'}: {formatCurrency(selectedObligation.amountRemaining)}
                                </p>
                            )}
                            {amountError && (
                                <p className="text-xs text-amber-600 mt-1">{amountError}</p>
                            )}
                        </div>

                        {needsReference && (
                            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                Normalmente se arrastra al periodo siguiente. Solo registra cobro si efectivamente hubo transferencia o compensacion.
                            </div>
                        )}

                        {missingAccountLabel && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 space-y-2">
                                <p>
                                    No se encontro la cuenta "{missingAccountLabel}".
                                    {missingAccountCode ? ` Codigo esperado ${missingAccountCode}.` : ''}
                                    {missingMappingKey ? ` Mapping ${missingMappingKey}.` : ''}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={handleRepairAccounts}
                                        disabled={isRepairingAccounts}
                                        className="px-3 py-1.5 rounded border border-amber-200 text-amber-700 bg-white text-xs font-semibold hover:bg-amber-50 disabled:opacity-50 flex items-center gap-1.5"
                                    >
                                        <ArrowClockwise size={14} />
                                        {isRepairingAccounts ? 'Reparando...' : 'Reparar cuentas fiscales'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onGoToAccounts}
                                        className="px-3 py-1.5 rounded border border-slate-200 text-slate-600 bg-white text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5"
                                    >
                                        <ArrowLeft size={14} />
                                        Ir a Plan de Cuentas
                                    </button>
                                </div>
                            </div>
                        )}

                        {missingAccountLabel && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                                    {isReceivable ? 'Cuenta del credito' : 'Cuenta del pasivo'}
                                </label>
                                <select
                                    value={obligationAccountId}
                                    onChange={(e) => setObligationAccountId(e.target.value)}
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                                >
                                    <option value="">Seleccionar cuenta</option>
                                    {postableAccounts.map(account => (
                                        <option key={account.id} value={account.id}>
                                            {account.code} - {account.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-500">
                                    {isReceivable ? 'Splits de cobro' : 'Splits de pago'}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleAddSplit}
                                    className="text-xs text-blue-600 font-semibold hover:underline"
                                >
                                    Agregar linea
                                </button>
                            </div>
                            {splits.map(split => (
                                <div key={split.id} className="flex gap-2 items-center">
                                    <select
                                        value={split.accountId}
                                        onChange={(e) => handleSplitChange(split.id, 'accountId', e.target.value)}
                                        className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-md p-2 outline-none focus:border-blue-600"
                                    >
                                        <option value="">{isReceivable ? 'Cuenta de cobro' : 'Cuenta de pago'}</option>
                                        {postableAccounts.map(account => (
                                            <option key={account.id} value={account.id}>
                                                {account.code} - {account.name}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={split.amount}
                                        onChange={(e) => handleSplitChange(split.id, 'amount', parseFloat(e.target.value) || 0)}
                                        className="w-32 text-right text-sm bg-slate-50 border border-slate-200 rounded-md p-2 font-mono outline-none focus:border-blue-600"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSplit(split.id)}
                                        className="text-xs text-slate-400 hover:text-slate-600"
                                    >
                                        Quitar
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-400">Total splits</span>
                                <span className={`font-mono font-semibold ${Math.abs(splitDiff) <= 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                    {formatCurrency(splitTotal)}
                                </span>
                            </div>
                            {Math.abs(splitDiff) > 0.01 && (
                                <p className="text-xs text-amber-600">
                                    Diferencia pendiente: {formatCurrency(splitDiff)}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-500 uppercase">Vista previa</span>
                            <span className={`text-xs font-semibold ${isBalanced ? 'text-emerald-600' : 'text-amber-600'}`}>
                                Debe {formatCurrency(totalDebit)} / Haber {formatCurrency(totalCredit)}
                            </span>
                        </div>
                        {previewEntry ? (
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-100 text-slate-500 uppercase">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-medium">Cuenta</th>
                                            <th className="px-3 py-2 text-right font-medium">Debe</th>
                                            <th className="px-3 py-2 text-right font-medium">Haber</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-700">
                                        {previewEntry.lines.map((line, idx) => {
                                            const accountName = accounts.find(a => a.id === line.accountId)?.name || line.accountId
                                            return (
                                                <tr key={`${line.accountId}-${idx}`}>
                                                    <td className="px-3 py-2">{accountName}</td>
                                                    <td className="px-3 py-2 text-right font-mono">
                                                        {line.debit ? formatCurrency(line.debit) : '-'}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono">
                                                        {line.credit ? formatCurrency(line.credit) : '-'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400">
                                Completa los datos para ver el asiento.
                            </div>
                        )}
                        {previewError && (
                            <p className="text-xs text-amber-600 mt-3">{previewError}</p>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-emerald-500 disabled:opacity-50"
                    >
                        {isSaving ? 'Registrando...' : (isReceivable ? 'Confirmar cobro' : 'Confirmar pago')}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ========================================
// Payment History Modal
// ========================================

interface PaymentHistoryModalProps {
    open: boolean
    obligation: TaxSettlementObligation | null
    rows: Array<{ payment: TaxPaymentLink; entry?: JournalEntry | null }>
    onClose: () => void
}

function PaymentHistoryModal({ open, obligation, rows, onClose }: PaymentHistoryModalProps) {
    if (!open || !obligation) return null
    const isReceivable = obligation.direction === 'RECEIVABLE'
    const title = isReceivable ? 'Cobros registrados' : 'Pagos registrados'

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
                        <p className="text-xs text-slate-500">
                            {obligation.tax} {obligation.periodKey} · {rows.length} asiento{rows.length === 1 ? '' : 's'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-xs text-slate-500 hover:text-slate-900"
                    >
                        Cerrar
                    </button>
                </div>
                <div className="p-6">
                    {rows.length === 0 ? (
                        <p className="text-xs text-slate-400">
                            {isReceivable ? 'Aun no hay cobros registrados.' : 'Aun no hay pagos registrados.'}
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {rows.map(({ payment, entry }) => (
                                <div key={payment.id} className="border border-slate-100 rounded-lg p-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {formatCurrency(payment.amount)} · {payment.method}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {new Date(payment.paidAt).toLocaleDateString('es-AR')}
                                            {payment.reference ? ` · ${payment.reference}` : ''}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400">Asiento</p>
                                        <p className="text-xs font-semibold text-slate-700">
                                            {entry?.memo || 'Pago impuesto'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ========================================
// Main Page Component
// ========================================

function ImpuestosPageContent() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    // State
    const [month, setMonth] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    const [regime, setRegime] = useState<TaxRegime>('RI')
    const [activeTab, setActiveTab] = useState<TabId>('iva')
    const [toast, setToast] = useState({ message: '', visible: false })
    const [isGenerating, setIsGenerating] = useState(false)

    // IIBB state
    const [iibbBase, setIibbBase] = useState(0)
    const [iibbAlicuota, setIibbAlicuota] = useState(3.0)
    const [iibbDeducciones, setIibbDeducciones] = useState(0)
    const [iibbDeduccionesTouched, setIibbDeduccionesTouched] = useState(false)
    const [iibbJurisdiction, setIibbJurisdiction] = useState('CORRIENTES')
    const [iibbActivity, setIibbActivity] = useState(IIBB_ACTIVITIES[0]?.value || 'COMERCIO_MINORISTA')
    const [iibbSircreb, setIibbSircreb] = useState(0)

    // MT state
    const [mtCategoria, setMtCategoria] = useState('H')
    const [mtMonto, setMtMonto] = useState(68900)

    // Hooks
    const {
        closure,
        ivaTotals,
        ivaByAlicuota,
        retencionesPercepciones,
        iibbSuggestedBase,
        generatedEntries,
        isLoading,
        isLocked,
        updateSteps,
        updateIIBBTotals,
        updateMTTotals,
        updateAutonomosSettings,
        buildEntryPreview,
        saveEntryFromPreview,
        taxObligations,
        getObligationsByPeriod,
        getPaymentsByObligation,
        buildSettlementPreview,
        registerTaxSettlement,
        closePeriod,
        unlockPeriod,
    } = useTaxClosure(month, regime)

    const { upcomingCards } = useTaxNotifications()

    // Account names map (for display)
    const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map())
    const [accounts, setAccounts] = useState<Account[]>([])
    const [taxHistory, setTaxHistory] = useState<TaxClosePeriod[]>([])

    // Preview modal state
    const [previewOpen, setPreviewOpen] = useState(false)
    const [previewEntry, setPreviewEntry] = useState<Omit<JournalEntry, 'id'> | null>(null)
    const [previewOriginal, setPreviewOriginal] = useState<Omit<JournalEntry, 'id'> | null>(null)
    const [previewType, setPreviewType] = useState<TaxEntryType | null>(null)
    const [previewSaving, setPreviewSaving] = useState(false)

    // Settlement modal state
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [paymentObligationId, setPaymentObligationId] = useState<string | null>(null)
    const [paymentModalObligations, setPaymentModalObligations] = useState<TaxSettlementObligation[] | null>(null)
    const [paymentHistoryOpen, setPaymentHistoryOpen] = useState(false)
    const [paymentHistoryObligation, setPaymentHistoryObligation] = useState<TaxSettlementObligation | null>(null)
    const [paymentHistoryRows, setPaymentHistoryRows] = useState<Array<{ payment: TaxPaymentLink; entry?: JournalEntry | null }>>([])
    const [pendingPreselectId, setPendingPreselectId] = useState<string | null>(null)

    const reloadAccounts = useCallback(async () => {
        try {
            const accounts = await db.accounts.toArray()
            const map = new Map<string, string>()
            accounts.forEach((a: { id: string; name: string }) => map.set(a.id, a.name))
            setAccounts(accounts)
            setAccountsMap(map)
        } catch (error) {
            console.error('Error loading accounts for ImpuestosPage:', error)
        }
    }, [])

    useEffect(() => {
        reloadAccounts()
    }, [reloadAccounts])

    useEffect(() => {
        let active = true
        const loadHistory = async () => {
            try {
                const closures = await listAllTaxClosures()
                if (!active) return
                const filtered = closures.filter(item => item.regime === regime)
                setTaxHistory(filtered)
            } catch (error) {
                console.error('Error loading tax history:', error)
            }
        }
        loadHistory()
        return () => {
            active = false
        }
    }, [closure?.id, regime])

    useEffect(() => {
        let active = true
        const normalize = (value: string) => value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')

        const resolveDefaultJurisdiction = async () => {
            let province: string | null = null

            try {
                const stored = localStorage.getItem('contalivre.company') || localStorage.getItem('company')
                if (stored) {
                    const parsed = JSON.parse(stored)
                    province = parsed?.provincia || parsed?.company?.provincia || parsed?.address?.provincia || null
                }
            } catch {
                province = null
            }

            try {
                if (!province) {
                    const settings = await db.settings.get('company' as string)
                    province = (settings as unknown as { provincia?: string; company?: { provincia?: string } })?.provincia
                        || (settings as unknown as { company?: { provincia?: string } })?.company?.provincia
                        || null
                }
            } catch {
                province = null
            }

            if (!province || !active) return
            const normalized = normalize(province)
            const match = IIBB_JURISDICTIONS.find(item =>
                normalize(item.value) === normalized || normalize(item.label).includes(normalized)
            )
            if (match) {
                setIibbJurisdiction(match.value)
            }
        }

        resolveDefaultJurisdiction()
        return () => {
            active = false
        }
    }, [])

    useEffect(() => {
        if (regime === 'MT' && activeTab === 'ret') {
            setActiveTab('iva')
        }
    }, [regime, activeTab])

    useEffect(() => {
        const tabParam = searchParams.get('tab')
        const periodParam = searchParams.get('period') || searchParams.get('month')
        const preselectParam = searchParams.get('preselectObligationId')

        if (tabParam && ['iva', 'iibb', 'ret', 'alertas', 'pagos', 'asientos'].includes(tabParam)) {
            if (tabParam !== activeTab) {
                setActiveTab(tabParam as TabId)
            }
        }

        if (periodParam && /^\d{4}-\d{2}$/.test(periodParam) && periodParam !== month) {
            setMonth(periodParam)
        }

        if (preselectParam) {
            setPendingPreselectId(preselectParam)
        }
    }, [searchParams, activeTab, month])

    // Initialize IIBB base from suggested
    useEffect(() => {
        if (iibbSuggestedBase > 0 && iibbBase === 0) {
            setIibbBase(iibbSuggestedBase)
        }
    }, [iibbSuggestedBase])

    useEffect(() => {
        setIibbDeduccionesTouched(false)
        setIibbSircreb(0)
    }, [month])

    const iibbPercepciones = useMemo(() => {
        return retencionesPercepciones
            .filter(r => r.impuesto === 'IIBB' && r.direction !== 'PRACTICADA')
            .reduce((sum, r) => sum + r.monto, 0)
    }, [retencionesPercepciones])

    useEffect(() => {
        if (!iibbDeduccionesTouched) {
            setIibbDeducciones(iibbPercepciones + iibbSircreb)
        }
    }, [iibbPercepciones, iibbSircreb, iibbDeduccionesTouched])

    // Show toast
    const showToast = useCallback((message: string) => {
        setToast({ message, visible: true })
    }, [])

    // Handle step toggle
    const handleToggleStep = useCallback(async (index: number) => {
        if (!closure) return

        const stepKeys: (keyof TaxClosureSteps)[] = ['operaciones', 'conciliacion', 'asientos', 'presentacion']
        const key = stepKeys[index]
        const newValue = !closure.steps[key]

        await updateSteps({ [key]: newValue })
    }, [closure, updateSteps])

    // Handle generate entry
    const handleGenerateEntry = useCallback(async (type: TaxEntryType) => {
        if (isLocked) {
            showToast('El periodo esta cerrado. Desbloquealo para generar asientos.')
            return
        }
        setIsGenerating(true)

        let closureOverride: Partial<TaxClosePeriod> | undefined

        // Update totals before generating preview
        if (type === 'iibb') {
            const impuestoDeterminado = iibbBase * (iibbAlicuota / 100)
            const totals = {
                base: iibbBase,
                alicuota: iibbAlicuota,
                impuestoDeterminado,
                deducciones: iibbDeducciones,
                saldo: impuestoDeterminado - iibbDeducciones,
                jurisdiction: iibbJurisdiction,
                activity: iibbActivity,
                sircreb: iibbSircreb,
            }
            await updateIIBBTotals(totals)
            closureOverride = { iibbTotals: totals }
        } else if (type === 'mt') {
            await updateMTTotals(mtCategoria, mtMonto)
            closureOverride = { mtTotals: { categoria: mtCategoria, montoMensual: mtMonto } }
        }

        const preview = await buildEntryPreview(type, closureOverride)
        setIsGenerating(false)

        if (preview.error || !preview.entry) {
            showToast(preview.error || 'Error al generar vista previa')
            return
        }

        const cloned = JSON.parse(JSON.stringify(preview.entry)) as Omit<JournalEntry, 'id'>
        const original = JSON.parse(JSON.stringify(preview.entry)) as Omit<JournalEntry, 'id'>
        setPreviewType(type)
        setPreviewEntry(cloned)
        setPreviewOriginal(original)
        setPreviewOpen(true)
    }, [
        iibbBase,
        iibbAlicuota,
        iibbDeducciones,
        iibbJurisdiction,
        iibbActivity,
        iibbSircreb,
        mtCategoria,
        mtMonto,
        buildEntryPreview,
        updateIIBBTotals,
        updateMTTotals,
        isLocked,
        showToast,
    ])

    const handleConfirmPreview = useCallback(async () => {
        if (!previewEntry || !previewType) return
        setPreviewSaving(true)
        const result = await saveEntryFromPreview(previewType, previewEntry)
        setPreviewSaving(false)

        if (result.success) {
            setPreviewOpen(false)
            setPreviewEntry(null)
            setPreviewOriginal(null)
            setPreviewType(null)
            showToast('Asiento generado correctamente')
            setActiveTab('asientos')
        } else {
            showToast(result.error || 'Error al generar asiento')
        }
    }, [previewEntry, previewType, saveEntryFromPreview, showToast])

    const handleRestorePreview = useCallback(() => {
        if (!previewOriginal) return
        const cloned = JSON.parse(JSON.stringify(previewOriginal)) as Omit<JournalEntry, 'id'>
        setPreviewEntry(cloned)
    }, [previewOriginal])

    const handleClosePreview = useCallback(() => {
        setPreviewOpen(false)
        setPreviewEntry(null)
        setPreviewOriginal(null)
        setPreviewType(null)
    }, [])

    const openPaymentModal = useCallback((
        obligationId?: string | null,
        obligationsOverride?: TaxSettlementObligation[] | null
    ) => {
        setPaymentModalObligations(obligationsOverride || null)
        setPaymentObligationId(obligationId || null)
        setPaymentModalOpen(true)
    }, [])

    const closePaymentModal = useCallback(() => {
        setPaymentModalOpen(false)
        setPaymentObligationId(null)
        setPaymentModalObligations(null)
    }, [])

    const handlePaymentSaved = useCallback((_entryId: string, obligation: TaxSettlementObligation) => {
        closePaymentModal()
        showToast(obligation.direction === 'RECEIVABLE'
            ? 'Cobro registrado correctamente'
            : 'Pago registrado correctamente')
    }, [closePaymentModal, showToast])

    useEffect(() => {
        if (!pendingPreselectId || activeTab !== 'pagos') return
        if (taxObligations.length === 0) return

        const target = taxObligations.find(o => o.id === pendingPreselectId)
        if (target) {
            openPaymentModal(target.id, taxObligations)
        } else {
            showToast('No se encontro la obligacion seleccionada.')
        }
        setPendingPreselectId(null)
    }, [pendingPreselectId, activeTab, taxObligations, openPaymentModal, showToast])

    const handleViewPayments = useCallback(async (obligation: TaxSettlementObligation) => {
        setPaymentHistoryObligation(obligation)
        const payments = await getPaymentsByObligation(obligation)
        const entries = await db.entries.bulkGet(payments.map(p => p.journalEntryId))
        const rows = payments.map((payment, idx) => ({ payment, entry: entries[idx] }))
        setPaymentHistoryRows(rows)
        setPaymentHistoryOpen(true)
    }, [getPaymentsByObligation])

    const handlePayNow = useCallback(async (card: DueDateCard) => {
        const period = card.month || month
        if (!period) {
            showToast('No se pudo identificar el periodo del vencimiento.')
            return
        }

        const obligations = await getObligationsByPeriod(period)
        const payables = obligations.filter(o => o.direction === 'PAYABLE')
        if (payables.length === 0) {
            showToast('No hay obligacion registrada para este vencimiento.')
            return
        }

        const jurisdiction = card.jurisdiction || 'GENERAL'
        let target = null as TaxSettlementObligation | null

        if (card.obligation === 'IVA') {
            if (card.action === 'DEPOSITO') {
                target = payables.find(o => o.tax === 'RET_DEPOSITAR' && o.jurisdiction === 'NACIONAL')
                    || payables.find(o => o.tax === 'PER_DEPOSITAR' && o.jurisdiction === 'NACIONAL')
                    || null
            } else {
                target = payables.find(o => o.tax === 'IVA') || null
            }
        } else if (card.obligation === 'IIBB_LOCAL' || card.obligation === 'IIBB_CM') {
            target = payables.find(o => o.tax === 'IIBB' && o.jurisdiction === jurisdiction)
                || payables.find(o => o.tax === 'IIBB')
                || null
        } else if (card.obligation === 'MONOTRIBUTO') {
            target = payables.find(o => o.tax === 'MONOTRIBUTO') || null
        } else if (card.obligation === 'AUTONOMOS') {
            target = payables.find(o => o.tax === 'AUTONOMOS') || null
        }

        if (!target) {
            showToast('No se encontro una obligacion para pagar este vencimiento.')
            return
        }

        const params = new URLSearchParams()
        params.set('tab', 'pagos')
        params.set('period', period)
        params.set('preselectObligationId', target.id)
        navigate(`/operaciones/impuestos?${params.toString()}`)
    }, [getObligationsByPeriod, month, navigate, showToast])

    // Handle close period
    const handleClosePeriod = useCallback(async () => {
        if (isLocked) {
            await unlockPeriod()
            showToast('Periodo desbloqueado correctamente')
        } else {
            await closePeriod()
            showToast('Periodo cerrado correctamente')
        }
    }, [closePeriod, unlockPeriod, isLocked, showToast])

    // Handle add manual retencion
    const handleAddManual = useCallback(() => {
        if (isLocked) {
            showToast('El periodo esta cerrado. Desbloquealo para editar.')
            return
        }
        // TODO: Open modal for manual entry
        showToast('Funcion en desarrollo')
    }, [showToast, isLocked])

    // Derived values
    const canClose = closure?.steps
        ? Object.values(closure.steps).every(Boolean) && !isLocked
        : false

    const hasRetWarning = retencionesPercepciones.some(r => r.estado !== 'OK')

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/operaciones')}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            aria-label="Volver a Operaciones"
                        >
                            <ArrowLeft size={16} weight="bold" />
                        </button>
                        <div>
                            <h1 className="text-lg font-bold leading-none text-slate-900">Impuestos</h1>
                            <span className="text-xs text-slate-500 font-medium">Liquidacion Mensual</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6">
                        {/* Period Selector */}
                        <PeriodPicker
                            value={month}
                            onChange={setMonth}
                            onClear={() => setMonth('')}
                        />

                        {/* Regime Switch */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 hidden md:block">Regimen:</span>
                            <select
                                value={regime}
                                onChange={(e) => setRegime(e.target.value as TaxRegime)}
                                className="text-sm bg-white border border-slate-300 rounded-md px-2 py-1.5 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none cursor-pointer"
                            >
                                <option value="RI">Resp. Inscripto</option>
                                <option value="MT">Monotributo</option>
                            </select>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Layout */}
            <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Sidebar */}
                <aside className="lg:col-span-3 space-y-6">
                    <SidebarChecklist
                        steps={closure?.steps || { operaciones: true, conciliacion: false, asientos: false, presentacion: false }}
                        status={closure?.status || 'DRAFT'}
                        isLocked={isLocked}
                        onToggleStep={handleToggleStep}
                        onClosePeriod={handleClosePeriod}
                        canClose={canClose}
                    />

                    {/* Contextual Help */}
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex gap-3 items-start">
                        <Info size={20} weight="duotone" className="text-blue-600 shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-sm font-bold text-blue-600 mb-1">Necesitas ayuda?</h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Si tenes dudas sobre IIBB Convenio Multilateral, consulta la wiki interna o escribile al contador senior.
                            </p>
                        </div>
                    </div>

                    {/* Historial de cierres */}
                    <div className="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Historial</h3>
                            <span className="text-xs text-slate-400 font-semibold">{taxHistory.length}</span>
                        </div>
                        {taxHistory.length === 0 ? (
                            <p className="text-xs text-slate-400">Sin cierres registrados.</p>
                        ) : (
                            <div className="space-y-3">
                                {taxHistory.slice(0, 6).map(item => {
                                    const snapshot = item.snapshot
                                    const iva = snapshot?.ivaTotals || item.ivaTotals
                                    const iibb = snapshot?.iibbTotals || item.iibbTotals
                                    const mt = snapshot?.mtTotals || item.mtTotals
                                    const isClosed = item.status === 'CLOSED'
                                    const isReady = item.steps ? Object.values(item.steps).every(Boolean) : false
                                    const statusLabel = isClosed ? 'CERRADO' : (isReady ? 'LISTO' : 'BORRADOR')
                                    const statusClass = isClosed
                                        ? 'bg-slate-100 text-slate-600'
                                        : isReady
                                            ? 'bg-emerald-50 text-emerald-600'
                                            : 'bg-blue-50 text-blue-600'

                                    return (
                                        <div key={item.id} className="border border-slate-100 rounded-xl p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-semibold text-slate-900">{formatMonth(item.month)}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${statusClass}`}>{statusLabel}</span>
                                            </div>
                                            <div className="text-xs text-slate-500 flex flex-wrap gap-2">
                                                {iva && <span>IVA: {formatCurrency(iva.saldo)}</span>}
                                                {iibb && <span>IIBB: {formatCurrency(iibb.saldo)}</span>}
                                                {mt && <span>MT: {formatCurrency(mt.montoMensual)}</span>}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setMonth(item.month)
                                                    setRegime(item.regime)
                                                    setActiveTab('asientos')
                                                }}
                                                className="mt-2 text-xs text-blue-600 font-semibold hover:underline"
                                            >
                                                Ver asientos
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </aside>

                {/* Content Area */}
                <main className="lg:col-span-9 flex flex-col gap-6">
                    {/* Tab Navigation */}
                    <TabNavigation
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        regime={regime}
                        hasRetWarning={hasRetWarning}
                    />

                    {/* Tab Panels */}
                    <div>
                        {/* IVA Tab */}
                        {activeTab === 'iva' && (
                            regime === 'RI' ? (
                                <IVATabRI
                                    df={ivaTotals?.debitoFiscal || 0}
                                    cf={ivaTotals?.creditoFiscal || 0}
                                    pagosACuenta={ivaTotals?.pagosACuenta || 0}
                                    saldo={ivaTotals?.saldo || 0}
                                    ivaFavorAnterior={ivaTotals?.ivaFavorAnterior}
                                    ivaFavorAnteriorDisponible={ivaTotals?.ivaFavorAnteriorDisponible}
                                    posicionMesSinArrastre={ivaTotals?.posicionMesSinArrastre}
                                    posicionMesConArrastre={ivaTotals?.posicionMesConArrastre}
                                    alicuotas={ivaByAlicuota}
                                    onGenerateEntry={() => handleGenerateEntry('iva')}
                                    isGenerating={isGenerating}
                                    isLocked={isLocked}
                                />
                            ) : (
                                <IVATabMT
                                    categoria={mtCategoria}
                                    monto={mtMonto}
                                    onUpdateCategoria={setMtCategoria}
                                    onUpdateMonto={setMtMonto}
                                    onGenerateEntry={() => handleGenerateEntry('mt')}
                                    isGenerating={isGenerating}
                                    isLocked={isLocked}
                                />
                            )
                        )}

                        {/* IIBB Tab */}
                        {activeTab === 'iibb' && (
                            <IIBBTab
                                base={iibbBase}
                                alicuota={iibbAlicuota}
                                deducciones={iibbDeducciones}
                                suggestedBase={iibbSuggestedBase}
                                jurisdiction={iibbJurisdiction}
                                activity={iibbActivity}
                                activities={IIBB_ACTIVITIES}
                                percepcionesAmount={iibbPercepciones}
                                sircreb={iibbSircreb}
                                percepcionesLabel={iibbJurisdiction === 'CABA'
                                    ? 'Percepcion AGIP'
                                    : iibbJurisdiction === 'BUENOS_AIRES'
                                        ? 'Percepcion ARBA'
                                        : 'Percepcion IIBB'}
                                onUpdateBase={setIibbBase}
                                onUpdateAlicuota={setIibbAlicuota}
                                onUpdateDeducciones={(val) => {
                                    setIibbDeducciones(val)
                                    setIibbDeduccionesTouched(true)
                                }}
                                onUpdateJurisdiction={setIibbJurisdiction}
                                onUpdateActivity={(val) => {
                                    setIibbActivity(val)
                                    const suggested = IIBB_ACTIVITIES.find(item => item.value === val)?.rate
                                    if (suggested !== undefined) {
                                        setIibbAlicuota(suggested)
                                    }
                                }}
                                onUpdateSircreb={setIibbSircreb}
                                onGenerateEntry={() => handleGenerateEntry('iibb')}
                                isGenerating={isGenerating}
                                isLocked={isLocked}
                            />
                        )}

                        {/* Retenciones Tab */}
                        {activeTab === 'ret' && (
                            <RetencionesTab
                                rows={retencionesPercepciones}
                                onAddManual={handleAddManual}
                                isLocked={isLocked}
                            />
                        )}

                        {/* Vencimientos Tab */}
                        {activeTab === 'alertas' && (
                            <VencimientosTab
                                cards={upcomingCards}
                                regime={regime}
                                autonomosSettings={closure?.autonomosSettings}
                                onUpdateAutonomos={updateAutonomosSettings}
                                onGenerateAutonomosEntry={() => handleGenerateEntry('autonomos')}
                                isGenerating={isGenerating}
                                isLocked={isLocked}
                                onPayNow={handlePayNow}
                            />
                        )}

                        {/* Pagos Tab */}
                        {activeTab === 'pagos' && (
                            <PagosTab
                                obligations={taxObligations}
                                onRegisterSettlement={(obligation) => openPaymentModal(obligation.id, taxObligations)}
                                onViewPayments={handleViewPayments}
                            />
                        )}

                        {/* Asientos Tab */}
                        {activeTab === 'asientos' && (
                            <AsientosTab
                                entries={generatedEntries}
                                accounts={accountsMap}
                                onGoToLiquidacion={() => setActiveTab('iva')}
                            />
                        )}
                    </div>
                </main>
            </div>

            <TaxEntryPreviewModal
                open={previewOpen}
                entry={previewEntry}
                accounts={accounts}
                onClose={handleClosePreview}
                onConfirm={handleConfirmPreview}
                onRestore={handleRestorePreview}
                onChange={(next) => setPreviewEntry(next)}
                isSaving={previewSaving}
            />

            <TaxSettlementModal
                open={paymentModalOpen}
                obligations={paymentModalObligations || taxObligations}
                accounts={accounts}
                selectedObligationId={paymentObligationId}
                currentPeriod={month}
                regime={regime}
                isCurrentPeriodLocked={isLocked}
                onClose={closePaymentModal}
                onSaved={handlePaymentSaved}
                buildPreview={buildSettlementPreview}
                registerSettlement={registerTaxSettlement}
                onAccountsReload={reloadAccounts}
                onGoToAccounts={() => navigate('/cuentas')}
            />

            <PaymentHistoryModal
                open={paymentHistoryOpen}
                obligation={paymentHistoryObligation}
                rows={paymentHistoryRows}
                onClose={() => setPaymentHistoryOpen(false)}
            />

            {/* Toast */}
            <Toast
                message={toast.message}
                isVisible={toast.visible}
                onClose={() => setToast({ ...toast, visible: false })}
            />

            {/* Animation styles */}
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                .animate-slide-in {
                    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
            `}</style>
        </div>
    )
}

// ========================================
// Export with Error Boundary Wrapper
// ========================================

export default function ImpuestosPage() {
    return (
        <ImpuestosErrorBoundary>
            <ImpuestosPageContent />
        </ImpuestosErrorBoundary>
    )
}
