/**
 * useSectorProfiles — Fase 2H (§H2/§H4), por empresa desde el cierre del PR #28.
 *
 * Expone los perfiles sectoriales activos DE LA EMPRESA CORRIENTE y el
 * vocabulario de exposición que corresponde. La adaptación es de EXPOSICIÓN: el
 * modelo matemático que produce el ReportingBundle es el mismo para todas las
 * actividades; sólo cambian las denominaciones que ve el usuario (por ejemplo
 * "Recursos" en vez de "Ventas").
 *
 * La consulta depende de `systemMeta`, así que al cambiar de empresa Dexie
 * vuelve a emitir y la exposición se actualiza sola: una asociación civil no
 * puede "contagiarle" su vocabulario a una empresa comercial.
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { getActiveProfiles, resolveCompanyId } from '../storage/sectorProfiles'
import { vocabularyFor, type ActivityProfile, type ExposureVocabulary } from '../core/sectorProfiles/types'

export interface SectorProfilesState {
    active: ActivityProfile[]
    vocabulary: ExposureVocabulary
    isNonprofit: boolean
    companyId: string | null
}

export function useSectorProfiles(): SectorProfilesState {
    const state = useLiveQuery(async () => {
        // Se leen systemMeta y settings para que la consulta se invalide tanto al
        // cambiar de empresa como al activar o desactivar un perfil.
        await db.systemMeta.toArray()
        await db.settings.toArray()
        const companyId = await resolveCompanyId()
        return { companyId, active: await getActiveProfiles(companyId) }
    }, [])

    const active = state?.active ?? (['COMMERCIAL'] as ActivityProfile[])
    return {
        active,
        vocabulary: vocabularyFor(active),
        isNonprofit: active.includes('NONPROFIT'),
        companyId: state?.companyId ?? null,
    }
}
