/**
 * Auto-Detect Mapping
 * 
 * Heuristic-based automatic detection of taxonomy mappings
 * based on account fields (kind, section, group) and Spanish keywords.
 */

import type { Account, StatementGroup } from '../../core/models'
import type { MappingEntry, Confidence } from './mappingStorage'
import { createMappingEntry } from './mappingStorage'

// ============================================================================
// Types
// ============================================================================

interface DetectionRule {
    /** Keywords to match (case-insensitive, partial match) */
    keywords: string[]
    /** Target StatementGroup */
    taxonomyId: StatementGroup
    /** Whether this pattern indicates a contra account */
    isContra?: boolean
    /** Base confidence when keywords match */
    baseConfidence: Confidence
    /** Required kind for high confidence */
    expectedKind?: Account['kind']
    /** Required section for high confidence */
    expectedSection?: Account['section']
}

// ============================================================================
// Detection Rules (Spanish Argentina)
// ============================================================================

const DETECTION_RULES: DetectionRule[] = [
    // =========== ASSETS - Current ===========

    // Cash & Banks
    {
        keywords: ['caja', 'banco', 'bancos', 'c/c', 'cuenta corriente', 'valores a depositar', 'cheques', 'fondo fijo', 'moneda extranjera'],
        taxonomyId: 'CASH_AND_BANKS',
        baseConfidence: 'high',
        expectedKind: 'ASSET',
        expectedSection: 'CURRENT',
    },

    // Trade Receivables
    {
        keywords: ['clientes', 'deudores por ventas', 'créditos por ventas', 'ctas a cobrar', 'documentos a cobrar', 'deudores con tarjeta'],
        taxonomyId: 'TRADE_RECEIVABLES',
        baseConfidence: 'high',
        expectedKind: 'ASSET',
    },

    // Tax Credits
    {
        keywords: ['iva crédito', 'crédito fiscal', 'iva cf', 'anticipo impuesto', 'anticipos de impuestos'],
        taxonomyId: 'TAX_CREDITS',
        baseConfidence: 'high',
        expectedKind: 'ASSET',
    },

    // Inventories
    {
        keywords: ['mercader', 'inventario', 'bienes de cambio', 'stock', 'mercancía'],
        taxonomyId: 'INVENTORIES',
        baseConfidence: 'high',
        expectedKind: 'ASSET',
        expectedSection: 'CURRENT',
    },

    // Other Receivables
    {
        keywords: ['otros créditos', 'prepagos', 'anticipos', 'comisiones a cobrar', 'créditos con socios', 'alquileres pagados'],
        taxonomyId: 'OTHER_RECEIVABLES',
        baseConfidence: 'medium',
        expectedKind: 'ASSET',
    },

    // Investments
    {
        keywords: ['inversión', 'inversiones', 'plazo fijo', 'fci', 'fondo común', 'acciones'],
        taxonomyId: 'INVESTMENTS',
        baseConfidence: 'medium',
        expectedKind: 'ASSET',
    },

    // =========== ASSETS - Non-Current ===========

    // PPE
    {
        keywords: ['bienes de uso', 'muebles', 'rodados', 'equipos', 'inmueble', 'instalaciones', 'terreno', 'maquinaria', 'computación'],
        taxonomyId: 'PPE',
        baseConfidence: 'high',
        expectedKind: 'ASSET',
        expectedSection: 'NON_CURRENT',
    },

    // PPE - Amortization (contra)
    {
        keywords: ['amort', 'amortización', 'depreciación', 'amort. acum'],
        taxonomyId: 'PPE',
        isContra: true,
        baseConfidence: 'medium',
        expectedKind: 'ASSET',
    },

    // Intangibles
    {
        keywords: ['intangible', 'marca', 'patente', 'software', 'llave', 'goodwill'],
        taxonomyId: 'INTANGIBLES',
        baseConfidence: 'high',
        expectedKind: 'ASSET',
        expectedSection: 'NON_CURRENT',
    },

    // Receivables - contra (provisions)
    {
        keywords: ['previsión', 'provision para incobrables', 'incobrable'],
        taxonomyId: 'TRADE_RECEIVABLES',
        isContra: true,
        baseConfidence: 'medium',
        expectedKind: 'ASSET',
    },

    // =========== LIABILITIES - Current ===========

    // Trade Payables
    {
        keywords: ['proveedor', 'deudas comerciales', 'acreedores por compras', 'documentos a pagar', 'valores a pagar'],
        taxonomyId: 'TRADE_PAYABLES',
        baseConfidence: 'high',
        expectedKind: 'LIABILITY',
    },

    // Tax Liabilities
    {
        keywords: ['iva débito', 'débito fiscal', 'afip', 'deudas fiscales', 'impuestos a pagar', 'retenciones a depositar'],
        taxonomyId: 'TAX_LIABILITIES',
        baseConfidence: 'high',
        expectedKind: 'LIABILITY',
    },

    // Payroll Liabilities
    {
        keywords: ['sueldos a pagar', 'jornales', 'cargas sociales', 'deudas laborales', 'aguinaldo', 'vacaciones'],
        taxonomyId: 'PAYROLL_LIABILITIES',
        baseConfidence: 'high',
        expectedKind: 'LIABILITY',
    },

    // Loans
    {
        keywords: ['préstamo', 'deuda financiera', 'adelanto', 'hipoteca', 'financiación'],
        taxonomyId: 'LOANS',
        baseConfidence: 'high',
        expectedKind: 'LIABILITY',
    },

    // Deferred Income
    {
        keywords: ['anticipo de cliente', 'cobrado por adelantado', 'ingresos diferidos'],
        taxonomyId: 'DEFERRED_INCOME',
        baseConfidence: 'medium',
        expectedKind: 'LIABILITY',
    },

    // Other Payables
    {
        keywords: ['acreedores varios', 'otras deudas', 'gastos a pagar', 'alquileres a pagar', 'dividendos a pagar'],
        taxonomyId: 'OTHER_PAYABLES',
        baseConfidence: 'medium',
        expectedKind: 'LIABILITY',
    },

    // =========== EQUITY ===========

    // Capital
    {
        keywords: ['capital social', 'capital', 'aportes', 'prima de emisión'],
        taxonomyId: 'CAPITAL',
        baseConfidence: 'high',
        expectedKind: 'EQUITY',
    },

    // Reserves
    {
        keywords: ['reserva', 'reservas', 'revalúo'],
        taxonomyId: 'RESERVES',
        baseConfidence: 'high',
        expectedKind: 'EQUITY',
    },

    // Retained Earnings
    {
        keywords: ['resultado', 'resultados acumulados', 'resultados no asignados', 'ejercicio anterior', 'area'],
        taxonomyId: 'RETAINED_EARNINGS',
        baseConfidence: 'high',
        expectedKind: 'EQUITY',
    },

    // =========== INCOME ===========

    // Sales
    {
        keywords: ['ventas', 'ingresos por ventas', 'servicios prestados', 'facturación'],
        taxonomyId: 'SALES',
        baseConfidence: 'high',
        expectedKind: 'INCOME',
    },

    // Other Operating Income
    {
        keywords: ['comisiones ganadas', 'alquileres ganados', 'otros ingresos operativos'],
        taxonomyId: 'OTHER_OPERATING_INCOME',
        baseConfidence: 'medium',
        expectedKind: 'INCOME',
    },

    // Financial Income
    {
        keywords: ['intereses ganados', 'ingresos financieros', 'diferencia de cambio positiva'],
        taxonomyId: 'FINANCIAL_INCOME',
        baseConfidence: 'high',
        expectedKind: 'INCOME',
        expectedSection: 'FINANCIAL',
    },

    // Other Income
    {
        keywords: ['sobrante de caja', 'recupero', 'resultado venta', 'otros ingresos'],
        taxonomyId: 'OTHER_INCOME',
        baseConfidence: 'low',
        expectedKind: 'INCOME',
    },

    // =========== EXPENSES ===========

    // COGS
    {
        keywords: ['costo de ventas', 'cmv', 'costo mercaderías', 'compras', 'gastos sobre compras'],
        taxonomyId: 'COGS',
        baseConfidence: 'high',
        expectedKind: 'EXPENSE',
        expectedSection: 'COST',
    },

    // Admin Expenses
    {
        keywords: ['administración', 'gastos adm', 'sueldos y jornales', 'honorarios', 'impuestos y tasas', 'servicios públicos', 'gastos de oficina'],
        taxonomyId: 'ADMIN_EXPENSES',
        baseConfidence: 'medium',
        expectedKind: 'EXPENSE',
        expectedSection: 'ADMIN',
    },

    // Selling Expenses
    {
        keywords: ['comercialización', 'publicidad', 'fletes', 'comisiones perdidas', 'ingresos brutos', 'gastos de venta'],
        taxonomyId: 'SELLING_EXPENSES',
        baseConfidence: 'medium',
        expectedKind: 'EXPENSE',
        expectedSection: 'SELLING',
    },

    // Financial Expenses
    {
        keywords: ['intereses perdidos', 'gastos bancarios', 'diferencia de cambio', 'recpam', 'gastos financieros'],
        taxonomyId: 'FINANCIAL_EXPENSES',
        baseConfidence: 'high',
        expectedKind: 'EXPENSE',
        expectedSection: 'FINANCIAL',
    },

    // Other Expenses
    {
        keywords: ['faltante de caja', 'siniestros', 'obsolescencia', 'otros gastos', 'deudores incobrables'],
        taxonomyId: 'OTHER_EXPENSES',
        baseConfidence: 'low',
        expectedKind: 'EXPENSE',
    },
]

// ============================================================================
// Auto-Detection Logic
// ============================================================================

/**
 * Normalize text for matching (lowercase, trim, remove accents)
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
}

/**
 * Check if text contains any of the keywords
 */
function matchesKeywords(text: string, keywords: string[]): boolean {
    const normalized = normalizeText(text)
    return keywords.some(keyword => normalized.includes(normalizeText(keyword)))
}

/**
 * Calculate confidence based on rule match and account properties
 */
function calculateConfidence(
    rule: DetectionRule,
    account: Account
): Confidence {
    let confidence = rule.baseConfidence

    // Upgrade confidence if kind matches
    if (rule.expectedKind && account.kind === rule.expectedKind) {
        if (confidence === 'low') confidence = 'medium'
    } else if (rule.expectedKind && account.kind !== rule.expectedKind) {
        // Downgrade if kind doesn't match
        if (confidence === 'high') confidence = 'medium'
        else if (confidence === 'medium') confidence = 'low'
    }

    // Upgrade confidence if section matches
    if (rule.expectedSection && account.section === rule.expectedSection) {
        if (confidence === 'medium') confidence = 'high'
    }

    return confidence
}

/**
 * Detect mapping for a single account
 */
function detectAccountMapping(account: Account): MappingEntry | null {
    // Skip header accounts
    if (account.isHeader) {
        return null
    }

    // If account already has statementGroup, use it with high confidence
    if (account.statementGroup) {
        return createMappingEntry(
            account.statementGroup,
            'high',
            account.isContra,
            true
        )
    }

    // Build search text from account fields
    const searchText = [
        account.name,
        account.group,
        account.code,
    ].join(' ')

    // Find matching rule
    let bestMatch: { rule: DetectionRule; confidence: Confidence } | null = null

    for (const rule of DETECTION_RULES) {
        if (matchesKeywords(searchText, rule.keywords)) {
            const confidence = calculateConfidence(rule, account)

            // Keep best match (higher confidence wins)
            if (!bestMatch ||
                (confidence === 'high' && bestMatch.confidence !== 'high') ||
                (confidence === 'medium' && bestMatch.confidence === 'low')) {
                bestMatch = { rule, confidence }
            }
        }
    }

    if (bestMatch) {
        return createMappingEntry(
            bestMatch.rule.taxonomyId,
            bestMatch.confidence,
            bestMatch.rule.isContra ?? account.isContra,
            true
        )
    }

    // No match found - return unmapped entry
    return createMappingEntry(null, null, account.isContra, true)
}

/**
 * Run auto-detection on all accounts
 * Returns a map of accountId -> MappingEntry
 */
export function autoDetect(accounts: Account[]): Record<string, MappingEntry> {
    const entries: Record<string, MappingEntry> = {}

    for (const account of accounts) {
        // Only process leaf accounts
        if (account.isHeader) continue

        const mapping = detectAccountMapping(account)
        if (mapping) {
            entries[account.id] = mapping
        }
    }

    return entries
}

/**
 * Get auto-detect statistics
 */
export function getAutoDetectStats(entries: Record<string, MappingEntry>): {
    total: number
    detected: number
    highConfidence: number
    mediumConfidence: number
    lowConfidence: number
    undetected: number
} {
    let total = 0
    let detected = 0
    let highConfidence = 0
    let mediumConfidence = 0
    let lowConfidence = 0
    let undetected = 0

    for (const entry of Object.values(entries)) {
        total++
        if (entry.taxonomyId) {
            detected++
            if (entry.confidence === 'high') highConfidence++
            else if (entry.confidence === 'medium') mediumConfidence++
            else if (entry.confidence === 'low') lowConfidence++
        } else {
            undetected++
        }
    }

    return {
        total,
        detected,
        highConfidence,
        mediumConfidence,
        lowConfidence,
        undetected,
    }
}
