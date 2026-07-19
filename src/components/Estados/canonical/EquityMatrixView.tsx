/**
 * EquityMatrixView — Fase 2E (§6.5/§6.6): presentador PURO del EEPN matricial.
 *
 * Cuadro de doble entrada: filas = movimientos conceptuales, columnas =
 * componentes del PN agrupados (aportes / ganancias reservadas / resultados no
 * asignados / diferidos). Todo viene calculado del EquityMatrixViewModel del
 * ReportingBundle; acá no hay Dexie ni aritmética contable, solo presentación:
 * encabezados sticky, primera columna fija, filtro de movimientos, drilldown a
 * trazabilidad y una vista móvil por movimiento.
 */

import { useMemo, useState } from 'react'
import type {
    EquityMatrixColumn,
    EquityMatrixRow,
    EquityMatrixViewModel,
} from '../../../reporting/domain/types'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (n: number) => nf.format(n)

const ROW_HINT: Partial<Record<string, string>> = {
    OPENING_BALANCE: 'Saldos de cada componente al comienzo del ejercicio (apertura o arrastre del ejercicio anterior).',
    PRIOR_PERIOD_ADJUSTMENT: 'Correcciones de resultados de ejercicios anteriores (AREA). Requiere identificación estructural del asiento.',
    ADJUSTED_OPENING: 'Saldo inicial + modificaciones de ejercicios anteriores.',
    CONTRIBUTION: 'Aportes con contrapartida fuera del PN (efectivo u otros activos recibidos de los propietarios).',
    WITHDRAWAL: 'Retiros o reducciones de capital con salida de recursos.',
    DISTRIBUTION: 'Distribuciones de resultados (p. ej. dividendos): reducen resultados acumulados contra un activo o pasivo.',
    RESERVE_CREATION: 'Transferencia interna: los resultados acumulados se transfieren a reservas. La fila suma 0.',
    RESERVE_RELEASE: 'Transferencia interna inversa: la reserva vuelve a resultados acumulados. La fila suma 0.',
    CAPITALIZATION: 'Transferencia interna hacia el capital (p. ej. capitalización de resultados). La fila suma 0.',
    LOSS_ABSORPTION: 'Absorción de pérdidas acumuladas contra capital o reservas. La fila suma 0.',
    CURRENT_RESULT: 'Resultado del ejercicio según el Estado de Resultados; ingresa al PN por su propia fila.',
    OTHER: 'Movimientos patrimoniales que no encajan en las filas anteriores.',
    TOTAL_VARIATIONS: 'Suma de todas las variaciones del ejercicio.',
    CLOSING: 'Saldo inicial ajustado + total de variaciones. Debe coincidir con el PN del ESP.',
}

const COLUMN_HINT: Partial<Record<string, string>> = {
    CAPITAL: 'Capital suscripto e integrado (valor nominal).',
    CAPITAL_ADJUSTMENT: 'Reexpresión monetaria acumulada del capital.',
    SHARE_PREMIUM: 'Primas de emisión de acciones.',
    IRREVOCABLE_CONTRIBUTION: 'Aportes irrevocables a cuenta de futuras suscripciones.',
    LEGAL_RESERVE: 'Reserva legal (art. 70 LGS).',
    STATUTORY_RESERVE: 'Reservas previstas por el estatuto.',
    OTHER_RESERVE: 'Reservas facultativas y otras.',
    PRIOR_RETAINED_EARNINGS: 'Resultados acumulados de ejercicios anteriores sin asignación específica.',
    CURRENT_RESULT: 'Resultado del ejercicio corriente.',
    DEFERRED_RESULT: 'Resultados diferidos (cuando el perfil normativo los requiera).',
    OTHER_EQUITY: 'Componentes del PN sin mapping específico (revisar en Configuración).',
}

export interface EquityMatrixViewProps {
    matrix: EquityMatrixViewModel
    onCellClick?: (label: string, accountIds: string[]) => void
}

function cellText(row: EquityMatrixRow, component: string): string {
    const v = row.cells[component as keyof typeof row.cells]
    if (v === undefined || v === null) return '–'
    return money(v)
}

function RowTr({ row, columns, comparativeTotal, onCellClick }: {
    row: EquityMatrixRow
    columns: EquityMatrixColumn[]
    comparativeTotal?: number | null
    onCellClick?: (label: string, accountIds: string[]) => void
}) {
    const clickable = !!onCellClick && row.accountIds.length > 0
    return (
        <tr className={`eqm-row${row.isSubtotal ? ' eqm-subtotal' : ''}`}>
            <th
                scope="row"
                className={`eqm-rowlabel${clickable ? ' is-clickable' : ''}`}
                title={ROW_HINT[row.type]}
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? 'button' : undefined}
                onClick={clickable ? () => onCellClick!(row.label, row.accountIds) : undefined}
                onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick!(row.label, row.accountIds) } } : undefined}
            >
                {row.label}
            </th>
            {columns.map(c => {
                const v = row.cells[c.component]
                const cellClickable = !!onCellClick && v !== undefined && c.accountIds.length > 0
                return (
                    <td
                        key={c.component}
                        className={`eqm-cell${v !== undefined && v < 0 ? ' is-neg' : ''}${cellClickable ? ' is-clickable' : ''}`}
                        onClick={cellClickable ? () => onCellClick!(`${row.label} — ${c.label}`, c.accountIds) : undefined}
                        title={cellClickable ? 'Ver trazabilidad hasta los asientos' : undefined}
                    >
                        {cellText(row, c.component)}
                    </td>
                )
            })}
            <td className={`eqm-cell eqm-total${row.total < 0 ? ' is-neg' : ''}`}>{money(row.total)}</td>
            {comparativeTotal !== undefined && (
                <td className="eqm-cell eqm-comp">{comparativeTotal == null ? '–' : money(comparativeTotal)}</td>
            )}
        </tr>
    )
}

export function EquityMatrixView({ matrix, onCellClick }: EquityMatrixViewProps) {
    const [onlyMovements, setOnlyMovements] = useState(true)
    const [mobileRowIdx, setMobileRowIdx] = useState(0)
    const hasComparative = matrix.comparative != null

    const movementRows = useMemo(
        () => matrix.movementRows.filter(r => !onlyMovements || r.hasData),
        [matrix.movementRows, onlyMovements])

    const structuralRows: { row: EquityMatrixRow; comp?: number | null }[] = useMemo(() => {
        const rows: { row: EquityMatrixRow; comp?: number | null }[] = []
        rows.push({ row: matrix.openingRow, comp: hasComparative ? matrix.comparative!.openingTotal : undefined })
        if (!onlyMovements || matrix.priorAdjustmentRow.hasData) rows.push({ row: matrix.priorAdjustmentRow, comp: hasComparative ? null : undefined })
        if (matrix.priorAdjustmentRow.hasData || !onlyMovements) rows.push({ row: matrix.adjustedOpeningRow, comp: hasComparative ? null : undefined })
        return rows
    }, [matrix, onlyMovements, hasComparative])

    const allMobileRows = useMemo(() =>
        [matrix.openingRow, ...matrix.movementRows.filter(r => r.hasData), matrix.totalVariationsRow, matrix.closingRow],
    [matrix])
    const mobileRow = allMobileRows[Math.min(mobileRowIdx, allMobileRows.length - 1)]

    if (matrix.columns.length === 0) {
        return (
            <div className="stmt-card" style={{ padding: 20, color: '#64748b', fontSize: '0.88rem' }}>
                No hay componentes de patrimonio neto con datos en este ejercicio.
                <style>{matrixStyles}</style>
            </div>
        )
    }

    return (
        <div>
            <div className="eqm-toolbar" role="group" aria-label="Filtro de filas del EEPN">
                <button
                    type="button"
                    className={`eqm-filter-btn${onlyMovements ? ' active' : ''}`}
                    aria-pressed={onlyMovements}
                    onClick={() => setOnlyMovements(true)}
                >
                    Mostrar solo movimientos
                </button>
                <button
                    type="button"
                    className={`eqm-filter-btn${!onlyMovements ? ' active' : ''}`}
                    aria-pressed={!onlyMovements}
                    onClick={() => setOnlyMovements(false)}
                >
                    Mostrar estructura completa
                </button>
            </div>

            {/* ── Escritorio / tablet: matriz completa ── */}
            <div className="eqm-scroll" role="region" aria-label="EEPN matricial" tabIndex={0}>
                <table className="eqm-table">
                    <thead>
                        <tr>
                            <th className="eqm-corner" rowSpan={2} scope="col">Movimiento</th>
                            {matrix.columnGroups.map(g => (
                                <th key={g.id} className="eqm-group" colSpan={g.components.length} scope="colgroup">
                                    {g.label}
                                </th>
                            ))}
                            <th className="eqm-group eqm-total-head" rowSpan={2} scope="col" title="Suma de todos los componentes">
                                Total PN{' '}{matrix.columns.length > 0 ? '' : ''}
                            </th>
                            {hasComparative && (
                                <th className="eqm-group eqm-comp-head" rowSpan={2} scope="col" title="Total del ejercicio anterior (mismo motor)">
                                    Ej. anterior
                                </th>
                            )}
                        </tr>
                        <tr>
                            {matrix.columns.map(c => (
                                <th key={c.component} className="eqm-colhead" scope="col" title={COLUMN_HINT[c.component]}>
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {structuralRows.map(({ row, comp }) => (
                            <RowTr key={row.type} row={row} columns={matrix.columns} comparativeTotal={comp} onCellClick={onCellClick} />
                        ))}
                        {movementRows.length > 0 && (
                            <tr className="eqm-separator">
                                <th scope="row" colSpan={matrix.columns.length + 2 + (hasComparative ? 1 : 0)}>
                                    Variaciones del ejercicio
                                </th>
                            </tr>
                        )}
                        {movementRows.map(row => (
                            <RowTr key={row.type} row={row} columns={matrix.columns} comparativeTotal={hasComparative ? null : undefined} onCellClick={onCellClick} />
                        ))}
                        <RowTr row={matrix.totalVariationsRow} columns={matrix.columns} comparativeTotal={hasComparative ? null : undefined} onCellClick={onCellClick} />
                        <RowTr
                            row={matrix.closingRow}
                            columns={matrix.columns}
                            comparativeTotal={hasComparative ? matrix.comparative!.closingTotal : undefined}
                            onCellClick={onCellClick}
                        />
                    </tbody>
                </table>
            </div>

            {/* ── Móvil: un movimiento por vez ── */}
            <div className="eqm-mobile">
                <label className="eqm-mobile-label" htmlFor="eqm-mobile-select">Movimiento</label>
                <select
                    id="eqm-mobile-select"
                    className="eqm-mobile-select"
                    value={mobileRowIdx}
                    onChange={e => setMobileRowIdx(Number(e.target.value))}
                >
                    {allMobileRows.map((r, i) => <option key={r.type} value={i}>{r.label}</option>)}
                </select>
                {mobileRow && (
                    <div className="eqm-mobile-card">
                        <p className="eqm-mobile-hint">{ROW_HINT[mobileRow.type]}</p>
                        {matrix.columns.map(c => {
                            const v = mobileRow.cells[c.component]
                            if (v === undefined) return null
                            return (
                                <div key={c.component} className="eqm-mobile-row">
                                    <span>{c.label}</span>
                                    <span className={`eqm-mobile-amount${v < 0 ? ' is-neg' : ''}`}>{money(v)}</span>
                                </div>
                            )
                        })}
                        {Object.keys(mobileRow.cells).length === 0 && (
                            <p className="eqm-mobile-hint">Sin importes en este movimiento.</p>
                        )}
                        <div className="eqm-mobile-row eqm-mobile-total">
                            <span>Total del movimiento</span>
                            <span className={`eqm-mobile-amount${mobileRow.total < 0 ? ' is-neg' : ''}`}>{money(mobileRow.total)}</span>
                        </div>
                        {onCellClick && mobileRow.accountIds.length > 0 && (
                            <button type="button" className="eqm-mobile-lineage" onClick={() => onCellClick(mobileRow.label, mobileRow.accountIds)}>
                                Ver trazabilidad
                            </button>
                        )}
                    </div>
                )}
            </div>

            <style>{matrixStyles}</style>
        </div>
    )
}

const matrixStyles = `
.eqm-toolbar { display: inline-flex; gap: 3px; padding: 3px; background: rgba(241,245,249,0.9); border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 12px; }
.eqm-filter-btn { padding: 6px 14px; font-size: 0.8rem; font-weight: 600; color: #64748b; background: transparent; border: none; border-radius: 7px; cursor: pointer; }
.eqm-filter-btn.active { background: white; color: #7c3aed; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.eqm-filter-btn:focus-visible { outline: 2px solid #7c3aed; outline-offset: 1px; }

.eqm-scroll { overflow: auto; max-height: 72vh; border: 1px solid #e2e8f0; border-radius: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.eqm-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 0.82rem; }
.eqm-table th, .eqm-table td { padding: 8px 12px; white-space: nowrap; }

.eqm-corner {
    position: sticky; left: 0; top: 0; z-index: 5;
    background: #f8fafc; text-align: left; font-size: 0.68rem; text-transform: uppercase;
    letter-spacing: 0.05em; color: #64748b; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;
    min-width: 220px;
}
.eqm-group {
    position: sticky; top: 0; z-index: 3;
    background: rgba(139,92,246,0.08); color: #6d28d9; font-size: 0.68rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.05em; text-align: center;
    border-bottom: 1px solid #ede9fe; border-left: 1px solid #ede9fe;
}
.eqm-colhead {
    position: sticky; top: 33px; z-index: 3;
    background: #faf9ff; color: #475569; font-size: 0.72rem; font-weight: 600; text-align: right;
    border-bottom: 2px solid #e2e8f0; border-left: 1px solid #f1f5f9; max-width: 160px; white-space: normal; min-width: 120px;
}
.eqm-total-head { background: rgba(139,92,246,0.14); }
.eqm-comp-head { background: rgba(148,163,184,0.14); color: #475569; }

.eqm-rowlabel {
    position: sticky; left: 0; z-index: 2;
    background: white; text-align: left; font-weight: 500; color: #0f172a;
    border-right: 1px solid #e2e8f0; border-top: 1px solid #f1f5f9; min-width: 220px; white-space: normal;
}
.eqm-rowlabel.is-clickable { cursor: pointer; }
.eqm-rowlabel.is-clickable:hover { color: #7c3aed; }
.eqm-rowlabel.is-clickable:focus-visible { outline: 2px solid #7c3aed; outline-offset: -2px; }

.eqm-cell {
    text-align: right; font-variant-numeric: tabular-nums; color: #0f172a;
    border-top: 1px solid #f1f5f9; border-left: 1px solid #f8fafc;
}
.eqm-cell.is-neg { color: #dc2626; }
.eqm-cell.is-clickable { cursor: pointer; }
.eqm-cell.is-clickable:hover { background: rgba(139,92,246,0.06); }
.eqm-total { font-weight: 700; background: rgba(139,92,246,0.05); border-left: 1px solid #ede9fe; }
.eqm-comp { color: #64748b; background: rgba(148,163,184,0.06); }

.eqm-subtotal .eqm-rowlabel, .eqm-subtotal .eqm-cell { font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }
.eqm-subtotal .eqm-total { background: rgba(139,92,246,0.12); }

.eqm-separator th {
    text-align: left; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    color: #7c3aed; background: rgba(139,92,246,0.05); border-top: 2px solid #ede9fe; padding: 6px 12px;
    position: sticky; left: 0;
}

.eqm-mobile { display: none; }
@media (max-width: 767px) {
    .eqm-scroll { display: none; }
    .eqm-mobile { display: block; }
}
.eqm-mobile-label { display: block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 4px; }
.eqm-mobile-select { width: 100%; padding: 10px 12px; font-size: 0.9rem; border: 1px solid #e2e8f0; border-radius: 10px; background: white; margin-bottom: 10px; }
.eqm-mobile-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.eqm-mobile-hint { font-size: 0.76rem; color: #64748b; margin: 0 0 10px; line-height: 1.45; }
.eqm-mobile-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-top: 1px solid #f1f5f9; font-size: 0.86rem; }
.eqm-mobile-amount { font-variant-numeric: tabular-nums; font-weight: 600; }
.eqm-mobile-amount.is-neg { color: #dc2626; }
.eqm-mobile-total { border-top: 2px solid #e2e8f0; font-weight: 700; }
.eqm-mobile-lineage { margin-top: 12px; width: 100%; padding: 9px; border: 1px solid #ddd6fe; background: rgba(139,92,246,0.06); color: #6d28d9; font-weight: 600; border-radius: 9px; cursor: pointer; font-size: 0.84rem; }
`
