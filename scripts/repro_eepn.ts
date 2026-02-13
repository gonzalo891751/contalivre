
import { computeEEPN, EEPNInput } from '../src/core/eepn/compute';
import { EEPN_COLUMNS } from '../src/core/eepn/columns';
import { Account, JournalEntry } from '../src/core/models';

// Mocks
const accounts: Account[] = [
    { id: '1', code: '1.1.01.01', name: 'Caja', kind: 'ASSET', section: 'CURRENT', group: 'Caja', statementGroup: 'CASH_AND_BANKS', parentId: null, level: 3, normalSide: 'DEBIT', isContra: false, isHeader: false, allowOppositeBalance: false },
    { id: '2', code: '4.1.01', name: 'Ventas', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos', statementGroup: 'SALES', parentId: null, level: 2, normalSide: 'CREDIT', isContra: false, isHeader: false, allowOppositeBalance: false },
    { id: '3', code: '3.3.02', name: 'Resultado del ejercicio', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados', statementGroup: 'RETAINED_EARNINGS', parentId: null, level: 3, normalSide: 'CREDIT', isContra: false, isHeader: false, allowOppositeBalance: false },
];

const periodStart = '2024-01-01';
const periodEnd = '2024-12-31';

// Scenario: 1000 Sales, Closed to 3.3.02
const entries: JournalEntry[] = [
    // 1. Sale: Debit Cash 1000, Credit Sales 1000
    {
        id: 'e1',
        date: '2024-06-01',
        memo: 'Venta',
        items: [
            { id: 'i1', accountId: '1', debit: 1000, credit: 0 },
            { id: 'i2', accountId: '2', debit: 0, credit: 1000 },
        ]
    },
    // 2. Closing Entry: Debit Sales 1000, Credit Resultado Ejercicio 1000
    {
        id: 'e2',
        date: '2024-12-31',
        memo: 'Refundición de Resultados (Cierre)',
        isClosingEntry: true, // Tag used by excludeClosingEntries
        items: [
            { id: 'i3', accountId: '2', debit: 1000, credit: 0 },
            { id: 'i4', accountId: '3', debit: 0, credit: 1000 },
        ]
    }
];

// Net Income is 1000
const netIncomeFromER = 1000;
const pnFromBalance = 1000; // Assets=1000, Liab=0, Equity=1000 (3.3.02=1000)

// Test 1: With Raw Entries (including closing)
console.log("--- Test 1: Raw Entries (Simulating App Behavior) ---");
try {
    const result = computeEEPN({
        accounts,
        entries, // Needs mapping to internal format if computeEEPN expects something else? 
        // computeEEPN expects JournalEntry[] which matches our mock above roughly.
        // We rely on the fact that computeEEPN is pure.
        periodStart,
        periodEnd,
        netIncomeFromER,
        pnFromBalance
    } as any);

    console.log("PN Cierre Calculated:", result.pnCierre);
    console.log("PN Balance Expected:", pnFromBalance);
    console.log("Diff:", result.pnCierre - pnFromBalance);
    console.log("Warnings:", result.reconciliation.warnings);

    // Check columns
    const resCol = result.rows.find(r => r.id === 'saldo_cierre');
    console.log("Saldo Cierre Row:", JSON.stringify(resCol, null, 2));

} catch (e) {
    console.error(e);
}
