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

/**
 * Discriminador de contenido — Fase 2C.
 *
 * Cuando un generador crea VARIOS asientos para una misma operación
 * (mismo sourceId), cada uno tiene un hecho contable distinto: se
 * distinguen por sus líneas. Este hash del contenido (cuentas + importes,
 * en orden estable) actúa como accountingEventType por defecto, de modo que:
 * - reintentar el MISMO asiento ⇒ misma clave ⇒ no duplica;
 * - dos asientos económicamente distintos de la misma operación ⇒ claves
 *   distintas ⇒ NO se fusionan.
 * No usar una clave demasiado amplia (solo sourceId) que fusionaría asientos
 * legítimos; no usar una aleatoria que impediría detectar reintentos.
 */
export function contentDiscriminator(
    lines: Array<{ accountId: string; debit: number; credit: number }>
): string {
    const canonical = [...lines]
        .map(l => `${l.accountId}:${Math.round((l.debit || 0) * 100)}:${Math.round((l.credit || 0) * 100)}`)
        .sort()
        .join('|')
    let hash = 5381
    for (let i = 0; i < canonical.length; i++) hash = ((hash << 5) + hash + canonical.charCodeAt(i)) | 0
    return `c${(hash >>> 0).toString(16)}`
}
