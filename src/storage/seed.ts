import { db, generateId, cleanupDuplicateAccounts } from './db'
import type { Account, AccountKind, AccountSection, StatementGroup, NormalSide } from '../core/models'

// Current seed version - increment when seed structure changes
const SEED_VERSION = 2

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
    { code: '1.1.01.01', name: 'Caja', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.02', name: 'Bancos cuenta corriente', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.03', name: 'Moneda extranjera', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },
    { code: '1.1.01.04', name: 'Valores a depositar', kind: 'ASSET', section: 'CURRENT', group: 'Caja y Bancos', statementGroup: 'CASH_AND_BANKS', parentCode: '1.1.01' },

    // 1.1.02 - Créditos por ventas
    { code: '1.1.02', name: 'Créditos por ventas', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1', isHeader: true },
    { code: '1.1.02.01', name: 'Deudores por ventas', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.02', name: 'Documentos a cobrar', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02' },
    { code: '1.1.02.90', name: 'Previsión para incobrables', kind: 'ASSET', section: 'CURRENT', group: 'Créditos por ventas', statementGroup: 'TRADE_RECEIVABLES', parentCode: '1.1.02', isContra: true, normalSide: 'CREDIT' },

    // 1.1.03 - Otros créditos
    { code: '1.1.03', name: 'Otros créditos', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1', isHeader: true },
    { code: '1.1.03.01', name: 'IVA Crédito Fiscal', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    { code: '1.1.03.02', name: 'Anticipos de impuestos', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'TAX_CREDITS', parentCode: '1.1.03' },
    { code: '1.1.03.03', name: 'Anticipos a proveedores', kind: 'ASSET', section: 'CURRENT', group: 'Otros créditos', statementGroup: 'OTHER_RECEIVABLES', parentCode: '1.1.03' },

    // 1.1.04 - Bienes de cambio
    { code: '1.1.04', name: 'Bienes de cambio', kind: 'ASSET', section: 'CURRENT', group: 'Bienes de cambio', statementGroup: 'INVENTORIES', parentCode: '1.1', isHeader: true },
    { code: '1.1.04.01', name: 'Mercaderías', kind: 'ASSET', section: 'CURRENT', group: 'Bienes de cambio', statementGroup: 'INVENTORIES', parentCode: '1.1.04' },

    // 1.2 - Activo No Corriente
    { code: '1.2', name: 'Activo No Corriente', kind: 'ASSET', section: 'NON_CURRENT', group: 'Activo No Corriente', statementGroup: null, parentCode: '1', isHeader: true },

    // 1.2.01 - Bienes de uso
    { code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2', isHeader: true },
    { code: '1.2.01.01', name: 'Inmuebles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.02', name: 'Instalaciones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.03', name: 'Muebles y útiles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.04', name: 'Rodados', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    { code: '1.2.01.05', name: 'Equipos de computación', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01' },
    // Amortizaciones acumuladas
    { code: '1.2.01.90', name: 'Amortización acumulada bienes de uso', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01', isHeader: true, isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.91', name: 'Amort. acum. Inmuebles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.92', name: 'Amort. acum. Instalaciones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.93', name: 'Amort. acum. Muebles y útiles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.94', name: 'Amort. acum. Rodados', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },
    { code: '1.2.01.95', name: 'Amort. acum. Equipos comp.', kind: 'ASSET', section: 'NON_CURRENT', group: 'Bienes de uso', statementGroup: 'PPE', parentCode: '1.2.01.90', isContra: true, normalSide: 'CREDIT' },

    // 1.2.02 - Intangibles
    { code: '1.2.02', name: 'Activos intangibles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2', isHeader: true },
    { code: '1.2.02.01', name: 'Marcas y patentes', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2.02' },
    { code: '1.2.02.02', name: 'Software', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2.02' },
    { code: '1.2.02.90', name: 'Amort. acum. Intangibles', kind: 'ASSET', section: 'NON_CURRENT', group: 'Intangibles', statementGroup: 'INTANGIBLES', parentCode: '1.2.02', isContra: true, normalSide: 'CREDIT' },

    // 1.2.03 - Inversiones
    { code: '1.2.03', name: 'Inversiones', kind: 'ASSET', section: 'NON_CURRENT', group: 'Inversiones', statementGroup: 'INVESTMENTS', parentCode: '1.2', isHeader: true },
    { code: '1.2.03.01', name: 'Inversiones permanentes', kind: 'ASSET', section: 'NON_CURRENT', group: 'Inversiones', statementGroup: 'INVESTMENTS', parentCode: '1.2.03' },

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
    { code: '2.1.01.03', name: 'Acreedores varios', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas comerciales', statementGroup: 'OTHER_PAYABLES', parentCode: '2.1.01' },

    // 2.1.02 - Deudas laborales
    { code: '2.1.02', name: 'Deudas laborales', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1', isHeader: true },
    { code: '2.1.02.01', name: 'Sueldos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1.02' },
    { code: '2.1.02.02', name: 'Cargas sociales a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas laborales', statementGroup: 'PAYROLL_LIABILITIES', parentCode: '2.1.02' },

    // 2.1.03 - Deudas fiscales
    { code: '2.1.03', name: 'Deudas fiscales', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1', isHeader: true },
    { code: '2.1.03.01', name: 'IVA Débito Fiscal', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.02', name: 'Impuestos a pagar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },
    { code: '2.1.03.03', name: 'Retenciones a depositar', kind: 'LIABILITY', section: 'CURRENT', group: 'Deudas fiscales', statementGroup: 'TAX_LIABILITIES', parentCode: '2.1.03' },

    // 2.1.04 - Anticipos y diferidos
    { code: '2.1.04', name: 'Anticipos y diferidos', kind: 'LIABILITY', section: 'CURRENT', group: 'Anticipos', statementGroup: 'DEFERRED_INCOME', parentCode: '2.1', isHeader: true },
    { code: '2.1.04.01', name: 'Anticipos de clientes', kind: 'LIABILITY', section: 'CURRENT', group: 'Anticipos', statementGroup: 'DEFERRED_INCOME', parentCode: '2.1.04' },

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

    { code: '3.2', name: 'Reservas', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3', isHeader: true },
    { code: '3.2.01', name: 'Reserva legal', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },
    { code: '3.2.02', name: 'Reservas estatutarias', kind: 'EQUITY', section: 'CURRENT', group: 'Reservas', statementGroup: 'RESERVES', parentCode: '3.2' },

    { code: '3.3', name: 'Resultados', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3', isHeader: true },
    { code: '3.3.01', name: 'Resultados no asignados', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3' },
    { code: '3.3.02', name: 'Resultado del ejercicio', kind: 'EQUITY', section: 'CURRENT', group: 'Resultados', statementGroup: 'RETAINED_EARNINGS', parentCode: '3.3' },

    // ============================================
    // 4 - INGRESOS
    // ============================================
    { code: '4', name: 'INGRESOS', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos', statementGroup: null, parentCode: null, isHeader: true },

    { code: '4.1', name: 'Ingresos operativos', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4', isHeader: true },
    { code: '4.1.01', name: 'Ventas', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4.1' },
    { code: '4.1.02', name: 'Servicios prestados', kind: 'INCOME', section: 'OPERATING', group: 'Ingresos operativos', statementGroup: 'SALES', parentCode: '4.1' },

    { code: '4.2', name: 'Otros ingresos', kind: 'INCOME', section: 'OTHER', group: 'Otros ingresos', statementGroup: 'OTHER_OPERATING_INCOME', parentCode: '4', isHeader: true },
    { code: '4.2.01', name: 'Comisiones ganadas', kind: 'INCOME', section: 'OTHER', group: 'Otros ingresos', statementGroup: 'OTHER_INCOME', parentCode: '4.2' },
    { code: '4.2.02', name: 'Alquileres ganados', kind: 'INCOME', section: 'OTHER', group: 'Otros ingresos', statementGroup: 'OTHER_INCOME', parentCode: '4.2' },

    // ============================================
    // 5 - COSTOS
    // ============================================
    { code: '5', name: 'COSTOS', kind: 'EXPENSE', section: 'COST', group: 'Costos', statementGroup: null, parentCode: null, isHeader: true },

    { code: '5.1', name: 'Costo de ventas', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS', parentCode: '5', isHeader: true },
    { code: '5.1.01', name: 'Costo de mercaderías vendidas', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS', parentCode: '5.1' },
    { code: '5.1.02', name: 'Costo de servicios', kind: 'EXPENSE', section: 'COST', group: 'Costo de ventas', statementGroup: 'COGS', parentCode: '5.1' },

    // ============================================
    // 6 - GASTOS
    // ============================================
    { code: '6', name: 'GASTOS', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos', statementGroup: null, parentCode: null, isHeader: true },

    // 6.1 - Gastos de administración
    { code: '6.1', name: 'Gastos de administración', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6', isHeader: true },
    { code: '6.1.01', name: 'Sueldos y jornales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.02', name: 'Cargas sociales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.03', name: 'Alquileres', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.04', name: 'Servicios públicos', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.05', name: 'Impuestos y tasas', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.06', name: 'Gastos de oficina', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.07', name: 'Amortizaciones', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },
    { code: '6.1.08', name: 'Honorarios profesionales', kind: 'EXPENSE', section: 'ADMIN', group: 'Gastos de administración', statementGroup: 'ADMIN_EXPENSES', parentCode: '6.1' },

    // 6.2 - Gastos de comercialización
    { code: '6.2', name: 'Gastos de comercialización', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '6', isHeader: true },
    { code: '6.2.01', name: 'Publicidad', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '6.2' },
    { code: '6.2.02', name: 'Fletes y acarreos', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '6.2' },
    { code: '6.2.03', name: 'Comisiones pagadas', kind: 'EXPENSE', section: 'SELLING', group: 'Gastos de comercialización', statementGroup: 'SELLING_EXPENSES', parentCode: '6.2' },

    // ============================================
    // 7 - RESULTADOS FINANCIEROS Y OTROS
    // ============================================
    { code: '7', name: 'RESULTADOS FINANCIEROS Y OTROS', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Financieros', statementGroup: null, parentCode: null, isHeader: true },

    // 7.1 - Resultados financieros
    { code: '7.1', name: 'Resultados financieros', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Financieros', statementGroup: null, parentCode: '7', isHeader: true },
    { code: '7.1.01', name: 'Intereses ganados', kind: 'INCOME', section: 'FINANCIAL', group: 'Financieros', statementGroup: 'FINANCIAL_INCOME', parentCode: '7.1' },
    { code: '7.1.02', name: 'Intereses perdidos', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '7.1' },
    { code: '7.1.03', name: 'Gastos bancarios', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '7.1' },
    { code: '7.1.04', name: 'Diferencia de cambio', kind: 'EXPENSE', section: 'FINANCIAL', group: 'Financieros', statementGroup: 'FINANCIAL_EXPENSES', parentCode: '7.1' },

    // 7.2 - Otros resultados
    { code: '7.2', name: 'Otros resultados', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: null, parentCode: '7', isHeader: true },
    { code: '7.2.01', name: 'Descuentos obtenidos', kind: 'INCOME', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_INCOME', parentCode: '7.2' },
    { code: '7.2.02', name: 'Descuentos otorgados', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '7.2' },
    { code: '7.2.03', name: 'Deudores incobrables', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '7.2' },
    { code: '7.2.04', name: 'Faltantes de caja', kind: 'EXPENSE', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_EXPENSES', parentCode: '7.2' },
    { code: '7.2.05', name: 'Sobrantes de caja', kind: 'INCOME', section: 'OTHER', group: 'Otros resultados', statementGroup: 'OTHER_INCOME', parentCode: '7.2' },
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

        // Insertar todas las cuentas
        await db.accounts.bulkAdd(accountsToInsert)

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
