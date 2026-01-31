import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Package, Clock, ArrowRight } from '@phosphor-icons/react'
import type { ProductEndingValuation, HomogeneousLayer } from '../../../core/inventario/valuation-homogenea'
import type { CostingMethod } from '../../../core/inventario/types'

interface Props {
    product: ProductEndingValuation
    method: CostingMethod
    formatCurrency: (v: number) => string
    onViewLots: () => void
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
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' })
}

export default function ProductValuationCard({ product, formatCurrency, onViewLots }: Props) {
    const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)

    const activeLayers = useMemo(() => product.layers.filter(l => l.quantity > 0), [product.layers])
    const totalQty = useMemo(() => activeLayers.reduce((s, l) => s + l.quantity, 0), [activeLayers])
    const rotation = useMemo(() => getOverallRotation(product.layers), [product.layers])

    // Color palette for layer segments (by age gradient)
    const SEGMENT_COLORS = [
        'bg-indigo-500', 'bg-blue-500', 'bg-sky-400', 'bg-cyan-400', 'bg-teal-400', 'bg-emerald-400',
    ]

    return (
        <motion.div
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group"
            whileHover={{ boxShadow: '0 8px 30px rgba(59, 130, 246, 0.08)' }}
            transition={{ duration: 0.2 }}
        >
            <div className="p-4 sm:p-6">
                {/* Desktop: flex row with defined sections / Mobile: stack */}
                <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-6">

                    {/* Section 1: Identity - fixed width */}
                    <div className="flex items-start gap-3 xl:w-52 xl:shrink-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-blue-600 border border-blue-100 shadow-sm shrink-0 group-hover:scale-105 transition-transform">
                            <Package size={22} weight="duotone" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-tight truncate">{product.product.name}</h3>
                            <span className="text-xs font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">{product.product.sku}</span>
                        </div>
                    </div>

                    {/* Section 2: Composition Bar & Rotation - flex grow */}
                    <div className="flex-1 min-w-0 xl:max-w-xs">
                        <div className="flex justify-between items-center mb-2 gap-2">
                            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Composicion</span>
                            <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border shrink-0 ${rotation.color}`}>
                                <Clock size={10} weight="bold" /> {rotation.label}
                            </div>
                        </div>
                        {/* Stack bar */}
                        <div className="relative">
                            <div className="h-3 w-full flex rounded-full overflow-hidden bg-slate-100 ring-1 ring-slate-200/50">
                                {activeLayers.map((layer, idx) => {
                                    const widthPct = totalQty > 0 ? (layer.quantity / totalQty) * 100 : 0
                                    const bgColor = SEGMENT_COLORS[idx % SEGMENT_COLORS.length]
                                    return (
                                        <div
                                            key={idx}
                                            className={`h-full relative cursor-help transition-all duration-200 ${bgColor} ${hoveredSegment === idx ? 'brightness-110 z-10' : 'z-0'}`}
                                            style={{ width: `${widthPct}%` }}
                                            onMouseEnter={() => setHoveredSegment(idx)}
                                            onMouseLeave={() => setHoveredSegment(null)}
                                        />
                                    )
                                })}
                            </div>
                            {/* Tooltip */}
                            {hoveredSegment !== null && activeLayers[hoveredSegment] && (
                                <div
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-52 bg-slate-900/95 backdrop-blur text-white text-xs p-3 rounded-xl shadow-xl z-50 pointer-events-none border border-slate-700/50"
                                    style={{ animation: 'slideInUp 0.15s ease-out' }}
                                >
                                    {(() => {
                                        const layer = activeLayers[hoveredSegment]
                                        const rot = getRotationInfo(layer)
                                        return (
                                            <>
                                                <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
                                                    <span className="font-bold">{formatPeriodLabel(layer.date)}</span>
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">Activo</span>
                                                </div>
                                                <div className="space-y-1 font-mono">
                                                    <div className="flex justify-between"><span className="text-slate-400 font-sans">Cant:</span> <span>{layer.quantity} u.</span></div>
                                                    <div className="flex justify-between"><span className="text-slate-400 font-sans">Hist:</span> <span>{formatCurrency(layer.totalOrigen)}</span></div>
                                                    <div className="flex justify-between"><span className="text-blue-300 font-sans">Homog:</span> <span className="text-blue-300 font-bold">{formatCurrency(layer.totalHomog)}</span></div>
                                                    <div className="flex justify-between"><span className="text-slate-400 font-sans">Rotacion:</span> <span>{rot.label}</span></div>
                                                </div>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
                                            </>
                                        )
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 3: Metrics - fixed width with proper spacing */}
                    <div className="flex items-center gap-4 sm:gap-6 xl:border-l xl:border-slate-100 xl:pl-6 flex-wrap sm:flex-nowrap">
                        <div className="min-w-[70px]">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 whitespace-nowrap">Stock</div>
                            <div className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-slate-900">{product.endingQty}<span className="text-xs sm:text-sm text-slate-400 font-normal font-sans ml-0.5">u.</span></div>
                        </div>
                        <div className="min-w-[90px]">
                            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1 whitespace-nowrap">Val. Hist.</div>
                            <div className="text-sm sm:text-base font-mono tabular-nums font-medium text-slate-600 truncate">{formatCurrency(product.endingValueOrigen)}</div>
                        </div>
                        <div className="min-w-[90px]">
                            <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold mb-1 whitespace-nowrap">Val. Cierre</div>
                            <div className="text-sm sm:text-base font-mono tabular-nums font-bold text-blue-700 truncate">{formatCurrency(product.endingValueHomog)}</div>
                        </div>
                    </div>

                    {/* Section 4: CTA - fixed width, always visible */}
                    <div className="xl:ml-auto xl:shrink-0 mt-2 xl:mt-0">
                        <button
                            onClick={onViewLots}
                            className="group/btn inline-flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 bg-blue-50/50 px-4 py-2.5 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 w-full sm:w-auto whitespace-nowrap"
                        >
                            Ver Lotes <ArrowRight size={16} className="group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                    </div>

                </div>
            </div>
        </motion.div>
    )
}
