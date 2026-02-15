/**
 * Payroll / Deudas Sociales Module Types
 *
 * Entities for employee management, payroll concepts, templates,
 * payroll runs (liquidaciones), and payroll payments.
 */

// ─── Areas/Roles ────────────────────────────────────────────

export const DEFAULT_AREAS = ['Administracion', 'Ventas', 'Gerencia', 'Profesional'] as const

// ─── Employee ───────────────────────────────────────────────

export type EmployeeStatus = 'active' | 'inactive'
export type PayType = 'monthly' | 'hourly'

export interface Employee {
    id: string
    fullName: string
    cuil?: string
    startDate?: string // ISO YYYY-MM-DD
    status: EmployeeStatus
    payType: PayType
    baseGross: number
    category?: string
    position?: string
    area?: string // e.g. 'Administracion', 'Ventas'
    templateId?: TemplateType
    defaultPaymentAccountId?: string
    notes?: string
    createdAt: string
    updatedAt?: string
}

// ─── Payroll Settings ───────────────────────────────────────

export interface PayrollAccountMappings {
    sueldosYJornales?: string    // Expense account ID
    cargasSociales?: string      // Expense account ID
    sueldosAPagar?: string       // Liability account ID
    retencionesADepositar?: string // Liability account ID
    cargasSocialesAPagar?: string // Liability account ID
    anticiposAlPersonal?: string  // Asset account ID
}

export interface PayrollSettings {
    id: string // singleton: 'payroll-settings'
    defaultEmployeeWithholdRate: number
    defaultEmployerContribRate: number
    defaultArtRate: number
    dueDaySalary: number
    dueDaySocialSecurity: number
    accountMappings: PayrollAccountMappings
    onboardingCompleted?: boolean
    areas?: string[]
    defaultTemplate?: TemplateType
    defaultPaymentAccountId?: string
}

export const DEFAULT_PAYROLL_SETTINGS: Omit<PayrollSettings, 'id'> = {
    defaultEmployeeWithholdRate: 0.17,
    defaultEmployerContribRate: 0.2633,
    defaultArtRate: 0.025,
    dueDaySalary: 4,
    dueDaySocialSecurity: 11,
    accountMappings: {},
    areas: [...DEFAULT_AREAS],
    defaultTemplate: 'out_of_cct',
}

// ─── Payroll Concepts ───────────────────────────────────────

export type ConceptKind = 'earning' | 'deduction' | 'employer_contrib'
export type CalcMode = 'fixed_amount' | 'percent_of_base' | 'formula' | 'variable_input'
export type BaseRef = 'base_gross' | 'base_basic' | 'base_remunerative_sum'

export interface PayrollConcept {
    id: string
    name: string
    kind: ConceptKind
    calcMode: CalcMode
    formulaExpr?: string    // e.g. "0.01 * years * base"
    baseRef?: BaseRef
    defaultValue?: number
    defaultPercent?: number
    affectsEmployeeWithholds: boolean
    affectsEmployerContrib: boolean
    isActive: boolean
    sortOrder: number
    templateSource?: string
}

// ─── Payroll Templates ──────────────────────────────────────

export type TemplateType = 'out_of_cct' | 'cct_comercio_130_75'

export interface PayrollTemplateDefinition {
    id: TemplateType
    name: string
    description: string
    concepts: Omit<PayrollConcept, 'id' | 'isActive' | 'sortOrder' | 'templateSource'>[]
}

export const PAYROLL_TEMPLATES: PayrollTemplateDefinition[] = [
    {
        id: 'out_of_cct',
        name: 'Fuera de Convenio',
        description: 'Flexible. Sueldo basico + conceptos editables sin reglas de convenio.',
        concepts: [
            {
                name: 'Sueldo Basico',
                kind: 'earning',
                calcMode: 'fixed_amount',
                defaultValue: 0,
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Antiguedad',
                kind: 'earning',
                calcMode: 'formula',
                formulaExpr: '0.01 * years * base',
                baseRef: 'base_gross',
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Bonos / Comisiones',
                kind: 'earning',
                calcMode: 'variable_input',
                defaultValue: 0,
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Retenciones y Aportes (empleado)',
                kind: 'deduction',
                calcMode: 'percent_of_base',
                baseRef: 'base_remunerative_sum',
                affectsEmployeeWithholds: false,
                affectsEmployerContrib: false,
            },
            {
                name: 'Contribuciones Patronales',
                kind: 'employer_contrib',
                calcMode: 'percent_of_base',
                baseRef: 'base_remunerative_sum',
                affectsEmployeeWithholds: false,
                affectsEmployerContrib: false,
            },
        ],
    },
    {
        id: 'cct_comercio_130_75',
        name: 'Comercio (CCT 130/75)',
        description: 'Plantilla para empleados de comercio. Antiguedad 1% anual, presentismo opcional.',
        concepts: [
            {
                name: 'Sueldo Basico',
                kind: 'earning',
                calcMode: 'fixed_amount',
                defaultValue: 0,
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Antiguedad (1% anual)',
                kind: 'earning',
                calcMode: 'formula',
                formulaExpr: '0.01 * years * base',
                baseRef: 'base_gross',
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Presentismo',
                kind: 'earning',
                calcMode: 'percent_of_base',
                baseRef: 'base_gross',
                defaultPercent: 0.0833,
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Comisiones',
                kind: 'earning',
                calcMode: 'variable_input',
                defaultValue: 0,
                affectsEmployeeWithholds: true,
                affectsEmployerContrib: true,
            },
            {
                name: 'Retenciones y Aportes (empleado)',
                kind: 'deduction',
                calcMode: 'percent_of_base',
                baseRef: 'base_remunerative_sum',
                affectsEmployeeWithholds: false,
                affectsEmployerContrib: false,
            },
            {
                name: 'Contribuciones Patronales',
                kind: 'employer_contrib',
                calcMode: 'percent_of_base',
                baseRef: 'base_remunerative_sum',
                affectsEmployeeWithholds: false,
                affectsEmployerContrib: false,
            },
        ],
    },
]

// ─── Payroll Line Detail (concept breakdown) ────────────────

export interface PayrollLineDetail {
    conceptId: string
    conceptName: string
    kind: ConceptKind
    baseAmount: number
    rate?: number
    amount: number
    formulaExpr?: string
    editable: boolean
}

// ─── Payroll Run (Liquidation) ──────────────────────────────

export type PayrollRunStatus = 'draft' | 'posted' | 'paid' | 'partial'

export interface PayrollRun {
    id: string
    period: string
    accrualDate: string
    status: PayrollRunStatus
    grossTotal: number
    employeeWithholdTotal: number
    employerContribTotal: number
    netTotal: number
    advancesAppliedTotal: number
    journalEntryId?: string
    salaryPaid: number
    socialSecurityPaid: number
    createdAt: string
    updatedAt?: string
}

// ─── Payroll Line (per employee per run) ────────────────────

export interface PayrollLine {
    id: string
    payrollRunId: string
    employeeId: string
    gross: number
    employeeWithholds: number
    employerContrib: number
    advancesApplied: number
    otherDeductions: number
    net: number
    conceptBreakdown?: PayrollLineDetail[]
    overrideGross?: boolean
    overrideWithholds?: boolean
    overrideContrib?: boolean
}

// ─── Payroll Payment ────────────────────────────────────────

export type PayrollPaymentType = 'salary' | 'social_security'

export interface PaymentSplit {
    accountId: string
    amount: number
}

export interface PayrollPayment {
    id: string
    payrollRunId: string
    type: PayrollPaymentType
    date: string
    amount: number
    splits: PaymentSplit[]
    journalEntryId?: string
    note?: string
    createdAt: string
}

// ─── Account Fallbacks (for resolution) ─────────────────────

export const PAYROLL_ACCOUNT_FALLBACKS: Record<string, { codes: string[]; names: string[] }> = {
    sueldosYJornales: {
        codes: ['5.2.01', '5.2.01.01'],
        names: ['Sueldos y Jornales', 'Sueldos', 'Remuneraciones'],
    },
    cargasSociales: {
        codes: ['5.2.02', '5.2.02.01'],
        names: ['Cargas Sociales', 'Contribuciones Patronales', 'Contribuciones Sociales'],
    },
    sueldosAPagar: {
        codes: ['2.1.03.01', '2.1.03'],
        names: ['Sueldos a Pagar', 'Sueldos y Jornales a Pagar', 'Remuneraciones a Pagar'],
    },
    retencionesADepositar: {
        codes: ['2.1.03.02', '2.1.04.01'],
        names: ['Retenciones a Depositar', 'Aportes a Depositar', 'Retenciones y Aportes a Depositar', 'Aportes y Retenciones a Depositar'],
    },
    cargasSocialesAPagar: {
        codes: ['2.1.03.03', '2.1.04.02'],
        names: ['Cargas Sociales a Pagar', 'Contribuciones a Pagar', 'Contribuciones Patronales a Pagar'],
    },
    anticiposAlPersonal: {
        codes: ['1.1.04.01', '1.1.02.03'],
        names: ['Anticipos al Personal', 'Anticipos de Sueldos', 'Adelantos al Personal'],
    },
}
