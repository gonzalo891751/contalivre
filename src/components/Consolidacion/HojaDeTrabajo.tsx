/**
 * Papel de trabajo de consolidación (Fase 2K §8, §15, §17, §18).
 *
 * Grilla profesional: encabezados fijos, agrupamiento por sección, columnas de
 * ajuste que se pueden colapsar, búsqueda, y detalle expandible por línea con
 * las entidades que la forman y las eliminaciones que la tocaron.
 *
 * No depende SÓLO del color para comunicar: cada eliminación lleva su rótulo,
 * los negativos van entre paréntesis además de en otro tono, y las filas
 * expandibles son botones accesibles con teclado.
 */

import { Fragment, useMemo, useState } from 'react'
import { CaretDown, CaretRight, MagnifyingGlass } from '@phosphor-icons/react'
import { COLUMN_HELP, ELIMINATION_HELP } from './pedagogia'
import type {
    ConsolidationWorksheet,
    EliminationEntry,
    WorksheetRow,
} from '../../consolidation/domain/types'

const SECTION_LABEL: Record<string, string> = {
    ASSET_CURRENT: 'Activo corriente',
    ASSET_NON_CURRENT: 'Activo no corriente',
    LIABILITY_CURRENT: 'Pasivo corriente',
    LIABILITY_NON_CURRENT: 'Pasivo no corriente',
    EQUITY: 'Patrimonio neto',
    RESULT: 'Resultados',
}

const SECTION_ORDER = [
    'ASSET_CURRENT', 'ASSET_NON_CURRENT',
    'LIABILITY_CURRENT', 'LIABILITY_NON_CURRENT',
    'EQUITY', 'RESULT',
]

const ADJUSTMENT_COLUMNS = [
    { key: 'homogenization', label: 'Homogeneiz.' },
    { key: 'investmentElimination', label: 'Inv. / PN' },
    { key: 'reciprocalElimination', label: 'Recíprocos' },
    { key: 'operationElimination', label: 'Op. internas' },
    { key: 'unrealizedElimination', label: 'Result. no trasc.' },
    { key: 'deferredTax', label: 'Imp. diferido' },
    { key: 'manualAdjustment', label: 'Ajustes man.' },
] as const

/** Importe con signo de exposición; los negativos van entre paréntesis */
function money(value: number): string {
    if (value === 0) return '—'
    const abs = Math.abs(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return value < 0 ? `(${abs})` : abs
}

function Amount({ value, muted }: { value: number; muted?: boolean }) {
    const cls = ['cons-amount']
    if (value === 0) cls.push('cons-amount-zero')
    else if (value < 0) cls.push('cons-amount-negative')
    if (muted) cls.push('cons-amount-muted')
    return (
        <td className={cls.join(' ')}>
            {value < 0 && <span className="sr-only">negativo </span>}
            {money(value)}
        </td>
    )
}

interface Props {
    worksheet: ConsolidationWorksheet
}

export default function HojaDeTrabajo({ worksheet }: Props) {
    const [search, setSearch] = useState('')
    const [expandedRow, setExpandedRow] = useState<string | null>(null)
    const [showAdjustments, setShowAdjustments] = useState(true)
    const [entityFilter, setEntityFilter] = useState<string>('ALL')

    const eliminationsById = useMemo(
        () => new Map(worksheet.eliminations.map(e => [e.id, e])),
        [worksheet.eliminations]
    )

    const entities = worksheet.entities
    const visibleEntities = entityFilter === 'ALL'
        ? entities
        : entities.filter(e => e.companyId === entityFilter)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return worksheet.rows
        return worksheet.rows.filter(r => r.label.toLowerCase().includes(q))
    }, [worksheet.rows, search])

    const bySection = useMemo(() => {
        const map = new Map<string, WorksheetRow[]>()
        for (const row of filtered) {
            const list = map.get(row.section) ?? []
            list.push(row)
            map.set(row.section, list)
        }
        return map
    }, [filtered])

    const columnCount = 1 + visibleEntities.length + 1 + (showAdjustments ? ADJUSTMENT_COLUMNS.length : 1) + 1

    return (
        <div className="cons-worksheet">
            <div className="cons-worksheet-toolbar">
                <div className="cons-search">
                    <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar un rubro…"
                        aria-label="Buscar un rubro de la hoja de consolidación"
                    />
                </div>
                <label className="cons-field">
                    <span>Entidad</span>
                    <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
                        <option value="ALL">Todas ({entities.length})</option>
                        {entities.map(e => (
                            <option key={e.companyId} value={e.companyId}>{e.name}</option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowAdjustments(v => !v)}
                    aria-pressed={showAdjustments}
                >
                    {showAdjustments ? 'Resumir ajustes' : 'Ver ajustes en detalle'}
                </button>
            </div>

            <div className="cons-table-container">
                <table className="cons-table">
                    <caption className="sr-only">
                        Papel de trabajo de consolidación: importe de cada entidad, suma previa,
                        ajustes y eliminaciones, e importe consolidado por rubro
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col" className="cons-col-label">Rubro</th>
                            {visibleEntities.map(e => (
                                <th scope="col" key={e.companyId} className="cons-col-entity">
                                    {e.name}
                                    <span className="cons-col-sub">
                                        {e.role === 'PARENT' ? 'Controladora' : `${(e.ownership * 100).toFixed(2)} %`}
                                    </span>
                                </th>
                            ))}
                            <th scope="col" className="cons-col-subtotal" title={COLUMN_HELP.subtotal}>
                                Suma previa
                            </th>
                            {showAdjustments ? ADJUSTMENT_COLUMNS.map(c => (
                                <th scope="col" key={c.key} className="cons-col-adjust" title={COLUMN_HELP[c.key]}>
                                    {c.label}
                                </th>
                            )) : (
                                <th scope="col" className="cons-col-adjust">Ajustes y eliminaciones</th>
                            )}
                            <th scope="col" className="cons-col-total" title={COLUMN_HELP.consolidated}>
                                Consolidado
                            </th>
                        </tr>
                    </thead>
                    {SECTION_ORDER.filter(s => bySection.has(s)).map(section => {
                        const rows = bySection.get(section)!
                        const sign = (r: WorksheetRow) => r.naturalSign
                        const total = rows.reduce((s, r) => s + r.consolidated * sign(r), 0)
                        return (
                            <tbody key={section}>
                                <tr className="cons-section-row">
                                    <th scope="colgroup" colSpan={columnCount}>{SECTION_LABEL[section]}</th>
                                </tr>
                                {rows.map(row => {
                                    const isOpen = expandedRow === row.lineId
                                    const adjustmentsTotal =
                                        row.homogenization + row.investmentElimination + row.nonControllingInterest +
                                        row.reciprocalElimination + row.operationElimination +
                                        row.unrealizedElimination + row.deferredTax + row.manualAdjustment
                                    return (
                                        <Fragment key={row.lineId}>
                                            <tr className={isOpen ? 'cons-row-open' : undefined}>
                                                <th scope="row" className="cons-col-label">
                                                    <button
                                                        type="button"
                                                        className="cons-expand"
                                                        onClick={() => setExpandedRow(isOpen ? null : row.lineId)}
                                                        aria-expanded={isOpen}
                                                        aria-controls={`detalle-${row.lineId}`}
                                                    >
                                                        {isOpen
                                                            ? <CaretDown size={14} weight="bold" aria-hidden="true" />
                                                            : <CaretRight size={14} weight="bold" aria-hidden="true" />}
                                                        <span>{row.label}</span>
                                                    </button>
                                                </th>
                                                {visibleEntities.map(e => {
                                                    const entry = row.byEntity.find(b => b.companyId === e.companyId)
                                                    return (
                                                        <Amount
                                                            key={e.companyId}
                                                            value={(entry?.amount ?? 0) * row.naturalSign}
                                                            muted
                                                        />
                                                    )
                                                })}
                                                <Amount value={row.subtotal * row.naturalSign} />
                                                {showAdjustments ? ADJUSTMENT_COLUMNS.map(c => (
                                                    <Amount
                                                        key={c.key}
                                                        value={(row[c.key] as number) * row.naturalSign}
                                                        muted
                                                    />
                                                )) : (
                                                    <Amount value={adjustmentsTotal * row.naturalSign} muted />
                                                )}
                                                <Amount value={row.consolidated * row.naturalSign} />
                                            </tr>
                                            {isOpen && (
                                                <tr id={`detalle-${row.lineId}`} className="cons-detail-row">
                                                    <td colSpan={columnCount}>
                                                        <LineDetail
                                                            row={row}
                                                            worksheet={worksheet}
                                                            eliminationsById={eliminationsById}
                                                        />
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    )
                                })}
                                <tr className="cons-total-row">
                                    <th scope="row" className="cons-col-label">Total {SECTION_LABEL[section].toLowerCase()}</th>
                                    {visibleEntities.map(e => {
                                        const t = rows.reduce((s, r) => {
                                            const entry = r.byEntity.find(b => b.companyId === e.companyId)
                                            return s + (entry?.amount ?? 0) * r.naturalSign
                                        }, 0)
                                        return <Amount key={e.companyId} value={t} />
                                    })}
                                    <Amount value={rows.reduce((s, r) => s + r.subtotal * r.naturalSign, 0)} />
                                    {showAdjustments ? ADJUSTMENT_COLUMNS.map(c => (
                                        <Amount
                                            key={c.key}
                                            value={rows.reduce((s, r) => s + (r[c.key] as number) * r.naturalSign, 0)}
                                        />
                                    )) : <Amount value={0} />}
                                    <Amount value={total} />
                                </tr>
                            </tbody>
                        )
                    })}
                </table>
            </div>
        </div>
    )
}

function LineDetail({
    row, worksheet, eliminationsById,
}: {
    row: WorksheetRow
    worksheet: ConsolidationWorksheet
    eliminationsById: Map<string, EliminationEntry>
}) {
    const eliminations = row.eliminationIds
        .map(id => eliminationsById.get(id))
        .filter((e): e is EliminationEntry => !!e)

    return (
        <div className="cons-detail">
            <div className="cons-detail-block">
                <h4>Entidades que forman este saldo</h4>
                {row.byEntity.length === 0 ? (
                    <p className="cons-muted">Ninguna entidad aporta un saldo a este rubro; el importe surge sólo de ajustes.</p>
                ) : (
                    <ul className="cons-detail-list">
                        {row.byEntity.map(e => (
                            <li key={e.companyId}>
                                <strong>{worksheet.entities.find(x => x.companyId === e.companyId)?.name ?? e.companyId}</strong>
                                <span className="cons-amount-inline">{money(e.amount * row.naturalSign)}</span>
                                <span className="cons-muted"> · {e.accountIds.length} cuenta(s) de origen</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="cons-detail-block">
                <h4>Ajustes y eliminaciones aplicados</h4>
                {eliminations.length === 0 ? (
                    <p className="cons-muted">Este rubro se consolida por simple suma: no requirió ninguna eliminación.</p>
                ) : (
                    <ul className="cons-elim-list">
                        {eliminations.map(elim => {
                            const lines = elim.lines.filter(l => l.consolidatedLineId === row.lineId)
                            return (
                                <li key={elim.id}>
                                    <div className="cons-elim-head">
                                        <span className={`cons-tag cons-tag-${elim.origin.toLowerCase()}`}>
                                            {elim.origin === 'AUTOMATIC' ? 'Automática'
                                                : elim.origin === 'SUGGESTED' ? 'Sugerida' : 'Manual'}
                                        </span>
                                        <strong>{elim.label}</strong>
                                        {lines.map((l, i) => (
                                            <span key={i} className="cons-amount-inline">
                                                {l.debit > 0 ? `Debe ${money(l.debit)}` : `Haber ${money(l.credit)}`}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="cons-elim-kind">{ELIMINATION_HELP[elim.kind] ?? elim.kind}</p>
                                    <p className="cons-elim-rationale">{elim.rationale}</p>
                                    <details>
                                        <summary>Ver el cálculo paso a paso</summary>
                                        <ol className="cons-computation">
                                            {elim.computation.map((step, i) => <li key={i}>{step}</li>)}
                                        </ol>
                                        {elim.normativeReference && (
                                            <p className="cons-normative">Referencia: {elim.normativeReference}</p>
                                        )}
                                        <p className="cons-muted">
                                            Entidades relacionadas: {elim.relatedCompanyIds
                                                .map(id => worksheet.entities.find(e => e.companyId === id)?.name ?? id)
                                                .join(', ')}
                                        </p>
                                    </details>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
