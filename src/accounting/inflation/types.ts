/**
 * Ajuste por inflación — tipos de dominio (Fase 2B).
 *
 * Registro versionado de índices (NOR-004): cada conjunto de índices tiene
 * proveniencia completa y estado. Los índices de ejemplo jamás se mezclan
 * con oficiales; sin índice requerido no se calcula ni contabiliza.
 */

export type IndexSetStatus = 'OFFICIAL' | 'MANUAL' | 'EXAMPLE'

export interface InflationIndexValue {
    /** Período YYYY-MM */
    period: string
    /** Valor exacto según la fuente (sin redondeo propio) */
    value: number
}

export interface InflationIndexSet {
    id: string
    name: string
    /** oficial (FACPCE), manual (cargado por el usuario), ejemplo (didáctico) */
    status: IndexSetStatus
    source: string          // ej: 'FACPCE — indices-facpce', 'carga manual'
    sourceUrl?: string
    /** fecha de descarga/importación (ISO) */
    importedAt: string
    /** hash simple del contenido para detectar alteraciones */
    contentHash: string
    actorId: string
    version: number
    values: InflationIndexValue[]
    createdAt: string
}

/** Resultado de reexpresión de una partida con anticuación */
export interface ReexpressedItem {
    accountId: string
    /** período de origen YYYY-MM */
    originPeriod: string
    /** importe histórico (moneda de origen) */
    historicAmount: number
    /** coeficiente idxCierre / idxOrigen */
    coefficient: number
    /** importe en moneda de cierre */
    restatedAmount: number
    /** ajuste = restated − historic */
    adjustment: number
}

export interface RecpamComputation {
    method: 'INDIRECT' | 'DIRECT'
    /** RECPAM en moneda de cierre (positivo = ganancia) */
    recpam: number
    detail: RecpamDetailRow[]
    warnings: string[]
    /** períodos YYYY-MM sin índice: bloquea contabilización */
    missingPeriods: string[]
}

export interface RecpamDetailRow {
    period: string
    /** posición monetaria neta al inicio del mes (moneda del mes anterior) */
    openingMonetaryPosition?: number
    /** componente del cálculo en moneda de cierre */
    amountAtClose: number
    description: string
}
