/**
 * Cierre: AxI + Valuación - Core Module Exports
 */

// Types
export type {
    RubroType,
    RT17Type,
    TabId,
    PartidaStatus,
    IndexRow,
    LotRT6,
    PartidaRT6,
    ComputedLotRT6,
    ComputedPartidaRT6,
    LotUSD,
    PartidaRT17,
    ComputedPartidaRT17,
    AsientoLine,
    AsientoBorrador,
    RecpamInputs,
    CierreValuacionState,
} from './types';

// Factory functions
export {
    INITIAL_INDICES,
    MOCK_PARTIDAS_RT6,
    MOCK_PARTIDAS_RT17,
    createInitialState,
    generateId,
    createDefaultPartidaRT6,
    createDefaultLotRT6,
    createDefaultPartidaRT17,
    createDefaultLotUSD,
} from './types';

// Calculations
export {
    getPeriodFromDate,
    formatDateDisplay,
    getIndexForPeriod,
    calculateCoef,
    calculateCoefFromDate,
    computeRT6Partida,
    computeAllRT6Partidas,
    computeRT17Partida,
    computeAllRT17Partidas,
    calculateRecpamEstimado,
    calculateRT6Totals,
    calculateRT17Totals,
    generateAsientoRT6,
    generateAsientoRT17,
    formatCurrencyARS,
    formatNumber,
    formatCoef,
    parseCSVIndices,
    exportIndicesToCSV,
} from './calc';

export type { RT6Totals, RT17Totals } from './calc';

// Importers
export {
    normalizePeriod,
    normalizeIndex,
    parseCsvToTable,
    parseXlsxFile,
    getSheetData,
    buildIndexRowsFromMapping,
    toIndexRows,
    filterAccountsByRubro,
    detectHeader,
    autoDetectMapping,
} from './importers';

export type {
    SheetInfo,
    XlsxParseResult,
    MappingConfig,
    ParsedIndexRow,
} from './importers';
