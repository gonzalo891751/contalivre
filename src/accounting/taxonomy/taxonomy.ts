/**
 * Taxonomía contable estructurada — Fase 2A
 *
 * Fuente única de clasificación de cuentas. Las reglas críticas se leen de
 * metadata persistida en la cuenta (materializada por la migración v17);
 * la derivación desde kind/section/statementGroup existe solo como respaldo
 * documentado para cuentas creadas antes de v17 o importadas sin metadata.
 *
 * Correcciones clave respecto del estado anterior (ACC-007 / ACC-009):
 * - Bienes de Cambio (statementGroup INVENTORIES, seed 1.1.04) => NON_MONETARY.
 * - Bienes de Uso / Intangibles => NON_MONETARY.
 * - Caja/Bancos, créditos y deudas en moneda => MONETARY.
 * - Cuentas agrupadoras (isHeader) => isPostable: false.
 * - Ninguna regla crítica depende del nombre o del prefijo del código.
 */

import type {
    Account,
    AccountClass,
    AccountKind,
    CurrentClassification,
    MonetaryClassification,
    NormalSide,
    StatementGroup,
} from '../../core/models'

export const TAXONOMY_METADATA_VERSION = 1

// ─────────────────────────────────────────────────────────────
// Derivación estructurada (respaldo para cuentas sin metadata)
// ─────────────────────────────────────────────────────────────

const KIND_TO_CLASS: Record<AccountKind, AccountClass> = {
    ASSET: 'ASSET',
    LIABILITY: 'LIABILITY',
    EQUITY: 'EQUITY',
    INCOME: 'REVENUE',
    EXPENSE: 'EXPENSE',
}

/** Mapa único statementGroup -> clasificación monetaria */
const STATEMENT_GROUP_MONETARY: Record<StatementGroup, MonetaryClassification> = {
    CASH_AND_BANKS: 'MONETARY',
    TRADE_RECEIVABLES: 'MONETARY',
    OTHER_RECEIVABLES: 'MONETARY',
    TAX_CREDITS: 'MONETARY',
    INVENTORIES: 'NON_MONETARY',      // ACC-009: Bienes de Cambio NO monetarios
    PPE: 'NON_MONETARY',
    INTANGIBLES: 'NON_MONETARY',
    INVESTMENTS: 'MIXED',             // depende del instrumento; requiere revisión por cuenta
    TRADE_PAYABLES: 'MONETARY',
    TAX_LIABILITIES: 'MONETARY',
    PAYROLL_LIABILITIES: 'MONETARY',
    LOANS: 'MONETARY',
    OTHER_PAYABLES: 'MONETARY',
    DEFERRED_INCOME: 'MONETARY',
    CAPITAL: 'NON_MONETARY',
    RESERVES: 'NON_MONETARY',
    RETAINED_EARNINGS: 'NON_MONETARY',
    SALES: 'NON_MONETARY',
    OTHER_OPERATING_INCOME: 'NON_MONETARY',
    COGS: 'NON_MONETARY',
    ADMIN_EXPENSES: 'NON_MONETARY',
    SELLING_EXPENSES: 'NON_MONETARY',
    FINANCIAL_INCOME: 'NON_MONETARY',
    FINANCIAL_EXPENSES: 'NON_MONETARY',
    OTHER_INCOME: 'NON_MONETARY',
    OTHER_EXPENSES: 'NON_MONETARY',
    INCOME_TAX: 'NON_MONETARY',
}

export function deriveAccountClass(account: Account): AccountClass {
    if (account.accountClass) return account.accountClass
    return KIND_TO_CLASS[account.kind] ?? 'OTHER'
}

export function deriveCurrentClassification(account: Account): CurrentClassification {
    if (account.currentClassification) return account.currentClassification
    if (account.kind === 'ASSET' || account.kind === 'LIABILITY') {
        return account.section === 'NON_CURRENT' ? 'NON_CURRENT' : 'CURRENT'
    }
    return 'NOT_APPLICABLE'
}

export function deriveMonetaryClassification(account: Account): MonetaryClassification {
    // 1) Metadata persistida gana siempre
    if (account.monetaryClassification) return account.monetaryClassification
    // 2) PN y resultados: no monetarios a efectos de reexpresión
    if (account.kind === 'EQUITY' || account.kind === 'INCOME' || account.kind === 'EXPENSE') {
        return 'NON_MONETARY'
    }
    // 3) statementGroup estructurado
    if (account.statementGroup) {
        const cls = STATEMENT_GROUP_MONETARY[account.statementGroup]
        if (cls) return cls
    }
    // 4) Sin metadata suficiente: exigir clasificación explícita
    return 'NOT_APPLICABLE'
}

/** ¿La cuenta admite imputaciones? (agrupadoras NO) */
export function isPostableAccount(account: Account): boolean {
    if (typeof account.isPostable === 'boolean') return account.isPostable
    return !account.isHeader
}

/** ¿La cuenta está activa para nuevas imputaciones? */
export function isActiveAccount(account: Account): boolean {
    return account.active !== false
}

export function deriveNormalBalance(account: Account): NormalSide {
    return account.normalBalance ?? account.normalSide ??
        (['ASSET', 'EXPENSE'].includes(account.kind) ? 'DEBIT' : 'CREDIT')
}

/**
 * Materializa la taxonomía estructurada sobre una cuenta existente.
 * Idempotente: no pisa metadata ya asignada.
 */
export function materializeTaxonomy(account: Account, companyId: string): Account {
    return {
        ...account,
        companyId: account.companyId ?? companyId,
        active: account.active ?? true,
        isPostable: account.isPostable ?? !account.isHeader,
        normalBalance: account.normalBalance ?? deriveNormalBalance(account),
        accountClass: account.accountClass ?? deriveAccountClass(account),
        currentClassification: account.currentClassification ?? deriveCurrentClassification(account),
        monetaryClassification: account.monetaryClassification ?? deriveMonetaryClassification(account),
        metadataVersion: TAXONOMY_METADATA_VERSION,
    }
}

// ─────────────────────────────────────────────────────────────
// Validación del plan de cuentas
// ─────────────────────────────────────────────────────────────

export interface ChartValidationIssue {
    accountId?: string
    code?: string
    severity: 'error' | 'warning'
    message: string
}

/**
 * Valida integridad estructural del plan:
 * códigos/IDs duplicados, padres inexistentes, ciclos jerárquicos,
 * imputables con hijos, incompatibilidades de naturaleza.
 */
export function validateChartOfAccounts(accounts: Account[]): ChartValidationIssue[] {
    const issues: ChartValidationIssue[] = []
    const byId = new Map<string, Account>()
    const byCode = new Map<string, Account>()
    const childrenOf = new Map<string, Account[]>()

    for (const acc of accounts) {
        if (byId.has(acc.id)) {
            issues.push({ accountId: acc.id, code: acc.code, severity: 'error', message: `ID duplicado: ${acc.id}` })
        }
        byId.set(acc.id, acc)
        const codeKey = `${acc.companyId ?? 'default'}::${acc.code}`
        if (byCode.has(codeKey)) {
            issues.push({ accountId: acc.id, code: acc.code, severity: 'error', message: `Código duplicado en la empresa: ${acc.code}` })
        }
        byCode.set(codeKey, acc)
        if (acc.parentId) {
            const list = childrenOf.get(acc.parentId) ?? []
            list.push(acc)
            childrenOf.set(acc.parentId, list)
        }
    }

    for (const acc of accounts) {
        // Padre inexistente
        if (acc.parentId && !byId.has(acc.parentId)) {
            issues.push({ accountId: acc.id, code: acc.code, severity: 'error', message: `La cuenta ${acc.code} "${acc.name}" referencia un padre inexistente (${acc.parentId})` })
        }
        // Ciclo jerárquico
        const seen = new Set<string>([acc.id])
        let cursor = acc.parentId
        while (cursor) {
            if (seen.has(cursor)) {
                issues.push({ accountId: acc.id, code: acc.code, severity: 'error', message: `Ciclo jerárquico detectado en la cuenta ${acc.code} "${acc.name}"` })
                break
            }
            seen.add(cursor)
            cursor = byId.get(cursor)?.parentId ?? null
        }
        // Imputable con hijos
        if (isPostableAccount(acc) && (childrenOf.get(acc.id)?.length ?? 0) > 0) {
            issues.push({ accountId: acc.id, code: acc.code, severity: 'warning', message: `La cuenta ${acc.code} "${acc.name}" es imputable pero tiene cuentas hijas` })
        }
        // ASSET con naturaleza acreedora sin ser regularizadora
        const normal = deriveNormalBalance(acc)
        if (acc.kind === 'ASSET' && normal === 'CREDIT' && !acc.isContra) {
            issues.push({ accountId: acc.id, code: acc.code, severity: 'error', message: `La cuenta de activo ${acc.code} "${acc.name}" tiene naturaleza acreedora sin estar marcada como regularizadora` })
        }
        if (acc.kind === 'LIABILITY' && normal === 'DEBIT' && !acc.isContra) {
            issues.push({ accountId: acc.id, code: acc.code, severity: 'error', message: `La cuenta de pasivo ${acc.code} "${acc.name}" tiene naturaleza deudora sin estar marcada como regularizadora` })
        }
    }

    return issues
}
