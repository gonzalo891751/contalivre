/**
 * DangerZonePanel — Fase 2D (§6): "Restablecer ContaLivre completamente".
 *
 * Flujo seguro y explícito:
 *   1) Genera un respaldo y lo descarga; si el respaldo FALLA, no se continúa.
 *   2) Exige confirmar que se guardó el respaldo.
 *   3) Exige tipear la frase exacta "RESETEAR CONTALIVRE".
 *   4) Segunda confirmación antes de ejecutar.
 * El reseteo es transaccional y re-siembra el estado de instalación limpia.
 */

import { useState } from 'react'
import { Warning } from '@phosphor-icons/react'
import { exportBackup } from '../../../accounting/backup/backupService'
import { resetApplication } from '../../../accounting/maintenance/resetService'

const CONFIRM_PHRASE = 'RESETEAR CONTALIVRE'

function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

type Stage = 'idle' | 'armed' | 'done'

export function DangerZonePanel() {
    const [stage, setStage] = useState<Stage>('idle')
    const [backupOk, setBackupOk] = useState(false)
    const [backupSummary, setBackupSummary] = useState<string | null>(null)
    const [savedConfirmed, setSavedConfirmed] = useState(false)
    const [phrase, setPhrase] = useState('')
    const [askFinal, setAskFinal] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)

    const reset = () => {
        setStage('idle'); setBackupOk(false); setBackupSummary(null); setSavedConfirmed(false)
        setPhrase(''); setAskFinal(false); setError(null)
    }

    const handleBackup = async () => {
        setBusy(true); setError(null)
        try {
            const backup = await exportBackup()
            downloadJson(backup, `contalivre-respaldo-previo-reset-${backup.createdAt.slice(0, 10)}.json`)
            setBackupOk(true)
            setBackupSummary(`${backup.checksums.totalRecords} registros en ${Object.keys(backup.tables).length} tablas.`)
        } catch (e) {
            setBackupOk(false)
            setError(`No se pudo generar el respaldo: ${e instanceof Error ? e.message : e}. No se continuará con el restablecimiento.`)
        } finally {
            setBusy(false)
        }
    }

    const phraseOk = phrase.trim().toUpperCase() === CONFIRM_PHRASE
    const canExecute = backupOk && savedConfirmed && phraseOk

    const handleExecute = async () => {
        if (!canExecute) return
        setBusy(true); setError(null)
        try {
            const r = await resetApplication()
            setResult(`ContaLivre se restableció: se vaciaron ${r.clearedRecords} registros de ${r.clearedTables} tablas. Nueva instalación ${r.newInstallationId.slice(0, 8)}…. Recargá la página para empezar de cero.`)
            setStage('done')
        } catch (e) {
            setError(`El restablecimiento falló: ${e instanceof Error ? e.message : e}`)
        } finally {
            setBusy(false)
            setAskFinal(false)
        }
    }

    if (stage === 'done') {
        return (
            <div className="card" style={{ padding: 20, borderLeft: '4px solid #15803d' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8, color: '#15803d' }}>Restablecimiento completado</h2>
                <p style={{ fontSize: '0.88rem', color: '#334155', marginBottom: 12 }}>{result}</p>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar ahora</button>
            </div>
        )
    }

    return (
        <div className="card" style={{ padding: 20, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.03)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 6, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Warning size={20} weight="fill" /> Zona peligrosa — Restablecer ContaLivre completamente
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#7f1d1d', marginBottom: 14 }}>
                Borra <strong>todos</strong> los datos de este navegador (asientos, cuentas, operaciones,
                ejercicios, auditoría, configuración) y deja la app como recién instalada. Esta acción
                no se puede deshacer sin un respaldo.
            </p>

            {stage === 'idle' && (
                <button className="btn btn-danger" onClick={() => setStage('armed')}>
                    Comenzar restablecimiento…
                </button>
            )}

            {stage === 'armed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Paso 1: respaldo obligatorio */}
                    <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Paso 1 · Respaldo obligatorio</div>
                        <button className="btn btn-secondary" onClick={handleBackup} disabled={busy}>
                            {busy ? 'Generando…' : backupOk ? 'Volver a descargar respaldo' : 'Generar y descargar respaldo'}
                        </button>
                        {backupOk && (
                            <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: 6 }}>✓ Respaldo generado: {backupSummary}</div>
                        )}
                    </div>

                    {/* Paso 2: confirmar guardado */}
                    <label className={`exp-check${!backupOk ? ' disabled' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: backupOk ? '#334155' : '#94a3b8' }}>
                        <input type="checkbox" checked={savedConfirmed} disabled={!backupOk} onChange={e => setSavedConfirmed(e.target.checked)} />
                        Paso 2 · Confirmo que guardé el respaldo en un lugar seguro fuera del navegador.
                    </label>

                    {/* Paso 3: frase exacta */}
                    <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                            Paso 3 · Escribí <code style={{ background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>{CONFIRM_PHRASE}</code> para habilitar
                        </div>
                        <input
                            type="text"
                            value={phrase}
                            onChange={e => setPhrase(e.target.value)}
                            disabled={!savedConfirmed}
                            placeholder={CONFIRM_PHRASE}
                            style={{ width: '100%', maxWidth: 320, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8 }}
                        />
                    </div>

                    {error && <div style={{ fontSize: '0.83rem', color: '#b91c1c' }}>{error}</div>}

                    {/* Paso 4: doble confirmación */}
                    {!askFinal ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-danger" disabled={!canExecute || busy} onClick={() => setAskFinal(true)}>
                                Restablecer ContaLivre
                            </button>
                            <button className="btn btn-secondary" onClick={reset} disabled={busy}>Cancelar</button>
                        </div>
                    ) : (
                        <div style={{ padding: 12, borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.08)' }}>
                            <p style={{ fontSize: '0.85rem', color: '#7f1d1d', fontWeight: 600, marginBottom: 10 }}>
                                ¿Seguro? Se borrará todo de forma irreversible.
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-danger" onClick={handleExecute} disabled={busy}>
                                    {busy ? 'Restableciendo…' : 'Sí, borrar todo ahora'}
                                </button>
                                <button className="btn btn-secondary" onClick={() => setAskFinal(false)} disabled={busy}>No, volver</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
