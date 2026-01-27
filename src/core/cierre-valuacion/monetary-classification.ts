/**
 * Monetary Classification Module
 *
 * Classifies accounts as MONETARY or NON_MONETARY for RT6 inflation adjustment.
 *
 * MONETARY items: Cash, receivables, payables (subject to RECPAM)
 * NON_MONETARY items: PPE, inventory, equity, results (subject to coefficient adjustment)
 */

import type { Account, AccountKind, StatementGroup } from '../models';
import type { ExtendedGrupo } from './classification';

/**
 * Monetary classification type (robust enum)
 *
 * - MONETARY: Exposed to inflation (cash, receivables, payables)
 * - NON_MONETARY: Requires coefficient reexpression (PPE, inventory, equity)
 * - FX_PROTECTED: Foreign currency monetary items (need FX valuation, not inflation adj)
 * - INDEFINIDA: Unclassified - requires user action
 */
export type MonetaryClass = 'MONETARY' | 'NON_MONETARY' | 'FX_PROTECTED' | 'INDEFINIDA';

/**
 * Valuation method for RT17
 */
export type ValuationMethod = 'FX' | 'VNR' | 'VPP' | 'REPOSICION' | 'REVALUO' | 'MANUAL' | 'NA';

/**
 * Account override settings
 */
export interface AccountOverride {
    /** Manual monetary classification override */
    classification?: MonetaryClass;
    /** Mark as FX protected (foreign currency) */
    isFxProtected?: boolean;
    /** Manual origin date for all movements */
    manualOriginDate?: string;
    /** Exclude from automatic calculation */
    exclude?: boolean;
    /** User has validated this classification */
    validated?: boolean;
    /** Suggested valuation method for RT17 */
    valuationMethod?: ValuationMethod;
}

/**
 * Get initial monetary classification for an account based on heuristics
 *
 * Priority order:
 * 1. Account Kind (EQUITY, INCOME, EXPENSE always NON_MONETARY)
 * 2. Statement Group (explicit mapping)
 * 3. Code Prefix (hierarchical patterns)
 * 4. Name Keywords (fallback)
 * 5. Default: MONETARY (safer to require user validation)
 *
 * @param account - Account to classify
 * @returns Monetary classification
 */
export function getInitialMonetaryClass(account: Account): MonetaryClass {
    // Rule 1: Kind-based classification (highest priority)
    if (account.kind === 'EQUITY') return 'NON_MONETARY'; // PN always non-monetary
    if (account.kind === 'INCOME' || account.kind === 'EXPENSE') {
        return 'NON_MONETARY'; // Results always non-monetary
    }

    // Rule 1.5: Foreign currency accounts => FX_PROTECTED (BEFORE code prefix!)
    // "Caja Moneda Extranjera" has code 1.1.01.* but needs special FX treatment
    // They maintain value but need FX valuation, not inflation coefficient
    if (isForeignCurrencyAccount(account)) {
        return 'FX_PROTECTED';
    }

    // Rule 2: Statement Group (explicit mapping)
    if (account.statementGroup) {
        const groupClass = getMonetaryClassByStatementGroup(account.statementGroup);
        if (groupClass) return groupClass;
    }

    // Rule 3: Code Prefix (hierarchical patterns)
    const codeClass = getMonetaryClassByCodePrefix(account.code);
    if (codeClass) return codeClass;

    // Rule 4: Name Keywords (fallback heuristic)
    const nameClass = getMonetaryClassByName(account.name);
    if (nameClass) return nameClass;

    // Rule 5: Default to INDEFINIDA (requires user action)
    // This ensures unclassified accounts are visible and require user classification
    return 'INDEFINIDA';
}

/**
 * Map Statement Group to Monetary Class
 */
function getMonetaryClassByStatementGroup(group: StatementGroup): MonetaryClass | null {
    const mapping: Partial<Record<StatementGroup, MonetaryClass>> = {
        // MONETARY Assets
        CASH_AND_BANKS: 'MONETARY',
        TRADE_RECEIVABLES: 'MONETARY',
        OTHER_RECEIVABLES: 'MONETARY',
        TAX_CREDITS: 'MONETARY',

        // NON_MONETARY Assets
        INVENTORIES: 'NON_MONETARY',
        PPE: 'NON_MONETARY',
        INTANGIBLES: 'NON_MONETARY',
        INVESTMENTS: 'NON_MONETARY', // Typically stocks, real estate

        // MONETARY Liabilities
        TRADE_PAYABLES: 'MONETARY',
        TAX_LIABILITIES: 'MONETARY',
        PAYROLL_LIABILITIES: 'MONETARY',
        LOANS: 'MONETARY',
        OTHER_PAYABLES: 'MONETARY',
        DEFERRED_INCOME: 'MONETARY',

        // NON_MONETARY Equity (always)
        CAPITAL: 'NON_MONETARY',
        RESERVES: 'NON_MONETARY',
        RETAINED_EARNINGS: 'NON_MONETARY',

        // NON_MONETARY Results (always)
        SALES: 'NON_MONETARY',
        OTHER_OPERATING_INCOME: 'NON_MONETARY',
        COGS: 'NON_MONETARY',
        ADMIN_EXPENSES: 'NON_MONETARY',
        SELLING_EXPENSES: 'NON_MONETARY',
        FINANCIAL_INCOME: 'NON_MONETARY',
        FINANCIAL_EXPENSES: 'NON_MONETARY',
        OTHER_INCOME: 'NON_MONETARY',
        OTHER_EXPENSES: 'NON_MONETARY',
    };

    return mapping[group] || null;
}

/**
 * Infer Monetary Class by Code Prefix (Plan de Cuentas hierarchy)
 *
 * Typical Argentine Plan de Cuentas structure:
 * 1.1.01 - Caja y Bancos (MONETARY)
 * 1.1.02 - Créditos por Ventas (MONETARY)
 * 1.1.03 - Otros Créditos / IVA (MONETARY)
 * 1.1.04 - Anticipos / Créditos Fiscales (MONETARY)
 * 1.2.01 - Mercaderías (NON_MONETARY)
 * 1.2.02 - Bienes de Uso (NON_MONETARY)
 * 1.2.03 - Intangibles (NON_MONETARY)
 * 1.2.04 - Inversiones (NON_MONETARY - typically non-monetary investments)
 * 2.1.* - Deudas Corrientes (MONETARY)
 * 2.2.* - Deudas No Corrientes (MONETARY)
 * 3.* - PN (NON_MONETARY)
 * 4.* - Resultados (NON_MONETARY)
 */
function getMonetaryClassByCodePrefix(code: string): MonetaryClass | null {
    const c = code.trim();

    // ==========================================
    // ACTIVO CORRIENTE
    // ==========================================

    // Caja y Bancos (MONETARY) - but note: foreign currency sub-accounts
    // will be caught by name keywords as NON_MONETARY
    if (c.startsWith('1.1.01')) return 'MONETARY';

    // Créditos por Ventas (MONETARY)
    if (c.startsWith('1.1.02')) return 'MONETARY';

    // Otros Créditos / IVA Crédito Fiscal (MONETARY)
    if (c.startsWith('1.1.03')) return 'MONETARY';
    if (c.startsWith('1.1.04')) return 'MONETARY'; // Anticipos, más créditos

    // ==========================================
    // ACTIVO NO CORRIENTE
    // ==========================================

    // Bienes de Cambio / Inventories (NON_MONETARY)
    if (c.startsWith('1.2.01')) return 'NON_MONETARY';

    // Bienes de Uso / PPE (NON_MONETARY)
    if (c.startsWith('1.2.02')) return 'NON_MONETARY';

    // Intangibles (NON_MONETARY)
    if (c.startsWith('1.2.03')) return 'NON_MONETARY';

    // Inversiones No Corrientes (typically NON_MONETARY: participaciones, inmuebles)
    if (c.startsWith('1.2.04')) return 'NON_MONETARY';
    if (c.startsWith('1.2.05')) return 'NON_MONETARY';

    // ==========================================
    // PASIVO (generally MONETARY)
    // ==========================================
    if (c.startsWith('2.1')) return 'MONETARY'; // Deudas Corrientes
    if (c.startsWith('2.2')) return 'MONETARY'; // Deudas No Corrientes

    // ==========================================
    // PATRIMONIO NETO (always NON_MONETARY)
    // ==========================================
    if (c.startsWith('3')) return 'NON_MONETARY';

    // ==========================================
    // RESULTADOS (always NON_MONETARY)
    // ==========================================
    if (c.startsWith('4') || c.startsWith('5')) return 'NON_MONETARY';

    // No clear prefix match
    return null;
}

/**
 * Infer Monetary Class by Account Name Keywords (last resort)
 *
 * IMPORTANT RT6 FLOW RULES:
 * - "Moneda extranjera" / foreign currency accounts => NON_MONETARY
 *   (Even though conceptually monetary, for RT6 they need coefficient adjustment)
 * - IVA accounts => MONETARY (IVA Crédito Fiscal, IVA Débito Fiscal)
 */
function getMonetaryClassByName(name: string): MonetaryClass | null {
    const lowerName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // ==========================================
    // RT6 SPECIAL RULES (highest priority within name matching)
    // ==========================================

    // Foreign currency accounts => FX_PROTECTED (they need FX valuation)
    const foreignCurrencyKeywords = [
        'moneda extranjera',
        'dolar',
        'dolares',
        'usd',
        'euro',
        'divisa',
        'exterior',
    ];
    if (foreignCurrencyKeywords.some(kw => lowerName.includes(kw))) {
        return 'FX_PROTECTED';
    }

    // IVA accounts => MONETARY (they are typical exposed items)
    const ivaKeywords = [
        'iva credito',
        'iva debito',
        'iva cf',
        'iva df',
        'credito fiscal',
        'debito fiscal',
    ];
    if (ivaKeywords.some(kw => lowerName.includes(kw))) {
        return 'MONETARY';
    }

    // ==========================================
    // MONETARY keywords (typical exposed items)
    // ==========================================
    const monetaryKeywords = [
        'caja',
        'banco',
        'efectivo',
        'deudor',
        'credito',
        'acreedor',
        'proveedor',
        'cliente',
        'deuda',
        'préstamo',
        'prestamo',
        'financiacion',
        'pagar',
        'cobrar',
        // Payroll and tax liabilities
        'sueldo',
        'salario',
        'remuneracion',
        'cargas sociales',
        'contribucion',
        'impuesto',
        'anticipo',
        'retención',
        'retencion',
        'percepcion',
        // Other receivables/payables
        'a cobrar',
        'a pagar',
        'documentos',
        'cheque',
    ];

    // NON_MONETARY keywords (items that need coefficient adjustment)
    const nonMonetaryKeywords = [
        'mercaderia',
        'mercadería',
        'stock',
        'inventario',
        'bienes de uso',
        'rodado',
        'inmueble',
        'mueble',
        'utiles',
        'útiles',
        'herramienta',
        'maquinaria',
        'equipo',
        'instalacion',
        'instalación',
        'intangible',
        'marca',
        'patente',
        'capital',
        'resultado',
        'venta',
        'compra',
        'gasto',
        'ingreso',
        // Investments in non-monetary assets
        'inversion',
        'inversión',
        'participacion',
        'participación',
    ];

    // Check MONETARY keywords
    if (monetaryKeywords.some(kw => lowerName.includes(kw))) {
        return 'MONETARY';
    }

    // Check NON_MONETARY keywords
    if (nonMonetaryKeywords.some(kw => lowerName.includes(kw))) {
        return 'NON_MONETARY';
    }

    // No keyword match
    return null;
}

/**
 * Apply user overrides to classification
 *
 * @param accountId - Account ID
 * @param initialClass - Initial classification from heuristics
 * @param overrides - User overrides map
 * @returns Final classification (override or initial)
 */
export function applyOverrides(
    accountId: string,
    initialClass: MonetaryClass,
    overrides: Record<string, AccountOverride>
): MonetaryClass {
    const override = overrides[accountId];
    if (!override) return initialClass;
    if (override.isFxProtected) return 'FX_PROTECTED';
    return override.classification || initialClass;
}

/**
 * Get account type (ACTIVO/PASIVO/PN) from account kind
 * Re-export from classification for convenience
 */
export function getAccountType(account: Account): ExtendedGrupo {
    const kindMap: Record<AccountKind, ExtendedGrupo> = {
        ASSET: 'ACTIVO',
        LIABILITY: 'PASIVO',
        EQUITY: 'PN',
        INCOME: 'RESULTADOS',
        EXPENSE: 'RESULTADOS',
    };
    return kindMap[account.kind] || 'ACTIVO';
}

/**
 * Check if account should be excluded from RT6 calculation
 */
export function isExcluded(
    accountId: string,
    overrides: Record<string, AccountOverride>
): boolean {
    return overrides[accountId]?.exclude === true;
}

/**
 * Check if account classification has been validated by user
 */
export function isValidated(
    accountId: string,
    overrides: Record<string, AccountOverride>
): boolean {
    return overrides[accountId]?.validated === true;
}

/**
 * Check if account is a foreign currency account
 *
 * For RT6 purposes, foreign currency accounts are:
 * - Technically MONETARY (cash equivalents)
 * - BUT shown in Non-Monetary tab as "Monetaria no expuesta"
 * - They need special treatment: valuation at exchange rate, not index reexpression
 *
 * @param account - Account to check
 * @returns true if account is a foreign currency account
 */
export function isForeignCurrencyAccount(account: Account): boolean {
    const lowerName = account.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const foreignCurrencyKeywords = [
        'moneda extranjera',
        'dolar',
        'dolares',
        'usd',
        'euro',
        'divisa',
        'exterior',
    ];

    return foreignCurrencyKeywords.some(kw => lowerName.includes(kw));
}

/**
 * Check if account is foreign currency by code and name (for partidas)
 */
export function isForeignCurrencyByCodeName(_code: string, name: string): boolean {
    const lowerName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const foreignCurrencyKeywords = [
        'moneda extranjera',
        'dolar',
        'dolares',
        'usd',
        'euro',
        'divisa',
        'exterior',
    ];

    return foreignCurrencyKeywords.some(kw => lowerName.includes(kw));
}

/**
 * Get accounts grouped by monetary classification
 */
export interface MonetaryClassificationResult {
    monetary: Account[];
    nonMonetary: Account[];
    fxProtected: Account[];
    indefinida: Account[];
    excluded: Account[];
}

/**
 * Classify all accounts with overrides applied
 */
export function classifyAccounts(
    accounts: Account[],
    overrides: Record<string, AccountOverride>
): MonetaryClassificationResult {
    const result: MonetaryClassificationResult = {
        monetary: [],
        nonMonetary: [],
        fxProtected: [],
        indefinida: [],
        excluded: [],
    };

    for (const account of accounts) {
        // Skip if excluded
        if (isExcluded(account.id, overrides)) {
            result.excluded.push(account);
            continue;
        }

        // Get classification
        const initialClass = getInitialMonetaryClass(account);
        const finalClass = applyOverrides(account.id, initialClass, overrides);

        // Group by classification
        switch (finalClass) {
            case 'MONETARY':
                result.monetary.push(account);
                break;
            case 'FX_PROTECTED':
                result.fxProtected.push(account);
                break;
            case 'INDEFINIDA':
                result.indefinida.push(account);
                break;
            default:
                result.nonMonetary.push(account);
        }
    }

    return result;
}

/**
 * Check if classification needs user attention
 */
export function needsClassification(classification: MonetaryClass): boolean {
    return classification === 'INDEFINIDA';
}

/**
 * Get human-readable label for classification
 */
export function getClassificationLabel(classification: MonetaryClass): string {
    const labels: Record<MonetaryClass, string> = {
        'MONETARY': 'Monetaria',
        'NON_MONETARY': 'No Monetaria',
        'FX_PROTECTED': 'Monetaria no expuesta',
        'INDEFINIDA': 'Sin clasificar',
    };
    return labels[classification] || classification;
}

/**
 * Resolution result for valuation method suggestion
 */
export interface ValuationMethodResolution {
    method: ValuationMethod;
    reason: string;
    help?: string;
    fxRateType?: 'compra' | 'venta';
}

/**
 * Resolve valuation method based on account characteristics and classification.
 * This is the primary resolver used by RT17 Drawer.
 */
export function resolveValuationMethod(
    account: Account,
    classification: MonetaryClass,
    override?: AccountOverride
): ValuationMethodResolution {
    // 0) User override wins
    if (override?.valuationMethod) {
        return {
            method: override.valuationMethod,
            reason: 'Metodo definido manualmente',
        };
    }

    // 1) PN accounts don't require valuation
    if (account.kind === 'EQUITY') {
        return {
            method: 'NA',
            reason: 'Cuenta de Patrimonio Neto',
        };
    }

    const normalize = (str: string) =>
        str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const lowerName = normalize(account.name || '');
    const accountType = getAccountType(account);

    // 2) Foreign currency -> FX (monetaria no expuesta)
    if (classification === 'FX_PROTECTED' || isForeignCurrencyAccount(account)) {
        const fxRateType = accountType === 'PASIVO' ? 'compra' : 'venta';
        return {
            method: 'FX',
            reason: 'Moneda extranjera',
            fxRateType,
            help: fxRateType === 'venta'
                ? 'Activos: usar tipo de cambio vendedor/venta.'
                : 'Pasivos: usar tipo de cambio comprador/compra.',
        };
    }

    // 3) Inventories -> Replacement cost
    if (
        account.statementGroup === 'INVENTORIES' ||
        account.code.startsWith('1.2.01') ||
        lowerName.includes('mercader') ||
        lowerName.includes('stock') ||
        lowerName.includes('inventar')
    ) {
        return {
            method: 'REPOSICION',
            reason: 'Bienes de cambio / inventarios',
        };
    }

    // 4) PPE -> Technical revaluation (unless depreciation/contra)
    const isDepreciationLike =
        account.isContra ||
        lowerName.includes('amortiz') ||
        lowerName.includes('depreciac') ||
        lowerName.includes('agotam') ||
        lowerName.includes('acumulad');
    if (
        account.statementGroup === 'PPE' ||
        account.code.startsWith('1.2.02') ||
        lowerName.includes('bienes de uso') ||
        lowerName.includes('rodado') ||
        lowerName.includes('inmueble') ||
        lowerName.includes('maquinaria')
    ) {
        if (isDepreciationLike) {
            return {
                method: 'NA',
                reason: 'Cuenta regularizadora / amortizacion acumulada',
            };
        }
        return {
            method: 'REVALUO',
            reason: 'Bienes de uso',
        };
    }

    // 5) Investments -> VPP or VNR/mercado
    const looksLikeVPP =
        lowerName.includes('particip') ||
        lowerName.includes('control') ||
        lowerName.includes('influencia') ||
        lowerName.includes('vpp');
    if (
        account.statementGroup === 'INVESTMENTS' ||
        account.code.startsWith('1.2.04') ||
        account.code.startsWith('1.2.05') ||
        lowerName.includes('inversion') ||
        lowerName.includes('acciones') ||
        lowerName.includes('bono') ||
        lowerName.includes('titulo')
    ) {
        return looksLikeVPP
            ? { method: 'VPP', reason: 'Participacion / influencia significativa' }
            : { method: 'VNR', reason: 'Inversion con mercado / valor corriente' };
    }

    // 6) Default
    return {
        method: 'MANUAL',
        reason: 'Sin heuristica especifica',
    };
}

/**
 * Suggest valuation method based on account characteristics
 */
export function suggestValuationMethod(
    account: Account,
    classification: MonetaryClass
): ValuationMethod {
    return resolveValuationMethod(account, classification).method;
}
