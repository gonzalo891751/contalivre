/**
 * ImpuestosPage - Tax Management Module
 *
 * Pixel-perfect implementation based on docs/prototypes/IMPUESTOS.html
 * Manages IVA (RI/MT), IIBB, Retenciones/Percepciones, and tax due dates.
 */

import { useState, useEffect, useCallback, useMemo, useRef, Component, type ReactNode, type ErrorInfo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import type {
    TaxRegime,
    TaxClosureSteps,
    IVAAlicuotaDetail,
    RetencionPercepcionRow,
    DueDateCard,
    AutonomosSettings,
} from '../../core/impuestos/types'
import { formatCurrency } from '../../core/impuestos/types'

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

type TabId = 'iva' | 'iibb' | 'ret' | 'alertas' | 'asientos'

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
    onToggleStep: (index: number) => void
    onClosePeriod: () => void
    canClose: boolean
}

function SidebarChecklist({ steps, onToggleStep, onClosePeriod, canClose }: SidebarChecklistProps) {
    const stepItems = [
        { key: 'operaciones', label: 'Operaciones', sublabel: 'Ventas y Compras ok' },
        { key: 'conciliacion', label: 'Conciliacion', sublabel: 'Retenciones/Perc.' },
        { key: 'asientos', label: 'Asientos', sublabel: 'Generar y exportar' },
        { key: 'presentacion', label: 'Presentacion', sublabel: 'Marcar DJ presentada' },
    ]

    const isReady = Object.values(steps).every(Boolean)
    const statusLabel = isReady ? 'LISTO PARA CERRAR' : 'BORRADOR'
    const statusClass = isReady
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
                            onClick={() => isActive && onToggleStep(index)}
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
                disabled={!canClose}
                className={`w-full mt-6 py-2.5 px-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    canClose
                        ? 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-lg shadow-blue-500/30 hover:opacity-95 hover:-translate-y-0.5'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
            >
                <LockKey size={16} weight="bold" />
                Cerrar Mes
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
    const tabs: { id: TabId; label: string; badge?: string; warning?: boolean }[] = [
        { id: 'iva', label: 'IVA', badge: regime === 'RI' ? 'RI' : undefined },
        { id: 'iibb', label: 'Ingresos Brutos' },
        { id: 'ret', label: 'Retenciones', warning: hasRetWarning },
        { id: 'alertas', label: 'Vencimientos' },
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
    alicuotas: IVAAlicuotaDetail[]
    onGenerateEntry: () => void
    isGenerating: boolean
}

function IVATabRI({ df, cf, pagosACuenta, saldo, alicuotas, onGenerateEntry, isGenerating }: IVATabRIProps) {
    const dfChange = df > 0 ? '+12%' : ''

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
                        Posicion Mensual
                    </p>
                    <div className="flex flex-col">
                        <span className={`text-2xl font-bold font-mono ${saldo >= 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                            {formatCurrency(Math.abs(saldo))}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                            {saldo >= 0 ? 'A Pagar' : 'A Favor'}
                        </span>
                    </div>
                    <button
                        onClick={onGenerateEntry}
                        disabled={isGenerating}
                        className="absolute bottom-4 right-4 bg-white border border-blue-100 text-blue-600 hover:bg-blue-50 p-2 rounded-lg shadow-sm transition-all disabled:opacity-50"
                        title="Generar Asiento"
                    >
                        <MagicWand size={16} weight="bold" />
                    </button>
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
                                    <td className="px-6 py-3 text-right text-slate-900">{formatCurrency(saldo + pagosACuenta)}</td>
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
}

function IVATabMT({ categoria, monto, onUpdateMonto, onGenerateEntry, isGenerating }: IVATabMTProps) {
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
                            className="bg-transparent border-none w-full font-mono font-semibold focus:outline-none text-slate-900"
                        />
                    </div>
                </div>
                <button
                    onClick={onGenerateEntry}
                    disabled={isGenerating || monto <= 0}
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
    onUpdateBase: (val: number) => void
    onUpdateAlicuota: (val: number) => void
    onUpdateDeducciones: (val: number) => void
    onUpdateJurisdiction: (val: string) => void
    onGenerateEntry: () => void
    isGenerating: boolean
}

function IIBBTab({
    base,
    alicuota,
    deducciones,
    suggestedBase,
    jurisdiction,
    onUpdateBase,
    onUpdateAlicuota,
    onUpdateDeducciones,
    onUpdateJurisdiction,
    onGenerateEntry,
    isGenerating,
}: IIBBTabProps) {
    const impuestoDeterminado = base * (alicuota / 100)
    const saldoFinal = impuestoDeterminado - deducciones

    return (
        <div className="space-y-6">
            {/* Subtabs */}
            <div className="flex gap-4 border-b border-slate-200 pb-1 mb-4">
                <button className="text-sm font-bold text-blue-600 border-b-2 border-blue-600 pb-2">
                    Local (Directo)
                </button>
                <button className="text-sm font-medium text-slate-400 pb-2 hover:text-slate-900 transition-colors">
                    Conv. Multilateral
                </button>
            </div>

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
                                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600"
                            >
                                {IIBB_JURISDICTIONS.map(item => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                ))}
                            </select>
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
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 font-mono"
                                />
                                {suggestedBase > 0 && base !== suggestedBase && (
                                    <button
                                        onClick={() => onUpdateBase(suggestedBase)}
                                        className="text-xs text-blue-600 mt-1 hover:underline"
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
                                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 font-mono"
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

                    <div className="flex-1 overflow-y-auto mb-4 max-h-48">
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <div>
                                <p className="text-sm font-medium">SIRCREB Bancario</p>
                                <p className="text-xs text-slate-400">Automatico</p>
                            </div>
                            <span className="font-mono text-sm font-semibold text-emerald-600">
                                - {formatCurrency(deducciones * 0.8)}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <div>
                                <p className="text-sm font-medium">Percepcion AGIP</p>
                                <p className="text-xs text-slate-400">Comprobantes</p>
                            </div>
                            <span className="font-mono text-sm font-semibold text-emerald-600">
                                - {formatCurrency(deducciones * 0.2)}
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
                            className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-blue-600 font-mono"
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
                        disabled={isGenerating || saldoFinal <= 0}
                        className="mt-4 w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-2 rounded-lg font-medium text-sm shadow-md disabled:opacity-50"
                    >
                        Confirmar y Generar Asiento
                    </button>
                </div>
            </div>
        </div>
    )
}

// ========================================
// Retenciones Tab
// ========================================

interface RetencionesTabProps {
    rows: RetencionPercepcionRow[]
    onAddManual: () => void
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

function RetencionesTab({ rows, onAddManual }: RetencionesTabProps) {
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
                    className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-md hover:border-blue-600 text-slate-500 font-medium transition-colors flex items-center gap-1"
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
}

function VencimientosTab({
    cards,
    regime,
    autonomosSettings,
    onUpdateAutonomos,
    onGenerateAutonomosEntry,
    isGenerating,
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
            const key = card.uniqueKey || `${card.title}:${card.dueDate}:${card.description}`
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
                        {card.actionLabel && (
                            <div className="flex gap-2 mt-4">
                                <button className="flex-1 text-xs border border-slate-200 py-1.5 rounded hover:bg-slate-50 font-medium">
                                    {card.actionLabel}
                                </button>
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
                                onClick={() => onUpdateAutonomos({
                                    enabled: !autonomosSettings?.enabled,
                                    monthlyAmount: autonomosSettings?.monthlyAmount || 0,
                                    dueDay: autonomosSettings?.dueDay || 15,
                                })}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    autonomosSettings?.enabled ? 'bg-purple-600' : 'bg-slate-200'
                                }`}
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
                                            className="bg-transparent border-none w-full font-mono font-semibold focus:outline-none text-slate-900"
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
                                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-md px-3 py-2 font-mono focus:outline-none focus:border-purple-500"
                                    />
                                    <p className="text-xs text-slate-400 mt-1">
                                        Segun terminacion de CUIT (del 1 al 31)
                                    </p>
                                </div>

                                <button
                                    onClick={onGenerateAutonomosEntry}
                                    disabled={isGenerating || (autonomosSettings?.monthlyAmount || 0) <= 0}
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
// Main Page Component
// ========================================

function ImpuestosPageContent() {
    const navigate = useNavigate()
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
    const [iibbJurisdiction, setIibbJurisdiction] = useState('CABA')

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
        updateSteps,
        updateIIBBTotals,
        updateMTTotals,
        updateAutonomosSettings,
        generateEntry,
        closePeriod,
    } = useTaxClosure(month, regime)

    const { upcomingCards } = useTaxNotifications()

    // Account names map (for display)
    const [accountsMap, setAccountsMap] = useState<Map<string, string>>(new Map())

    useEffect(() => {
        async function loadAccounts() {
            try {
                const accounts = await db.accounts.toArray()
                const map = new Map<string, string>()
                accounts.forEach((a: { id: string; name: string }) => map.set(a.id, a.name))
                setAccountsMap(map)
            } catch (error) {
                console.error('Error loading accounts for ImpuestosPage:', error)
            }
        }
        loadAccounts()
    }, [])

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

    // Initialize IIBB base from suggested
    useEffect(() => {
        if (iibbSuggestedBase > 0 && iibbBase === 0) {
            setIibbBase(iibbSuggestedBase)
        }
    }, [iibbSuggestedBase])

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
    const handleGenerateEntry = useCallback(async (type: 'iva' | 'iibb' | 'mt' | 'autonomos') => {
        setIsGenerating(true)

        // Update totals before generating
        if (type === 'iibb') {
            const impuestoDeterminado = iibbBase * (iibbAlicuota / 100)
            await updateIIBBTotals({
                base: iibbBase,
                alicuota: iibbAlicuota,
                impuestoDeterminado,
                deducciones: iibbDeducciones,
                saldo: impuestoDeterminado - iibbDeducciones,
            })
        } else if (type === 'mt') {
            await updateMTTotals(mtCategoria, mtMonto)
        }

        const result = await generateEntry(type)
        setIsGenerating(false)

        if (result.success) {
            showToast('Asiento generado correctamente')
            setActiveTab('asientos')
        } else {
            showToast(result.error || 'Error al generar asiento')
        }
    }, [iibbBase, iibbAlicuota, iibbDeducciones, mtCategoria, mtMonto, generateEntry, updateIIBBTotals, updateMTTotals, showToast])

    // Handle close period
    const handleClosePeriod = useCallback(async () => {
        await closePeriod()
        showToast('Periodo cerrado correctamente')
    }, [closePeriod, showToast])

    // Handle add manual retencion
    const handleAddManual = useCallback(() => {
        // TODO: Open modal for manual entry
        showToast('Funcion en desarrollo')
    }, [showToast])

    // Derived values
    const canClose = closure?.steps
        ? Object.values(closure.steps).every(Boolean)
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
                                    alicuotas={ivaByAlicuota}
                                    onGenerateEntry={() => handleGenerateEntry('iva')}
                                    isGenerating={isGenerating}
                                />
                            ) : (
                                <IVATabMT
                                    categoria={mtCategoria}
                                    monto={mtMonto}
                                    onUpdateCategoria={setMtCategoria}
                                    onUpdateMonto={setMtMonto}
                                    onGenerateEntry={() => handleGenerateEntry('mt')}
                                    isGenerating={isGenerating}
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
                                onUpdateBase={setIibbBase}
                                onUpdateAlicuota={setIibbAlicuota}
                                onUpdateDeducciones={setIibbDeducciones}
                                onUpdateJurisdiction={setIibbJurisdiction}
                                onGenerateEntry={() => handleGenerateEntry('iibb')}
                                isGenerating={isGenerating}
                            />
                        )}

                        {/* Retenciones Tab */}
                        {activeTab === 'ret' && (
                            <RetencionesTab
                                rows={retencionesPercepciones}
                                onAddManual={handleAddManual}
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
