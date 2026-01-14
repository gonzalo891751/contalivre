import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../storage/db';
import { computeLedger } from '../core/ledger';
import { computeTrialBalance } from '../core/balance';
import { computeStatements } from '../core/statements';
import { excludeClosingEntries } from '../utils/resultsStatement';

export interface FinancialData {
    activoCorriente: number;
    pasivoCorriente: number;
    inventarios: number;
    disponibilidades: number;
    activoNoCorriente: number;
    activoTotal: number;
    pasivoTotal: number;
    patrimonioNeto: number;
    // ER
    ventas: number | null;
    costoVentas: number | null;
    resultadoNeto: number | null;
}

export function useIndicatorsMetrics() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray());
    const entries = useLiveQuery(() => db.entries.toArray());

    const metrics = useMemo<FinancialData | null>(() => {
        if (!accounts || !entries || entries.length === 0) return null;

        // 1. Prepare data (exclude closing entries to avoid zeroing out results)
        const entriesWithoutClosing = excludeClosingEntries(entries, accounts);

        // 2. Compute standard financial statements
        const ledger = computeLedger(entriesWithoutClosing, accounts);
        const trialBalance = computeTrialBalance(ledger, accounts);
        const { balanceSheet, incomeStatement } = computeStatements(trialBalance, accounts);

        // 3. Extract Totals
        const activoCorriente = balanceSheet.currentAssets.netTotal;
        const activoNoCorriente = balanceSheet.nonCurrentAssets.netTotal;
        const pasivoCorriente = balanceSheet.currentLiabilities.netTotal;
        const pasivoTotal = balanceSheet.totalLiabilities;
        const activoTotal = balanceSheet.totalAssets;
        const patrimonioNeto = balanceSheet.totalEquity;

        // 4. Extract Specifics (Inventory, Cash)
        // search in current assets section
        let inventarios = 0;
        let disponibilidades = 0;

        balanceSheet.currentAssets.accounts.forEach(item => {
            const sg = item.account.statementGroup;
            if (sg === 'INVENTORIES') {
                inventarios += item.balance;
            }
            if (sg === 'CASH_AND_BANKS' || sg === 'INVESTMENTS') {
                // Assuming Investments (short term) count as liquid for some ratios, 
                // but usually Cash Ratio is strictly CASH_AND_BANKS + highly liquid inv.
                // Let's stick to CASH_AND_BANKS for purity, or include 'INVESTMENTS' if deemed liquid.
                // For now, CASH_AND_BANKS is safest.
                if (sg === 'CASH_AND_BANKS') {
                    disponibilidades += item.balance;
                }
            }
        });

        // 5. Extract Economic Data (Income Statement)
        // Check if we have operating data
        const hasOperatingData = incomeStatement.sales.accounts.length > 0 || incomeStatement.cogs.accounts.length > 0;

        let ventas: number | null = null;
        let costoVentas: number | null = null;
        let resultadoNeto: number | null = null;

        if (hasOperatingData) {
            ventas = incomeStatement.sales.netTotal;
            // Cost is usually negative in statement sections, but check core/statements logic.
            // In computeStatements, balances are summed. COGS accounts (Expenses) usually have Debit balance (positive).
            // But getStatementBalance might flip them? core/statements.ts doesn't flip EXPENSE unless contra.
            // If they are strictly Expenses, they are positive numbers.
            // For margin calculations, we need explicit values.
            costoVentas = incomeStatement.cogs.netTotal;
            resultadoNeto = incomeStatement.netIncome;
        }

        return {
            activoCorriente,
            pasivoCorriente,
            inventarios,
            disponibilidades,
            activoNoCorriente,
            activoTotal,
            pasivoTotal,
            patrimonioNeto,
            ventas,
            costoVentas,
            resultadoNeto
        };

    }, [accounts, entries]);

    return metrics;
}
