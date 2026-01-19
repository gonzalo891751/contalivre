/**
 * Cierre: AxI + Valuación - Asientos (v2 - Split Logic)
 * 
 * Generates journal entries splitting positive and negative impacts
 * to avoid netting the contra account (RECPAM / RxT).
 */

import type { Account } from '../models';
import type {
    ComputedPartidaRT6,
    ComputedPartidaRT17,
    AsientoBorrador,
    AsientoLine
} from './types';

// ============================================
// Constants & Fallbacks
// ============================================

export const SPECIAL_ACCOUNT_HINTS = {
    RECPAM: {
        codes: ['4.6.05', '5.4.01.01'],
        patterns: ['recpam', 'resultado por exposicion', 'inflacion'],
        fallbackCode: '4.6.05',
        fallbackName: 'RECPAM (Auto)'
    },
    RXT: {
        codes: ['4.6.06', '4.2.01.01'],
        patterns: ['resultado por tenencia', 'rxt', 'tenencia'],
        fallbackCode: '4.6.06',
        fallbackName: 'Resultado por Tenencia (Auto)'
    }
};

// ============================================
// Helpers
// ============================================

/** Round to 2 decimals for accounting */
const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

/** Sum lines for same account */
function consolidateByAccount(lines: AsientoLine[]): AsientoLine[] {
    const map = new Map<string, AsientoLine>();
    lines.forEach(l => {
        const key = l.cuentaCodigo;
        if (map.has(key)) {
            const existing = map.get(key)!;
            existing.debe = round(existing.debe + l.debe);
            existing.haber = round(existing.haber + l.haber);
        } else {
            map.set(key, { ...l });
        }
    });

    return Array.from(map.values()).sort((a, b) => {
        // Debits first, then code
        if (a.debe > 0 && b.haber > 0) return -1;
        if (a.haber > 0 && b.debe > 0) return 1;
        return a.cuentaCodigo.localeCompare(b.cuentaCodigo);
    });
}

/** Find special account with fallback info */
export function getSpecialAccount(accounts: Account[], type: 'RECPAM' | 'RXT') {
    const hint = SPECIAL_ACCOUNT_HINTS[type];

    // 1. Try codes
    let acc = accounts.find(a => !a.isHeader && hint.codes.includes(a.code));

    // 2. Try names
    if (!acc) {
        acc = accounts.find(a => {
            const lower = a.name.toLowerCase();
            return !a.isHeader && hint.patterns.some(p => lower.includes(p));
        });
    }

    if (acc) return { account: acc, warning: undefined };

    // 3. Fallback
    return {
        account: {
            id: 'fallback-' + type,
            code: hint.fallbackCode,
            name: hint.fallbackName,
        } as Account,
        warning: `Cuenta ${type} no encontrada: usando fallback ${hint.fallbackCode}`
    };
}

// ============================================
// Main Generators
// ============================================

/**
 * Generate up to 4 vouchers (RT6 +/- and RT17 +/-)
 */
export function generateCierreDrafts(
    computedRT6: ComputedPartidaRT6[],
    computedRT17: ComputedPartidaRT17[],
    allAccounts: Account[]
): AsientoBorrador[] {

    const vouchers: AsientoBorrador[] = [];
    const recpam = getSpecialAccount(allAccounts, 'RECPAM');
    const rxt = getSpecialAccount(allAccounts, 'RXT');

    // 1. RT6 Positive (RECPAM credit)
    const rt6Pos = buildVoucher({
        partidas: computedRT6.filter(p => round(p.totalRecpam) > 0),
        type: 'RT6',
        direction: 'HABER',
        contraAcc: recpam,
        allAccounts
    });
    if (rt6Pos) vouchers.push({ ...rt6Pos, numero: vouchers.length + 1 });

    // 2. RT6 Negative (RECPAM debit)
    const rt6Neg = buildVoucher({
        partidas: computedRT6.filter(p => round(p.totalRecpam) < 0),
        type: 'RT6',
        direction: 'DEBE',
        contraAcc: recpam,
        allAccounts
    });
    if (rt6Neg) vouchers.push({ ...rt6Neg, numero: vouchers.length + 1 });

    // 3. RT17 Gains (RxT credit)
    const rt17Pos = buildVoucher({
        partidas: computedRT17.filter(p => round(p.resTenencia) > 0),
        type: 'RT17',
        direction: 'HABER',
        contraAcc: rxt,
        allAccounts
    });
    if (rt17Pos) vouchers.push({ ...rt17Pos, numero: vouchers.length + 1 });

    // 4. RT17 Losses (RxT debit)
    const rt17Neg = buildVoucher({
        partidas: computedRT17.filter(p => round(p.resTenencia) < 0),
        type: 'RT17',
        direction: 'DEBE',
        contraAcc: rxt,
        allAccounts
    });
    if (rt17Neg) vouchers.push({ ...rt17Neg, numero: vouchers.length + 1 });

    return vouchers;
}

interface BuilderParams {
    partidas: (ComputedPartidaRT6 | ComputedPartidaRT17)[];
    type: 'RT6' | 'RT17';
    direction: 'DEBE' | 'HABER';
    contraAcc: { account: Account, warning?: string };
    allAccounts: Account[];
}

function buildVoucher(params: BuilderParams): AsientoBorrador | null {
    const { partidas, type, direction, contraAcc, allAccounts } = params;
    if (partidas.length === 0) return null;

    const baseLines: AsientoLine[] = [];
    let sumImpact = 0;

    partidas.forEach(p => {
        const val = type === 'RT6' ? (p as ComputedPartidaRT6).totalRecpam : (p as ComputedPartidaRT17).resTenencia;
        const roundedVal = round(val);
        if (roundedVal === 0) return;

        // Find exact account in plan
        const acc = allAccounts.find(a => a.code === p.cuentaCodigo);

        baseLines.push({
            accountId: acc?.id,
            cuentaCodigo: acc?.code || p.cuentaCodigo,
            cuentaNombre: acc?.name || p.cuentaNombre,
            debe: roundedVal > 0 ? roundedVal : 0,
            haber: roundedVal < 0 ? Math.abs(roundedVal) : 0,
        });

        sumImpact += roundedVal;
    });

    if (baseLines.length === 0) return null;

    const consolidated = consolidateByAccount(baseLines);

    // Add contra line
    const netTotal = round(Math.abs(sumImpact));
    const contraLine: AsientoLine = {
        accountId: contraAcc.account.id,
        cuentaCodigo: contraAcc.account.code,
        cuentaNombre: contraAcc.account.name,
        debe: direction === 'DEBE' ? netTotal : 0,
        haber: direction === 'HABER' ? netTotal : 0,
    };

    // Balancing check and 0.01 adjustment
    const finalLines = [...consolidated, contraLine];
    let totalDebe = round(finalLines.reduce((s, l) => s + l.debe, 0));
    let totalHaber = round(finalLines.reduce((s, l) => s + l.haber, 0));

    if (totalDebe !== totalHaber) {
        const diff = round(totalDebe - totalHaber);
        if (Math.abs(diff) <= 0.011) {
            // Apply to contra line
            if (direction === 'DEBE') {
                contraLine.debe = round(contraLine.debe - diff);
            } else {
                contraLine.haber = round(contraLine.haber + diff);
            }
            // Recalc totals
            totalDebe = round(finalLines.reduce((s, l) => s + l.debe, 0));
            totalHaber = round(finalLines.reduce((s, l) => s + l.haber, 0));
        }
    }

    const key = `${type}_${direction}`;
    const descMap = {
        RT6_HABER: 'Ajuste por inflación (ganancia)',
        RT6_DEBE: 'Ajuste por inflación (pérdida)',
        RT17_HABER: 'Ajuste valuación RxT (ganancia)',
        RT17_DEBE: 'Ajuste valuación RxT (pérdida)',
    };

    return {
        numero: 0, // Assigned by caller
        key,
        descripcion: descMap[key as keyof typeof descMap],
        lineas: finalLines.sort((a, b) => (a.debe > 0 && b.haber > 0 ? -1 : 1)),
        tipo: type,
        totalDebe,
        totalHaber,
        warning: contraAcc.warning,
        isValid: totalDebe === totalHaber && totalDebe > 0
    };
}
