/**
 * Cierre: AxI + Valuación - Import Utilities
 *
 * Parsing and normalization functions for indices import.
 */

import * as XLSX from 'xlsx';
import type { IndexRow } from './types';
import type { Account } from '../models';
import type { RubroType } from './types';

// ============================================
// Spanish Month Mapping
// ============================================

const SPANISH_MONTHS: Record<string, string> = {
    'ene': '01', 'enero': '01',
    'feb': '02', 'febrero': '02',
    'mar': '03', 'marzo': '03',
    'abr': '04', 'abril': '04',
    'may': '05', 'mayo': '05',
    'jun': '06', 'junio': '06',
    'jul': '07', 'julio': '07',
    'ago': '08', 'agosto': '08',
    'sep': '09', 'sept': '09', 'septiembre': '09',
    'oct': '10', 'octubre': '10',
    'nov': '11', 'noviembre': '11',
    'dic': '12', 'diciembre': '12',
};

// ============================================
// Period Normalization
// ============================================

/**
 * Normalize any period format to YYYY-MM
 * Accepts: "2025-12", "12/2025", "2025/12", "dic-24", "Dic 2024", "Diciembre 2024", Excel serial
 */
export function normalizePeriod(input: string | number | null | undefined): string | null {
    if (input === null || input === undefined) return null;

    // Handle Excel date serial numbers
    if (typeof input === 'number') {
        try {
            const date = XLSX.SSF.parse_date_code(input);
            if (date) {
                const year = date.y;
                const month = String(date.m).padStart(2, '0');
                return `${year}-${month}`;
            }
        } catch {
            return null;
        }
        return null;
    }

    const str = String(input).trim().toLowerCase();
    if (!str) return null;

    // Already YYYY-MM format
    if (/^\d{4}-\d{2}$/.test(str)) {
        return str;
    }

    // YYYY-M or YYYY-MM (flexible)
    const matchYYYYM = str.match(/^(\d{4})-(\d{1,2})$/);
    if (matchYYYYM) {
        return `${matchYYYYM[1]}-${matchYYYYM[2].padStart(2, '0')}`;
    }

    // MM/YYYY or M/YYYY
    const matchMMYYYY = str.match(/^(\d{1,2})[/\-.](\d{4})$/);
    if (matchMMYYYY) {
        return `${matchMMYYYY[2]}-${matchMMYYYY[1].padStart(2, '0')}`;
    }

    // YYYY/MM
    const matchYYYYMM = str.match(/^(\d{4})[/.](\d{1,2})$/);
    if (matchYYYYMM) {
        return `${matchYYYYMM[1]}-${matchYYYYMM[2].padStart(2, '0')}`;
    }

    // Spanish month formats: "dic-24", "Dic 2024", "Diciembre 2024", "dic24"
    for (const [monthName, monthNum] of Object.entries(SPANISH_MONTHS)) {
        // "dic-24", "dic 24", "dic24"
        const shortYearPattern = new RegExp(`^${monthName}[\\s\\-]?(\\d{2})$`, 'i');
        const shortMatch = str.match(shortYearPattern);
        if (shortMatch) {
            const year = parseInt(shortMatch[1]) < 50 ? `20${shortMatch[1]}` : `19${shortMatch[1]}`;
            return `${year}-${monthNum}`;
        }

        // "Diciembre 2024", "dic 2024"
        const fullYearPattern = new RegExp(`^${monthName}[\\s\\-]?(\\d{4})$`, 'i');
        const fullMatch = str.match(fullYearPattern);
        if (fullMatch) {
            return `${fullMatch[1]}-${monthNum}`;
        }

        // "2024 diciembre", "2024 dic"
        const yearFirstPattern = new RegExp(`^(\\d{4})[\\s\\-]?${monthName}$`, 'i');
        const yearFirstMatch = str.match(yearFirstPattern);
        if (yearFirstMatch) {
            return `${yearFirstMatch[1]}-${monthNum}`;
        }
    }

    return null;
}

/**
 * Normalize index value to number
 */
export function normalizeIndex(input: string | number | null | undefined): number | null {
    if (input === null || input === undefined) return null;

    if (typeof input === 'number') {
        return isNaN(input) ? null : input;
    }

    // Replace comma with dot for decimal
    const cleaned = String(input).trim().replace(',', '.').replace(/\s/g, '');
    if (!cleaned) return null;

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// ============================================
// CSV Parsing
// ============================================

/**
 * Parse CSV text to 2D array
 */
export function parseCsvToTable(csvText: string): string[][] {
    const lines = csvText.trim().split(/\r?\n/);
    return lines.map(line => {
        // Handle quoted values and different delimiters
        const row: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if ((char === ',' || char === ';' || char === '\t') && !inQuotes) {
                row.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        row.push(current.trim());
        return row;
    });
}

// ============================================
// XLSX Parsing
// ============================================

export interface SheetInfo {
    name: string;
    rowCount: number;
}

export interface XlsxParseResult {
    sheets: SheetInfo[];
    data: (string | number | null)[][];
    selectedSheet: string;
}

/**
 * Parse XLSX/XLS file to 2D array
 */
export async function parseXlsxFile(file: File): Promise<XlsxParseResult> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

    const sheets: SheetInfo[] = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        return { name, rowCount: range.e.r - range.s.r + 1 };
    });

    // Default to first non-empty sheet
    const selectedSheet = sheets.find(s => s.rowCount > 0)?.name || sheets[0]?.name || '';

    const data = getSheetData(workbook, selectedSheet);

    return { sheets, data, selectedSheet };
}

/**
 * Get data from a specific sheet
 */
export function getSheetData(workbook: XLSX.WorkBook, sheetName: string): (string | number | null)[][] {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];

    // Use raw values to preserve Excel date serials
    const jsonData = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
    });

    return jsonData as (string | number | null)[][];
}

// ============================================
// Index Row Building
// ============================================

export interface MappingConfig {
    periodColumn: number;
    indexColumn: number;
    hasHeader: boolean;
}

export interface ParsedIndexRow {
    period: string | null;
    periodRaw: string | number | null;
    index: number | null;
    indexRaw: string | number | null;
    isValid: boolean;
    error?: string;
}

/**
 * Build index rows from table data with column mapping
 */
export function buildIndexRowsFromMapping(
    data: (string | number | null)[][],
    config: MappingConfig
): ParsedIndexRow[] {
    const startRow = config.hasHeader ? 1 : 0;
    const results: ParsedIndexRow[] = [];

    for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const periodRaw = row[config.periodColumn];
        const indexRaw = row[config.indexColumn];

        const period = normalizePeriod(periodRaw);
        const index = normalizeIndex(indexRaw);

        let isValid = true;
        let error: string | undefined;

        if (!period) {
            isValid = false;
            error = 'Período inválido';
        } else if (index === null) {
            isValid = false;
            error = 'Índice inválido';
        }

        results.push({
            period,
            periodRaw,
            index,
            indexRaw,
            isValid,
            error,
        });
    }

    return results;
}

/**
 * Convert parsed rows to IndexRow array (valid only)
 */
export function toIndexRows(parsed: ParsedIndexRow[]): IndexRow[] {
    return parsed
        .filter(r => r.isValid && r.period && r.index !== null)
        .map(r => ({
            period: r.period!,
            value: r.index!,
        }));
}

// ============================================
// Account Filtering by Rubro
// ============================================

const RUBRO_KEYWORDS: Record<RubroType, string[]> = {
    Mercaderias: ['mercader', 'bienes de cambio', 'stock', 'inventario', '1.2.05'],
    BienesUso: ['bienes de uso', 'rodados', 'maquinaria', 'muebles', 'inmuebles', '1.2.01', '1.2.02'],
    Capital: ['capital', 'aportes', 'reserva', 'patrimonio', '3.1', '3.2'],
    Otros: [],
};

const RUBRO_USD_KEYWORDS = ['usd', 'dólar', 'dolar', 'moneda extranjera', 'divisa', 'caja usd', 'banco usd'];

/**
 * Filter accounts by rubro type
 * Returns prioritized accounts that match the rubro, plus all others
 */
export function filterAccountsByRubro(
    rubro: RubroType | 'USD',
    accounts: Account[],
    searchQuery?: string
): { prioritized: Account[]; others: Account[] } {
    const keywords = rubro === 'USD' ? RUBRO_USD_KEYWORDS : (RUBRO_KEYWORDS[rubro] || []);

    const matchesKeyword = (account: Account): boolean => {
        const searchStr = `${account.code} ${account.name}`.toLowerCase();
        return keywords.some(kw => searchStr.includes(kw.toLowerCase()));
    };

    const matchesQuery = (account: Account): boolean => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return account.code.toLowerCase().includes(query) ||
            account.name.toLowerCase().includes(query);
    };

    const prioritized: Account[] = [];
    const others: Account[] = [];

    for (const account of accounts) {
        if (!matchesQuery(account)) continue;

        if (matchesKeyword(account)) {
            prioritized.push(account);
        } else {
            others.push(account);
        }
    }

    return { prioritized, others };
}

/**
 * Detect if first row looks like a header (contains text strings)
 */
export function detectHeader(data: (string | number | null)[][]): boolean {
    if (data.length === 0) return false;
    const firstRow = data[0];
    if (!firstRow || firstRow.length === 0) return false;

    // If most cells in first row are strings that don't look like data, it's a header
    let stringCount = 0;
    let numericCount = 0;

    for (const cell of firstRow) {
        if (cell === null || cell === undefined) continue;
        if (typeof cell === 'string') {
            // Check if it's a number-like string
            const normalized = normalizeIndex(cell);
            const normalizedPeriod = normalizePeriod(cell);
            if (normalized === null && normalizedPeriod === null) {
                stringCount++;
            } else {
                numericCount++;
            }
        } else if (typeof cell === 'number') {
            numericCount++;
        }
    }

    return stringCount > numericCount;
}

/**
 * Auto-detect column mapping
 */
export function autoDetectMapping(data: (string | number | null)[][]): MappingConfig {
    const hasHeader = detectHeader(data);
    const checkRow = hasHeader && data.length > 1 ? data[1] : data[0];

    if (!checkRow) {
        return { periodColumn: 0, indexColumn: 1, hasHeader };
    }

    let periodColumn = 0;
    let indexColumn = 1;

    // Try to detect which column is period vs index
    for (let i = 0; i < checkRow.length; i++) {
        const cell = checkRow[i];
        const normalized = normalizePeriod(cell);
        if (normalized) {
            periodColumn = i;
            // Index is likely the next column, or the other one
            indexColumn = i === 0 ? 1 : 0;
            break;
        }
    }

    // Verify index column has numeric data
    for (let i = 0; i < checkRow.length; i++) {
        if (i === periodColumn) continue;
        const normalized = normalizeIndex(checkRow[i]);
        if (normalized !== null) {
            indexColumn = i;
            break;
        }
    }

    return { periodColumn, indexColumn, hasHeader };
}
