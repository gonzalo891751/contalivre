/**
 * EjerciciosPanel — Fase 2D (§4): gestión de ejercicios dentro de Configuración.
 * Lista los ejercicios, permite fijar el actual y reabrir uno cerrado (con
 * motivo; la reapertura revierte los asientos de cierre e invalida snapshots).
 * El cierre formal se hace desde la planilla de Cierre (AxI + Valuación).
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listExercises, getSystemMeta, setCurrentExercise } from '../../../accounting/application/contextService'
import { reopenClosedExercise } from '../../../accounting/application/closingService'
import type { AccountingExercise } from '../../../accounting/domain/types'

const STATUS_CHIP: Record<string, { label: string; bg: string; color: string }> = {
    OPEN: { label: 'Abierto', bg: 'rgba(34,197,94,0.12)', color: '#15803d' },
    CLOSED: { label: 'Cerrado', bg: 'rgba(148,163,184,0.18)', color: '#475569' },
    SOFT_CLOSED: { label: 'Cierre provisorio', bg: 'rgba(234,179,8,0.12)', color: '#a16207' },
}

export function EjerciciosPanel() {
    const navigate = useNavigate()
    const [exercises, setExercises] = useState<AccountingExercise[]>([])
    const [currentId, setCurrentId] = useState<string | undefined>(undefined)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [reopenTarget, setReopenTarget] = useState<string | null>(null)
    const [reopenReason, setReopenReason] = useState('')

    const reload = async () => {
        const [list, meta] = await Promise.all([listExercises(), getSystemMeta().catch(() => null)])
        setExercises(list)
        setCurrentId(meta?.currentExerciseId)
    }
    useEffect(() => { void reload() }, [])

    const handleSetCurrent = async (id: string) => {
        setBusy(true); setMessage(null)
        try { await setCurrentExercise(id); await reload(); setMessage('Ejercicio actual actualizado.') }
        catch (e) { setMessage(`No se pudo fijar el ejercicio: ${e instanceof Error ? e.message : e}`) }
        finally { setBusy(false) }
    }

    const handleReopen = async (id: string) => {
        if (!reopenReason.trim()) { setMessage('Indicá el motivo de la reapertura.'); return }
        setBusy(true); setMessage(null)
        try {
            const { reversedEntryIds } = await reopenClosedExercise(id, reopenReason.trim())
            setReopenTarget(null); setReopenReason('')
            await reload()
            setMessage(`Ejercicio reabierto. Se revirtieron ${reversedEntryIds.length} asiento(s) de cierre/apertura y se invalidaron los snapshots publicados.`)
        } catch (e) {
            setMessage(`No se pudo reabrir: ${e instanceof Error ? e.message : e}`)
        } finally { setBusy(false) }
    }

    return (
        <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Los ejercicios delimitan los libros y el contexto de reportes. El cierre formal
                (refundición, transferencia y apertura del siguiente) se realiza desde la planilla
                de Cierre. Reabrir un ejercicio revierte sus asientos automáticos de cierre.
            </p>

            <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: '#64748b', background: '#f8fafc' }}>
                            <th style={{ padding: '8px' }}>Ejercicio</th>
                            <th style={{ padding: '8px' }}>Período</th>
                            <th style={{ padding: '8px' }}>Estado</th>
                            <th style={{ padding: '8px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {exercises.map(ex => {
                            const chip = STATUS_CHIP[ex.status] ?? STATUS_CHIP.OPEN
                            const isCurrent = ex.id === currentId
                            return (
                                <tr key={ex.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '8px', fontWeight: 600 }}>
                                        {ex.name}
                                        {isCurrent && <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, color: '#2563eb' }}>● actual</span>}
                                    </td>
                                    <td style={{ padding: '8px', color: '#64748b' }}>{ex.startDate} a {ex.endDate}</td>
                                    <td style={{ padding: '8px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: chip.bg, color: chip.color }}>{chip.label}</span>
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {!isCurrent && (
                                            <button className="btn btn-secondary btn-sm" onClick={() => handleSetCurrent(ex.id)} disabled={busy} style={{ marginRight: 6 }}>
                                                Fijar como actual
                                            </button>
                                        )}
                                        {ex.status === 'CLOSED' && (
                                            <button className="btn btn-secondary btn-sm" onClick={() => { setReopenTarget(ex.id); setReopenReason('') }} disabled={busy}>
                                                Reabrir…
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {exercises.length === 0 && (
                            <tr><td colSpan={4} style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>Todavía no hay ejercicios. Se crean al contabilizar el primer asiento.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {reopenTarget && (
                <div className="card" style={{ padding: 16, marginBottom: 12, borderLeft: '4px solid #f59e0b' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 6 }}>Reabrir ejercicio</h3>
                    <p style={{ fontSize: '0.8rem', color: '#a16207', marginBottom: 8 }}>
                        Se revertirán los asientos automáticos de cierre y la apertura del ejercicio siguiente. Los snapshots publicados quedarán invalidados.
                    </p>
                    <input
                        type="text"
                        value={reopenReason}
                        onChange={e => setReopenReason(e.target.value)}
                        placeholder="Motivo de la reapertura"
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReopen(reopenTarget)} disabled={busy || !reopenReason.trim()}>
                            {busy ? 'Reabriendo…' : 'Confirmar reapertura'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setReopenTarget(null); setReopenReason('') }} disabled={busy}>Cancelar</button>
                    </div>
                </div>
            )}

            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/planillas/cierre-valuacion')}>
                Ir a Cierre (AxI + Valuación)
            </button>

            {message && <div className="card" style={{ padding: 12, marginTop: 12, fontSize: '0.85rem' }}>{message}</div>}
        </div>
    )
}
