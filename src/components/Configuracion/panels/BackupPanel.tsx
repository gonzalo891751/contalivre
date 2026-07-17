/**
 * BackupPanel — Fase 2D (§4): respaldo/restauración integral reutilizable.
 * Extraído de AcercaDe para vivir dentro de Configuración → Respaldo.
 * Valida el archivo antes de tocar la base, genera copia previa y aplica todo
 * en una transacción (si algo falla, la base queda como estaba).
 */

import { useRef, useState } from 'react'
import { exportBackup, previewBackup, restoreBackup, type BackupPreview } from '../../../accounting/backup/backupService'

function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

export function BackupPanel() {
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [pendingRestore, setPendingRestore] = useState<{ raw: unknown; preview: BackupPreview } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleExport = async () => {
        setBusy(true); setMessage(null)
        try {
            const backup = await exportBackup()
            const date = backup.createdAt.slice(0, 10)
            downloadJson(backup, `contalivre-respaldo-${date}.json`)
            setMessage(`Respaldo generado: ${backup.checksums.totalRecords} registros en ${Object.keys(backup.tables).length} tablas.`)
        } catch (error) {
            setMessage(`Error al generar el respaldo: ${error instanceof Error ? error.message : error}`)
        } finally { setBusy(false) }
    }

    const handleFileSelected = async (file: File) => {
        setBusy(true); setMessage(null); setPendingRestore(null)
        try {
            const raw = JSON.parse(await file.text())
            const preview = previewBackup(raw)
            if (!preview.valid) { setMessage(`El archivo no es un respaldo válido:\n${preview.errors.join('\n')}`); return }
            setPendingRestore({ raw, preview })
        } catch (error) {
            setMessage(`No se pudo leer el archivo: ${error instanceof Error ? error.message : error}`)
        } finally { setBusy(false) }
    }

    const handleConfirmRestore = async () => {
        if (!pendingRestore) return
        setBusy(true); setMessage(null)
        try {
            const result = await restoreBackup(pendingRestore.raw)
            downloadJson(result.preRestoreBackup, `contalivre-pre-restauracion-${new Date().toISOString().slice(0, 10)}.json`)
            setMessage(`Restauración completada: ${result.restoredRecords} registros en ${result.restoredTables} tablas. Se descargó una copia del estado anterior. Recargá la página para ver los datos.`)
            setPendingRestore(null)
        } catch (error) {
            setMessage(`La restauración falló y la base quedó como estaba: ${error instanceof Error ? error.message : error}`)
        } finally { setBusy(false) }
    }

    return (
        <div>
            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Respaldo integral</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Exporta todas las tablas de la base local (asientos, cuentas, operaciones,
                    ejercicios, auditoría) y la configuración en un único archivo JSON con totales
                    de control. Guardalo fuera del navegador: borrar los datos de navegación elimina
                    toda la información.
                </p>
                <button className="btn btn-primary" onClick={handleExport} disabled={busy}>
                    {busy ? 'Procesando…' : 'Descargar respaldo'}
                </button>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Restaurar respaldo</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Valida el archivo antes de tocar la base, genera una copia automática del estado
                    actual y aplica todo en una transacción: si algo falla, la base queda como estaba.
                </p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={e => { const file = e.target.files?.[0]; if (file) void handleFileSelected(file); e.target.value = '' }}
                />
                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                    Seleccionar archivo…
                </button>

                {pendingRestore && (
                    <div style={{ marginTop: 14, padding: 14, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>Vista previa del respaldo</h3>
                        <ul style={{ fontSize: '0.85rem', lineHeight: 1.8, marginBottom: 12, paddingLeft: 18 }}>
                            <li>Fecha del respaldo: {pendingRestore.preview.createdAt?.slice(0, 19).replace('T', ' ')}</li>
                            <li>Versión: app {pendingRestore.preview.appVersion} · schema v{pendingRestore.preview.schemaVersion}</li>
                            <li>Registros totales: {pendingRestore.preview.totalRecords}</li>
                            <li>Asientos: {pendingRestore.preview.entriesCount} · Cuentas: {pendingRestore.preview.accountsCount}</li>
                            <li>Empresas: {pendingRestore.preview.companies?.join(', ') || '—'}</li>
                            <li>Ejercicios: {pendingRestore.preview.exercises?.join(', ') || '—'}</li>
                        </ul>
                        <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: 12 }}>
                            ⚠ La restauración reemplaza TODOS los datos actuales por los del archivo.
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-danger" onClick={handleConfirmRestore} disabled={busy}>
                                {busy ? 'Restaurando…' : 'Restaurar ahora'}
                            </button>
                            <button className="btn btn-secondary" onClick={() => setPendingRestore(null)} disabled={busy}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {message && (
                <div className="card" style={{ padding: 14, whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{message}</div>
            )}
        </div>
    )
}
