/**
 * Auto-generation of RT6 Partidas from Ledger
 *
 * Automatically creates RT6 non-monetary item partidas from actual ledger balances,
 * with intelligent lot grouping by month.
 */

import type { Account } from '../models';
import type { AccountBalance, LedgerMovement } from '../ledger/computeBalances';
import type { PartidaRT6, LotRT6, AccountOverride, GrupoContable, RubroType } from './types';
import {
    getInitialMonetaryClass,
    applyOverrides,
    isExcluded,
    getAccountType,
    type MonetaryClass,
} from './monetary-classification';
import { getAccountMetadata } from './classification';
import { getPeriodFromDate } from './calc';
import { generateId } from './types';

const normalizeText = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const MOVIMIENTO_BIENES_CAMBIO_CODES = ['4.8.01', '4.8.02', '4.8.03', '4.8.04'];

const normalizeMovementName = (value: string) =>
    normalizeText(value).replace(/[./\\-]/g, ' ').replace(/\s+/g, ' ').trim();

export const isMovimientoBienesDeCambio = (account: Account): boolean => {
    const code = (account.code || '').trim();
    if (MOVIMIENTO_BIENES_CAMBIO_CODES.some(prefix => code.startsWith(prefix))) {
        return true;
    }

    const name = normalizeMovementName(account.name || '');
    if (!name) return false;

    const hasVentas = /\bventa(s)?\b/.test(name);
    if (hasVentas) return false;

    const hasCompras = /\bcompra(s)?\b/.test(name);
    if (!hasCompras) return false;

    if (/\bcompras\b/.test(name)) return true;

    const hasGastos = /\bgasto(s)?\b/.test(name);
    const hasBonificaciones = /\bbonificacion(es)?\b/.test(name);
    const hasDevoluciones = /\bdevolucion(es)?\b/.test(name);

    return hasCompras && (hasGastos || hasBonificaciones || hasDevoluciones);
};

/**
 * Check if a movement is an RT6 adjustment entry (RECPAM/Inflation Adjustment)
 * Used to prevent these entries from being treated as new origins.
 */
function isRT6AdjustmentMovement(movement: LedgerMovement): boolean {
    const text = normalizeText((movement.memo || '') + ' ' + (movement.description || ''));
    // Check for standard RT6 memos
    // "Ajuste por inflacion" (normalized) covers "Ajuste por inflación"
    // "RECPAM"
    return /ajuste por inflacion|recpam/.test(text);
}

/**
 * Options for auto-generation
 */
export interface AutoGenerateOptions {
    /** Start of fiscal period (YYYY-MM-DD) */
    startOfPeriod: string;
    /** Closing date (YYYY-MM-DD) */
    closingDate: string;
    /** Group movements by month (recommended for large datasets) */
    groupByMonth?: boolean;
    /** Minimum lot amount to include (filter noise) */
    minLotAmount?: number;
    /** Account IDs that are periodic inventory movement accounts (compras, bonif, devol) */
    periodicMovementAccountIds?: Set<string>;
}

/**
 * Result of auto-generation
 */
export interface AutoGenerateResult {
    /** Generated partidas */
    partidas: PartidaRT6[];
    /** Summary statistics */
    stats: {
        totalAccounts: number;
        nonMonetaryAccounts: number;
        partidasGenerated: number;
        lotsGenerated: number;
        excludedAccounts: number;
        /** Count of RESULTADOS accounts processed (for diagnostics) */
        resultadosAccounts: number;
        /** Count of PN accounts processed */
        pnAccounts: number;
        /** Accounts skipped due to zero balance and no period activity */
        skippedZeroBalance: number;
    };
}

/**
 * Auto-generate RT6 partidas from ledger balances
 *
 * @param accounts - All accounts
 * @param ledgerBalances - Ledger balances by account
 * @param overrides - User overrides for classification
 * @param options - Generation options
 * @returns Generated partidas and stats
 */
export function autoGeneratePartidasRT6(
    accounts: Account[],
    ledgerBalances: Map<string, AccountBalance>,
    overrides: Record<string, AccountOverride>,
    options: AutoGenerateOptions
): AutoGenerateResult {
    const { startOfPeriod, closingDate, groupByMonth = true, minLotAmount = 0, periodicMovementAccountIds } = options;

    const partidas: PartidaRT6[] = [];
    const stats = {
        totalAccounts: accounts.length,
        nonMonetaryAccounts: 0,
        partidasGenerated: 0,
        lotsGenerated: 0,
        excludedAccounts: 0,
        resultadosAccounts: 0,
        pnAccounts: 0,
        skippedZeroBalance: 0,
    };

    // Filter accounts to imputable (non-header) only
    const imputableAccounts = accounts.filter(acc => !acc.isHeader);

    for (const account of imputableAccounts) {
        // Skip if excluded
        if (isExcluded(account.id, overrides)) {
            stats.excludedAccounts++;
            continue;
        }

        // Classify account
        const initialClass = getInitialMonetaryClass(account);
        const finalClass = applyOverrides(account.id, initialClass, overrides);

        // Skip purely monetary accounts (but include FX_PROTECTED and INDEFINIDA)
        // FX_PROTECTED: shown in No Monetarias but need FX valuation
        // INDEFINIDA: need user classification, shown in "Pendientes"
        if (finalClass === 'MONETARY') {
            continue;
        }

        stats.nonMonetaryAccounts++;

        // Get balance
        let balance = ledgerBalances.get(account.id);

        // Determine account grupo for special handling
        const accountGrupo = getAccountType(account);
        const isPNAccount = accountGrupo === 'PN';
        const isResultadosAccount = accountGrupo === 'RESULTADOS';
        const isMovimientoBC =
            (periodicMovementAccountIds?.has(account.id) ?? false) || isMovimientoBienesDeCambio(account);

        // Track PN and RESULTADOS counts
        if (isPNAccount) stats.pnAccounts++;
        if (isResultadosAccount) stats.resultadosAccounts++;

        // Skip accounts with zero balance, EXCEPT for PN accounts
        // PN accounts may have historical balance from previous periods
        if (!balance) {
            continue;
        }

        // Some RESULTADOS accounts end with balance 0 due to refundición/cierre,
        // but still have meaningful activity in the period.
        const normalSide = getEffectiveNormalSide(account);
        const hasPeriodActivity = isMovimientoBC
            ? hasPeriodMovementActivity(balance.movements, startOfPeriod, closingDate)
            : hasPeriodActivityForAccount(balance.movements, startOfPeriod, closingDate, normalSide);

        // For non-PN accounts, skip if balance is zero
        // For PN accounts, we include them even with zero current-period balance
        // because they may have accumulated balance from prior periods.
        // For RESULTADOS, include if there was period activity.
        if (balance.balance === 0 && !isPNAccount && !(isResultadosAccount && hasPeriodActivity)) {
            stats.skippedZeroBalance++;
            continue;
        }

        // Generate partida
        const partida = isMovimientoBC
            ? generateMovimientoBienesDeCambioPartida(
                account,
                balance,
                startOfPeriod,
                closingDate,
                finalClass,
                minLotAmount
            )
            : generatePartidaForAccount(
                account,
                balance,
                startOfPeriod,
                closingDate,
                overrides,
                finalClass,
                groupByMonth,
                minLotAmount
            );

        if (partida && partida.items.length > 0) {
            // Tag periodic inventory movement accounts
            if (isMovimientoBC) {
                partida.inventoryRole = 'periodic_movement';
            }
            partidas.push(partida);
            stats.partidasGenerated++;
            stats.lotsGenerated += partida.items.length;
        }
    }

    return { partidas, stats };
}

/**
 * Generate a single PartidaRT6 for an account
 */
function generatePartidaForAccount(
    account: Account,
    balance: AccountBalance,
    startOfPeriod: string,
    closingDate: string,
    overrides: Record<string, AccountOverride>,
    finalClass: MonetaryClass,
    groupByMonth: boolean,
    minLotAmount: number,
    extraLots?: LotRT6[]
): PartidaRT6 | null {
    const lots: LotRT6[] = [];
    const accountGrupo = getAccountType(account);
    const normalSide = getEffectiveNormalSide(account);

    // Check if user specified manual origin date (single lot mode)
    const manualOriginDate = overrides[account.id]?.manualOriginDate;
    if (manualOriginDate) {
        // Single lot with manual date
        lots.push({
            id: generateId(),
            fechaOrigen: manualOriginDate,
            importeBase: Math.abs(balance.balance),
            notas: 'Saldo unico (fecha manual)',
        });
    } else {
        // Auto-generate lots from movements
        // Filter out ALL RT6 adjustments (manual or auto) to avoid treating them as new origins
        const filteredMovements = balance.movements.filter(m => !isRT6AdjustmentMovement(m));
        const generatedLots = generateLotsFromMovements(
            filteredMovements,
            startOfPeriod,
            closingDate,
            groupByMonth,
            minLotAmount,
            normalSide
        );
        lots.push(...generatedLots);

        // Special handling for PN accounts: if no lots were generated
        // but there's a balance, create a single lot dated at the start of period
        // This handles PN accounts with accumulated balance but no period movements
        if (lots.length === 0 && accountGrupo === 'PN' && Math.abs(balance.balance) >= minLotAmount) {
            lots.push({
                id: generateId(),
                fechaOrigen: startOfPeriod,
                importeBase: Math.abs(balance.balance),
                notas: 'Saldo acumulado historico (PN)',
            });
        }
    }

    if (extraLots && extraLots.length > 0) {
        lots.push(...extraLots);
    }

    if (lots.length === 0) {
        return null;
    }

    // Derive metadata
    const metadata = getAccountMetadata(account.code, account);
    const grupoExtended = getAccountType(account);
    const rubroLabel = account.group || deriveRubroLabel(account.code, metadata.group);

    // RESULTADOS accounts are now included for RT6 (they need monthly reexpression)
    // Map grupo to rubro (legacy enum)
    const rubro = mapGrupoToRubro(grupoExtended, rubroLabel);
    const profileType = resolveProfileType(account, finalClass, rubroLabel);

    return {
        id: generateId(),
        rubro,
        grupo: grupoExtended as GrupoContable, // Now includes RESULTADOS
        rubroLabel,
        cuentaCodigo: account.code,
        cuentaNombre: account.name,
        items: lots,
        profileType,
        accountId: account.id,
        normalSide,
        accountKind: account.kind,
    };
}

function generateMovimientoBienesDeCambioPartida(
    account: Account,
    balance: AccountBalance,
    startOfPeriod: string,
    closingDate: string,
    finalClass: MonetaryClass,
    minLotAmount: number
): PartidaRT6 | null {
    const notesLabel = `${account.code} ${account.name}`.trim();
    // Filter out ALL RT6 adjustments (manual or auto) to avoid treating them as new origins
    const filteredMovements = balance.movements.filter(m => !isRT6AdjustmentMovement(m));
    const lots = generateMovimientoBienesDeCambioLots(
        filteredMovements,
        startOfPeriod,
        closingDate,
        minLotAmount,
        notesLabel
    );

    if (lots.length === 0) {
        return null;
    }

    const rubroLabel = 'Bienes de cambio';
    const rubro: RubroType = 'Mercaderias';
    const profileType = resolveProfileType(account, finalClass, rubroLabel);

    return {
        id: generateId(),
        rubro,
        grupo: 'ACTIVO',
        rubroLabel,
        cuentaCodigo: account.code,
        cuentaNombre: account.name,
        items: lots,
        profileType,
        accountId: account.id,
        normalSide: getEffectiveNormalSide(account),
        accountKind: account.kind,
    };
}

/**
 * Generate lots from ledger movements
 *
 * Strategy:
 * 1. Compute opening balance (movements before startOfPeriod)
 * 2. If opening balance != 0, create "Saldo Inicio" lot
 * 3. For period movements (DEBIT side for ASSET/EXPENSE):
 *    - Group by month if enabled
 *    - Create one lot per month with sum of debits
 * 4. Use first movement date of each month as origin date
 */
type LotGenerationOptions = {
    sumMode?: 'increase' | 'net';
    includeOpeningBalance?: boolean;
    notesLabel?: string;
};

function generateLotsFromMovements(
    movements: LedgerMovement[],
    startOfPeriod: string,
    closingDate: string,
    groupByMonth: boolean,
    minLotAmount: number,
    normalSide: 'DEBIT' | 'CREDIT',
    options?: LotGenerationOptions
): LotRT6[] {
    const lots: LotRT6[] = [];
    const sumMode = options?.sumMode ?? 'increase';
    const includeOpeningBalance = options?.includeOpeningBalance ?? true;
    const notesLabel = options?.notesLabel;

    const getAmount = (movement: LedgerMovement) =>
        sumMode === 'net' ? movement.debit - movement.credit : getIncreaseAmount(movement, normalSide);

    // Separate opening and period movements
    const openingMovements = movements.filter(m => m.date < startOfPeriod);
    const periodMovements = movements.filter(
        m => m.date >= startOfPeriod && m.date <= closingDate
    );

    // 1. Opening balance (if exists)
    if (includeOpeningBalance && openingMovements.length > 0) {
        const lastOpeningMovement = openingMovements[openingMovements.length - 1];
        const openingBalance = Math.abs(lastOpeningMovement.balance);

        if (openingBalance >= minLotAmount) {
            lots.push({
                id: generateId(),
                fechaOrigen: startOfPeriod,
                importeBase: openingBalance,
                notas: 'Saldo inicio del período',
            });
        }
    }

    // 2. Period movements
    if (groupByMonth) {
        // Group by month
        const monthlyGroups = groupMovementsByMonth(periodMovements);

        for (const [month, monthMovements] of monthlyGroups) {
            // Sum "increases" according to the account's natural balance side.
            // This keeps RESULTADOS and PN coherent (credit-side accounts increase on credit).
            const totalAmount = monthMovements.reduce(
                (sum, m) => sum + getAmount(m),
                0
            );
            const shouldInclude = sumMode === 'net'
                ? Math.abs(totalAmount) >= minLotAmount && Math.abs(totalAmount) > 0
                : totalAmount >= minLotAmount;

            if (shouldInclude) {
                const firstDate = monthMovements[0].date;
                const baseNote = notesLabel ? `${notesLabel} ${month}` : `Compras del mes ${month}`;
                lots.push({
                    id: generateId(),
                    fechaOrigen: firstDate,
                    importeBase: totalAmount,
                    notas: `${baseNote} (${monthMovements.length} mov.)`,
                });
            }
        }
    } else {
        // Individual lots for each increase movement
        for (const movement of periodMovements) {
            const amount = getAmount(movement);
            const shouldInclude = sumMode === 'net'
                ? Math.abs(amount) >= minLotAmount && Math.abs(amount) > 0
                : amount >= minLotAmount;
            if (shouldInclude) {
                lots.push({
                    id: generateId(),
                    fechaOrigen: movement.date,
                    importeBase: amount,
                    notas: notesLabel ? `${notesLabel} ${movement.date}` : (movement.memo || movement.description),
                });
            }
        }
    }

    return lots;
}

function generateMovimientoBienesDeCambioLots(
    movements: LedgerMovement[],
    startOfPeriod: string,
    closingDate: string,
    minLotAmount: number,
    notesLabel?: string
): LotRT6[] {
    const lots: LotRT6[] = [];
    const periodMovements = movements.filter(
        m => m.date >= startOfPeriod && m.date <= closingDate
    );

    const monthlyGroups = new Map<
        string,
        { debit: number; credit: number; firstDate: string; count: number }
    >();

    for (const movement of periodMovements) {
        const month = getPeriodFromDate(movement.date);
        if (!month) continue;

        const group = monthlyGroups.get(month) ?? {
            debit: 0,
            credit: 0,
            firstDate: movement.date,
            count: 0,
        };

        group.debit += movement.debit;
        group.credit += movement.credit;
        group.count += 1;
        if (movement.date < group.firstDate) {
            group.firstDate = movement.date;
        }

        monthlyGroups.set(month, group);
    }

    const sorted = Array.from(monthlyGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [month, totals] of sorted) {
        const net = totals.debit - totals.credit;
        const hasActivity = totals.debit !== 0 || totals.credit !== 0;
        if (!hasActivity) continue;
        if (minLotAmount > 0 && Math.abs(net) < minLotAmount) continue;

        const baseNote = notesLabel ? `${notesLabel} ${month}` : `Movimiento ${month}`;
        lots.push({
            id: generateId(),
            fechaOrigen: totals.firstDate,
            importeBase: net,
            notas: `${baseNote} (${totals.count} mov.)`,
        });
    }

    return lots;
}

/**
 * Group movements by month (YYYY-MM)
 */
function groupMovementsByMonth(
    movements: LedgerMovement[]
): Map<string, LedgerMovement[]> {
    const groups = new Map<string, LedgerMovement[]>();

    for (const movement of movements) {
        const month = getPeriodFromDate(movement.date);
        if (!groups.has(month)) {
            groups.set(month, []);
        }
        groups.get(month)!.push(movement);
    }

    // Sort by month
    const sorted = new Map(
        Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    );

    return sorted;
}

/**
 * Get the "increase" side for a movement based on natural balance side
 */
function getIncreaseAmount(movement: LedgerMovement, normalSide: 'DEBIT' | 'CREDIT'): number {
    return normalSide === 'DEBIT' ? movement.debit : movement.credit;
}

function hasPeriodMovementActivity(
    movements: LedgerMovement[],
    startOfPeriod: string,
    closingDate: string
): boolean {
    return movements.some(
        m =>
            m.date >= startOfPeriod &&
            m.date <= closingDate &&
            (m.debit !== 0 || m.credit !== 0)
    );
}

/**
 * Determine if the account had period activity even if ending balance is 0
 */
function hasPeriodActivityForAccount(
    movements: LedgerMovement[],
    startOfPeriod: string,
    closingDate: string,
    normalSide: 'DEBIT' | 'CREDIT'
): boolean {
    const periodMovements = movements.filter(
        m => m.date >= startOfPeriod && m.date <= closingDate
    );
    const totalIncrease = periodMovements.reduce(
        (sum, m) => sum + getIncreaseAmount(m, normalSide),
        0
    );
    return totalIncrease > 0;
}

/**
 * Ensure we always have a natural balance side to work with
 */
function getEffectiveNormalSide(account: Account): 'DEBIT' | 'CREDIT' {
    if (account.normalSide) return account.normalSide;
    return account.kind === 'ASSET' || account.kind === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
}

/**
 * Resolve RT6 profile type for downstream RT17 valuation UX
 */
function resolveProfileType(
    account: Account,
    finalClass: MonetaryClass,
    rubroLabel: string
): PartidaRT6['profileType'] {
    if (finalClass === 'FX_PROTECTED') {
        return 'moneda_extranjera';
    }

    const label = rubroLabel.toLowerCase();
    const name = account.name.toLowerCase();
    if (
        label.includes('mercader') ||
        label.includes('stock') ||
        label.includes('inventar') ||
        name.includes('mercader') ||
        name.includes('stock')
    ) {
        return 'mercaderias';
    }

    return 'generic';
}

/**
 * Derive rubro label from code and group
 */
function deriveRubroLabel(code: string, grupo: string): string {
    // Try to infer from code prefix
    if (code.startsWith('1.1.01')) return 'Caja y Bancos';
    if (code.startsWith('1.1.02')) return 'Créditos';
    if (code.startsWith('1.2.01')) return 'Mercaderías';
    if (code.startsWith('1.2.02')) return 'Bienes de Uso';
    if (code.startsWith('1.2.03')) return 'Intangibles';
    if (code.startsWith('2.1')) return 'Deudas Corrientes';
    if (code.startsWith('2.2')) return 'Deudas No Corrientes';
    if (code.startsWith('3.1.01')) return 'Capital Social';
    if (code.startsWith('3.1.02')) return 'Ajuste de Capital';
    if (code.startsWith('3.1')) return 'Capital';
    if (code.startsWith('3.2')) return 'Resultados Acumulados';
    if (code.startsWith('4.1')) return 'Ventas';
    if (code.startsWith('4.2')) return 'Costo de Ventas';
    if (code.startsWith('4.3')) return 'Gastos Administrativos';
    if (code.startsWith('4.4')) return 'Gastos Comerciales';

    // Fallback to grupo
    return grupo;
}

/**
 * Check if account is a Capital Social account
 */
export function isCapitalSocialAccount(code: string, name: string): boolean {
    const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Code-based detection (3.1.01.* typically Capital Social)
    if (code.startsWith('3.1.01')) return true;

    // Name-based detection
    const capitalKeywords = ['capital social', 'capital suscripto', 'capital integrado'];
    return capitalKeywords.some(kw => normalizedName.includes(kw));
}

/**
 * Check if account is an Ajuste de Capital account
 */
export function isAjusteCapitalAccount(code: string, name: string): boolean {
    const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Code-based detection (3.1.02.* typically Ajuste de Capital)
    if (code.startsWith('3.1.02')) return true;

    // Name-based detection
    const ajusteKeywords = ['ajuste de capital', 'ajuste del capital', 'revaluo de capital'];
    return ajusteKeywords.some(kw => normalizedName.includes(kw));
}

/**
 * Map GrupoContable to legacy RubroType enum
 */
function mapGrupoToRubro(grupo: GrupoContable | 'RESULTADOS', rubroLabel: string): RubroType {
    // Try to infer from rubro label keywords
    const label = rubroLabel.toLowerCase();

    if (label.includes('mercader') || label.includes('stock')) {
        return 'Mercaderias';
    }
    if (label.includes('bienes de uso') || label.includes('rodado') || label.includes('mueble')) {
        return 'BienesUso';
    }
    if (label.includes('capital')) {
        return 'Capital';
    }

    // RESULTADOS accounts map to Otros (they have special treatment in UI)
    if (grupo === 'RESULTADOS') {
        return 'Otros';
    }

    // Default fallback
    return 'Otros';
}

/**
 * Merge auto-generated partidas with manual partidas
 *
 * Strategy:
 * - Keep all manual partidas (source != 'AUTO')
 * - Replace auto partidas with new auto partidas
 * - Preserve user edits to auto partidas if possible
 *
 * Note: For MVP, we simply replace all auto partidas.
 * Future enhancement: track manual edits and preserve them.
 */
export function mergeAutoPartidas(
    _existingPartidas: PartidaRT6[],
    autoPartidas: PartidaRT6[]
): PartidaRT6[] {
    // Keep manual partidas (those without a specific marker)
    // For now, we assume all existing partidas are manual unless we add a flag
    // MVP: Replace all existing partidas with auto ones
    // Future: Add 'source' field to PartidaRT6 to distinguish manual vs auto
    return autoPartidas;
}
