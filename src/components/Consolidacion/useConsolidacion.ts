/**
 * Estado de la pantalla de consolidación (Fase 2K §17).
 *
 * Toda la lógica contable vive en src/consolidation. Este hook sólo orquesta la
 * carga y el recálculo: no calcula importes ni decide eliminaciones.
 */

import { useCallback, useEffect, useState } from 'react'
import { listConsolidations, listGroups, listMembers } from '../../consolidation/repository'
import { runConsolidation, describePerimeter } from '../../consolidation/service'
import type { ConsolidationResult } from '../../consolidation/service'
import type {
    ConsolidationExercise,
    EconomicGroup,
    GroupMember,
} from '../../consolidation/domain/types'

export interface PerimeterRow {
    member: GroupMember
    companyName: string
    included: boolean
    reason: string | null
}

export interface ConsolidacionState {
    loading: boolean
    error: string | null
    groups: EconomicGroup[]
    group: EconomicGroup | null
    consolidations: ConsolidationExercise[]
    consolidation: ConsolidationExercise | null
    perimeter: PerimeterRow[]
    result: ConsolidationResult | null
    selectGroup: (groupId: string) => void
    selectConsolidation: (consolidationId: string) => void
    reload: () => Promise<void>
}

export function useConsolidacion(): ConsolidacionState {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [groups, setGroups] = useState<EconomicGroup[]>([])
    const [groupId, setGroupId] = useState<string | null>(null)
    const [consolidations, setConsolidations] = useState<ConsolidationExercise[]>([])
    const [consolidationId, setConsolidationId] = useState<string | null>(null)
    const [perimeter, setPerimeter] = useState<PerimeterRow[]>([])
    const [result, setResult] = useState<ConsolidationResult | null>(null)

    const loadGroups = useCallback(async () => {
        const all = await listGroups()
        setGroups(all)
        setGroupId(prev => prev && all.some(g => g.id === prev) ? prev : (all[0]?.id ?? null))
    }, [])

    const loadConsolidations = useCallback(async (gid: string) => {
        const all = await listConsolidations(gid)
        setConsolidations(all)
        setConsolidationId(prev => prev && all.some(c => c.id === prev) ? prev : (all[0]?.id ?? null))
    }, [])

    const reload = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            await loadGroups()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [loadGroups])

    useEffect(() => { void reload() }, [reload])

    useEffect(() => {
        if (!groupId) { setConsolidations([]); setConsolidationId(null); return }
        void loadConsolidations(groupId)
    }, [groupId, loadConsolidations])

    useEffect(() => {
        let cancelled = false
        if (!groupId || !consolidationId) { setResult(null); setPerimeter([]); return }
        const group = groups.find(g => g.id === groupId)
        const consolidation = consolidations.find(c => c.id === consolidationId)
        if (!group || !consolidation) return

        setLoading(true)
        setError(null)
        void (async () => {
            try {
                const [perimeterRows, consolidationResult] = await Promise.all([
                    describePerimeter(group.id, consolidation.reportingDate),
                    runConsolidation(consolidation.id, { withComparative: true }),
                ])
                if (cancelled) return
                setPerimeter(perimeterRows)
                setResult(consolidationResult)
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e))
                    setResult(null)
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [groupId, consolidationId, groups, consolidations])

    return {
        loading,
        error,
        groups,
        group: groups.find(g => g.id === groupId) ?? null,
        consolidations,
        consolidation: consolidations.find(c => c.id === consolidationId) ?? null,
        perimeter,
        result,
        selectGroup: setGroupId,
        selectConsolidation: setConsolidationId,
        reload,
    }
}

/** Miembros del grupo, para el diagrama de estructura */
export function useGroupMembers(groupId: string | null): GroupMember[] {
    const [members, setMembers] = useState<GroupMember[]>([])
    useEffect(() => {
        if (!groupId) { setMembers([]); return }
        void listMembers(groupId).then(setMembers)
    }, [groupId])
    return members
}
