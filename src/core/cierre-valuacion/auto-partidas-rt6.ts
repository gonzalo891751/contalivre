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
} from './monetary-classification';
import { getAccountMetadata } from './classification';
import { getPeriodFromDate } from './calc';
import { generateId } from './types';

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
    const { startOfPeriod, closingDate, groupByMonth = true, minLotAmount = 0 } = options;

    const partidas: PartidaRT6[] = [];
    const stats = {
        totalAccounts: accounts.length,
        nonMonetaryAccounts: 0,
        partidasGenerated: 0,
        lotsGenerated: 0,
        excludedAccounts: 0,
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

        // Skip monetary accounts
        if (finalClass === 'MONETARY') {
            continue;
        }

        stats.nonMonetaryAccounts++;

        // Get balance
        const balance = ledgerBalances.get(account.id);
        if (!balance || balance.balance === 0) {
            // Skip accounts with zero balance
            continue;
        }

        // Generate partida
        const partida = generatePartidaForAccount(
            account,
            balance,
            startOfPeriod,
            closingDate,
            overrides,
            groupByMonth,
            minLotAmount
        );

        if (partida && partida.items.length > 0) {
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
    groupByMonth: boolean,
    minLotAmount: number
): PartidaRT6 | null {
    const lots: LotRT6[] = [];

    // Check if user specified manual origin date (single lot mode)
    const manualOriginDate = overrides[account.id]?.manualOriginDate;
    if (manualOriginDate) {
        // Single lot with manual date
        lots.push({
            id: generateId(),
            fechaOrigen: manualOriginDate,
            importeBase: Math.abs(balance.balance),
            notas: 'Saldo único (fecha manual)',
        });
    } else {
        // Auto-generate lots from movements
        const generatedLots = generateLotsFromMovements(
            balance.movements,
            startOfPeriod,
            closingDate,
            groupByMonth,
            minLotAmount
        );
        lots.push(...generatedLots);
    }

    if (lots.length === 0) {
        return null;
    }

    // Derive metadata
    const metadata = getAccountMetadata(account.code, account);
    const grupoExtended = getAccountType(account);
    const rubroLabel = account.group || deriveRubroLabel(account.code, metadata.group);

    // Skip RESULTADOS accounts (they are flow, not stock)
    if (grupoExtended === 'RESULTADOS') {
        return null;
    }

    // Map grupo to rubro (legacy enum)
    const rubro = mapGrupoToRubro(grupoExtended, rubroLabel);

    return {
        id: generateId(),
        rubro,
        grupo: grupoExtended as GrupoContable, // Safe cast after filtering RESULTADOS
        rubroLabel,
        cuentaCodigo: account.code,
        cuentaNombre: account.name,
        items: lots,
        profileType: 'generic', // Default profile
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
function generateLotsFromMovements(
    movements: LedgerMovement[],
    startOfPeriod: string,
    closingDate: string,
    groupByMonth: boolean,
    minLotAmount: number
): LotRT6[] {
    const lots: LotRT6[] = [];

    // Separate opening and period movements
    const openingMovements = movements.filter(m => m.date < startOfPeriod);
    const periodMovements = movements.filter(
        m => m.date >= startOfPeriod && m.date <= closingDate
    );

    // 1. Opening balance (if exists)
    if (openingMovements.length > 0) {
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
            // Sum DEBIT movements (increases for ASSET/EXPENSE)
            const totalDebit = monthMovements.reduce((sum, m) => sum + m.debit, 0);

            if (totalDebit >= minLotAmount) {
                const firstDate = monthMovements[0].date;
                lots.push({
                    id: generateId(),
                    fechaOrigen: firstDate,
                    importeBase: totalDebit,
                    notas: `Compras del mes ${month} (${monthMovements.length} mov.)`,
                });
            }
        }
    } else {
        // Individual lots for each DEBIT movement
        for (const movement of periodMovements) {
            if (movement.debit >= minLotAmount) {
                lots.push({
                    id: generateId(),
                    fechaOrigen: movement.date,
                    importeBase: movement.debit,
                    notas: movement.memo || movement.description,
                });
            }
        }
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
function mapGrupoToRubro(_grupo: GrupoContable | 'RESULTADOS', rubroLabel: string): RubroType {
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
