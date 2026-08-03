/**
 * Tabla de cobertura de cuentas — Fase 2J §5.
 *
 * Muestra qué le corresponde a cada cuenta con saldo o movimiento. La lectura
 * que tiene que quedar clara: una partida monetaria aparece como **controlada**
 * y ya expresada en moneda de cierre, no como omitida.
 */

import { useMemo, useState } from 'react'
import type { AccountTreatmentMatrix, AccountTreatmentRow } from '../../reporting/inflation/accountTreatment'

const money = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const TREATMENT_LABEL: Record<AccountTreatmentRow['treatment'], string> = {
    MONETARIA_SIN_REEXPRESION: 'Controlada — ya expresada en moneda de cierre',
    REEXPRESION_POR_ANTICUACION: 'Se reexpresa por anticuación',
    VALOR_CORRIENTE_AL_CIERRE: 'Medida a valor corriente del cierre',
    CAPITAL_NOMINAL_LEGAL: 'Capital — se mide reexpresado, se expone nominal',
    SIGUE_A_LA_PARTIDA_PRINCIPAL: 'Sigue a su partida principal',
    REQUIERE_DECISION: 'Requiere una decisión de política contable',
}

const CONDITION_LABEL: Record<AccountTreatmentRow['monetaryCondition'], string> = {
    MONETARY: 'Monetaria',
    NON_MONETARY: 'No monetaria',
    MIXED: 'Rubro mixto',
    NOT_APPLICABLE: 'Sin declarar',
}

const CRITERION_LABEL: Record<string, string> = {
    COSTO_HISTORICO: 'Costo histórico',
    VALOR_CORRIENTE_CIERRE: 'Valor corriente al cierre',
    NOMINAL: 'Importe nominal',
}

const STATUS_STYLE: Record<AccountTreatmentRow['status'], { bg: string; color: string; label: string }> = {
    OK: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'Controlada' },
    ADVERTENCIA: { bg: 'rgba(234,179,8,0.14)', color: '#a16207', label: 'Con advertencia' },
    BLOQUEADO: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Bloquea' },
}

type Filtro = 'TODAS' | 'ATENCION' | 'MONETARIAS' | 'REEXPRESADAS' | 'CORRIENTES'

export function CoberturaCuentasTabla({ matrix }: { matrix: AccountTreatmentMatrix }) {
    const [filtro, setFiltro] = useState<Filtro>('TODAS')
    const [busqueda, setBusqueda] = useState('')

    const porRubro = useMemo(() => {
        const map = new Map<string, { total: number; resueltas: number }>()
        for (const r of matrix.rows) {
            const cur = map.get(r.rubro) ?? { total: 0, resueltas: 0 }
            cur.total += 1
            if (r.treatment !== 'REQUIERE_DECISION') cur.resueltas += 1
            map.set(r.rubro, cur)
        }
        return Array.from(map, ([rubro, v]) => ({ rubro, ...v })).sort((a, b) => (a.rubro < b.rubro ? -1 : 1))
    }, [matrix.rows])

    const filas = useMemo(() => {
        const texto = busqueda.trim().toLowerCase()
        return matrix.rows.filter(r => {
            if (texto && !`${r.code} ${r.name}`.toLowerCase().includes(texto)) return false
            switch (filtro) {
                case 'ATENCION': return r.status !== 'OK'
                case 'MONETARIAS': return r.monetaryCondition === 'MONETARY'
                case 'REEXPRESADAS': return r.treatment === 'REEXPRESION_POR_ANTICUACION'
                case 'CORRIENTES': return r.treatment === 'VALOR_CORRIENTE_AL_CIERRE'
                default: return true
            }
        })
    }, [matrix.rows, filtro, busqueda])

    return (
        <div data-testid="cobertura-tabla">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Stat label="Cuentas analizadas" value={String(matrix.coverage.accountsWithActivity)} />
                <Stat label="Cobertura por cantidad" value={`${matrix.coverage.coveragePct.toFixed(2)} %`}
                    accent={matrix.coverage.coveragePct === 100 ? '#15803d' : '#b91c1c'} testId="cobertura-pct" />
                <Stat label="Cobertura por saldo" value={`${matrix.coverage.balanceCoveragePct.toFixed(2)} %`}
                    accent={matrix.coverage.balanceCoveragePct === 100 ? '#15803d' : '#b91c1c'} />
                <Stat label="Rubros alcanzados" value={String(porRubro.length)} />
            </div>

            <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
                    Cobertura por rubro
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {porRubro.map(r => (
                        <span key={r.rubro} style={{
                            fontSize: '0.72rem', padding: '3px 9px', borderRadius: 999,
                            border: '1px solid #e2e8f0',
                            color: r.resueltas === r.total ? '#15803d' : '#b91c1c',
                            background: r.resueltas === r.total ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                        }}>
                            {r.rubro}: {r.resueltas}/{r.total}
                        </span>
                    ))}
                </div>
            </details>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                {([
                    ['TODAS', 'Todas'],
                    ['ATENCION', 'Necesitan atención'],
                    ['MONETARIAS', 'Monetarias'],
                    ['REEXPRESADAS', 'Se reexpresan'],
                    ['CORRIENTES', 'Valor corriente'],
                ] as Array<[Filtro, string]>).map(([value, label]) => (
                    <button
                        key={value}
                        className={`btn btn-sm ${filtro === value ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFiltro(value)}
                    >
                        {label}
                    </button>
                ))}
                <input
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Buscar por código o nombre…"
                    style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.8rem', minWidth: 220 }}
                />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{filas.length} cuenta(s)</span>
            </div>

            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', minWidth: 1180 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                            <th style={th}>Cuenta</th>
                            <th style={th}>Rubro</th>
                            <th style={th}>Condición</th>
                            <th style={th}>Criterio de medición</th>
                            <th style={th}>Tratamiento</th>
                            <th style={th}>Períodos de origen</th>
                            <th style={{ ...th, textAlign: 'right' }}>Histórico</th>
                            <th style={{ ...th, textAlign: 'right' }}>Reexpresado</th>
                            <th style={{ ...th, textAlign: 'right' }}>Ajuste</th>
                            <th style={{ ...th, textAlign: 'right' }}>Exposición</th>
                            <th style={th}>RECPAM</th>
                            <th style={th}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(r => {
                            const chip = STATUS_STYLE[r.status]
                            return (
                                <tr key={r.accountId} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                                    <td style={td}>
                                        <strong>{r.code}</strong> {r.name}
                                        <div style={{ color: '#94a3b8', fontSize: '0.69rem', marginTop: 2, maxWidth: 320 }}>
                                            {r.observations[0]}
                                        </div>
                                        {r.entryIds.length > 0 && (
                                            <div style={{ color: '#cbd5e1', fontSize: '0.66rem', marginTop: 2 }}>
                                                {r.entryIds.length} asiento(s) de origen
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...td, color: '#64748b' }}>{r.rubro}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{CONDITION_LABEL[r.monetaryCondition]}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{CRITERION_LABEL[r.measurementCriterion] ?? r.measurementCriterion}</td>
                                    <td style={td}>{TREATMENT_LABEL[r.treatment]}</td>
                                    <td style={{ ...td, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                        {r.originPeriods.map(o => (
                                            <div key={o.period}>
                                                {o.period}
                                                {o.coefficient != null && <span style={{ color: '#94a3b8' }}> × {o.coefficient.toFixed(6)}</span>}
                                            </div>
                                        ))}
                                    </td>
                                    <td style={num}>{money(r.historicAmount)}</td>
                                    <td style={num}>{money(r.restatedAmount)}</td>
                                    <td style={{ ...num, color: r.adjustment === 0 ? '#94a3b8' : '#0f172a' }}>{money(r.adjustment)}</td>
                                    <td style={num}>{money(r.presentationAmount)}</td>
                                    <td style={{ ...td, color: '#64748b' }}>{r.participatesInRecpam ? 'Participa' : '—'}</td>
                                    <td style={td}>
                                        <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, background: chip.bg, color: chip.color }}>
                                            {chip.label}
                                        </span>
                                    </td>
                                </tr>
                            )
                        })}
                        {filas.length === 0 && (
                            <tr><td colSpan={12} style={{ padding: 16, textAlign: 'center', color: '#15803d' }}>
                                Ninguna cuenta coincide con el filtro.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
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
const td: React.CSSProperties = { padding: '7px 10px' }
const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
