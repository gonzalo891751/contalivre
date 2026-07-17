/**
 * Práctica guiada — Fase 2C (§14).
 * Escenarios educativos aislados en ejercicios demo (9001-9003), con consigna,
 * explicación, solución paso a paso y reset. No mezcla con datos reales.
 */

import { useEffect, useState } from 'react'
import { getScenarioDefinitions, runScenario, resetScenario, type ScenarioDef } from '../accounting/scenarios/scenarios'
import { loadReportingBundle, type ReportingBundle } from '../reporting/loadReportingBundle'

const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PracticaPage() {
    const [scenarios, setScenarios] = useState<ScenarioDef[]>([])
    const [selected, setSelected] = useState<ScenarioDef | null>(null)
    const [showSolution, setShowSolution] = useState(false)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [bundle, setBundle] = useState<ReportingBundle | null>(null)

    useEffect(() => {
        getScenarioDefinitions().then(defs => { setScenarios(defs); setSelected(defs[0]) })
    }, [])

    const refreshBundle = async (year: number) => {
        setBundle(await loadReportingBundle(year, { withComparative: false }))
    }

    const handleRun = async () => {
        if (!selected) return
        setBusy(true); setMessage(null)
        try {
            const result = await runScenario(selected)
            if (result.missingAccounts.length > 0) {
                setMessage(`Faltan cuentas del plan para este escenario: ${result.missingAccounts.join(', ')}. Cargá el plan de cuentas estándar.`)
            } else {
                setMessage(`Escenario "${selected.title}" cargado: ${result.postedSteps} asientos contabilizados en el ejercicio demo ${selected.year}.`)
                await refreshBundle(selected.year)
            }
        } catch (e) {
            setMessage(`Error al ejecutar el escenario: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setBusy(false)
        }
    }

    const handleReset = async () => {
        if (!selected) return
        setBusy(true); setMessage(null)
        try {
            const { deleted } = await resetScenario(selected)
            setMessage(`Escenario restablecido: se borraron ${deleted} asientos del ejercicio demo ${selected.year}.`)
            setBundle(null)
        } finally {
            setBusy(false)
        }
    }

    if (!selected) return <div className="empty-state"><p>Cargando escenarios…</p></div>

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
            <header className="page-header">
                <h1 className="page-title">Práctica guiada</h1>
                <p className="page-subtitle">
                    Escenarios de aprendizaje en ejercicios de demostración separados (años {scenarios.map(s => s.year).join(', ')}).
                    No se mezclan con tus datos reales; podés restablecerlos cuando quieras.
                </p>
            </header>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {scenarios.map(s => (
                    <button
                        key={s.id}
                        className={`btn btn-sm ${selected.id === s.id ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => { setSelected(s); setBundle(null); setMessage(null) }}
                    >
                        {s.title}
                    </button>
                ))}
            </div>

            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{selected.title}</h2>
                <p style={{ fontSize: '0.88rem', color: '#475569', margin: '4px 0 12px' }}>{selected.description}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={busy}>
                        {busy ? '…' : 'Cargar escenario (contabiliza los pasos)'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowSolution(v => !v)}>
                        {showSolution ? 'Ocultar solución' : 'Ver solución paso a paso'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={handleReset} disabled={busy}>Restablecer</button>
                </div>
            </div>

            {message && (
                <div className="card" style={{ padding: 12, marginBottom: 16, fontSize: '0.85rem' }}>{message}</div>
            )}

            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 10 }}>Consignas</h3>
                <ol style={{ paddingLeft: 20, lineHeight: 1.7, fontSize: '0.88rem' }}>
                    {selected.steps.map(step => (
                        <li key={step.order} style={{ marginBottom: 10 }}>
                            <strong>{step.title}.</strong> {step.prompt}
                            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{step.explanation}{step.hint ? ` · Pista: ${step.hint}` : ''}</div>
                            {showSolution && (
                                <div style={{ marginTop: 4, fontSize: '0.8rem', background: '#f8fafc', borderRadius: 6, padding: '6px 8px' }}>
                                    {step.lines.map((l, i) => (
                                        <div key={i}>{l.debit > 0 ? `Debe ${fmt(l.debit)}` : `Haber ${fmt(l.credit)}`} — {l.description ?? l.accountId}</div>
                                    ))}
                                </div>
                            )}
                        </li>
                    ))}
                </ol>
            </div>

            {bundle && (
                <div className="card" style={{ padding: 16 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8 }}>Resultado del ejercicio demo</h3>
                    <table style={{ fontSize: '0.85rem', lineHeight: 1.8 }}>
                        <tbody>
                            <tr><td style={{ paddingRight: 24 }}>Total del activo</td><td style={{ textAlign: 'right' }}>${fmt(bundle.statements.balanceSheet.totalAssets.amount)}</td></tr>
                            <tr><td style={{ paddingRight: 24 }}>Patrimonio neto</td><td style={{ textAlign: 'right' }}>${fmt(bundle.statements.balanceSheet.equity.amount)}</td></tr>
                            <tr><td style={{ paddingRight: 24 }}>Resultado del ejercicio</td><td style={{ textAlign: 'right' }}>${fmt(bundle.statements.incomeStatement.netIncome.amount)}</td></tr>
                            <tr><td style={{ paddingRight: 24 }}>EFE — variación de efectivo</td><td style={{ textAlign: 'right' }}>${fmt(bundle.statements.cashFlowDirect?.netChange.amount ?? 0)}</td></tr>
                            <tr><td style={{ paddingRight: 24 }}>Validación</td><td style={{ textAlign: 'right', color: bundle.statements.validation.canPublish ? '#15803d' : '#b91c1c' }}>{bundle.statements.validation.canPublish ? 'Todos los invariantes cumplen' : 'Con observaciones'}</td></tr>
                        </tbody>
                    </table>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 8 }}>
                        Abrí los estados seleccionando el ejercicio {selected.year} en el encabezado para ver el detalle con drilldown.
                    </p>
                </div>
            )}
        </div>
    )
}
