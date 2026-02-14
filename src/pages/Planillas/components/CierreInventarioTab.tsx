/**
 * CierreInventarioTab — pixel-perfect UI matching docs/prototypes/cierrecambio.html
 *
 * Extracted sub-components:
 *   CierreHeader, StatusBar, CMVCard, AuditoriaFisica,
 *   AsientosPreviewCard, KPIGrid, CtaButton
 */
import { useState } from 'react'
import {
    CheckCircle,
    WarningCircle,
    Calculator,
    Scales,
    Package,
    ShoppingCart,
    Truck,
    ArrowUDownLeft,
    ChartLineUp,
    Info,
    GearSix,
    Check,
    Robot,
} from '@phosphor-icons/react'

// ─── Types ──────────────────────────────────────────────────
export interface CierreTabProps {
    // Mode
    isPeriodic: boolean
    costMethod: string
    // Year range
    yearRangeStart: string
    yearRangeEnd: string
    // Data
    existenciaInicial: number
    comprasBrutas: number
    gastosCompras: number
    bonifCompras: number
    devolCompras: number
    comprasNetas: number
    ventasBrutas: number
    bonifVentas: number
    devolVentas: number
    ventasNetas: number
    inventarioTeorico: number
    cmvPorDiferencia: number
    // RT6
    rt6HasData: boolean
    rt6Adjustments: {
        eiAdj: number
        comprasAdj: number
        gastosAdj: number
        bonifAdj: number
        devolAdj: number
    }
    eiHomog: number
    comprasNetasHomog: number
    efTeoricaHomog: number
    cmvHomog: number
    // Physical audit
    closingPhysicalValue: number | null
    setClosingPhysicalValue: (v: number | null) => void
    esFisicoDefinido: boolean
    difInvLocal: number
    // EI date
    openingBalanceDate: string
    handleOpeningDateChange: (d: string) => void
    // Mappings
    hasSavedMappings: boolean
    accountMappingsSummary: { key: string; label: string; account: { code: string } }[]
    // Actions
    openAccountConfigModal: () => void
    handleGenerateClosingEntry: () => void
    closingIsSaving: boolean
    // Show Homogeneo toggle (lifted state)
    showHomogeneo: boolean
    setShowHomogeneo: (v: boolean) => void
    // Movements count for status chip
    movementsCount: number
    alertsCount: number
    formatCurrency: (v: number) => string
}

// ─── Formatters ─────────────────────────────────────────────
const fmtPct = (n: number) => n.toFixed(1) + '%'

// ─── CierreHeader ───────────────────────────────────────────
function CierreHeader({
    isPeriodic,
    costMethod,
    yearRangeStart,
    yearRangeEnd,
    rt6HasData,
    showHomogeneo,
    setShowHomogeneo,
    openAccountConfigModal,
}: Pick<
    CierreTabProps,
    'isPeriodic' | 'costMethod' | 'yearRangeStart' | 'yearRangeEnd' |
    'rt6HasData' | 'showHomogeneo' | 'setShowHomogeneo' | 'openAccountConfigModal'
>) {
    // Period info used in subtitle
    const periodStr = yearRangeStart && yearRangeEnd
        ? `${yearRangeStart.split('-').reverse().join('/')} – ${yearRangeEnd.split('-').reverse().join('/')}`
        : ''
    return (
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 flex-wrap">
            {/* Left: title */}
            <div>
                <h1 className="font-display text-[2rem] font-extrabold leading-none text-brand-primary">
                    Cierre de Inventario
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                    Modo Diferencias:{' '}
                    <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                        CMV = EI + Compras Netas − EF
                    </span>
                    {periodStr && <span className="ml-2 text-xs text-slate-400">{periodStr}</span>}
                </p>
            </div>

            {/* Right: controls pill */}
            <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-200">
                {/* Method selector (display only) */}
                <div className="flex items-center gap-2 pr-3 border-r border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Método</span>
                    <span className="text-sm font-medium text-slate-700">{costMethod}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-50 text-blue-600">
                        {isPeriodic ? 'DIFERENCIAS' : 'PERMANENTE'}
                    </span>
                </div>

                {/* RT6 Toggle — always visible */}
                <label
                    className={`flex items-center gap-2 select-none ${rt6HasData ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    title={rt6HasData ? 'Activar ajuste por inflación (RT6)' : 'Disponible cuando existan movimientos de RT6 / reexpresión'}
                >
                    <button
                        type="button"
                        role="switch"
                        aria-checked={showHomogeneo}
                        disabled={!rt6HasData}
                        onClick={() => rt6HasData && setShowHomogeneo(!showHomogeneo)}
                        className={`relative w-10 h-[22px] rounded-full transition-colors ${showHomogeneo && rt6HasData ? 'bg-brand-primary' : 'bg-slate-200'} ${!rt6HasData ? 'border border-slate-300' : ''}`}
                    >
                        <span
                            className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full shadow transition-transform ${showHomogeneo && rt6HasData ? 'translate-x-[18px]' : ''} ${!rt6HasData ? 'bg-slate-50' : 'bg-white'}`}
                        />
                    </button>
                    <div className="leading-tight">
                        <span className="text-sm font-semibold block text-slate-700">Mostrar Homogéneo</span>
                        <span className="text-[10px] text-slate-500">Ajuste RT6</span>
                    </div>
                </label>

                {/* Config button */}
                <button
                    onClick={openAccountConfigModal}
                    className="ml-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                    <GearSix size={14} weight="bold" />
                    Configurar cuentas
                </button>
            </div>
        </header>
    )
}

// ─── StatusBar ──────────────────────────────────────────────
function StatusBar({
    movementsCount,
    hasSavedMappings,
    alertsCount,
    costMethod,
    rt6HasData,
}: Pick<CierreTabProps, 'movementsCount' | 'hasSavedMappings' | 'alertsCount' | 'costMethod' | 'rt6HasData'>) {
    const chips: { label: string; value: string; ok: boolean; icon: React.ReactNode }[] = [
        {
            label: 'Movimientos',
            value: movementsCount > 0 ? `${movementsCount} reg.` : 'Sin datos',
            ok: movementsCount > 0,
            icon: movementsCount > 0 ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />,
        },
        {
            label: 'Cuentas',
            value: hasSavedMappings ? 'OK' : 'Configurar',
            ok: hasSavedMappings,
            icon: hasSavedMappings ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />,
        },
        {
            label: 'Conciliación',
            value: alertsCount > 0 ? `${alertsCount} pend.` : 'OK',
            ok: alertsCount === 0,
            icon: alertsCount === 0 ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />,
        },
        {
            label: 'Valuación',
            value: `${costMethod} OK`,
            ok: true,
            icon: <Robot size={16} weight="fill" />,
        },
        {
            label: 'RT6',
            value: rt6HasData ? 'OK' : 'N/A',
            ok: rt6HasData,
            icon: <ChartLineUp size={16} weight={rt6HasData ? 'fill' : 'regular'} />,
        },
    ]

    return (
        <div className="flex flex-wrap gap-2.5">
            {chips.map((c) => (
                <div
                    key={c.label}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium border bg-white
                        ${c.ok ? 'border-slate-200 text-slate-600' : 'border-amber-200 text-amber-700'}
                    `}
                    style={{ opacity: c.label === 'RT6' && !c.ok ? 0.5 : 1 }}
                >
                    <span className={c.ok ? 'text-emerald-500' : 'text-amber-500'}>{c.icon}</span>
                    <span>
                        {c.label}: <strong className="text-slate-900">{c.value}</strong>
                    </span>
                </div>
            ))}
        </div>
    )
}

// ─── CMV Calculation Row ────────────────────────────────────
interface CalcRow {
    label: string
    icon?: React.ReactNode
    historic: number
    homogeneous?: number
    variant?: 'normal' | 'subtotal' | 'final' | 'subitem' | 'negative' | 'highlight'
    subtitle?: string
    showHomogeneo: boolean
    formatCurrency: (v: number) => string
    isNegative?: boolean
}

function CalcRowEl({ label, icon, historic, homogeneous, variant = 'normal', subtitle, showHomogeneo, formatCurrency, isNegative }: CalcRow) {
    const rowCls = {
        normal: '',
        subitem: 'text-xs',
        negative: '',
        subtotal: 'bg-slate-50 font-semibold',
        final: 'bg-[#F0F9FF] border-t-2 border-brand-primary',
        highlight: 'bg-slate-50',
    }[variant]

    const amtCls = {
        normal: 'text-slate-900',
        subitem: 'text-slate-500',
        negative: 'text-red-500 font-medium',
        subtotal: 'text-brand-primary font-semibold',
        final: 'text-slate-900 font-bold text-lg',
        highlight: 'text-slate-900 font-medium',
    }[variant]

    const labelCls = {
        normal: 'text-slate-500',
        subitem: 'text-slate-400 pl-4',
        negative: 'text-red-500 font-medium',
        subtotal: 'text-slate-700',
        final: 'text-slate-900 font-bold',
        highlight: 'text-slate-700 font-medium',
    }[variant]

    return (
        <tr className={`border-b border-dashed border-slate-100 last:border-b-0 ${rowCls}`}>
            <td className={`px-3 py-2.5 text-sm ${labelCls}`}>
                <div className="flex items-center gap-2">
                    {icon && <span className="text-slate-400">{icon}</span>}
                    <div>
                        <span>{label}</span>
                        {subtitle && <span className="block text-[10px] text-slate-400 font-normal">{subtitle}</span>}
                    </div>
                </div>
            </td>
            <td className={`px-3 py-2.5 text-right font-mono text-sm ${amtCls}`}>
                {isNegative ? `(${formatCurrency(Math.abs(historic))})` : formatCurrency(historic)}
            </td>
            {showHomogeneo && (
                <td className={`px-3 py-2.5 text-right font-mono text-sm ${homogeneous !== undefined ? 'text-emerald-700 bg-emerald-50/30' : 'text-slate-400'}`}>
                    {homogeneous !== undefined
                        ? (isNegative ? `(${formatCurrency(Math.abs(homogeneous))})` : formatCurrency(homogeneous))
                        : '—'}
                </td>
            )}
        </tr>
    )
}

// ─── CMVCard ────────────────────────────────────────────────
function CMVCard({
    isPeriodic,
    existenciaInicial,
    comprasBrutas,
    gastosCompras,
    bonifCompras,
    devolCompras,
    comprasNetas,
    ventasBrutas,
    bonifVentas,
    devolVentas,
    ventasNetas,
    inventarioTeorico,
    cmvPorDiferencia,
    showHomogeneo,
    rt6Adjustments,
    eiHomog,
    comprasNetasHomog,
    efTeoricaHomog,
    cmvHomog,
    costMethod,
    openingBalanceDate,
    formatCurrency,
}: Pick<
    CierreTabProps,
    'isPeriodic' | 'existenciaInicial' | 'comprasBrutas' | 'gastosCompras' |
    'bonifCompras' | 'devolCompras' | 'comprasNetas' | 'ventasBrutas' |
    'bonifVentas' | 'devolVentas' | 'ventasNetas' | 'inventarioTeorico' |
    'cmvPorDiferencia' | 'showHomogeneo' | 'rt6Adjustments' | 'eiHomog' |
    'comprasNetasHomog' | 'efTeoricaHomog' | 'cmvHomog' | 'costMethod' |
    'openingBalanceDate' | 'formatCurrency'
>) {
    const comprasHomog = comprasBrutas + rt6Adjustments.comprasAdj
    const gastosHomog = gastosCompras + rt6Adjustments.gastosAdj
    const bonifHomog = bonifCompras - rt6Adjustments.bonifAdj
    const devolHomog = devolCompras - rt6Adjustments.devolAdj

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h3 className="font-display font-semibold text-base text-slate-900">Cálculo del CMV</h3>
                <Calculator size={24} weight="duotone" className="text-brand-primary" />
            </div>

            <table className="w-full">
                <thead>
                    <tr>
                        <th className="text-left text-[10px] font-bold text-slate-400 uppercase px-3 py-2">Concepto</th>
                        <th className="text-right text-[10px] font-bold text-slate-400 uppercase px-3 py-2 w-28">Histórico</th>
                        {showHomogeneo && (
                            <th className="text-right text-[10px] font-bold text-emerald-600 uppercase px-3 py-2 w-28 bg-emerald-50/30">Homogéneo</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {/* EI */}
                    <CalcRowEl
                        label="Existencia Inicial (EI)"
                        icon={<Package size={16} />}
                        historic={existenciaInicial}
                        homogeneous={eiHomog}
                        variant="highlight"
                        subtitle={openingBalanceDate ? `Desde ${openingBalanceDate.split('-').reverse().join('/')}` : undefined}
                        showHomogeneo={showHomogeneo}
                        formatCurrency={formatCurrency}
                    />

                    {isPeriodic && (
                        <>
                            {/* Compras brutas */}
                            <CalcRowEl
                                label="(+) Compras Brutas"
                                icon={<ShoppingCart size={16} />}
                                historic={comprasBrutas}
                                homogeneous={comprasHomog}
                                showHomogeneo={showHomogeneo}
                                formatCurrency={formatCurrency}
                            />
                            {/* Gastos */}
                            {gastosCompras > 0 && (
                                <CalcRowEl
                                    label="(+) Gastos s/compras"
                                    icon={<Truck size={16} />}
                                    historic={gastosCompras}
                                    homogeneous={gastosHomog}
                                    variant="subitem"
                                    showHomogeneo={showHomogeneo}
                                    formatCurrency={formatCurrency}
                                />
                            )}
                            {/* Devoluciones */}
                            {devolCompras > 0 && (
                                <CalcRowEl
                                    label="(-) Devoluciones s/compras"
                                    icon={<ArrowUDownLeft size={16} />}
                                    historic={devolCompras}
                                    homogeneous={devolHomog}
                                    variant="negative"
                                    isNegative
                                    showHomogeneo={showHomogeneo}
                                    formatCurrency={formatCurrency}
                                />
                            )}
                            {/* Bonificaciones */}
                            {bonifCompras > 0 && (
                                <CalcRowEl
                                    label="(-) Bonificaciones s/compras"
                                    historic={bonifCompras}
                                    homogeneous={bonifHomog}
                                    variant="negative"
                                    isNegative
                                    showHomogeneo={showHomogeneo}
                                    formatCurrency={formatCurrency}
                                />
                            )}
                            {/* Compras Netas subtotal */}
                            <CalcRowEl
                                label="= Compras Netas"
                                historic={comprasNetas}
                                homogeneous={comprasNetasHomog}
                                variant="subtotal"
                                showHomogeneo={showHomogeneo}
                                formatCurrency={formatCurrency}
                            />
                        </>
                    )}

                    {!isPeriodic && (
                        <CalcRowEl
                            label="(+) Compras del Periodo"
                            icon={<ShoppingCart size={16} />}
                            historic={comprasBrutas}
                            homogeneous={comprasBrutas + rt6Adjustments.comprasAdj}
                            showHomogeneo={showHomogeneo}
                            formatCurrency={formatCurrency}
                        />
                    )}

                    {/* Spacer */}
                    <tr><td colSpan={showHomogeneo ? 3 : 2} className="h-3" /></tr>

                    {/* EF Teórica */}
                    <CalcRowEl
                        label="(-) Existencia Final"
                        historic={inventarioTeorico}
                        homogeneous={efTeoricaHomog}
                        variant="highlight"
                        subtitle={`Según método ${costMethod}`}
                        showHomogeneo={showHomogeneo}
                        formatCurrency={formatCurrency}
                    />

                    {/* CMV TOTAL */}
                    <CalcRowEl
                        label="= Costo Mercadería Vendida"
                        historic={cmvPorDiferencia}
                        homogeneous={cmvHomog}
                        variant="final"
                        showHomogeneo={showHomogeneo}
                        formatCurrency={formatCurrency}
                    />

                    {/* Ventas section */}
                    {isPeriodic && (ventasBrutas > 0 || bonifVentas > 0 || devolVentas > 0) && (
                        <>
                            <tr><td colSpan={showHomogeneo ? 3 : 2} className="h-3" /></tr>
                            <CalcRowEl
                                label="Ventas brutas"
                                historic={ventasBrutas}
                                showHomogeneo={showHomogeneo}
                                formatCurrency={formatCurrency}
                            />
                            {devolVentas > 0 && (
                                <CalcRowEl
                                    label="(-) Devol. s/ventas"
                                    historic={devolVentas}
                                    variant="negative"
                                    isNegative
                                    showHomogeneo={showHomogeneo}
                                    formatCurrency={formatCurrency}
                                />
                            )}
                            {bonifVentas > 0 && (
                                <CalcRowEl
                                    label="(-) Bonif. s/ventas"
                                    historic={bonifVentas}
                                    variant="negative"
                                    isNegative
                                    showHomogeneo={showHomogeneo}
                                    formatCurrency={formatCurrency}
                                />
                            )}
                            <CalcRowEl
                                label="= Ventas Netas"
                                historic={ventasNetas}
                                variant="subtotal"
                                showHomogeneo={showHomogeneo}
                                formatCurrency={formatCurrency}
                            />
                        </>
                    )}
                </tbody>
            </table>
        </div>
    )
}

// ─── AuditoriaFisica ────────────────────────────────────────
function AuditoriaFisica({
    closingPhysicalValue,
    setClosingPhysicalValue,
    esFisicoDefinido,
    difInvLocal,
    formatCurrency,
}: Pick<CierreTabProps, 'closingPhysicalValue' | 'setClosingPhysicalValue' | 'esFisicoDefinido' | 'difInvLocal' | 'formatCurrency'>) {
    return (
        <div className="border-t-2 border-amber-300 bg-amber-50/60 px-4 py-4 space-y-3 rounded-b-xl">
            <div className="text-[11px] font-bold text-amber-800 uppercase tracking-widest text-center">
                — Auditoría Física —
            </div>

            {/* Input row */}
            <div className="flex items-center justify-between bg-yellow-50 rounded-lg px-3 py-2.5 border border-yellow-200">
                <div>
                    <div className="text-sm font-medium text-yellow-900">Inv. Final Físico (Recuento)</div>
                    <div className="text-[10px] text-yellow-700/70">Ingresá el valor real</div>
                </div>
                <input
                    type="number"
                    min="0"
                    value={closingPhysicalValue !== null ? closingPhysicalValue : ''}
                    onChange={(e) => {
                        const val = e.target.value
                        setClosingPhysicalValue(val === '' ? null : Number(val))
                    }}
                    className="w-36 border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono text-right focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    placeholder="0,00"
                />
            </div>

            {/* Diferencia */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Scales size={16} className="text-slate-400" />
                    Diferencia Inventario
                </div>
                <span className={`font-mono text-sm font-semibold ${!esFisicoDefinido ? 'text-slate-400' : Math.abs(difInvLocal) < 0.01 ? 'text-slate-500' : difInvLocal > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {esFisicoDefinido
                        ? (difInvLocal > 0 ? '+ ' : '') + formatCurrency(difInvLocal)
                        : '—'}
                </span>
            </div>

            {/* Info message */}
            <div className="flex items-start gap-2 text-[11px] text-slate-500">
                <Info size={14} weight="fill" className="mt-0.5 text-slate-400 shrink-0" />
                <span>La diferencia se contabiliza como ajuste post-determinación del costo.</span>
            </div>
        </div>
    )
}

// ─── AsientosPreviewCard ────────────────────────────────────
type PreviewTab = 'resumen' | 'detalle'

function AsientosPreviewCard({
    isPeriodic,
    comprasNetas,
    cmvPorDiferencia,
    gastosCompras,
    bonifCompras,
    devolCompras,
    bonifVentas,
    devolVentas,
    esFisicoDefinido,
    difInvLocal,
    closingPhysicalValue,
    inventarioTeorico,
    formatCurrency,
}: Pick<
    CierreTabProps,
    'isPeriodic' | 'comprasNetas' | 'cmvPorDiferencia' | 'gastosCompras' |
    'bonifCompras' | 'devolCompras' | 'bonifVentas' | 'devolVentas' |
    'esFisicoDefinido' | 'difInvLocal' | 'closingPhysicalValue' | 'inventarioTeorico' | 'formatCurrency'
>) {
    const [tab, setTab] = useState<PreviewTab>('detalle')

    const hasRefundicion = gastosCompras > 0.01 || bonifCompras > 0.01 || devolCompras > 0.01
    const hasComprasNetas = Math.abs(comprasNetas) > 0.01
    const hasCMV = Math.abs(cmvPorDiferencia) > 0.01
    const hasVentasNeteo = bonifVentas > 0.01 || devolVentas > 0.01
    const hasDifInv = esFisicoDefinido && Math.abs(difInvLocal) > 0.01

    // For permanent mode
    const cierreAjusteMonto = Math.abs(esFisicoDefinido ? (closingPhysicalValue! - inventarioTeorico) : 0)
    const cierreAjusteEntrada = esFisicoDefinido && closingPhysicalValue! > inventarioTeorico

    let entryNum = 0

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <h3 className="font-display font-semibold text-base text-slate-900">Previsualización de Asientos</h3>
                <div className="flex gap-1">
                    {(['resumen', 'detalle'] as PreviewTab[]).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                                tab === t
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'border border-slate-200 text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 space-y-2.5 max-h-[500px] overflow-y-auto">
                {isPeriodic ? (
                    <>
                        {/* 1. Refundición */}
                        {hasRefundicion && (() => { entryNum++; return (
                            <EntryCard num={entryNum} title="Refundición de Compras" color="slate" summary={tab === 'resumen'}>
                                {gastosCompras > 0.01 && (
                                    <JournalLine debe="Compras" debeAmt={formatCurrency(gastosCompras)} haber="a Gastos s/compras" haberAmt={formatCurrency(gastosCompras)} />
                                )}
                                {bonifCompras > 0.01 && (
                                    <JournalLine debe="Bonif. s/compras" debeAmt={formatCurrency(bonifCompras)} haber="a Compras" haberAmt={formatCurrency(bonifCompras)} />
                                )}
                                {devolCompras > 0.01 && (
                                    <JournalLine debe="Devol. s/compras" debeAmt={formatCurrency(devolCompras)} haber="a Compras" haberAmt={formatCurrency(devolCompras)} />
                                )}
                            </EntryCard>
                        )})()}

                        {/* 2. Compras Netas → Mercaderías */}
                        {hasComprasNetas && (() => { entryNum++; return (
                            <EntryCard num={entryNum} title="Compras Netas → Mercaderías" color="green" summary={tab === 'resumen'}>
                                {comprasNetas > 0 ? (
                                    <JournalLine debe="Mercaderías" debeAmt={formatCurrency(comprasNetas)} haber="a Compras" haberAmt={formatCurrency(comprasNetas)} />
                                ) : (
                                    <JournalLine debe="Compras" debeAmt={formatCurrency(Math.abs(comprasNetas))} haber="a Mercaderías" haberAmt={formatCurrency(Math.abs(comprasNetas))} />
                                )}
                            </EntryCard>
                        )})()}

                        {/* 3. CMV */}
                        {hasCMV && (() => { entryNum++; return (
                            <EntryCard num={entryNum} title="Determinación CMV" color="blue" summary={tab === 'resumen'}>
                                {cmvPorDiferencia > 0 ? (
                                    <JournalLine debe="CMV" debeAmt={formatCurrency(cmvPorDiferencia)} haber="a Mercaderías" haberAmt={formatCurrency(cmvPorDiferencia)} />
                                ) : (
                                    <JournalLine debe="Mercaderías" debeAmt={formatCurrency(Math.abs(cmvPorDiferencia))} haber="a CMV" haberAmt={formatCurrency(Math.abs(cmvPorDiferencia))} />
                                )}
                            </EntryCard>
                        )})()}

                        {/* 4. Ventas Neteo */}
                        {hasVentasNeteo && (() => { entryNum++; return (
                            <EntryCard num={entryNum} title="Neteo Ventas" color="slate" summary={tab === 'resumen'}>
                                {bonifVentas > 0.01 && (
                                    <JournalLine debe="Ventas" debeAmt={formatCurrency(bonifVentas)} haber="a Bonif. s/ventas" haberAmt={formatCurrency(bonifVentas)} />
                                )}
                                {devolVentas > 0.01 && (
                                    <JournalLine debe="Ventas" debeAmt={formatCurrency(devolVentas)} haber="a Devol. s/ventas" haberAmt={formatCurrency(devolVentas)} />
                                )}
                            </EntryCard>
                        )})()}

                        {/* 5. DifInv */}
                        {hasDifInv && (() => { entryNum++; return (
                            <EntryCard num={entryNum} title={`Dif. Inventario (${difInvLocal < 0 ? 'Faltante' : 'Sobrante'})`} color={difInvLocal < 0 ? 'amber' : 'emerald'} summary={tab === 'resumen'}>
                                {difInvLocal < 0 ? (
                                    <JournalLine debe="Dif. Inventario" debeAmt={formatCurrency(Math.abs(difInvLocal))} haber="a Mercaderías" haberAmt={formatCurrency(Math.abs(difInvLocal))} />
                                ) : (
                                    <JournalLine debe="Mercaderías" debeAmt={formatCurrency(difInvLocal)} haber="a Dif. Inventario" haberAmt={formatCurrency(difInvLocal)} />
                                )}
                            </EntryCard>
                        )})()}

                        {!esFisicoDefinido && (
                            <div className="text-[10px] text-amber-500 px-1 mt-1">
                                Sin EF físico — se genera CMV con EF teórica. La Dif. Inventario se omite.
                            </div>
                        )}
                    </>
                ) : (
                    /* PERMANENT mode */
                    <div className="space-y-2">
                        {!esFisicoDefinido || cierreAjusteMonto < 0.01 ? (
                            <div className="text-slate-500 text-center py-4 text-sm">
                                {!esFisicoDefinido ? 'Ingresá el inventario físico para ver la previsualización.' : 'Sin diferencias para ajustar.'}
                            </div>
                        ) : (
                            <EntryCard num={1} title="Ajuste de Inventario" color="slate" summary={false}>
                                <JournalLine
                                    debe={cierreAjusteEntrada ? 'Mercaderías' : 'Dif. Inventario'}
                                    debeAmt={formatCurrency(cierreAjusteMonto)}
                                    haber={cierreAjusteEntrada ? 'a Dif. Inventario' : 'a Mercaderías'}
                                    haberAmt={formatCurrency(cierreAjusteMonto)}
                                />
                            </EntryCard>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// Entry card sub-component
function EntryCard({ num, title, color, children, summary }: { num: number; title: string; color: string; children: React.ReactNode; summary: boolean }) {
    const colorMap: Record<string, string> = {
        slate: 'bg-slate-50 border-slate-200',
        green: 'bg-green-50 border-green-200',
        blue: 'bg-blue-50 border-blue-200',
        amber: 'bg-amber-50 border-amber-200',
        emerald: 'bg-emerald-50 border-emerald-200',
    }
    const titleColorMap: Record<string, string> = {
        slate: 'text-slate-500',
        green: 'text-green-600',
        blue: 'text-blue-600',
        amber: 'text-amber-600',
        emerald: 'text-emerald-600',
    }

    return (
        <div className={`p-3 rounded-lg border ${colorMap[color] || colorMap.slate}`}>
            <div className={`text-[11px] font-bold uppercase mb-1.5 ${titleColorMap[color] || titleColorMap.slate}`}>
                {num}. {title}
            </div>
            {!summary && <div className="font-mono text-xs space-y-0.5">{children}</div>}
            {summary && <div className="text-[10px] text-slate-400 italic">Ver pestaña Detalle</div>}
        </div>
    )
}

// Journal line sub-component
function JournalLine({ debe, debeAmt, haber, haberAmt }: { debe: string; debeAmt: string; haber: string; haberAmt: string }) {
    return (
        <>
            <div className="flex justify-between">
                <span className="font-medium">{debe}</span>
                <span className="font-bold">{debeAmt}</span>
            </div>
            <div className="flex justify-between text-slate-400">
                <span>&nbsp;&nbsp;{haber}</span>
                <span>{haberAmt}</span>
            </div>
        </>
    )
}

// ─── KPIGrid ────────────────────────────────────────────────
function KPIGrid({
    ventasNetas,
    cmvPorDiferencia,
    esFisicoDefinido,
    closingPhysicalValue,
    inventarioTeorico,
    showHomogeneo,
    cmvHomog,
    formatCurrency,
}: Pick<CierreTabProps, 'ventasNetas' | 'cmvPorDiferencia' | 'esFisicoDefinido' | 'closingPhysicalValue' | 'inventarioTeorico' | 'showHomogeneo' | 'cmvHomog' | 'formatCurrency'>) {
    const resultadoBruto = ventasNetas - cmvPorDiferencia
    const margenBruto = ventasNetas > 0 ? (resultadoBruto / ventasNetas) * 100 : 0
    const resultadoBrutoHomog = showHomogeneo ? ventasNetas - cmvHomog : undefined
    const mercFinal = esFisicoDefinido ? closingPhysicalValue! : inventarioTeorico

    const items: { label: string; value: string; sub?: string; color?: string }[] = [
        { label: 'Ventas Netas', value: formatCurrency(ventasNetas) },
        {
            label: 'Resultado Bruto',
            value: formatCurrency(resultadoBruto),
            sub: showHomogeneo && resultadoBrutoHomog !== undefined ? `Homog: ${formatCurrency(resultadoBrutoHomog)}` : undefined,
            color: resultadoBruto >= 0 ? 'text-brand-primary' : 'text-red-600',
        },
        { label: 'Margen Bruto', value: ventasNetas > 0 ? fmtPct(margenBruto) : '—' },
        {
            label: 'Mercaderías Final',
            value: formatCurrency(mercFinal),
            sub: esFisicoDefinido ? 'Físico' : 'Teórico',
        },
    ]

    return (
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
            {items.map((item) => (
                <div key={item.label} className="bg-white rounded-lg border border-slate-200 p-3">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">{item.label}</div>
                    <div className={`font-mono text-lg font-bold ${item.color || 'text-slate-900'}`}>{item.value}</div>
                    {item.sub && <div className="text-[10px] text-slate-400">{item.sub}</div>}
                </div>
            ))}
        </div>
    )
}

// ─── CTA Button ─────────────────────────────────────────────
function CtaButton({
    isPeriodic,
    handleGenerateClosingEntry,
    closingIsSaving,
    closingPhysicalValue,
    inventoryMode,
}: {
    isPeriodic: boolean
    handleGenerateClosingEntry: () => void
    closingIsSaving: boolean
    closingPhysicalValue: number | null
    inventoryMode: string
}) {
    const disabled = closingIsSaving || (inventoryMode !== 'PERIODIC' && (closingPhysicalValue === null || closingPhysicalValue < 0))

    return (
        <div className="sticky bottom-0 pt-4 pb-2 bg-gradient-to-t from-slate-50 via-slate-50/90 to-transparent flex justify-end z-10">
            <button
                onClick={handleGenerateClosingEntry}
                disabled={disabled}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-base transition-all ${disabled ? 'bg-slate-200 border border-slate-300 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-lg shadow-blue-500/20 hover:shadow-[0_6px_16px_rgba(37,99,235,0.4)] hover:-translate-y-0.5'}`}
            >
                <Check size={18} weight="bold" />
                {closingIsSaving
                    ? 'Generando...'
                    : isPeriodic
                    ? 'Generar Asientos de Cierre'
                    : 'Generar Asiento de Cierre'}
            </button>
        </div>
    )
}

// ═══════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════
export default function CierreInventarioTab(props: CierreTabProps) {
    const {
        isPeriodic,
        costMethod,
        yearRangeStart,
        yearRangeEnd,
        showHomogeneo,
        setShowHomogeneo,
        rt6HasData,
        openAccountConfigModal,
        movementsCount,
        hasSavedMappings,
        alertsCount,
        accountMappingsSummary,
        existenciaInicial,
        comprasBrutas,
        gastosCompras,
        bonifCompras,
        devolCompras,
        comprasNetas,
        ventasBrutas,
        bonifVentas,
        devolVentas,
        ventasNetas,
        inventarioTeorico,
        cmvPorDiferencia,
        rt6Adjustments,
        eiHomog,
        comprasNetasHomog,
        efTeoricaHomog,
        cmvHomog,
        closingPhysicalValue,
        setClosingPhysicalValue,
        esFisicoDefinido,
        difInvLocal,
        openingBalanceDate,
        handleGenerateClosingEntry,
        closingIsSaving,
        formatCurrency,
    } = props

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Header */}
            <CierreHeader
                isPeriodic={isPeriodic}
                costMethod={costMethod}
                yearRangeStart={yearRangeStart}
                yearRangeEnd={yearRangeEnd}
                rt6HasData={rt6HasData}
                showHomogeneo={showHomogeneo}
                setShowHomogeneo={setShowHomogeneo}
                openAccountConfigModal={openAccountConfigModal}
            />

            {/* Status bar */}
            <StatusBar
                movementsCount={movementsCount}
                hasSavedMappings={hasSavedMappings}
                alertsCount={alertsCount}
                costMethod={costMethod}
                rt6HasData={rt6HasData}
            />

            {/* Account mappings */}
            {accountMappingsSummary.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {accountMappingsSummary.map(({ key, label, account }) => (
                        <span key={key} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-xs font-semibold">
                            {label}: {account.code}
                        </span>
                    ))}
                </div>
            )}

            {/* Main 2-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5">
                {/* LEFT: Calculation + Audit */}
                <div className="flex flex-col">
                    <CMVCard
                        isPeriodic={isPeriodic}
                        existenciaInicial={existenciaInicial}
                        comprasBrutas={comprasBrutas}
                        gastosCompras={gastosCompras}
                        bonifCompras={bonifCompras}
                        devolCompras={devolCompras}
                        comprasNetas={comprasNetas}
                        ventasBrutas={ventasBrutas}
                        bonifVentas={bonifVentas}
                        devolVentas={devolVentas}
                        ventasNetas={ventasNetas}
                        inventarioTeorico={inventarioTeorico}
                        cmvPorDiferencia={cmvPorDiferencia}
                        showHomogeneo={showHomogeneo}
                        rt6Adjustments={rt6Adjustments}
                        eiHomog={eiHomog}
                        comprasNetasHomog={comprasNetasHomog}
                        efTeoricaHomog={efTeoricaHomog}
                        cmvHomog={cmvHomog}
                        costMethod={costMethod}
                        openingBalanceDate={openingBalanceDate}
                        formatCurrency={formatCurrency}
                    />
                    <AuditoriaFisica
                        closingPhysicalValue={closingPhysicalValue}
                        setClosingPhysicalValue={setClosingPhysicalValue}
                        esFisicoDefinido={esFisicoDefinido}
                        difInvLocal={difInvLocal}
                        formatCurrency={formatCurrency}
                    />
                </div>

                {/* RIGHT: Preview + KPIs */}
                <div className="flex flex-col gap-4">
                    <AsientosPreviewCard
                        isPeriodic={isPeriodic}
                        comprasNetas={comprasNetas}
                        cmvPorDiferencia={cmvPorDiferencia}
                        gastosCompras={gastosCompras}
                        bonifCompras={bonifCompras}
                        devolCompras={devolCompras}
                        bonifVentas={bonifVentas}
                        devolVentas={devolVentas}
                        esFisicoDefinido={esFisicoDefinido}
                        difInvLocal={difInvLocal}
                        closingPhysicalValue={closingPhysicalValue}
                        inventarioTeorico={inventarioTeorico}
                        formatCurrency={formatCurrency}
                    />

                    {isPeriodic && (
                        <KPIGrid
                            ventasNetas={ventasNetas}
                            cmvPorDiferencia={cmvPorDiferencia}
                            esFisicoDefinido={esFisicoDefinido}
                            closingPhysicalValue={closingPhysicalValue}
                            inventarioTeorico={inventarioTeorico}
                            showHomogeneo={showHomogeneo}
                            cmvHomog={cmvHomog}
                            formatCurrency={formatCurrency}
                        />
                    )}
                </div>
            </div>

            {/* CTA */}
            <CtaButton
                isPeriodic={isPeriodic}
                handleGenerateClosingEntry={handleGenerateClosingEntry}
                closingIsSaving={closingIsSaving}
                closingPhysicalValue={closingPhysicalValue}
                inventoryMode={isPeriodic ? 'PERIODIC' : 'PERMANENT'}
            />
        </div>
    )
}
