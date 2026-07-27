/**
 * MatrizCoberturaPanel — Fase 2I §2, §6 y §7.
 *
 * Muestra, para el ejercicio activo, qué le corresponde a CADA cuenta con saldo
 * o movimiento a los efectos de la expresión en moneda de cierre, y las dos
 * determinaciones del RECPAM con su conciliación.
 *
 * El objetivo de la pantalla no es reexpresar: es poder demostrar que ninguna
 * cuenta quedó sin analizar. Una partida monetaria aparece como analizada y sin
 * reexpresión, con el motivo escrito, no ausente de la lista.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../../storage/db'
import { listIndexSets } from '../../../accounting/inflation/indexRegistry'
import { indexSetToMap } from '../../../accounting/inflation/indexRegistry'
import {
    getEntriesForContext, getOpeningBalances, resolveContextForYear,
} from '../../../accounting/reporting/reportingContext'
import {
    buildAccountTreatmentMatrix, monthsBetween, previousMonth,
    type AccountTreatmentMatrix, type AccountTreatmentRow,
} from '../../../reporting/inflation/accountTreatment'
import { reconcileRecpam, type RecpamReconciliation } from '../../../reporting/inflation/recpam'
import { usePeriodYear } from '../../../hooks/usePeriodYear'
import type { InflationIndexSet } from '../../../accounting/inflation/types'

const money = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const TREATMENT_LABEL: Record<AccountTreatmentRow['treatment'], string> = {
    MONETARIA_SIN_REEXPRESION: 'Monetaria · ya en moneda de cierre',
    REEXPRESION_POR_ANTICUACION: 'Se reexpresa por anticuación',
    VALOR_CORRIENTE_AL_CIERRE: 'Valor corriente del cierre',
    CAPITAL_NOMINAL_LEGAL: 'Capital · nominal legal + ajuste',
    SIGUE_A_LA_PARTIDA_PRINCIPAL: 'Sigue a su partida principal',
    REQUIERE_DECISION: 'Requiere una decisión',
}

const STATUS_STYLE: Record<AccountTreatmentRow['status'], { bg: string; color: string; label: string }> = {
    OK: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'OK' },
    ADVERTENCIA: { bg: 'rgba(234,179,8,0.14)', color: '#a16207', label: 'Advertencia' },
    BLOQUEADO: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Bloqueado' },
}

export function MatrizCoberturaPanel() {
    const { year, start, end } = usePeriodYear()
    const [sets, setSets] = useState<InflationIndexSet[]>([])
    const [selectedId, setSelectedId] = useState<string>('')
    const [matrix, setMatrix] = useState<AccountTreatmentMatrix | null>(null)
    const [recpam, setRecpam] = useState<RecpamReconciliation | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [soloPendientes, setSoloPendientes] = useState(false)

    useEffect(() => {
        void listIndexSets().then(list => {
            setSets(list)
            if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const run = useCallback(async () => {
        const set = sets.find(s => s.id === selectedId)
        if (!set) { setMatrix(null); setRecpam(null); return }
        setLoading(true); setError(null)
        try {
            const indexes = indexSetToMap(set)
            const ctx = await resolveContextForYear(year, { start, end })
            const [entries, openingBalances, accounts] = await Promise.all([
                getEntriesForContext(ctx),
                getOpeningBalances(ctx),
                db.accounts.toArray(),
            ])

            const closePeriod = ctx.periodEnd.slice(0, 7)
            const openingPeriod = previousMonth(ctx.periodStart.slice(0, 7))
            const periods = monthsBetween(ctx.periodStart.slice(0, 7), closePeriod)

            const m = buildAccountTreatmentMatrix({
                accounts, entries, openingBalances, closePeriod, openingPeriod, indexes,
            })
            setMatrix(m)
            setRecpam(reconcileRecpam({ matrix: m, accounts, indexes, closePeriod, openingPeriod, periods }))
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            setMatrix(null); setRecpam(null)
        } finally {
            setLoading(false)
        }
    }, [sets, selectedId, year, start, end])

    useEffect(() => { void run() }, [run])

    const visibleRows = useMemo(() => {
        if (!matrix) return []
        return soloPendientes
            ? matrix.rows.filter(r => r.status !== 'OK')
            : matrix.rows
    }, [matrix, soloPendientes])

    if (sets.length === 0) {
        return (
            <p style={{ fontSize: '0.85rem', color: '#a16207' }}>
                Registrá primero una serie de índices: sin ella no hay coeficientes con los que
                analizar el tratamiento de cada cuenta.
            </p>
        )
    }

    return (
        <div data-testid="matriz-cobertura-panel">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Toda cuenta con saldo o movimiento en el ejercicio aparece acá con su condición
                monetaria, su criterio de medición, los períodos de origen de cada movimiento y el
                tratamiento que le corresponde. <strong>«No necesita reexpresión» es una conclusión
                registrada</strong>, no una cuenta ausente de la lista.
            </p>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                    Serie de índices
                    <select
                        value={selectedId}
                        onChange={e => setSelectedId(e.target.value)}
                        data-testid="matriz-set"
                        style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem' }}
                    >
                        {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Ejercicio {year}</span>
                {matrix && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: '#475569' }}>
                        <input type="checkbox" checked={soloPendientes} onChange={e => setSoloPendientes(e.target.checked)} />
                        Ver sólo lo que necesita atención
                    </label>
                )}
            </div>

            {loading && <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Analizando las cuentas del ejercicio…</p>}
            {error && (
                <div className="card" role="alert" style={{ padding: 12, borderLeft: '4px solid #ef4444', fontSize: '0.83rem', color: '#b91c1c' }}>
                    {error}
                </div>
            )}

            {matrix && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                        <Stat label="Cuentas analizadas" value={String(matrix.coverage.accountsWithActivity)} />
                        <Stat
                            label="Cobertura"
                            value={`${matrix.coverage.coveragePct.toFixed(2)} %`}
                            accent={matrix.coverage.coveragePct === 100 ? '#15803d' : '#b91c1c'}
                            testId="matriz-cobertura-pct"
                        />
                        <Stat
                            label="Cobertura por saldo"
                            value={`${matrix.coverage.balanceCoveragePct.toFixed(2)} %`}
                            accent={matrix.coverage.balanceCoveragePct === 100 ? '#15803d' : '#b91c1c'}
                        />
                        <Stat label="Moneda de cierre" value={matrix.closePeriod} />
                    </div>

                    {matrix.coverage.pending.length > 0 && (
                        <div className="card" role="alert" data-testid="matriz-pendientes"
                            style={{ padding: 12, marginBottom: 12, borderLeft: '4px solid #ef4444', fontSize: '0.82rem', color: '#b91c1c' }}>
                            <strong>{matrix.coverage.pending.length} cuenta(s) sin tratamiento declarado.</strong>
                            <ul style={{ margin: '6px 0 0 18px' }}>
                                {matrix.coverage.pending.map(p => <li key={p.code}>{p.code} {p.name} — {p.reason}</li>)}
                            </ul>
                        </div>
                    )}

                    {matrix.coverage.missingPeriods.length > 0 && (
                        <div className="card" role="alert" style={{ padding: 12, marginBottom: 12, borderLeft: '4px solid #f59e0b', fontSize: '0.82rem', color: '#a16207' }}>
                            Faltan índices para: {matrix.coverage.missingPeriods.join(', ')}. Sin índice no se reexpresa.
                        </div>
                    )}

                    {recpam && <RecpamCard recpam={recpam} />}

                    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse', minWidth: 1080 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                                    <th style={th}>Cuenta</th>
                                    <th style={th}>Rubro</th>
                                    <th style={th}>Condición</th>
                                    <th style={th}>Medición</th>
                                    <th style={th}>Tratamiento</th>
                                    <th style={th}>Períodos de origen</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Histórico</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Reexpresado</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Ajuste</th>
                                    <th style={th}>RECPAM</th>
                                    <th style={th}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(r => {
                                    const chip = STATUS_STYLE[r.status]
                                    return (
                                        <tr key={r.accountId} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                                            <td style={td}>
                                                <strong>{r.code}</strong> {r.name}
                                                <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 2 }}>{r.observations[0]}</div>
                                            </td>
                                            <td style={{ ...td, color: '#64748b' }}>{r.rubro}</td>
                                            <td style={{ ...td, color: '#64748b' }}>{r.monetaryCondition}</td>
                                            <td style={{ ...td, color: '#64748b' }}>{r.measurementCriterion}</td>
                                            <td style={td}>{TREATMENT_LABEL[r.treatment]}</td>
                                            <td style={{ ...td, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                                {r.originPeriods.map(o => (
                                                    <div key={o.period}>
                                                        {o.period}
                                                        {o.coefficient != null && <span style={{ color: '#94a3b8' }}> × {o.coefficient.toFixed(6)}</span>}
                                                    </div>
                                                ))}
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.historicAmount)}</td>
                                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.restatedAmount)}</td>
                                            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.adjustment === 0 ? '#94a3b8' : '#0f172a' }}>
                                                {money(r.adjustment)}
                                            </td>
                                            <td style={{ ...td, color: '#64748b' }}>{r.participatesInRecpam ? 'Sí' : '—'}</td>
                                            <td style={td}>
                                                <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: '0.66rem', fontWeight: 700, background: chip.bg, color: chip.color }}>
                                                    {chip.label}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {visibleRows.length === 0 && (
                                    <tr><td colSpan={11} style={{ padding: 16, textAlign: 'center', color: '#15803d' }}>
                                        Ninguna cuenta necesita atención.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    )
}

function RecpamCard({ recpam }: { recpam: RecpamReconciliation }) {
    const [open, setOpen] = useState(false)
    return (
        <div className="card" data-testid="recpam-card"
            style={{ padding: 14, marginBottom: 14, borderLeft: `4px solid ${recpam.reconciled ? '#22c55e' : '#ef4444'}` }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 8px' }}>
                RECPAM · determinación dual
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 10 }}>
                <Stat label="Secuencial (diferencia patrimonial)" value={money(recpam.sequential.amount)} testId="recpam-secuencial" />
                <Stat label="Analítico (exposición monetaria)" value={money(recpam.analytic.amount)} testId="recpam-analitico" />
                <Stat
                    label="Diferencia"
                    value={money(recpam.difference)}
                    accent={recpam.reconciled ? '#15803d' : '#b91c1c'}
                    testId="recpam-diferencia"
                />
                <Stat label="Tolerancia" value={money(recpam.toleranceCents / 100)} />
            </div>

            {recpam.blockers.length > 0 ? (
                <ul role="alert" style={{ margin: '0 0 8px 18px', fontSize: '0.8rem', color: '#b91c1c' }}>
                    {recpam.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
            ) : (
                <p style={{ fontSize: '0.8rem', color: '#15803d', margin: '0 0 8px' }}>
                    Las dos determinaciones coinciden dentro de la tolerancia: el RECPAM no es una cifra
                    de cuadre, es el resultado de la exposición de las partidas monetarias.
                </p>
            )}

            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(o => !o)}>
                {open ? 'Ocultar la evolución de la posición monetaria' : 'Ver la evolución de la posición monetaria'}
            </button>

            {open && (
                <div style={{ overflowX: 'auto', marginTop: 10 }}>
                    <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse', minWidth: 640 }}>
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
                                    <td style={{ ...td, textAlign: 'right' }}>{money(e.openingPosition)}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{money(e.netFlow)}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{money(e.closingPosition)}</td>
                                    <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{e.coefficient?.toFixed(6) ?? '—'}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{money(e.recpamContribution)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}

function Stat({ label, value, accent, testId }: { label: string; value: string; accent?: string; testId?: string }) {
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: accent ?? '#0f172a' }} data-testid={testId}>{value}</div>
        </div>
    )
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 10px' }
