/**
 * Límites de importación — Fase 2A (SEC-002)
 *
 * Los importadores XLSX/CSV leen el archivo completo en memoria y la
 * dependencia `xlsx` tiene advisories sin fix disponible. Estos límites
 * configurables acotan la superficie: tamaño, filas, columnas y extensión.
 */

export interface ImportLimits {
    /** Tamaño máximo del archivo en bytes */
    maxFileSizeBytes: number
    /** Cantidad máxima de filas a procesar */
    maxRows: number
    /** Cantidad máxima de columnas */
    maxColumns: number
    /** Extensiones permitidas (minúsculas, con punto) */
    allowedExtensions: string[]
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
    maxFileSizeBytes: 5 * 1024 * 1024, // 5 MB
    maxRows: 10_000,
    maxColumns: 60,
    allowedExtensions: ['.csv', '.xls', '.xlsx'],
}

/**
 * Valida un archivo antes de leerlo. Devuelve un mensaje de error concreto
 * o null si el archivo puede procesarse.
 */
export function validateImportFile(
    file: { name: string; size: number },
    limits: ImportLimits = DEFAULT_IMPORT_LIMITS
): string | null {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!limits.allowedExtensions.includes(ext)) {
        return `Extensión "${ext}" no permitida. Formatos aceptados: ${limits.allowedExtensions.join(', ')}`
    }
    if (file.size > limits.maxFileSizeBytes) {
        const mb = (limits.maxFileSizeBytes / (1024 * 1024)).toFixed(0)
        const actual = (file.size / (1024 * 1024)).toFixed(1)
        return `El archivo pesa ${actual} MB y el máximo permitido es ${mb} MB.`
    }
    return null
}

/**
 * Valida la cantidad de filas/columnas ya parseadas.
 */
export function validateImportShape(
    rowCount: number,
    columnCount: number,
    limits: ImportLimits = DEFAULT_IMPORT_LIMITS
): string | null {
    if (rowCount > limits.maxRows) {
        return `El archivo tiene ${rowCount} filas y el máximo permitido es ${limits.maxRows}. Dividilo en partes más chicas.`
    }
    if (columnCount > limits.maxColumns) {
        return `El archivo tiene ${columnCount} columnas y el máximo permitido es ${limits.maxColumns}.`
    }
    return null
}
