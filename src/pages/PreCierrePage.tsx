/**
 * Pre-cierre y medición al cierre — Fase 2J §2 y §3.
 *
 * Es la última gran etapa antes de que los estados contables queden
 * definitivos, y hasta ahora estaba repartida entre una planilla escondida y
 * una sección de Configuración. Acá vive el recorrido completo:
 *
 *   Libro Diario → Mayores → Balance → **Pre-cierre** → Estados → Cierre
 *
 * El avance NO es un porcentaje decorativo: sale de hechos verificables del
 * mismo núcleo de controles que gobierna la publicación y el cierre. Una etapa
 * está completa cuando sus controles pasan, no cuando el usuario la visitó.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../storage/db'
import { usePeriodYear } from '../hooks/usePeriodYear'
import { listIndexSets } from '../accounting/inflation/indexRegistry'
import { loadReportingBundle, type ReportingBundle } from '../reporting/loadReportingBundle'
import { listPendingMeasurements } from '../reporting/measurement/measurementService'
import type { PendingMeasurement } from '../reporting/measurement/measurementTypes'
import type { ReadinessStage, StageReport, StageStatus } from '../reporting/closing/closingReadiness'
import { CoberturaCuentasTabla } from '../components/PreCierre/CoberturaCuentasTabla'
import { RecpamPanel } from '../components/PreCierre/RecpamPanel'
import { MedicionesPanel } from '../components/PreCierre/MedicionesPanel'
import type { InflationIndexSet } from '../accounting/inflation/types'

const money = (n: number) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

/** Identificador del ejercicio, con la convención del contexto contable */
const exerciseId = (b: ReportingBundle) =>
    `exercise-${b.metadata.companyId}-${b.metadata.periodStart.slice(0, 4)}`

const STATUS_CHIP: Record<StageStatus, { bg: string; color: string; label: string }> = {
    NO_INICIADA: { bg: 'rgba(148,163,184,0.16)', color: '#475569', label: 'No iniciada' },
    EN_PROCESO: { bg: 'rgba(37,99,235,0.10)', color: '#1d4ed8', label: 'En proceso' },
    COMPLETA: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'Completa' },
    COMPLETA_CON_ADVERTENCIAS: { bg: 'rgba(234,179,8,0.16)', color: '#a16207', label: 'Con advertencias' },
    BLOQUEADA: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Bloqueada' },
    NO_APLICABLE: { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: 'No aplicable' },
}

export default function PreCierrePage() {
    const navigate = useNavigate()
    const [params, setParams] = useSearchParams()
    const { year, end } = usePeriodYear()

    const [sets, setSets] = useState<InflationIndexSet[]>([])
    const [setId, setSetId] = useState<string>('')
    const [bundle, setBundle] = useState<ReportingBundle | null>(null)
    const [pending, setPending] = useState<PendingMeasurement[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const activeStage = (params.get('etapa') as ReadinessStage | null) ?? 'RESUMEN'
    const setStage = (s: ReadinessStage) => setParams({ etapa: s })

    useEffect(() => {
        void listIndexSets().then(list => {
            setSets(list)
            setSetId(prev => prev || (list[0]?.id ?? ''))
        })
    }, [])

    const cargar = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const b = await loadReportingBundle(year, {
                withComparative: true,
                inflationIndexSetId: setId || undefined,
            })
            setBundle(b)
            const balances = new Map(b.statements.trialBalance.rows.map(r => [r.accountId, r.closing]))
            const accounts = await db.accounts.toArray()
            setPending(await listPendingMeasurements(exerciseId(b), accounts, balances).catch(() => []))
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            setBundle(null)
        } finally {
            setLoading(false)
        }
    }, [year, setId])

    useEffect(() => { void cargar() }, [cargar])

    const stages = bundle?.readiness.stages ?? []
    const stage = useMemo(() => stages.find(s => s.stage === activeStage) ?? stages[0], [stages, activeStage])

    if (loading && !bundle) {
        return <div className="empty-state" style={{ padding: 48 }}>Analizando el ejercicio…</div>
    }
    if (error) {
        return (
            <div className="card" role="alert" style={{ margin: 24, padding: 16, borderLeft: '4px solid #ef4444' }}>
                No se pudo analizar el ejercicio: {error}
            </div>
        )
    }
    if (!bundle) return null

    const { readiness, metadata, treatmentMatrix, recpam } = bundle
    const cobertura = treatmentMatrix?.coverage

    return (
        <div className="precierre-page" data-testid="precierre-page">
            <header className="precierre-header">
                <div>
                    <p className="precierre-eyebrow">Última etapa antes de los estados definitivos</p>
                    <h1 className="precierre-title">Pre-cierre y medición al cierre</h1>
                </div>
                <div className="precierre-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/estados')}>
                        Ver estados contables
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => navigate('/configuracion?seccion=ejercicios')}>
                        Cierre del ejercicio
                    </button>
                </div>
            </header>

            {/* Encabezado del ejercicio (§3) */}
            <section className="precierre-strip" aria-label="Situación del ejercicio">
                <Dato label="Empresa" valor={metadata.companyLegalName} />
                <Dato label="Ejercicio" valor={metadata.exerciseLabel} />
                <Dato label="Fecha de cierre" valor={end.split('-').reverse().join('/')} />
                <Dato label="Moneda" valor={metadata.currency} />
                <Dato label="Unidad de medida" valor={bundle.inflationSet ? `Moneda de cierre (${bundle.inflationSet.coverageTo})` : 'Moneda nominal'} />
                <Dato label="Cuentas analizadas" valor={cobertura ? String(cobertura.accountsWithActivity) : '—'} />
                <Dato label="Cuentas pendientes" valor={cobertura ? String(cobertura.pending.length) : '—'}
                    tono={cobertura && cobertura.pending.length > 0 ? 'mal' : 'bien'} />
                <Dato label="RECPAM" valor={recpam ? (recpam.reconciled ? 'Conciliado' : 'Sin conciliar') : 'No aplica'}
                    tono={recpam ? (recpam.reconciled ? 'bien' : 'mal') : undefined} />
                <Dato label="Estados contables" valor={readiness.canPublish ? 'Listos para publicar' : 'Bloqueados'}
                    tono={readiness.canPublish ? 'bien' : 'mal'} />
                <Dato label="Avance del pre-cierre" valor={`${readiness.completedStages} de ${readiness.applicableStages} etapas`} />
            </section>

            <div className="precierre-toolbar">
                <label className="precierre-select">
                    Serie de índices
                    <select value={setId} onChange={e => setSetId(e.target.value)} data-testid="precierre-set">
                        <option value="">Moneda nominal (sin reexpresión)</option>
                        {sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </label>
                {sets.length === 0 && (
                    <span className="precierre-hint">
                        Todavía no registraste una serie de índices.{' '}
                        <a href="/configuracion?seccion=inflacion">Registrala acá</a> para habilitar la moneda de cierre.
                    </span>
                )}
            </div>

            <div className="precierre-layout">
                {/* Riel de etapas */}
                <nav className="precierre-rail" aria-label="Etapas del pre-cierre">
                    {stages.map((s, i) => {
                        const chip = STATUS_CHIP[s.status]
                        const activa = s.stage === (stage?.stage ?? 'RESUMEN')
                        return (
                            <button
                                key={s.stage}
                                className={`precierre-rail-item${activa ? ' is-active' : ''}`}
                                onClick={() => setStage(s.stage)}
                                aria-current={activa ? 'step' : undefined}
                                data-testid={`etapa-${s.stage}`}
                            >
                                <span className="precierre-rail-index">{i + 1}</span>
                                <span className="precierre-rail-body">
                                    <span className="precierre-rail-label">{s.label}</span>
                                    <span className="precierre-rail-chip" style={{ background: chip.bg, color: chip.color }}>
                                        {chip.label}
                                        {s.blockingCount > 0 && ` · ${s.blockingCount}`}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </nav>

                <section className="precierre-content">
                    {stage && (
                        <>
                            <h2 className="precierre-stage-title">{stage.label}</h2>
                            <p className="precierre-stage-desc">{stage.description}</p>
                            {stage.status === 'NO_APLICABLE' && stage.reason && (
                                <p className="precierre-na">No aplica en este ejercicio: {stage.reason}</p>
                            )}

                            <ListaControles stage={stage} onGo={(link) => navigate(link)} />

                            {stage.stage === 'RESUMEN' && <ResumenEtapa bundle={bundle} />}
                            {stage.stage === 'COBERTURA' && treatmentMatrix && (
                                <CoberturaCuentasTabla matrix={treatmentMatrix} />
                            )}
                            {stage.stage === 'RECPAM' && recpam && <RecpamPanel recpam={recpam} />}
                            {stage.stage === 'MEDICIONES' && (
                                <MedicionesPanel
                                    companyId={metadata.companyId}
                                    exerciseId={exerciseId(bundle)}
                                    closingDate={end}
                                    pending={pending}
                                    balances={new Map(bundle.statements.trialBalance.rows.map(r => [r.accountId, r.closing]))}
                                    onChanged={cargar}
                                />
                            )}
                            {stage.stage === 'CIERRE' && (
                                <PreparacionCierre readiness={readiness} onGo={() => navigate('/configuracion?seccion=ejercicios')} />
                            )}
                            {stage.stage === 'ESTADOS' && (
                                <VistaPreviaEstados bundle={bundle} onGo={() => navigate('/estados')} />
                            )}
                        </>
                    )}
                </section>
            </div>

            <style>{styles}</style>
        </div>
    )
}

function ListaControles({ stage, onGo }: { stage: StageReport; onGo: (link: string) => void }) {
    if (stage.checks.length === 0) return null
    return (
        <ul className="precierre-checks">
            {stage.checks.map(c => (
                <li key={c.id} className={`precierre-check${c.passed ? ' is-ok' : c.severity === 'BLOQUEA' ? ' is-block' : ' is-warn'}`}>
                    <span className="precierre-check-icon" aria-hidden>{c.passed ? '✓' : c.severity === 'BLOQUEA' ? '✕' : '!'}</span>
                    <div className="precierre-check-body">
                        <span className="precierre-check-label">{c.label}</span>
                        {c.detail && <span className="precierre-check-detail">{c.detail}</span>}
                        {(c.difference !== undefined && c.difference !== 0) && (
                            <span className="precierre-check-detail">
                                Diferencia {money(c.difference)}
                                {c.tolerance !== undefined && ` · tolerancia ${money(c.tolerance)}`}
                            </span>
                        )}
                        {!c.passed && c.action && <span className="precierre-check-action">{c.action}</span>}
                    </div>
                    {!c.passed && c.link && (
                        <button className="btn btn-secondary btn-sm" onClick={() => onGo(c.link!)}>Resolver</button>
                    )}
                </li>
            ))}
        </ul>
    )
}

function ResumenEtapa({ bundle }: { bundle: ReportingBundle }) {
    const s = bundle.statements
    return (
        <div className="precierre-grid">
            <Tarjeta titulo="Situación patrimonial" filas={[
                ['Activo', s.balanceSheet.totalAssets.amount],
                ['Pasivo', s.balanceSheet.totalLiabilities.amount],
                ['Patrimonio neto', s.balanceSheet.equity.amount],
            ]} />
            <Tarjeta titulo="Resultados" filas={[
                ['Ingresos por ventas', s.incomeStatement.sales.amount],
                ['Costo de ventas', s.incomeStatement.costOfSales.amount],
                ['Resultado del ejercicio', s.incomeStatement.netIncome.amount],
            ]} />
            <Tarjeta titulo="Flujo de efectivo" filas={[
                ['Efectivo al inicio', s.cashFlowDirect?.openingCash.amount ?? 0],
                ['Variación neta', s.cashFlowDirect?.netChange.amount ?? 0],
                ['Efectivo al cierre', s.cashFlowDirect?.closingCash.amount ?? 0],
            ]} />
            {bundle.recpam && (
                <Tarjeta titulo="Moneda de cierre" filas={[
                    ['RECPAM analítico', bundle.recpam.analytic.amount],
                    ['RECPAM secuencial', bundle.recpam.sequential.amount],
                    ['Diferencia', bundle.recpam.difference],
                ]} />
            )}
        </div>
    )
}

function VistaPreviaEstados({ bundle, onGo }: { bundle: ReportingBundle; onGo: () => void }) {
    return (
        <div>
            <p className="precierre-stage-desc">
                {bundle.readiness.canPublish
                    ? 'Los estados están en condiciones de emitirse y exportarse como definitivos.'
                    : 'Los estados todavía no pueden publicarse: resolvé los controles marcados en las etapas anteriores.'}
            </p>
            <ResumenEtapa bundle={bundle} />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={onGo}>
                Abrir los estados contables
            </button>
        </div>
    )
}

function PreparacionCierre({ readiness, onGo }: { readiness: ReportingBundle['readiness']; onGo: () => void }) {
    return (
        <div>
            <p className="precierre-stage-desc">
                {readiness.canClose
                    ? 'Todos los controles del ejercicio están en verde: la refundición puede generarse.'
                    : `Quedan ${readiness.blockers.length} control(es) por resolver antes de refundir y cerrar.`}
            </p>
            {!readiness.canClose && (
                <ul className="precierre-checks">
                    {readiness.blockers.map(b => (
                        <li key={b.id} className="precierre-check is-block">
                            <span className="precierre-check-icon" aria-hidden>✕</span>
                            <div className="precierre-check-body">
                                <span className="precierre-check-label">{b.label}</span>
                                {b.detail && <span className="precierre-check-detail">{b.detail}</span>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            <button className="btn btn-primary btn-sm" disabled={!readiness.canClose} onClick={onGo}
                data-testid="ir-al-cierre">
                Ir al cierre del ejercicio
            </button>
        </div>
    )
}

function Tarjeta({ titulo, filas }: { titulo: string; filas: Array<[string, number]> }) {
    return (
        <div className="card" style={{ padding: 12 }}>
            <h4 style={{ fontSize: '0.82rem', fontWeight: 800, margin: '0 0 8px' }}>{titulo}</h4>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <tbody>
                    {filas.map(([label, value]) => (
                        <tr key={label} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '4px 0', color: '#64748b' }}>{label}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                {money(value)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function Dato({ label, valor, tono }: { label: string; valor: string; tono?: 'bien' | 'mal' }) {
    return (
        <div className="precierre-dato">
            <span className="precierre-dato-label">{label}</span>
            <span className={`precierre-dato-valor${tono ? ` is-${tono}` : ''}`}>{valor}</span>
        </div>
    )
}

const styles = `
.precierre-page { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; }
.precierre-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.precierre-eyebrow { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8; margin: 0 0 2px; }
.precierre-title { font-size: 1.6rem; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.02em; }
.precierre-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.precierre-strip {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px;
    background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 16px;
}
.precierre-dato { background: #fff; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.precierre-dato-label { font-size: 0.63rem; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; font-weight: 700; }
.precierre-dato-valor { font-size: 0.86rem; font-weight: 700; color: #0f172a; }
.precierre-dato-valor.is-bien { color: #15803d; }
.precierre-dato-valor.is-mal { color: #b91c1c; }

.precierre-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.precierre-select { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; color: #475569; }
.precierre-select select { padding: 5px 8px; border: 1px solid #e2e8f0; border-radius: 7px; font-size: 0.8rem; font-weight: 400; }
.precierre-hint { font-size: 0.76rem; color: #a16207; }

.precierre-layout { display: grid; grid-template-columns: 264px 1fr; gap: 20px; align-items: start; }
@media (max-width: 900px) { .precierre-layout { grid-template-columns: 1fr; } }

.precierre-rail { display: flex; flex-direction: column; gap: 2px; position: sticky; top: 16px; }
@media (max-width: 900px) { .precierre-rail { position: static; flex-direction: row; overflow-x: auto; padding-bottom: 6px; } }
.precierre-rail-item {
    display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
    border: 1px solid transparent; background: transparent; cursor: pointer; text-align: left; width: 100%;
    transition: background 0.15s ease; white-space: nowrap;
}
.precierre-rail-item:hover { background: #f1f5f9; }
.precierre-rail-item.is-active { background: #fff; border-color: #e2e8f0; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.precierre-rail-index {
    width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; flex-shrink: 0;
    font-size: 0.68rem; font-weight: 800; color: #64748b; background: #f1f5f9;
}
.precierre-rail-item.is-active .precierre-rail-index { background: #2563eb; color: #fff; }
.precierre-rail-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.precierre-rail-label { font-size: 0.8rem; font-weight: 600; color: #0f172a; }
.precierre-rail-chip { font-size: 0.63rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; width: fit-content; }

.precierre-content { min-width: 0; }
.precierre-stage-title { font-size: 1.2rem; font-weight: 800; color: #0f172a; margin: 0 0 4px; }
.precierre-stage-desc { font-size: 0.85rem; color: #64748b; margin: 0 0 14px; max-width: 70ch; }
.precierre-na { font-size: 0.82rem; color: #94a3b8; font-style: italic; margin: 0 0 14px; }

.precierre-checks { list-style: none; margin: 0 0 18px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.precierre-check {
    display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px;
    border: 1px solid #e2e8f0; border-radius: 10px; background: #fff;
}
.precierre-check.is-block { border-left: 3px solid #ef4444; }
.precierre-check.is-warn { border-left: 3px solid #f59e0b; }
.precierre-check.is-ok { border-left: 3px solid #22c55e; }
.precierre-check-icon { font-weight: 800; font-size: 0.8rem; line-height: 1.4; }
.precierre-check.is-ok .precierre-check-icon { color: #15803d; }
.precierre-check.is-block .precierre-check-icon { color: #b91c1c; }
.precierre-check.is-warn .precierre-check-icon { color: #a16207; }
.precierre-check-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.precierre-check-label { font-size: 0.82rem; color: #0f172a; }
.precierre-check-detail { font-size: 0.74rem; color: #64748b; }
.precierre-check-action { font-size: 0.74rem; color: #1d4ed8; }

.precierre-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
`
