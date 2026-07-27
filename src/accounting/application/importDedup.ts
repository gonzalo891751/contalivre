/**
 * Detección de asientos ya importados.
 *
 * El importador del Libro Diario contabiliza asientos manuales, que no tienen
 * módulo de origen ni clave de idempotencia: repetir la misma importación
 * duplicaba el ejercicio entero sin ningún aviso.
 *
 * Acá se calcula una huella estable del hecho contable (fecha + concepto +
 * líneas normalizadas). La huella NO se usa para fusionar en silencio: sirve
 * para AVISAR cuántos asientos del archivo ya están en los libros y permitir
 * omitirlos. Dos asientos económicamente idénticos del mismo día pueden ser
 * legítimos, así que la decisión queda en manos de quien importa.
 */

const cents = (n: number | undefined) => Math.round((n || 0) * 100)

export interface FingerprintableEntry {
    date: string
    memo?: string
    lines: Array<{ accountId: string; debit?: number; credit?: number }>
}

/** Normaliza el concepto: espacios colapsados, sin acentos ni mayúsculas */
function normalizeMemo(memo: string | undefined): string {
    return (memo ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

/** Huella del hecho contable: misma fecha, mismo concepto y mismas líneas */
export function entryFingerprint(entry: FingerprintableEntry): string {
    const lines = entry.lines
        .map(l => `${l.accountId}:${cents(l.debit)}:${cents(l.credit)}`)
        .sort()
        .join('|')
    return `${entry.date}~${normalizeMemo(entry.memo)}~${lines}`
}

export interface DuplicateReport<T> {
    /** Asientos del archivo que ya están en los libros */
    repetidos: T[]
    /** Asientos que no existen todavía */
    nuevos: T[]
}

/**
 * Separa los candidatos entre los que ya existen en los libros y los nuevos.
 *
 * Si el archivo trae dos veces el mismo asiento, la segunda aparición también
 * cuenta como repetida: se compara contra los libros Y contra lo ya visto.
 */
export function splitAlreadyImported<T extends FingerprintableEntry>(
    candidates: T[],
    existing: FingerprintableEntry[]
): DuplicateReport<T> {
    const known = new Set(existing.map(entryFingerprint))
    const repetidos: T[] = []
    const nuevos: T[] = []

    for (const candidate of candidates) {
        const fp = entryFingerprint(candidate)
        if (known.has(fp)) {
            repetidos.push(candidate)
        } else {
            nuevos.push(candidate)
            known.add(fp)
        }
    }
    return { repetidos, nuevos }
}
