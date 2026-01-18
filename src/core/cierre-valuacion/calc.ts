/**
 * Cierre: AxI + Valuación - Calculations
 *
 * Calculation utilities for RT6 (Ajuste por Inflación) and RT17 (Valuación).
 */

import type {
    IndexRow,
    PartidaRT6,
    RT17Valuation,
    ValuacionStatus,
    ComputedPartidaRT6,
    ComputedPartidaRT17,
    ComputedLotRT6,
    AsientoBorrador,
    AsientoLine,
    PartidaStatus,
    GrupoContable,
} from './types';

// ============================================
// Date & Period Helpers
// ============================================

/**
 * Extract YYYY-MM period from a date string
 */
export function getPeriodFromDate(dateStr: string): string {
    if (!dateStr || dateStr.length < 7) return '';
    return dateStr.substring(0, 7); // YYYY-MM
}

/**
 * Format date for display (dd/mm/yyyy)
 */
export function formatDateDisplay(dateStr: string): string {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

// ============================================
// Index Helpers
// ============================================

/**
 * Find index value for a given period
 */
export function getIndexForPeriod(indices: IndexRow[], period: string): number | undefined {
    return indices.find((i) => i.period === period)?.value;
}

/**
 * Calculate coefficient (indexClose / indexBase)
 */
export function calculateCoef(indexClose: number | undefined, indexBase: number | undefined): number {
    if (!indexClose || !indexBase || indexBase === 0) return 1;
    return indexClose / indexBase;
}

/**
 * Calculate coefficient from date to closing period
 */
export function calculateCoefFromDate(
    indices: IndexRow[],
    originDate: string,
    closingPeriod: string
): number {
    const originPeriod = getPeriodFromDate(originDate);
    const indexBase = getIndexForPeriod(indices, originPeriod);
    const indexClose = getIndexForPeriod(indices, closingPeriod);
    return calculateCoef(indexClose, indexBase);
}

// ============================================
// RT6 Calculations
// ============================================

/**
 * Compute a single RT6 partida with all calculated values
 */
export function computeRT6Partida(
    partida: PartidaRT6,
    indices: IndexRow[],
    closingPeriod: string
): ComputedPartidaRT6 {
    const indexClose = getIndexForPeriod(indices, closingPeriod);
    const isMissingClosingIndex = !indexClose;

    let totalBase = 0;
    let totalHomog = 0;
    let status: PartidaStatus = 'ok';

    const itemsComputed: ComputedLotRT6[] = partida.items.map((item) => {
        const originPeriod = getPeriodFromDate(item.fechaOrigen);
        const indexBase = getIndexForPeriod(indices, originPeriod);

        // Check for missing indices
        if (!indexBase) {
            status = 'warning';
        }

        const coef = calculateCoef(indexClose, indexBase);
        const homog = item.importeBase * coef;

        return {
            ...item,
            coef,
            homog,
        };
    });

    totalBase = itemsComputed.reduce((sum, i) => sum + i.importeBase, 0);
    totalHomog = itemsComputed.reduce((sum, i) => sum + i.homog, 0);

    if (isMissingClosingIndex) {
        status = 'error';
    }

    return {
        ...partida,
        itemsComputed,
        totalBase,
        totalHomog,
        totalRecpam: totalHomog - totalBase,
        status,
    };
}

/**
 * Compute all RT6 partidas
 */
export function computeAllRT6Partidas(
    partidas: PartidaRT6[],
    indices: IndexRow[],
    closingPeriod: string
): ComputedPartidaRT6[] {
    return partidas.map((p) => computeRT6Partida(p, indices, closingPeriod));
}

// ============================================
// RT17 Calculations
// ============================================

/**
 * Compute a single RT17 partida with all calculated values
 */
/**
 * Baseline data extracted from RT6 for RT17 valuation
 */
export interface RT17Baseline {
    sourcePartidaId: string;
    grupo: GrupoContable;
    rubroLabel: string;
    cuentaCodigo: string;
    cuentaNombre: string;
    totalHomog: number;
    totalBase: number;
}

/**
 * Extract baselines from computed RT6 partidas
 */
export function getRt17BaselinesFromRt6(computedRT6: ComputedPartidaRT6[]): Map<string, RT17Baseline> {
    const map = new Map<string, RT17Baseline>();
    for (const p of computedRT6) {
        map.set(p.id, {
            sourcePartidaId: p.id,
            grupo: p.grupo,
            rubroLabel: p.rubroLabel,
            cuentaCodigo: p.cuentaCodigo,
            cuentaNombre: p.cuentaNombre,
            totalHomog: p.totalHomog,
            totalBase: p.totalBase,
        });
    }
    return map;
}

/**
 * Compute a single RT17 partida with all calculated values
 */
/**
 * Compute all RT17 partidas from Step 2 items and saved valuations
 */
export function computeAllRT17Partidas(
    computedRT6: ComputedPartidaRT6[],
    valuations: Record<string, RT17Valuation>
): ComputedPartidaRT17[] {
    return computedRT6.map((p6) => {
        const val = valuations[p6.id];

        // Base values from Step 2
        const baseReference = p6.totalHomog;

        // Calculated/Saved values
        let valCorriente = baseReference; // default to homog
        let resTenencia = 0;
        let status: ValuacionStatus = p6.grupo === 'PN' ? 'na' : 'pending';

        if (val) {
            valCorriente = val.valCorriente;
            resTenencia = val.resTenencia;
            status = val.status;
        }

        return {
            id: p6.id, // ID matches RT6 ID for the bridge
            type: p6.profileType === 'moneda_extranjera' ? 'USD' : 'Otros',
            grupo: p6.grupo,
            rubroLabel: p6.rubroLabel,
            cuentaCodigo: p6.cuentaCodigo,
            cuentaNombre: p6.cuentaNombre,
            sourcePartidaId: p6.id,
            valuationStatus: status,
            profileType: p6.profileType,

            // Persisted inputs for the drawer
            tcCierre: val?.tcCierre,
            manualCurrentValue: val?.manualCurrentValue,

            // Computed values
            valCorriente,
            resTenencia,
            baseReference,
            sourceUsdAmount: p6.usdAmount,
        };
    });
}

// ============================================
// RECPAM Estimator
// ============================================

/**
 * Calculate estimated RECPAM for monetary position
 * @param pmn - Net monetary position (activos - pasivos monetarios)
 * @param coef - Period coefficient
 * @returns Estimated RECPAM (negative if PMN positive, positive if PMN negative)
 */
export function calculateRecpamEstimado(pmn: number, coef: number): number {
    // RECPAM = PMN * (coef - 1) * -1
    // Positive PMN generates loss (negative RECPAM)
    // Negative PMN generates gain (positive RECPAM)
    return pmn * (coef - 1) * -1;
}

// ============================================
// Totals Calculations
// ============================================

export interface RT6Totals {
    totalBase: number;
    totalHomog: number;
    totalRecpam: number;
}

export interface RT17Totals {
    totalCorriente: number;
    totalResTenencia: number;
}

/**
 * Calculate RT6 totals
 */
export function calculateRT6Totals(partidas: ComputedPartidaRT6[]): RT6Totals {
    return {
        totalBase: partidas.reduce((s, p) => s + p.totalBase, 0),
        totalHomog: partidas.reduce((s, p) => s + p.totalHomog, 0),
        totalRecpam: partidas.reduce((s, p) => s + p.totalRecpam, 0),
    };
}

/**
 * Calculate RT17 totals
 */
export function calculateRT17Totals(partidas: ComputedPartidaRT17[]): RT17Totals {
    return {
        totalCorriente: partidas.reduce((s, p) => s + p.valCorriente, 0),
        totalResTenencia: partidas.reduce((s, p) => s + p.resTenencia, 0),
    };
}

// ============================================
// Valuation Progress Tracking (Step 3 Bridge)
// ============================================

export interface ValuationProgress {
    total: number;
    done: number;
    pending: number;
    na: number;
    percentage: number;
}

/**
 * Calculate valuation completion progress for Step 3
 * Excludes 'na' (PN) items from the actionable count
 */
export function getValuationProgress(partidas: ComputedPartidaRT17[]): ValuationProgress {
    let na = 0;
    let done = 0;
    let pending = 0;

    for (const p of partidas) {
        const status = p.valuationStatus || 'pending';
        if (status === 'na' || p.grupo === 'PN') {
            na++;
        } else if (status === 'done') {
            done++;
        } else {
            pending++;
        }
    }

    const actionable = done + pending;
    const percentage = actionable > 0 ? Math.round((done / actionable) * 100) : 100;

    return {
        total: partidas.length,
        done,
        pending,
        na,
        percentage,
    };
}

/**
 * Check if all applicable valuations are complete (gating for "Generar Asientos")
 * Returns true if all non-PN partidas have status 'done'
 */
export function canGenerateAsientos(partidas: ComputedPartidaRT17[]): boolean {
    const progress = getValuationProgress(partidas);
    return progress.pending === 0 && progress.done > 0;
}

// ============================================
// Asientos Generation
// ============================================

/**
 * Generate RT6 adjustment journal entry
 */
export function generateAsientoRT6(partidas: ComputedPartidaRT6[]): AsientoBorrador {
    const lineas: AsientoLine[] = [];
    let totalRecpam = 0;

    // Add debit lines for each partida
    partidas.forEach((p) => {
        if (p.totalRecpam !== 0) {
            lineas.push({
                cuentaCodigo: p.cuentaCodigo,
                cuentaNombre: `Ajuste por Inf. — ${p.cuentaNombre}`,
                debe: p.totalRecpam > 0 ? p.totalRecpam : 0,
                haber: p.totalRecpam < 0 ? Math.abs(p.totalRecpam) : 0,
            });
            totalRecpam += p.totalRecpam;
        }
    });

    // Add RECPAM counterpart
    if (totalRecpam !== 0) {
        lineas.push({
            cuentaCodigo: '5.4.01.01',
            cuentaNombre: 'RECPAM',
            debe: totalRecpam < 0 ? Math.abs(totalRecpam) : 0,
            haber: totalRecpam > 0 ? totalRecpam : 0,
        });
    }

    return {
        numero: 1,
        descripcion: 'Ajuste por Inflación (RT6)',
        lineas,
        tipo: 'RT6',
    };
}

/**
 * Generate RT17 valuation journal entry
 */
export function generateAsientoRT17(partidas: ComputedPartidaRT17[]): AsientoBorrador {
    const lineas: AsientoLine[] = [];
    let totalResTenencia = 0;

    // Add lines for each partida
    partidas.forEach((p) => {
        if (p.resTenencia !== 0) {
            lineas.push({
                cuentaCodigo: p.cuentaCodigo,
                cuentaNombre: p.cuentaNombre,
                debe: p.resTenencia > 0 ? p.resTenencia : 0,
                haber: p.resTenencia < 0 ? Math.abs(p.resTenencia) : 0,
            });
            totalResTenencia += p.resTenencia;
        }
    });

    // Add RxT counterpart
    if (totalResTenencia !== 0) {
        lineas.push({
            cuentaCodigo: '4.2.01.01',
            cuentaNombre: 'Resultado por Tenencia',
            debe: totalResTenencia < 0 ? Math.abs(totalResTenencia) : 0,
            haber: totalResTenencia > 0 ? totalResTenencia : 0,
        });
    }

    return {
        numero: 2,
        descripcion: 'Valuación a Valores Corrientes (RT17)',
        lineas,
        tipo: 'RT17',
    };
}

// ============================================
// Formatting
// ============================================

/**
 * Format number as ARS currency
 */
export function formatCurrencyARS(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(value);
}

/**
 * Format number with specified decimals
 */
export function formatNumber(value: number, decimals = 2): string {
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

/**
 * Format coefficient (4 decimals)
 */
export function formatCoef(value: number): string {
    return formatNumber(value, 4);
}

// ============================================
// CSV Import
// ============================================

/**
 * Parse CSV text into IndexRow array
 * Expected format: period,index (header optional)
 */
export function parseCSVIndices(csvText: string): IndexRow[] {
    const lines = csvText.trim().split('\n');
    const result: IndexRow[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Skip header line
        if (trimmed.toLowerCase().includes('period') || trimmed.toLowerCase().includes('indice')) {
            continue;
        }

        const parts = trimmed.split(/[,;\t]/);
        if (parts.length >= 2) {
            const period = normalizePeriod(parts[0].trim());
            const value = parseFloat(parts[1].trim().replace(',', '.'));

            if (period && !isNaN(value)) {
                result.push({ period, value });
            }
        }
    }

    return result;
}

/**
 * Normalize period to YYYY-MM format
 */
function normalizePeriod(input: string): string {
    // Already in YYYY-MM format
    if (/^\d{4}-\d{2}$/.test(input)) {
        return input;
    }

    // MM/YYYY or MM-YYYY format
    const match1 = input.match(/^(\d{1,2})[/-](\d{4})$/);
    if (match1) {
        const month = match1[1].padStart(2, '0');
        return `${match1[2]}-${month}`;
    }

    // YYYY/MM format
    const match2 = input.match(/^(\d{4})[/-](\d{1,2})$/);
    if (match2) {
        const month = match2[2].padStart(2, '0');
        return `${match2[1]}-${month}`;
    }

    return input;
}

/**
 * Export indices to CSV
 */
export function exportIndicesToCSV(indices: IndexRow[]): string {
    const header = 'period,index';
    const rows = indices.map((i) => `${i.period},${i.value}`);
    return [header, ...rows].join('\n');
}
