/**
 * Import Accounts Library
 * Parsing, validation, and normalization utilities for Plan de Cuentas import
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { Account, AccountKind, AccountSection, NormalSide } from '../core/models'
import { getDefaultNormalSide } from '../core/models'

// ============================================================================
// Types
// ============================================================================

export interface ColumnMapping {
    code: number | null
    name: number | null
    type: number | null
    parentCode?: number | null
}

export interface ImportedRow {
    code: string
    name: string
    kind: AccountKind
    parentCode?: string
    rawType?: string
}

export interface ValidationError {
    row: number
    message: string
}

export interface ValidationResult {
    valid: ImportedRow[]
    errors: ValidationError[]
    duplicateCodes: string[]
}

export interface ImportSummary {
    total: number
    valid: number
    errors: number
    newAccounts: number
    existingAccounts: number
}

// ============================================================================
// File Parsing
// ============================================================================

/**
 * Parse a CSV file and return raw rows
 */
export function parseCSV(file: File): Promise<string[][]> {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            complete: (results) => {
                // Filter out completely empty rows
                const rows = (results.data as string[][]).filter(row =>
                    row.some(cell => cell && cell.trim() !== '')
                )
                resolve(rows)
            },
            error: (error) => {
                reject(new Error(`CSV parsing error: ${error.message}`))
            },
            skipEmptyLines: true,
        })
    })
}

/**
 * Parse an XLSX file and return raw rows from the first sheet
 */
export function parseXLSX(file: File): Promise<string[][]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer)
                const workbook = XLSX.read(data, { type: 'array' })

                // Get first sheet
                const firstSheetName = workbook.SheetNames[0]
                if (!firstSheetName) {
                    reject(new Error('El archivo Excel está vacío'))
                    return
                }

                const worksheet = workbook.Sheets[firstSheetName]
                const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
                    header: 1,
                    defval: ''
                })

                // Filter out empty rows
                const rows = jsonData.filter(row =>
                    row.some(cell => cell && String(cell).trim() !== '')
                ).map(row => row.map(cell => String(cell ?? '')))

                resolve(rows)
            } catch (err) {
                reject(new Error(`Error al leer archivo Excel: ${err instanceof Error ? err.message : 'Error desconocido'}`))
            }
        }

        reader.onerror = () => {
            reject(new Error('Error al leer el archivo'))
        }

        reader.readAsArrayBuffer(file)
    })
}

/**
 * Auto-detect file type and parse accordingly
 */
export async function parseFile(file: File): Promise<string[][]> {
    const extension = file.name.toLowerCase().split('.').pop()

    if (extension === 'csv') {
        return parseCSV(file)
    } else if (extension === 'xlsx' || extension === 'xls') {
        return parseXLSX(file)
    } else {
        throw new Error(`Formato de archivo no soportado: .${extension}. Usá .csv o .xlsx`)
    }
}

// ============================================================================
// Type Normalization
// ============================================================================

const TYPE_MAPPINGS: Record<string, AccountKind> = {
    // Activo
    'activo': 'ASSET',
    'a': 'ASSET',
    'act': 'ASSET',
    'asset': 'ASSET',
    '1': 'ASSET',

    // Pasivo
    'pasivo': 'LIABILITY',
    'p': 'LIABILITY',
    'pas': 'LIABILITY',
    'liability': 'LIABILITY',
    '2': 'LIABILITY',

    // Patrimonio Neto
    'patrimonio neto': 'EQUITY',
    'patrimonio': 'EQUITY',
    'pn': 'EQUITY',
    'patr neto': 'EQUITY',
    'capital': 'EQUITY',
    'equity': 'EQUITY',
    '3': 'EQUITY',

    // Ingresos
    'ingreso': 'INCOME',
    'ingresos': 'INCOME',
    'i': 'INCOME',
    'ing': 'INCOME',
    'income': 'INCOME',
    'revenue': 'INCOME',
    'ventas': 'INCOME',
    '4': 'INCOME',

    // Egresos / Gastos
    'egreso': 'EXPENSE',
    'egresos': 'EXPENSE',
    'gasto': 'EXPENSE',
    'gastos': 'EXPENSE',
    'g': 'EXPENSE',
    'e': 'EXPENSE',
    'egr': 'EXPENSE',
    'expense': 'EXPENSE',
    'cost': 'EXPENSE',
    'costo': 'EXPENSE',
    '5': 'EXPENSE',
    '6': 'EXPENSE',
}

/**
 * Normalize a raw type string to AccountKind
 */
export function normalizeAccountType(raw: string): AccountKind | null {
    if (!raw) return null

    const normalized = raw
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents

    return TYPE_MAPPINGS[normalized] || null
}

/**
 * Infer account type from code prefix (fallback)
 */
export function inferTypeFromCode(code: string): AccountKind {
    const firstChar = code.charAt(0)

    switch (firstChar) {
        case '1': return 'ASSET'
        case '2': return 'LIABILITY'
        case '3': return 'EQUITY'
        case '4': return 'INCOME'
        case '5':
        case '6': return 'EXPENSE'
        default: return 'ASSET'
    }
}

// ============================================================================
// Row Mapping
// ============================================================================

/**
 * Detect columns headers and suggest mapping
 */
export function detectColumns(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {
        code: null,
        name: null,
        type: null,
        parentCode: null,
    }

    const normalized = headers.map(h => h.toLowerCase().trim())

    // Try to auto-detect columns
    normalized.forEach((header, index) => {
        if (header.includes('codigo') || header.includes('code') || header === 'cod' || header === 'id') {
            if (mapping.code === null) mapping.code = index
        }
        if (header.includes('nombre') || header.includes('name') || header === 'cuenta' || header === 'descripcion') {
            if (mapping.name === null) mapping.name = index
        }
        if (header.includes('tipo') || header.includes('type') || header === 'rubro' || header === 'class') {
            if (mapping.type === null) mapping.type = index
        }
        if (header.includes('padre') || header.includes('parent') || header === 'padre') {
            if (mapping.parentCode === null) mapping.parentCode = index
        }
    })

    return mapping
}

/**
 * Convert raw rows to ImportedRow objects using mapping
 */
export function mapRowsToImportedRows(
    rows: string[][],
    mapping: ColumnMapping,
    skipHeader: boolean = true
): ImportedRow[] {
    const startIndex = skipHeader ? 1 : 0
    const result: ImportedRow[] = []

    for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue

        const code = mapping.code !== null ? (row[mapping.code] ?? '').trim() : ''
        const name = mapping.name !== null ? (row[mapping.name] ?? '').trim() : ''
        const rawType = mapping.type !== null ? (row[mapping.type] ?? '').trim() : ''
        const parentCodeIdx = mapping.parentCode
        const parentCode = parentCodeIdx !== null && parentCodeIdx !== undefined ? (row[parentCodeIdx] ?? '').trim() : undefined

        // Skip completely empty rows
        if (!code && !name) continue

        // Determine account kind
        let kind = normalizeAccountType(rawType)
        if (!kind && code) {
            kind = inferTypeFromCode(code)
        }
        if (!kind) {
            kind = 'ASSET' // Default fallback
        }

        result.push({
            code,
            name,
            kind,
            parentCode: parentCode || undefined,
            rawType: rawType || undefined,
        })
    }

    return result
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate imported rows
 */
export function validateImport(rows: ImportedRow[]): ValidationResult {
    const valid: ImportedRow[] = []
    const errors: ValidationError[] = []
    const seenCodes = new Map<string, number>()
    const duplicateCodes: string[] = []

    rows.forEach((row, index) => {
        const rowNumber = index + 2 // +1 for 0-index, +1 for header
        const rowErrors: string[] = []

        // Required: code
        if (!row.code) {
            rowErrors.push('Código vacío')
        }

        // Required: name
        if (!row.name) {
            rowErrors.push('Nombre vacío')
        }

        // Check for duplicate codes
        if (row.code) {
            const normalizedCode = row.code.trim()
            if (seenCodes.has(normalizedCode)) {
                rowErrors.push(`Código duplicado (también en fila ${seenCodes.get(normalizedCode)})`)
                if (!duplicateCodes.includes(normalizedCode)) {
                    duplicateCodes.push(normalizedCode)
                }
            } else {
                seenCodes.set(normalizedCode, rowNumber)
            }
        }

        if (rowErrors.length > 0) {
            errors.push({
                row: rowNumber,
                message: rowErrors.join('; ')
            })
        } else {
            valid.push(row)
        }
    })

    return { valid, errors, duplicateCodes }
}

// ============================================================================
// Hierarchy Inference
// ============================================================================

/**
 * Infer parent code from dot-separated code format
 * e.g., "1.1.1.2" → parent "1.1.1"
 */
export function inferParentCode(code: string): string | null {
    const parts = code.split('.')
    if (parts.length <= 1) {
        return null // Root level, no parent
    }
    return parts.slice(0, -1).join('.')
}

/**
 * Calculate level from code (number of dots)
 */
export function calculateLevel(code: string): number {
    return code.split('.').length - 1
}

/**
 * Determine section based on code and kind
 */
export function inferSection(code: string, kind: AccountKind): AccountSection {
    // For Assets and Liabilities, infer from code prefix
    if (kind === 'ASSET' || kind === 'LIABILITY') {
        if (code.startsWith('1.1') || code.startsWith('2.1')) {
            return 'CURRENT'
        }
        if (code.startsWith('1.2') || code.startsWith('2.2')) {
            return 'NON_CURRENT'
        }
    }

    // For Income/Expense, use sensible defaults
    if (kind === 'INCOME') {
        return 'OPERATING'
    }
    if (kind === 'EXPENSE') {
        if (code.startsWith('5')) return 'COST'
        return 'ADMIN'
    }

    return 'CURRENT'
}

// ============================================================================
// Convert to Account objects
// ============================================================================

/**
 * Convert validated ImportedRow array to Account-ready objects
 * (without id, which will be generated on insert)
 */
export function convertToAccounts(
    rows: ImportedRow[],
    _existingCodes?: Set<string>
): Omit<Account, 'id'>[] {
    // Sort by code to ensure parents are created before children
    const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code))

    // Track codes we're creating for parentId resolution
    const newCodes = new Map<string, boolean>()
    sorted.forEach(row => newCodes.set(row.code, true))

    return sorted.map(row => {
        const level = calculateLevel(row.code)
        const section = inferSection(row.code, row.kind)
        const normalSide: NormalSide = getDefaultNormalSide(row.kind)

        // Infer parent - check if parent exists or will be created
        let parentId: string | null = null
        let parentCode = row.parentCode || inferParentCode(row.code)

        // If parent code exists in existing accounts or in our import, we leave parentId null
        // (It will be resolved during the actual insert based on code matching)
        // For now, we store the parentCode for later resolution

        const isHeader = level < 2 // Rubros principales son headers

        return {
            code: row.code.trim(),
            name: row.name.trim(),
            kind: row.kind,
            section,
            group: row.name.trim(),
            statementGroup: null,
            parentId, // Will be resolved during actual insert
            level,
            normalSide,
            isContra: false,
            isHeader,
            // Store parentCode for resolution
            _parentCode: parentCode,
        } as Omit<Account, 'id'> & { _parentCode?: string | null }
    })
}

/**
 * Compute import summary comparing new accounts to existing ones
 */
export function computeImportSummary(
    validRows: ImportedRow[],
    existingCodes: Set<string>,
    totalRows: number,
    errorCount: number
): ImportSummary {
    let newAccounts = 0
    let existingAccounts = 0

    validRows.forEach(row => {
        if (existingCodes.has(row.code.trim())) {
            existingAccounts++
        } else {
            newAccounts++
        }
    })

    return {
        total: totalRows,
        valid: validRows.length,
        errors: errorCount,
        newAccounts,
        existingAccounts,
    }
}
