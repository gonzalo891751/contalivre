/**
 * EEPN Column Definitions
 *
 * Defines the columns of the EEPN matrix by account code prefixes.
 * This approach maps accounts by code rather than statementGroup for flexibility.
 */

import type { EEPNColumnDef } from './types'

/**
 * Standard EEPN columns following Argentine NCP structure
 *
 * Columns:
 * 1. Capital Suscripto: 3.1.01 + contra: 3.1.05, 3.1.06
 * 2. Ajuste de Capital: 3.1.02
 * 3. Aportes no Capitalizados: 3.1.03 + 3.1.04
 * 4. Reservas: 3.2.*
 * 5. Resultados No Asignados: 3.3.01
 * 6. Resultado del Ejercicio: 3.3.02
 * 7. AREA: 3.3.03.*
 * 8. Distribuciones: 3.3.04.*
 */
export const EEPN_COLUMNS: EEPNColumnDef[] = [
    {
        id: 'capital_suscripto',
        label: 'Capital Suscripto',
        shortLabel: 'Capital',
        accountCodes: ['3.1.01', '3.1.05', '3.1.06'],
        group: 'APORTES',
    },
    {
        id: 'ajuste_capital',
        label: 'Ajuste de Capital',
        shortLabel: 'Aj. Capital',
        accountCodes: ['3.1.02'],
        group: 'APORTES',
    },
    {
        id: 'aportes_no_cap',
        label: 'Aportes No Capitalizados',
        shortLabel: 'Ap. Irrev.',
        accountCodes: ['3.1.03', '3.1.04'],
        group: 'APORTES',
    },
    {
        id: 'reservas',
        label: 'Ganancias Reservadas',
        shortLabel: 'Reservas',
        accountCodes: ['3.2'],
        group: 'RESERVAS',
    },
    {
        id: 'rna',
        label: 'Resultados No Asignados',
        shortLabel: 'RNA',
        accountCodes: ['3.3.01'],
        group: 'RESULTADOS',
    },
    {
        id: 'resultado_ejercicio',
        label: 'Resultado del Ejercicio',
        shortLabel: 'Resultado',
        accountCodes: ['3.3.02'],
        group: 'RESULTADOS',
    },
    {
        id: 'area',
        label: 'AREA',
        shortLabel: 'AREA',
        accountCodes: ['3.3.03'],
        group: 'RESULTADOS',
    },
    {
        id: 'distribuciones',
        label: 'Distribuciones',
        shortLabel: 'Distrib.',
        accountCodes: ['3.3.04'],
        group: 'RESULTADOS',
    },
]

/**
 * Get column for an account code
 */
export function getColumnForAccount(code: string): EEPNColumnDef | undefined {
    return EEPN_COLUMNS.find(col =>
        col.accountCodes.some(prefix => code.startsWith(prefix))
    )
}

/**
 * Get all account code prefixes for PN (3.*)
 */
export function getPNAccountPrefixes(): string[] {
    return EEPN_COLUMNS.flatMap(col => col.accountCodes)
}

/**
 * Check if an account is a PN account (3.*)
 */
export function isPNAccount(code: string): boolean {
    return code.startsWith('3.')
}

/**
 * Column groups for display headers
 */
export const COLUMN_GROUPS = [
    { id: 'APORTES', label: 'Aportes de Propietarios' },
    { id: 'RESERVAS', label: 'Ganancias Reservadas' },
    { id: 'RESULTADOS', label: 'Resultados Acumulados' },
] as const
