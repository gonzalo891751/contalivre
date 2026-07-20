/**
 * ForeignCurrencyView — Fase 2E (§12): cuadro de moneda extranjera.
 *
 * Tabla de cuentas con metadata estructural de moneda distinta de ARS:
 * tipo de partida, clasificación monetaria, medición contable y comparativo.
 * Cantidad y cotización se declaran "Información insuficiente" cuando no hay
 * datos estructurados: no se estima con una fuente automática sin aclaración.
 */

import type { ForeignCurrencyDisclosure } from '../../../reporting/domain/types'

const nf = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SIDE_LABEL: Record<string, string> = { ASSET: 'Activo', LIABILITY: 'Pasivo', OTHER: 'Otro' }

export interface ForeignCurrencyViewProps {
    disclosure: ForeignCurrencyDisclosure
    showComparative: boolean
    onRowClick?: (label: string, accountIds: string[]) => void
}

export function ForeignCurrencyView({ disclosure, showComparative, onRowClick }: ForeignCurrencyViewProps) {
    if (!disclosure.applicable) {
        return (
            <div className="fx-empty">
                {disclosure.note}
                <style>{styles}</style>
            </div>
        )
    }

    return (
        <div>
            <p className="fx-intro">{disclosure.note}</p>
            <div className="fx-scroll" role="region" aria-label="Moneda extranjera" tabIndex={0}>
                <table className="fx-table">
                    <thead>
                        <tr>
                            <th scope="col" className="left">Cuenta</th>
                            <th scope="col">Moneda</th>
                            <th scope="col">Tipo</th>
                            <th scope="col">Clasificación</th>
                            <th scope="col" className="num">Cantidad</th>
                            <th scope="col" className="num">Cotización</th>
                            <th scope="col" className="num">Medición actual</th>
                            {showComparative && <th scope="col" className="num">Comparativo</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {disclosure.rows.map(r => (
                            <tr
                                key={r.accountId}
                                className={onRowClick ? 'is-clickable' : undefined}
                                onClick={onRowClick ? () => onRowClick(`${r.code} ${r.name}`, [r.accountId]) : undefined}
                                tabIndex={onRowClick ? 0 : undefined}
                                onKeyDown={onRowClick ? e => { if (e.key === 'Enter') onRowClick(`${r.code} ${r.name}`, [r.accountId]) } : undefined}
                                title={onRowClick ? 'Ver trazabilidad hasta los asientos' : undefined}
                            >
                                <td className="left">{r.code} {r.name}</td>
                                <td>{r.currency}</td>
                                <td>{SIDE_LABEL[r.side]}</td>
                                <td>{r.monetary === 'MONETARY' ? 'Monetaria' : r.monetary === 'NON_MONETARY' ? 'No monetaria' : r.monetary}</td>
                                <td className="num na" title="Sin datos estructurados de cantidad por moneda">Insuf.</td>
                                <td className="num na" title="Sin cotización con fuente y fecha identificadas">Insuf.</td>
                                <td className="num">{nf.format(r.measurement)}</td>
                                {showComparative && <td className="num comp">{r.comparativeMeasurement == null ? '–' : nf.format(r.comparativeMeasurement)}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <style>{styles}</style>
        </div>
    )
}

const styles = `
.fx-intro { font-size: 0.8rem; color: #854d0e; background: rgba(234,179,8,0.07); border: 1px solid rgba(234,179,8,0.3); border-radius: 8px; padding: 10px 14px; margin: 0 0 12px; line-height: 1.5; }
.fx-empty { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #64748b; font-size: 0.88rem; }
.fx-scroll { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.fx-table { border-collapse: collapse; width: 100%; font-size: 0.82rem; min-width: 760px; }
.fx-table th { font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; background: #f8fafc; padding: 8px 12px; text-align: center; border-bottom: 2px solid #e2e8f0; }
.fx-table th.left, .fx-table td.left { text-align: left; }
.fx-table th.num, .fx-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.fx-table td { padding: 7px 12px; border-top: 1px solid #f1f5f9; color: #334155; text-align: center; }
.fx-table td.na { color: #a16207; font-size: 0.74rem; font-weight: 600; }
.fx-table td.comp { color: #64748b; }
.fx-table tr.is-clickable { cursor: pointer; }
.fx-table tr.is-clickable:hover td { background: #f8fafc; }
`
