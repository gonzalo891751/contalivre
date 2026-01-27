/**
 * RECPAM - Método Indirecto
 *
 * Calculates RECPAM (Resultado por Exposición a la Inflación) using the
 * indirect method based on monthly monetary position.
 */

import type { Account, JournalEntry } from '../models';
import type { IndexRow, AccountOverride } from './types';
import { computeBalances, type AccountBalance } from '../ledger/computeBalances';
import {
    getInitialMonetaryClass,
    applyOverrides,
    isExcluded,
    getAccountType,
} from './monetary-classification';
import { getPeriodFromDate, getIndexForPeriod, calculateCoef } from './calc';

/**
 * Monthly RECPAM calculation result
 */
export interface MonthlyRecpam {
    /** Period (YYYY-MM) */
    period: string;
    /** Monetary assets average for the month */
    activeMon: number;
    /** Monetary liabilities average for the month */
    pasivoMon: number;
    /** Net monetary position (activos - pasivos) */
    pmn: number;
    /** Inflation coefficient for the month */
    coef: number;
    /** RECPAM for the month */
    recpam: number;
}

/**
 * Full RECPAM indirect method result
 */
export interface RecpamIndirectoResult {
    /** Monthly breakdown */
    monthly: MonthlyRecpam[];
    /** Total RECPAM for the period */
    total: number;
    /** Average monetary assets */
    avgActivoMon: number;
    /** Average monetary liabilities */
    avgPasivoMon: number;
    /** Average net monetary position */
    avgPmn: number;
    /** Overall inflation coefficient */
    overallCoef: number;
    /** Inflation for the entire period (as decimal, e.g., 0.25 = 25%) */
    inflationPeriod: number;
    /** Inflation for the last month only */
    inflationLastMonth: number;
    /** Missing indices (if any) */
    missingIndices: string[];
}

/**
 * Calculate RECPAM using indirect method
 *
 * Method:
 * 1. For each month in the period:
 *    a. Compute closing balance for monetary accounts
 *    b. Sum monetary assets and liabilities
 *    c. Calculate PMN = Assets - Liabilities
 *    d. Apply monthly coefficient: RECPAM = PMN * (Coef - 1) * -1
 * 2. Sum all monthly RECPAM values
 *
 * @param entries - All journal entries
 * @param accounts - All accounts
 * @param overrides - User overrides for classification
 * @param indices - FACPCE indices
 * @param startOfPeriod - Start date (YYYY-MM-DD)
 * @param closingDate - Closing date (YYYY-MM-DD)
 * @returns RECPAM calculation result
 */
export function calculateRecpamIndirecto(
    entries: JournalEntry[],
    accounts: Account[],
    overrides: Record<string, AccountOverride>,
    indices: IndexRow[],
    startOfPeriod: string,
    closingDate: string
): RecpamIndirectoResult {
    const closingPeriod = getPeriodFromDate(closingDate);
    const closingIndex = getIndexForPeriod(indices, closingPeriod);

    // Generate list of months in period
    const months = generateMonthRange(startOfPeriod, closingDate);

    const monthly: MonthlyRecpam[] = [];
    const missingIndices: string[] = [];

    for (const month of months) {
        // Get last day of month
        const monthEnd = getLastDayOfMonth(month);

        // Compute balances at month end
        const balances = computeBalances(entries, accounts, monthEnd);

        // Classify and sum monetary positions
        const { activeMon, pasivoMon } = sumMonetaryPositions(
            accounts,
            balances,
            overrides
        );

        // Calculate PMN
        const pmn = activeMon - pasivoMon;

        // Get coefficient for month
        const monthIndex = getIndexForPeriod(indices, month);
        if (!monthIndex || !closingIndex) {
            missingIndices.push(month);
        }
        const coef = calculateCoef(closingIndex, monthIndex);

        // Calculate RECPAM for month
        // RECPAM = PMN * (Coef - 1) * -1
        // Positive PMN (more assets) generates loss (negative RECPAM)
        // Negative PMN (more liabilities) generates gain (positive RECPAM)
        const recpam = pmn * (coef - 1) * -1;

        monthly.push({
            period: month,
            activeMon,
            pasivoMon,
            pmn,
            coef,
            recpam,
        });
    }

    // Calculate totals and averages
    const total = monthly.reduce((sum, m) => sum + m.recpam, 0);
    const avgActivoMon = monthly.reduce((sum, m) => sum + m.activeMon, 0) / monthly.length;
    const avgPasivoMon = monthly.reduce((sum, m) => sum + m.pasivoMon, 0) / monthly.length;
    const avgPmn = avgActivoMon - avgPasivoMon;

    // Fix: Get start period index from actual start date, not first array item
    const startPeriod = getPeriodFromDate(startOfPeriod);
    const startIndex = getIndexForPeriod(indices, startPeriod);
    const overallCoef = closingIndex && startIndex
        ? closingIndex / startIndex
        : 1;
    const inflationPeriod = overallCoef - 1;

    // Calculate last month inflation
    const prevMonthPeriod = months.length >= 2 ? months[months.length - 2] : null;
    const prevMonthIndex = prevMonthPeriod ? getIndexForPeriod(indices, prevMonthPeriod) : null;
    const inflationLastMonth = closingIndex && prevMonthIndex
        ? (closingIndex / prevMonthIndex) - 1
        : (monthly.length > 0 ? monthly[monthly.length - 1].coef - 1 : 0);

    return {
        monthly,
        total,
        avgActivoMon,
        avgPasivoMon,
        avgPmn,
        overallCoef,
        inflationPeriod,
        inflationLastMonth,
        missingIndices,
    };
}

/**
 * Sum monetary positions (assets and liabilities)
 */
function sumMonetaryPositions(
    accounts: Account[],
    balances: Map<string, AccountBalance>,
    overrides: Record<string, AccountOverride>
): { activeMon: number; pasivoMon: number } {
    let activeMon = 0;
    let pasivoMon = 0;

    for (const account of accounts) {
        // Skip excluded accounts
        if (isExcluded(account.id, overrides)) {
            continue;
        }

        // Skip header accounts
        if (account.isHeader) {
            continue;
        }

        // Classify account
        const initialClass = getInitialMonetaryClass(account);
        const finalClass = applyOverrides(account.id, initialClass, overrides);

        // Skip non-monetary accounts
        if (finalClass !== 'MONETARY') {
            continue;
        }

        // Get balance
        const balance = balances.get(account.id);
        if (!balance) {
            continue;
        }

        // Sum by type
        const accountType = getAccountType(account);
        if (accountType === 'ACTIVO') {
            activeMon += Math.abs(balance.balance);
        } else if (accountType === 'PASIVO') {
            pasivoMon += Math.abs(balance.balance);
        }
        // EQUITY and RESULTS are not monetary, so we skip them
    }

    return { activeMon, pasivoMon };
}

/**
 * Generate list of months between two dates (YYYY-MM format)
 */
function generateMonthRange(startDate: string, endDate: string): string[] {
    const months: string[] = [];
    const start = new Date(startDate + '-01');
    const end = new Date(endDate);

    let current = new Date(start);
    while (current <= end) {
        const year = current.getFullYear();
        const month = String(current.getMonth() + 1).padStart(2, '0');
        months.push(`${year}-${month}`);

        // Move to next month
        current.setMonth(current.getMonth() + 1);
    }

    return months;
}

/**
 * Get last day of month for a given period (YYYY-MM)
 */
function getLastDayOfMonth(period: string): string {
    const [year, month] = period.split('-').map(Number);
    // Create date for next month, day 0 = last day of previous month
    const lastDay = new Date(year, month, 0);
    const day = String(lastDay.getDate()).padStart(2, '0');
    return `${year}-${String(month).padStart(2, '0')}-${day}`;
}
