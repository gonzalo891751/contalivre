/**
 * Import Accounts Library
 * Parsing, validation, and normalization utilities for Plan de Cuentas import
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { Account, AccountKind, AccountSection } from '../core/models'
import { getDefaultNormalSide } from '../core/models'

// ============================================================================
// Types
// ============================================================================

export interface ColumnMapping {
    code: number | null
    name: number | null
    kind: number | null     // Newly added: Explicit Kind mapping
    section: number | null  // Newly added: Explicit Section mapping
    parentCode?: number | null
    // kept for backward compatibility or as "Infer from code" fallback switch
    type?: number | null
}

export interface ImportedRow {
    code: string
    name: string
    kind: AccountKind
    section: AccountSection
    parentCode?: string
    rawKind?: string
    rawSection?: string
    isDefaultKind?: boolean
    isDefaultSection?: boolean
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
    classifiedCount: number // How many were successfully classified
    unclassifiedCount: number
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

const KIND_MAPPINGS: Record<string, AccountKind> = {
    // Activo
    'activo': 'ASSET', 'active': 'ASSET', 'bienes': 'ASSET', 'a': 'ASSET', '1': 'ASSET',
    'act': 'ASSET', 'asset': 'ASSET',

    // Pasivo
    'pasivo': 'LIABILITY', 'passive': 'LIABILITY', 'deudas': 'LIABILITY', 'p': 'LIABILITY', '2': 'LIABILITY',
    'pas': 'LIABILITY', 'liability': 'LIABILITY',

    // Patrimonio Neto
    'patrimonio neto': 'EQUITY', 'patrimonio': 'EQUITY', 'pn': 'EQUITY', 'capital': 'EQUITY', '3': 'EQUITY',
    'patr': 'EQUITY', 'net worth': 'EQUITY', 'equity': 'EQUITY',

    // Ingresos
    'ingreso': 'INCOME', 'ingresos': 'INCOME', 'ventas': 'INCOME', 'ganancia': 'INCOME', '4': 'INCOME',
    'result+': 'INCOME', 'income': 'INCOME', 'revenue': 'INCOME',

    // Egresos / Gastos
    'egreso': 'EXPENSE', 'egresos': 'EXPENSE', 'gasto': 'EXPENSE', 'gastos': 'EXPENSE', '5': 'EXPENSE',
    'costo': 'EXPENSE', 'costos': 'EXPENSE', 'perdida': 'EXPENSE', 'result-': 'EXPENSE',
    'expense': 'EXPENSE', 'cost': 'EXPENSE', '6': 'EXPENSE'
}

const SECTION_MAPPINGS: Record<string, AccountSection> = {
    // Corriente (Current)
    'corriente': 'CURRENT', 'corr': 'CURRENT', 'circulante': 'CURRENT', 'corto plazo': 'CURRENT', 'current': 'CURRENT',
    'disponibilidades': 'CURRENT', 'caja y bancos': 'CURRENT', 'caja': 'CURRENT', 'bancos': 'CURRENT', // Implicitly current

    // No Corriente (Non Current)
    'no corriente': 'NON_CURRENT', 'no corr': 'NON_CURRENT', 'fijo': 'NON_CURRENT', 'largo plazo': 'NON_CURRENT', 'non current': 'NON_CURRENT',
    'bienes de uso': 'NON_CURRENT',

    // Patrimonio (Equity) - usually just Current/Capital
    'capital': 'CURRENT', 'reservas': 'CURRENT', 'resultados': 'CURRENT',

    // Income Sections
    'operativo': 'OPERATING', 'operating': 'OPERATING', 'explotacion': 'OPERATING',
    'financiero': 'FINANCIAL', 'financial': 'FINANCIAL', 'intereses': 'FINANCIAL',
    'otros': 'OTHER', 'extraordinarios': 'OTHER', 'varios': 'OTHER', 'other': 'OTHER',

    // Expense Sections
    'costo': 'COST', 'costos': 'COST', 'cost': 'COST', 'cmv': 'COST',
    'admin': 'ADMIN', 'administracion': 'ADMIN', 'administration': 'ADMIN', 'gastos adm': 'ADMIN',
    'comercial': 'SELLING', 'comercializacion': 'SELLING', 'ventas': 'SELLING', 'selling': 'SELLING', 'marketing': 'SELLING',
    // financial/other shared above but checked in context
}

/**
 * Normalize a raw string to AccountKind
 */
export function normalizeAccountKind(raw: string): AccountKind | null {
    if (!raw) return null
    const normalized = raw.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents

    // Exact match check
    if (KIND_MAPPINGS[normalized]) return KIND_MAPPINGS[normalized]

    // Partial match check
    for (const [key, value] of Object.entries(KIND_MAPPINGS)) {
        if (normalized.includes(key) && key.length > 2) return value
    }

    return null
}

/**
 * Normalize a raw string to AccountSection
 */
export function normalizeAccountSection(raw: string, kind?: AccountKind): AccountSection | null {
    if (!raw) return null
    const normalized = raw.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    // Check specific known mappings
    if (SECTION_MAPPINGS[normalized]) return SECTION_MAPPINGS[normalized]

    // Context-aware fuzzy matching
    if (normalized.includes('no corr') || normalized.includes('fijo')) return 'NON_CURRENT'
    if (normalized.includes('corr') || normalized.includes('circulante')) return 'CURRENT'

    if (kind === 'EXPENSE') {
        if (normalized.includes('cost')) return 'COST'
        if (normalized.includes('adm')) return 'ADMIN'
        if (normalized.includes('comerc')) return 'SELLING'
        if (normalized.includes('financ')) return 'FINANCIAL'
    }

    if (kind === 'INCOME') {
        if (normalized.includes('financ')) return 'FINANCIAL'
        if (normalized.includes('operat')) return 'OPERATING'
    }

    return null
}

// ============================================================================
// Inference Logics
// ============================================================================

/**
 * Priority 2: Infer Kind from Code Pattern
 */
export function inferKindFromCode(code: string): AccountKind | null {
    const firstChar = code.trim().charAt(0)
    switch (firstChar) {
        case '1': return 'ASSET'
        case '2': return 'LIABILITY'
        case '3': return 'EQUITY'
        case '4': return 'INCOME' // Common standard
        case '5': return 'EXPENSE'
        case '6': return 'EXPENSE'
        default: return null
    }
}

/**
 * Priority 2: Infer Section from Code Pattern (dotted hierarchy)
 */
export function inferSectionFromCode(code: string, kind: AccountKind): AccountSection {
    // Standard dotted notation: 1.1 = Current, 1.2 = Non-Current
    if (kind === 'ASSET' || kind === 'LIABILITY') {
        // Remove leading/trailing spaces
        const c = code.trim()
        if (c.startsWith('1.1') || c.startsWith('2.1')) return 'CURRENT'
        if (c.startsWith('1.2') || c.startsWith('2.2')) return 'NON_CURRENT'
    }

    // Defaults based on Kind
    if (kind === 'ASSET' || kind === 'LIABILITY') return 'CURRENT'
    if (kind === 'EQUITY') return 'CURRENT'
    if (kind === 'INCOME') return 'OPERATING'
    if (kind === 'EXPENSE') {
        // Common pattern: 5.1 Cost, 5.2 Admin... but too risky to assume.
        // Default to OTHER or ADMIN? Admin is safer/more common for generic expenses.
        return 'OTHER'
    }

    return 'CURRENT'
}

/**
 * Priority 3: Infer Kind/Section from Name Keywords (Heuristics)
 */
export function inferFromKeywords(name: string): { kind: AccountKind, section: AccountSection } | null {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    // Assets
    if (n.includes('caja') || n.includes('banco') || n.includes('efectivo') || n.includes('disponib'))
        return { kind: 'ASSET', section: 'CURRENT' }
    if (n.includes('cliente') || n.includes('deudores'))
        return { kind: 'ASSET', section: 'CURRENT' }
    if (n.includes('mercader') || n.includes('inventar') || n.includes('stock'))
        return { kind: 'ASSET', section: 'CURRENT' }
    if (n.includes('muebles') || n.includes('rodado') || n.includes('inmueble') || n.includes('instalacion') || n.includes('maq'))
        return { kind: 'ASSET', section: 'NON_CURRENT' }
    if (n.includes('amort') && n.includes('acum'))
        return { kind: 'ASSET', section: 'NON_CURRENT' } // Usually non-current contra

    // Liabilities
    if (n.includes('proveedor')) return { kind: 'LIABILITY', section: 'CURRENT' }
    if (n.includes('afip') || n.includes('iva') || n.includes('impuesto a pagar') || n.includes('retencion'))
        return { kind: 'LIABILITY', section: 'CURRENT' }
    if (n.includes('sueldos a pagar') || n.includes('cargas sociales'))
        return { kind: 'LIABILITY', section: 'CURRENT' }

    // Equity
    if (n.includes('capital') || n.includes('social') || n.includes('reservas') || n.includes('resultado del ej'))
        return { kind: 'EQUITY', section: 'CURRENT' }

    // Income
    if (n.includes('ventas') || n.includes('ingresos') || n.includes('servicios prestados'))
        return { kind: 'INCOME', section: 'OPERATING' }

    // Expense
    if (n.includes('cmv') || n.includes('costo de v'))
        return { kind: 'EXPENSE', section: 'COST' }
    if (n.includes('sueldos') || n.includes('jornales'))
        return { kind: 'EXPENSE', section: 'ADMIN' } // Default to admin but could be selling/cost
    if (n.includes('publicidad') || n.includes('marketing') || n.includes('flete'))
        return { kind: 'EXPENSE', section: 'SELLING' }
    if (n.includes('bancarios') || n.includes('intereses cedidos') || n.includes('diferencia de cambio'))
        return { kind: 'EXPENSE', section: 'FINANCIAL' }
    if (n.includes('ganados') || n.includes('intereses ganados'))
        return { kind: 'INCOME', section: 'FINANCIAL' }

    return null
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
        kind: null,
        section: null,
        parentCode: null,
    }

    const normalized = headers.map(h => h.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))

    // Try to auto-detect columns
    normalized.forEach((header, index) => {
        // Code
        if (header.includes('codigo') || header.includes('code') || header === 'cod' || header === 'id') {
            if (mapping.code === null) mapping.code = index
        }
        // Name
        if (header.includes('nombre') || header.includes('name') || header === 'cuenta' || header === 'descripcion' || header === 'detalle') {
            if (mapping.name === null) mapping.name = index
        }
        // Kind / Class
        if (header.includes('clase') || header.includes('tipo') || header === 'kind' || header === 'class') {
            if (mapping.kind === null) mapping.kind = index
        }
        // Section / Subclass
        if (header.includes('subclase') || header.includes('subtipo') || header.includes('seccion') || header === 'section' || header.includes('rubro')) {
            if (mapping.section === null) mapping.section = index
        }
        // Parent
        if (header.includes('padre') || header.includes('parent') || header === 'madre') {
            if (mapping.parentCode === null) mapping.parentCode = index
        }
    })

    return mapping
}

/**
 * Convert raw rows to ImportedRow objects using mapping and 3-priority inference
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

        // Extract raw values
        const code = mapping.code !== null ? (row[mapping.code] ?? '').trim() : ''
        const name = mapping.name !== null ? (row[mapping.name] ?? '').trim() : ''

        // Skip invalid rows
        if (!code && !name) continue

        const rawKind = mapping.kind !== null ? (row[mapping.kind] ?? '').trim() : ''
        const rawSection = mapping.section !== null ? (row[mapping.section] ?? '').trim() : ''

        // Safe access for parentCode
        const parentCodeIdx = mapping.parentCode
        const parentCode = (typeof parentCodeIdx === 'number') ? (row[parentCodeIdx] ?? '').trim() : undefined

        // ====================================================================
        // PRIORITY LOGIC
        // ====================================================================

        let determinedKind: AccountKind | null = null
        let determinedSection: AccountSection | null = null

        // 1. Explicit Check
        if (rawKind) {
            determinedKind = normalizeAccountKind(rawKind)
        }
        if (rawSection) {
            determinedSection = normalizeAccountSection(rawSection, determinedKind || undefined)
        }

        // 2. Code Inference (if Kind missing)
        if (!determinedKind && code) {
            determinedKind = inferKindFromCode(code)

            // If we inferred Kind from code, we can also try to infer Section from code
            if (determinedKind && !determinedSection) {
                determinedSection = inferSectionFromCode(code, determinedKind)
            }
        } else if (determinedKind && !determinedSection && code) {
            // Even if Kind was explicit, if Section is missing, try code pattern
            determinedSection = inferSectionFromCode(code, determinedKind)
        }

        // 3. Name Heuristics (Last resort)
        if (!determinedKind || !determinedSection) {
            const inference = inferFromKeywords(name)
            if (inference) {
                if (!determinedKind) determinedKind = inference.kind
                // Only overwrite section if we still don't have one (or maybe we trust keywords more than generic code defaults?)
                // Let's stick to filling missing values.
                if (!determinedSection) determinedSection = inference.section
            }
        }

        let isDefaultKind = false
        let isDefaultSection = false

        // Fallback for defaults if everything failed
        if (!determinedKind) {
            determinedKind = 'ASSET' // Safe fail
            isDefaultKind = true
        }
        if (!determinedSection) {
            determinedSection = 'CURRENT' // Safe fail
            isDefaultSection = true
        }

        result.push({
            code,
            name,
            kind: determinedKind,
            section: determinedSection,
            parentCode,
            rawKind: rawKind || undefined,
            rawSection: rawSection || undefined,
            isDefaultKind,
            isDefaultSection
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
// Hierarchy Helper
// ============================================================================

/**
 * Infer parent code from dot-separated code format
 */
export function inferParentCode(code: string): string | null {
    const parts = code.split('.')
    if (parts.length <= 1) return null
    return parts.slice(0, -1).join('.')
}

export function calculateLevel(code: string): number {
    return code.split('.').length - 1
}

// ============================================================================
// Convert to Account objects
// ============================================================================

/**
 * Convert validated ImportedRow array to Account-ready objects
 */
export function convertToAccounts(
    rows: ImportedRow[],
    _existingCodes?: Set<string>
): Omit<Account, 'id'>[] {
    const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code))

    return sorted.map(row => {
        const level = calculateLevel(row.code)

        // Infer parent code
        const parentCode = row.parentCode || inferParentCode(row.code)

        const isHeader = level < 2 // Heuristic: Roots and Level 1 are usually headers

        return {
            code: row.code.trim(),
            name: row.name.trim(),
            kind: row.kind,
            section: row.section,
            group: row.name.trim(),
            statementGroup: null,
            parentId: null, // Will be resolved during actual insert in db
            level,
            normalSide: getDefaultNormalSide(row.kind),
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
    let classifiedCount = 0

    validRows.forEach(row => {
        if (existingCodes.has(row.code.trim())) {
            existingAccounts++
        } else {
            newAccounts++
        }

        // Heuristic: If we have a kind that isn't the default fallback logic we might want to track confidence
        // But for now let's assume if we have a valid row, it's classified (since we force fallbacks).
        // A better metric might be "Explicitly classified" vs "Inferred" but our interface doesn't track that deeply yet.
        classifiedCount++
    })

    return {
        total: totalRows,
        valid: validRows.length,
        errors: errorCount,
        newAccounts,
        existingAccounts,
        classifiedCount,
        unclassifiedCount: 0 // We force defaults so technically 0 for now
    }
}
