/**
 * EEPN matricial de doble entrada — Fase 2E (§6).
 *
 * Función PURA del motor canónico: deriva exclusivamente del ReportingInput
 * (asientos POSTED/REVERSED + aperturas + taxonomía) y del ER canónico.
 * Columnas dinámicas por componente del PN (mapping estructural
 * `equityComponent`, con derivación de respaldo desde `statementGroup`);
 * filas conceptuales con clasificación ESTRUCTURAL de movimientos (por
 * componente, sentido y contrapartida — jamás por nombre de cuenta).
 *
 * Convención de signos: crédito-positivo (todo importe aumenta el PN si es
 * positivo). Las filas de transferencias internas (reservas, capitalización,
 * absorción) suman 0 en el total de la fila: ese es el punto pedagógico de la
 * matriz — se ve QUÉ componente entrega y cuál recibe.
 */

import type { Account, EquityComponent, EquityMovementType, JournalEntry } from '../../core/models'
import { toCents } from '../../accounting/domain/money'
import { isStructuralClosingEntry } from '../../utils/resultsStatement'
import type {
    EquityColumnGroupId,
    EquityMatrixColumn,
    EquityMatrixColumnGroup,
    EquityMatrixRow,
    EquityMatrixViewModel,
    IncomeStatement2B,
    NormalizedTrialBalance,
    ReportingInput,
    ValidationCheck,
} from '../domain/types'

const fromCents = (c: number) => c / 100

export const EQUITY_COMPONENT_LABEL: Record<EquityComponent, string> = {
    CAPITAL: 'Capital social',
    CAPITAL_ADJUSTMENT: 'Ajuste del capital',
    SHARE_PREMIUM: 'Primas de emisión',
    IRREVOCABLE_CONTRIBUTION: 'Aportes irrevocables',
    LEGAL_RESERVE: 'Reserva legal',
    STATUTORY_RESERVE: 'Reservas estatutarias',
    OTHER_RESERVE: 'Otras reservas',
    PRIOR_RETAINED_EARNINGS: 'Resultados de ejercicios anteriores',
    CURRENT_RESULT: 'Resultado del ejercicio',
    DEFERRED_RESULT: 'Resultados diferidos',
    OTHER_EQUITY: 'Otros componentes',
}

const COMPONENT_GROUP: Record<EquityComponent, EquityColumnGroupId> = {
    CAPITAL: 'CONTRIBUTED',
    CAPITAL_ADJUSTMENT: 'CONTRIBUTED',
    SHARE_PREMIUM: 'CONTRIBUTED',
    IRREVOCABLE_CONTRIBUTION: 'CONTRIBUTED',
    LEGAL_RESERVE: 'RESERVES',
    STATUTORY_RESERVE: 'RESERVES',
    OTHER_RESERVE: 'RESERVES',
    PRIOR_RETAINED_EARNINGS: 'RETAINED',
    CURRENT_RESULT: 'RETAINED',
    DEFERRED_RESULT: 'DEFERRED',
    OTHER_EQUITY: 'OTHER',
}

const GROUP_LABEL: Record<EquityColumnGroupId, string> = {
    CONTRIBUTED: 'Aportes de los propietarios',
    RESERVES: 'Ganancias reservadas',
    RETAINED: 'Resultados no asignados',
    DEFERRED: 'Resultados diferidos',
    OTHER: 'Otros',
}

/** Orden canónico de columnas (estructura del cuadro de doble entrada) */
const COMPONENT_ORDER: EquityComponent[] = [
    'CAPITAL', 'CAPITAL_ADJUSTMENT', 'SHARE_PREMIUM', 'IRREVOCABLE_CONTRIBUTION',
    'LEGAL_RESERVE', 'STATUTORY_RESERVE', 'OTHER_RESERVE',
    'PRIOR_RETAINED_EARNINGS', 'CURRENT_RESULT', 'DEFERRED_RESULT', 'OTHER_EQUITY',
]

const MOVEMENT_LABEL: Record<EquityMovementType, string> = {
    OPENING_BALANCE: 'Saldos al inicio',
    PRIOR_PERIOD_ADJUSTMENT: 'Modificaciones de ejercicios anteriores (AREA)',
    CONTRIBUTION: 'Aportes de los propietarios',
    WITHDRAWAL: 'Retiros o reducciones de capital',
    DISTRIBUTION: 'Distribuciones de resultados',
    RESERVE_CREATION: 'Constitución de reservas',
    RESERVE_RELEASE: 'Desafectación de reservas',
    CAPITALIZATION: 'Capitalizaciones',
    LOSS_ABSORPTION: 'Absorción de pérdidas',
    CURRENT_RESULT: 'Resultado del ejercicio',
    OTHER: 'Otros movimientos del patrimonio',
}

/** Orden conceptual de las filas de variaciones del ejercicio */
const MOVEMENT_ORDER: EquityMovementType[] = [
    'CONTRIBUTION', 'WITHDRAWAL', 'DISTRIBUTION', 'RESERVE_CREATION',
    'RESERVE_RELEASE', 'CAPITALIZATION', 'LOSS_ABSORPTION', 'CURRENT_RESULT', 'OTHER',
]

/**
 * Componente estructural de una cuenta de PN. Mapping explícito primero;
 * derivación de respaldo por statementGroup. Sin heurísticas por nombre.
 */
export function deriveEquityComponent(account: Account): EquityComponent {
    if (account.equityComponent) return account.equityComponent
    switch (account.statementGroup) {
        case 'CAPITAL': return 'CAPITAL'
        case 'RESERVES': return 'OTHER_RESERVE'
        case 'RETAINED_EARNINGS': return 'PRIOR_RETAINED_EARNINGS'
        default: return 'OTHER_EQUITY'
    }
}

type CellsCents = Partial<Record<EquityComponent, number>>

interface MutableRow {
    cells: CellsCents
    accountIds: Set<string>
    entryIds: Set<string>
}

function newRow(): MutableRow {
    return { cells: {}, accountIds: new Set(), entryIds: new Set() }
}

function addCell(row: MutableRow, component: EquityComponent, cents: number, accountId?: string, entryId?: string) {
    row.cells[component] = (row.cells[component] ?? 0) + cents
    if (accountId) row.accountIds.add(accountId)
    if (entryId) row.entryIds.add(entryId)
}

function rowTotalCents(cells: CellsCents): number {
    return Object.values(cells).reduce((s, v) => s + (v ?? 0), 0)
}

function toRow(
    type: EquityMatrixRow['type'],
    label: string,
    row: MutableRow,
    isSubtotal = false
): EquityMatrixRow {
    const cells: Partial<Record<EquityComponent, number>> = {}
    let hasData = false
    for (const [k, v] of Object.entries(row.cells)) {
        if (v === 0) continue
        cells[k as EquityComponent] = fromCents(v!)
        hasData = true
    }
    return {
        type, label, cells,
        total: fromCents(rowTotalCents(row.cells)),
        accountIds: Array.from(row.accountIds),
        entryIds: Array.from(row.entryIds),
        hasData,
        isSubtotal,
    }
}

/**
 * Clasificación estructural de un asiento que toca cuentas de PN.
 * 'EXTERNAL' = tiene contrapartida fuera del PN; cada componente se clasifica
 * después por su sentido. Un asiento interno (transferencia entre componentes)
 * recibe un único tipo y su fila suma 0.
 */
function classifyEntry(
    entry: JournalEntry,
    componentOf: (accountId: string) => EquityComponent | null
): EquityMovementType | 'EXTERNAL' {
    let credited: EquityColumnGroupId | null = null
    let debited: EquityColumnGroupId | null = null
    let hasExternal = false
    for (const l of entry.lines) {
        const comp = componentOf(l.accountId)
        if (!comp) { hasExternal = true; continue }
        const net = toCents(l.credit || 0) - toCents(l.debit || 0)
        const group = COMPONENT_GROUP[comp]
        if (net > 0) credited = credited ?? group
        if (net < 0) debited = debited ?? group
    }
    if (hasExternal) return 'EXTERNAL'
    // Transferencia interna del PN: un solo tipo para todo el asiento
    if (credited === 'RESERVES') return 'RESERVE_CREATION'
    if (debited === 'RESERVES' && credited === 'RETAINED') return 'RESERVE_RELEASE'
    if (credited === 'CONTRIBUTED') return 'CAPITALIZATION'
    if (debited === 'CONTRIBUTED' && credited === 'RETAINED') return 'LOSS_ABSORPTION'
    return 'OTHER'
}

/** Clasificación por componente de un movimiento con contrapartida externa */
function classifyExternal(component: EquityComponent, netCents: number): EquityMovementType {
    const group = COMPONENT_GROUP[component]
    if (group === 'CONTRIBUTED') return netCents > 0 ? 'CONTRIBUTION' : 'WITHDRAWAL'
    if (group === 'RETAINED' || group === 'RESERVES') {
        return netCents < 0 ? 'DISTRIBUTION' : 'OTHER'
    }
    return 'OTHER'
}

export function buildEquityMatrix(
    input: ReportingInput,
    tb: NormalizedTrialBalance,
    incomeStatement: IncomeStatement2B
): EquityMatrixViewModel {
    const byId = new Map(input.accounts.map(a => [a.id, a]))
    const componentOf = (accountId: string): EquityComponent | null => {
        const a = byId.get(accountId)
        return a?.kind === 'EQUITY' ? deriveEquityComponent(a) : null
    }

    // ── Saldos al inicio por componente ──────────────────────
    const opening = newRow()
    const columnAccounts = new Map<EquityComponent, Set<string>>()
    const trackColumnAccount = (component: EquityComponent, accountId: string) => {
        let set = columnAccounts.get(component)
        if (!set) { set = new Set(); columnAccounts.set(component, set) }
        set.add(accountId)
    }

    for (const row of tb.rows) {
        const account = byId.get(row.accountId)
        if (!account) continue
        const openingCents = toCents(row.opening)
        if (account.kind === 'EQUITY') {
            const component = deriveEquityComponent(account)
            trackColumnAccount(component, row.accountId)
            if (openingCents !== 0) addCell(opening, component, -openingCents, row.accountId)
        } else if ((account.kind === 'INCOME' || account.kind === 'EXPENSE') && openingCents !== 0) {
            // resultados acumulados legacy que vienen en la apertura
            addCell(opening, 'PRIOR_RETAINED_EARNINGS', -openingCents, row.accountId)
        }
    }

    // Apertura FORMAL (asiento dentro del ejercicio): sus saldos de PN son
    // "Saldos al inicio" del cuadro, nunca variaciones del ejercicio.
    for (const entry of input.entries) {
        if (entry.status === 'DRAFT') continue
        if (!(entry.sourceModule === 'closing' && entry.sourceType === 'apertura')) continue
        for (const l of entry.lines) {
            const account = byId.get(l.accountId)
            if (!account) continue
            const netCents = toCents(l.credit || 0) - toCents(l.debit || 0)
            if (netCents === 0) continue
            if (account.kind === 'EQUITY') {
                const component = deriveEquityComponent(account)
                trackColumnAccount(component, l.accountId)
                addCell(opening, component, netCents, l.accountId, entry.id)
            } else if (account.kind === 'INCOME' || account.kind === 'EXPENSE') {
                addCell(opening, 'PRIOR_RETAINED_EARNINGS', netCents, l.accountId, entry.id)
            }
        }
    }

    // ── Variaciones del ejercicio (asientos que tocan el PN) ──
    const rows = new Map<EquityMovementType, MutableRow>()
    const rowFor = (t: EquityMovementType): MutableRow => {
        let r = rows.get(t)
        if (!r) { r = newRow(); rows.set(t, r) }
        return r
    }

    const flowEntries = input.entries.filter(e =>
        e.status !== 'DRAFT'
        && !isStructuralClosingEntry(e)
        && !(e.sourceModule === 'closing' && e.sourceType === 'apertura'))

    for (const entry of flowEntries) {
        const equityLines = entry.lines.filter(l => componentOf(l.accountId) !== null)
        if (equityLines.length === 0) continue

        const kind = classifyEntry(entry, componentOf)
        for (const l of equityLines) {
            const component = componentOf(l.accountId)!
            trackColumnAccount(component, l.accountId)
            const netCents = toCents(l.credit || 0) - toCents(l.debit || 0)
            if (netCents === 0) continue
            const rowType: EquityMovementType = kind === 'EXTERNAL'
                ? classifyExternal(component, netCents)
                : kind
            addCell(rowFor(rowType), component, netCents, l.accountId, entry.id)
        }
    }

    // ── Resultado del ejercicio (desde el ER canónico) ───────
    const resultCents = toCents(incomeStatement.netIncome.amount)
    if (resultCents !== 0 || incomeStatement.netIncome.accountIds.length > 0) {
        const r = rowFor('CURRENT_RESULT')
        addCell(r, 'CURRENT_RESULT', resultCents)
        for (const id of incomeStatement.netIncome.accountIds) r.accountIds.add(id)
    }

    // ── Columnas dinámicas ───────────────────────────────────
    const openingRow = toRow('OPENING_BALANCE', MOVEMENT_LABEL.OPENING_BALANCE, opening, true)
    const priorAdjustmentRow = toRow('PRIOR_PERIOD_ADJUSTMENT', MOVEMENT_LABEL.PRIOR_PERIOD_ADJUSTMENT,
        rows.get('PRIOR_PERIOD_ADJUSTMENT') ?? newRow())

    const movementRows: EquityMatrixRow[] = MOVEMENT_ORDER.map(t =>
        toRow(t, MOVEMENT_LABEL[t], rows.get(t) ?? newRow()))

    const usedComponents = new Set<EquityComponent>()
    const consider = (cells: Partial<Record<EquityComponent, number>>) => {
        for (const k of Object.keys(cells)) usedComponents.add(k as EquityComponent)
    }
    consider(openingRow.cells)
    consider(priorAdjustmentRow.cells)
    for (const r of movementRows) consider(r.cells)
    for (const c of columnAccounts.keys()) usedComponents.add(c)
    if (resultCents !== 0) usedComponents.add('CURRENT_RESULT')

    const orderedComponents = COMPONENT_ORDER.filter(c => usedComponents.has(c))

    // ── Subtotales por columna y filas de totales ────────────
    const centsOf = (row: EquityMatrixRow, c: EquityComponent) => toCents(row.cells[c] ?? 0)

    const adjusted = newRow()
    const variations = newRow()
    const closing = newRow()
    for (const c of orderedComponents) {
        const adjCents = centsOf(openingRow, c) + centsOf(priorAdjustmentRow, c)
        if (adjCents !== 0) addCell(adjusted, c, adjCents)
        let varCents = 0
        for (const r of movementRows) varCents += centsOf(r, c)
        if (varCents !== 0) addCell(variations, c, varCents)
        const closeCents = adjCents + varCents
        if (closeCents !== 0) addCell(closing, c, closeCents)
    }

    const adjustedOpeningRow = toRow('ADJUSTED_OPENING', 'Saldo al inicio ajustado', adjusted, true)
    const totalVariationsRow = toRow('TOTAL_VARIATIONS', 'Total de variaciones del ejercicio', variations, true)
    const closingRow = toRow('CLOSING', 'Saldos al cierre', closing, true)

    const columns: EquityMatrixColumn[] = orderedComponents.map(c => ({
        component: c,
        label: EQUITY_COMPONENT_LABEL[c],
        group: COMPONENT_GROUP[c],
        accountIds: Array.from(columnAccounts.get(c) ?? []),
        opening: adjustedOpeningRow.cells[c] ?? 0,
        variations: totalVariationsRow.cells[c] ?? 0,
        closing: closingRow.cells[c] ?? 0,
    }))

    const columnGroups: EquityMatrixColumnGroup[] = (['CONTRIBUTED', 'RESERVES', 'RETAINED', 'DEFERRED', 'OTHER'] as EquityColumnGroupId[])
        .map(id => ({ id, label: GROUP_LABEL[id], components: orderedComponents.filter(c => COMPONENT_GROUP[c] === id) }))
        .filter(g => g.components.length > 0)

    // ── Comparativo (totales del ejercicio anterior) ─────────
    const comparative = input.comparative
        ? {
            openingTotal: input.comparative.equityStatement.openingBalance.amount,
            closingTotal: input.comparative.equityStatement.closingBalance.amount,
            periodResult: input.comparative.equityStatement.periodResult.amount,
        }
        : null

    // ── Invariantes de la matriz (§6.8) ──────────────────────
    const validations: ValidationCheck[] = []
    const check = (id: string, label: string, expected: number, actual: number, detail?: string) => {
        validations.push({
            id, label,
            passed: expected === actual,
            expected: fromCents(expected),
            actual: fromCents(actual),
            difference: fromCents(actual - expected),
            detail,
        })
    }

    // Total de cada fila = suma de sus columnas (redundante por construcción,
    // pero explícito: si algo diverge hay bug de agregación)
    for (const r of [openingRow, ...movementRows, closingRow]) {
        const sum = Object.values(r.cells).reduce((s, v) => s + toCents(v ?? 0), 0)
        check(`eepn-matrix-row-${r.type}`, `EEPN matriz: fila "${r.label}" = suma de columnas`, sum, toCents(r.total))
    }

    // Saldo inicial ajustado + total variaciones = saldo final (por columna)
    for (const c of columns) {
        check(`eepn-matrix-col-${c.component}`,
            `EEPN matriz: ${c.label} — inicio ajustado + variaciones = cierre`,
            toCents(c.opening) + toCents(c.variations), toCents(c.closing))
    }

    // Resultado del ejercicio de la matriz = resultado del ER
    const resultRow = movementRows.find(r => r.type === 'CURRENT_RESULT')!
    check('eepn-matrix-result', 'EEPN matriz: resultado del ejercicio = resultado del ER',
        toCents(incomeStatement.netIncome.amount), toCents(resultRow.total))

    return {
        columns,
        columnGroups,
        openingRow,
        priorAdjustmentRow,
        adjustedOpeningRow,
        movementRows,
        totalVariationsRow,
        closingRow,
        comparative,
        validations,
    }
}
