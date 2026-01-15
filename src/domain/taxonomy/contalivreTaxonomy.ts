/**
 * ContaLivre Canonical Taxonomy
 * 
 * Defines the stable taxonomy IDs and Spanish labels for mapping user accounts
 * to standardized financial statement categories.
 * 
 * NOTE: These IDs align with the StatementGroup type in core/models.ts
 */

import type { StatementGroup, AccountKind, AccountSection } from '../../core/models'

// ============================================================================
// Taxonomy Node Definition
// ============================================================================

export interface TaxonomyNode {
    /** Stable ID matching StatementGroup */
    id: StatementGroup
    /** Spanish display label */
    label: string
    /** Category for grouping in UI */
    category: 'BS_ASSET' | 'BS_LIABILITY' | 'BS_EQUITY' | 'IS_INCOME' | 'IS_EXPENSE'
    /** Parent node ID for hierarchy display */
    parentId?: string
    /** Required for specific KPIs */
    requiredForKpis?: string[]
}

// ============================================================================
// Balance Sheet - Assets
// ============================================================================

const BS_ASSETS: TaxonomyNode[] = [
    {
        id: 'CASH_AND_BANKS',
        label: 'Caja y Bancos',
        category: 'BS_ASSET',
        requiredForKpis: ['liquidez', 'prueba_acida', 'capital_trabajo'],
    },
    {
        id: 'TRADE_RECEIVABLES',
        label: 'Créditos por Ventas',
        category: 'BS_ASSET',
        requiredForKpis: ['liquidez', 'capital_trabajo'],
    },
    {
        id: 'OTHER_RECEIVABLES',
        label: 'Otros Créditos',
        category: 'BS_ASSET',
    },
    {
        id: 'TAX_CREDITS',
        label: 'Créditos Fiscales',
        category: 'BS_ASSET',
    },
    {
        id: 'INVENTORIES',
        label: 'Bienes de Cambio',
        category: 'BS_ASSET',
        requiredForKpis: ['liquidez', 'prueba_acida'],
    },
    {
        id: 'INVESTMENTS',
        label: 'Inversiones',
        category: 'BS_ASSET',
    },
    {
        id: 'PPE',
        label: 'Bienes de Uso',
        category: 'BS_ASSET',
    },
    {
        id: 'INTANGIBLES',
        label: 'Activos Intangibles',
        category: 'BS_ASSET',
    },
]

// ============================================================================
// Balance Sheet - Liabilities
// ============================================================================

const BS_LIABILITIES: TaxonomyNode[] = [
    {
        id: 'TRADE_PAYABLES',
        label: 'Deudas Comerciales',
        category: 'BS_LIABILITY',
        requiredForKpis: ['liquidez', 'capital_trabajo'],
    },
    {
        id: 'TAX_LIABILITIES',
        label: 'Deudas Fiscales',
        category: 'BS_LIABILITY',
    },
    {
        id: 'PAYROLL_LIABILITIES',
        label: 'Deudas Laborales',
        category: 'BS_LIABILITY',
    },
    {
        id: 'LOANS',
        label: 'Préstamos',
        category: 'BS_LIABILITY',
        requiredForKpis: ['endeudamiento'],
    },
    {
        id: 'OTHER_PAYABLES',
        label: 'Otras Deudas',
        category: 'BS_LIABILITY',
    },
    {
        id: 'DEFERRED_INCOME',
        label: 'Ingresos Diferidos',
        category: 'BS_LIABILITY',
    },
]

// ============================================================================
// Balance Sheet - Equity
// ============================================================================

const BS_EQUITY: TaxonomyNode[] = [
    {
        id: 'CAPITAL',
        label: 'Capital',
        category: 'BS_EQUITY',
        requiredForKpis: ['roe', 'endeudamiento'],
    },
    {
        id: 'RESERVES',
        label: 'Reservas',
        category: 'BS_EQUITY',
    },
    {
        id: 'RETAINED_EARNINGS',
        label: 'Resultados Acumulados',
        category: 'BS_EQUITY',
        requiredForKpis: ['roe'],
    },
]

// ============================================================================
// Income Statement - Income
// ============================================================================

const IS_INCOME: TaxonomyNode[] = [
    {
        id: 'SALES',
        label: 'Ventas',
        category: 'IS_INCOME',
        requiredForKpis: ['margen_bruto', 'margen_neto'],
    },
    {
        id: 'OTHER_OPERATING_INCOME',
        label: 'Otros Ingresos Operativos',
        category: 'IS_INCOME',
    },
    {
        id: 'FINANCIAL_INCOME',
        label: 'Ingresos Financieros',
        category: 'IS_INCOME',
    },
    {
        id: 'OTHER_INCOME',
        label: 'Otros Ingresos',
        category: 'IS_INCOME',
    },
]

// ============================================================================
// Income Statement - Expenses
// ============================================================================

const IS_EXPENSES: TaxonomyNode[] = [
    {
        id: 'COGS',
        label: 'Costo de Ventas',
        category: 'IS_EXPENSE',
        requiredForKpis: ['margen_bruto'],
    },
    {
        id: 'ADMIN_EXPENSES',
        label: 'Gastos de Administración',
        category: 'IS_EXPENSE',
    },
    {
        id: 'SELLING_EXPENSES',
        label: 'Gastos de Comercialización',
        category: 'IS_EXPENSE',
    },
    {
        id: 'FINANCIAL_EXPENSES',
        label: 'Gastos Financieros',
        category: 'IS_EXPENSE',
    },
    {
        id: 'OTHER_EXPENSES',
        label: 'Otros Gastos',
        category: 'IS_EXPENSE',
    },
]

// ============================================================================
// Full Taxonomy Export
// ============================================================================

/** All taxonomy nodes */
export const TAXONOMY_NODES: TaxonomyNode[] = [
    ...BS_ASSETS,
    ...BS_LIABILITIES,
    ...BS_EQUITY,
    ...IS_INCOME,
    ...IS_EXPENSES,
]

/** Map from StatementGroup ID to TaxonomyNode */
export const TAXONOMY_MAP: Map<StatementGroup, TaxonomyNode> = new Map(
    TAXONOMY_NODES.map(node => [node.id, node])
)

/** Get taxonomy node by ID */
export function getTaxonomyNode(id: StatementGroup): TaxonomyNode | undefined {
    return TAXONOMY_MAP.get(id)
}

/** Get Spanish label for a StatementGroup */
export function getTaxonomyLabel(id: StatementGroup | null): string {
    if (!id) return '(Sin mapear)'
    return TAXONOMY_MAP.get(id)?.label ?? id
}

// ============================================================================
// Suggested Taxonomy by Kind/Section
// ============================================================================

/**
 * Get suggested taxonomy options based on account kind and section
 * Returns the most likely StatementGroup values for dropdown filtering
 */
export function getSuggestedTaxonomy(kind: AccountKind, section?: AccountSection): StatementGroup[] {
    switch (kind) {
        case 'ASSET':
            if (section === 'CURRENT') {
                return ['CASH_AND_BANKS', 'TRADE_RECEIVABLES', 'OTHER_RECEIVABLES', 'TAX_CREDITS', 'INVENTORIES', 'INVESTMENTS']
            }
            if (section === 'NON_CURRENT') {
                return ['PPE', 'INTANGIBLES', 'INVESTMENTS', 'OTHER_RECEIVABLES']
            }
            return ['CASH_AND_BANKS', 'TRADE_RECEIVABLES', 'INVENTORIES', 'PPE', 'INTANGIBLES']

        case 'LIABILITY':
            if (section === 'CURRENT') {
                return ['TRADE_PAYABLES', 'TAX_LIABILITIES', 'PAYROLL_LIABILITIES', 'LOANS', 'OTHER_PAYABLES', 'DEFERRED_INCOME']
            }
            if (section === 'NON_CURRENT') {
                return ['LOANS', 'OTHER_PAYABLES', 'DEFERRED_INCOME']
            }
            return ['TRADE_PAYABLES', 'TAX_LIABILITIES', 'PAYROLL_LIABILITIES', 'LOANS']

        case 'EQUITY':
            return ['CAPITAL', 'RESERVES', 'RETAINED_EARNINGS']

        case 'INCOME':
            return ['SALES', 'OTHER_OPERATING_INCOME', 'FINANCIAL_INCOME', 'OTHER_INCOME']

        case 'EXPENSE':
            if (section === 'COST') return ['COGS']
            if (section === 'ADMIN') return ['ADMIN_EXPENSES']
            if (section === 'SELLING') return ['SELLING_EXPENSES']
            if (section === 'FINANCIAL') return ['FINANCIAL_EXPENSES']
            return ['COGS', 'ADMIN_EXPENSES', 'SELLING_EXPENSES', 'FINANCIAL_EXPENSES', 'OTHER_EXPENSES']

        default:
            return []
    }
}

// ============================================================================
// KPI Requirements
// ============================================================================

/** KPI definitions with required taxonomy nodes */
export const KPI_REQUIREMENTS: Record<string, { label: string; required: StatementGroup[] }> = {
    liquidez: {
        label: 'Liquidez Corriente',
        required: ['CASH_AND_BANKS', 'TRADE_RECEIVABLES', 'INVENTORIES', 'TRADE_PAYABLES'],
    },
    prueba_acida: {
        label: 'Prueba Ácida',
        required: ['CASH_AND_BANKS', 'TRADE_RECEIVABLES', 'TRADE_PAYABLES'],
    },
    capital_trabajo: {
        label: 'Capital de Trabajo',
        required: ['CASH_AND_BANKS', 'TRADE_RECEIVABLES', 'INVENTORIES', 'TRADE_PAYABLES'],
    },
    endeudamiento: {
        label: 'Endeudamiento',
        required: ['LOANS', 'CAPITAL', 'RETAINED_EARNINGS'],
    },
    roe: {
        label: 'ROE',
        required: ['CAPITAL', 'RETAINED_EARNINGS', 'SALES'],
    },
    margen_bruto: {
        label: 'Margen Bruto',
        required: ['SALES', 'COGS'],
    },
}

/**
 * Check which KPIs are available based on mapped taxonomy nodes
 */
export function checkKpiReadiness(mappedTaxonomyIds: Set<StatementGroup>): Record<string, boolean> {
    const result: Record<string, boolean> = {}

    for (const [kpiId, { required }] of Object.entries(KPI_REQUIREMENTS)) {
        result[kpiId] = required.every(tid => mappedTaxonomyIds.has(tid))
    }

    return result
}
