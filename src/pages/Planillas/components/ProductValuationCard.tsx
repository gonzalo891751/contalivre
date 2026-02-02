import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, Clock, ArrowRight } from '@phosphor-icons/react'
import type { ProductEndingValuation, HomogeneousLayer } from '../../../core/inventario/valuation-homogenea'
import type { BienesProduct, BienesMovement, CostingMethod } from '../../../core/inventario/types'
import { buildLayerHistory, getLotHistorySummary, type LotHistory } from '../../../core/inventario/layer-history'

interface Props {
    product: ProductEndingValuation
    method: CostingMethod
    formatCurrency: (v: number) => string
    onViewLots: () => void
    // Optional: pass for real lot history with consumption tracking
    bienesProduct?: BienesProduct
    movements?: BienesMovement[]
    // Optional: per-product KPIs
    productSales?: number
}

function getRotationInfo(layer: HomogeneousLayer): { label: string; color: string } {
    if (layer.date === 'PPP') return { label: 'PPP', color: 'bg-slate-100 text-slate-500 border-slate-200' }
    const origin = new Date(layer.date + 'T00:00:00')
    const now = new Date()
    const months = (now.getFullYear() - origin.getFullYear()) * 12 + (now.getMonth() - origin.getMonth())
    if (months <= 2) return { label: 'Alta', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    if (months <= 6) return { label: 'Media', color: 'bg-amber-50 text-amber-700 border-amber-200' }
    return { label: 'Baja', color: 'bg-orange-50 text-orange-700 border-orange-200' }
}

function getOverallRotation(layers: HomogeneousLayer[]): { label: string; color: string } {
    const activeLayers = layers.filter(l => l.quantity > 0)
    if (activeLayers.length === 0) return { label: 'Sin Stock', color: 'bg-slate-100 text-slate-500 border-slate-200' }
    const oldest = activeLayers[0]
    return getRotationInfo(oldest)
}

function formatPeriodLabel(dateStr: string): string {
    if (dateStr === 'PPP') return 'PPP (Prom.)'
    if (dateStr === 'blended') return 'Promedio Pond.'
    if (dateStr === 'opening') return 'Exist. Inicial'
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
}

function formatDateShort(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// Portal-based tooltip that never clips
function SegmentTooltip({ lot, valLayer, formatCurrency, anchorRect }: {
    lot: LotHistory
    valLayer?: HomogeneousLayer
    formatCurrency: (v: number) => string
    anchorRect: DOMRect
}) {
    // Position: prefer above, fall back to below if not enough space
    const preferAbove = anchorRect.top > 220
    const top = preferAbove
        ? anchorRect.top - 8
        : anchorRect.bottom + 8
    const transform = preferAbove
        ? 'translate(-50%, -100%)'
        : 'translate(-50%, 0)'

    // Clamp left to viewport
    const left = Math.max(160, Math.min(anchorRect.left + anchorRect.width / 2, window.innerWidth - 160))

    const recentEvents = lot.events.slice(-5).reverse()

    return createPortal(
        <motion.div
            initial={{ opacity: 0, y: preferAbove ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: preferAbove ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'fixed', top, left, transform, zIndex: 9999, maxWidth: 300 }}
            className="bg-slate-900 text-white rounded-lg shadow-xl p-3 text-xs pointer-events-none"
            role="tooltip"
        >
            <div className="font-bold mb-2 pb-1.5 border-b border-slate-700">
                Lote {formatPeriodLabel(lot.originDate)}
                {lot.isExhausted && <span className="ml-2 text-slate-400 text-[10px] uppercase">Agotado</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
                <div className="text-slate-400">Inicial:</div>
                <div className="font-mono tabular-nums text-right">{lot.initialQuantity} u.</div>
                <div className="text-slate-400">Actual:</div>
                <div className="font-mono tabular-nums text-right">{Math.max(0, lot.currentQuantity)} u.</div>
                <div className="text-slate-400">Consumido:</div>
                <div className="font-mono tabular-nums text-right">{lot.initialQuantity - Math.max(0, lot.currentQuantity)} u.</div>
                <div className="text-slate-400">Costo unit.:</div>
                <div className="font-mono tabular-nums text-right">{formatCurrency(lot.unitCostHistorico)}</div>
                {valLayer && (
                    <>
                        <div className="text-slate-400">Subtotal hist.:</div>
                        <div className="font-mono tabular-nums text-right">{formatCurrency(Math.max(0, lot.currentQuantity) * lot.unitCostHistorico)}</div>
                    </>
                )}
            </div>
            {recentEvents.length > 0 && (
                <div className="border-t border-slate-700 pt-2 mt-1">
                    <div className="text-slate-400 mb-1 font-medium">Eventos recientes</div>
                    <div className="space-y-0.5">
                        {recentEvents.map((ev, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 w-12 shrink-0">{formatDateShort(ev.date)}</span>
                                <span className="flex-1 truncate">{ev.referenceMemo}</span>
                                <span className={`font-mono tabular-nums shrink-0 ${ev.quantity >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {ev.quantity >= 0 ? '+' : ''}{ev.quantity}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* Arrow */}
            <div
                className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 rotate-45"
                style={preferAbove ? { bottom: -6 } : { top: -6 }}
            />
        </motion.div>,
        document.body
    )
}

// Color palette for lot segments
const LOT_COLORS = [
    'bg-indigo-500', 'bg-blue-500', 'bg-sky-400', 'bg-cyan-400', 'bg-teal-400', 'bg-emerald-400',
]

export default function ProductValuationCard({
    product, method, formatCurrency, onViewLots,
    bienesProduct, movements,
    productSales,
}: Props) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
    const segmentRefs = useRef<(HTMLDivElement | null)[]>([])

    // Build real lot history if we have the data
    const lotHistory = useMemo<LotHistory[]>(() => {
        if (bienesProduct && movements) {
            return buildLayerHistory(bienesProduct, movements, method)
        }
        return []
    }, [bienesProduct, movements, method])

    const summary = useMemo(() => getLotHistorySummary(lotHistory), [lotHistory])
    const hasRealHistory = lotHistory.length > 0

    // Active lots for the composition bar
    const activeLots = useMemo(() => lotHistory.filter(l => !l.isExhausted), [lotHistory])
    const exhaustedLots = useMemo(() => lotHistory.filter(l => l.isExhausted), [lotHistory])

    // Fallback to valuation layers if no history
    const activeLayers = useMemo(() => product.layers.filter(l => l.quantity > 0), [product.layers])
    const rotation = useMemo(() => getOverallRotation(product.layers), [product.layers])

    // Composition segments: use lot history if available, else valuation layers
    const segments = useMemo(() => {
        if (hasRealHistory) {
            // Total capacity = sum of all initial quantities
            const totalInitial = summary.totalInitial
            if (totalInitial <= 0) return []
            return lotHistory.map((lot, i) => ({
                id: lot.id,
                lot,
                initialPct: (lot.initialQuantity / totalInitial) * 100,
                remainingPct: (Math.max(0, lot.currentQuantity) / totalInitial) * 100,
                consumedPct: ((lot.initialQuantity - Math.max(0, lot.currentQuantity)) / totalInitial) * 100,
                isExhausted: lot.isExhausted,
                color: LOT_COLORS[i % LOT_COLORS.length],
            }))
        }
        // Fallback: no consumption data, just show active layers filling 100%
        const totalQty = activeLayers.reduce((s, l) => s + l.quantity, 0)
        if (totalQty <= 0) return []
        return activeLayers.map((layer, i) => ({
            id: layer.movementId,
            lot: null as unknown as LotHistory,
            initialPct: (layer.quantity / totalQty) * 100,
            remainingPct: (layer.quantity / totalQty) * 100,
            consumedPct: 0,
            isExhausted: false,
            color: LOT_COLORS[i % LOT_COLORS.length],
        }))
    }, [hasRealHistory, lotHistory, summary, activeLayers])

    const handleMouseEnter = useCallback((idx: number) => {
        setHoveredIdx(idx)
        const el = segmentRefs.current[idx]
        if (el) setAnchorRect(el.getBoundingClientRect())
    }, [])

    const handleMouseLeave = useCallback(() => {
        setHoveredIdx(null)
        setAnchorRect(null)
    }, [])

    // Keyboard focus support
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setHoveredIdx(null)
            setAnchorRect(null)
        }
    }, [])

    const handleFocus = useCallback((idx: number) => {
        setHoveredIdx(idx)
        const el = segmentRefs.current[idx]
        if (el) setAnchorRect(el.getBoundingClientRect())
    }, [])

    // Close tooltip on scroll
    useEffect(() => {
        if (hoveredIdx === null) return
        const onScroll = () => { setHoveredIdx(null); setAnchorRect(null) }
        window.addEventListener('scroll', onScroll, true)
        return () => window.removeEventListener('scroll', onScroll, true)
    }, [hoveredIdx])

    // Per-product cost unit
    const costUnitHist = product.endingQty > 0 ? product.endingValueOrigen / product.endingQty : 0
    const costUnitHomog = product.endingQty > 0 ? product.endingValueHomog / product.endingQty : 0

    return (
        <motion.div
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-visible group"
            whileHover={{ boxShadow: '0 8px 30px rgba(59, 130, 246, 0.08)' }}
            transition={{ duration: 0.2 }}
        >
            <div className="p-4 sm:p-5">
                {/* Row 1: Identity + Composition + Metrics + CTA */}
                <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-6">

                    {/* Section 1: Identity */}
                    <div className="flex items-start gap-3 xl:w-48 xl:shrink-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-blue-600 border border-blue-100 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                            <Package size={20} weight="duotone" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-tight truncate">{product.product.name}</h3>
                            <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{product.product.sku}</span>
                        </div>
                    </div>

                    {/* Section 2: Composition Bar with real consumption */}
                    <div className="flex-1 min-w-0 xl:max-w-sm">
                        <div className="flex justify-between items-center mb-1.5 gap-2">
                            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                                Composicion
                                {hasRealHistory && summary.totalConsumed > 0 && (
                                    <span className="text-slate-400 ml-1">
                                        ({summary.totalCurrent}/{summary.totalInitial} u.)
                                    </span>
                                )}
                            </span>
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border shrink-0 ${rotation.color}`}>
                                <Clock size={10} weight="bold" /> {rotation.label}
                            </div>
                        </div>
                        {/* Stacked bar with consumption visualization */}
                        <div className="h-3 w-full flex rounded-full overflow-hidden bg-slate-100 ring-1 ring-slate-200/50">
                            {segments.map((seg, idx) => (
                                <div key={seg.id} className="flex h-full" style={{ width: `${seg.initialPct}%` }}>
                                    {/* Consumed portion (striped/greyed) */}
                                    {seg.consumedPct > 0 && (
                                        <div
                                            className="h-full bg-slate-200"
                                            style={{
                                                width: `${seg.initialPct > 0 ? (seg.consumedPct / seg.initialPct) * 100 : 0}%`,
                                                backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
                                            }}
                                        />
                                    )}
                                    {/* Remaining portion */}
                                    {seg.remainingPct > 0 && (
                                        <div
                                            ref={el => { segmentRefs.current[idx] = el }}
                                            className={`h-full cursor-help transition-all duration-200 ${seg.color} ${hoveredIdx === idx ? 'brightness-110' : ''}`}
                                            style={{ width: `${seg.initialPct > 0 ? (seg.remainingPct / seg.initialPct) * 100 : 0}%` }}
                                            onMouseEnter={() => handleMouseEnter(idx)}
                                            onMouseLeave={handleMouseLeave}
                                            onFocus={() => handleFocus(idx)}
                                            onKeyDown={handleKeyDown}
                                            tabIndex={0}
                                            role="button"
                                            aria-describedby={hoveredIdx === idx ? `lot-tooltip-${seg.id}` : undefined}
                                            aria-label={`Lote ${formatPeriodLabel(seg.lot?.originDate || '')}: ${seg.lot?.currentQuantity || 0} de ${seg.lot?.initialQuantity || 0} u.`}
                                        />
                                    )}
                                    {/* Fully exhausted segment */}
                                    {seg.isExhausted && seg.consumedPct <= 0 && (
                                        <div
                                            ref={el => { segmentRefs.current[idx] = el }}
                                            className="h-full bg-slate-200 cursor-help"
                                            style={{ width: '100%', backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)' }}
                                            onMouseEnter={() => handleMouseEnter(idx)}
                                            onMouseLeave={handleMouseLeave}
                                            onFocus={() => handleFocus(idx)}
                                            onKeyDown={handleKeyDown}
                                            tabIndex={0}
                                            role="button"
                                            aria-label={`Lote agotado: ${formatPeriodLabel(seg.lot?.originDate || '')}`}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        {/* Mini legend */}
                        {hasRealHistory && (
                            <div className="flex justify-between mt-1 text-[9px] text-slate-400">
                                <span>{activeLots.length} activos{exhaustedLots.length > 0 ? ` · ${exhaustedLots.length} agotados` : ''}</span>
                                {summary.totalConsumed > 0 && (
                                    <span>{Math.round((summary.totalConsumed / summary.totalInitial) * 100)}% consumido</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section 3: Metrics */}
                    <div className="flex items-center gap-3 sm:gap-5 xl:border-l xl:border-slate-100 xl:pl-5 flex-wrap sm:flex-nowrap">
                        <div className="min-w-[60px]">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5 whitespace-nowrap">Stock</div>
                            <div className="text-lg sm:text-xl font-mono tabular-nums font-bold text-slate-900">{product.endingQty}<span className="text-xs text-slate-400 font-normal font-sans ml-0.5">u.</span></div>
                        </div>
                        <div className="min-w-[80px]">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-0.5 whitespace-nowrap">Val. Hist.</div>
                            <div className="text-sm font-mono tabular-nums font-medium text-slate-600 truncate">{formatCurrency(product.endingValueOrigen)}</div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">c/u {formatCurrency(costUnitHist)}</div>
                        </div>
                        <div className="min-w-[80px]">
                            <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold mb-0.5 whitespace-nowrap">Val. Cierre</div>
                            <div className="text-sm font-mono tabular-nums font-bold text-blue-700 truncate">{formatCurrency(product.endingValueHomog)}</div>
                            <div className="text-[10px] font-mono text-blue-400 truncate">c/u {formatCurrency(costUnitHomog)}</div>
                        </div>
                        {productSales !== undefined && productSales > 0 && (
                            <div className="min-w-[70px]">
                                <div className="text-[10px] uppercase tracking-wider text-purple-600 font-bold mb-0.5 whitespace-nowrap">Ventas</div>
                                <div className="text-sm font-mono tabular-nums font-medium text-purple-700 truncate">{formatCurrency(productSales)}</div>
                            </div>
                        )}
                    </div>

                    {/* Section 4: CTA */}
                    <div className="xl:ml-auto xl:shrink-0 mt-1 xl:mt-0">
                        <button
                            onClick={onViewLots}
                            className="group/btn inline-flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50/50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 w-full sm:w-auto whitespace-nowrap"
                        >
                            Ver Lotes <ArrowRight size={16} className="group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                    </div>

                </div>
            </div>

            {/* Portal tooltip */}
            <AnimatePresence>
                {hoveredIdx !== null && anchorRect && segments[hoveredIdx] && segments[hoveredIdx].lot && (
                    <SegmentTooltip
                        lot={segments[hoveredIdx].lot}
                        valLayer={activeLayers.find(l => l.movementId === segments[hoveredIdx].id)}
                        formatCurrency={formatCurrency}
                        anchorRect={anchorRect}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    )
}
