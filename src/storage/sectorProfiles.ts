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
import { DEFAULT_COMPANY_ID, SYSTEM_META_ID } from '../accounting/migration/migrateV17'
import { SECTOR_CATALOG } from '../core/sectorProfiles/catalog'
import type { ActivityProfile } from '../core/sectorProfiles/types'
import type { SectorAccountDefinition } from '../core/sectorProfiles/types'
import type { Account } from '../core/models'

const PROFILE_SETTINGS_ID = 'sector-profiles'

interface SectorProfileSettings {
    id: string
    /**
     * Campo HISTÓRICO: perfiles globales de la primera versión de la Fase 2H.
     * Se conserva para no perder datos y se migra a `byCompany` la primera vez
     * que se lee. No se escribe más.
     */
    active?: ActivityProfile[]
    /** Perfiles por empresa (Fase 2H, cierre del PR #28). */
    byCompany?: Record<string, ActivityProfile[]>
    updatedAt: string
}

/**
 * Empresa cuyo perfil corresponde leer o escribir.
 *
 * Se toma de `systemMeta.currentCompanyId` y, si no está definida, de la empresa
 * por defecto. Nunca se asume una empresa fija: el perfil sectorial pertenece a
 * la entidad, no a la instalación.
 */
export async function resolveCompanyId(companyId?: string): Promise<string> {
    if (companyId) return companyId
    const meta = await db.systemMeta.get(SYSTEM_META_ID)
    return meta?.currentCompanyId ?? DEFAULT_COMPANY_ID
}

async function readSettings(): Promise<SectorProfileSettings | undefined> {
    return (await db.settings.get(PROFILE_SETTINGS_ID)) as SectorProfileSettings | undefined
}

/**
 * Perfiles de una empresa, contemplando el valor global histórico.
 *
 * Migración lógica, no destructiva y sin filtraciones:
 *
 *  - si ya existe `byCompany`, esa es la única fuente: el campo global se ignora
 *    (por eso desactivar un perfil no se "deshace" en la lectura siguiente);
 *  - si todavía no existe, el arreglo global se atribuye ÚNICAMENTE a la empresa
 *    por defecto, que es la que lo generó cuando la instalación era de una sola
 *    empresa. Cualquier otra empresa arranca con el núcleo comercial.
 *
 * El campo `active` nunca se borra: queda como respaldo del valor anterior.
 */
function profilesOf(row: SectorProfileSettings | undefined, companyId: string): ActivityProfile[] {
    if (row?.byCompany) return row.byCompany[companyId] ?? []
    if (Array.isArray(row?.active) && companyId === DEFAULT_COMPANY_ID) return row.active
    return []
}

/**
 * Perfiles activos de una empresa. COMMERCIAL (el núcleo) siempre está presente.
 * Sin `companyId` se usa la empresa corriente.
 */
export async function getActiveProfiles(companyId?: string): Promise<ActivityProfile[]> {
    const cid = await resolveCompanyId(companyId)
    const stored = profilesOf(await readSettings(), cid)
    return stored.includes('COMMERCIAL') ? stored : ['COMMERCIAL', ...stored]
}

async function setActiveProfiles(profiles: ActivityProfile[], companyId: string): Promise<void> {
    const row = await readSettings()
    // Al escribir por primera vez se materializa el mapa, conservando lo que la
    // empresa por defecto tenía en el campo global.
    const byCompany: Record<string, ActivityProfile[]> = row?.byCompany
        ? { ...row.byCompany }
        : (Array.isArray(row?.active) && row.active.length > 0
            ? { [DEFAULT_COMPANY_ID]: row.active }
            : {})
    byCompany[companyId] = [...new Set<ActivityProfile>(['COMMERCIAL', ...profiles])]

    await db.settings.put({
        ...(row ?? {}),
        id: PROFILE_SETTINGS_ID,
        byCompany,
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
    companyId: string
    created: string[]
    alreadyPresent: string[]
}

/**
 * Activa un perfil PARA UNA EMPRESA, incorporando al plan las cuentas que falten.
 *
 * La resolución del padre es por CÓDIGO, contra el plan real: si el usuario ya
 * tiene una cuenta con ese código (propia o del núcleo) se reutiliza y no se
 * crea una segunda.
 *
 * El plan de cuentas es compartido por la instalación; lo que pertenece a cada
 * empresa es el PERFIL. Por eso, si otra empresa ya incorporó las cuentas del
 * sector, acá se reutilizan en vez de duplicarlas.
 */
export async function activateSectorProfile(
    profile: ActivityProfile,
    companyId?: string
): Promise<ActivationResult> {
    const cid = await resolveCompanyId(companyId)
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

    await setActiveProfiles([...(await getActiveProfiles(cid)), profile], cid)
    return { profile, companyId: cid, created, alreadyPresent }
}

/**
 * Desactiva un perfil. NO borra cuentas: sólo deja de declararlo activo, de modo
 * que la exposición vuelve al vocabulario que corresponda y las cuentas
 * sectoriales sin movimientos dejan de ofrecerse para nuevas imputaciones.
 */
export async function deactivateSectorProfile(
    profile: ActivityProfile,
    companyId?: string
): Promise<void> {
    if (profile === 'COMMERCIAL') return
    const cid = await resolveCompanyId(companyId)
    const active = await getActiveProfiles(cid)
    await setActiveProfiles(active.filter(p => p !== profile), cid)
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
