/**
 * CierreEjercicioPanel — cierre del ejercicio desde la interfaz.
 *
 * El servicio de cierre (vista previa → borradores → contabilización →
 * apertura del siguiente) existía y estaba probado, pero no tenía ninguna
 * puerta de entrada en la aplicación: se podía reabrir un ejercicio que nunca
 * se había podido cerrar. Este panel expone ese ciclo tal como está diseñado,
 * en tres pasos explícitos y sin ejecutar nada sin confirmación:
 *
 *   1. Vista previa: qué se cierra, qué lo bloquea y con qué resultado.
 *   2. Refundición en BORRADOR: se puede inspeccionar en el Libro Diario.
 *   3. Contabilizar el cierre y, después, generar la apertura del siguiente.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    generateClosingDrafts,
    generateOpeningEntry,
    postClosing,
    previewClosing,
    type ClosingPreview,
} from '../../../accounting/application/closingService'
import type { AccountingExercise } from '../../../accounting/domain/types'

const money = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(n)

interface Props {
    exercise: AccountingExercise
    onChanged: () => void | Promise<void>
}

export function CierreEjercicioPanel({ exercise, onChanged }: Props) {
    const navigate = useNavigate()
    const [preview, setPreview] = useState<ClosingPreview | null>(null)
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState<null | 'drafts' | 'post' | 'opening'>(null)
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
    const [confirmPost, setConfirmPost] = useState(false)

    /** Relee la vista previa sin pisar el mensaje del paso que acaba de correr */
    const load = useCallback(async (keepMessage = false) => {
        setLoading(true)
        if (!keepMessage) setMessage(null)
        try { setPreview(await previewClosing(exercise.id)) }
        catch (e) { setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) }) }
        finally { setLoading(false) }
    }, [exercise.id])

    useEffect(() => { void load() }, [load])

    const run = async (
        kind: 'drafts' | 'post' | 'opening',
        action: () => Promise<string>
    ) => {
        setBusy(kind); setMessage(null)
        try {
            setMessage({ kind: 'ok', text: await action() })
            await onChanged()
            await load(true)
        } catch (e) {
            setMessage({ kind: 'error', text: e instanceof Error ? e.message : String(e) })
        } finally {
            setBusy(null); setConfirmPost(false)
        }
    }

    if (loading && !preview) {
        return <div style={{ padding: 12, fontSize: '0.85rem', color: '#64748b' }}>Analizando el ejercicio…</div>
    }
    if (!preview) {
        return message ? <Message {...message} /> : null
    }

    const closed = preview.alreadyClosed
    const blocked = preview.blockers.length > 0

    return (
        <div className="card" style={{ padding: 16, marginBottom: 12 }} data-testid="cierre-panel">
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800, margin: '0 0 2px' }}>
                Cerrar {preview.exerciseName}
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px' }}>
                Fecha de cierre {exercise.endDate.split('-').reverse().join('/')} ·{' '}
                {preview.postedCount} asiento(s) contabilizado(s) · Debe {money(preview.journalDebit)} = Haber {money(preview.journalCredit)}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
                <Stat label="Cuentas de ingreso" value={String(preview.incomeAccounts.length)} />
                <Stat label="Cuentas de gasto" value={String(preview.expenseAccounts.length)} />
                <Stat
                    label={preview.result >= 0 ? 'Ganancia del ejercicio' : 'Pérdida del ejercicio'}
                    value={money(Math.abs(preview.result))}
                    accent={preview.result >= 0 ? '#15803d' : '#b91c1c'}
                />
            </div>

            {blocked && (
                <ul style={listStyle('#ef4444', '#b91c1c')} role="alert" data-testid="cierre-blockers">
                    {preview.blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
            )}
            {preview.warnings.length > 0 && (
                <ul style={listStyle('#f59e0b', '#a16207')}>
                    {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
            )}

            <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#475569' }}>
                    Ver las cuentas que se van a refundir
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 8 }}>
                    <AccountList title="Ingresos" rows={preview.incomeAccounts} />
                    <AccountList title="Gastos" rows={preview.expenseAccounts} />
                </div>
            </details>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {!closed && (
                    <>
                        <button
                            className="btn btn-secondary btn-sm"
                            disabled={blocked || busy !== null || preview.hasClosingEntries}
                            data-testid="cierre-drafts"
                            onClick={() => run('drafts', async () => {
                                const d = await generateClosingDrafts(exercise.id)
                                const n = [d.incomeDraft, d.expenseDraft, d.transferDraft].filter(Boolean).length
                                return `Se generaron ${n} asiento(s) de refundición EN BORRADOR. Revisalos en el Libro Diario antes de contabilizarlos.`
                            })}
                        >
                            {busy === 'drafts'
                                ? 'Generando…'
                                : preview.closingDraftCount > 0
                                    ? `1 · Regenerar la refundición (${preview.closingDraftCount} en borrador)`
                                    : '1 · Generar refundición en borrador'}
                        </button>

                        {!confirmPost ? (
                            <button
                                className="btn btn-primary btn-sm"
                                disabled={blocked || busy !== null}
                                data-testid="cierre-post"
                                onClick={() => setConfirmPost(true)}
                            >
                                2 · Contabilizar el cierre…
                            </button>
                        ) : (
                            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.8rem', color: '#a16207' }}>
                                    Se contabiliza la refundición y el ejercicio queda cerrado. ¿Confirmás?
                                </span>
                                <button
                                    className="btn btn-danger btn-sm"
                                    disabled={busy !== null}
                                    data-testid="cierre-post-confirm"
                                    onClick={() => run('post', async () => {
                                        const r = await postClosing(exercise.id)
                                        return `Cierre contabilizado: ${r.postedEntryIds.length} asiento(s). El ejercicio quedó cerrado y protegido contra nuevas contabilizaciones.`
                                    })}
                                >
                                    {busy === 'post' ? 'Cerrando…' : 'Confirmar cierre'}
                                </button>
                                <button className="btn btn-secondary btn-sm" disabled={busy !== null} onClick={() => setConfirmPost(false)}>
                                    Cancelar
                                </button>
                            </span>
                        )}
                    </>
                )}

                {closed && (
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={busy !== null}
                        data-testid="cierre-opening"
                        onClick={() => run('opening', async () => {
                            const r = await generateOpeningEntry(exercise.id)
                            return `Apertura generada con ${r.entry.lines.length} cuenta(s) patrimoniales por ${money(r.patrimonialTotalDebit)}. Las cuentas de resultado no se arrastran.`
                        })}
                    >
                        {busy === 'opening' ? 'Generando…' : '3 · Generar la apertura del ejercicio siguiente'}
                    </button>
                )}

                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/asientos')}>
                    Ver el Libro Diario
                </button>
            </div>

            {message && <Message {...message} />}
        </div>
    )
}

function Message({ kind, text }: { kind: 'ok' | 'error'; text: string }) {
    return (
        <div
            className="card"
            role={kind === 'error' ? 'alert' : 'status'}
            style={{ padding: 12, marginTop: 12, fontSize: '0.83rem', borderLeft: `4px solid ${kind === 'ok' ? '#22c55e' : '#ef4444'}` }}
        >
            {text}
        </div>
    )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: accent ?? '#0f172a' }}>{value}</div>
        </div>
    )
}

function AccountList({ title, rows }: { title: string; rows: Array<{ accountId: string; code: string; name: string; balance: number }> }) {
    return (
        <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{title}</div>
            {rows.length === 0
                ? <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Sin saldos.</div>
                : (
                    <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.accountId} style={{ borderTop: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '3px 0', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.code}</td>
                                    <td style={{ padding: '3px 6px' }}>{r.name}</td>
                                    <td style={{ padding: '3px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.balance)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </div>
    )
}

const listStyle = (border: string, color: string): React.CSSProperties => ({
    margin: '0 0 12px', padding: '10px 10px 10px 28px', borderLeft: `4px solid ${border}`,
    background: '#fff', borderRadius: 8, fontSize: '0.8rem', color,
})
