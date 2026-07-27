/**
 * Selectores canónicos de la portada de Operaciones — Fase 2H (§H9).
 *
 * Problema corregido: `OperacionesPage` mostraba importes que no provenían de
 * ninguna consulta ("$ 320.000" y "2 Vencimientos" estaban escritos a mano en el
 * JSX) y calculaba ventas/CMV con aritmética propia sobre `db.entries` sin
 * filtrar empresa ni estado del asiento. Una empresa sin movimientos exhibía
 * saldos y vencimientos inexistentes.
 *
 * Regla de esta fase: cada tarjeta de módulo deriva su cifra del MISMO
 * ReportingBundle que alimenta los estados contables. Al leer
 * `bundle.statements.trialBalance` heredamos, sin repetirlos, los filtros
 * canónicos de `getEntriesForContext`:
 *   - sólo asientos contabilizados (status !== 'DRAFT');
 *   - sólo la empresa del contexto (companyId);
 *   - sólo el rango del ejercicio.
 *
 * Acá no hay Dexie ni aritmética contable nueva: se agrupa un balance ya
 * calculado por `statementGroup`, el mismo mapeo que usan ESP/ER/EFE.
 */

import { toCents } from '../accounting/domain/money'
import type { Account, StatementGroup } from '../core/models'
import type { ReportingBundle } from './loadReportingBundle'

/** Módulos de Operaciones que exponen una cifra contable en la portada. */
export type OperationsModuleId =
    | 'inventario'
    | 'bienes-uso'
    | 'inversiones'
    | 'moneda-extranjera'
    | 'clientes'
    | 'proveedores'
    | 'prestamos'
    | 'impuestos'
    | 'deudas-sociales'
    | 'gastos'

/**
 * Estado de un módulo. No se comunica sólo por color: cada estado tiene su
 * propia etiqueta textual en la UI.
 */
export type OperationsModuleStatus =
    /** Hay cuentas mapeadas y movimientos contabilizados en el ejercicio. */
    | 'WITH_MOVEMENTS'
    /** Hay cuentas mapeadas pero ningún movimiento: cero legítimo. */
    | 'NO_MOVEMENTS'
    /** El plan no tiene ninguna cuenta mapeada al rubro: no se puede informar. */
    | 'NEEDS_MAPPING'

export interface OperationsModuleSummary {
    id: OperationsModuleId
    /** Rubros del plan que alimentan la cifra. */
    statementGroups: StatementGroup[]
    /** Importe en pesos, con signo de presentación (positivo = saldo del rubro). */
    amount: number
    status: OperationsModuleStatus
    /** Cuentas del plan mapeadas al módulo. */
    accountCount: number
    /** Asientos del ejercicio que movieron esas cuentas (linaje al Libro Diario). */
    entryIds: string[]
}

/**
 * Signo de presentación por módulo. El balance normalizado expresa `closing`
 * como Debe−Haber, así que los rubros de naturaleza acreedora (pasivos) se
 * muestran negados para que "saldo a pagar" se lea positivo.
 */
const MODULE_DEFINITIONS: Record<
    OperationsModuleId,
    { groups: StatementGroup[]; sign: 1 | -1 }
> = {
    inventario: { groups: ['INVENTORIES'], sign: 1 },
    'bienes-uso': { groups: ['PPE'], sign: 1 },
    inversiones: { groups: ['INVESTMENTS'], sign: 1 },
    // El detalle por moneda vive en el anexo de moneda extranjera; acá sólo se
    // informa si el módulo tiene partidas, no se reconstruye la conversión.
    'moneda-extranjera': { groups: [], sign: 1 },
    clientes: { groups: ['TRADE_RECEIVABLES'], sign: 1 },
    proveedores: { groups: ['TRADE_PAYABLES'], sign: -1 },
    prestamos: { groups: ['LOANS'], sign: -1 },
    impuestos: { groups: ['TAX_LIABILITIES'], sign: -1 },
    'deudas-sociales': { groups: ['PAYROLL_LIABILITIES'], sign: -1 },
    gastos: { groups: ['ADMIN_EXPENSES', 'SELLING_EXPENSES'], sign: 1 },
}

/**
 * Resume un módulo a partir del bundle canónico.
 *
 * Devuelve SIEMPRE una cifra derivada: si el plan no tiene cuentas del rubro el
 * estado es NEEDS_MAPPING y el importe es 0 (no se inventa ni se oculta).
 */
export function summarizeOperationsModule(
    moduleId: OperationsModuleId,
    bundle: ReportingBundle,
    accounts: Account[]
): OperationsModuleSummary {
    if (moduleId === 'moneda-extranjera') return summarizeForeignCurrency(bundle)

    const definition = MODULE_DEFINITIONS[moduleId]
    const groups = new Set<StatementGroup>(definition.groups)

    const moduleAccountIds = new Set(
        accounts.filter(a => !a.isHeader && a.statementGroup && groups.has(a.statementGroup)).map(a => a.id)
    )

    let cents = 0
    const entryIds = new Set<string>()
    let movedAccounts = 0

    for (const row of bundle.statements.trialBalance.rows) {
        if (!moduleAccountIds.has(row.accountId)) continue
        cents += toCents(row.closing)
        if (row.entryIds.length > 0) movedAccounts += 1
        for (const id of row.entryIds) entryIds.add(id)
    }

    const status: OperationsModuleStatus =
        moduleAccountIds.size === 0
            ? 'NEEDS_MAPPING'
            : movedAccounts > 0
              ? 'WITH_MOVEMENTS'
              : 'NO_MOVEMENTS'

    return {
        id: moduleId,
        statementGroups: definition.groups,
        // `|| 0` normaliza el cero negativo: negar un saldo acreedor nulo produce
        // -0 y se formatearía como "-$ 0,00" (§14 exige un cero uniforme).
        amount: (cents * definition.sign) / 100 || 0,
        status,
        accountCount: moduleAccountIds.size,
        entryIds: [...entryIds],
    }
}

/**
 * Moneda extranjera no se define por un `statementGroup`: sus partidas son
 * cuentas de cualquier rubro que además están denominadas en divisa. El motor ya
 * publica ese cuadro en `statements.foreignCurrency`, así que el módulo lo lee
 * de ahí en lugar de reconstruir la conversión.
 */
function summarizeForeignCurrency(bundle: ReportingBundle): OperationsModuleSummary {
    const disclosure = bundle.statements.foreignCurrency
    const rows = disclosure?.rows ?? []
    // Posición neta: activos menos pasivos en divisa, medidos en moneda de curso
    // legal según el Diario (`measurement`), que es la fuente del saldo.
    const amount =
        rows.reduce((sum, row) => {
            const sign = row.side === 'LIABILITY' ? -1 : 1
            return sum + sign * toCents(row.measurement)
        }, 0) / 100 || 0

    return {
        id: 'moneda-extranjera',
        statementGroups: [],
        amount,
        // Sin partidas en divisa el módulo está simplemente sin movimientos: es un
        // cero legítimo, no una configuración faltante.
        status: rows.length > 0 ? 'WITH_MOVEMENTS' : 'NO_MOVEMENTS',
        accountCount: rows.length,
        entryIds: [],
    }
}

/** Resume todos los módulos con cifra contable de una sola pasada. */
export function summarizeOperationsModules(
    bundle: ReportingBundle,
    accounts: Account[]
): Record<OperationsModuleId, OperationsModuleSummary> {
    const ids = Object.keys(MODULE_DEFINITIONS) as OperationsModuleId[]
    const out = {} as Record<OperationsModuleId, OperationsModuleSummary>
    for (const id of ids) out[id] = summarizeOperationsModule(id, bundle, accounts)
    return out
}
