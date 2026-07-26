/**
 * useSectorProfiles — Fase 2H (§H2/§H4).
 *
 * Expone los perfiles sectoriales activos y el vocabulario de exposición que
 * corresponde. La adaptación es de EXPOSICIÓN: el modelo matemático que produce
 * el ReportingBundle es el mismo para todas las actividades; sólo cambian las
 * denominaciones que ve el usuario (por ejemplo "Recursos" en vez de "Ventas").
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { getActiveProfiles } from '../storage/sectorProfiles'
import { vocabularyFor, type ActivityProfile, type ExposureVocabulary } from '../core/sectorProfiles/types'

export interface SectorProfilesState {
    active: ActivityProfile[]
    vocabulary: ExposureVocabulary
    isNonprofit: boolean
}

export function useSectorProfiles(): SectorProfilesState {
    const active = useLiveQuery(() => getActiveProfiles(), [], ['COMMERCIAL'] as ActivityProfile[])
    const resolved = active ?? (['COMMERCIAL'] as ActivityProfile[])
    return {
        active: resolved,
        vocabulary: vocabularyFor(resolved),
        isNonprofit: resolved.includes('NONPROFIT'),
    }
}
