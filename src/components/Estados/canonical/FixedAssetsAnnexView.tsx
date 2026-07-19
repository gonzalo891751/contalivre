/**
 * FixedAssetsAnnexView — Fase 2E (§11): anexo de bienes de uso por clase.
 *
 * Cuadro con valores de origen (inicial, altas, bajas, final), depreciaciones
 * acumuladas (inicial, del ejercicio, bajas, final) y valor residual, con
 * totales, comparativo y conciliación con el ESP. Presentador PURO del bundle.
 */

import type { FixedAssetsAnnex, FixedAssetsAnnexRow } from '../../../reporting/domain/types'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money = (v: number | null | undefined) => (v == null ? '–' : v === 0 ? '–' : nf.format(v))

const COLUMNS: { key: keyof FixedAssetsAnnexRow; label: string; group: 'VO' | 'DEP' | 'RES' }[] = [
    { key: 'grossOpening', label: 'VO al inicio', group: 'VO' },
    { key: 'additions', label: 'Altas', group: 'VO' },
    { key: 'disposals', label: 'Bajas', group: 'VO' },
    { key: 'grossClosing', label: 'VO al cierre', group: 'VO' },
    { key: 'accumDepOpening', label: 'Acum. al inicio', group: 'DEP' },
    { key: 'periodDepreciation', label: 'Del ejercicio', group: 'DEP' },
    { key: 'depDisposals', label: 'Bajas', group: 'DEP' },
    { key: 'accumDepClosing', label: 'Acum. al cierre', group: 'DEP' },
    { key: 'residual', label: 'Valor residual', group: 'RES' },
]

export interface FixedAssetsAnnexViewProps {
    annex: FixedAssetsAnnex
    showComparative: boolean
    onRowClick?: (label: string, accountIds: string[]) => void
}

export function FixedAssetsAnnexView({ annex, showComparative, onRowClick }: FixedAssetsAnnexViewProps) {
    if (annex.rows.length === 0) {
        return (
            <div className="ppe-empty">
                Sin bienes de uso con saldos o movimientos en el ejercicio.
                <style>{styles}</style>
            </div>
        )
    }
    const check = annex.validations.find(v => v.id === 'ppe-anexo-esp')

    const renderRow = (r: FixedAssetsAnnexRow, isTotal = false) => (
        <tr
            key={r.assetClass}
            className={`${isTotal ? 'ppe-total-row' : ''}${!isTotal && onRowClick ? ' is-clickable' : ''}`}
            onClick={!isTotal && onRowClick ? () => onRowClick(`Bienes de uso — ${r.assetClass}`, r.accountIds) : undefined}
            tabIndex={!isTotal && onRowClick ? 0 : undefined}
            onKeyDown={!isTotal && onRowClick ? e => { if (e.key === 'Enter') onRowClick(`Bienes de uso — ${r.assetClass}`, r.accountIds) } : undefined}
            title={!isTotal && onRowClick ? 'Ver trazabilidad hasta los asientos' : undefined}
        >
            <th scope="row" className="ppe-rowlabel">{r.assetClass}</th>
            {COLUMNS.map(c => {
                const v = r[c.key] as number
                return <td key={c.key} className={`num${c.key === 'residual' ? ' strong' : ''}`}>{money(v)}</td>
            })}
            {showComparative && <td className="num comp">{money(r.comparativeResidual)}</td>}
        </tr>
    )

    return (
        <div>
            <p className="ppe-intro">
                Evolución de los bienes de uso por clase: valores de origen, depreciaciones acumuladas y valor
                residual, derivados del Diario. Las clases surgen del mapping estructural (anexo/clase de la cuenta).
            </p>

            {annex.hasUnclassified && (
                <div role="alert" className="ppe-warning">
                    ⚠ Hay cuentas de bienes de uso sin clase asignada. Asignales una clase (annexGroup) en
                    Configuración → Plan de cuentas y mapeos para una exposición completa.
                </div>
            )}

            {check && (
                <div className={`ppe-status${check.passed ? ' ok' : ' bad'}`} role="status">
                    {check.passed
                        ? '✓ El valor residual del anexo coincide con los Bienes de uso netos del ESP.'
                        : `✗ ${check.label}: diferencia ${nf.format(check.difference ?? 0)}.`}
                </div>
            )}

            <div className="ppe-scroll" role="region" aria-label="Anexo de bienes de uso" tabIndex={0}>
                <table className="ppe-table">
                    <thead>
                        <tr>
                            <th className="ppe-corner" rowSpan={2} scope="col">Clase</th>
                            <th className="ppe-group" colSpan={4} scope="colgroup">Valores de origen</th>
                            <th className="ppe-group" colSpan={4} scope="colgroup">Depreciaciones acumuladas</th>
                            <th className="ppe-group res" rowSpan={2} scope="col">Valor residual</th>
                            {showComparative && <th className="ppe-group comp" rowSpan={2} scope="col">Residual ej. anterior</th>}
                        </tr>
                        <tr>
                            {COLUMNS.filter(c => c.group !== 'RES').map(c => (
                                <th key={c.key} className="ppe-colhead" scope="col">{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {annex.rows.map(r => renderRow(r))}
                        {renderRow(annex.totals, true)}
                    </tbody>
                </table>
            </div>
            <style>{styles}</style>
        </div>
    )
}

const styles = `
.ppe-intro { font-size: 0.82rem; color: #64748b; margin: 0 0 12px; line-height: 1.5; max-width: 720px; }
.ppe-empty { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #64748b; font-size: 0.88rem; }
.ppe-warning { margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; font-size: 0.8rem; background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.35); color: #854d0e; }
.ppe-status { padding: 9px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; margin-bottom: 12px; }
.ppe-status.ok { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.3); color: #047857; }
.ppe-status.bad { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.35); color: #b91c1c; }

.ppe-scroll { overflow: auto; max-height: 65vh; border: 1px solid #e2e8f0; border-radius: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.ppe-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 0.8rem; }
.ppe-table th, .ppe-table td { padding: 7px 11px; white-space: nowrap; }
.ppe-corner { position: sticky; left: 0; top: 0; z-index: 4; background: #f8fafc; text-align: left; font-size: 0.66rem; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; min-width: 170px; }
.ppe-group { position: sticky; top: 0; z-index: 3; background: rgba(16,185,129,0.07); color: #047857; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; text-align: center; border-bottom: 1px solid #d1fae5; border-left: 1px solid #d1fae5; }
.ppe-group.res { background: rgba(16,185,129,0.14); }
.ppe-group.comp { background: rgba(148,163,184,0.14); color: #475569; }
.ppe-colhead { position: sticky; top: 30px; z-index: 3; background: #f6fefb; color: #475569; font-size: 0.68rem; font-weight: 600; text-align: right; border-bottom: 2px solid #e2e8f0; border-left: 1px solid #f1f5f9; }
.ppe-rowlabel { position: sticky; left: 0; z-index: 2; background: white; text-align: left; font-weight: 500; color: #0f172a; border-right: 1px solid #e2e8f0; border-top: 1px solid #f1f5f9; white-space: normal; min-width: 170px; }
.ppe-table td { text-align: right; font-variant-numeric: tabular-nums; border-top: 1px solid #f8fafc; color: #334155; }
.ppe-table td.strong { font-weight: 700; color: #0f172a; background: rgba(16,185,129,0.04); }
.ppe-table td.comp { color: #64748b; background: rgba(148,163,184,0.06); }
.ppe-table tr.is-clickable { cursor: pointer; }
.ppe-table tr.is-clickable:hover td, .ppe-table tr.is-clickable:hover th { background: #f8fafc; }
.ppe-total-row th, .ppe-total-row td { border-top: 2px solid #cbd5e1; background: #f8fafc; font-weight: 700; }
`
