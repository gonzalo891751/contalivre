/**
 * EFE canónico — Fase 2C: consume el ReportingBundle (no carga por su cuenta).
 * Permite alternar entre moneda NOMINAL y moneda de CIERRE (§9.4). El EFE en
 * moneda de cierre solo está disponible si el bundle trae índices cargados.
 */

import { useState } from 'react'
import ValidationBanner from './ValidationBanner'
import LineageModal from './LineageModal'
import type { CashFlowStatement2B, ReportLine } from '../../../reporting/domain/types'
import type { ReportingBundle } from '../../../reporting/loadReportingBundle'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Line({ line, onClick, indent = 0 }: { line: ReportLine; onClick?: (l: ReportLine) => void; indent?: number }) {
    const clickable = !!onClick && line.accountIds.length > 0
    return (
        <>
            <tr
                style={{ fontWeight: line.level === 0 ? 700 : line.level === 1 ? 600 : 400, cursor: clickable ? 'pointer' : 'default' }}
                onClick={clickable ? () => onClick!(line) : undefined}
                title={clickable ? 'Ver trazabilidad' : undefined}
            >
                <td style={{ padding: '4px 8px', paddingLeft: 8 + indent * 18 }}>
                    {line.label}{clickable && <span style={{ marginLeft: 6, color: '#94a3b8', fontSize: '0.7rem' }}>↳</span>}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(line.amount)}</td>
            </tr>
            {(line.children ?? []).map(c => <Line key={c.id} line={c} onClick={onClick} indent={indent + 1} />)}
        </>
    )
}

function MethodTable({ cf, title, onClick }: { cf: CashFlowStatement2B; title: string; onClick?: (l: ReportLine) => void }) {
    return (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 10 }}>{title}</h3>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <tbody>
                    <Line line={cf.openingCash} onClick={onClick} />
                    <Line line={cf.operating} onClick={onClick} />
                    <Line line={cf.investing} onClick={onClick} />
                    <Line line={cf.financing} onClick={onClick} />
                    {cf.unclassified.amount !== 0 && <Line line={cf.unclassified} onClick={onClick} />}
                    <Line line={cf.netChange} onClick={onClick} />
                    <Line line={cf.closingCash} onClick={onClick} />
                </tbody>
            </table>
        </div>
    )
}

export default function FlujoEfectivoCanonicalTab({ bundle }: { bundle: ReportingBundle }) {
    const [currency, setCurrency] = useState<'NOMINAL' | 'CLOSING'>('NOMINAL')
    const [target, setTarget] = useState<ReportLine | null>(null)

    const nominalDirect = bundle.statements.cashFlowDirect
    const nominalIndirect = bundle.statements.cashFlowIndirect
    const restated = bundle.cashFlowRestated

    if (!nominalDirect || !nominalIndirect) {
        return <div className="card" style={{ padding: 16 }}>El EFE no está disponible para este contexto.</div>
    }

    const showClosing = currency === 'CLOSING'
    const direct = showClosing && restated ? restated.direct : nominalDirect
    const indirect = showClosing && restated ? restated.indirect : nominalIndirect

    return (
        <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Expresión:</span>
                <button
                    className={`btn btn-sm ${currency === 'NOMINAL' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCurrency('NOMINAL')}
                >
                    Moneda nominal
                </button>
                <button
                    className={`btn btn-sm ${currency === 'CLOSING' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCurrency('CLOSING')}
                    disabled={!restated}
                    title={!restated ? 'Cargá un set de índices en el módulo de inflación para ver el EFE en moneda de cierre' : undefined}
                >
                    Moneda de cierre
                </button>
                {showClosing && (
                    <span style={{ fontSize: '0.78rem', color: '#a16207' }}>
                        Reexpresado por el coeficiente de cada período; el REI concilia con el efectivo del ESP.
                    </span>
                )}
            </div>

            {showClosing && restated && restated.blockers.length > 0 && (
                <div role="alert" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)', color: '#b91c1c', fontSize: '0.85rem' }}>
                    ⚠ EFE en moneda de cierre no publicable: {restated.blockers.join(' · ')}
                </div>
            )}

            {!showClosing && <ValidationBanner report={bundle.statements.validation} status={bundle.metadata.status} />}

            <MethodTable cf={direct} title={`Método directo${showClosing ? ' — moneda de cierre' : ''}`} onClick={setTarget} />
            <MethodTable cf={indirect} title={`Método indirecto${showClosing ? ' — moneda de cierre' : ''}`} onClick={setTarget} />

            {direct.nonMonetaryDisclosures.length > 0 && (
                <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>
                        {showClosing ? 'Conciliación de moneda de cierre' : 'Transacciones sin efecto en el efectivo (se revelan, no integran flujos)'}
                    </h3>
                    <ul style={{ fontSize: '0.85rem', paddingLeft: 18, lineHeight: 1.8 }}>
                        {direct.nonMonetaryDisclosures.map(d => (
                            <li key={d.id}>{d.label} — ${fmt(d.amount)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {target && (
                <LineageModal
                    bundle={bundle.statements}
                    lineId={target.id}
                    label={target.label}
                    accountIds={target.accountIds}
                    onClose={() => setTarget(null)}
                />
            )}
        </div>
    )
}
