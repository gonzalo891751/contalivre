/**
 * Registro versionado de índices de inflación — Fase 2B (§10.2).
 *
 * Cada conjunto de índices tiene proveniencia completa (fuente, URL, fecha
 * de importación, hash, actor, estado). Los índices de EJEMPLO jamás se
 * mezclan con OFICIALES: el consumidor elige un set explícito y el estado
 * del set acompaña a todo cálculo que lo use.
 */

import { db, generateId } from '../../storage/db'
import { LOCAL_ACTOR } from '../domain/types'
import type { InflationIndexSet, InflationIndexValue, IndexSetStatus } from './types'

/** Hash simple y determinista del contenido (djb2) para detectar alteraciones */
export function hashIndexValues(values: InflationIndexValue[]): string {
    const canonical = [...values]
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(v => `${v.period}=${v.value}`)
        .join('|')
    let hash = 5381
    for (let i = 0; i < canonical.length; i++) {
        hash = ((hash << 5) + hash + canonical.charCodeAt(i)) | 0
    }
    return `djb2:${(hash >>> 0).toString(16)}`
}

export interface SaveIndexSetInput {
    name: string
    status: IndexSetStatus
    source: string
    sourceUrl?: string
    values: InflationIndexValue[]
    actorId?: string
}

export async function saveIndexSet(input: SaveIndexSetInput): Promise<InflationIndexSet> {
    const isValidPeriod = (p: string) => {
        if (!/^\d{4}-\d{2}$/.test(p)) return false
        const month = Number(p.slice(5, 7))
        return month >= 1 && month <= 12
    }
    const invalid = input.values.filter(v =>
        !isValidPeriod(v.period) || typeof v.value !== 'number' || !Number.isFinite(v.value) || v.value <= 0)
    if (invalid.length > 0) {
        throw new Error(`Índices inválidos: ${invalid.map(v => `${v.period}=${v.value}`).join(', ')}`)
    }
    const now = new Date().toISOString()
    const prior = await db.inflationIndexSets.where('status').equals(input.status).toArray()
    const set: InflationIndexSet = {
        id: generateId(),
        name: input.name,
        status: input.status,
        source: input.source,
        sourceUrl: input.sourceUrl,
        importedAt: now,
        contentHash: hashIndexValues(input.values),
        actorId: input.actorId ?? LOCAL_ACTOR,
        version: prior.length + 1,
        values: [...input.values].sort((a, b) => a.period.localeCompare(b.period)),
        createdAt: now,
    }
    await db.inflationIndexSets.add(set)
    return set
}

export async function listIndexSets(): Promise<InflationIndexSet[]> {
    const sets = await db.inflationIndexSets.toArray()
    return sets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getIndexSet(id: string): Promise<InflationIndexSet | undefined> {
    return db.inflationIndexSets.get(id)
}

/** Mapa período → valor de un set (verificando integridad del hash) */
export function indexSetToMap(set: InflationIndexSet): Map<string, number> {
    if (hashIndexValues(set.values) !== set.contentHash) {
        throw new Error(`El conjunto de índices "${set.name}" fue alterado: el hash no coincide. Reimportalo desde la fuente.`)
    }
    return new Map(set.values.map(v => [v.period, v.value]))
}
