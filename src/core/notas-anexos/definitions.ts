/**
 * Notas y Anexos - Definitions
 *
 * Definiciones estándar de notas según modelo profesional argentino.
 */

import type { NoteDefinition, ExpenseAllocation } from './types'

// ============================================
// Definiciones de Notas a los EECC
// ============================================

/**
 * Notas estándar según modelo profesional (RT 8/9 adaptado)
 */
export const NOTE_DEFINITIONS: NoteDefinition[] = [
    {
        number: 4,
        title: 'Caja y Bancos',
        statementGroups: ['CASH_AND_BANKS'],
        sectionFilter: null,
        defaultNarrative: 'El saldo incluye efectivo en moneda nacional y depósitos en cuenta corriente bancaria sin restricciones de uso.',
    },
    {
        number: 5,
        title: 'Inversiones Temporarias',
        statementGroups: ['INVESTMENTS'],
        sectionFilter: 'CURRENT',
        defaultNarrative: 'Representa colocaciones de excedentes financieros a plazo fijo con vencimiento menor a 12 meses.',
    },
    {
        number: 6,
        title: 'Créditos por Ventas',
        statementGroups: ['TRADE_RECEIVABLES'],
        sectionFilter: null,
        defaultNarrative: 'Saldos a cobrar por la actividad comercial principal de la sociedad, netos de previsión para incobrables.',
    },
    {
        number: 7,
        title: 'Otros Créditos',
        statementGroups: ['OTHER_RECEIVABLES', 'TAX_CREDITS'],
        sectionFilter: null,
        defaultNarrative: 'Incluye anticipos a proveedores, créditos fiscales y otros conceptos no originados en la operatoria comercial.',
    },
    {
        number: 8,
        title: 'Bienes de Cambio',
        statementGroups: ['INVENTORIES'],
        sectionFilter: null,
        defaultNarrative: 'Valuados al costo de reposición o valor neto de realización, el menor.',
    },
    {
        number: 9,
        title: 'Bienes de Uso',
        statementGroups: ['PPE'],
        sectionFilter: null,
        defaultNarrative: 'Valuados a su costo de adquisición menos amortizaciones acumuladas. La depreciación se calcula por el método de línea recta.',
    },
    {
        number: 10,
        title: 'Deudas Comerciales',
        statementGroups: ['TRADE_PAYABLES'],
        sectionFilter: null,
        defaultNarrative: 'Obligaciones con proveedores locales por compra de bienes y servicios relacionados con la actividad.',
    },
    {
        number: 11,
        title: 'Préstamos',
        statementGroups: ['LOANS'],
        sectionFilter: null,
        hasCurrentNonCurrentBreakdown: true,
        defaultNarrative: 'Deudas financieras con entidades bancarias. Se exponen netas de intereses a devengar.',
    },
    {
        number: 12,
        title: 'Deudas Sociales',
        statementGroups: ['PAYROLL_LIABILITIES'],
        sectionFilter: null,
        defaultNarrative: 'Incluye remuneraciones devengadas pendientes de pago, cargas sociales y aportes retenidos a depositar.',
    },
    {
        number: 13,
        title: 'Deudas Fiscales',
        statementGroups: ['TAX_LIABILITIES'],
        sectionFilter: null,
        hasCurrentNonCurrentBreakdown: true,
        defaultNarrative: 'Saldos pendientes con organismos de recaudación nacional, provincial y municipal.',
    },
    {
        number: 15,
        title: 'Resultados Financieros y por Tenencia',
        statementGroups: ['FINANCIAL_INCOME', 'FINANCIAL_EXPENSES'],
        sectionFilter: null,
        defaultNarrative: 'Incluye intereses ganados y perdidos, diferencias de cambio, resultados por tenencia y gastos bancarios.',
    },
]

// ============================================
// Heurísticas para Asignación de Gastos
// ============================================

/**
 * Palabras clave para asignar gastos a COSTO
 */
const COST_KEYWORDS = [
    'flete',
    'combustible',
    'produccion',
    'producción',
    'fabricacion',
    'fabricación',
    'materia prima',
    'manufactura',
    'operario',
    'planta',
]

/**
 * Palabras clave para asignar gastos a COMERCIALIZACION
 */
const COMMERCIAL_KEYWORDS = [
    'publicidad',
    'propaganda',
    'comision',
    'comisión',
    'venta',
    'ventas',
    'marketing',
    'promocion',
    'promoción',
    'deudores incobrables',
    'ingresos brutos',
]

/**
 * Palabras clave para asignar gastos a ADMINISTRACION
 */
const ADMIN_KEYWORDS = [
    'honorarios',
    'administracion',
    'administración',
    'oficina',
    'servicios',
    'telefono',
    'teléfono',
    'alquiler',
    'seguro',
    'sueldo',
    'jornales',
    'cargas sociales',
    'impuesto',
    'tasa',
    'mantenimiento',
    'reparacion',
    'reparación',
    'amortizacion',
    'amortización',
    'gastos generales',
]

/**
 * Detecta asignación heurística basada en el nombre de la cuenta
 */
export function detectAllocationHeuristic(accountName: string): ExpenseAllocation {
    const name = accountName.toLowerCase()

    // Verificar keywords de costo
    const hasCostKeyword = COST_KEYWORDS.some(kw => name.includes(kw))
    if (hasCostKeyword) {
        return { costPct: 80, adminPct: 10, commercialPct: 10 }
    }

    // Verificar keywords de comercialización
    const hasCommercialKeyword = COMMERCIAL_KEYWORDS.some(kw => name.includes(kw))
    if (hasCommercialKeyword) {
        return { costPct: 0, adminPct: 10, commercialPct: 90 }
    }

    // Verificar keywords de administración
    const hasAdminKeyword = ADMIN_KEYWORDS.some(kw => name.includes(kw))
    if (hasAdminKeyword) {
        return { costPct: 0, adminPct: 100, commercialPct: 0 }
    }

    // Default: administración
    return { costPct: 0, adminPct: 100, commercialPct: 0 }
}

/**
 * Obtiene la nota por número
 */
export function getNoteDefinition(noteNumber: number): NoteDefinition | undefined {
    return NOTE_DEFINITIONS.find(n => n.number === noteNumber)
}

/**
 * Obtiene todas las notas
 */
export function getAllNoteDefinitions(): NoteDefinition[] {
    return NOTE_DEFINITIONS
}
