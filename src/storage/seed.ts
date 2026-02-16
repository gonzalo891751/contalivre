import { db, generateId, cleanupDuplicateAccounts } from './db'
import type { Account, AccountKind, AccountSection, StatementGroup, NormalSide } from '../core/models'

// Current seed version - increment when seed structure changes
const SEED_VERSION = 11

/**
 * Definición de cuenta para el seed
 */
interface SeedAccount {
    code: string
    name: string
    kind: AccountKind
    section: AccountSection
    group: string
    statementGroup: StatementGroup | null
    parentCode: string | null
    normalSide?: NormalSide
    isContra?: boolean
    isHeader?: boolean
    allowOppositeBalance?: boolean
}

/**
 * Plan de cuentas Argentina típico - estructura jerárquica
 * Solo cuentas base/madre + algunas generales.
 * El usuario crea subcuentas específicas.
 */
const SEED_ACCOUNTS: SeedAccount[] = [
    // ============================================
    // 1 - ACTIVO
    // ============================================
    { code: '1', name: 'ACTIVO', kind: 'ASSET', section: 'CURRENT', group: 'Activo', statementGroup: null, parentCode: null, isHeader: true },

    // 1.1 - Activo Corriente
    { code: '1.1', name: 'Activo Corriente', kind: 'ASSET', section: 'CURRENT', group: 'Activo Corriente', statementGroup: null, parentCode: '1', isHeader: true },

    // 1.1.01 - Caja y Bancos
    { code: '1.1.01', name: 'Caja y Bancos', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1', isHeader: true },
    { code: '1.1.01.01', name: 'Caja ARS', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.02', name: 'Banco c/c ARS', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.03', name: 'Moneda extranjera (Otras)', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.04', name: 'Valores a depositar', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.05', name: 'Valores a depositar diferidos', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.06', name: 'Fondo fijo', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    // Cuentas USD específicas
    { code: '1.1.01.10', name: 'Caja USD', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.11', name: 'Banco c/c USD', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    // Regularizadoras de Caja y Bancos
    { code: '1.1.01.90', name: 'Valores a depositar endosados', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01', isContra: true, normalSide: 'CREDIT' },
    { code: '1.1.01.91', name: 'Valores a depositar dif. endosados', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01', isContra: true, normalSide: 'CREDIT' },

    // 1.1.02 - Créditos por ventas
    { code: '1.1.02', name: 'Créditos por ventas', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1', isHeader: true },
    { code: '1.1.02.01', name: 'Deudores por ventas', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.02', name: 'Documentos a cobrar', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.03', name: 'Deudores con tarjeta de crédito', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.04', name: 'Deudores morosos', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.05', name: 'Deudores en gestión de cobro', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.06', name: 'Documentos atrasados', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.07', name: 'Documentos en gestión de cobro', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.08', name: 'Valores rechazados', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.09', name: 'Valores diferidos rechazados', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    // Regularizadoras de Créditos
    { code: '1.1.02.80', name: 'Documentos a cobrar endosados', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02', isContra: true, normalSide: 'CREDIT' },
    { code: '1.1.02.81', name: 'Intereses a devengar (pos)', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02', isContra: true, normalSide: 'CREDIT' },
    { code: '1.1.02.90', name: 'Previsión para incobrables', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02', isContra: true, normalSide: 'CREDIT' },

    // 1.1.03 - Otros créditos
    { code: '1.1.03', name: 'Otros créditos', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1', isHeader: true },
    { code: '1.1.03.01', name: 'IVA Crédito Fiscal', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    { code: '1.1.03.02', name: 'Anticipos de impuestos', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    { code: '1.1.03.03', name: 'Anticipos a acreedores varios', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03' },
    { code: '1.1.03.04', name: 'Comisiones a cobrar', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03' },
    { code: '1.1.03.05', name: 'Indemnizaciones a cobrar', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03' },
    { code: '1.1.03.06', name: 'IVA a favor', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    { code: '1.1.03.07', name: 'Retenciones IVA de terceros', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    { code: '1.1.03.08', name: 'Percepciones IVA de terceros', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    // 1.1.03.10 - Créditos con socios, accionistas y personal
    { code: '1.1.03.10', name: 'Créditos con socios y personal', kind: 'ASSET', section: 'CURRENT', group: 'Créditos con socios y personal', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03', isHeader: true },
    { code: '1.1.03.11', name: 'Anticipos de personal', kind: 'ASSET', section: 'CURRENT', group: 'Créditos con socios y personal', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03.10' },
    { code: '1.1.03.12', name: 'Créditos a socios (CP)', kind: 'ASSET', section: 'CURRENT', group: 'Créditos con socios y personal', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03.10' },
    { code: '1.1.03.13', name: 'Accionistas - Integración pendiente', kind: 'ASSET', section: 'CURRENT', group: 'Créditos con socios y personal', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03.10' },
    // 1.1.03.20 - Prepagos
    { code: '1.1.03.20', name: 'Prepagos', kind: 'ASSET', section: 'CURRENT', group: 'Prepagos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03', isHeader: true },
    { code: '1.1.03.21', name: 'Alquileres pagados por adelantado', kind: 'ASSET', section: 'CURRENT', group: 'Prepagos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03.20' },
    { code: '1.1.03.22', name: 'Seguros pagados por adelantado', kind: 'ASSET', section: 'CURRENT', group: 'Prepagos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03.20' },
    { code: '1.1.03.23', name: 'Intereses pagados por adelantado', kind: 'ASSET', section: 'CURRENT', group: 'Prepagos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03.20' },

    // 1.1.04 - Bienes de cambio
    { code: '1.1.04', name: 'Bienes de cambio', kind: 'ASSET', section: 'CURRENT', group: 'Bienes de cambio', statementGroup: 'INVENTORIES', parentCode: '1.1', isHeader: true },
    { code: '1.1.04.01', name: 'Mercaderías', kind: 'ASSET', section: 'CURRENT', group: 'Bienes de cambio', statementGroup: 'INVENTORIES', parentCode: '1.1.04' },
    { code: '1.1.04.02', name: 'Anticipos a proveedores', kind: 'ASSET', section: 'CURRENT', group: 'Bienes de cambio', statementGroup: 'INVENTORIES', parentCode: '1.1.04' },

    // 1.1.05 - Inversiones transitorias
    { code: '1.1.05', name: 'Inversiones transitorias', kind: 'ASSET', section: 'CURRENT', group: 'Inversiones transitorias', statementGroup: 'INVESTMENTS', parentCode: '1.1', isHeader: true },
    { code: '1.1.05.01', name: 'Plazos fijos a cobrar', kind: 'ASSET', section: 'CURRENT', group: 'Inversiones transitorias', statementGroup: 'INVESTMENTS', parentCode: '1.1.05' },
    { code: '1.1.05.02', name: 'Fondos Comunes de Inversión', kind: 'ASSET', section: 'CURRENT', group: 'Inversiones transitorias', statementGroup: 'INVESTMENTS', parentCode: '1.1.05' },
    { code: '1.1.05.03', name: 'Inversiones transitorias ME', kind: 'ASSET', section: 'CURRENT', group: 'Inversiones transitorias', statementGroup: 'INVESTMENTS', parentCode: '1.1.05' },

    // 1.2 - Activo No Corriente
    { code: '1.2', name: 'Activo No Corriente', kind: 'ASSET', section: 'NON_CURRENT', group: 'Activo No Corriente', statementGroup: null, parentCode: '1', isHeader: true },

    // 1.2.01 - Bienes de uso
    { code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2', isHeader: true },
    { code: '1.2.01.01', name: 'Inmuebles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.02', name: 'Instalaciones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.03', name: 'Muebles y útiles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.04', name: 'Rodados', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.05', name: 'Equipos de computación', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.06', name: 'Terrenos', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.07', name: 'Obras en construcción', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    // Amortizaciones acumuladas
    { code: '1.2.01.90', name: 'Amortización acumulada bienes de uso', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01', isHeader: true, isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.91', name: 'Amort. acum. Inmuebles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.92', name: 'Amort. acum. Instalaciones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.93', name: 'Amort. acum. Muebles y útiles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.94', name: 'Amort. acum. Rodados', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.95', name: 'Amort. acum. Equipos comp.', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.96', name: 'Amort. acum. Terrenos', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },

    // 1.2.02 - Intangibles
    { code: '1.2.02', name: 'Activos intangibles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2', isHeader: true },
    { code: '1.2.02.01', name: 'Marcas y patentes', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2.02' },
    { code: '1.2.02.02', name: 'Software', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2.02' },
    { code: '1.2.02.90', name: 'Amort. acum. Intangibles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2.02', isContra: true, normalSide: 'CREDIT' },

    // 1.2.03 - Inversiones
    { code: '1.2.03', name: 'Inversiones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Inversiones', statementGroup: 'INVESTMENTS', parentCode: '1.2', isHeader: true },
    { code: '1.2.03.01', name: 'Inversiones permanentes', kind: 'ASSET', section: 'NON_CURRENT', group: 'Inversiones', statementGroup: 'INVESTMENTS', parentCode: '1.2.03' },

    // 1.2.04 - Otros créditos no corrientes
    { code: '1.2.04', name: 'Otros créditos no corrientes', kind: 'ASSET', section: 'NON_CURRENT', group: 'Otros créditos no corrientes', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.2', isHeader: true },
    { code: '1.2.04.01', name: 'Créditos a socios (LP)', kind: 'ASSET', section: 'NON_CURRENT', group: 'Otros créditos no corrientes', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.2.04' },
    { code: '1.2.04.02', name: 'Comisiones a cobrar (no cte)', kind: 'ASSET', section: 'NON_CURRENT', group: 'Otros créditos no corrientes', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.2.04' },
    { code: '1.2.04.03', name: 'Indemnizaciones a cobrar (no cte)', kind: 'ASSET', section: 'NON_CURRENT', group: 'Otros créditos no corrientes', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.2.04' },

    // ============================================
    // 2 - PASIVO
    // ============================================
    { code: '2', name: 'PASIVO', kind: 'LIABILITY', section: 'CURRENT', group: 'Pasivo', statementGroup: null, parentCode: null, isHeader: true },

    // 2.1 - Pasivo Corriente
    { code: '2.1', name: 'Pasivo Corriente', kind: 'LIABILITY', section: 'CURRENT', group: 'Pasivo Corriente', statementGroup: null, parentCode: '2', isHeader: true },

    // 2.1.01 - Deudas comerciales
    { code: '2.1.01', name: 'Deudas comerciales', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES', parentCode: '2.1', isHeader: true },
    { code: '2.1.01.01', name: 'Proveedores', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES', parentCode: '2.1.01' },
    { code: '2.1.01.02', name: 'Documentos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES', parentCode: '2.1.01' },
    // Acreedores varios movido a 2.1.06 Otras deudas
    { code: '2.1.01.04', name: 'Valores a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES', parentCode: '2.1.01' },
    { code: '2.1.01.05', name: 'Valores a pagar diferidos', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES', parentCode: '2.1.01' },
    { code: '2.1.01.10', name: 'Deuda en moneda extranjera (USD)', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'TRADE_PAYABLES', parentCode: '2.1.01' },

    // 2.1.02 - Deudas laborales
    { code: '2.1.02', name: 'Deudas laborales', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1', isHeader: true },
    { code: '2.1.02.01', name: 'Sueldos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1.02' },
    { code: '2.1.02.02', name: 'Cargas sociales a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1.02' },
    { code: '2.1.02.03', name: 'Retenciones so/ sueldos a depositar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1.02' },

    // 2.1.03 - Deudas fiscales
    { code: '2.1.03', name: 'Deudas fiscales', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1', isHeader: true },
    { code: '2.1.03.01', name: 'IVA Débito Fiscal', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.02', name: 'Impuestos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.03', name: 'Retenciones a depositar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.04', name: 'IVA a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.05', name: 'Retenciones IVA a terceros', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.06', name: 'Percepciones IVA a terceros', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },

    // 2.1.04 - Anticipos y diferidos
    { code: '2.1.04', name: 'Anticipos y diferidos', kind: 'LIABILITY', section: 'CURRENT', group: 'Anticipos', statementGroup: 'DEFERRED_INCOME', parentCode: '2.1', isHeader: true },
    { code: '2.1.04.01', name: 'Anticipos de clientes', kind: 'LIABILITY', section: 'CURRENT', group: 'Anticipos', statementGroup: 'DEFERRED_INCOME', parentCode: '2.1.04' },
    { code: '2.1.04.02', name: 'Alquileres cobrados por adelantado', kind: 'LIABILITY', section: 'CURRENT', group: 'Anticipos', statementGroup: 'DEFERRED_INCOME', parentCode: '2.1.04' },

    // 2.1.05 - Préstamos y deudas financieras
    { code: '2.1.05', name: 'Préstamos y deudas financieras', kind: 'LIABILITY', section: 'CURRENT', group: 'Préstamos y deudas financieras', statementGroup: 'LOANS', parentCode: '2.1', isHeader: true },
    { code: '2.1.05.01', name: 'Adelantos en cuenta corriente', kind: 'LIABILITY', section: 'CURRENT', group: 'Préstamos y deudas financieras', statementGroup: 'LOANS', parentCode: '2.1.05' },
    { code: '2.1.05.02', name: 'Préstamos bancarios (CP)', kind: 'LIABILITY', section: 'CURRENT', group: 'Préstamos y deudas financieras', statementGroup: 'LOANS', parentCode: '2.1.05' },
    { code: '2.1.05.90', name: 'Intereses a devengar (neg)', kind: 'LIABILITY', section: 'CURRENT', group: 'Préstamos y deudas financieras', statementGroup: 'LOANS', parentCode: '2.1.05', isContra: true, normalSide: 'DEBIT' },

    // 2.1.06 - Otras deudas
    { code: '2.1.06', name: 'Otras deudas', kind: 'LIABILITY', section: 'CURRENT', group: 'Otras deudas', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1', isHeader: true },
    { code: '2.1.06.01', name: 'Acreedores varios', kind: 'LIABILITY', section: 'CURRENT', group: 'Otras deudas', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1.06' },
    { code: '2.1.06.02', name: 'Alquileres a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Otras deudas', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1.06' },
    { code: '2.1.06.03', name: 'Gastos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Otras deudas', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1.06' },
    { code: '2.1.06.04', name: 'Deudas con socios (CP)', kind: 'LIABILITY', section: 'CURRENT', group: 'Otras deudas', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1.06' },
    { code: '2.1.06.05', name: 'Dividendos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Otras deudas', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1.06' },

    // 2.2 - Pasivo No Corriente
    { code: '2.2', name: 'Pasivo No Corriente', kind: 'LIABILITY', section: 'NON_CURRENT', group: 'Pasivo No Corriente', statementGroup: null, parentCode: '2', isHeader: true },

    { code: '2.2.01', name: 'Préstamos', kind: 'LIABILITY', section: 'NON_CURRENT', group: 'Préstamos', statementGroup: 'LOANS', parentCode: '2.2', isHeader: true },
    { code: '2.2.01.01', name: 'Préstamos bancarios', kind: 'LIABILITY', section: 'NON_CURRENT', group: 'Préstamos', statementGroup: 'LOANS', parentCode: '2.2.01' },

    // ============================================
    // 3 - PATRIMONIO NETO
    // ============================================
    { code: '3', name: 'PATRIMONIO NETO', kind: 'EQUITY', section: 'CURRENT', group: 'Patrimonio Neto', statementGroup: null, parentCode: null, isHeader: true },

    { code: '3.1', name: 'Capital', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3', isHeader: true },
    { code: '3.1.01', name: 'Capital social', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3.1' },
    { code: '3.1.02', name: 'Ajuste de capital', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3.1' },
    { code: '3.1.03', name: 'Aportes irrevocables', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3.1' },
    { code: '3.1.04', name: 'Prima de emisión', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3.1' },
    { code: '3.1.05', name: 'Descuento de emisión', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3.1', isContra: true, normalSide: 'DEBIT' },
    { code: '3.1.06', name: 'Capital a integrar', kind: 'EQUITY', section: 'CURRENT', group: 'Capital', statementGroup: 'CAPITAL', parentCode: '3.1', isContra: true, normalSide: 'DEBIT' },

    { code: '3.2', name: 'Reservas', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3', isHeader: true },
    { code: '3.2.01', name: 'Reserva legal', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },
    { code: '3.2.02', name: 'Reservas estatutarias', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },
    { code: '3.2.03', name: 'Reserva facultativa', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },
    { code: '3.2.04', name: 'Otras reservas', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },
    { code: '3.2.05', name: 'Reserva por revalúo', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },

    { code: '3.3', name: 'Resultados acumulados', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3', isHeader: true },
    { code: '3.3.01', name: 'Resultados no asignados', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3' },
    { code: '3.3.02', name: 'Resultado del ejercicio', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3' },
    // 3.3.03 - AREA
    { code: '3.3.03', name: 'Ajustes ejerc. anteriores (AREA)', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3', isHeader: true },
    { code: '3.3.03.01', name: 'Deudores incobrables AREA', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.03', normalSide: 'DEBIT' },
    { code: '3.3.03.02', name: 'Recupero previsión AREA', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.03', normalSide: 'CREDIT' },
    { code: '3.3.03.03', name: 'Recupero incobrables AREA', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.03', normalSide: 'CREDIT' },
    { code: '3.3.03.10', name: 'Corrección de errores (AREA)', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.03' },
    { code: '3.3.03.20', name: 'Cambios de políticas contables (AREA)', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.03' },
    { code: '3.3.03.99', name: 'Ajustes ejercicios anteriores (Genérico)', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.03' },
    // 3.3.04 - Distribuciones y retiros
    { code: '3.3.04', name: 'Distribuciones y retiros', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3', isHeader: true },
    { code: '3.3.04.01', name: 'Retiros de socios / Distribución', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.04', normalSide: 'DEBIT', isContra: true },
    { code: '3.3.04.02', name: 'Dividendos declarados (en efectivo)', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados acumulados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3.04', normalSide: 'DEBIT' },

    // ============================================
    // 4 - RESULTADOS
    // ============================================
    { code: '4', name: 'RESULTADOS', kind: 'INCOME', section: 'OPERATING', group: 'Resultados', statementGroup: null, parentCode: null, isHeader: true },

    // 4.1 - Ingresos operativos
    { code: '4.1', name: 'Ingresos operativos', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4', isHeader: true },
    { code: '4.1.01', name: 'Ventas', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4.1' },
    { code: '4.1.02', name: 'Comisiones ganadas', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4.1' },
    { code: '4.1.03', name: 'Alquileres ganados', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4.1' },

    // 4.2 - Deducciones de ingresos
    { code: '4.2', name: 'Deducciones de ingresos', kind: 'INCOME', section: 'OPERATING', group: 'Deducciones de ingresos', statementGroup: 'SALES', parentCode: '4', isHeader: true },
    { code: '4.2.01', name: 'Descuentos otorgados', kind: 'INCOME', section: 'OPERATING', group: 'Deducciones de ingresos', statementGroup: 'SALES', parentCode: '4.2', isContra: true, normalSide: 'DEBIT' },
    { code: '4.2.02', name: 'Bonificaciones cedidas', kind: 'INCOME', section: 'OPERATING', group: 'Deducciones de ingresos', statementGroup: 'SALES', parentCode: '4.2', isContra: true, normalSide: 'DEBIT' },
    // 4.1.04 Devoluciones movido a 4.8 como 'Devoluciones sobre ventas' según requerimiento de Movimientos

    // 4.3 - Costo de ventas
    { code: '4.3', name: 'Costo de ventas', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS', parentCode: '4', isHeader: true },
    { code: '4.3.01', name: 'Costo mercaderías vendidas', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS', parentCode: '4.3' },
    { code: '4.3.02', name: 'Diferencia de inventario', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS', parentCode: '4.3' },
    // Cuentas periódicas movidas a 4.8 Movimiento de mercaderías

    // 4.4 - Gastos de comercialización
    { code: '4.4', name: 'Gastos de comercialización', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '4', isHeader: true },
    { code: '4.4.01', name: 'Publicidad', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '4.4' },
    { code: '4.4.02', name: 'Fletes y acarreos', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '4.4' },
    { code: '4.4.03', name: 'Comisiones perdidas', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '4.4' },
    { code: '4.4.04', name: 'Deudores incobrables', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '4.4' },
    { code: '4.4.05', name: 'Impuesto Ingresos Brutos', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '4.4' },

    // 4.5 - Gastos de administración
    { code: '4.5', name: 'Gastos de administración', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4', isHeader: true },
    { code: '4.5.01', name: 'Sueldos y jornales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.02', name: 'Cargas sociales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.03', name: 'Alquileres perdidos', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.04', name: 'Seguros', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.05', name: 'Servicios públicos', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.06', name: 'Gastos de oficina', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.07', name: 'Mantenimiento y reparación', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.08', name: 'Gastos generales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.09', name: 'Gastos de organización', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.10', name: 'Impuestos y tasas', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.11', name: 'Amortizaciones bienes de uso', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },
    { code: '4.5.12', name: 'Honorarios profesionales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '4.5' },

    // 4.6 - Resultados financieros y tenencia
    { code: '4.6', name: 'Resultados financieros y tenencia', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4', isHeader: true },
    { code: '4.6.01', name: 'Intereses ganados', kind: 'INCOME', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_INCOME', parentCode: '4.6' },
    { code: '4.6.02', name: 'Intereses perdidos', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4.6' },
    { code: '4.6.03', name: 'Diferencia de cambio', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4.6', allowOppositeBalance: true },
    { code: '4.6.04', name: 'Comisiones y gastos bancarios', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4.6' },
    { code: '4.6.05', name: 'RECPAM', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4.6', allowOppositeBalance: true },
    { code: '4.6.06', name: 'Resultado por tenencia', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4.6', allowOppositeBalance: true },
    { code: '4.6.07', name: 'Diferencias de cambio (Ganancia)', kind: 'INCOME', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_INCOME', parentCode: '4.6' },
    { code: '4.6.08', name: 'Diferencias de cambio (Pérdida)', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '4.6' },
    { code: '4.6.09', name: 'Descuentos obtenidos', kind: 'INCOME', section: 'FINANCIAL', group: 'Resultados financieros', statementGroup: 'FINANCIAL_INCOME', parentCode: '4.6' },

    // 4.7 - Otros ingresos y egresos
    { code: '4.7', name: 'Otros ingresos y egresos', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '4', isHeader: true },
    { code: '4.7.01', name: 'Faltante de caja', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '4.7' },
    { code: '4.7.02', name: 'Sobrante de caja', kind: 'INCOME', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_INCOME', parentCode: '4.7' },
    { code: '4.7.03', name: 'Obsolescencia bienes de uso', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '4.7' },
    { code: '4.7.04', name: 'Resultado venta bienes de uso', kind: 'INCOME', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_INCOME', parentCode: '4.7' },
    { code: '4.7.05', name: 'Siniestros', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '4.7' },
    { code: '4.7.06', name: 'Recupero previsión', kind: 'INCOME', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_INCOME', parentCode: '4.7' },
    { code: '4.7.07', name: 'Recupero deudores incobrables', kind: 'INCOME', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_INCOME', parentCode: '4.7' },

    // 4.8 - Movimiento de mercaderías (transitorias)
    { code: '4.8', name: 'Movimiento de mercaderías', kind: 'EXPENSE', section: 'COST', group: 'Movimiento de mercaderías', statementGroup: 'COGS', parentCode: '4', isHeader: true },
    { code: '4.8.01', name: 'Compras', kind: 'EXPENSE', section: 'COST', group: 'Movimiento de mercaderías', statementGroup: 'COGS', parentCode: '4.8' },
    { code: '4.8.02', name: 'Gastos sobre compras', kind: 'EXPENSE', section: 'COST', group: 'Movimiento de mercaderías', statementGroup: 'COGS', parentCode: '4.8' },
    { code: '4.8.03', name: 'Bonificaciones sobre compras', kind: 'EXPENSE', section: 'COST', group: 'Movimiento de mercaderías', statementGroup: 'COGS', parentCode: '4.8', isContra: true, normalSide: 'CREDIT' },
    { code: '4.8.04', name: 'Devoluciones sobre compras', kind: 'EXPENSE', section: 'COST', group: 'Movimiento de mercaderías', statementGroup: 'COGS', parentCode: '4.8', isContra: true, normalSide: 'CREDIT' },
    { code: '4.8.05', name: 'Bonificaciones sobre ventas', kind: 'INCOME', section: 'OPERATING', group: 'Movimiento de mercaderías', statementGroup: 'SALES', parentCode: '4.8', isContra: true, normalSide: 'DEBIT' },
    { code: '4.8.06', name: 'Devoluciones sobre ventas', kind: 'INCOME', section: 'OPERATING', group: 'Movimiento de mercaderías', statementGroup: 'SALES', parentCode: '4.8', isContra: true, normalSide: 'DEBIT' },
]

/**
 * Convierte SeedAccount a Account completo
 */
function seedToAccount(seed: SeedAccount, codeToId: Map<string, string>): Account {
    const id = generateId()
    const parentId = seed.parentCode ? codeToId.get(seed.parentCode) || null : null
    const level = seed.code.split('.').length - 1

    // Determinar normalSide por defecto según kind
    const defaultNormalSide = ['ASSET', 'EXPENSE'].includes(seed.kind) ? 'DEBIT' : 'CREDIT'

    return {
        id,
        code: seed.code,
        name: seed.name,
        kind: seed.kind,
        section: seed.section,
        group: seed.group,
        statementGroup: seed.statementGroup,
        parentId,
        level,
        normalSide: seed.normalSide || defaultNormalSide,
        isContra: seed.isContra || false,
        isHeader: seed.isHeader || false,
        allowOppositeBalance: seed.allowOppositeBalance || false,
    }
}

/**
 * Carga los datos iniciales SOLO si la tabla está vacía
 * Seed idempotente: verifica count en lugar de flag
 */
export async function loadSeedDataIfNeeded(): Promise<boolean> {
    try {
        // Primero, limpiar duplicados si existen
        await cleanupDuplicateAccounts()

        // Verificar si ya hay cuentas (seed idempotente)
        const accountCount = await db.accounts.count()
        if (accountCount > 0) {
            console.log(`✓ Base de datos ya tiene ${accountCount} cuentas, omitiendo seed`)
            return false
        }

        console.log('📦 Inicializando plan de cuentas Argentina...')

        // Crear mapa de code -> id para resolver parentId
        const codeToId = new Map<string, string>()
        const accountsToInsert: Account[] = []

        // Procesar en orden para que los padres existan antes que los hijos
        for (const seed of SEED_ACCOUNTS) {
            const account = seedToAccount(seed, codeToId)
            codeToId.set(seed.code, account.id)
            accountsToInsert.push(account)
        }

        // Insertar todas las cuentas.
        // En DEV (React StrictMode) la inicialización puede dispararse dos veces y
        // provocar un race condition sobre el índice único `code`.
        try {
            await db.accounts.bulkAdd(accountsToInsert)
        } catch (error) {
            const name = error instanceof Error ? error.name : ''
            if (name === 'ConstraintError' || name === 'BulkError') {
                const currentCount = await db.accounts.count()
                if (currentCount > 0) {
                    console.warn('Seed concurrente detectado; se omite inserción duplicada de cuentas')
                    return false
                }
            }
            throw error
        }

        // Guardar versión del seed
        await db.settings.put({
            id: 'main',
            seedVersion: SEED_VERSION,
            lastUpdated: new Date().toISOString(),
        })

        console.log(`✓ Plan de cuentas cargado: ${accountsToInsert.length} cuentas`)
        return true
    } catch (error) {
        console.error('Error cargando datos iniciales:', error)
        throw error
    }
}

/**
 * Resetea la base de datos y recarga los datos iniciales
 */
export async function resetDatabase(): Promise<void> {
    await db.accounts.clear()
    await db.entries.clear()
    await db.settings.clear()
    await loadSeedDataIfNeeded()
}

/**
 * Obtiene las cuentas agrupadas por kind
 */
export async function getAccountsByKind(): Promise<Record<AccountKind, Account[]>> {
    const accounts = await db.accounts.toArray()

    const grouped: Record<AccountKind, Account[]> = {
        ASSET: [],
        LIABILITY: [],
        EQUITY: [],
        INCOME: [],
        EXPENSE: [],
    }

    for (const account of accounts) {
        if (grouped[account.kind]) {
            grouped[account.kind].push(account)
        }
    }

    // Ordenar cada grupo por código
    for (const kind of Object.keys(grouped) as AccountKind[]) {
        grouped[kind].sort((a, b) => a.code.localeCompare(b.code))
    }

    return grouped
}

/**
 * Obtiene cuentas en estructura de árbol
 */
export async function getAccountTree(): Promise<Account[]> {
    const accounts = await db.accounts.orderBy('code').toArray()
    return accounts
}

/**
 * Obtiene los hijos directos de una cuenta
 */
export async function getChildAccounts(parentId: string): Promise<Account[]> {
    return db.accounts.where('parentId').equals(parentId).sortBy('code')
}

/**
 * Asegura que existan las cuentas por defecto para Moneda Extranjera.
 * Renombra cuentas viejas si existen y crea las faltantes.
 * Idempotente y seguro (no borra datos).
 */
export async function repairDefaultFxAccounts(): Promise<void> {
    const accounts = await db.accounts.toArray()

    const findByCode = (code: string) => accounts.find(a => a.code === code)
    const findByExactName = (name: string) => accounts.find(a => a.name === name)

    // A - RENOMBRES
    // 1.1.01.01: "Caja" o "Caja moneda nacional" -> "Caja ARS"
    const caja = findByCode('1.1.01.01')
    if (caja && (caja.name === 'Caja' || caja.name === 'Caja moneda nacional')) {
        await db.accounts.update(caja.id, { name: 'Caja ARS' })
        console.log('✓ Renombrado: Caja -> Caja ARS')
    }

    // 1.1.01.02: "Bancos cuenta corriente" -> "Banco c/c ARS"
    const bancoArs = findByCode('1.1.01.02')
    if (bancoArs && bancoArs.name === 'Bancos cuenta corriente') {
        await db.accounts.update(bancoArs.id, { name: 'Banco c/c ARS' })
        console.log('✓ Renombrado: Bancos cuenta corriente -> Banco c/c ARS')
    }

    // 4.6.04: "Gastos bancarios" -> "Comisiones y gastos bancarios"
    const gastosBancarios = findByCode('4.6.04')
    if (gastosBancarios && gastosBancarios.name === 'Gastos bancarios') {
        await db.accounts.update(gastosBancarios.id, { name: 'Comisiones y gastos bancarios' })
        console.log('✓ Renombrado: Gastos bancarios -> Comisiones y gastos bancarios')
    }

    // B - ALTAS SI FALTAN
    const accountsToEnsure = SEED_ACCOUNTS.filter(s =>
        ['1.1.01.10', '1.1.01.11', '2.1.01.10', '4.6.07', '4.6.08'].includes(s.code)
    )

    const codeToId = new Map(accounts.map(a => [a.code, a.id]))
    const newAccounts: Account[] = []

    for (const seed of accountsToEnsure) {
        if (!findByCode(seed.code) && !findByExactName(seed.name)) {
            // No existe ni por código ni por nombre exacto -> crear
            const account = seedToAccount(seed, codeToId)
            codeToId.set(seed.code, account.id)
            newAccounts.push(account)
            console.log(`+ Creada cuenta faltante: ${seed.code} - ${seed.name}`)
        }
    }

    if (newAccounts.length > 0) {
        await db.accounts.bulkAdd(newAccounts)
    }
}

/**
 * Asegura que existan cuentas fiscales basicas (IVA/Ret/Per).
 * Idempotente y seguro (no borra datos).
 */
export async function repairTaxAccounts(): Promise<void> {
    const accounts = await db.accounts.toArray()

    const findByCode = (code: string) => accounts.find(a => a.code === code)
    const findByExactName = (name: string) => accounts.find(a => a.name === name)

    const requiredCodes = [
        '2.1.03.03', // Retenciones a depositar
        '2.1.03.04', // IVA a pagar
        '2.1.03.06', // Percepciones IVA a terceros
        '1.1.03.06', // IVA a favor
        '1.1.03.07', // Retenciones IVA de terceros
        '1.1.03.08', // Percepciones IVA de terceros
        '2.1.03.01', // IVA Debito Fiscal
        '1.1.03.01', // IVA Credito Fiscal
    ]

    const seedByCode = new Map(SEED_ACCOUNTS.map(seed => [seed.code, seed]))
    const codeToId = new Map(accounts.map(account => [account.code, account.id]))
    const newAccounts: Account[] = []

    const ensureAccount = (code: string) => {
        if (codeToId.has(code)) return
        const seed = seedByCode.get(code)
        if (!seed) return

        const existing = findByCode(seed.code) || findByExactName(seed.name)
        if (existing) {
            codeToId.set(seed.code, existing.id)
            return
        }

        if (seed.parentCode) {
            ensureAccount(seed.parentCode)
        }

        const account = seedToAccount(seed, codeToId)
        codeToId.set(seed.code, account.id)
        newAccounts.push(account)
    }

    requiredCodes.forEach(ensureAccount)

    if (newAccounts.length > 0) {
        await db.accounts.bulkAdd(newAccounts)
    }
}

/**
 * Repara cuentas de Patrimonio Neto (3.3.04.01) para que sean isContra: true.
 * Esto corrige el problema donde los retiros suman al PN en lugar de restar.
 */
export async function repairEquityAccounts(): Promise<void> {
    const accounts = await db.accounts.toArray()
    const retiros = accounts.find(a => a.code === '3.3.04.01')

    if (retiros && !retiros.isContra) {
        await db.accounts.update(retiros.id, { isContra: true })
        console.log('✓ Reparado: 3.3.04.01 Retiros ahora es isContra: true')
    }
}
