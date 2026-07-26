/**
 * Activación de perfiles sectoriales — Fase 2H (§H2).
 *
 * Migración de datos por incorporación, NO por reemplazo. Sin cambio de esquema:
 * las cuentas sectoriales son filas normales de `accounts` y el perfil activo se
 * guarda como un campo del perfil de empresa ya existente, así que no hace falta
 * elevar la versión de Dexie (sigue en 22).
 *
 * Garantías (§1.6 y §4):
 *  - determinística: el mismo perfil produce siempre las mismas cuentas;
 *  - idempotente: activar dos veces no duplica nada (se resuelve por `code`);
 *  - compatible: no toca cuentas preexistentes ni las creadas por el usuario;
 *  - segura: desactivar NUNCA borra. Las cuentas quedan en el plan; si no
 *    tienen movimientos simplemente dejan de ofrecerse para imputar.
 */

import { db, generateId } from './db'
import { SECTOR_CATALOG } from '../core/sectorProfiles/catalog'
import type { ActivityProfile } from '../core/sectorProfiles/types'
import type { SectorAccountDefinition } from '../core/sectorProfiles/types'
import type { Account } from '../core/models'

const PROFILE_SETTINGS_ID = 'sector-profiles'

interface SectorProfileSettings {
    id: string
    active: ActivityProfile[]
    updatedAt: string
}

/** Perfiles activos. COMMERCIAL (el núcleo) siempre está presente. */
export async function getActiveProfiles(): Promise<ActivityProfile[]> {
    const row = (await db.settings.get(PROFILE_SETTINGS_ID)) as SectorProfileSettings | undefined
    const stored = Array.isArray(row?.active) ? row.active : []
    return stored.includes('COMMERCIAL') ? stored : ['COMMERCIAL', ...stored]
}

async function setActiveProfiles(profiles: ActivityProfile[]): Promise<void> {
    const unique = [...new Set<ActivityProfile>(['COMMERCIAL', ...profiles])]
    await db.settings.put({
        id: PROFILE_SETTINGS_ID,
        active: unique,
        updatedAt: new Date().toISOString(),
    } as never)
}

function toAccount(definition: SectorAccountDefinition, parentId: string | null): Account {
    const defaultNormalSide = ['ASSET', 'EXPENSE'].includes(definition.kind) ? 'DEBIT' : 'CREDIT'
    return {
        id: generateId(),
        code: definition.code,
        name: definition.name,
        kind: definition.kind,
        section: definition.section,
        group: definition.group,
        statementGroup: definition.statementGroup,
        parentId,
        level: definition.code.split('.').length - 1,
        normalSide: definition.normalSide ?? defaultNormalSide,
        isContra: definition.isContra ?? false,
        isHeader: definition.isHeader ?? false,
        allowOppositeBalance: definition.allowOppositeBalance ?? false,
        // Metadatos de exposición: sin ellos la cuenta no llegaría a los estados.
        currentClassification: definition.currentClassification,
        monetaryClassification: definition.monetaryClassification,
        resultFunction: definition.resultFunction,
        cashFlowCategory: definition.cashFlowCategory,
        equityComponent: definition.equityComponent,
        costComponent: definition.costComponent,
        notesGroup: definition.notesGroup,
        annexGroup: definition.annexGroup,
        isPostable: !(definition.isHeader ?? false),
        active: true,
        // Cuenta aportada por un perfil sectorial: el sistema la reconoce como
        // propia y no debe eliminarse al cambiar de perfil.
        systemAccount: true,
        sectorProfile: definition.profile,
        tags: [`sector:${definition.profile}`],
    }
}

export interface ActivationResult {
    profile: ActivityProfile
    created: string[]
    alreadyPresent: string[]
}

/**
 * Activa un perfil incorporando al plan las cuentas que falten.
 *
 * La resolución del padre es por CÓDIGO, contra el plan real: si el usuario ya
 * tiene una cuenta con ese código (propia o del núcleo) se reutiliza y no se
 * crea una segunda.
 */
export async function activateSectorProfile(profile: ActivityProfile): Promise<ActivationResult> {
    const definitions = SECTOR_CATALOG[profile] ?? []
    const created: string[] = []
    const alreadyPresent: string[] = []

    // Orden por longitud de código: los padres se crean antes que los hijos.
    const ordered = [...definitions].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))

    for (const definition of ordered) {
        const existing = await db.accounts.where('code').equals(definition.code).first()
        if (existing) {
            alreadyPresent.push(definition.code)
            continue
        }

        const parent = definition.parentCode
            ? await db.accounts.where('code').equals(definition.parentCode).first()
            : undefined

        // Si falta el padre esperado se deja la cuenta colgada de la raíz antes
        // que perder la cuenta: el plan del usuario manda sobre el catálogo.
        await db.accounts.add(toAccount(definition, parent?.id ?? null))
        created.push(definition.code)
    }

    await setActiveProfiles([...(await getActiveProfiles()), profile])
    return { profile, created, alreadyPresent }
}

/**
 * Desactiva un perfil. NO borra cuentas: sólo deja de declararlo activo, de modo
 * que la exposición vuelve al vocabulario que corresponda y las cuentas
 * sectoriales sin movimientos dejan de ofrecerse para nuevas imputaciones.
 */
export async function deactivateSectorProfile(profile: ActivityProfile): Promise<void> {
    if (profile === 'COMMERCIAL') return
    const active = await getActiveProfiles()
    await setActiveProfiles(active.filter(p => p !== profile))
}

/**
 * Cuentas del plan aportadas por un perfil sectorial que todavía no registran
 * movimientos. Sirve para explicarle al usuario qué se puede ocultar sin
 * perder información contable.
 */
export async function listSectorAccounts(profile: ActivityProfile): Promise<Account[]> {
    const codes = new Set((SECTOR_CATALOG[profile] ?? []).map(d => d.code))
    const accounts = await db.accounts.toArray()
    return accounts.filter(a => codes.has(a.code))
}
