/**
 * Política contable del Estado de Flujo de Efectivo — Fase 2G §6.
 *
 * Política versionada por entidad y (opcionalmente) por ejercicio. Es
 * SERIALIZABLE y persistida (tabla `cashFlowPolicies`, schema v22). Define:
 *  - la clasificación de cada cuenta candidata a efectivo/equivalente con sus
 *    atributos justificatorios (RT 54 párr. 649);
 *  - la política de intereses, dividendos e impuesto a las ganancias
 *    (RT 54 párr. 662-665);
 *  - el tratamiento de sobregiros;
 *  - overrides auditables por cuenta/asiento/operación/línea con vigencia.
 *
 * Historicidad (§6.G): cambiar hoy una clasificación NO debe reclasificar un
 * período cerrado ni un snapshot validado. Por eso las clasificaciones y los
 * overrides llevan `validFrom`/`validTo`, y la política lleva `version`.
 *
 * Este módulo es PURO (sin dependencias de Dexie): el motor y la UI lo
 * consumen; la persistencia vive en `policyRepository.ts`.
 */

/** Rol de una cuenta respecto del efectivo y equivalentes (RT 54 párr. 649). */
export type CashRole =
    | 'CASH'                     // efectivo en caja
    | 'DEMAND_DEPOSIT'           // depósito a la vista
    | 'CASH_EQUIVALENT'          // equivalente de efectivo
    | 'RESTRICTED_FUND'          // fondo restringido: NO integra efectivo
    | 'NON_EQUIVALENT_INVESTMENT'// inversión que no es equivalente
    | 'OVERDRAFT'                // sobregiro/adelanto en cuenta corriente
    | 'EXCLUDED'                 // explícitamente excluido del efectivo

export type ActivityClass = 'OPERATING' | 'INVESTING' | 'FINANCING'
export type OverrideClass = ActivityClass | 'CASH_EQUIVALENT' | 'NOT_APPLICABLE'
export type OverrideTarget = 'ACCOUNT' | 'ENTRY' | 'OPERATION' | 'LINE'

/** Atributos que justifican considerar una cuenta como equivalente de efectivo. */
export interface CashEquivalentAttributes {
    /** finalidad de administración del efectivo (no de inversión) */
    purpose?: string
    highLiquidity?: boolean
    convertibleToKnownAmount?: boolean
    insignificantRisk?: boolean
    /** vencimiento corto desde la adquisición (ej. ≤ 3 meses) */
    shortMaturity?: boolean
    restricted?: boolean
}

export interface CashAccountClassification {
    accountId: string
    role: CashRole
    attributes?: CashEquivalentAttributes
    /** texto pedagógico que explica la clasificación */
    justification?: string
    validFrom?: string
    validTo?: string
}

export interface CashFlowOverride {
    id: string
    target: OverrideTarget
    /** id de la cuenta, asiento, operación o línea según `target` */
    targetId: string
    classification: OverrideClass
    reason: string
    /** usuario o fuente que registró el override */
    source: string
    createdAt: string
    validFrom?: string
    validTo?: string
    version: number
}

export interface CashFlowPolicy {
    id: string
    companyId: string
    /** null = política por defecto de la empresa; si no, aplica a un ejercicio */
    exerciseId: string | null
    version: number
    status: 'ACTIVE' | 'SUPERSEDED'
    /** política heredada por migración que requiere revisión del usuario */
    requiresReview: boolean
    createdAt: string
    updatedAt: string
    source: string
    cashClassifications: CashAccountClassification[]
    // Políticas de partidas específicas (RT 54 párr. 662-665)
    interestsPaid: 'OPERATING' | 'FINANCING'
    interestsReceived: 'OPERATING' | 'INVESTING'
    dividendsPaid: 'FINANCING' | 'OPERATING'
    dividendsReceived: 'OPERATING' | 'INVESTING'
    /** operativo por defecto; SPECIFIC permite asociación con inversión/financiación */
    incomeTax: 'OPERATING' | 'SPECIFIC'
    /** sobregiros: componente del efectivo o pasivo de financiación */
    overdrafts: 'CASH_COMPONENT' | 'FINANCING'
    overrides: CashFlowOverride[]
    notes?: string
}

export const CASH_FLOW_POLICY_VERSION = 1

/** Política por defecto (RT 54 por defecto: intereses/dividendos/IG operativos salvo dividendos pagados). */
export function defaultCashFlowPolicy(companyId: string, opts: Partial<CashFlowPolicy> = {}): CashFlowPolicy {
    const now = new Date().toISOString()
    return {
        id: opts.id ?? `efe-policy-${companyId}`,
        companyId,
        exerciseId: opts.exerciseId ?? null,
        version: opts.version ?? 1,
        status: opts.status ?? 'ACTIVE',
        requiresReview: opts.requiresReview ?? false,
        createdAt: opts.createdAt ?? now,
        updatedAt: now,
        source: opts.source ?? 'default',
        cashClassifications: opts.cashClassifications ?? [],
        interestsPaid: opts.interestsPaid ?? 'OPERATING',
        interestsReceived: opts.interestsReceived ?? 'OPERATING',
        dividendsPaid: opts.dividendsPaid ?? 'FINANCING',
        dividendsReceived: opts.dividendsReceived ?? 'OPERATING',
        incomeTax: opts.incomeTax ?? 'OPERATING',
        overdrafts: opts.overdrafts ?? 'CASH_COMPONENT',
        overrides: opts.overrides ?? [],
        notes: opts.notes,
    }
}

interface LegacyAccountLike {
    id: string
    statementGroup?: string | null
    cashFlowCategory?: string
}

/**
 * Deriva de forma DETERMINISTA una política heredada a partir de la metadata de
 * cuentas existente (Fase 2F). Marca `requiresReview` porque la política previa
 * consideraba equivalente TODA cuenta de Caja y Bancos, sin evaluar riesgo,
 * plazo ni restricción (§6.A). No pierde ni altera datos: sólo describe.
 */
export function deriveLegacyPolicy(companyId: string, accounts: LegacyAccountLike[]): CashFlowPolicy {
    const cashClassifications: CashAccountClassification[] = accounts
        .filter(a => a.statementGroup === 'CASH_AND_BANKS' || a.cashFlowCategory === 'CASH_EQUIVALENT')
        .map(a => ({
            accountId: a.id,
            role: a.cashFlowCategory === 'CASH_EQUIVALENT' ? 'CASH_EQUIVALENT' as const : 'CASH' as const,
            justification: 'Clasificación heredada (Fase 2F). Revisar: la política previa consideraba equivalente toda cuenta de Caja y Bancos sin evaluar liquidez, riesgo ni plazo.',
        }))
    return defaultCashFlowPolicy(companyId, {
        requiresReview: true,
        source: 'migration-v22',
        cashClassifications,
    })
}

function withinValidity(from: string | undefined, to: string | undefined, date: string): boolean {
    if (from && date < from) return false
    if (to && date > to) return false
    return true
}

/**
 * Rol de efectivo efectivo de una cuenta según la política a una fecha. Devuelve
 * null si la política no la clasifica (el motor cae a su derivación estructural).
 */
export function effectiveCashRole(policy: CashFlowPolicy | null | undefined, accountId: string, date: string): CashRole | null {
    if (!policy) return null
    const hit = policy.cashClassifications.find(c => c.accountId === accountId && withinValidity(c.validFrom, c.validTo, date))
    return hit ? hit.role : null
}

/**
 * Override efectivo (el más específico y vigente) para un objetivo a una fecha.
 * Precedencia: LINE > OPERATION > ENTRY > ACCOUNT.
 */
export function effectiveOverride(
    policy: CashFlowPolicy | null | undefined,
    targets: Partial<Record<OverrideTarget, string>>,
    date: string,
): CashFlowOverride | null {
    if (!policy) return null
    const order: OverrideTarget[] = ['LINE', 'OPERATION', 'ENTRY', 'ACCOUNT']
    for (const t of order) {
        const id = targets[t]
        if (!id) continue
        const match = policy.overrides
            .filter(o => o.target === t && o.targetId === id && withinValidity(o.validFrom, o.validTo, date))
            .sort((a, b) => b.version - a.version)[0]
        if (match) return match
    }
    return null
}

/** Un rol de efectivo que SÍ integra "efectivo y equivalentes". */
export function roleCountsAsCash(role: CashRole, overdrafts: CashFlowPolicy['overdrafts']): boolean {
    if (role === 'CASH' || role === 'DEMAND_DEPOSIT' || role === 'CASH_EQUIVALENT') return true
    if (role === 'OVERDRAFT') return overdrafts === 'CASH_COMPONENT'
    return false // RESTRICTED_FUND, NON_EQUIVALENT_INVESTMENT, EXCLUDED
}
