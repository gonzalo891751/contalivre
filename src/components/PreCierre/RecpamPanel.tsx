/**
 * Determinación dual del RECPAM — Fase 2J §9.
 *
 * Muestra las dos determinaciones, su diferencia contra la tolerancia y la
 * evolución de la posición monetaria mes a mes. El punto de la pantalla es que
 * se vea CÓMO se llegó al número: el RECPAM no es la cifra que hace cuadrar el
 * estado, es el resultado de haber mantenido partidas monetarias.
 */

import { useState } from 'react'
import type { RecpamReconciliation } from '../../reporting/inflation/recpam'

const money = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

export function RecpamPanel({ recpam }: { recpam: RecpamReconciliation }) {
    const [verEvolucion, setVerEvolucion] = useState(false)
    const [verComponentes, setVerComponentes] = useState(false)

    return (
        <div data-testid="recpam-panel">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Stat label="Secuencial · por diferencia patrimonial" value={money(recpam.sequential.amount)} testId="recpam-secuencial" />
                <Stat label="Analítico · por exposición monetaria" value={money(recpam.analytic.amount)} testId="recpam-analitico" />
                <Stat label="Diferencia" value={money(recpam.difference)} testId="recpam-diferencia"
                    accent={recpam.reconciled ? '#15803d' : '#b91c1c'} />
                <Stat label="Tolerancia admitida" value={money(recpam.toleranceCents / 100)} />
            </div>

            {recpam.blockers.length > 0 ? (
                <ul role="alert" style={{ margin: '0 0 12px 18px', fontSize: '0.82rem', color: '#b91c1c' }}>
                    {recpam.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
            ) : (
                <p style={{ fontSize: '0.83rem', color: '#15803d', margin: '0 0 12px' }}>
                    Las dos determinaciones coinciden dentro de la tolerancia. El RECPAM no es una cifra de
                    cuadre: se obtuvo por dos caminos independientes y dieron lo mismo.
                </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setVerEvolucion(v => !v)}>
                    {verEvolucion ? 'Ocultar' : 'Ver'} la evolución de la posición monetaria
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setVerComponentes(v => !v)}>
                    {verComponentes ? 'Ocultar' : 'Ver'} cómo se llegó a cada determinación
                </button>
            </div>

            {verComponentes && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 12 }}>
                    <Determinacion titulo="Secuencial" descripcion="Resultado por diferencia patrimonial reexpresada, menos el resultado de las cuentas de resultado."
                        componentes={recpam.sequential.components} />
                    <Determinacion titulo="Analítico" descripcion="Exposición de la posición monetaria: cada flujo por el coeficiente de su mes."
                        componentes={recpam.analytic.components} />
                </div>
            )}

            {verEvolucion && (
                <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
                    <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse', minWidth: 680 }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                                <th style={th}>Período</th>
                                <th style={{ ...th, textAlign: 'right' }}>Posición al inicio</th>
                                <th style={{ ...th, textAlign: 'right' }}>Flujo del mes</th>
                                <th style={{ ...th, textAlign: 'right' }}>Posición al cierre</th>
                                <th style={{ ...th, textAlign: 'right' }}>Coeficiente</th>
                                <th style={{ ...th, textAlign: 'right' }}>Efecto en el RECPAM</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recpam.monetaryEvolution.map(e => (
                                <tr key={e.period} style={{ borderTop: '1px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                                    <td style={td}>{e.period}</td>
                                    <td style={num}>{money(e.openingPosition)}</td>
                                    <td style={num}>{money(e.netFlow)}</td>
                                    <td style={num}>{money(e.closingPosition)}</td>
                                    <td style={{ ...num, color: '#64748b' }}>{e.coefficient?.toFixed(6) ?? '—'}</td>
                                    <td style={{ ...num, color: e.recpamContribution < 0 ? '#b91c1c' : '#15803d' }}>
                                        {money(e.recpamContribution)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
                    Cuentas monetarias que integran la posición ({recpam.monetaryAccounts.length})
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {recpam.monetaryAccounts.map(a => (
                        <span key={a.code} style={{ fontSize: '0.72rem', padding: '3px 9px', borderRadius: 999, border: '1px solid #e2e8f0', color: '#475569' }}>
                            {a.code} {a.name} · {money(a.balance)}
                        </span>
                    ))}
                </div>
            </details>
        </div>
    )
}

function Determinacion({ titulo, descripcion, componentes }: {
    titulo: string
    descripcion: string
    componentes: Array<{ label: string; amount: number; detail?: string }>
}) {
    return (
        <div className="card" style={{ padding: 12 }}>
            <h4 style={{ fontSize: '0.86rem', fontWeight: 800, margin: '0 0 2px' }}>{titulo}</h4>
            <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '0 0 8px' }}>{descripcion}</p>
            <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                <tbody>
                    {componentes.map((c, i) => (
                        <tr key={i} style={{ borderTop: i === 0 ? undefined : '1px solid #f1f5f9' }}>
                            <td style={{ padding: '4px 0' }}>
                                {c.label}
                                {c.detail && <div style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{c.detail}</div>}
                            </td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                {money(c.amount)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function Stat({ label, value, accent, testId }: { label: string; value: string; accent?: string; testId?: string }) {
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: accent ?? '#0f172a' }} data-testid={testId}>{value}</div>
        </div>
    )
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 10px' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
