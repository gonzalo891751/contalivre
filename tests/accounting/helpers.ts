/**
 * Helpers comunes para los tests del núcleo contable (Fase 2A).
 * Cada test usa una base aislada: resetDb() borra y reabre la base
 * (fake-indexeddb) para que los tests no compartan estado.
 */

import { db } from '../../src/storage/db'
import type { Account } from '../../src/core/models'

/** Borra y reabre la base para aislar cada test */
export async function resetDb(): Promise<void> {
    await db.delete()
    await db.open()
}

export function makeAccount(partial: Partial<Account> & Pick<Account, 'id' | 'code' | 'name' | 'kind'>): Account {
    return {
        section: 'CURRENT',
        group: partial.group ?? 'Test',
        statementGroup: null,
        parentId: null,
        level: partial.code.split('.').length - 1,
        normalSide: ['ASSET', 'EXPENSE'].includes(partial.kind) ? 'DEBIT' : 'CREDIT',
        isContra: false,
        isHeader: false,
        active: true,
        isPostable: partial.isHeader ? false : true,
        ...partial,
    }
}

/** Plan de cuentas mínimo para los tests */
export const TEST_ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', group: 'Caja y Bancos' }),
    makeAccount({ id: 'banco', code: '1.1.01.02', name: 'Banco c/c', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS', group: 'Caja y Bancos' }),
    makeAccount({ id: 'deudores', code: '1.1.02.01', name: 'Deudores por ventas', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES', group: 'Créditos por ventas' }),
    makeAccount({ id: 'mercaderias', code: '1.1.04.01', name: 'Mercaderías', kind: 'ASSET', statementGroup: 'INVENTORIES', group: 'Bienes de cambio' }),
    makeAccount({ id: 'bienes-uso', code: '1.2.01.01', name: 'Rodados', kind: 'ASSET', statementGroup: 'PPE', group: 'Bienes de uso', section: 'NON_CURRENT' }),
    makeAccount({ id: 'amort-acum', code: '1.2.01.90', name: 'Amortización acumulada rodados', kind: 'ASSET', statementGroup: 'PPE', group: 'Bienes de uso', section: 'NON_CURRENT', isContra: true, normalSide: 'CREDIT' }),
    makeAccount({ id: 'intangibles', code: '1.2.02.01', name: 'Marcas y patentes', kind: 'ASSET', statementGroup: 'INTANGIBLES', group: 'Intangibles', section: 'NON_CURRENT' }),
    makeAccount({ id: 'proveedores', code: '2.1.01.01', name: 'Proveedores', kind: 'LIABILITY', statementGroup: 'TRADE_PAYABLES', group: 'Deudas comerciales' }),
    makeAccount({ id: 'gastos-a-pagar', code: '2.1.06.03', name: 'Gastos a pagar', kind: 'LIABILITY', statementGroup: 'OTHER_PAYABLES', group: 'Otras deudas' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', group: 'Capital' }),
    makeAccount({ id: 'resultado-ejercicio', code: '3.2.01', name: 'Resultado del ejercicio', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS', group: 'Resultados acumulados' }),
    makeAccount({ id: 'resultados-no-asignados', code: '3.2.02', name: 'Resultados no asignados', kind: 'EQUITY', statementGroup: 'RETAINED_EARNINGS', group: 'Resultados acumulados' }),
    makeAccount({ id: 'ventas', code: '4.1.01', name: 'Ventas', kind: 'INCOME', statementGroup: 'SALES', group: 'Ventas', section: 'OPERATING' }),
    makeAccount({ id: 'cmv', code: '4.2.01', name: 'Costo de mercaderías vendidas', kind: 'EXPENSE', statementGroup: 'COGS', group: 'Costo de ventas', section: 'COST' }),
    makeAccount({ id: 'gastos', code: '4.3.01', name: 'Gastos de administración', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', group: 'Gastos', section: 'ADMIN' }),
    makeAccount({ id: 'deprec', code: '4.3.02', name: 'Depreciación de bienes de uso', kind: 'EXPENSE', statementGroup: 'ADMIN_EXPENSES', group: 'Gastos', section: 'ADMIN' }),
    makeAccount({ id: 'prestamos', code: '2.1.05.02', name: 'Préstamos bancarios', kind: 'LIABILITY', statementGroup: 'LOANS', group: 'Préstamos' }),
    // Cuenta agrupadora (no imputable)
    makeAccount({ id: 'header-activo', code: '1.1', name: 'Activo Corriente', kind: 'ASSET', isHeader: true, isPostable: false }),
    // Cuenta inactiva
    makeAccount({ id: 'cuenta-inactiva', code: '1.1.09.99', name: 'Cuenta discontinuada', kind: 'ASSET', active: false }),
]

export async function seedTestAccounts(): Promise<void> {
    await db.accounts.bulkAdd(TEST_ACCOUNTS)
}

/** Línea simple Debe/Haber */
export function line(accountId: string, debit: number, credit: number) {
    return { accountId, debit, credit }
}

/** Asiento balanceado simple entre dos cuentas */
export function simpleLines(debitAccount: string, creditAccount: string, amount: number) {
    return [line(debitAccount, amount, 0), line(creditAccount, 0, amount)]
}
