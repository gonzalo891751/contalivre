import Dexie, { type EntityTable } from 'dexie'
import type { Account, ExpenseAllocationRule, JournalEntry, ManualDisclosure } from '../core/models'
import type {
    AccountingExercise,
    AccountingPeriod,
    AuditEvent,
    Company,
    SystemMeta,
} from '../accounting/domain/types'
import type { InflationIndexSet } from '../accounting/inflation/types'
import type { ReportSnapshot } from '../reporting/snapshots/types'
import { migrateToV17 } from '../accounting/migration/migrateV17'
import { migrateToV18 } from '../accounting/migration/migrateV18'
import { migrateToV19 } from '../accounting/migration/migrateV19'
import { migrateToV20 } from '../accounting/migration/migrateV20'
import { migrateToV21 } from '../accounting/migration/migrateV21'
import { migrateToV22 } from '../accounting/migration/migrateV22'
import type { CashFlowPolicy } from '../reporting/policy/cashFlowPolicy'
import type {
    InventoryProduct,
    InventoryMovement,
    InventoryClosing,
    InventoryConfig,
    BienesProduct,
    BienesMovement,
    BienesSettings,
} from '../core/inventario/types'
import type {
    FxAccount,
    FxMovement,
    FxDebt,
    FxLiability,
    FxSettings,
    ExchangeRatesCache,
} from '../core/monedaExtranjera/types'
import type {
    TaxClosePeriod,
    TaxDueNotification,
    TaxObligationRecord,
    TaxPaymentLink,
} from '../core/impuestos/types'
import type { FixedAsset, FixedAssetEvent } from '../core/fixedAssets/types'
import type {
    InvestmentInstrument,
    InvestmentMovement,
    InvestmentSettings,
    InvestmentNotification,
} from '../core/inversiones/types'
import type { CompanyProfile } from '../core/companyProfile/types'
import type {
    Employee,
    PayrollSettings,
    PayrollRun,
    PayrollLine,
    PayrollPayment,
    PayrollConcept,
} from '../core/payroll/types'

/**
 * Configuración de la aplicación
 */
export interface Settings {
    id: string
    seedVersion: number
    lastUpdated: string
}

/**
 * Base de datos IndexedDB usando Dexie
 * 
 * Version 2: Added unique constraint on account code, new account fields
 * Version 3: Added amortizationState for depreciation calculator
 * Version 4: Added inventory module tables (products, movements, closings, config)
 */
class ContableDatabase extends Dexie {
    accounts!: EntityTable<Account, 'id'>
    entries!: EntityTable<JournalEntry, 'id'>
    settings!: EntityTable<Settings, 'id'>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    amortizationState!: EntityTable<any, 'id'>
    // Inventory module tables
    inventoryProducts!: EntityTable<InventoryProduct, 'id'>
    inventoryMovements!: EntityTable<InventoryMovement, 'id'>
    inventoryClosings!: EntityTable<InventoryClosing, 'id'>
    inventoryConfig!: EntityTable<InventoryConfig, 'id'>
    // Cierre Valuación module
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cierreValuacionState!: EntityTable<any, 'id'>
    // Bienes de Cambio module (new costing model)
    bienesProducts!: EntityTable<BienesProduct, 'id'>
    bienesMovements!: EntityTable<BienesMovement, 'id'>
    bienesSettings!: EntityTable<BienesSettings, 'id'>
    // Moneda Extranjera module
    fxAccounts!: EntityTable<FxAccount, 'id'>
    fxMovements!: EntityTable<FxMovement, 'id'>
    fxDebts!: EntityTable<FxDebt, 'id'>
    fxLiabilities!: EntityTable<FxLiability, 'id'>
    fxSettings!: EntityTable<FxSettings, 'id'>
    fxRatesCache!: EntityTable<ExchangeRatesCache, 'id'>
    // Impuestos module
    taxClosures!: EntityTable<TaxClosePeriod, 'id'>
    taxDueNotifications!: EntityTable<TaxDueNotification, 'id'>
    taxObligations!: EntityTable<TaxObligationRecord, 'id'>
    taxPayments!: EntityTable<TaxPaymentLink, 'id'>
    // Fixed Assets (Bienes de Uso) module
    fixedAssets!: EntityTable<FixedAsset, 'id'>
    fixedAssetEvents!: EntityTable<FixedAssetEvent, 'id'>
    // Inversiones module
    invInstruments!: EntityTable<InvestmentInstrument, 'id'>
    invMovements!: EntityTable<InvestmentMovement, 'id'>
    invSettings!: EntityTable<InvestmentSettings, 'id'>
    invNotifications!: EntityTable<InvestmentNotification, 'id'>
    // Company Profile (singleton)
    companyProfile!: EntityTable<CompanyProfile, 'id'>
    // Payroll / Deudas Sociales module
    payrollEmployees!: EntityTable<Employee, 'id'>
    payrollSettings!: EntityTable<PayrollSettings, 'id'>
    payrollRuns!: EntityTable<PayrollRun, 'id'>
    payrollLines!: EntityTable<PayrollLine, 'id'>
    payrollPayments!: EntityTable<PayrollPayment, 'id'>
    payrollConcepts!: EntityTable<PayrollConcept, 'id'>
    // ── Fase 2A: núcleo contable ─────────────────────────────
    companies!: EntityTable<Company, 'id'>
    exercises!: EntityTable<AccountingExercise, 'id'>
    periods!: EntityTable<AccountingPeriod, 'id'>
    auditLog!: EntityTable<AuditEvent, 'id'>
    systemMeta!: EntityTable<SystemMeta, 'id'>
    // ── Fase 2B: índices de inflación versionados ────────────
    inflationIndexSets!: EntityTable<InflationIndexSet, 'id'>
    // ── Fase 2C: snapshots de reportes publicados ────────────
    reportSnapshots!: EntityTable<ReportSnapshot, 'id'>
    // ── Fase 2E: reglas de distribución de gastos por función ──
    expenseAllocationRules!: EntityTable<ExpenseAllocationRule, 'id'>
    // ── Fase 2F: notas manuales persistentes ──
    manualDisclosures!: EntityTable<ManualDisclosure, 'id'>
    // ── Fase 2G: política del Estado de Flujo de Efectivo versionada ──
    cashFlowPolicies!: EntityTable<CashFlowPolicy, 'id'>

    constructor() {
        super('EntrenadorContable')

        // Version 1: Original schema
        this.version(1).stores({
            accounts: 'id, code, name, type',
            entries: 'id, date, memo',
            settings: 'id',
        })

        // Version 2: Unique code constraint + new account fields for hierarchy
        this.version(2).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
        }).upgrade(async tx => {
            // Migration: Add default values for new fields to existing accounts
            const accounts = tx.table('accounts')
            await accounts.toCollection().modify(account => {
                // Map old 'type' to new 'kind'
                if (!account.kind) {
                    const typeToKind: Record<string, string> = {
                        'Activo': 'ASSET',
                        'Pasivo': 'LIABILITY',
                        'PatrimonioNeto': 'EQUITY',
                        'Ingreso': 'INCOME',
                        'Gasto': 'EXPENSE',
                    }
                    account.kind = typeToKind[account.type] || 'ASSET'
                }
                // Set defaults for new fields
                if (account.parentId === undefined) account.parentId = null
                if (account.level === undefined) account.level = account.code.split('.').length - 1
                if (account.normalSide === undefined) {
                    account.normalSide = ['ASSET', 'EXPENSE'].includes(account.kind) ? 'DEBIT' : 'CREDIT'
                }
                if (account.isContra === undefined) account.isContra = false
                if (account.isHeader === undefined) account.isHeader = false
                if (account.section === undefined) account.section = 'CURRENT'
                if (account.group === undefined) account.group = ''
                if (account.statementGroup === undefined) account.statementGroup = null
            })
        })

        // Version 3: Added amortization state for depreciation calculator
        this.version(3).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
            amortizationState: 'id',
        })

        // Version 4: Inventory module tables
        this.version(4).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
        })

        // Version 5: Cierre Valuación module
        this.version(5).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
        })

        // Version 6: Bienes de Cambio module (new costing model)
        this.version(6).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
        })

        // Version 7: Moneda Extranjera module
        this.version(7).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
        })

        // Version 8: FX Debts (structured liabilities)
        this.version(8).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
        })

        // Version 9: Impuestos module (tax closures and notifications)
        this.version(9).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
        })

        // Version 10: Fixed Assets (Bienes de Uso) module
        this.version(10).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
        })

        // Version 11: Fixed Asset Events (Mejoras/Bajas/Revalúo)
        this.version(11).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
        })

        // Version 12: Tax obligations and payments
        this.version(12).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            taxObligations: 'id, &uniqueKey, taxType, taxPeriod, jurisdiction, status, dueDate',
            taxPayments: 'id, obligationId, journalEntryId, paidAt',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
        })

        // Version 13: Inversiones module (Investments)
        this.version(13).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            taxObligations: 'id, &uniqueKey, taxType, taxPeriod, jurisdiction, status, dueDate',
            taxPayments: 'id, obligationId, journalEntryId, paidAt',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
            // Inversiones module
            invInstruments: 'id, periodId, rubro, ticker, accountId',
            invMovements: 'id, periodId, date, rubro, type, instrumentId',
            invSettings: 'id',
            invNotifications: 'id, type, instrumentId, dueDate, seen',
        })

        // Version 14: Company Profile (singleton for company data)
        this.version(14).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            taxObligations: 'id, &uniqueKey, taxType, taxPeriod, jurisdiction, status, dueDate',
            taxPayments: 'id, obligationId, journalEntryId, paidAt',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
            invInstruments: 'id, periodId, rubro, ticker, accountId',
            invMovements: 'id, periodId, date, rubro, type, instrumentId',
            invSettings: 'id',
            invNotifications: 'id, type, instrumentId, dueDate, seen',
            // Company Profile singleton
            companyProfile: 'id',
        })

        // Version 15: Payroll / Deudas Sociales module
        this.version(15).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            taxObligations: 'id, &uniqueKey, taxType, taxPeriod, jurisdiction, status, dueDate',
            taxPayments: 'id, obligationId, journalEntryId, paidAt',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
            invInstruments: 'id, periodId, rubro, ticker, accountId',
            invMovements: 'id, periodId, date, rubro, type, instrumentId',
            invSettings: 'id',
            invNotifications: 'id, type, instrumentId, dueDate, seen',
            companyProfile: 'id',
            // Payroll / Deudas Sociales
            payrollEmployees: 'id, status',
            payrollSettings: 'id',
            payrollRuns: 'id, period, status',
            payrollLines: 'id, payrollRunId, employeeId',
            payrollPayments: 'id, payrollRunId, type, date',
        })

        // Version 16: Payroll Concepts catalog
        this.version(16).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup',
            entries: 'id, date, memo, sourceModule, sourceId',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            taxObligations: 'id, &uniqueKey, taxType, taxPeriod, jurisdiction, status, dueDate',
            taxPayments: 'id, obligationId, journalEntryId, paidAt',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
            invInstruments: 'id, periodId, rubro, ticker, accountId',
            invMovements: 'id, periodId, date, rubro, type, instrumentId',
            invSettings: 'id',
            invNotifications: 'id, type, instrumentId, dueDate, seen',
            companyProfile: 'id',
            payrollEmployees: 'id, status',
            payrollSettings: 'id',
            payrollRuns: 'id, period, status',
            payrollLines: 'id, payrollRunId, employeeId',
            payrollPayments: 'id, payrollRunId, type, date',
            payrollConcepts: 'id, kind, isActive, sortOrder',
        })

        // Version 17 (Fase 2A): empresa, ejercicio, período, ciclo de vida de
        // asientos, idempotencia, audit log y metadata de sistema.
        // Índices nuevos en entries para consultas por contexto contable.
        this.version(17).stores({
            accounts: 'id, &code, name, kind, parentId, level, statementGroup, companyId',
            entries: 'id, date, memo, sourceModule, sourceId, status, companyId, exerciseId, periodId, idempotencyKey, entryNumber, [companyId+exerciseId], [exerciseId+status]',
            settings: 'id',
            amortizationState: 'id',
            inventoryProducts: 'id, sku',
            inventoryMovements: 'id, date, productId, type',
            inventoryClosings: 'id, periodEnd, status',
            inventoryConfig: 'id',
            cierreValuacionState: 'id',
            bienesProducts: 'id, sku, category',
            bienesMovements: 'id, date, productId, type',
            bienesSettings: 'id',
            fxAccounts: 'id, type, currency, periodId',
            fxMovements: 'id, date, accountId, type, periodId',
            fxDebts: 'id, currency, creditor, createdAt, status, periodId, accountId',
            fxLiabilities: 'id, accountId, periodId',
            fxSettings: 'id',
            fxRatesCache: 'id',
            taxClosures: 'id, month, regime, status',
            taxDueNotifications: 'id, obligation, month, dueDate, seen',
            taxObligations: 'id, &uniqueKey, taxType, taxPeriod, jurisdiction, status, dueDate',
            taxPayments: 'id, obligationId, journalEntryId, paidAt',
            fixedAssets: 'id, periodId, category, status, accountId, contraAccountId',
            fixedAssetEvents: 'id, periodId, assetId, date, type',
            invInstruments: 'id, periodId, rubro, ticker, accountId',
            invMovements: 'id, periodId, date, rubro, type, instrumentId',
            invSettings: 'id',
            invNotifications: 'id, type, instrumentId, dueDate, seen',
            companyProfile: 'id',
            payrollEmployees: 'id, status',
            payrollSettings: 'id',
            payrollRuns: 'id, period, status',
            payrollLines: 'id, payrollRunId, employeeId',
            payrollPayments: 'id, payrollRunId, type, date',
            payrollConcepts: 'id, kind, isActive, sortOrder',
            // Fase 2A
            companies: 'id, active',
            exercises: 'id, companyId, startDate, endDate, status',
            periods: 'id, exerciseId, companyId, startDate, endDate, status',
            auditLog: 'id, eventType, entityType, entityId, companyId, exerciseId, timestamp',
            systemMeta: 'id',
        }).upgrade(migrateToV17)

        // Version 18 (Fase 2B): modelo monetario definitivo (integridad de
        // centavos) + registro versionado de índices de inflación.
        // Mismos stores que v17 + inflationIndexSets.
        this.version(18).stores({
            inflationIndexSets: 'id, status, createdAt',
        }).upgrade(migrateToV18)

        // Version 19 (Fase 2C): snapshots de reportes publicados.
        this.version(19).stores({
            reportSnapshots: 'id, companyId, exerciseId, status, createdAt',
        }).upgrade(migrateToV19)

        // Version 20 (Fase 2E): reglas versionadas de distribución de gastos
        // por función (anexo de gastos, §9.2).
        this.version(20).stores({
            expenseAllocationRules: 'id, accountId, validFrom',
        }).upgrade(migrateToV20)

        // Version 21 (Fase 2F): notas manuales persistentes y versionadas (§8).
        this.version(21).stores({
            manualDisclosures: 'id, companyId, exerciseId, noteType, status',
        }).upgrade(migrateToV21)

        // Version 22 (Fase 2G): política del EFE versionada por entidad (§6).
        this.version(22).stores({
            cashFlowPolicies: 'id, companyId, exerciseId, status',
        }).upgrade(migrateToV22)
    }
}

export const db = new ContableDatabase()

/**
 * Genera un ID único
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Limpia cuentas duplicadas por código (mantiene la más antigua)
 */
export async function cleanupDuplicateAccounts(): Promise<number> {
    const accounts = await db.accounts.orderBy('code').toArray()
    const seen = new Map<string, string>() // code -> first id
    const toDelete: string[] = []

    for (const account of accounts) {
        if (seen.has(account.code)) {
            // This is a duplicate - mark for deletion
            toDelete.push(account.id)
        } else {
            seen.set(account.code, account.id)
        }
    }

    if (toDelete.length > 0) {
        await db.accounts.bulkDelete(toDelete)
        console.log(`🧹 Cleaned up ${toDelete.length} duplicate accounts`)
    }

    return toDelete.length
}

/**
 * Verifica si hay duplicados por código
 */
export async function hasDuplicateCodes(): Promise<boolean> {
    const accounts = await db.accounts.toArray()
    const codes = accounts.map(a => a.code)
    return new Set(codes).size !== codes.length
}
