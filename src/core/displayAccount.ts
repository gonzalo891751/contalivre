/**
 * Display mapping for Libro Diario: resolve subcuenta → cuenta control + tercero detail.
 *
 * When a journal line references a per-tercero subcuenta (e.g. "Carlos Gomez" under
 * "Deudores por Ventas"), this helper returns the control account name as the display
 * name and the tercero name as the detail. The actual accountId is NOT changed.
 */
import type { Account } from './models'

/** Control codes whose children represent per-tercero subcuentas */
const CONTROL_CODES_WITH_TERCEROS = new Set([
    '1.1.02.01', // Deudores por Ventas
    '1.1.02.02', // Documentos a cobrar
    '1.1.02.03', // Deudores con tarjeta de credito
    '1.1.01.04', // Valores a depositar
    '1.1.01.05', // Valores a depositar diferidos
    '2.1.01.01', // Proveedores
    '2.1.01.02', // Documentos a pagar
    '2.1.01.04', // Valores a pagar
    '2.1.01.05', // Valores a pagar diferidos
    '2.1.06.01', // Acreedores varios
])

export interface AccountDisplay {
    /** Account name to show as primary (control account or original) */
    name: string
    /** Account code to show */
    code: string
    /** Tercero name if this is a per-tercero subcuenta, null otherwise */
    terceroDetail: string | null
}

/**
 * Resolve the display representation of an account for Libro Diario rendering.
 * If the account is a child of a known control account, returns the parent's
 * name/code as primary and the child's name as tercero detail.
 */
export function resolveAccountDisplay(accountId: string, accounts: Account[]): AccountDisplay {
    const acc = accounts.find(a => a.id === accountId)
    if (!acc) return { name: 'Cuenta desconocida', code: '?', terceroDetail: null }

    if (acc.parentId) {
        const parent = accounts.find(a => a.id === acc.parentId)
        if (parent && CONTROL_CODES_WITH_TERCEROS.has(parent.code)) {
            return {
                name: parent.name,
                code: parent.code,
                terceroDetail: acc.name,
            }
        }
    }

    return { name: acc.name, code: acc.code, terceroDetail: null }
}
