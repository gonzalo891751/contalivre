/**
 * Perfiles sectoriales de actividad — Fase 2H (§H2).
 *
 * Arquitectura: UN plan de cuentas con un núcleo común y extensiones sectoriales
 * aditivas. No hay cinco planes inconexos ni cinco motores: las cuentas
 * sectoriales son cuentas normales del mismo plan, con los mismos metadatos, que
 * se incorporan cuando el perfil de la entidad lo requiere.
 *
 * Reglas de convivencia (§4):
 *  - activar un perfil sólo AGREGA cuentas que falten, por código;
 *  - desactivarlo NUNCA borra: las cuentas quedan y se ocultan de los listados
 *    de alta si no tienen movimientos;
 *  - las cuentas creadas por el usuario no se tocan jamás.
 */

import type {
    AccountKind,
    AccountSection,
    CostOfSalesComponent,
    CurrentClassification,
    EquityComponent,
    MonetaryClassification,
    NormalSide,
    ResultFunction,
    StatementGroup,
} from '../models'

/** Actividad de la entidad. COMMERCIAL es el núcleo que siempre está presente. */
export type ActivityProfile =
    | 'COMMERCIAL'
    | 'SERVICES'
    | 'INDUSTRIAL'
    | 'AGRICULTURAL'
    | 'NONPROFIT'

export const ACTIVITY_PROFILES: ActivityProfile[] = [
    'COMMERCIAL',
    'SERVICES',
    'INDUSTRIAL',
    'AGRICULTURAL',
    'NONPROFIT',
]

export const ACTIVITY_PROFILE_LABEL: Record<ActivityProfile, string> = {
    COMMERCIAL: 'Comercial',
    SERVICES: 'Servicios',
    INDUSTRIAL: 'Industrial o de producción',
    AGRICULTURAL: 'Agropecuaria',
    NONPROFIT: 'Entidad sin fines de lucro',
}

export const ACTIVITY_PROFILE_DESCRIPTION: Record<ActivityProfile, string> = {
    COMMERCIAL: 'Compra y reventa de mercaderías sin transformación.',
    SERVICES: 'Prestación de servicios: el costo se compone de mano de obra e insumos afectados.',
    INDUSTRIAL: 'Transformación de materias primas en productos terminados.',
    AGRICULTURAL: 'Producción agropecuaria con activos biológicos y productos agropecuarios.',
    NONPROFIT: 'Asociaciones civiles, clubes, fundaciones y mutuales: recursos y gastos en lugar de ventas y ganancias.',
}

/**
 * Definición de una cuenta sectorial. Es la misma forma que usa el seed del
 * núcleo, más los metadatos que el motor necesita para exponerla correctamente
 * en ESP, ER, EFE, notas y anexos.
 */
export interface SectorAccountDefinition {
    code: string
    name: string
    kind: AccountKind
    section: AccountSection
    group: string
    statementGroup: StatementGroup | null
    parentCode: string | null
    isHeader?: boolean
    isContra?: boolean
    normalSide?: NormalSide
    allowOppositeBalance?: boolean

    // ── Metadatos de exposición y análisis (§5) ──────────────
    currentClassification?: CurrentClassification
    monetaryClassification?: MonetaryClassification
    resultFunction?: ResultFunction
    cashFlowCategory?: 'OPERATING' | 'INVESTING' | 'FINANCING' | 'CASH_EQUIVALENT' | 'NOT_APPLICABLE'
    equityComponent?: EquityComponent
    /**
     * Componente del costo de ventas. Es lo que permite al motor aislar, por
     * ejemplo, una merma del CMV en lugar de mezclarla con el costo.
     */
    costComponent?: CostOfSalesComponent
    /** Nota a la que pertenece la cuenta. */
    notesGroup?: string
    /** Anexo al que pertenece la cuenta. */
    annexGroup?: string
    /** Perfil que aporta la cuenta. */
    profile: ActivityProfile
    /** Explicación pedagógica del concepto contable. */
    hint?: string
}

/**
 * Vocabulario de exposición por perfil (§6). La adaptación es de EXPOSICIÓN: el
 * modelo matemático subyacente es el mismo, sólo cambian las denominaciones que
 * ve el usuario. Una entidad sin fines de lucro no "vende" ni obtiene
 * "ganancias": obtiene recursos y arroja superávit o déficit.
 */
export interface ExposureVocabulary {
    incomeStatementTitle: string
    revenueLabel: string
    resultLabel: string
    positiveResultLabel: string
    negativeResultLabel: string
    ownersLabel: string
    equityTitle: string
}

const COMMERCIAL_VOCABULARY: ExposureVocabulary = {
    incomeStatementTitle: 'Estado de Resultados',
    revenueLabel: 'Ingresos por ventas',
    resultLabel: 'Resultado del ejercicio',
    positiveResultLabel: 'Ganancia del ejercicio',
    negativeResultLabel: 'Pérdida del ejercicio',
    ownersLabel: 'Propietarios',
    equityTitle: 'Estado de Evolución del Patrimonio Neto',
}

const NONPROFIT_VOCABULARY: ExposureVocabulary = {
    incomeStatementTitle: 'Estado de Recursos y Gastos',
    revenueLabel: 'Recursos',
    resultLabel: 'Superávit o déficit del ejercicio',
    positiveResultLabel: 'Superávit del ejercicio',
    negativeResultLabel: 'Déficit del ejercicio',
    ownersLabel: 'Asociados',
    equityTitle: 'Estado de Evolución del Patrimonio Neto',
}

export const EXPOSURE_VOCABULARY: Record<ActivityProfile, ExposureVocabulary> = {
    COMMERCIAL: COMMERCIAL_VOCABULARY,
    SERVICES: COMMERCIAL_VOCABULARY,
    INDUSTRIAL: COMMERCIAL_VOCABULARY,
    AGRICULTURAL: COMMERCIAL_VOCABULARY,
    NONPROFIT: NONPROFIT_VOCABULARY,
}

/**
 * Perfil que gobierna la exposición cuando hay varios activos. Sin fines de
 * lucro manda sobre el resto: una entidad no puede exponer "ventas" y
 * "recursos" a la vez.
 */
export function resolveExposureProfile(active: ActivityProfile[]): ActivityProfile {
    if (active.includes('NONPROFIT')) return 'NONPROFIT'
    if (active.includes('AGRICULTURAL')) return 'AGRICULTURAL'
    if (active.includes('INDUSTRIAL')) return 'INDUSTRIAL'
    if (active.includes('SERVICES')) return 'SERVICES'
    return 'COMMERCIAL'
}

export function vocabularyFor(active: ActivityProfile[]): ExposureVocabulary {
    return EXPOSURE_VOCABULARY[resolveExposureProfile(active)]
}
