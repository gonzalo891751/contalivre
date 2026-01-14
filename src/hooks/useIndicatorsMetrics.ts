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
    inventarios: number | null;
    disponibilidades: number | null;
    activoNoCorriente: number;
    activoTotal: number;
    pasivoTotal: number;
    patrimonioNeto: number;
    // ER
    ventas: number | null;
    costoVentas: number | null;
    resultadoNeto: number | null;
    // Meta
    entriesCount: number;
}

export function useIndicatorsMetrics() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray());
    const entries = useLiveQuery(() => db.entries.toArray());

    const metrics = useMemo<FinancialData | null>(() => {
        if (!accounts || !entries) return null;

        // "Empty System" State: If no entries exist, return valid zeros structure so UI can show "Cargá tu primer asiento"
        if (entries.length === 0) {
            return {
                activoCorriente: 0,
                pasivoCorriente: 0,
                inventarios: 0,
                disponibilidades: 0,
                activoNoCorriente: 0,
                activoTotal: 0,
                pasivoTotal: 0,
                patrimonioNeto: 0,
                ventas: null,
                costoVentas: null,
                resultadoNeto: null,
                entriesCount: 0
            };
        }

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

        // 4. Extract Specifics (Inventory, Cash) with Fallback Heuristics
        let inventarios = 0;
        let disponibilidades = 0;
        let foundInventory = false;
        let foundCash = false;

        // Regex patterns for heuristics
        const regexInventory = /(mercader|inventar|stock|bienes de cambio)/i;
        const regexCash = /(caja|banco|cta cte|cuenta corriente|efectivo|disponib)/i;

        balanceSheet.currentAssets.accounts.forEach(item => {
            const sg = item.account.statementGroup;
            const name = item.account.name;
            // Also check if account code starts with standard prefix if we had valid ones. 
            // But relying on Name/SG is safer for mixed plans.

            // A) Priority: Statement Group
            if (sg === 'INVENTORIES') {
                inventarios += item.balance;
                foundInventory = true;
            } else if (sg === 'CASH_AND_BANKS') {
                disponibilidades += item.balance;
                foundCash = true;
            }
            // B) Fallback: Regex Heuristics (only if SG is missing)
            else if (!sg) {
                if (regexInventory.test(name)) {
                    inventarios += item.balance;
                    foundInventory = true;
                } else if (regexCash.test(name)) {
                    disponibilidades += item.balance;
                    foundCash = true;
                }
            }
        });

        // If nothing found and totals > 0, we might want to flag it as "Requiere Mapeo" by returning null?
        // But the requirement says: "Set inventarios = null... then indicators show 'Requiere mapeo'"
        // If we found NO inventory accounts (and AC > 0), maybe we should return null?
        // But what if the company simply HAS NO inventory?
        // Let's be strict: if we used heuristics and found nothing, and we have AC, maybe it's just really 0.
        // BUT user asked: "If after heuristics you still cannot identify: Set inventarios = null".
        // This likely means if we couldn't classify ANY account into these buckets confidently?
        // Actually, if we found *some* cash, then disponibilidades is valid. 
        // If we found *no* cash accounts, is it 0 or null?
        // If we have AC > 0, but 0 Cash detected, it's suspicious.
        // Let's return null if totals are non-zero but we found 0 matches.

        // Refined logic:
        // Use aux flags `foundInventory` / `foundCash`.
        // If foundInventory is false, and activoCorriente > 0, it's ambiguous -> return null so user maps it.
        // If foundInventory is false, and activoCorriente == 0, then 0 is fine.

        const finalInventarios = (foundInventory || activoCorriente === 0) ? inventarios : null;
        const finalDisponibilidades = (foundCash || activoCorriente === 0) ? disponibilidades : null;

        // 5. Extract Economic Data (Income Statement)
        const hasOperatingData = incomeStatement.sales.accounts.length > 0 || incomeStatement.cogs.accounts.length > 0;

        let ventas: number | null = null;
        let costoVentas: number | null = null;
        let resultadoNeto: number | null = null;

        if (hasOperatingData) {
            ventas = incomeStatement.sales.netTotal;
            costoVentas = incomeStatement.cogs.netTotal;
            resultadoNeto = incomeStatement.netIncome;
        }

        return {
            activoCorriente,
            pasivoCorriente,
            inventarios: finalInventarios as any, // Cast to handle the null (interface might expect number, need verification) -> Interface says number.
            // Wait, previous interface said number. Task says "Set inventarios = null". unique fix needed in interface.
            disponibilidades: finalDisponibilidades as any,
            activoNoCorriente,
            activoTotal,
            pasivoTotal,
            patrimonioNeto,
            ventas,
            costoVentas,
            resultadoNeto,
            entriesCount: entries.length
        };

    }, [accounts, entries]);

    return metrics;
}
