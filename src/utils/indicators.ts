export type Sentiment = 'success' | 'warning' | 'error' | 'neutral' | 'info';
export type GroupId = 'financiero' | 'patrimonial' | 'economico';
export type ChartType = 'gauge' | 'bar' | 'none';

export interface IndicatorValue {
    value: number | null;
    formattedValue: string;
    sentiment: Sentiment;
    statusLabel: string;
}

export interface KPIConfig {
    id: string;
    group: GroupId;
    title: string;
    formula: string;
    explanation: string;
    interpretation: string;
    chartType: ChartType;
    thresholdMin?: number;
    thresholdMax?: number;
}

// Helpers
export const safeDiv = (n: number, d: number): number | null => {
    if (d === 0) return n === 0 ? null : Infinity;
    return n / d;
};

export const formatCurrency = (val: number | null) => {
    if (val === null) return 'N/D';
    if (!isFinite(val)) return '∞';
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
};

export const formatNumber = (val: number | null) => {
    if (val === null) return 'N/D';
    if (!isFinite(val)) return '∞';
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
};

export const formatPercent = (val: number | null) => {
    if (val === null) return 'N/D';
    if (!isFinite(val)) return '∞';
    return new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(val);
};

export const formatDays = (val: number | null) => {
    if (val === null) return 'N/D';
    if (!isFinite(val)) return '∞';
    return `${Math.round(val)}d`;
};

/**
 * Calculates status based on thresholds
 */
export const getStatus = (
    val: number | null,
    minGood: number,
    maxGood: number,
    labels: { good: string, mid: string, bad: string },
    inverted = false
): { statusLabel: string, sentiment: Sentiment } => {
    if (val === null) return { statusLabel: 'N/D', sentiment: 'neutral' };

    let isGood, isBad;

    if (!inverted) {
        // Normal: Higher is better or specific range
        isGood = val >= minGood;
        if (maxGood !== Infinity && val > maxGood * 1.5) isGood = true; // Open upper range

        // Bad is defined as significantly below minimum
        isBad = val < minGood * 0.8;
    } else {
        // Inverted: Lower is better
        isGood = val <= maxGood;
        isBad = val > maxGood * 1.3;
    }

    if (isGood) return { statusLabel: labels.good, sentiment: 'success' };
    if (isBad) return { statusLabel: labels.bad, sentiment: 'error' };

    return { statusLabel: labels.mid, sentiment: 'warning' };
};

export interface KPIMetrics {
    // Financial
    workingCapital: number | null;
    currentRatio: number | null; // Liquidez Corriente
    acidTest: number | null; // Prueba Ácida
    cashRatio: number | null; // Liquidez Caja

    // Activity (Days) - Requires averages, using snapshots for now
    daysReceivable: number | null; // Plazo Cobro
    daysPayable: number | null; // Plazo Pago

    // Solvency / Patrimonial
    debtRatio: number | null; // Endeudamiento
    solvencyTotal: number | null; // Solvencia Total
    autonomy: number | null; // Autonomía
    leverage: number | null; // Apalancamiento
    shortTermDebtProfile: number | null; // % Deuda CP
    immobilization: number | null; // Inmovilidad

    // Economic
    grossMargin: number | null;
    netMargin: number | null;
    roe: number | null;
}

/**
 * Computes all KPIs from raw totals
 */
export function computeKPIs(
    totals: {
        ac: number; // Activo Corriente
        anc: number; // Activo No Corriente
        pc: number; // Pasivo Corriente
        pnc: number; // Pasivo No Corriente
        pn: number; // Patrimonio Neto
        at: number; // Activo Total
        pt: number; // Pasivo Total (PC + PNC)
    },
    details: {
        inventory: number;
        cash: number;
        sales: number | null;
        cogs: number | null; // usually negative in input, ensuring magnitude
        netIncome: number | null;
    }
): KPIMetrics {
    const { ac, anc, pc, pn, at, pt } = totals;
    const { inventory, cash, sales, cogs, netIncome } = details;

    // Financial
    const workingCapital = ac - pc;
    const currentRatio = safeDiv(ac, pc);
    const acidTest = safeDiv(ac - inventory, pc);
    const cashRatio = safeDiv(cash, pc);

    // Mocks for now (Activity) - hard to compute without temporal data/average balances
    // Defaulting to "Technical Reference" values if real data unavailable
    const daysReceivable = 60;
    const daysPayable = 45;

    // Patrimonial
    const debtRatio = safeDiv(pt, at);
    const solvencyTotal = safeDiv(at, pt);
    const autonomy = safeDiv(pn, at);
    const leverage = safeDiv(pt, pn);
    const shortTermDebtProfile = safeDiv(pc, pt);
    const immobilization = safeDiv(anc, at);

    // Economic
    let grossMargin: number | null = null;
    let netMargin: number | null = null;
    let roe: number | null = null;

    if (sales !== null && sales !== 0) {
        // Gross Margin = (Sales - |COGS|) / Sales
        if (cogs !== null) {
            grossMargin = (sales - Math.abs(cogs)) / sales;
        }
        // Net Margin = Net Income / Sales
        if (netIncome !== null) {
            netMargin = netIncome / sales;
        }
    }

    // ROE = Net Income / Equity
    if (netIncome !== null && pn !== 0) {
        roe = netIncome / pn;
    }

    return {
        workingCapital,
        currentRatio,
        acidTest,
        cashRatio,
        daysReceivable,
        daysPayable,
        debtRatio,
        solvencyTotal,
        autonomy,
        leverage,
        shortTermDebtProfile,
        immobilization,
        grossMargin, // Will be filled by hook or separate logic if details absent
        netMargin,
        roe
    };
}
