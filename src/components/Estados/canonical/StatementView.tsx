/**
 * StatementView — Fase 2D (§1): presentadores PUROS que recuperan el diseño
 * visual anterior (tarjetas de sección, rubros con detalle desplegable, badges
 * de nota, pills de variación) pero alimentados EXCLUSIVAMENTE por los árboles
 * de ReportLine del ReportingBundle.
 *
 * Solo presentación. No consulta Dexie. No recalcula importes: cada cifra ya
 * viene calculada por el motor canónico (src/reporting).
 */

import { useState } from 'react'
import { Scale, PieChart, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react'
import type { ReportLine } from '../../../reporting/domain/types'
import { money, computeDelta, ACCENT_COLOR, type StatementAccent } from './statementFormat'

const ACCENT_ICON: Record<StatementAccent, React.ElementType> = {
    green: Scale,
    red: TrendingUp,
    blue: Scale,
    violet: PieChart,
}

// ─────────────────────────────────────────────────────────────
// Fila de cuenta (level 2): detalle desplegado bajo un rubro
// ─────────────────────────────────────────────────────────────
function AccountRow({ line, showComparative, onLineClick }: {
    line: ReportLine
    showComparative: boolean
    onLineClick?: (l: ReportLine) => void
}) {
    const clickable = !!onLineClick && line.accountIds.length > 0
    return (
        <div
            className={`stmt-account-row${clickable ? ' is-clickable' : ''}`}
            onClick={clickable ? () => onLineClick!(line) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLineClick!(line) } } : undefined}
            title={clickable ? 'Ver trazabilidad hasta los asientos' : undefined}
        >
            <span className="stmt-account-name">{line.label}</span>
            {showComparative ? (
                <span className="stmt-account-values">
                    <span className="stmt-amount">{money(line.amount)}</span>
                    <span className="stmt-amount stmt-amount-prev">{money(line.comparativeAmount)}</span>
                    <span />
                </span>
            ) : (
                <span className="stmt-amount">{money(line.amount)}</span>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Fila de rubro (level 1): desplegable si tiene cuentas
// ─────────────────────────────────────────────────────────────
function RubroRow({ line, showComparative, onLineClick }: {
    line: ReportLine
    showComparative: boolean
    onLineClick?: (l: ReportLine) => void
}) {
    const children = line.children ?? []
    const hasDetail = children.length > 0
    // Rubros sin cuentas detalladas pero con linaje (p.ej. movimientos del EEPN)
    // abren la trazabilidad directamente.
    const lineageOnly = !hasDetail && !!onLineClick && line.accountIds.length > 0
    const interactive = hasDetail || lineageOnly
    const [open, setOpen] = useState(false)
    const delta = showComparative ? computeDelta(line.amount, line.comparativeAmount) : null

    const activate = () => {
        if (hasDetail) setOpen(o => !o)
        else if (lineageOnly) onLineClick!(line)
    }

    return (
        <>
            <div
                className={`stmt-rubro-row${interactive ? ' has-detail' : ''}${open ? ' is-open' : ''}`}
                onClick={interactive ? activate : undefined}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-expanded={hasDetail ? open : undefined}
                title={lineageOnly ? 'Ver trazabilidad hasta los asientos' : undefined}
                onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate() } } : undefined}
            >
                <span className="stmt-rubro-label">
                    {hasDetail
                        ? <ChevronRight size={14} strokeWidth={2.5} className="stmt-caret" aria-hidden />
                        : lineageOnly ? <span className="stmt-trace" aria-hidden>↳</span> : <span className="stmt-caret-spacer" aria-hidden />}
                    <span className="stmt-rubro-name">{line.label}</span>
                    {line.noteRef && <span className="stmt-note-badge">Nota {line.noteRef}</span>}
                </span>

                {showComparative ? (
                    <span className="stmt-rubro-values">
                        <span className="stmt-value-cell">
                            <span className="stmt-mobile-label">Actual</span>
                            <span className="stmt-amount">{money(line.amount)}</span>
                        </span>
                        <span className="stmt-value-cell">
                            <span className="stmt-mobile-label">Anterior</span>
                            <span className="stmt-amount stmt-amount-prev">{money(line.comparativeAmount)}</span>
                        </span>
                        <span className="stmt-value-cell stmt-delta-cell">
                            {delta && (
                                <span className={`stmt-delta-pill ${delta.tone}`}>
                                    {delta.text}
                                    {delta.tone === 'positive' && <TrendingUp size={11} strokeWidth={2.5} />}
                                    {delta.tone === 'negative' && <TrendingDown size={11} strokeWidth={2.5} />}
                                </span>
                            )}
                        </span>
                    </span>
                ) : (
                    <span className="stmt-amount stmt-rubro-single">{money(line.amount)}</span>
                )}
            </div>

            {hasDetail && open && (
                <div className="stmt-account-list">
                    {children.map(c => (
                        <AccountRow key={c.id} line={c} showComparative={showComparative} onLineClick={onLineClick} />
                    ))}
                </div>
            )}
        </>
    )
}

// ─────────────────────────────────────────────────────────────
// Fila de total intermedio (level 0 dentro de un flujo, p.ej. ER/EEPN)
// ─────────────────────────────────────────────────────────────
function TotalRow({ line, showComparative }: { line: ReportLine; showComparative: boolean }) {
    const delta = showComparative ? computeDelta(line.amount, line.comparativeAmount) : null
    return (
        <div className="stmt-total-row">
            <span className="stmt-total-label">{line.label}</span>
            {showComparative ? (
                <span className="stmt-rubro-values">
                    <span className="stmt-value-cell"><span className="stmt-mobile-label">Actual</span><span className="stmt-amount">{money(line.amount)}</span></span>
                    <span className="stmt-value-cell"><span className="stmt-mobile-label">Anterior</span><span className="stmt-amount stmt-amount-prev">{money(line.comparativeAmount)}</span></span>
                    <span className="stmt-value-cell stmt-delta-cell">
                        {delta && <span className={`stmt-delta-pill ${delta.tone}`}>{delta.text}</span>}
                    </span>
                </span>
            ) : (
                <span className="stmt-amount stmt-rubro-single">{money(line.amount)}</span>
            )}
        </div>
    )
}

/** Renderiza una lista de ReportLine decidiendo el estilo por su `level`. */
export function StatementRows({ lines, showComparative, onLineClick }: {
    lines: ReportLine[]
    showComparative: boolean
    onLineClick?: (l: ReportLine) => void
}) {
    return (
        <div className="stmt-rows">
            {showComparative && (
                <div className="stmt-column-headers" aria-hidden>
                    <div>Rubro</div>
                    <div className="stmt-col-right">Actual</div>
                    <div className="stmt-col-right">Anterior</div>
                    <div className="stmt-col-center">Δ</div>
                </div>
            )}
            {lines.map(line =>
                line.level === 0
                    ? <TotalRow key={line.id} line={line} showComparative={showComparative} />
                    : <RubroRow key={line.id} line={line} showComparative={showComparative} onLineClick={onLineClick} />
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────
// Tarjeta de sección con encabezado (icono + título + total)
// ─────────────────────────────────────────────────────────────
export function StatementCard({ title, accent = 'blue', total, comparativeTotal, showComparative, children }: {
    title: string
    accent?: StatementAccent
    total?: number
    comparativeTotal?: number | null
    showComparative?: boolean
    children: React.ReactNode
}) {
    const Icon = ACCENT_ICON[accent]
    return (
        <section className="stmt-card">
            <header className="stmt-card-header">
                <h2 className="stmt-card-title">
                    <Icon size={20} strokeWidth={2.25} style={{ color: ACCENT_COLOR[accent] }} aria-hidden />
                    {title}
                </h2>
                {total != null && (
                    <span className="stmt-card-total-wrap">
                        <span className="stmt-card-total">{money(total)}</span>
                        {showComparative && comparativeTotal != null && (
                            <span className="stmt-card-total-prev">{money(comparativeTotal)}</span>
                        )}
                    </span>
                )}
            </header>
            <div className="stmt-card-body">{children}</div>
        </section>
    )
}
