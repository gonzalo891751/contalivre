/**
 * Respaldo y restauración integral — Fase 2A (DAT-001)
 *
 * Exporta TODAS las tablas de IndexedDB más las claves relevantes de
 * localStorage en un único archivo JSON con versión, checksums y metadata.
 * La restauración valida el archivo completo antes de tocar la base, genera
 * un respaldo automático previo y aplica todo en una transacción Dexie:
 * si algo falla, Dexie revierte (rollback) y la base queda como estaba.
 */

import { db } from '../../storage/db'
import { APP_VERSION, CURRENT_SCHEMA_VERSION as SCHEMA_VERSION } from '../migration/versions'
import { getSystemMeta } from '../application/contextService'
import { appendAuditEvent } from '../audit/auditLog'
import { LOCAL_ACTOR } from '../domain/types'

export const BACKUP_FORMAT_VERSION = 1

/** Claves de localStorage que forman parte del estado de la aplicación */
const LOCALSTORAGE_KEYS_PREFIXES = [
    'contalivre_',        // período seleccionado y preferencias
    'esp_comparative_',   // comparativos importados
    'er_comparative_',
    'notas_',
]

export interface BackupFile {
    format: 'contalivre-backup'
    formatVersion: number
    appVersion: string
    schemaVersion: number
    installationId: string
    createdAt: string
    tables: Record<string, unknown[]>
    localStorage: Record<string, string>
    checksums: {
        tableCounts: Record<string, number>
        totalRecords: number
    }
}

export interface BackupPreview {
    valid: boolean
    errors: string[]
    appVersion?: string
    schemaVersion?: number
    createdAt?: string
    tableCounts?: Record<string, number>
    totalRecords?: number
    entriesCount?: number
    accountsCount?: number
    companies?: string[]
    exercises?: string[]
}

function collectLocalStorage(): Record<string, string> {
    const result: Record<string, string> = {}
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key) continue
            if (LOCALSTORAGE_KEYS_PREFIXES.some(p => key.startsWith(p))) {
                const value = localStorage.getItem(key)
                if (value !== null) result[key] = value
            }
        }
    } catch {
        // localStorage puede no estar disponible (tests)
    }
    return result
}

/** Exporta el estado completo a un objeto serializable */
export async function exportBackup(): Promise<BackupFile> {
    const meta = await getSystemMeta()
    const tables: Record<string, unknown[]> = {}
    const tableCounts: Record<string, number> = {}
    let totalRecords = 0

    for (const table of db.tables) {
        const rows = await table.toArray()
        tables[table.name] = rows
        tableCounts[table.name] = rows.length
        totalRecords += rows.length
    }

    const backup: BackupFile = {
        format: 'contalivre-backup',
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: APP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        installationId: meta.installationId,
        createdAt: new Date().toISOString(),
        tables,
        localStorage: collectLocalStorage(),
        checksums: { tableCounts, totalRecords },
    }

    await db.systemMeta.update(meta.id, { lastBackupAt: backup.createdAt })
    await appendAuditEvent({
        eventType: 'BACKUP_CREATED',
        entityType: 'database',
        entityId: 'backup',
        actorId: LOCAL_ACTOR,
        metadata: { totalRecords, tableCount: Object.keys(tables).length },
    })

    return backup
}

/** Valida un archivo de respaldo sin modificar nada y arma la vista previa */
export function previewBackup(raw: unknown): BackupPreview {
    const errors: string[] = []
    const data = raw as Partial<BackupFile>

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['El archivo no contiene un objeto JSON válido'] }
    }
    if (data.format !== 'contalivre-backup') {
        errors.push('El archivo no es un respaldo de ContaLivre (campo "format" inválido)')
    }
    if (typeof data.formatVersion !== 'number' || data.formatVersion > BACKUP_FORMAT_VERSION) {
        errors.push(`Versión de formato no soportada: ${data.formatVersion} (soportada: ≤ ${BACKUP_FORMAT_VERSION})`)
    }
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
        errors.push(`El respaldo proviene de un schema más nuevo (${data.schemaVersion}) que esta aplicación (${SCHEMA_VERSION}). Actualizá la aplicación antes de restaurar.`)
    }
    if (!data.tables || typeof data.tables !== 'object') {
        errors.push('El respaldo no contiene tablas')
    } else {
        // Verificar checksums de conteo
        const counts = data.checksums?.tableCounts ?? {}
        for (const [name, rows] of Object.entries(data.tables)) {
            if (!Array.isArray(rows)) {
                errors.push(`La tabla "${name}" del respaldo no es una lista de registros`)
                continue
            }
            const declared = counts[name]
            if (typeof declared === 'number' && declared !== rows.length) {
                errors.push(`La tabla "${name}" declara ${declared} registros pero contiene ${rows.length}: archivo corrupto o modificado`)
            }
        }
    }

    if (errors.length > 0) return { valid: false, errors }

    const tables = data.tables as Record<string, unknown[]>
    const companies = ((tables.companies ?? []) as Array<{ legalName?: string }>).map(c => c.legalName ?? '(sin nombre)')
    const exercises = ((tables.exercises ?? []) as Array<{ name?: string }>).map(e => e.name ?? '(sin nombre)')

    return {
        valid: true,
        errors: [],
        appVersion: data.appVersion,
        schemaVersion: data.schemaVersion,
        createdAt: data.createdAt,
        tableCounts: data.checksums?.tableCounts,
        totalRecords: data.checksums?.totalRecords,
        entriesCount: (tables.entries ?? []).length,
        accountsCount: (tables.accounts ?? []).length,
        companies,
        exercises,
    }
}

export interface RestoreResult {
    restoredTables: number
    restoredRecords: number
    perTable: Record<string, number>
    preRestoreBackup: BackupFile
}

/**
 * Restauración transaccional. Valida primero; si el archivo es inválido no
 * toca nada. Genera un respaldo previo automático (devuelto al llamador para
 * descarga). Aplica todo dentro de una transacción: ante cualquier fallo,
 * Dexie hace rollback y la base original queda intacta.
 */
export async function restoreBackup(raw: unknown): Promise<RestoreResult> {
    const preview = previewBackup(raw)
    if (!preview.valid) {
        throw new Error(`El respaldo no es válido:\n${preview.errors.join('\n')}`)
    }
    const data = raw as BackupFile

    // Respaldo automático previo (en memoria; la UI lo ofrece para descargar)
    const preRestoreBackup = await exportBackup()

    const knownTables = new Set(db.tables.map(t => t.name))
    const toRestore = Object.entries(data.tables).filter(([name]) => knownTables.has(name))

    const perTable: Record<string, number> = {}
    let restoredRecords = 0

    await db.transaction('rw', db.tables, async () => {
        for (const [name, rows] of toRestore) {
            const table = db.table(name)
            await table.clear()
            if (rows.length > 0) {
                await table.bulkAdd(rows as never[])
            }
            perTable[name] = rows.length
            restoredRecords += rows.length
        }
    })

    // Validación de integridad posterior
    for (const [name, expected] of Object.entries(perTable)) {
        const actual = await db.table(name).count()
        if (actual !== expected) {
            throw new Error(`Validación posterior fallida: la tabla "${name}" tiene ${actual} registros y se esperaban ${expected}`)
        }
    }

    // localStorage
    try {
        for (const [key, value] of Object.entries(data.localStorage ?? {})) {
            localStorage.setItem(key, value)
        }
    } catch {
        // no disponible en tests
    }

    await appendAuditEvent({
        eventType: 'RESTORE_EXECUTED',
        entityType: 'database',
        entityId: 'restore',
        actorId: LOCAL_ACTOR,
        metadata: {
            restoredRecords,
            restoredTables: toRestore.length,
            backupCreatedAt: data.createdAt,
        },
    })

    return {
        restoredTables: toRestore.length,
        restoredRecords,
        perTable,
        preRestoreBackup,
    }
}
