/**
 * ExpensesByFunctionView — Fase 2E (§9.3): anexo de gastos por función.
 *
 * Presentador PURO de la matriz cuenta × función del bundle: encabezados y
 * primera columna sticky, totales por fila y columna, porcentajes, filtros
 * por función y por cuenta, advertencia por gastos sin función, comparativo
 * y drilldown de trazabilidad. Vista móvil por cuenta.
 */

import { useMemo, useState } from 'react'
import type { ResultFunction } from '../../../core/models'
import type { ExpensesByFunctionMatrix } from '../../../reporting/domain/types'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v: number | null | undefined) => (v == null ? '–' : nf.format(v))

const SOURCE_LABEL: Record<string, string> = {
    RULE: 'regla de distribución',
    MAPPING: 'mapping explícito',
    DERIVED: 'derivado del rubro',
}

export interface ExpensesByFunctionViewProps {
    matrix: ExpensesByFunctionMatrix
    showComparative: boolean
    onAccountClick?: (label: string, accountIds: string[]) => void
}

export function ExpensesByFunctionView({ matrix, showComparative, onAccountClick }: ExpensesByFunctionViewProps) {
    const [functionFilter, setFunctionFilter] = useState<ResultFunction | 'ALL'>('ALL')
    const [accountFilter, setAccountFilter] = useState('')

    const visibleColumns = useMemo(
        () => matrix.columns.filter(c => functionFilter === 'ALL' || c.function === functionFilter),
        [matrix.columns, functionFilter])

    const visibleRows = useMemo(() => {
        const text = accountFilter.trim().toLowerCase()
        return matrix.rows.filter(r => {
            if (functionFilter !== 'ALL' && r.cells[functionFilter] === undefined) return false
            if (text && !`${r.code} ${r.name}`.toLowerCase().includes(text)) return false
            return true
        })
    }, [matrix.rows, functionFilter, accountFilter])

    if (matrix.rows.length === 0 && matrix.unmappedExpenses.length === 0) {
        return (
            <div className="ebf-empty">
                No hay gastos registrados en este ejercicio. El anexo se construye con las cuentas de gasto
                (excluidos el costo de ventas y el impuesto a las ganancias, que tienen exposición propia).
                <style>{styles}</style>
            </div>
        )
    }

    const grandTotal = matrix.totals.total

    return (
        <div>
            <p className="ebf-intro">
                Cada gasto del ER abierto por función según su mapping estructural o su regla de distribución.
                La suma de las funciones de cada cuenta es exactamente el total de la cuenta, y el total del
                anexo concilia con los gastos expuestos en el Estado de Resultados.
            </p>

            {matrix.unmappedExpenses.length > 0 && (
                <div role="alert" className="ebf-warning">
                    ⚠ {matrix.unmappedExpenses.length} cuenta(s) de gasto sin función asignada:
                    {' '}{matrix.unmappedExpenses.map(u => `${u.code} ${u.name} (${money(u.total)})`).join(' · ')}.
                    Asignales una función en Configuración → Plan de cuentas y mapeos; bloquean la publicación formal.
                </div>
            )}

            <div className="ebf-toolbar">
                <label className="ebf-field">
                    <span className="ebf-field-label">Función</span>
                    <select value={functionFilter} onChange={e => setFunctionFilter(e.target.value as ResultFunction | 'ALL')}>
                        <option value="ALL">Todas</option>
                        {matrix.columns.map(c => <option key={c.function} value={c.function}>{c.label}</option>)}
                    </select>
                </label>
                <label className="ebf-field">
                    <span className="ebf-field-label">Cuenta</span>
                    <input
                        type="search"
                        placeholder="Filtrar por código o nombre…"
                        value={accountFilter}
                        onChange={e => setAccountFilter(e.target.value)}
                    />
                </label>
            </div>

            <div className="ebf-scroll" role="region" aria-label="Anexo de gastos por función" tabIndex={0}>
                <table className="ebf-table">
                    <thead>
                        <tr>
                            <th className="ebf-corner" scope="col">Cuenta</th>
                            <th className="ebf-head num" scope="col">Total</th>
                            {visibleColumns.map(c => (
                                <th key={c.function} className="ebf-head num" scope="col">{c.label}</th>
                            ))}
                            {showComparative && <th className="ebf-head num comp" scope="col">Ej. anterior</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map(r => {
                            const clickable = !!onAccountClick
                            return (
                                <tr
                                    key={r.accountId}
                                    className={clickable ? 'is-clickable' : undefined}
                                    onClick={clickable ? () => onAccountClick!(`${r.code} ${r.name}`, [r.accountId]) : undefined}
                                    tabIndex={clickable ? 0 : undefined}
                                    onKeyDown={clickable ? e => { if (e.key === 'Enter') onAccountClick!(`${r.code} ${r.name}`, [r.accountId]) } : undefined}
                                    title={clickable ? `Asignación por ${SOURCE_LABEL[r.source]} · clic para ver trazabilidad` : undefined}
                                >
                                    <th scope="row" className="ebf-rowlabel">
                                        {r.code} {r.name}
                                        {r.source === 'RULE' && <span className="ebf-rule-badge" title="Distribuida por regla versionada">%</span>}
                                    </th>
                                    <td className="num strong">{money(r.total)}</td>
                                    {visibleColumns.map(c => {
                                        const v = r.cells[c.function]
                                        const pct = v !== undefined && r.total !== 0 ? (v / r.total) * 100 : null
                                        return (
                                            <td key={c.function} className="num">
                                                {money(v)}
                                                {pct !== null && pct < 100 && <span className="ebf-pct"> ({pct.toFixed(0)}%)</span>}
                                            </td>
                                        )
                                    })}
                                    {showComparative && <td className="num comp">{money(r.comparativeTotal)}</td>}
                                </tr>
                            )
                        })}
                        <tr className="ebf-total-row">
                            <th scope="row" className="ebf-rowlabel">Total del anexo</th>
                            <td className="num strong">{money(grandTotal)}</td>
                            {visibleColumns.map(c => {
                                const v = matrix.totals.byFunction[c.function]
                                const pct = v !== undefined && grandTotal !== 0 ? (v / grandTotal) * 100 : null
                                return (
                                    <td key={c.function} className="num strong">
                                        {money(v)}
                                        {pct !== null && <span className="ebf-pct"> ({pct.toFixed(1)}%)</span>}
                                    </td>
                                )
                            })}
                            {showComparative && <td className="num comp strong">{money(matrix.totals.comparativeTotal)}</td>}
                        </tr>
                    </tbody>
                </table>
            </div>

            <style>{styles}</style>
        </div>
    )
}

const styles = `
.ebf-intro { font-size: 0.82rem; color: #64748b; margin: 0 0 12px; line-height: 1.5; }
.ebf-empty { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #64748b; font-size: 0.88rem; line-height: 1.5; }
.ebf-warning {
    margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; font-size: 0.8rem; line-height: 1.5;
    background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.35); color: #854d0e;
}
.ebf-toolbar { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.ebf-field { display: flex; flex-direction: column; gap: 4px; }
.ebf-field-label { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
.ebf-field select, .ebf-field input { padding: 7px 10px; font-size: 0.84rem; border: 1px solid #e2e8f0; border-radius: 8px; background: white; min-width: 200px; }
.ebf-field select:focus-visible, .ebf-field input:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }

.ebf-scroll { overflow: auto; max-height: 65vh; border: 1px solid #e2e8f0; border-radius: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.ebf-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 0.82rem; }
.ebf-table th, .ebf-table td { padding: 8px 12px; white-space: nowrap; }
.ebf-corner {
    position: sticky; left: 0; top: 0; z-index: 4; background: #f8fafc; text-align: left;
    font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;
    border-bottom: 2px solid #e2e8f0; border-right: 1px solid #e2e8f0; min-width: 240px;
}
.ebf-head {
    position: sticky; top: 0; z-index: 3; background: #f8fafc;
    font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #475569;
    border-bottom: 2px solid #e2e8f0;
}
.ebf-head.comp, .ebf-table td.comp { color: #64748b; background: rgba(148,163,184,0.06); }
.ebf-table th.num, .ebf-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.ebf-rowlabel {
    position: sticky; left: 0; z-index: 2; background: white; text-align: left; font-weight: 500;
    color: #0f172a; border-right: 1px solid #e2e8f0; border-top: 1px solid #f1f5f9; white-space: normal; min-width: 240px;
}
.ebf-table td { border-top: 1px solid #f8fafc; color: #334155; }
.ebf-table td.strong { font-weight: 700; color: #0f172a; }
.ebf-table tr.is-clickable { cursor: pointer; }
.ebf-table tr.is-clickable:hover td, .ebf-table tr.is-clickable:hover th { background: #f8fafc; }
.ebf-table tr.is-clickable:focus-visible { outline: 2px solid #3B82F6; outline-offset: -2px; }
.ebf-pct { font-size: 0.68rem; color: #94a3b8; }
.ebf-rule-badge {
    display: inline-block; margin-left: 6px; font-size: 0.62rem; font-weight: 700;
    background: rgba(139,92,246,0.1); color: #6d28d9; padding: 1px 6px; border-radius: 999px;
}
.ebf-total-row th, .ebf-total-row td { border-top: 2px solid #cbd5e1; background: #f8fafc; font-weight: 700; }
`
