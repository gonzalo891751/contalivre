/**
 * VersionInfoPanel — Fase 2D (§4): identificación de versión reutilizable.
 * Extraído de AcercaDe para Configuración → Acerca.
 */

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../../storage/db'
import { getSystemMeta } from '../../../accounting/application/contextService'
import { ACCOUNTING_ENGINE_VERSION, APP_VERSION, CURRENT_SCHEMA_VERSION as SCHEMA_VERSION, NORMATIVE_BASELINE } from '../../../accounting/migration/versions'
import type { SystemMeta } from '../../../accounting/domain/types'

const COMMIT_SHA: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_COMMIT_SHA) || 'desconocido'
const BUILD_DATE: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_BUILD_DATE) || 'desconocida'

export function VersionInfoPanel() {
    const [meta, setMeta] = useState<SystemMeta | null>(null)
    const entriesCount = useLiveQuery(() => db.entries.count())
    const accountsCount = useLiveQuery(() => db.accounts.count())

    useEffect(() => { getSystemMeta().then(setMeta).catch(() => setMeta(null)) }, [])

    const cell = { paddingRight: 24, color: 'var(--text-muted)' } as const
    return (
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Versión</h2>
            <table style={{ fontSize: '0.9rem', lineHeight: 1.9 }}>
                <tbody>
                    <tr><td style={cell}>Aplicación</td><td>ContaLivre {APP_VERSION}</td></tr>
                    <tr><td style={cell}>Modo</td><td>Laboratorio educativo local (los datos viven en este navegador)</td></tr>
                    <tr><td style={cell}>Schema Dexie</td><td>v{SCHEMA_VERSION}</td></tr>
                    <tr><td style={cell}>Motor contable</td><td>{ACCOUNTING_ENGINE_VERSION}</td></tr>
                    <tr><td style={cell}>Marco normativo</td><td>{NORMATIVE_BASELINE}</td></tr>
                    <tr><td style={cell}>Commit</td><td style={{ fontFamily: 'monospace' }}>{COMMIT_SHA}</td></tr>
                    <tr><td style={cell}>Compilación</td><td>{BUILD_DATE}</td></tr>
                    <tr><td style={cell}>Instalación</td><td style={{ fontFamily: 'monospace' }}>{meta?.installationId ?? '…'}</td></tr>
                    <tr><td style={cell}>Última migración</td><td>{meta?.lastMigrationId ?? '—'} {meta?.lastMigrationAt ? `(${meta.lastMigrationAt.slice(0, 10)})` : ''}</td></tr>
                    <tr><td style={cell}>Último respaldo</td><td>{meta?.lastBackupAt ? meta.lastBackupAt.slice(0, 19).replace('T', ' ') : 'Nunca'}</td></tr>
                    <tr><td style={cell}>Datos actuales</td><td>{accountsCount ?? '…'} cuentas · {entriesCount ?? '…'} asientos</td></tr>
                </tbody>
            </table>
        </div>
    )
}
