/**
 * Catálogo canónico de líneas consolidadas y derivación desde la taxonomía
 * existente (Fase 2K §7).
 *
 * El motor NO depende de nombres de cuenta. La línea consolidada se deriva de
 * la clasificación estructural que ya lleva cada cuenta (kind, clasificación
 * corriente/no corriente y statementGroup), que es la misma que alimenta el
 * ESP y el ER individuales. El mapeo explícito sólo sirve para corregir o
 * afinar esa derivación, no para sostenerla.
 */

import type { Account } from '../../core/models'
import type {
    ConsolidatedLineId,
    ConsolidatedLineSpec,
    ConsolidatedSection,
    IntragroupCategory,
} from './types'

export const CONSOLIDATED_LINES: ConsolidatedLineSpec[] = [
    // ── Activo corriente ──
    { id: 'AC_CAJA_BANCOS', label: 'Caja y bancos', section: 'ASSET_CURRENT', sortOrder: 110, naturalSign: 1 },
    { id: 'AC_CREDITOS_VENTAS', label: 'Créditos por ventas', section: 'ASSET_CURRENT', sortOrder: 120, naturalSign: 1 },
    { id: 'AC_OTROS_CREDITOS', label: 'Otros créditos', section: 'ASSET_CURRENT', sortOrder: 130, naturalSign: 1 },
    { id: 'AC_BIENES_CAMBIO', label: 'Bienes de cambio', section: 'ASSET_CURRENT', sortOrder: 140, naturalSign: 1 },
    { id: 'AC_INVERSIONES', label: 'Inversiones', section: 'ASSET_CURRENT', sortOrder: 150, naturalSign: 1 },
    { id: 'AC_OTROS', label: 'Otros activos corrientes', section: 'ASSET_CURRENT', sortOrder: 190, naturalSign: 1 },
    // ── Activo no corriente ──
    { id: 'ANC_CREDITOS', label: 'Créditos', section: 'ASSET_NON_CURRENT', sortOrder: 210, naturalSign: 1 },
    { id: 'ANC_INVERSIONES', label: 'Inversiones permanentes', section: 'ASSET_NON_CURRENT', sortOrder: 220, naturalSign: 1 },
    { id: 'ANC_BIENES_USO', label: 'Bienes de uso', section: 'ASSET_NON_CURRENT', sortOrder: 230, naturalSign: 1 },
    { id: 'ANC_INTANGIBLES', label: 'Activos intangibles', section: 'ASSET_NON_CURRENT', sortOrder: 240, naturalSign: 1 },
    { id: 'ANC_LLAVE_NEGOCIO', label: 'Llave de negocio (diferencia de consolidación)', section: 'ASSET_NON_CURRENT', sortOrder: 250, naturalSign: 1 },
    { id: 'ANC_OTROS', label: 'Otros activos no corrientes', section: 'ASSET_NON_CURRENT', sortOrder: 290, naturalSign: 1 },
    // ── Pasivo corriente ──
    { id: 'PC_DEUDAS_COMERCIALES', label: 'Deudas comerciales', section: 'LIABILITY_CURRENT', sortOrder: 310, naturalSign: -1 },
    { id: 'PC_DEUDAS_SOCIALES', label: 'Deudas sociales', section: 'LIABILITY_CURRENT', sortOrder: 320, naturalSign: -1 },
    { id: 'PC_DEUDAS_FISCALES', label: 'Deudas fiscales', section: 'LIABILITY_CURRENT', sortOrder: 330, naturalSign: -1 },
    { id: 'PC_PRESTAMOS', label: 'Préstamos', section: 'LIABILITY_CURRENT', sortOrder: 340, naturalSign: -1 },
    { id: 'PC_OTRAS_DEUDAS', label: 'Otras deudas', section: 'LIABILITY_CURRENT', sortOrder: 390, naturalSign: -1 },
    // ── Pasivo no corriente ──
    { id: 'PNC_DEUDAS_COMERCIALES', label: 'Deudas comerciales', section: 'LIABILITY_NON_CURRENT', sortOrder: 410, naturalSign: -1 },
    { id: 'PNC_PRESTAMOS', label: 'Préstamos', section: 'LIABILITY_NON_CURRENT', sortOrder: 420, naturalSign: -1 },
    { id: 'PNC_OTRAS_DEUDAS', label: 'Otras deudas', section: 'LIABILITY_NON_CURRENT', sortOrder: 490, naturalSign: -1 },
    // ── Patrimonio neto ──
    { id: 'PN_CAPITAL', label: 'Capital', section: 'EQUITY', sortOrder: 510, naturalSign: -1 },
    { id: 'PN_RESERVAS', label: 'Reservas', section: 'EQUITY', sortOrder: 520, naturalSign: -1 },
    { id: 'PN_RESULTADOS_ACUMULADOS', label: 'Resultados acumulados', section: 'EQUITY', sortOrder: 530, naturalSign: -1 },
    { id: 'PN_RESULTADO_EJERCICIO', label: 'Resultado del ejercicio', section: 'EQUITY', sortOrder: 540, naturalSign: -1 },
    { id: 'PN_PARTICIPACION_NO_CONTROLADORA', label: 'Participación no controladora', section: 'EQUITY', sortOrder: 590, naturalSign: -1 },
    // ── Resultados ──
    { id: 'ER_VENTAS', label: 'Ventas de bienes y servicios', section: 'RESULT', sortOrder: 610, naturalSign: -1 },
    { id: 'ER_COSTO_VENTAS', label: 'Costo de las mercaderías vendidas', section: 'RESULT', sortOrder: 620, naturalSign: 1 },
    { id: 'ER_GASTOS_ADMINISTRACION', label: 'Gastos de administración', section: 'RESULT', sortOrder: 630, naturalSign: 1 },
    { id: 'ER_GASTOS_COMERCIALIZACION', label: 'Gastos de comercialización', section: 'RESULT', sortOrder: 640, naturalSign: 1 },
    { id: 'ER_RESULTADOS_FINANCIEROS', label: 'Resultados financieros y por tenencia', section: 'RESULT', sortOrder: 650, naturalSign: -1 },
    { id: 'ER_RESULTADO_INVERSIONES_PERMANENTES', label: 'Resultado de inversiones permanentes', section: 'RESULT', sortOrder: 660, naturalSign: -1 },
    { id: 'ER_OTROS_RESULTADOS', label: 'Otros ingresos y egresos', section: 'RESULT', sortOrder: 670, naturalSign: -1 },
    { id: 'ER_IMPUESTO_GANANCIAS', label: 'Impuesto a las ganancias', section: 'RESULT', sortOrder: 680, naturalSign: 1 },
    { id: 'ER_RESULTADO_PNC', label: 'Resultado atribuible a la participación no controladora', section: 'RESULT', sortOrder: 690, naturalSign: -1 },
    // ── Salvaguarda ──
    { id: 'SIN_CLASIFICAR', label: '⚠ Cuentas sin clasificación consolidada', section: 'ASSET_CURRENT', sortOrder: 999, naturalSign: 1 },
]

const LINE_BY_ID = new Map<ConsolidatedLineId, ConsolidatedLineSpec>(
    CONSOLIDATED_LINES.map(l => [l.id, l])
)

export function getLineSpec(id: ConsolidatedLineId): ConsolidatedLineSpec {
    const spec = LINE_BY_ID.get(id)
    if (!spec) throw new Error(`Línea consolidada desconocida: ${id}`)
    return spec
}

export function isResultLine(id: ConsolidatedLineId): boolean {
    return getLineSpec(id).section === 'RESULT'
}

export function isEquityLine(id: ConsolidatedLineId): boolean {
    return getLineSpec(id).section === 'EQUITY'
}

export function sectionOf(id: ConsolidatedLineId): ConsolidatedSection {
    return getLineSpec(id).section
}

/** ¿La cuenta se expone como corriente? Misma regla que el ESP individual. */
function isCurrent(account: Account): boolean {
    const explicit = account.currentClassification
    if (explicit === 'CURRENT') return true
    if (explicit === 'NON_CURRENT') return false
    return account.section !== 'NON_CURRENT'
}

/**
 * Deriva la línea consolidada de una cuenta a partir de su taxonomía.
 * Devuelve SIN_CLASIFICAR cuando la cuenta no tiene información suficiente:
 * jamás la esconde ni la fuerza a un rubro por parecido de nombre.
 */
export function deriveConsolidatedLine(account: Account): {
    lineId: ConsolidatedLineId
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    rationale: string
} {
    const sg = account.statementGroup
    const current = isCurrent(account)

    if (account.kind === 'ASSET') {
        switch (sg) {
            case 'CASH_AND_BANKS': return { lineId: 'AC_CAJA_BANCOS', confidence: 'HIGH', rationale: 'Cuenta con grupo de exposición CASH_AND_BANKS' }
            case 'TRADE_RECEIVABLES': return { lineId: current ? 'AC_CREDITOS_VENTAS' : 'ANC_CREDITOS', confidence: 'HIGH', rationale: 'Crédito por ventas según su grupo de exposición' }
            case 'OTHER_RECEIVABLES':
            case 'TAX_CREDITS': return { lineId: current ? 'AC_OTROS_CREDITOS' : 'ANC_CREDITOS', confidence: 'HIGH', rationale: 'Otros créditos según su grupo de exposición' }
            case 'INVENTORIES': return { lineId: 'AC_BIENES_CAMBIO', confidence: 'HIGH', rationale: 'Bien de cambio según su grupo de exposición' }
            case 'PPE': return { lineId: 'ANC_BIENES_USO', confidence: 'HIGH', rationale: 'Bien de uso según su grupo de exposición' }
            case 'INTANGIBLES': return { lineId: 'ANC_INTANGIBLES', confidence: 'HIGH', rationale: 'Activo intangible según su grupo de exposición' }
            case 'INVESTMENTS': return { lineId: current ? 'AC_INVERSIONES' : 'ANC_INVERSIONES', confidence: 'HIGH', rationale: 'Inversión según su grupo de exposición y su clasificación temporal' }
            default:
                return {
                    lineId: current ? 'AC_OTROS' : 'ANC_OTROS',
                    confidence: sg ? 'MEDIUM' : 'LOW',
                    rationale: sg
                        ? `Activo con grupo ${sg} sin línea consolidada específica`
                        : 'Activo sin grupo de exposición asignado: revisar el mapeo',
                }
        }
    }

    if (account.kind === 'LIABILITY') {
        switch (sg) {
            case 'TRADE_PAYABLES': return { lineId: current ? 'PC_DEUDAS_COMERCIALES' : 'PNC_DEUDAS_COMERCIALES', confidence: 'HIGH', rationale: 'Deuda comercial según su grupo de exposición' }
            case 'PAYROLL_LIABILITIES': return { lineId: 'PC_DEUDAS_SOCIALES', confidence: 'HIGH', rationale: 'Deuda social según su grupo de exposición' }
            case 'TAX_LIABILITIES': return { lineId: 'PC_DEUDAS_FISCALES', confidence: 'HIGH', rationale: 'Deuda fiscal según su grupo de exposición' }
            case 'LOANS': return { lineId: current ? 'PC_PRESTAMOS' : 'PNC_PRESTAMOS', confidence: 'HIGH', rationale: 'Préstamo según su grupo de exposición' }
            case 'OTHER_PAYABLES':
            case 'DEFERRED_INCOME': return { lineId: current ? 'PC_OTRAS_DEUDAS' : 'PNC_OTRAS_DEUDAS', confidence: 'HIGH', rationale: 'Otras deudas según su grupo de exposición' }
            default:
                return {
                    lineId: current ? 'PC_OTRAS_DEUDAS' : 'PNC_OTRAS_DEUDAS',
                    confidence: sg ? 'MEDIUM' : 'LOW',
                    rationale: sg
                        ? `Pasivo con grupo ${sg} sin línea consolidada específica`
                        : 'Pasivo sin grupo de exposición asignado: revisar el mapeo',
                }
        }
    }

    if (account.kind === 'EQUITY') {
        const component = account.equityComponent
        if (component === 'CAPITAL' || component === 'CAPITAL_ADJUSTMENT' || component === 'SHARE_PREMIUM' || component === 'IRREVOCABLE_CONTRIBUTION') {
            return { lineId: 'PN_CAPITAL', confidence: 'HIGH', rationale: `Componente de patrimonio ${component}` }
        }
        if (component === 'LEGAL_RESERVE' || component === 'STATUTORY_RESERVE' || component === 'OTHER_RESERVE') {
            return { lineId: 'PN_RESERVAS', confidence: 'HIGH', rationale: `Componente de patrimonio ${component}` }
        }
        if (component === 'CURRENT_RESULT') {
            return { lineId: 'PN_RESULTADO_EJERCICIO', confidence: 'HIGH', rationale: 'Resultado del ejercicio' }
        }
        switch (sg) {
            case 'CAPITAL': return { lineId: 'PN_CAPITAL', confidence: 'HIGH', rationale: 'Cuenta de capital según su grupo de exposición' }
            case 'RESERVES': return { lineId: 'PN_RESERVAS', confidence: 'HIGH', rationale: 'Reserva según su grupo de exposición' }
            case 'RETAINED_EARNINGS': return { lineId: 'PN_RESULTADOS_ACUMULADOS', confidence: 'HIGH', rationale: 'Resultado acumulado según su grupo de exposición' }
            default:
                return { lineId: 'PN_RESULTADOS_ACUMULADOS', confidence: 'LOW', rationale: 'Cuenta de patrimonio neto sin componente ni grupo: revisar el mapeo' }
        }
    }

    // Resultados
    switch (sg) {
        case 'SALES': return { lineId: 'ER_VENTAS', confidence: 'HIGH', rationale: 'Venta según su grupo de exposición' }
        case 'COGS': return { lineId: 'ER_COSTO_VENTAS', confidence: 'HIGH', rationale: 'Costo de ventas según su grupo de exposición' }
        case 'ADMIN_EXPENSES': return { lineId: 'ER_GASTOS_ADMINISTRACION', confidence: 'HIGH', rationale: 'Gasto de administración según su grupo de exposición' }
        case 'SELLING_EXPENSES': return { lineId: 'ER_GASTOS_COMERCIALIZACION', confidence: 'HIGH', rationale: 'Gasto de comercialización según su grupo de exposición' }
        case 'FINANCIAL_INCOME':
        case 'FINANCIAL_EXPENSES': return { lineId: 'ER_RESULTADOS_FINANCIEROS', confidence: 'HIGH', rationale: 'Resultado financiero según su grupo de exposición' }
        case 'INCOME_TAX': return { lineId: 'ER_IMPUESTO_GANANCIAS', confidence: 'HIGH', rationale: 'Impuesto a las ganancias según su grupo de exposición' }
        case 'OTHER_OPERATING_INCOME':
        case 'OTHER_INCOME':
        case 'OTHER_EXPENSES': return { lineId: 'ER_OTROS_RESULTADOS', confidence: 'HIGH', rationale: 'Otro resultado según su grupo de exposición' }
        default:
            return {
                lineId: 'ER_OTROS_RESULTADOS',
                confidence: 'LOW',
                rationale: 'Cuenta de resultado sin grupo de exposición asignado: revisar el mapeo',
            }
    }
}

/**
 * Categoría intragrupo sugerida. Sólo se propone cuando hay evidencia
 * ESTRUCTURAL: el grupo de exposición INVESTMENTS combinado con una
 * clasificación no corriente sugiere inversión permanente, pero nunca se afirma
 * que sea una inversión EN UNA CONTROLADA sin que el usuario indique la
 * contraparte. Las demás categorías requieren decisión humana.
 */
export function suggestIntragroupCategory(account: Account): {
    category: IntragroupCategory
    needsReview: boolean
    rationale: string
} {
    if (account.kind === 'ASSET' && account.statementGroup === 'INVESTMENTS' && !isCurrent(account)) {
        return {
            category: 'NONE',
            needsReview: true,
            rationale: 'Inversión permanente: indicá si corresponde a una entidad del grupo y cuál, para poder eliminarla contra su patrimonio neto',
        }
    }
    if (account.statementGroup === 'FINANCIAL_INCOME' || account.statementGroup === 'FINANCIAL_EXPENSES') {
        return {
            category: 'NONE',
            needsReview: true,
            rationale: 'Resultado financiero: revisá si contiene intereses devengados con otra entidad del grupo',
        }
    }
    return { category: 'NONE', needsReview: false, rationale: 'Sin evidencia estructural de operación intragrupo' }
}
