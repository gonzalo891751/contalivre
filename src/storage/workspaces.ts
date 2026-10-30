/**
 * Empresas de práctica (espacios de trabajo).
 *
 * Cada empresa vive en su PROPIA base IndexedDB. Así queda aislado todo lo
 * que la contabilidad guarda (plan de cuentas, asientos, inventario, sueldos,
 * préstamos, papeles de trabajo…) sin que cada módulo tenga que conocer la
 * empresa: la mayoría de las tablas no tiene dimensión de empresa y agregarla
 * módulo por módulo sería un refactor enorme y frágil.
 *
 * - El registro de empresas y la activa viven en localStorage (lectura
 *   síncrona: `db.ts` necesita el nombre de la base al importarse).
 * - La empresa "principal" usa la base histórica `EntrenadorContable`, de modo
 *   que una instalación existente conserva sus datos sin migrar nada.
 * - Algunas preferencias por empresa viven en localStorage (período elegido,
 *   comparativos importados, mapeos…). Al cambiar de empresa se guardan en
 *   una "foto" de la empresa saliente y se restaura la de la entrante.
 */

import Dexie from 'dexie'

export type EntityKind = 'CON_FINES_DE_LUCRO' | 'SIN_FINES_DE_LUCRO'
export type WorkspaceStart = 'VACIA' | 'EJEMPLO'

export interface Workspace {
    id: string
    name: string
    entityKind: EntityKind
    dbName: string
    createdAt: string
    /** cómo se inicializa la primera vez que se abre */
    start: WorkspaceStart
    /** se completa cuando el plan de cuentas (y el ejemplo) quedó cargado */
    initializedAt?: string
    description?: string
}

export const DEFAULT_DB_NAME = 'EntrenadorContable'
export const DEFAULT_WORKSPACE_ID = 'principal'

const REGISTRY_KEY = 'contalivre.workspaces.v1'
const ACTIVE_KEY = 'contalivre.workspaces.active'
const SNAPSHOT_PREFIX = 'contalivre.workspaces.snapshot.'

/** Claves de localStorage que pertenecen a la empresa (no al navegador) */
const SCOPED_PREFIXES = ['contalivre_', 'contalivre:', 'contalivre.', 'esp_comparative_', 'er_comparative_', 'notas_', 'inventario.']
/** Preferencias de interfaz y el propio registro: no cambian con la empresa */
const GLOBAL_PREFIXES = ['contalivre.workspaces', 'contalivre.sidebar', 'contalivre.ui.']

export function isWorkspaceGlobalKey(key: string): boolean {
    return GLOBAL_PREFIXES.some(p => key.startsWith(p))
}

function storage(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
        return null
    }
}

function defaultWorkspace(): Workspace {
    return {
        id: DEFAULT_WORKSPACE_ID,
        name: 'Empresa principal',
        entityKind: 'CON_FINES_DE_LUCRO',
        dbName: DEFAULT_DB_NAME,
        createdAt: new Date(0).toISOString(),
        start: 'VACIA',
        // la base histórica ya se inicializa con el flujo de siempre
        initializedAt: new Date(0).toISOString(),
    }
}

function readRegistry(): Workspace[] {
    const ls = storage()
    let list: Workspace[] = []
    try {
        const raw = ls?.getItem(REGISTRY_KEY)
        if (raw) list = JSON.parse(raw) as Workspace[]
    } catch {
        list = []
    }
    if (!Array.isArray(list)) list = []
    if (!list.some(w => w.id === DEFAULT_WORKSPACE_ID)) list.unshift(defaultWorkspace())
    return list
}

function writeRegistry(list: Workspace[]): void {
    storage()?.setItem(REGISTRY_KEY, JSON.stringify(list))
}

export function listWorkspaces(): Workspace[] {
    return readRegistry()
}

export function getActiveWorkspace(): Workspace {
    const list = readRegistry()
    const activeId = storage()?.getItem(ACTIVE_KEY) ?? DEFAULT_WORKSPACE_ID
    return list.find(w => w.id === activeId) ?? list.find(w => w.id === DEFAULT_WORKSPACE_ID)!
}

/** Nombre de la base IndexedDB de la empresa activa (lo usa db.ts al importarse) */
export function activeDbName(): string {
    return getActiveWorkspace().dbName
}

function slug(name: string): string {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'empresa'
}

export function createWorkspace(input: { name: string; entityKind: EntityKind; start: WorkspaceStart; description?: string }): Workspace {
    const name = input.name.trim()
    if (!name) throw new Error('La empresa necesita un nombre.')
    const list = readRegistry()
    if (list.some(w => w.name.toLowerCase() === name.toLowerCase())) {
        throw new Error(`Ya existe una empresa llamada "${name}".`)
    }
    const id = `${slug(name)}-${Date.now().toString(36)}`
    const ws: Workspace = {
        id,
        name,
        entityKind: input.entityKind,
        dbName: `${DEFAULT_DB_NAME}__${id}`,
        createdAt: new Date().toISOString(),
        start: input.start,
        description: input.description?.trim() || undefined,
    }
    writeRegistry([...list, ws])
    return ws
}

export function updateWorkspace(id: string, patch: Partial<Pick<Workspace, 'name' | 'description' | 'entityKind' | 'initializedAt'>>): Workspace {
    const list = readRegistry()
    const idx = list.findIndex(w => w.id === id)
    if (idx < 0) throw new Error('La empresa no existe.')
    if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (!name) throw new Error('La empresa necesita un nombre.')
        if (list.some(w => w.id !== id && w.name.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Ya existe una empresa llamada "${name}".`)
        }
        patch = { ...patch, name }
    }
    const updated = { ...list[idx], ...patch }
    list[idx] = updated
    writeRegistry(list)
    return updated
}

/** Borra la empresa y su base. No se puede borrar la empresa abierta. */
export async function deleteWorkspace(id: string): Promise<void> {
    if (id === getActiveWorkspace().id) throw new Error('No se puede eliminar la empresa que está abierta: cambiá a otra primero.')
    const list = readRegistry()
    const ws = list.find(w => w.id === id)
    if (!ws) return
    await Dexie.delete(ws.dbName)
    writeRegistry(list.filter(w => w.id !== id))
    storage()?.removeItem(SNAPSHOT_PREFIX + id)
}

function scopedKeys(ls: Storage): string[] {
    const keys: string[] = []
    for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i)
        if (k && SCOPED_PREFIXES.some(p => k.startsWith(p)) && !isWorkspaceGlobalKey(k)) keys.push(k)
    }
    return keys
}

/**
 * Deja activa otra empresa. Guarda las preferencias de la saliente, restaura
 * las de la entrante y devuelve la nueva activa. El llamador debe recargar la
 * aplicación: la base abierta se elige al iniciar.
 */
export function activateWorkspace(id: string): Workspace {
    const ls = storage()
    const list = readRegistry()
    const target = list.find(w => w.id === id)
    if (!target) throw new Error('La empresa no existe.')
    if (!ls) return target
    const current = getActiveWorkspace()
    if (current.id === target.id) return target

    const snapshot: Record<string, string> = {}
    for (const k of scopedKeys(ls)) {
        const v = ls.getItem(k)
        if (v !== null) snapshot[k] = v
    }
    ls.setItem(SNAPSHOT_PREFIX + current.id, JSON.stringify(snapshot))
    for (const k of Object.keys(snapshot)) ls.removeItem(k)

    try {
        const saved = JSON.parse(ls.getItem(SNAPSHOT_PREFIX + target.id) ?? '{}') as Record<string, string>
        for (const [k, v] of Object.entries(saved)) ls.setItem(k, v)
    } catch {
        // foto ilegible: la empresa arranca con preferencias por defecto
    }
    ls.removeItem(SNAPSHOT_PREFIX + target.id)
    ls.setItem(ACTIVE_KEY, target.id)
    return target
}

export const ENTITY_KIND_LABEL: Record<EntityKind, string> = {
    CON_FINES_DE_LUCRO: 'Con fines de lucro',
    SIN_FINES_DE_LUCRO: 'Sin fines de lucro',
}
