/**
 * Fuzzy matching utilities for account names
 * Used to match imported comparative data to system accounts
 */

// ============================================
// Synonyms Table for Accounting Terms
// ============================================
const ACCOUNTING_SYNONYMS: Record<string, string[]> = {
    'clientes': ['deudores por ventas', 'cuentas a cobrar', 'deudores comerciales'],
    'proveedores': ['acreedores comerciales', 'cuentas a pagar', 'deudas comerciales'],
    'bancos': ['bancos cuenta corriente', 'bancos cta cte', 'banco'],
    'caja': ['caja chica', 'efectivo', 'caja y bancos'],
    'inversiones': ['inversiones temporarias', 'inversiones corrientes'],
    'bienes cambio': ['mercaderias', 'inventario', 'stock', 'existencias'],
    'bienes uso': ['activo fijo', 'propiedad planta equipo', 'ppe', 'inmuebles maquinarias equipos'],
    'amortizaciones': ['depreciaciones', 'amortizacion acumulada', 'depreciacion acumulada'],
    'capital': ['capital social', 'capital suscripto', 'capital integrado'],
    'resultados': ['resultado del ejercicio', 'ganancia neta', 'perdida neta', 'utilidad neta'],
    'reservas': ['reserva legal', 'reservas de utilidades', 'reservas facultativas'],
    'ventas': ['ingresos por ventas', 'ventas netas', 'ingresos operativos'],
    'cmv': ['costo ventas', 'costo de ventas', 'costo mercaderia vendida', 'costo de bienes vendidos'],
    'sueldos': ['sueldos y jornales', 'remuneraciones', 'gastos de personal', 'salarios'],
    'impuestos': ['cargas fiscales', 'obligaciones fiscales', 'impuestos a pagar'],
    'iva': ['iva credito fiscal', 'iva debito fiscal', 'impuesto valor agregado'],
}

// ============================================
// Text Normalization
// ============================================
export function normalizeForMatch(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9\s]/g, '') // Keep only alphanumeric
        .replace(/\s+/g, ' ')
        .trim()
}

// ============================================
// Levenshtein Distance
// ============================================
function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix: number[][] = []

    // Initialize first row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i]
    }

    // Initialize first column
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                )
            }
        }
    }

    return matrix[b.length][a.length]
}

// ============================================
// Similarity Score (0-1)
// ============================================
function getSimilarity(a: string, b: string): number {
    const normA = normalizeForMatch(a)
    const normB = normalizeForMatch(b)

    if (normA === normB) return 1

    const maxLen = Math.max(normA.length, normB.length)
    if (maxLen === 0) return 0

    const distance = levenshteinDistance(normA, normB)
    return 1 - distance / maxLen
}

// ============================================
// Synonym Matching
// ============================================
function checkSynonymMatch(sourceText: string, targetText: string): boolean {
    const normSource = normalizeForMatch(sourceText)
    const normTarget = normalizeForMatch(targetText)

    for (const [key, synonyms] of Object.entries(ACCOUNTING_SYNONYMS)) {
        const allTerms = [key, ...synonyms]

        const sourceMatches = allTerms.some(term =>
            normSource.includes(term) || term.includes(normSource)
        )
        const targetMatches = allTerms.some(term =>
            normTarget.includes(term) || term.includes(normTarget)
        )

        if (sourceMatches && targetMatches) {
            return true
        }
    }

    return false
}

// ============================================
// Confidence Levels
// ============================================
export type MatchConfidence = 'alta' | 'media' | 'baja' | 'none'

export interface FuzzyMatchResult {
    accountId: string
    accountCode: string
    accountName: string
    confidence: MatchConfidence
    score: number
    method: 'code' | 'exact' | 'synonym' | 'fuzzy' | 'none'
}

// ============================================
// Main Fuzzy Match Function
// ============================================
export function fuzzyMatchAccount(
    sourceCode: string,
    sourceName: string,
    accounts: Array<{ id: string; code: string; name: string }>
): FuzzyMatchResult | null {
    const trimCode = sourceCode?.trim() || ''
    const trimName = sourceName?.trim() || ''

    if (!trimName && !trimCode) return null

    // 1. Exact code match
    if (trimCode) {
        const codeMatch = accounts.find(a => a.code === trimCode)
        if (codeMatch) {
            return {
                accountId: codeMatch.id,
                accountCode: codeMatch.code,
                accountName: codeMatch.name,
                confidence: 'alta',
                score: 1,
                method: 'code'
            }
        }
    }

    // 2. Exact name match (normalized)
    const normSourceName = normalizeForMatch(trimName)
    const exactNameMatch = accounts.find(a =>
        normalizeForMatch(a.name) === normSourceName
    )
    if (exactNameMatch) {
        return {
            accountId: exactNameMatch.id,
            accountCode: exactNameMatch.code,
            accountName: exactNameMatch.name,
            confidence: 'alta',
            score: 1,
            method: 'exact'
        }
    }

    // 3. Synonym match
    const synonymMatch = accounts.find(a =>
        checkSynonymMatch(trimName, a.name)
    )
    if (synonymMatch) {
        return {
            accountId: synonymMatch.id,
            accountCode: synonymMatch.code,
            accountName: synonymMatch.name,
            confidence: 'media',
            score: 0.8,
            method: 'synonym'
        }
    }

    // 4. Fuzzy match (Levenshtein)
    let bestMatch: { account: (typeof accounts)[0]; score: number } | null = null

    for (const account of accounts) {
        const score = getSimilarity(trimName, account.name)
        if (score >= 0.6 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { account, score }
        }
    }

    if (bestMatch) {
        const confidence: MatchConfidence = bestMatch.score >= 0.85 ? 'media' : 'baja'
        return {
            accountId: bestMatch.account.id,
            accountCode: bestMatch.account.code,
            accountName: bestMatch.account.name,
            confidence,
            score: bestMatch.score,
            method: 'fuzzy'
        }
    }

    return null
}

// ============================================
// Batch Matching for Import
// ============================================
export function batchFuzzyMatch(
    records: Array<{ code: string; name: string; amount: number }>,
    accounts: Array<{ id: string; code: string; name: string }>
): Array<{
    original: { code: string; name: string; amount: number }
    match: FuzzyMatchResult | null
}> {
    return records.map(record => ({
        original: record,
        match: fuzzyMatchAccount(record.code, record.name, accounts)
    }))
}
