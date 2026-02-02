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
    },
    AJUSTE_CAPITAL: {
        codes: ['3.1.02', '3.1.03'],
        patterns: ['ajuste de capital', 'ajuste capital', 'reexpresion capital'],
        fallbackCode: '3.1.02',
        fallbackName: 'Ajuste de Capital (Auto-crear)'
    }
};

/** Detect if account is "Capital Social" (should not be modified directly) */
const CAPITAL_SOCIAL_PATTERNS = ['capital social', 'capital suscripto', 'capital autorizado'];

function isCapitalSocialAccount(accountCode: string, accountName: string): boolean {
    const nameLower = accountName.toLowerCase();
    // Match by name patterns
    if (CAPITAL_SOCIAL_PATTERNS.some(p => nameLower.includes(p))) {
        return true;
    }
    // Match by typical capital codes (3.1.01, 3.01.01)
    const codePatterns = [/^3\.1\.01/, /^3\.01\.01/, /^3\.1\.1$/];
    return codePatterns.some(pattern => pattern.test(accountCode));
}

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
export function getSpecialAccount(accounts: Account[], type: 'RECPAM' | 'RXT' | 'AJUSTE_CAPITAL') {
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
// normalSide resolution + sign helpers
// ============================================

/**
 * Resolve the normalSide for any partida.
 * Priority: explicit normalSide > accountKind > code prefix fallback.
 */
function resolveNormalSide(p: { normalSide?: string; accountKind?: string; cuentaCodigo?: string }): 'DEBIT' | 'CREDIT' {
    if (p.normalSide === 'DEBIT' || p.normalSide === 'CREDIT') return p.normalSide;
    if (p.accountKind === 'ASSET' || p.accountKind === 'EXPENSE') return 'DEBIT';
    if (p.accountKind === 'LIABILITY' || p.accountKind === 'EQUITY' || p.accountKind === 'INCOME') return 'CREDIT';
    // Fallback by code prefix
    const code = p.cuentaCodigo || '';
    if (code.startsWith('1.') || code.startsWith('5.')) return 'DEBIT';
    return 'CREDIT'; // 2.x, 3.x, 4.x
}

/**
 * Convert totalBase/totalHomog to normal-side amounts.
 *
 * Two conventions exist for totalBase:
 *   - Regular accounts (no inventoryRole): totalBase is ALWAYS POSITIVE,
 *     representing the balance on the account's normal side.
 *     → originNormal = totalBase, homogNormal = totalHomog (already on normal side)
 *
 *   - Movement accounts (inventoryRole === 'periodic_movement'): totalBase
 *     is SIGNED as (debit - credit). A CREDIT-normal movement account with
 *     a positive balance has negative totalBase.
 *     → originNormal = ns==='DEBIT' ? totalBase : -totalBase
 */
function toNormalSideAmounts(
    totalBase: number,
    totalHomog: number,
    ns: 'DEBIT' | 'CREDIT',
    isSignedMovement: boolean
): { originNormal: number; homogNormal: number } {
    if (isSignedMovement) {
        return {
            originNormal: ns === 'DEBIT' ? totalBase : -totalBase,
            homogNormal: ns === 'DEBIT' ? totalHomog : -totalHomog,
        };
    }
    // Regular: already positive on normal side
    return { originNormal: totalBase, homogNormal: totalHomog };
}

/**
 * Core delta calculation shared by RT6 adjustment helpers.
 * Returns deltaNormal (positive = increase on normal side).
 */
function computeDeltaNormal(p: ComputedPartidaRT6): { ns: 'DEBIT' | 'CREDIT'; deltaNormal: number } {
    const ns = resolveNormalSide(p);
    const isSigned = p.inventoryRole === 'periodic_movement';
    const { originNormal, homogNormal } = toNormalSideAmounts(p.totalBase, p.totalHomog, ns, isSigned);
    const deltaNormal = round(homogNormal - originNormal);
    return { ns, deltaNormal };
}

/**
 * Determine which side (DEBE or HABER) the RT6 adjustment line should go to.
 *
 * deltaNormal > 0 → adjustment goes to NORMAL side
 * deltaNormal < 0 → adjustment goes to OPPOSITE side
 */
function getAdjustmentSide(p: ComputedPartidaRT6): 'DEBE' | 'HABER' | null {
    const { ns, deltaNormal } = computeDeltaNormal(p);
    if (deltaNormal === 0) return null;
    if (deltaNormal > 0) {
        return ns === 'DEBIT' ? 'DEBE' : 'HABER';
    }
    return ns === 'DEBIT' ? 'HABER' : 'DEBE';
}

/**
 * Compute the adjustment amount and side for an RT6 partida.
 * Returns { debe, haber } for the account line.
 */
function computeRT6LineAmounts(p: ComputedPartidaRT6): { debe: number; haber: number } {
    const { ns, deltaNormal } = computeDeltaNormal(p);
    const amount = round(Math.abs(deltaNormal));
    if (amount === 0) return { debe: 0, haber: 0 };

    const goesToNormalSide = deltaNormal > 0;
    const toDebe = (goesToNormalSide && ns === 'DEBIT') || (!goesToNormalSide && ns === 'CREDIT');
    return {
        debe: toDebe ? amount : 0,
        haber: toDebe ? 0 : amount,
    };
}

// ============================================
// RT17 normalSide-aware sign helpers
// ============================================

/**
 * Determine which side the RT17 adjustment line should go to.
 * resTenencia is a signed value (valCorriente - baseReference).
 * deltaNormal = ns==='DEBIT' ? resTenencia : -resTenencia
 */
function getRT17AdjustmentSide(p: ComputedPartidaRT17): 'DEBE' | 'HABER' | null {
    const ns = resolveNormalSide(p);
    const resTenencia = round(p.resTenencia);
    if (resTenencia === 0) return null;
    const deltaNormal = ns === 'DEBIT' ? resTenencia : -resTenencia;
    if (deltaNormal > 0) {
        return ns === 'DEBIT' ? 'DEBE' : 'HABER';
    }
    return ns === 'DEBIT' ? 'HABER' : 'DEBE';
}

/**
 * Compute the adjustment amount and side for an RT17 partida.
 */
function computeRT17LineAmounts(p: ComputedPartidaRT17): { debe: number; haber: number } {
    const ns = resolveNormalSide(p);
    const resTenencia = round(p.resTenencia);
    if (resTenencia === 0) return { debe: 0, haber: 0 };
    const deltaNormal = ns === 'DEBIT' ? resTenencia : -resTenencia;
    const amount = round(Math.abs(deltaNormal));
    const goesToNormalSide = deltaNormal > 0;
    const toDebe = (goesToNormalSide && ns === 'DEBIT') || (!goesToNormalSide && ns === 'CREDIT');
    return {
        debe: toDebe ? amount : 0,
        haber: toDebe ? 0 : amount,
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

    // 1. RT6 Ganancia: lines that adjust in DEBE → RECPAM in HABER
    const rt6Pos = buildVoucher({
        partidas: computedRT6.filter(p => getAdjustmentSide(p) === 'DEBE'),
        type: 'RT6',
        direction: 'HABER',
        contraAcc: recpam,
        allAccounts
    });
    if (rt6Pos) vouchers.push({ ...rt6Pos, numero: vouchers.length + 1 });

    // 2. RT6 Perdida: lines that adjust in HABER → RECPAM in DEBE
    const rt6Neg = buildVoucher({
        partidas: computedRT6.filter(p => getAdjustmentSide(p) === 'HABER'),
        type: 'RT6',
        direction: 'DEBE',
        contraAcc: recpam,
        allAccounts
    });
    if (rt6Neg) vouchers.push({ ...rt6Neg, numero: vouchers.length + 1 });

    // 3. RT17 Ganancia: lines that adjust in DEBE → RxT in HABER
    const rt17Pos = buildVoucher({
        partidas: computedRT17.filter(p => getRT17AdjustmentSide(p) === 'DEBE'),
        type: 'RT17',
        direction: 'HABER',
        contraAcc: rxt,
        allAccounts
    });
    if (rt17Pos) vouchers.push({ ...rt17Pos, numero: vouchers.length + 1 });

    // 4. RT17 Perdida: lines that adjust in HABER → RxT in DEBE
    const rt17Neg = buildVoucher({
        partidas: computedRT17.filter(p => getRT17AdjustmentSide(p) === 'HABER'),
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

    // Get Ajuste de Capital account for redirection
    const ajusteCapital = getSpecialAccount(allAccounts, 'AJUSTE_CAPITAL');

    const baseLines: AsientoLine[] = [];
    let sumImpact = 0;
    let hasCapitalRedirection = false;

    partidas.forEach(p => {
        // Find exact account in plan
        const acc = allAccounts.find(a => a.code === p.cuentaCodigo);

        // Check if this is Capital Social - redirect to Ajuste de Capital
        const isCapitalSocial = isCapitalSocialAccount(p.cuentaCodigo, p.cuentaNombre);

        // Compute debe/haber using normalSide-aware logic for RT6,
        // or the original sign-based logic for RT17.
        let debe: number;
        let haber: number;

        if (type === 'RT6') {
            const amounts = computeRT6LineAmounts(p as ComputedPartidaRT6);
            debe = amounts.debe;
            haber = amounts.haber;
        } else {
            const amounts = computeRT17LineAmounts(p as ComputedPartidaRT17);
            debe = amounts.debe;
            haber = amounts.haber;
        }

        if (debe === 0 && haber === 0) return;

        if (isCapitalSocial) {
            hasCapitalRedirection = true;
            baseLines.push({
                accountId: ajusteCapital.account.id,
                cuentaCodigo: ajusteCapital.account.code,
                cuentaNombre: ajusteCapital.account.name,
                debe,
                haber,
            });
        } else {
            baseLines.push({
                accountId: acc?.id,
                cuentaCodigo: acc?.code || p.cuentaCodigo,
                cuentaNombre: acc?.name || p.cuentaNombre,
                debe,
                haber,
            });
        }

        sumImpact += (debe - haber);
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

    // Build combined warning
    let warning = contraAcc.warning;
    if (hasCapitalRedirection && ajusteCapital.warning) {
        warning = warning ? `${warning}; ${ajusteCapital.warning}` : ajusteCapital.warning;
    }

    return {
        numero: 0, // Assigned by caller
        key,
        descripcion: descMap[key as keyof typeof descMap],
        lineas: finalLines.sort((a, b) => (a.debe > 0 && b.haber > 0 ? -1 : 1)),
        tipo: type,
        totalDebe,
        totalHaber,
        warning,
        isValid: totalDebe === totalHaber && totalDebe > 0,
        capitalRedirected: hasCapitalRedirection // Flag for UI
    };
}

// ============================================
// Validation for UI Blocking
// ============================================

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate all drafts before allowing submission to Libro Diario
 */
export function validateDraftsForSubmission(
    drafts: AsientoBorrador[],
    pendingClassificationCount: number,
    pendingValuationCount: number
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check all drafts are balanced
    for (const draft of drafts) {
        if (!draft.isValid) {
            errors.push(`Asiento "${draft.descripcion}" no esta balanceado (D: ${draft.totalDebe}, H: ${draft.totalHaber})`);
        }
    }

    // 2. Check no pending classifications
    if (pendingClassificationCount > 0) {
        errors.push(`Hay ${pendingClassificationCount} cuenta(s) sin clasificar. Debe resolver antes de continuar.`);
    }

    // 3. Check no pending valuations (warning, not blocking)
    if (pendingValuationCount > 0) {
        warnings.push(`Hay ${pendingValuationCount} cuenta(s) pendientes de valuacion. Se usara el valor homogeneo como valor corriente.`);
    }

    // 4. Check drafts have warnings about missing accounts
    for (const draft of drafts) {
        if (draft.warning) {
            warnings.push(draft.warning);
        }
    }

    // 5. Check there are drafts to submit
    if (drafts.length === 0) {
        errors.push('No hay asientos para enviar al Libro Diario.');
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Get summary of all drafts
 */
export function getDraftsSummary(drafts: AsientoBorrador[]) {
    const rt6Drafts = drafts.filter(d => d.tipo === 'RT6');
    const rt17Drafts = drafts.filter(d => d.tipo === 'RT17');

    const rt6Total = rt6Drafts.reduce((sum, d) => {
        const net = d.lineas.find(l => l.cuentaCodigo.includes('4.6') || l.cuentaNombre.toLowerCase().includes('recpam'));
        return sum + (net?.haber || 0) - (net?.debe || 0);
    }, 0);

    const rt17Total = rt17Drafts.reduce((sum, d) => {
        const net = d.lineas.find(l => l.cuentaCodigo.includes('4.6') || l.cuentaNombre.toLowerCase().includes('tenencia'));
        return sum + (net?.haber || 0) - (net?.debe || 0);
    }, 0);

    return {
        rt6Count: rt6Drafts.length,
        rt17Count: rt17Drafts.length,
        totalCount: drafts.length,
        rt6NetResult: round(rt6Total),
        rt17NetResult: round(rt17Total),
        allValid: drafts.every(d => d.isValid),
        hasWarnings: drafts.some(d => d.warning),
    };
}
