/**
 * Helper único de planillas — Fase 2C (ADR_EXPORTACION_IMPORTACION_PLANILLAS).
 *
 * Reemplaza a `xlsx` (vulnerabilidad high sin fix). Lee/escribe XLSX con
 * `exceljs` (cargado bajo demanda para no penalizar el bundle inicial) y CSV
 * con `papaparse`. Aplica los límites de importación antes de parsear.
 */

import Papa from 'papaparse'
import { validateImportFile, validateImportShape, DEFAULT_IMPORT_LIMITS, type ImportLimits } from '../accounting/importLimits'

export type SpreadsheetRow = Record<string, unknown>

export interface SpreadsheetData {
    headers: string[]
    rows: SpreadsheetRow[]
}

/**
 * Lee un archivo CSV o XLSX y devuelve encabezados + filas como objetos.
 * Lanza Error con mensaje concreto si excede los límites o el formato falla.
 */
export async function readSpreadsheet(
    file: File,
    limits: ImportLimits = DEFAULT_IMPORT_LIMITS
): Promise<SpreadsheetData> {
    const fileError = validateImportFile(file, limits)
    if (fileError) throw new Error(fileError)

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()

    let data: SpreadsheetData
    if (ext === '.csv') {
        data = await readCsv(file)
    } else {
        data = await readXlsx(file)
    }

    const shapeError = validateImportShape(data.rows.length, data.headers.length, limits)
    if (shapeError) throw new Error(shapeError)

    return data
}

function readCsv(file: File): Promise<SpreadsheetData> {
    return new Promise((resolve, reject) => {
        Papa.parse<SpreadsheetRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                resolve({ headers: results.meta.fields ?? [], rows: results.data })
            },
            error: (err: Error) => reject(new Error(`Error al leer CSV: ${err.message}`)),
        })
    })
}

async function readXlsx(file: File): Promise<SpreadsheetData> {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return { headers: [], rows: [] }

    const headerRow = ws.getRow(1)
    const headers: string[] = []
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
        headers[col - 1] = String(cell.value ?? '').trim()
    })

    const rows: SpreadsheetRow[] = []
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return
        const obj: SpreadsheetRow = {}
        row.eachCell({ includeEmpty: false }, (cell, col) => {
            const key = headers[col - 1]
            if (!key) return
            const v = cell.value
            // exceljs devuelve objetos ricos para fechas/fórmulas: normalizamos
            if (v instanceof Date) obj[key] = v
            else if (v && typeof v === 'object' && 'result' in v) obj[key] = (v as { result: unknown }).result
            else if (v && typeof v === 'object' && 'text' in v) obj[key] = (v as { text: unknown }).text
            else obj[key] = v
        })
        // saltar filas totalmente vacías
        if (Object.values(obj).some(x => x !== null && x !== undefined && x !== '')) rows.push(obj)
    })

    return { headers, rows }
}

/**
 * Lee un CSV/XLSX como MATRIZ de strings (header:1), preservando posición.
 * Filtra filas totalmente vacías. Aplica los límites de importación.
 */
export async function readSpreadsheetMatrix(
    file: File,
    limits: ImportLimits = DEFAULT_IMPORT_LIMITS
): Promise<string[][]> {
    const fileError = validateImportFile(file, limits)
    if (fileError) throw new Error(fileError)

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    let matrix: string[][]

    if (ext === '.csv') {
        matrix = await new Promise<string[][]>((resolve, reject) => {
            Papa.parse<string[]>(file, {
                skipEmptyLines: true,
                complete: (r) => resolve((r.data).filter(row => row.some(c => c && String(c).trim() !== ''))),
                error: (e: Error) => reject(new Error(`Error al leer CSV: ${e.message}`)),
            })
        })
    } else {
        const ExcelJS = (await import('exceljs')).default
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(await file.arrayBuffer())
        const ws = wb.worksheets[0]
        matrix = []
        if (ws) {
            ws.eachRow({ includeEmpty: false }, (row) => {
                const cells: string[] = []
                row.eachCell({ includeEmpty: true }, (cell, col) => {
                    const v = cell.value
                    cells[col - 1] = v == null ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(
                        typeof v === 'object' && v && 'result' in v ? (v as { result: unknown }).result
                            : typeof v === 'object' && v && 'text' in v ? (v as { text: unknown }).text
                            : v
                    ))
                })
                if (cells.some(c => c && c.trim() !== '')) matrix.push(cells.map(c => c ?? ''))
            })
        }
    }

    const cols = matrix.reduce((m, r) => Math.max(m, r.length), 0)
    const shapeError = validateImportShape(matrix.length, cols, limits)
    if (shapeError) throw new Error(shapeError)
    return matrix
}

// ─────────────────────────────────────────────────────────────
// Escritura
// ─────────────────────────────────────────────────────────────

export interface WorkbookSheet {
    name: string
    /** primera fila = encabezados; el resto, datos */
    rows: Array<Array<string | number | null>>
}

/** Genera un .xlsx y dispara la descarga en el navegador */
export async function writeWorkbook(sheets: WorkbookSheet[], filename: string): Promise<void> {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'ContaLivre'
    wb.created = new Date()

    for (const sheet of sheets) {
        // exceljs limita el nombre de hoja a 31 chars y prohíbe algunos símbolos
        const safeName = sheet.name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Hoja'
        const ws = wb.addWorksheet(safeName)
        for (const row of sheet.rows) ws.addRow(row)
        // negrita en la primera fila
        if (sheet.rows.length > 0) ws.getRow(1).font = { bold: true }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
}
