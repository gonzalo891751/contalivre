import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Package,
    CurrencyDollar,
    ChartLineUp,
    UsersThree,
    Bank,
    Receipt,
    ArrowFatLinesUp,
    ArrowFatLinesDown,
    TrendUp,
    CaretRight,
    Warning,
    CheckCircle,
    LockKey,
    Info,
    Clock,
    Armchair,
} from '@phosphor-icons/react'
import { db } from '../storage/db'
import { calculateAllValuations } from '../core/inventario/costing'
import { getFixedAssetsMetrics } from '../storage/fixedAssets'
import { useIndicatorsMetrics } from '../hooks/useIndicatorsMetrics'
import { usePeriodYear } from '../hooks/usePeriodYear'
import { useTaxClosure } from '../hooks/useTaxClosure'
import { useUpcomingTaxNotifications } from '../hooks/useTaxNotifications'
import type { TaxRegime } from '../core/impuestos/types'

/**
 * Hub de Operaciones
 *
 * Punto de entrada para gestión de activos, pasivos y operaciones comerciales.
 * Siguiendo el prototipo docs/prototypes/Operaciones.html
 */
export default function OperacionesPage() {
    const navigate = useNavigate()
    const { year: periodYear } = usePeriodYear()
    const periodId = String(periodYear)

    const products = useLiveQuery(async () => {
        const all = await db.bienesProducts.toArray()
        return all.filter(product => !product.periodId || product.periodId === periodId)
    }, [periodId])
    const movements = useLiveQuery(async () => {
        const all = await db.bienesMovements.toArray()
        return all.filter(movement => !movement.periodId || movement.periodId === periodId)
    }, [periodId])
    const settings = useLiveQuery(() => db.bienesSettings.get('bienes-settings'), [])
    const entries = useLiveQuery(() => db.entries.toArray(), [])
    const accounts = useLiveQuery(() => db.accounts.toArray(), [])
    const indicators = useIndicatorsMetrics()

    // Fixed Assets metrics
    const fixedAssetsMetrics = useLiveQuery(
        () => getFixedAssetsMetrics(periodId, periodYear),
        [periodId, periodYear]
    )

    // Tax data for Fiscal/Impuestos card
    const currentMonth = useMemo(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }, [])

    // Default to RI (Responsable Inscripto) for the card - user can change in Impuestos page
    const taxRegime: TaxRegime = 'RI'
    const { ivaTotals, isLoading: isTaxLoading } = useTaxClosure(currentMonth, taxRegime)
    const { notifications, unreadCount } = useUpcomingTaxNotifications()

    // Determine tax status based on notifications and closure status
    const taxStatus = useMemo(() => {
        if (isTaxLoading) return { label: 'Cargando...', isAlert: false }

        // Check for overdue or pending notifications
        const hasOverdue = notifications.some(n => {
            const dueDate = new Date(n.dueDate)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            dueDate.setHours(0, 0, 0, 0)
            return dueDate < today && n.status !== 'PAID' && n.status !== 'SUBMITTED'
        })

        if (hasOverdue) return { label: 'Vencido', isAlert: true }

        const hasPending = notifications.some(n => {
            const dueDate = new Date(n.dueDate)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            dueDate.setHours(0, 0, 0, 0)
            const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return daysUntilDue <= 5 && daysUntilDue >= 0 && n.status !== 'PAID' && n.status !== 'SUBMITTED'
        })

        if (hasPending) return { label: `${unreadCount} Vencimientos`, isAlert: true }

        return { label: 'Al dia', isAlert: false }
    }, [notifications, unreadCount, isTaxLoading])

    // Get IVA position for display
    const taxPosition = useMemo(() => {
        if (isTaxLoading || !ivaTotals) return null
        return ivaTotals.saldo
    }, [ivaTotals, isTaxLoading])

    const period = useMemo(() => {
        const now = new Date()
        const monthIndex = now.getMonth()
        const startDate = new Date(periodYear, monthIndex, 1)
        const endDate = new Date(periodYear, monthIndex + 1, 0)
        const prevMonthIndex = monthIndex - 1
        const prevStartDate = prevMonthIndex >= 0
            ? new Date(periodYear, prevMonthIndex, 1)
            : new Date(periodYear - 1, 11, 1)
        const prevEndDate = prevMonthIndex >= 0
            ? new Date(periodYear, prevMonthIndex + 1, 0)
            : new Date(periodYear - 1, 12, 0)
        const toISO = (date: Date) => date.toISOString().split('T')[0]
        return {
            start: toISO(startDate),
            end: toISO(endDate),
            prevStart: toISO(prevStartDate),
            prevEnd: toISO(prevEndDate),
        }
    }, [periodYear])

    const inventoryMetrics = useMemo(() => {
        if (!products || !movements) {
            return {
                hasData: false,
                stockValue: 0,
                totalUnits: 0,
                lowStockAlerts: 0,
            }
        }
        const costMethod = settings?.costMethod || 'PPP'
        const valuations = calculateAllValuations(products, movements, costMethod)
        const stockValue = valuations.reduce((sum, v) => sum + v.totalValue, 0)
        const totalUnits = valuations.reduce((sum, v) => sum + v.currentStock, 0)
        const lowStockAlerts = valuations.filter(v => v.hasAlert).length
        const hasData = products.length > 0 || movements.length > 0
        return { hasData, stockValue, totalUnits, lowStockAlerts }
    }, [movements, products, settings])

    const entryMetrics = useMemo(() => {
        if (!entries || !accounts) {
            return {
                current: { sales: 0, cmv: 0, count: 0 },
                prev: { sales: 0, cmv: 0, count: 0 },
            }
        }
        const normalize = (value: string) => value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')

        const salesAccountIds = new Set<string>()
        const cmvAccountIds = new Set<string>()
        const cmvCodes = new Set(['4.3.01', '5.1.01'])

        accounts.forEach(acc => {
            if (acc.isHeader) return
            const name = normalize(acc.name)
            if (acc.statementGroup === 'SALES' || name.includes('venta')) {
                salesAccountIds.add(acc.id)
            }
            if (cmvCodes.has(acc.code) || name.includes('cmv') || name.includes('costo mercader')) {
                cmvAccountIds.add(acc.id)
            }
        })

        const computeFromEntries = (start: string, end: string) => {
            const scoped = entries.filter(entry => entry.date >= start && entry.date <= end && entry.sourceType === 'sale')
            let sales = 0
            let cmv = 0
            let count = 0

            scoped.forEach(entry => {
                let hasSalesLine = false
                let hasCmvLine = false
                entry.lines.forEach(line => {
                    if (salesAccountIds.has(line.accountId)) {
                        sales += (line.credit || 0) - (line.debit || 0)
                        hasSalesLine = true
                    }
                    if (cmvAccountIds.has(line.accountId)) {
                        cmv += (line.debit || 0) - (line.credit || 0)
                        hasCmvLine = true
                    }
                })

                if (entry.metadata?.journalRole === 'sale' && !hasSalesLine) {
                    const total = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
                    sales += total
                    hasSalesLine = true
                }
                if (entry.metadata?.journalRole === 'cogs' && !hasCmvLine) {
                    const total = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0)
                    cmv += total
                    hasCmvLine = true
                }

                if (hasSalesLine || hasCmvLine) count += 1
            })

            return { sales, cmv, count }
        }

        return {
            current: computeFromEntries(period.start, period.end),
            prev: computeFromEntries(period.prevStart, period.prevEnd),
        }
    }, [accounts, entries, period])

    const movementMetrics = useMemo(() => {
        if (!movements) {
            return {
                current: { sales: 0, cmv: 0, count: 0 },
                prev: { sales: 0, cmv: 0, count: 0 },
            }
        }
        const computeFromMovements = (start: string, end: string) => {
            const salesMovs = movements.filter(m => m.type === 'SALE' && m.date >= start && m.date <= end)
            const sales = salesMovs.reduce((sum, m) => sum + m.subtotal, 0)
            const cmv = salesMovs.reduce((sum, m) => sum + (m.costTotalAssigned || 0), 0)
            return { sales, cmv, count: salesMovs.length }
        }
        return {
            current: computeFromMovements(period.start, period.end),
            prev: computeFromMovements(period.prevStart, period.prevEnd),
        }
    }, [movements, period])

    const useMovements = movementMetrics.current.count > 0 || movementMetrics.prev.count > 0
    const currentSales = useMovements ? movementMetrics.current.sales : entryMetrics.current.sales
    const currentCmv = useMovements ? movementMetrics.current.cmv : entryMetrics.current.cmv
    const prevSales = useMovements ? movementMetrics.prev.sales : entryMetrics.prev.sales
    const prevCmv = useMovements ? movementMetrics.prev.cmv : entryMetrics.prev.cmv
    const hasOperatingData = useMovements
        ? movementMetrics.current.count > 0
        : entryMetrics.current.count > 0
    const grossMargin = currentSales > 0 ? ((currentSales - currentCmv) / currentSales) * 100 : null
    const salesDelta = prevSales > 0 ? ((currentSales - prevSales) / prevSales) * 100 : null
    const cmvDelta = prevCmv > 0 ? ((currentCmv - prevCmv) / prevCmv) * 100 : null
    const rotation = inventoryMetrics.stockValue > 0 && currentSales > 0
        ? currentSales / inventoryMetrics.stockValue
        : null

    const cashAvailable = indicators?.disponibilidades
    const hasCashData = indicators && indicators.entriesCount > 0 && cashAvailable !== null

    const formatCurrency = (value?: number | null) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
            return '—'
        }
        if (value >= 1000000) {
            return `$ ${(value / 1000000).toFixed(1)}M`
        }
        return `$ ${value.toLocaleString('es-AR')}`
    }

    const formatPercent = (value: number | null) => {
        if (value === null || Number.isNaN(value)) return '—'
        return `${value.toFixed(1)}%`
    }

    const handleNavigateToInventario = () => {
        navigate('/operaciones/inventario')
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 scroll-smooth bg-slate-50">
            {/* KPI Strip */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Ventas del Mes */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ventas (Mes)</span>
                        {salesDelta !== null && hasOperatingData && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                                salesDelta >= 0
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-red-50 text-red-600'
                            }`}>
                                <TrendUp weight="bold" size={12} /> {salesDelta >= 0 ? '+' : ''}{salesDelta.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <div className="font-mono text-2xl font-bold text-slate-900">
                        {hasOperatingData ? formatCurrency(currentSales) : '—'}
                    </div>
                    {hasOperatingData ? (
                        <div className="text-xs text-slate-400 mt-1">
                            {prevSales > 0 ? `vs. ${formatCurrency(prevSales)} mes anterior` : 'Sin base previa'}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 mt-1">
                            Registrá compras/ventas para ver métricas.
                        </div>
                    )}
                </div>

                {/* CMV del Mes */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">CMV (Mes)</span>
                        {cmvDelta !== null && hasOperatingData && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${
                                cmvDelta >= 0
                                    ? 'bg-red-50 text-red-500'
                                    : 'bg-emerald-50 text-emerald-600'
                            }`}>
                                <TrendUp weight="bold" size={12} /> {cmvDelta >= 0 ? '+' : ''}{cmvDelta.toFixed(1)}%
                            </span>
                        )}
                    </div>
                    <div className="font-mono text-2xl font-bold text-slate-900">
                        {hasOperatingData ? formatCurrency(currentCmv) : '—'}
                    </div>
                    {hasOperatingData ? (
                        <div className="text-xs text-slate-400 mt-1">
                            {prevCmv > 0 ? `vs. ${formatCurrency(prevCmv)} mes anterior` : 'Sin base previa'}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 mt-1">
                            Registrá compras/ventas para ver métricas.
                        </div>
                    )}
                </div>

                {/* Margen Bruto */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Margen Bruto</span>
                        <span className="text-slate-400 text-xs"><Info size={14} /></span>
                    </div>
                    <div className="font-mono text-2xl font-bold text-blue-600">
                        {formatPercent(grossMargin)}
                    </div>
                    {hasOperatingData && grossMargin !== null ? (
                        <div className="text-xs text-slate-400 mt-1">Calculado sobre ventas y CMV</div>
                    ) : (
                        <div className="text-xs text-slate-400 mt-1">
                            Registrá compras/ventas para ver métricas.
                        </div>
                    )}
                </div>

                {/* Caja Disponible */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Caja Disponible</span>
                    </div>
                    <div className="font-mono text-2xl font-bold text-slate-900">
                        {hasCashData ? formatCurrency(cashAvailable as number) : 'Conectar Caja/Bancos'}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                        {hasCashData ? 'Basado en Libro Diario' : 'Integra caja y bancos para ver disponible.'}
                    </div>
                </div>
            </section>

            {/* Activos y Tenencias Header + Quick Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-slate-200 pb-4">
                <div>
                    <h2 className="font-display font-semibold text-2xl text-slate-900">Activos y Tenencias</h2>
                    <p className="text-slate-500 mt-1">Administra lo que tenes: stock, inversiones y disponibilidades.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleNavigateToInventario}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <ArrowFatLinesUp className="text-emerald-500" size={16} weight="fill" /> Registrar Venta
                    </button>
                    <button
                        onClick={handleNavigateToInventario}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
                    >
                        <ArrowFatLinesDown className="text-blue-600" size={16} weight="fill" /> Registrar Compra
                    </button>
                </div>
            </div>

            {/* Activos Section */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {/* PRIMARY CARD: Bienes de Cambio (Inventario) */}
                <div
                    className="col-span-1 md:col-span-2 xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-md hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer relative overflow-hidden group"
                    onClick={handleNavigateToInventario}
                >
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

                    <div className="p-6 md:p-8 flex flex-col h-full relative z-10">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-2xl border border-blue-100">
                                    <Package weight="duotone" size={28} />
                                </div>
                                <div>
                                    <h3 className="font-display font-bold text-xl text-slate-900">Bienes de Cambio (Inventario)</h3>
                                    <p className="text-sm text-slate-500">Controla tu stock, compras, ventas y kardex.</p>
                                </div>
                            </div>
                            {/* Status Badge */}
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1">
                                <CheckCircle weight="fill" size={12} /> Activo
                            </span>
                        </div>

                        {/* Internal KPIs */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Stock Valuado</div>
                                <div className="font-mono font-semibold text-slate-900">
                                    {inventoryMetrics.hasData ? formatCurrency(inventoryMetrics.stockValue) : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Unidades</div>
                                <div className="font-mono font-semibold text-slate-900">
                                    {inventoryMetrics.hasData ? inventoryMetrics.totalUnits.toLocaleString() : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">CMV Periodo</div>
                                <div className="font-mono font-semibold text-slate-900">
                                    {hasOperatingData ? formatCurrency(currentCmv) : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500 mb-1">Rotacion</div>
                                <div className="font-mono font-semibold text-slate-900">
                                    {rotation !== null ? `${rotation.toFixed(2)}x` : '—'}
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-6">
                            <div className="flex -space-x-2">
                                {inventoryMetrics.lowStockAlerts > 0 && (
                                    <div className="text-xs text-slate-500 italic flex items-center gap-1">
                                        <Warning className="text-amber-500" weight="fill" size={14} />
                                        Tenes {inventoryMetrics.lowStockAlerts} items bajo stock minimo.
                                    </div>
                                )}
                            </div>

                            {/* Primary Action */}
                            <button
                                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all transform hover:-translate-y-0.5 focus:ring-4 focus:ring-blue-300/50"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleNavigateToInventario()
                                }}
                            >
                                Gestionar Inventario <CaretRight weight="bold" size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Moneda Extranjera */}
                <div
                    className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group"
                    onClick={() => navigate('/operaciones/moneda-extranjera')}
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xl group-hover:bg-blue-100 transition-colors">
                            <CurrencyDollar weight="duotone" size={24} />
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100">Activo</span>
                    </div>
                    <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Moneda Extranjera</h3>
                    <p className="text-sm text-slate-500 mb-4">Gestion de cajas en USD/EUR y diferencias de cambio automaticas.</p>
                    <div className="mt-auto pt-4 border-t border-slate-50">
                        <button className="text-sm font-medium text-blue-600 flex items-center gap-2 group-hover:text-blue-700">
                            Ver cotizaciones <CaretRight size={14} weight="bold" />
                        </button>
                    </div>
                </div>

                {/* Bienes de Uso */}
                <div
                    className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group"
                    onClick={() => navigate('/operaciones/bienes-uso')}
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xl group-hover:bg-amber-100 transition-colors">
                            <Armchair weight="duotone" size={24} />
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-50 text-emerald-600 border border-emerald-100">Activo</span>
                    </div>
                    <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Bienes de Uso</h3>
                    <p className="text-sm text-slate-500 mb-4">Activos fijos, amortizaciones y ajuste por inflacion (RT6).</p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <div className="text-xs text-slate-500">Bienes Activos</div>
                            <div className="font-mono font-semibold text-slate-900">
                                {fixedAssetsMetrics?.hasData ? fixedAssetsMetrics.count : '0'}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Valor Neto</div>
                            <div className="font-mono font-semibold text-slate-900">
                                {fixedAssetsMetrics?.hasData ? formatCurrency(fixedAssetsMetrics.totalNBV) : '—'}
                            </div>
                        </div>
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-50">
                        <button className="text-sm font-medium text-blue-600 flex items-center gap-2 group-hover:text-blue-700">
                            Gestionar <CaretRight size={14} weight="bold" />
                        </button>
                    </div>
                </div>

                {/* Placeholder: Inversiones */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col opacity-90 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center text-xl">
                            <ChartLineUp weight="duotone" size={24} />
                        </div>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">Proximamente</span>
                    </div>
                    <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Inversiones</h3>
                    <p className="text-sm text-slate-500 mb-4">Plazos fijos, Fondos Comunes y Titulos. Devengamiento automatico.</p>
                    <div className="mt-auto pt-4 border-t border-slate-50">
                        <button className="text-sm font-medium text-slate-400 cursor-not-allowed flex items-center gap-2" disabled>
                            Conectar cuenta <LockKey size={14} />
                        </button>
                    </div>
                </div>
            </section>

            {/* Pasivos Section */}
            <div className="mt-8">
                <h2 className="font-display font-semibold text-2xl text-slate-900 mb-1">Pasivos y Deudas</h2>
                <p className="text-slate-500 mb-6">Mantene tus obligaciones al dia para evitar intereses.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Proveedores */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-amber-400 transition-all group cursor-pointer">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-xl group-hover:bg-amber-100 transition-colors">
                                    <UsersThree weight="duotone" size={24} />
                                </div>
                                <span className="font-semibold text-slate-900">Proveedores</span>
                            </div>
                            <span className="bg-amber-50 text-amber-600 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 border border-amber-100">
                                <Warning weight="fill" size={10} /> 2 Vencimientos
                            </span>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-xs text-slate-500">Saldo a pagar</div>
                                <div className="font-mono text-lg font-bold text-slate-900">$ 320.000</div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-white transition-all">
                                <CaretRight weight="bold" size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Prestamos */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-400 transition-all group cursor-pointer">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center text-xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                    <Bank weight="duotone" size={24} />
                                </div>
                                <span className="font-semibold text-slate-900">Prestamos</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-xs text-slate-500">Proxima cuota (15 dias)</div>
                                <div className="font-mono text-lg font-bold text-slate-900">$ 45.200</div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                                <CaretRight weight="bold" size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Impuestos */}
                    <div
                        className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-400 transition-all group cursor-pointer"
                        onClick={() => navigate('/operaciones/impuestos')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && navigate('/operaciones/impuestos')}
                        aria-label="Ir a modulo de Impuestos"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-xl group-hover:bg-blue-100 transition-colors">
                                    <Receipt weight="duotone" size={24} />
                                </div>
                                <span className="font-semibold text-slate-900">Fiscal / Impuestos</span>
                            </div>
                            {taxStatus.isAlert ? (
                                <span className="bg-amber-50 text-amber-600 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 border border-amber-100">
                                    <Clock weight="fill" size={10} /> {taxStatus.label}
                                </span>
                            ) : (
                                <span className="bg-emerald-50 text-emerald-600 text-xs px-2 py-1 rounded-full font-bold border border-emerald-100">
                                    {taxStatus.label}
                                </span>
                            )}
                        </div>
                        <div className="flex justify-between items-end">
                            <div>
                                <div className="text-xs text-slate-500">
                                    {taxRegime === 'RI' ? 'Posicion IVA (Est.)' : 'Monotributo (Est.)'}
                                </div>
                                <div className="font-mono text-lg font-bold text-slate-900">
                                    {isTaxLoading ? (
                                        <span className="text-slate-400">Cargando...</span>
                                    ) : taxPosition !== null ? (
                                        formatCurrency(Math.abs(taxPosition))
                                    ) : (
                                        '$ 0'
                                    )}
                                </div>
                                {taxPosition !== null && taxPosition !== 0 && !isTaxLoading && (
                                    <div className="text-xs text-slate-400 mt-0.5">
                                        {taxPosition >= 0 ? 'A pagar' : 'A favor'}
                                    </div>
                                )}
                            </div>
                            <div className="w-8 h-8 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all">
                                <CaretRight weight="bold" size={16} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Note */}
            <div className="pt-8 pb-4 text-center">
                <p className="text-xs text-slate-400">ContaLivre v2.0</p>
            </div>
        </div>
    )
}
