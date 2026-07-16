/**
 * Claves de idempotencia — Fase 2A
 *
 * Toda operación automática debe construir una clave estable que identifique
 * el hecho contable de origen. Una operación repetida con la misma clave no
 * genera un segundo asiento: el servicio devuelve el existente.
 */

export interface IdempotencyKeyParts {
    companyId: string
    sourceModule: string
    sourceType: string
    sourceId: string
    /** Tipo de hecho contable dentro de la operación (ej: 'acquisition', 'depreciation-2026-03') */
    accountingEventType?: string
}

/**
 * Construye la clave canónica:
 * companyId + sourceModule + sourceType + sourceId + accountingEventType
 */
export function buildIdempotencyKey(parts: IdempotencyKeyParts): string {
    const segments = [
        parts.companyId,
        parts.sourceModule,
        parts.sourceType,
        parts.sourceId,
        parts.accountingEventType ?? 'default',
    ]
    // '|' no aparece en IDs generados por la app; escape defensivo por si acaso
    return segments.map(s => String(s).replace(/\|/g, '¦')).join('|')
}
