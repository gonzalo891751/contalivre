
import { Account } from './models'

export type RubroType =
    | 'activo'
    | 'pasivo'
    | 'pn'
    | 'ingresos'
    | 'egresos'
    | 'resultados' // [NEW] Neutral
    | 'regularizadora'
    | 'movimiento'
    | 'unknown'

export interface RubroConfig {
    label: string
    shortLabel: string // For mobile/compact
    color: string      // Text color (strong)
    bgTint: string     // RGB values for tint (e.g. "37, 99, 235") to use with rgba()
    icon?: string      // Optional generic icon char
}

export const RUBRO_CONFIG: Record<RubroType, RubroConfig> = {
    'activo': {
        label: 'ACTIVO',
        shortLabel: 'ACT',
        color: '#2563EB', // Blue
        bgTint: '37, 99, 235',
        icon: '🔹'
    },
    'pasivo': {
        label: 'PASIVO',
        shortLabel: 'PAS',
        color: '#7F1D1D', // Dark Red / Bordó
        bgTint: '127, 29, 29',
        icon: '🔻'
    },
    'pn': {
        label: 'PATRIMONIO NETO',
        shortLabel: 'PN',
        color: '#7C3AED', // Purple/Violet (User request)
        bgTint: '124, 58, 237',
        icon: '🏛️'
    },
    'ingresos': {
        label: 'INGRESOS',
        shortLabel: 'ING',
        color: '#16A34A', // Green
        bgTint: '22, 163, 74',
        icon: '💰'
    },
    'egresos': {
        label: 'EGRESOS',
        shortLabel: 'EGR',
        color: '#DC2626', // Red
        bgTint: '220, 38, 38',
        icon: '📉'
    },
    'regularizadora': {
        label: 'REGULARIZADORA',
        shortLabel: 'REG',
        color: '#0EA5E9', // Sky/Celeste (#38BDF8 requested, adjusted slightly for text contrast, or keeping similar)
        bgTint: '56, 189, 248',
        icon: '⚖️'
    },
    'movimiento': {
        label: 'MOVIMIENTO',
        shortLabel: 'MOV',
        color: '#EA580C', // Orange
        bgTint: '249, 115, 22',
        icon: '🔄'
    },
    'resultados': {
        label: 'RESULTADOS',
        shortLabel: 'RES',
        color: '#6B7280', // Gray (Neutral)
        bgTint: '107, 114, 128',
        icon: '⚪'
    },
    'unknown': {
        label: 'OTRO',
        shortLabel: 'OTRO',
        color: '#6B7280', // Gray
        bgTint: '107, 114, 128',
    }
}

// 1. Overrides explicitly by CODE
const RESULT_OVERRIDES: Record<string, RubroType> = {
    // Caja discrepancies
    // '4.7.01': 'egresos', // REMOVED: Managed dynamically by balance now
    // '4.7.02': 'ingresos', // REMOVED: Managed dynamically by balance now

    // Interest examples - We leave these as hints, but dynamic balance will override if provided
    '4.6.01': 'ingresos', // Intereses ganados (Default)
    '4.6.02': 'egresos', // Intereses perdidos (Default)
}

// 4. Regularizadora Keywords (Priority)
const REGULARIZADORA_KEYWORDS = [
    'amortizacion acumulada', 'amortización acumulada',
    'depreciacion acumulada', 'depreciación acumulada',
    'prevision', 'previsión',
    'provision', 'provisión',
    'desvalorizacion', 'desvalorización',
    'ajuste', // Careful with "Ajuste de Capital" (PN) but usually regularizadora in assets
    'correccion de valor', 'corrección de valor',
    'incobrables', // often "Previsión para incobrables"
    'castigo',
    'acumulada'
]

// 5. Movimiento Keywords
const MOVIMIENTO_KEYWORDS = [
    'compras',
    'gastos sobre compras',
    'fletes',
    'acarreos',
    'seguros sobre compras',
    'devoluciones sobre compras',
    'bonificaciones sobre compras',
    'descuentos sobre compras',
    'notas de credito', 'notas de crédito',
    'movimiento',
]

function clean(str: string) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export function getAccountClass(account: Account, balance?: { debit: number, credit: number }): RubroType {
    const code = account.code || ''
    const nameLower = clean(account.name)

    // Base Static Classification First
    let rubro: RubroType = 'unknown'

    // 1. Explicit Overrides
    if (code && RESULT_OVERRIDES[code]) {
        rubro = RESULT_OVERRIDES[code]
    }
    // 2. Regularizadora (Priority)
    else if (!code.startsWith('3') && (account.isContra || REGULARIZADORA_KEYWORDS.some(kw => nameLower.includes(clean(kw))))) {
        rubro = 'regularizadora'
    }
    // 3. Movimiento (4.8 or keywords)
    else if (code.startsWith('4.8') || (MOVIMIENTO_KEYWORDS.some(kw => nameLower.includes(clean(kw))) && !nameLower.includes('ventas'))) {
        rubro = 'movimiento'
    }
    // 4. Heuristics by Code
    else if (code) {
        if (code.startsWith('1')) rubro = 'activo'
        else if (code.startsWith('2')) rubro = 'pasivo'
        else if (code.startsWith('3')) rubro = 'pn'
        else if (code.startsWith('4')) {
            // Static Default Guess for Results
            if (code.startsWith('4.1')) rubro = 'ingresos'
            else if (code.startsWith('4.2')) rubro = 'egresos'
            else if (code.startsWith('4.3')) rubro = 'egresos'
            else if (code.startsWith('4.4')) rubro = 'egresos'
            else if (code.startsWith('4.5')) rubro = 'egresos'
            else if (code.startsWith('4.6')) {
                if (nameLower.includes('ganad')) rubro = 'ingresos'
                else if (nameLower.includes('perdid') || nameLower.includes('gasto')) rubro = 'egresos'
                else rubro = 'egresos' // Default
            }
            else if (code.startsWith('4.7')) {
                if (nameLower.includes('sobrante') || nameLower.includes('recupero')) rubro = 'ingresos'
                else rubro = 'egresos'
            }
            else {
                if (account.kind === 'INCOME') rubro = 'ingresos'
                else if (account.kind === 'EXPENSE') rubro = 'egresos'
                else rubro = 'egresos'
            }
        }
        else if (code.startsWith('5') || code.startsWith('6')) rubro = 'egresos'
    }
    // 5. Fallback by Kind
    else {
        switch (account.kind) {
            case 'ASSET': rubro = 'activo'; break;
            case 'LIABILITY': rubro = 'pasivo'; break;
            case 'EQUITY': rubro = 'pn'; break;
            case 'INCOME': rubro = 'ingresos'; break;
            case 'EXPENSE': rubro = 'egresos'; break;
        }
    }

    // DYNAMIC OVERRIDE FOR RESULTS (Code 4.*)
    // Rule: If it's a "Result" account (Ingresos/Egresos static, or generic 4.*),
    // AND it is NOT Movimiento/Regularizadora/PN/Activo/Pasivo...
    // AND balance is provided:
    // Check strict balance sign.

    // Conditions:
    // 1. Code starts with 4 (Results chapter)
    // 2. Current rubro is 'ingresos' or 'egresos' (to allow override, preserving movimiento/regularizadora if they matched)
    // 3. Balance provided

    if (balance && code.startsWith('4') && (rubro === 'ingresos' || rubro === 'egresos')) {
        const net = balance.debit - balance.credit
        // diff > 0 => Deudor => EGRESO (Pérdida)
        // diff < 0 => Acreedor => INGRESO (Ganancia)
        // diff == 0 => RESULTADOS (Neutro)

        if (net > 0.005) {
            return 'egresos'
        } else if (net < -0.005) {
            return 'ingresos'
        } else {
            return 'resultados' // Neutral grey for zero balance
        }
    }

    return rubro
}

// Alias for compatibility if needed, but we try to replace usages
export const getAccountRubro = getAccountClass
