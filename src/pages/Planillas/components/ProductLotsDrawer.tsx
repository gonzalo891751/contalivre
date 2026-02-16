import { useEffect, useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X,
    Package,
    Info,
    Stack,
    ArrowRight,
    CheckCircle,
    Clock,
    ArrowsClockwise,
    CaretDown,
    CaretUp,
} from '@phosphor-icons/react'
import type { ProductEndingValuation } from '../../../core/inventario/valuation-homogenea'
import type { BienesProduct, BienesMovement, CostingMethod } from '../../../core/inventario/types'
import { getQuantityPrecision, normalizeQuantityByPrecision } from '../../../core/inventario/types'
import { buildLayerHistory, getLotHistorySummary, type LotHistory, type LotEvent } from '../../../core/inventario/layer-history'

interface Props {
    product: ProductEndingValuation | null
    method: CostingMethod
    closingPeriod?: string
    formatCurrency: (v: number) => string
    onClose: () => void
    // Optional: pass these to enable real history with events
    bienesProduct?: BienesProduct
    movements?: BienesMovement[]
}

const METHOD_LABELS: Record<CostingMethod, string> = {
    FIFO: 'PEPS',
    LIFO: 'UEPS',
    PPP: 'PPP',
}

function formatPeriodLabel(dateStr: string): string {
    if (dateStr === 'PPP') return 'PPP (Prom.)'
    if (dateStr === 'blended') return 'Promedio Ponderado'
    if (dateStr === 'opening') return 'Existencia Inicial'
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
}

function formatDateShort(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function formatQuantity(value: number, precision: number): string {
    const normalized = normalizeQuantityByPrecision(value, precision)
    return normalized.toFixed(precision)
}

function getEventIcon(type: LotEvent['type']) {
    switch (type) {
        case 'CREATION': return <Package size={12} weight="fill" className="text-emerald-500" />
        case 'CONSUMPTION': return <ArrowRight size={12} className="text-amber-500" />
        case 'RETURN': return <ArrowsClockwise size={12} className="text-blue-500" />
        case 'ADJUSTMENT': return <Clock size={12} className="text-purple-500" />
    }
}

// Tooltip component using Portal to avoid overflow issues
function LotTooltip({ lot, formatCurrency, anchorRect, quantityPrecision }: {
    lot: LotHistory
    formatCurrency: (v: number) => string
    anchorRect: DOMRect | null
    quantityPrecision: number
}) {
    if (!anchorRect) return null

    const style: React.CSSProperties = {
        position: 'fixed',
        top: anchorRect.top - 8,
        left: anchorRect.left + anchorRect.width / 2,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
        maxWidth: 320,
    }

    return createPortal(
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            style={style}
            className="bg-slate-900 text-white rounded-lg shadow-xl p-3 text-xs"
        >
            <div className="font-bold mb-2 pb-1.5 border-b border-slate-700">
                Lote {formatPeriodLabel(lot.originDate)}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                <div className="text-slate-400">Inicial:</div>
                <div className="font-mono tabular-nums text-right">{formatQuantity(lot.initialQuantity, quantityPrecision)} u.</div>
                <div className="text-slate-400">Actual:</div>
                <div className="font-mono tabular-nums text-right">{formatQuantity(Math.max(0, lot.currentQuantity), quantityPrecision)} u.</div>
                <div className="text-slate-400">Consumido:</div>
                <div className="font-mono tabular-nums text-right">{formatQuantity(lot.initialQuantity - Math.max(0, lot.currentQuantity), quantityPrecision)} u.</div>
                <div className="text-slate-400">Costo unit.:</div>
                <div className="font-mono tabular-nums text-right">{formatCurrency(lot.unitCostHistorico)}</div>
            </div>
            {lot.events.length > 1 && (
                <div className="border-t border-slate-700 pt-2 mt-1">
                    <div className="text-slate-400 mb-1.5 font-medium">Historial ({lot.events.length} eventos)</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {lot.events.slice(0, 8).map((ev, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                {getEventIcon(ev.type)}
                                <span className="text-slate-400 w-14">{formatDateShort(ev.date)}</span>
                                <span className="flex-1 truncate">{ev.referenceMemo}</span>
                                <span className={`font-mono tabular-nums ${ev.quantity >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {ev.quantity >= 0 ? '+' : ''}{formatQuantity(ev.quantity, quantityPrecision)}
                                </span>
                            </div>
                        ))}
                        {lot.events.length > 8 && (
                            <div className="text-slate-500 text-center">+{lot.events.length - 8} más...</div>
                        )}
                    </div>
                </div>
            )}
            <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45" />
        </motion.div>,
        document.body
    )
}

// Individual lot row with progress bar and hover tooltip
function LotRow({ lot, idx, formatCurrency, quantityPrecision }: {
    lot: LotHistory
    idx: number
    formatCurrency: (v: number) => string
    quantityPrecision: number
}) {
    const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)

    const isExhausted = lot.isExhausted
    const progressPercent = lot.initialQuantity > 0
        ? Math.max(0, (lot.currentQuantity / lot.initialQuantity) * 100)
        : 0
    const consumedPercent = 100 - progressPercent

    const originLabel = lot.originType === 'OPENING' ? 'EI' :
        lot.originType === 'RETURN' ? 'Devolución' :
            lot.originType === 'ADJUSTMENT' ? 'Ajuste' : 'Compra'

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={`flex items-center p-3 rounded-lg border transition-all cursor-default ${isExhausted
                    ? 'bg-slate-50 border-slate-100'
                    : 'bg-white border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md'
                    }`}
                onMouseEnter={(e) => setHoverRect(e.currentTarget.getBoundingClientRect())}
                onMouseLeave={() => setHoverRect(null)}
            >
                <div className="w-28 flex flex-col">
                    <span className={`text-xs font-mono font-medium ${isExhausted ? 'text-slate-400' : 'text-slate-700'}`}>
                        {formatPeriodLabel(lot.originDate)}
                    </span>
                    {lot.originDate !== 'PPP' && lot.originDate !== 'blended' && lot.originDate !== 'opening' && (
                        <span className="text-[10px] text-slate-400">{lot.originDate}</span>
                    )}
                </div>
                <div className="flex-1 px-4 border-l border-slate-100 mx-2">
                    <div className="flex justify-between text-xs mb-1.5">
                        <span className={`font-semibold ${isExhausted ? 'text-slate-400' : 'text-slate-900'}`}>
                            {originLabel}
                        </span>
                        <span className={`font-mono tabular-nums font-medium ${isExhausted ? 'text-slate-400' : 'text-slate-600'}`}>
                            {formatQuantity(Math.max(0, lot.currentQuantity), quantityPrecision)}<span className="text-slate-300 mx-0.5">/</span>{formatQuantity(lot.initialQuantity, quantityPrecision)}
                            <span className="text-slate-400 font-normal ml-0.5">u.</span>
                        </span>
                    </div>
                    {/* Progress bar with consumed + remaining segments */}
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                        {/* Consumed portion (striped pattern) */}
                        {consumedPercent > 0 && (
                            <div
                                className="h-full bg-gradient-to-r from-slate-300 to-slate-200"
                                style={{
                                    width: `${consumedPercent}%`,
                                    backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)'
                                }}
                            />
                        )}
                        {/* Remaining portion */}
                        {progressPercent > 0 && (
                            <div
                                className={`h-full ${isExhausted ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-400 to-blue-600'}`}
                                style={{ width: `${progressPercent}%` }}
                            />
                        )}
                    </div>
                    {/* Mini legend */}
                    {lot.initialQuantity > lot.currentQuantity && lot.currentQuantity > 0 && (
                        <div className="flex justify-between mt-1 text-[9px] text-slate-400">
                            <span>Consumido: {formatQuantity(lot.initialQuantity - lot.currentQuantity, quantityPrecision)}</span>
                            <span>Remanente: {formatQuantity(lot.currentQuantity, quantityPrecision)}</span>
                        </div>
                    )}
                </div>
                <div className="w-24 text-right pl-2">
                    {isExhausted ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-200 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wide">
                            Agotado
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold rounded uppercase tracking-wide shadow-sm">
                            <CheckCircle size={10} weight="fill" /> Activo
                        </span>
                    )}
                </div>
            </motion.div>
            <AnimatePresence>
                {hoverRect && <LotTooltip lot={lot} formatCurrency={formatCurrency} anchorRect={hoverRect} quantityPrecision={quantityPrecision} />}
            </AnimatePresence>
        </>
    )
}

export default function ProductLotsDrawer({
    product,
    method,
    formatCurrency,
    onClose,
    bienesProduct,
    movements,
}: Props) {
    const isOpen = product !== null
    const [showExhausted, setShowExhausted] = useState(true)

    // ESC to close
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
    }, [onClose])

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            return () => document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen, handleKeyDown])

    // Build layer history if we have the required data
    const lotHistory = useMemo<LotHistory[]>(() => {
        if (bienesProduct && movements) {
            return buildLayerHistory(bienesProduct, movements, method)
        }
        // Fallback: convert product.layers to LotHistory format (no events)
        if (!product) return []
        return product.layers.map(layer => ({
            id: layer.movementId,
            originDate: layer.date,
            originType: layer.movementId === 'opening' ? 'OPENING' as const : 'PURCHASE' as const,
            initialQuantity: layer.quantity, // We don't have initial, use current
            currentQuantity: layer.quantity,
            unitCostHistorico: layer.unitCostOrigen,
            events: [],
            isExhausted: layer.quantity <= 0,
        }))
    }, [bienesProduct, movements, method, product])

    const summary = useMemo(() => getLotHistorySummary(lotHistory), [lotHistory])
    const quantityPrecision = useMemo(
        () => getQuantityPrecision(bienesProduct ?? product?.product ?? null),
        [bienesProduct, product]
    )

    // Filter based on showExhausted toggle
    const displayLots = useMemo(() => {
        if (showExhausted) return lotHistory
        return lotHistory.filter(l => !l.isExhausted)
    }, [lotHistory, showExhausted])

    // Active layers for valuation table (from original product prop)
    const activeLayers = useMemo(() => {
        if (!product) return []
        return product.layers.filter(l => l.quantity > 0)
    }, [product])

    if (!product) return null

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        className="fixed top-0 right-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    Detalle de lotes <span className="text-slate-400 font-medium text-lg ml-1">(flow {METHOD_LABELS[method]})</span>
                                </h2>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    {product.product.name} &middot; {product.product.sku} &middot; Metodo: {METHOD_LABELS[method]}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto bg-slate-50/50" style={{ scrollbarWidth: 'thin' }}>
                            <div className="p-8 space-y-8">

                                {/* 1. Top Summary */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center min-w-0">
                                        <div className="flex items-center gap-2 mb-2 text-slate-500">
                                            <Package size={16} weight="duotone" className="shrink-0" />
                                            <span className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">Stock Total</span>
                                        </div>
                                        <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-slate-900 tracking-tight">
                                            {formatQuantity(product.endingQty, quantityPrecision)}<span className="text-xs sm:text-sm font-sans text-slate-400 font-normal ml-1">unid.</span>
                                        </div>
                                        {summary.totalConsumed > 0 && (
                                            <div className="text-[10px] text-slate-400 mt-1">
                                                {formatQuantity(summary.totalConsumed, quantityPrecision)} consumidas de {formatQuantity(summary.totalInitial, quantityPrecision)} ingresadas
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center min-w-0">
                                        <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 whitespace-nowrap">Val. Historica</div>
                                        <div className="text-lg sm:text-xl font-mono tabular-nums font-medium text-slate-600 truncate">{formatCurrency(product.endingValueOrigen)}</div>
                                        <div className="text-[10px] text-slate-400 mt-1">Costo de Origen</div>
                                    </div>

                                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-blue-200 shadow-sm relative overflow-hidden flex flex-col justify-center min-w-0">
                                        <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-bl-full -mr-4 -mt-4 sm:-mr-6 sm:-mt-6 opacity-60" />
                                        <div className="text-xs text-blue-600 font-bold uppercase tracking-wider mb-2 whitespace-nowrap relative z-10">Val. Homogenea</div>
                                        <div className="text-lg sm:text-xl font-mono tabular-nums font-bold text-blue-700 truncate relative z-10">{formatCurrency(product.endingValueHomog)}</div>
                                        <div className="text-[10px] text-blue-400 mt-1 relative z-10">Moneda de Cierre</div>
                                    </div>
                                </div>

                                {/* 2. Visual Flow (Lot List) */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                            <Stack size={16} className="text-blue-500" weight="duotone" />
                                            Flujo de Lotes ({METHOD_LABELS[method]})
                                        </h3>
                                        <div className="flex items-center gap-3">
                                            {/* Toggle exhausted lots */}
                                            {summary.exhaustedLots > 0 && (
                                                <button
                                                    onClick={() => setShowExhausted(!showExhausted)}
                                                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-700 transition-colors"
                                                >
                                                    {showExhausted ? <CaretUp size={12} /> : <CaretDown size={12} />}
                                                    {showExhausted ? 'Ocultar' : 'Mostrar'} agotados ({summary.exhaustedLots})
                                                </button>
                                            )}
                                            <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wide items-center bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                                {method === 'FIFO' ? (
                                                    <>
                                                        <span className="text-slate-500">Antiguos</span>
                                                        <ArrowRight size={12} className="text-slate-300" />
                                                        <span className="text-blue-600">Nuevos</span>
                                                    </>
                                                ) : method === 'LIFO' ? (
                                                    <>
                                                        <span className="text-blue-600">Nuevos</span>
                                                        <ArrowRight size={12} className="text-slate-300" />
                                                        <span className="text-slate-500">Antiguos</span>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-500">Orden Cronologico</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {displayLots.length === 0 ? (
                                        <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-100">
                                            <Package size={32} className="mx-auto text-slate-300 mb-2" weight="duotone" />
                                            <p className="text-sm text-slate-500">Sin lotes registrados</p>
                                            <p className="text-xs text-slate-400 mt-1">Este producto no tiene existencia inicial ni compras.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {displayLots.map((lot, idx) => (
                                                <LotRow
                                                    key={lot.id}
                                                    lot={lot}
                                                    idx={idx}
                                                    formatCurrency={formatCurrency}
                                                    quantityPrecision={quantityPrecision}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Summary bar */}
                                    {summary.totalInitial > 0 && (
                                        <div className="mt-4 p-3 bg-slate-100 rounded-lg">
                                            <div className="flex justify-between text-xs text-slate-600 mb-2">
                                                <span>Resumen: {summary.activeLots} lotes activos, {summary.exhaustedLots} agotados</span>
                                                <span className="font-mono tabular-nums">
                                                    {formatQuantity(summary.totalCurrent, quantityPrecision)} / {formatQuantity(summary.totalInitial, quantityPrecision)} u.
                                                </span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex">
                                                <div
                                                    className="h-full bg-slate-300"
                                                    style={{
                                                        width: `${((summary.totalInitial - summary.totalCurrent) / summary.totalInitial) * 100}%`,
                                                        backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)'
                                                    }}
                                                />
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600"
                                                    style={{ width: `${(summary.totalCurrent / summary.totalInitial) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 3. Detailed Table */}
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Detalle de Valuacion</h3>
                                    {activeLayers.length === 0 ? (
                                        <div className="text-center py-6 bg-slate-50 rounded-lg border border-slate-100">
                                            <p className="text-sm text-slate-500">Sin stock remanente para valuar.</p>
                                        </div>
                                    ) : (
                                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-slate-900/5 overflow-x-auto">
                                            <table className="w-full text-sm min-w-[580px]">
                                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs uppercase tracking-wider whitespace-nowrap">Lote / Periodo</th>
                                                        <th className="px-4 py-3 text-right text-xs uppercase tracking-wider whitespace-nowrap">Remanente</th>
                                                        <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-slate-500 whitespace-nowrap">Costo Unit. (Hist)</th>
                                                        <th className="px-4 py-3 text-right text-xs uppercase tracking-wider text-slate-600 whitespace-nowrap">Subtotal Historico</th>
                                                        <th className="px-4 py-3 text-right text-xs uppercase tracking-wider bg-blue-50/50 text-blue-700 whitespace-nowrap">Subtotal Homogeneo</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {activeLayers.map((lot, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                                                            <td className="px-4 py-3.5 text-slate-900 font-medium whitespace-nowrap">{formatPeriodLabel(lot.date)}</td>
                                                            <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-600">{formatQuantity(lot.quantity, quantityPrecision)}</td>
                                                            <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-400 group-hover:text-slate-500">
                                                                {formatCurrency(lot.unitCostOrigen)}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-700 font-medium">
                                                                {formatCurrency(lot.totalOrigen)}
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right font-mono tabular-nums bg-blue-50/20 font-bold text-blue-700">
                                                                {formatCurrency(lot.totalHomog)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-slate-50 border-t border-slate-200">
                                                    <tr>
                                                        <td colSpan={3} className="px-4 py-4 text-right font-bold text-slate-600 uppercase text-xs tracking-wider whitespace-nowrap">Totales Generales</td>
                                                        <td className="px-4 py-4 text-right font-mono tabular-nums font-bold text-slate-800 text-base border-t-2 border-slate-200">
                                                            {formatCurrency(product.endingValueOrigen)}
                                                        </td>
                                                        <td className="px-4 py-4 text-right font-mono tabular-nums font-bold text-blue-700 text-base bg-blue-50/20 border-t-2 border-blue-200">
                                                            {formatCurrency(product.endingValueHomog)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}

                                    {/* RT6 Note */}
                                    <div className="mt-4 flex gap-3 items-start px-2 py-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <Info size={16} className="text-slate-400 mt-0.5 shrink-0" />
                                        <p className="text-xs text-slate-500 leading-relaxed">
                                            <strong className="text-slate-700 font-medium block mb-0.5">Nota de Valuacion</strong>
                                            Valuacion homogenea reexpresada a moneda de cierre segun indices FACPCE / RT6 (RECPAM).
                                            La diferencia de valuacion ({formatCurrency(product.ajuste)}) corresponde al RECPAM generado por la tenencia de bienes de cambio.
                                        </p>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-200 bg-white flex justify-end items-center sticky bottom-0 z-10">
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors focus:ring-2 focus:ring-slate-200 focus:outline-none"
                            >
                                Cerrar
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
