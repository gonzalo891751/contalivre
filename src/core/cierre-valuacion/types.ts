/**
 * Cierre: AxI + Valuación - Types
 *
 * TypeScript types for the RT6 (Ajuste por Inflación) and RT17 (Valuación) module.
 */

// ============================================
// Enums & Basic Types
// ============================================

/** Rubro types for RT6 */
export type RubroType = 'Mercaderias' | 'BienesUso' | 'Capital' | 'Otros';

/** RT17 valuation types */
export type RT17Type = 'USD' | 'Otros';

/** Tab identifiers */
export type TabId = 'indices' | 'reexpresion' | 'valuacion' | 'asientos';

/** Status for partidas */
export type PartidaStatus = 'ok' | 'warning' | 'error';

// ============================================
// Index Types (FACPCE)
// ============================================

/** Single index row (FACPCE monthly index) */
export interface IndexRow {
    /** Period in YYYY-MM format */
    period: string;
    /** Index value */
    value: number;
}

// ============================================
// RT6 (Reexpresión) Types
// ============================================

/** Individual lot for RT6 reexpression */
export interface LotRT6 {
    id: string;
    /** Origin date in YYYY-MM-DD format */
    fechaOrigen: string;
    /** Base amount in ARS */
    importeBase: number;
    /** Optional notes */
    notas?: string;
}

/** RT6 partida (non-monetary item) */
export interface PartidaRT6 {
    id: string;
    /** Rubro type */
    rubro: RubroType;
    /** Account code */
    cuentaCodigo: string;
    /** Account name */
    cuentaNombre: string;
    /**
     * Lots (multiple for Mercaderías, single for others)
     * Using array for unified handling
     */
    items: LotRT6[];
}

/** Computed lot with calculated values */
export interface ComputedLotRT6 extends LotRT6 {
    /** Coefficient applied */
    coef: number;
    /** Homogeneous value (importeBase * coef) */
    homog: number;
}

/** Fully computed RT6 partida */
export interface ComputedPartidaRT6 extends PartidaRT6 {
    /** Computed lots */
    itemsComputed: ComputedLotRT6[];
    /** Total base amount */
    totalBase: number;
    /** Total homogeneous amount */
    totalHomog: number;
    /** Total RECPAM (totalHomog - totalBase) */
    totalRecpam: number;
    /** Status */
    status: PartidaStatus;
}

// ============================================
// RT17 (Valuación) Types
// ============================================

/** USD lot for RT17 valuation */
export interface LotUSD {
    id: string;
    /** Entry date in YYYY-MM-DD format */
    fechaIngreso: string;
    /** USD amount */
    usd: number;
    /** Exchange rate at origin (optional) */
    tcOrigen?: number;
    /** Base ARS value (historical) */
    baseArs: number;
    /** Exchange rate at closing */
    tcCierre: number;
}

/** RT17 partida (valuation item) */
export interface PartidaRT17 {
    id: string;
    /** Valuation type */
    type: RT17Type;
    /** Account code */
    cuentaCodigo: string;
    /** Account name */
    cuentaNombre: string;
    /** USD lots (for type 'USD') */
    usdItems?: LotUSD[];
    /** Manual current value (for type 'Otros') */
    manualCurrentValue?: number;
    /** Reference for manual value */
    manualReference?: string;
    /** Link to RT6 item for homogeneous base comparison */
    linkedRT6Id?: string;
}

/** Fully computed RT17 partida */
export interface ComputedPartidaRT17 extends PartidaRT17 {
    /** Current value (valor corriente) */
    valCorriente: number;
    /** Holding result (resultado por tenencia) */
    resTenencia: number;
    /** Base reference value (historical or homogeneous) */
    baseReference: number;
    /** Warning if using fallback base */
    useFallbackBase?: boolean;
}

// ============================================
// Asientos (Journal Entries) Types
// ============================================

/** Single line in a journal entry */
export interface AsientoLine {
    /** Account code */
    cuentaCodigo: string;
    /** Account name */
    cuentaNombre: string;
    /** Debit amount */
    debe: number;
    /** Credit amount */
    haber: number;
}

/** Draft journal entry */
export interface AsientoBorrador {
    /** Entry number (display) */
    numero: number;
    /** Entry description */
    descripcion: string;
    /** Entry lines */
    lineas: AsientoLine[];
    /** Entry type */
    tipo: 'RT6' | 'RT17' | 'Mixto';
}

// ============================================
// Page State
// ============================================

/** RECPAM estimator inputs */
export interface RecpamInputs {
    /** Monetary assets */
    activeMon: number;
    /** Monetary liabilities */
    passiveMon: number;
}

/** Full page state */
export interface CierreValuacionState {
    /** Unique state ID for storage */
    id?: string;
    /** Last updated timestamp */
    lastUpdated?: string;
    /** Closing date (YYYY-MM-DD) */
    closingDate: string;
    /** FACPCE indices */
    indices: IndexRow[];
    /** RT6 partidas */
    partidasRT6: PartidaRT6[];
    /** RT17 partidas */
    partidasRT17: PartidaRT17[];
    /** RECPAM calculator inputs */
    recpamInputs: RecpamInputs;
}

// ============================================
// Factory Functions
// ============================================

/** Default indices with sample data */
export const INITIAL_INDICES: IndexRow[] = [
    { period: '2024-12', value: 1250.5 },
    { period: '2025-01', value: 1400.2 },
    { period: '2025-02', value: 1580.9 },
    { period: '2025-03', value: 1720.0 },
    { period: '2025-04', value: 1890.5 },
    { period: '2025-05', value: 2050.8 },
    { period: '2025-06', value: 2210.3 },
    { period: '2025-07', value: 2380.6 },
    { period: '2025-08', value: 2560.2 },
    { period: '2025-09', value: 2750.9 },
    { period: '2025-10', value: 2950.4 },
    { period: '2025-11', value: 3160.8 },
    { period: '2025-12', value: 3380.5 },
];

/** Sample RT6 partidas for demo */
export const MOCK_PARTIDAS_RT6: PartidaRT6[] = [
    {
        id: 'p1',
        rubro: 'Mercaderias',
        cuentaCodigo: '1.2.05.01',
        cuentaNombre: 'Mercaderías (Stock)',
        items: [
            { id: 'l1', fechaOrigen: '2025-01-15', importeBase: 800000, notas: 'Compra Lote A' },
            { id: 'l2', fechaOrigen: '2025-02-10', importeBase: 700000, notas: 'Compra Lote B' },
        ],
    },
    {
        id: 'p2',
        rubro: 'Capital',
        cuentaCodigo: '3.1.01.01',
        cuentaNombre: 'Capital Social',
        items: [{ id: 'l3', fechaOrigen: '2024-12-01', importeBase: 100000 }],
    },
];

/** Sample RT17 partidas for demo */
export const MOCK_PARTIDAS_RT17: PartidaRT17[] = [
    {
        id: 'v1',
        type: 'USD',
        cuentaCodigo: '1.1.02.01',
        cuentaNombre: 'Caja Moneda Extranjera',
        usdItems: [
            {
                id: 'u1',
                fechaIngreso: '2025-01-20',
                usd: 1000,
                tcOrigen: 980,
                baseArs: 980000,
                tcCierre: 1100,
            },
        ],
    },
];

/** Create initial state */
export function createInitialState(): CierreValuacionState {
    return {
        closingDate: '2025-12-31',
        indices: INITIAL_INDICES,
        partidasRT6: MOCK_PARTIDAS_RT6,
        partidasRT17: MOCK_PARTIDAS_RT17,
        recpamInputs: { activeMon: 0, passiveMon: 0 },
    };
}

/** Generate unique ID */
export function generateId(): string {
    return crypto.randomUUID();
}

/** Create default RT6 partida */
export function createDefaultPartidaRT6(): PartidaRT6 {
    return {
        id: generateId(),
        rubro: 'Mercaderias',
        cuentaCodigo: '',
        cuentaNombre: '',
        items: [],
    };
}

/** Create default RT6 lot */
export function createDefaultLotRT6(): LotRT6 {
    return {
        id: generateId(),
        fechaOrigen: '',
        importeBase: 0,
    };
}

/** Create default RT17 partida */
export function createDefaultPartidaRT17(): PartidaRT17 {
    return {
        id: generateId(),
        type: 'USD',
        cuentaCodigo: '',
        cuentaNombre: '',
        usdItems: [],
    };
}

/** Create default USD lot */
export function createDefaultLotUSD(): LotUSD {
    return {
        id: generateId(),
        fechaIngreso: '',
        usd: 0,
        baseArs: 0,
        tcCierre: 0,
    };
}
