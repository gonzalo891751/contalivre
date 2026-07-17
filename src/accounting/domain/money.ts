/**
 * Servicio monetario único — Fase 2A
 *
 * Estrategia adoptada (documentada en IMPLEMENTACION_FASE_2A_NUCLEO_CONTABLE.md):
 * los importes siguen siendo `number` en pesos con dos decimales, pero TODA
 * validación, redondeo y comparación pasa por este módulo. Migrar el storage
 * completo a enteros en centavos excede el alcance seguro de esta fase
 * (deuda registrada como bloqueante para Fase 2B); mientras tanto:
 *
 * - NaN, Infinity y -Infinity son SIEMPRE inválidos.
 * - El redondeo es half-up a 2 decimales, centralizado en roundMoney().
 * - La igualdad monetaria se decide en centavos (moneyEquals), sin tolerancia
 *   acumulativa: la diferencia admitida es estrictamente menor a medio centavo
 *   (el residuo de representación de punto flotante), no "un centavo por línea".
 */

export const MONEY_SCALE = 2
const CENT_FACTOR = 100

/**
 * Máximo importe contable admitido (política, por debajo del límite técnico
 * de centavos enteros seguros 2^53−1): ± 90 billones de pesos.
 */
export const MAX_AMOUNT = 90_000_000_000_000
export const MAX_AMOUNT_CENTS = MAX_AMOUNT * CENT_FACTOR

/**
 * Escalas por tipo de magnitud (ADR_MODELO_MONETARIO.md §4).
 * El importe contable se redondea UNA sola vez en la frontera de
 * contabilización; las demás magnitudes conservan su escala y solo se
 * redondean al producir un importe.
 */
export const SCALES = {
    /** Importe contable del Diario */
    amount: 2,
    /** Cantidades físicas, nominales, moneda extranjera */
    quantity: 6,
    /** Cotizaciones y precios unitarios */
    rate: 8,
    /** Tasas y porcentajes */
    percentage: 8,
    /** Índices: se conservan exactos según la fuente (sin redondeo propio) */
    index: null,
} as const

/** Verifica que un importe sea un número finito */
export function isFiniteAmount(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Valida un importe monetario. Devuelve un mensaje de error o null si es válido.
 * `allowNegative` habilita importes negativos (no permitido en líneas Debe/Haber).
 */
export function validateAmount(
    value: unknown,
    label: string,
    opts: { allowNegative?: boolean } = {}
): string | null {
    if (typeof value !== 'number') {
        return `${label}: el importe debe ser un número (recibido: ${typeof value})`
    }
    if (Number.isNaN(value)) {
        return `${label}: el importe es NaN (no es un número válido)`
    }
    if (!Number.isFinite(value)) {
        return `${label}: el importe es ${value > 0 ? 'Infinity' : '-Infinity'} (no finito)`
    }
    if (!opts.allowNegative && value < 0) {
        return `${label}: el importe no puede ser negativo (${value})`
    }
    if (Math.abs(value) > MAX_AMOUNT) {
        return `${label}: el importe excede el máximo admitido de $${MAX_AMOUNT.toLocaleString('es-AR')} (recibido: ${value})`
    }
    return null
}

// ─────────────────────────────────────────────────────────────
// Integridad de centavos y aritmética exacta (ADR Fase 2B)
// ─────────────────────────────────────────────────────────────

/**
 * ¿El double es exactamente la representación de sus centavos enteros?
 * (invariante de integridad de centavos del Diario)
 */
export function isCentExact(value: number): boolean {
    if (!Number.isFinite(value)) return false
    if (Object.is(value, -0)) return false
    const cents = toCents(value)
    if (!Number.isSafeInteger(cents)) return false
    return shift10(cents, -2) === value
}

/** Suma exacta de dos importes (en centavos) */
export function addAmounts(a: number, b: number): number {
    return shift10(toCents(a) + toCents(b), -2)
}

/** Resta exacta de dos importes (en centavos) */
export function subAmounts(a: number, b: number): number {
    return shift10(toCents(a) - toCents(b), -2)
}

/**
 * Importe × tasa/coeficiente, con UN solo redondeo al producir el importe.
 * (la tasa conserva su precisión; el resultado es cent-exacto)
 */
export function multiplyAmountByRate(amount: number, rate: number): number {
    if (!Number.isFinite(amount) || !Number.isFinite(rate)) return NaN
    return roundMoney(amount * rate)
}

/**
 * Desplaza el punto decimal en base 10 sin pasar por multiplicación binaria
 * (evita que 1.005 * 100 dé 100.4999...). Técnica estándar de redondeo exacto.
 */
function shift10(value: number, exp: number): number {
    if (value === 0) return 0
    const [mantissa, e] = value.toExponential(15).split('e')
    return Number(`${mantissa}e${Number(e) + exp}`)
}

/** Redondeo monetario central: half-up (alejándose de cero) a 2 decimales */
export function roundMoney(value: number): number {
    if (!Number.isFinite(value)) return NaN
    const sign = value < 0 ? -1 : 1
    return sign * shift10(Math.round(shift10(Math.abs(value), 2)), -2)
}

/** Convierte a centavos enteros (para comparaciones exactas) */
export function toCents(value: number): number {
    if (!Number.isFinite(value)) return NaN
    const sign = value < 0 ? -1 : 1
    return sign * Math.round(shift10(Math.abs(value), 2))
}

/** Igualdad monetaria exacta al centavo */
export function moneyEquals(a: number, b: number): boolean {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false
    return toCents(a) === toCents(b)
}

/**
 * Suma una lista de importes acumulando en centavos enteros para evitar
 * el drift de punto flotante en sumas largas.
 */
export function sumMoney(values: number[]): number {
    let cents = 0
    for (const v of values) {
        if (!Number.isFinite(v)) return NaN
        cents += toCents(v)
    }
    return cents / CENT_FACTOR
}

/** true si el importe es cero al centavo */
export function isZeroMoney(value: number): boolean {
    return Number.isFinite(value) && toCents(value) === 0
}
