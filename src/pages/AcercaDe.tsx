/**
 * Acerca de ContaLivre — Fase 2A
 *
 * Identificación de versión (§2.4) y respaldo/restauración integral (§2.1/2.2).
 * Modo de funcionamiento: laboratorio educativo local. No promete seguridad
 * multiusuario ni roles.
 */

import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { getSystemMeta } from '../accounting/application/contextService'
import {
    exportBackup,
    previewBackup,
    restoreBackup,
    type BackupPreview,
} from '../accounting/backup/backupService'
import { ACCOUNTING_ENGINE_VERSION, APP_VERSION, CURRENT_SCHEMA_VERSION as SCHEMA_VERSION, NORMATIVE_BASELINE } from '../accounting/migration/versions'
import { CAPABILITIES } from '../accounting/capabilities'
import type { SystemMeta } from '../accounting/domain/types'

const COMMIT_SHA: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_COMMIT_SHA) || 'desconocido'
const BUILD_DATE: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_BUILD_DATE) || 'desconocida'

function downloadJson(data: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

export default function AcercaDe() {
    const [meta, setMeta] = useState<SystemMeta | null>(null)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [pendingRestore, setPendingRestore] = useState<{ raw: unknown; preview: BackupPreview } | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const entriesCount = useLiveQuery(() => db.entries.count())
    const accountsCount = useLiveQuery(() => db.accounts.count())

    useEffect(() => {
        getSystemMeta().then(setMeta).catch(() => setMeta(null))
    }, [])

    const handleExport = async () => {
        setBusy(true)
        setMessage(null)
        try {
            const backup = await exportBackup()
            const date = backup.createdAt.slice(0, 10)
            downloadJson(backup, `contalivre-respaldo-${date}.json`)
            setMessage(`Respaldo generado: ${backup.checksums.totalRecords} registros en ${Object.keys(backup.tables).length} tablas.`)
        } catch (error) {
            setMessage(`Error al generar el respaldo: ${error instanceof Error ? error.message : error}`)
        } finally {
            setBusy(false)
        }
    }

    const handleFileSelected = async (file: File) => {
        setBusy(true)
        setMessage(null)
        setPendingRestore(null)
        try {
            const text = await file.text()
            const raw = JSON.parse(text)
            const preview = previewBackup(raw)
            if (!preview.valid) {
                setMessage(`El archivo no es un respaldo válido:\n${preview.errors.join('\n')}`)
                return
            }
            setPendingRestore({ raw, preview })
        } catch (error) {
            setMessage(`No se pudo leer el archivo: ${error instanceof Error ? error.message : error}`)
        } finally {
            setBusy(false)
        }
    }

    const handleConfirmRestore = async () => {
        if (!pendingRestore) return
        setBusy(true)
        setMessage(null)
        try {
            const result = await restoreBackup(pendingRestore.raw)
            // Ofrecer el respaldo previo automático para descarga
            downloadJson(result.preRestoreBackup, `contalivre-pre-restauracion-${new Date().toISOString().slice(0, 10)}.json`)
            setMessage(`Restauración completada: ${result.restoredRecords} registros en ${result.restoredTables} tablas. Se descargó una copia de seguridad del estado anterior. Recargá la página para ver los datos.`)
            setPendingRestore(null)
        } catch (error) {
            setMessage(`La restauración falló y la base quedó como estaba: ${error instanceof Error ? error.message : error}`)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <header className="page-header">
                <h1 className="page-title">Acerca de ContaLivre</h1>
                <p className="page-subtitle">Versión, respaldo y restauración de datos</p>
            </header>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Versión</h2>
                <table style={{ fontSize: '0.9rem', lineHeight: 1.9 }}>
                    <tbody>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Aplicación</td><td>ContaLivre {APP_VERSION}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Modo</td><td>Laboratorio educativo local (los datos viven en este navegador)</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Schema Dexie</td><td>v{SCHEMA_VERSION}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Motor contable</td><td>{ACCOUNTING_ENGINE_VERSION}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Marco normativo</td><td>{NORMATIVE_BASELINE}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Commit</td><td style={{ fontFamily: 'monospace' }}>{COMMIT_SHA}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Compilación</td><td>{BUILD_DATE}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Instalación</td><td style={{ fontFamily: 'monospace' }}>{meta?.installationId ?? '…'}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Última migración</td><td>{meta?.lastMigrationId ?? '—'} {meta?.lastMigrationAt ? `(${meta.lastMigrationAt.slice(0, 10)})` : ''}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Último respaldo</td><td>{meta?.lastBackupAt ? meta.lastBackupAt.slice(0, 19).replace('T', ' ') : 'Nunca'}</td></tr>
                        <tr><td style={{ paddingRight: 24, color: 'var(--text-muted)' }}>Datos actuales</td><td>{accountsCount ?? '…'} cuentas · {entriesCount ?? '…'} asientos</td></tr>
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Respaldo integral</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Exporta todas las tablas de la base local (asientos, cuentas, operaciones,
                    ejercicios, auditoría) y la configuración en un único archivo JSON con
                    totales de control. Guardalo fuera del navegador: borrar los datos de
                    navegación elimina toda la información.
                </p>
                <button className="btn btn-primary" onClick={handleExport} disabled={busy}>
                    {busy ? 'Procesando…' : 'Descargar respaldo'}
                </button>
            </div>

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Restaurar respaldo</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Valida el archivo antes de tocar la base, genera una copia automática del
                    estado actual y aplica todo en una transacción: si algo falla, la base
                    queda como estaba.
                </p>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) void handleFileSelected(file)
                        e.target.value = ''
                    }}
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

            <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Alcance real (capacidades)</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Qué soporta esta versión y qué no. Lo no soportado no se simula.
                </p>
                <table style={{ fontSize: '0.82rem', lineHeight: 1.7, width: '100%' }}>
                    <tbody>
                        {CAPABILITIES.map(cap => (
                            <tr key={cap.id}>
                                <td style={{ paddingRight: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                                    <span style={{
                                        padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700,
                                        background: cap.status === 'SUPPORTED' ? 'rgba(34,197,94,0.12)'
                                            : cap.status === 'PARTIAL' ? 'rgba(234,179,8,0.12)'
                                            : cap.status === 'EDUCATIONAL_ONLY' ? 'rgba(59,130,246,0.12)'
                                            : 'rgba(148,163,184,0.18)',
                                        color: cap.status === 'SUPPORTED' ? '#15803d'
                                            : cap.status === 'PARTIAL' ? '#a16207'
                                            : cap.status === 'EDUCATIONAL_ONLY' ? '#1d4ed8'
                                            : '#64748b',
                                    }}>
                                        {cap.status === 'SUPPORTED' ? 'Soportado'
                                            : cap.status === 'PARTIAL' ? 'Parcial'
                                            : cap.status === 'EDUCATIONAL_ONLY' ? 'Solo educativo'
                                            : 'No soportado'}
                                    </span>
                                </td>
                                <td style={{ paddingRight: 12, fontWeight: 600, verticalAlign: 'top' }}>{cap.label}</td>
                                <td style={{ color: 'var(--text-muted)', verticalAlign: 'top' }}>{cap.detail}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {message && (
                <div className="card" style={{ padding: 14, whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
                    {message}
                </div>
            )}
        </div>
    )
}
