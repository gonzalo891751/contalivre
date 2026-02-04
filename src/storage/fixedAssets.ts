/**
 * Fixed Assets (Bienes de Uso) - Storage Module
 *
 * CRUD operations and journal entry generation for fixed assets.
 * Follows the same patterns as bienes.ts for consistency.
 */

import { db } from './db'
import { createEntry, updateEntry } from './entries'
import { createAccount, generateNextCode } from './accounts'
import type { Account, JournalEntry, EntryLine } from '../core/models'
import { resolveOpeningEquityAccountId } from './openingEquity'
import {
    type FixedAsset,
    type FixedAssetCategory,
    type FixedAssetCalculation,
    type FixedAssetEvent,
    generateFixedAssetId,
    generateFixedAssetEventId,
    DEPRECIATION_EXPENSE_CODE,
} from '../core/fixedAssets/types'

const OPENING_BALANCE_TAG = 'opening_balance'
const OPENING_BALANCE_NAME = 'Apertura / Saldos Iniciales'
const DISPOSAL_RESULT_ACCOUNT_CODE = '4.7.04'
const DISPOSAL_RESULT_ACCOUNT_NAMES = [
    'Resultado venta bienes de uso',
    'Resultado venta bien de uso',
    'Resultado venta de bienes de uso',
]
const DAMAGE_EXPENSE_ACCOUNT_CODE = '4.7.03'
const DAMAGE_EXPENSE_ACCOUNT_NAMES = ['Obsolescencia bienes de uso', 'Deterioro bienes de uso']
const REVALUATION_RESERVE_CODE = '3.2.05'
const REVALUATION_RESERVE_NAMES = ['Reserva por revaluo', 'Reserva por revalúo']
const RECPAM_ACCOUNT_CODE = '4.6.05'
const IVA_CF_CODE = '1.1.03.01'
const IVA_CF_NAMES = ['IVA Credito Fiscal', 'IVA Crédito Fiscal']

const buildFixedAssetOpeningExternalId = (fiscalYear: number, assetId: string) =>
    `FA_OPENING:${fiscalYear}:${assetId}`

const buildFixedAssetAcquisitionExternalId = (assetId: string) =>
    `FA_ACQUISITION:${assetId}`

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const findAccountByCodeOrName = (
    accounts: Account[],
    options: { codes?: string[]; names?: string[]; nameIncludes?: string[]; kind?: Account['kind'] }
) => {
    const byCode =
        options.codes?.length && accounts.find(a => options.codes?.includes(a.code))
    if (byCode) return byCode
    const byName =
        options.names?.length &&
        accounts.find(a =>
            options.names?.some(name => normalizeText(a.name) === normalizeText(name))
        )
    if (byName) return byName
    const byInclude =
        options.nameIncludes?.length &&
        accounts.find(a => {
            const normalized = normalizeText(a.name)
            return options.nameIncludes?.some(token =>
                normalized.includes(normalizeText(token))
            )
        })
    if (byInclude) return byInclude
    if (options.kind) {
        return accounts.find(a => a.kind === options.kind && !a.isHeader)
    }
    return null
}

async function ensureOpeningBalanceAccount(
    accounts: Account[]
): Promise<{ account?: Account; warning?: string; error?: string }> {
    const resolvedId = resolveOpeningEquityAccountId(accounts)
    if (resolvedId) {
        const resolved = accounts.find(a => a.id === resolvedId)
        if (resolved) return { account: resolved }
    }

    const byTag = accounts.find(
        a => a.kind === 'EQUITY' && a.tags?.includes(OPENING_BALANCE_TAG)
    )
    if (byTag) return { account: byTag }

    const byName = findAccountByCodeOrName(accounts, {
        names: [OPENING_BALANCE_NAME],
        nameIncludes: ['apertura', 'saldos iniciales'],
    })
    if (byName) return { account: byName }

    const parent =
        accounts.find(
            a =>
                a.kind === 'EQUITY' &&
                a.isHeader &&
                normalizeText(a.name).includes('resultados acumulados')
        ) ||
        accounts.find(a => a.kind === 'EQUITY' && a.isHeader) ||
        accounts.find(a => a.kind === 'EQUITY')

    if (!parent) {
        return { error: 'No existe una cuenta de Patrimonio Neto para crear Apertura.' }
    }

    try {
        const code = await generateNextCode(parent.id)
        const created = await createAccount({
            code,
            name: OPENING_BALANCE_NAME,
            kind: 'EQUITY',
            section: parent.section || 'CURRENT',
            group: parent.group || 'Resultados acumulados',
            statementGroup: parent.statementGroup || 'RETAINED_EARNINGS',
            parentId: parent.id,
            normalSide: 'CREDIT',
            isContra: false,
            isHeader: false,
            tags: [OPENING_BALANCE_TAG],
        })
        return { account: created, warning: 'Cuenta Apertura creada automáticamente.' }
    } catch (err) {
        const fallback = findAccountByCodeOrName(accounts, {
            codes: ['3.3.01', '3.3'],
            nameIncludes: ['resultados no asignados', 'resultados acumulados'],
            kind: 'EQUITY',
        })
        if (fallback) {
            return {
                account: fallback,
                warning: 'No se pudo crear Apertura. Usando cuenta de resultados acumulados.',
            }
        }
        return {
            error:
                err instanceof Error
                    ? err.message
                    : 'No se pudo crear la cuenta de Apertura.',
        }
    }
}

function resolveDisposalResultAccount(accounts: Account[]): Account | null {
    return (
        findAccountByCodeOrName(accounts, {
            codes: [DISPOSAL_RESULT_ACCOUNT_CODE],
            names: DISPOSAL_RESULT_ACCOUNT_NAMES,
            nameIncludes: ['resultado venta bienes', 'venta bienes de uso'],
        }) || null
    )
}

function resolveRevaluationReserveAccount(accounts: Account[]): Account | null {
    return (
        findAccountByCodeOrName(accounts, {
            codes: [REVALUATION_RESERVE_CODE],
            names: REVALUATION_RESERVE_NAMES,
            nameIncludes: ['reserva por revaluo', 'reserva por revalúo'],
        }) || null
    )
}

function resolveDamageExpenseAccount(accounts: Account[]): Account | null {
    return (
        findAccountByCodeOrName(accounts, {
            codes: [DAMAGE_EXPENSE_ACCOUNT_CODE],
            names: DAMAGE_EXPENSE_ACCOUNT_NAMES,
            nameIncludes: ['obsolescencia bienes de uso', 'deterioro bienes de uso'],
        }) || null
    )
}

function resolveRecpamAccount(accounts: Account[]): Account | null {
    return (
        findAccountByCodeOrName(accounts, {
            codes: [RECPAM_ACCOUNT_CODE],
            nameIncludes: ['recpam', 'resultado por exposicion', 'inflacion'],
        }) || null
    )
}

function resolveIvaCFAccount(accounts: Account[]): Account | null {
    return (
        findAccountByCodeOrName(accounts, {
            codes: [IVA_CF_CODE],
            names: IVA_CF_NAMES,
            nameIncludes: ['iva credito', 'iva cf'],
        }) || null
    )
}

// ========================================
// CRUD Operations
// ========================================

/**
 * Get all fixed assets, optionally filtered by period
 */
export async function getAllFixedAssets(periodId?: string): Promise<FixedAsset[]> {
    const assets = await db.fixedAssets.toArray()
    if (!periodId) return assets
    return assets.filter(a => a.periodId === periodId || !a.periodId)
}

/**
 * Get a fixed asset by ID
 */
export async function getFixedAssetById(id: string): Promise<FixedAsset | undefined> {
    return db.fixedAssets.get(id)
}

/**
 * Get fixed assets by status
 */
export async function getFixedAssetsByStatus(
    status: FixedAsset['status'],
    periodId?: string
): Promise<FixedAsset[]> {
    let assets = await db.fixedAssets.where('status').equals(status).toArray()
    if (periodId) {
        assets = assets.filter(a => a.periodId === periodId || !a.periodId)
    }
    return assets
}

/**
 * Get fixed assets by category
 */
export async function getFixedAssetsByCategory(
    category: FixedAssetCategory,
    periodId?: string
): Promise<FixedAsset[]> {
    let assets = await db.fixedAssets.where('category').equals(category).toArray()
    if (periodId) {
        assets = assets.filter(a => a.periodId === periodId || !a.periodId)
    }
    return assets
}

/**
 * Create a new fixed asset
 */
export async function createFixedAsset(
    data: Omit<FixedAsset, 'id' | 'createdAt' | 'updatedAt' | 'linkedJournalEntryIds'>
): Promise<FixedAsset> {
    const now = new Date().toISOString()
    const asset: FixedAsset = {
        ...data,
        id: generateFixedAssetId(),
        linkedJournalEntryIds: [],
        createdAt: now,
        updatedAt: now,
    }
    await db.fixedAssets.add(asset)
    return asset
}

/**
 * Update an existing fixed asset
 */
export async function updateFixedAsset(
    id: string,
    updates: Partial<Omit<FixedAsset, 'id' | 'createdAt'>>
): Promise<FixedAsset> {
    const existing = await db.fixedAssets.get(id)
    if (!existing) {
        throw new Error('Bien de uso no encontrado')
    }

    const updated: FixedAsset = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    }
    await db.fixedAssets.put(updated)
    return updated
}

/**
 * Delete a fixed asset (only if no linked entries)
 */
export async function deleteFixedAsset(id: string): Promise<{ success: boolean; error?: string }> {
    const asset = await db.fixedAssets.get(id)
    if (!asset) {
        return { success: false, error: 'Bien de uso no encontrado' }
    }

    // Check for linked journal entries
    if (asset.linkedJournalEntryIds.length > 0) {
        return {
            success: false,
            error: `Este bien tiene ${asset.linkedJournalEntryIds.length} asiento(s) vinculado(s). Eliminalos primero.`,
        }
    }

    await db.fixedAssets.delete(id)
    return { success: true }
}

// ========================================
// Events CRUD
// ========================================

/**
 * Get events for a fixed asset
 */
export async function getFixedAssetEvents(
    assetId: string,
    periodId?: string
): Promise<FixedAssetEvent[]> {
    let events = await db.fixedAssetEvents.where('assetId').equals(assetId).toArray()
    if (periodId) {
        events = events.filter(e => e.periodId === periodId || !e.periodId)
    }
    return events.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Create a new fixed asset event
 */
export async function createFixedAssetEvent(
    data: Omit<FixedAssetEvent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<FixedAssetEvent> {
    const now = new Date().toISOString()
    const event: FixedAssetEvent = {
        ...data,
        id: generateFixedAssetEventId(),
        createdAt: now,
        updatedAt: now,
    }
    await db.fixedAssetEvents.add(event)
    return event
}

/**
 * Update an existing fixed asset event
 */
export async function updateFixedAssetEvent(
    id: string,
    updates: Partial<Omit<FixedAssetEvent, 'id' | 'createdAt'>>
): Promise<FixedAssetEvent> {
    const existing = await db.fixedAssetEvents.get(id)
    if (!existing) {
        throw new Error('Evento no encontrado')
    }

    const updated: FixedAssetEvent = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    }
    await db.fixedAssetEvents.put(updated)
    return updated
}

/**
 * Delete a fixed asset event
 */
export async function deleteFixedAssetEvent(id: string): Promise<void> {
    await db.fixedAssetEvents.delete(id)
}

// ========================================
// Depreciation Calculations
// ========================================

/**
 * Calculate depreciation values for a fixed asset
 */
export function calculateFixedAssetDepreciation(
    asset: FixedAsset,
    fiscalYear: number
): FixedAssetCalculation {
    const C = asset.originalValue
    const residualPct = asset.residualValuePct ?? 0
    const VR = C * (residualPct / 100)
    const VA = Math.max(0, C - VR)

    // Non-depreciable assets (Terrenos or method='none')
    if (asset.method === 'none' || asset.category === 'Terrenos') {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionAnual: 0,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            valorLibro: C,
            porcentajeDesgaste: 0,
            estado: 'NO_AMORTIZA',
        }
    }

    // Assets in progress (not yet in service)
    if (asset.status === 'in_progress') {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionAnual: 0,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            valorLibro: C,
            porcentajeDesgaste: 0,
            estado: 'EN_PROYECTO',
        }
    }

    // Parse dates
    const acquisitionDate = new Date(asset.placedInServiceDate || asset.acquisitionDate)
    const fiscalYearEnd = new Date(fiscalYear, 11, 31)
    const fiscalYearStart = new Date(fiscalYear, 0, 1)

    // If asset was acquired after fiscal year end, no depreciation
    if (acquisitionDate > fiscalYearEnd) {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionAnual: 0,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            valorLibro: C,
            porcentajeDesgaste: 0,
            estado: 'ACTIVO',
        }
    }

    let amortizacionAnual = 0
    let acumuladaInicio = 0
    let amortizacionEjercicio = 0

    if (asset.method === 'units') {
        // Units of production method
        const lifeUnits = asset.lifeUnits || 0
        const unitsUsed = asset.unitsUsedThisPeriod || 0

        if (lifeUnits > 0) {
            const perUnitDepreciation = VA / lifeUnits
            amortizacionAnual = perUnitDepreciation * unitsUsed
            amortizacionEjercicio = amortizacionAnual
            // For units method, accumulated is harder to track without historical data
            // This would need a more complete implementation with usage tracking
        }
    } else {
        // Lineal methods
        const lifeYears = asset.lifeYears || 1
        amortizacionAnual = VA / lifeYears

        const acquisitionYear = acquisitionDate.getFullYear()
        const yearsActive = fiscalYear - acquisitionYear + 1
        const yearsPrev = Math.max(0, yearsActive - 1)

        if (asset.method === 'lineal-month') {
            // Monthly proration
            const monthlyAmort = amortizacionAnual / 12

            // Calculate months in previous years
            if (acquisitionDate < fiscalYearStart) {
                const prevYearEnd = new Date(fiscalYear - 1, 11, 31)
                const monthsPrev = calculateMonthsBetween(acquisitionDate, prevYearEnd) + 1
                const lifeMonths = lifeYears * 12
                acumuladaInicio = Math.min(monthsPrev, lifeMonths) * monthlyAmort
            }

            // Calculate months in current year
            const startDate = acquisitionDate > fiscalYearStart ? acquisitionDate : fiscalYearStart
            const monthsThisYear = calculateMonthsBetween(startDate, fiscalYearEnd) + 1
            const remainingLife = Math.max(0, (lifeYears * 12) - (acumuladaInicio / monthlyAmort))
            const monthsToDepreciate = Math.min(monthsThisYear, remainingLife)
            amortizacionEjercicio = monthsToDepreciate * monthlyAmort
        } else {
            // Annual (lineal-year)
            acumuladaInicio = Math.min(yearsPrev, lifeYears) * amortizacionAnual

            if (yearsActive <= lifeYears && yearsActive > 0) {
                amortizacionEjercicio = amortizacionAnual
            }
        }
    }

    // Clamp values
    acumuladaInicio = Math.min(acumuladaInicio, VA)
    const acumuladaCierre = Math.min(acumuladaInicio + amortizacionEjercicio, VA)
    amortizacionEjercicio = acumuladaCierre - acumuladaInicio
    const valorLibro = C - acumuladaCierre
    const porcentajeDesgaste = VA > 0 ? (acumuladaCierre / VA) * 100 : 0

    const estado = acumuladaCierre >= VA - 0.01 ? 'AMORTIZADO' : 'ACTIVO'

    return {
        valorResidual: VR,
        valorAmortizable: VA,
        amortizacionAnual,
        amortizacionEjercicio,
        acumuladaInicio,
        acumuladaCierre,
        valorLibro,
        porcentajeDesgaste,
        estado,
    }
}

export interface FixedAssetCalculationWithEvents extends FixedAssetCalculation {
    valorOrigenAjustado: number
}

function getRemainingLifeYearsForImprovement(asset: FixedAsset, eventDate: Date): number {
    const baseDate = new Date(asset.placedInServiceDate || asset.acquisitionDate)
    const elapsedYears = eventDate.getFullYear() - baseDate.getFullYear()
    const remaining = (asset.lifeYears || 1) - elapsedYears
    return Math.max(1, remaining)
}

/**
 * Calculate depreciation values including improvement events
 * Plan B: treat each improvement as a separate component with remaining life.
 */
export function calculateFixedAssetDepreciationWithEvents(
    asset: FixedAsset,
    fiscalYear: number,
    events: FixedAssetEvent[] = []
): FixedAssetCalculationWithEvents {
    const base = calculateFixedAssetDepreciation(asset, fiscalYear)
    const fiscalYearEnd = new Date(fiscalYear, 11, 31)

    const improvements = events.filter(
        e => e.type === 'IMPROVEMENT' && new Date(e.date) <= fiscalYearEnd && e.amount > 0
    )

    if (improvements.length === 0) {
        return { ...base, valorOrigenAjustado: asset.originalValue }
    }

    let totalCost = asset.originalValue
    let totalValorResidual = base.valorResidual
    let totalValorAmortizable = base.valorAmortizable
    let totalAmortizacionAnual = base.amortizacionAnual
    let totalAmortizacionEjercicio = base.amortizacionEjercicio
    let totalAcumuladaInicio = base.acumuladaInicio
    let totalAcumuladaCierre = base.acumuladaCierre
    let totalValorLibro = base.valorLibro

    improvements.forEach(event => {
        const eventDate = new Date(event.date)
        const component: FixedAsset = {
            ...asset,
            originalValue: event.amount,
            residualValuePct: 0,
            acquisitionDate: event.date,
            placedInServiceDate: event.date,
            lifeYears: getRemainingLifeYearsForImprovement(asset, eventDate),
        }
        const calc = calculateFixedAssetDepreciation(component, fiscalYear)
        totalCost += event.amount
        totalValorResidual += calc.valorResidual
        totalValorAmortizable += calc.valorAmortizable
        totalAmortizacionAnual += calc.amortizacionAnual
        totalAmortizacionEjercicio += calc.amortizacionEjercicio
        totalAcumuladaInicio += calc.acumuladaInicio
        totalAcumuladaCierre += calc.acumuladaCierre
        totalValorLibro += calc.valorLibro
    })

    const porcentajeDesgaste =
        totalValorAmortizable > 0 ? (totalAcumuladaCierre / totalValorAmortizable) * 100 : 0
    const estado =
        totalValorAmortizable > 0 && totalAcumuladaCierre >= totalValorAmortizable - 0.01
            ? 'AMORTIZADO'
            : base.estado

    return {
        valorResidual: totalValorResidual,
        valorAmortizable: totalValorAmortizable,
        amortizacionAnual: totalAmortizacionAnual,
        amortizacionEjercicio: totalAmortizacionEjercicio,
        acumuladaInicio: totalAcumuladaInicio,
        acumuladaCierre: totalAcumuladaCierre,
        valorLibro: totalValorLibro,
        porcentajeDesgaste,
        estado,
        valorOrigenAjustado: totalCost,
    }
}

/**
 * Calculate months between two dates
 */
function calculateMonthsBetween(from: Date, to: Date): number {
    if (from >= to) return 0
    const yearDiff = to.getFullYear() - from.getFullYear()
    const monthDiff = to.getMonth() - from.getMonth()
    let months = yearDiff * 12 + monthDiff
    if (from.getDate() > to.getDate()) {
        months--
    }
    return Math.max(0, months)
}

/**
 * Calculate depreciation values up to a specific date (monthly proration)
 */
export function calculateFixedAssetDepreciationToDate(
    asset: FixedAsset,
    asOfDate: Date
): FixedAssetCalculation {
    const C = asset.originalValue
    const residualPct = asset.residualValuePct ?? 0
    const VR = C * (residualPct / 100)
    const VA = Math.max(0, C - VR)

    if (asset.method === 'none' || asset.category === 'Terrenos') {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionAnual: 0,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            valorLibro: C,
            porcentajeDesgaste: 0,
            estado: 'NO_AMORTIZA',
        }
    }

    if (asset.status === 'in_progress') {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionAnual: 0,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            valorLibro: C,
            porcentajeDesgaste: 0,
            estado: 'EN_PROYECTO',
        }
    }

    const acquisitionDate = new Date(asset.placedInServiceDate || asset.acquisitionDate)
    if (acquisitionDate > asOfDate) {
        return {
            valorResidual: VR,
            valorAmortizable: VA,
            amortizacionAnual: 0,
            amortizacionEjercicio: 0,
            acumuladaInicio: 0,
            acumuladaCierre: 0,
            valorLibro: C,
            porcentajeDesgaste: 0,
            estado: 'ACTIVO',
        }
    }

    const lifeYears = asset.lifeYears || 1
    const amortizacionAnual = VA / lifeYears
    const monthlyAmort = amortizacionAnual / 12

    const fiscalYearStart = new Date(asOfDate.getFullYear(), 0, 1)
    const prevYearEnd = new Date(asOfDate.getFullYear() - 1, 11, 31)
    let acumuladaInicio = 0

    if (acquisitionDate < fiscalYearStart) {
        const monthsPrev = calculateMonthsBetween(acquisitionDate, prevYearEnd) + 1
        const lifeMonths = lifeYears * 12
        acumuladaInicio = Math.min(monthsPrev, lifeMonths) * monthlyAmort
    }

    const startDate = acquisitionDate > fiscalYearStart ? acquisitionDate : fiscalYearStart
    const monthsThisYear = calculateMonthsBetween(startDate, asOfDate) + 1
    const remainingLife = Math.max(0, (lifeYears * 12) - (acumuladaInicio / monthlyAmort))
    const monthsToDepreciate = Math.min(monthsThisYear, remainingLife)
    let amortizacionEjercicio = monthsToDepreciate * monthlyAmort

    acumuladaInicio = Math.min(acumuladaInicio, VA)
    const acumuladaCierre = Math.min(acumuladaInicio + amortizacionEjercicio, VA)
    amortizacionEjercicio = acumuladaCierre - acumuladaInicio
    const valorLibro = C - acumuladaCierre
    const porcentajeDesgaste = VA > 0 ? (acumuladaCierre / VA) * 100 : 0
    const estado = acumuladaCierre >= VA - 0.01 ? 'AMORTIZADO' : 'ACTIVO'

    return {
        valorResidual: VR,
        valorAmortizable: VA,
        amortizacionAnual,
        amortizacionEjercicio,
        acumuladaInicio,
        acumuladaCierre,
        valorLibro,
        porcentajeDesgaste,
        estado,
    }
}

function getImprovementEventsUpToDate(
    events: FixedAssetEvent[],
    asOfDate: Date
): FixedAssetEvent[] {
    return events.filter(
        e => e.type === 'IMPROVEMENT' && new Date(e.date) <= asOfDate && e.amount > 0
    )
}

function calculateAccumulatedWithImprovementsToDate(
    asset: FixedAsset,
    events: FixedAssetEvent[],
    asOfDate: Date
): number {
    const base = calculateFixedAssetDepreciationToDate(asset, asOfDate)
    let total = base.acumuladaCierre
    const improvements = getImprovementEventsUpToDate(events, asOfDate)
    improvements.forEach(event => {
        const eventDate = new Date(event.date)
        const component: FixedAsset = {
            ...asset,
            originalValue: event.amount,
            residualValuePct: 0,
            acquisitionDate: event.date,
            placedInServiceDate: event.date,
            lifeYears: getRemainingLifeYearsForImprovement(asset, eventDate),
        }
        const calc = calculateFixedAssetDepreciationToDate(component, asOfDate)
        total += calc.acumuladaCierre
    })
    return total
}

function calculateCostWithImprovements(
    asset: FixedAsset,
    events: FixedAssetEvent[],
    asOfDate: Date
): number {
    const improvements = getImprovementEventsUpToDate(events, asOfDate)
    const totalImprovements = improvements.reduce((sum, event) => sum + event.amount, 0)
    return asset.originalValue + totalImprovements
}

// ========================================
// Acquisition Entry (Purchase)
// ========================================

async function findAcquisitionEntryByMeta(
    assetId: string
): Promise<JournalEntry | undefined> {
    const entries = await db.entries.toArray()
    return entries.find(e => {
        const meta = e.metadata?.meta
        return (
            e.sourceModule === 'fixed-assets' &&
            e.sourceType === 'acquisition' &&
            meta?.source === 'fixedAssets' &&
            meta?.kind === 'acquisition' &&
            meta?.assetId === assetId
        )
    })
}

/**
 * Build acquisition (purchase) journal entry for a fixed asset
 *
 * Typical entry with VAT:
 *   Debit: Asset account (net amount)
 *   Debit: IVA Credito Fiscal (VAT amount)
 *   Credit: Payment accounts (splits - Bancos, Proveedores, etc.)
 *
 * Without VAT (IVA as cost):
 *   Debit: Asset account (total amount)
 *   Credit: Payment accounts (splits)
 */
export async function buildFixedAssetAcquisitionEntry(
    asset: FixedAsset
): Promise<JournalBuildResult> {
    if (!asset.acquisition) {
        return { entry: null, error: 'No hay datos de adquisicion.' }
    }

    const acq = asset.acquisition
    if (!acq.splits || acq.splits.length === 0) {
        return { entry: null, error: 'Debe agregar al menos una contrapartida de pago.' }
    }

    const accounts = await db.accounts.toArray()
    const assetAccount = accounts.find(a => a.id === asset.accountId)
    const ivaCFAccount = resolveIvaCFAccount(accounts)

    if (!assetAccount) {
        return { entry: null, error: 'Falta cuenta del activo vinculada al bien.' }
    }

    // Validate splits sum
    const splitsTotal = round2(acq.splits.reduce((sum, s) => sum + s.amount, 0))
    if (Math.abs(splitsTotal - acq.totalAmount) > 0.01) {
        return {
            entry: null,
            error: `Las contrapartidas (${splitsTotal.toFixed(2)}) no suman el total (${acq.totalAmount.toFixed(2)}).`
        }
    }

    // Validate split accounts exist
    for (const split of acq.splits) {
        const splitAccount = accounts.find(a => a.id === split.accountId)
        if (!splitAccount) {
            return { entry: null, error: `Cuenta de contrapartida no encontrada: ${split.accountId}` }
        }
    }

    const lines: EntryLine[] = []

    if (acq.withVat && acq.vatAmount > 0) {
        // With VAT discrimination
        if (!ivaCFAccount) {
            return { entry: null, error: 'Falta cuenta IVA Credito Fiscal (1.1.03.01) en Plan de Cuentas.' }
        }

        // Debit: Asset (net)
        lines.push({
            accountId: assetAccount.id,
            debit: round2(acq.netAmount),
            credit: 0,
            description: `Alta ${asset.name}`,
        })

        // Debit: IVA CF
        lines.push({
            accountId: ivaCFAccount.id,
            debit: round2(acq.vatAmount),
            credit: 0,
            description: 'IVA Credito Fiscal',
        })
    } else {
        // Without VAT (IVA as cost) or no VAT
        lines.push({
            accountId: assetAccount.id,
            debit: round2(acq.totalAmount),
            credit: 0,
            description: `Alta ${asset.name}`,
        })
    }

    // Credit: Payment splits
    for (const split of acq.splits) {
        lines.push({
            accountId: split.accountId,
            debit: 0,
            credit: round2(split.amount),
            description: split.description || 'Pago adquisicion',
        })
    }

    const docRef = acq.docType && acq.docNumber
        ? ` - ${acq.docType} ${acq.docNumber}`
        : ''

    return {
        entry: {
            date: acq.date,
            memo: `Alta Bien de Uso - ${asset.name}${docRef}`,
            lines,
            sourceModule: 'fixed-assets',
            sourceId: asset.id,
            sourceType: 'acquisition',
            createdAt: new Date().toISOString(),
            metadata: {
                journalRole: 'acquisition',
                assetId: asset.id,
                assetName: asset.name,
                externalId: buildFixedAssetAcquisitionExternalId(asset.id),
                meta: {
                    source: 'fixedAssets',
                    kind: 'acquisition',
                    assetId: asset.id,
                    periodId: asset.periodId,
                },
            },
        },
    }
}

/**
 * Sync (create or update) acquisition journal entry for a fixed asset
 */
export async function syncFixedAssetAcquisitionEntry(
    asset: FixedAsset
): Promise<{ success: boolean; entryId?: string; error?: string; status?: 'generated' | 'updated' | 'skipped' }> {
    if (asset.originType === 'OPENING') {
        return { success: false, status: 'skipped', error: 'Este bien es de apertura, no tiene asiento de compra.' }
    }

    if (!asset.acquisition) {
        return { success: false, status: 'skipped', error: 'No hay datos de adquisicion.' }
    }

    const { entry, error } = await buildFixedAssetAcquisitionEntry(asset)
    if (!entry) {
        return { success: false, error: error || 'No se pudo generar el asiento de adquisicion.' }
    }

    let existing: JournalEntry | undefined
    if (asset.acquisitionJournalEntryId) {
        existing = await db.entries.get(asset.acquisitionJournalEntryId)
    }
    if (!existing) {
        existing = await findAcquisitionEntryByMeta(asset.id)
    }

    if (existing) {
        await updateEntry(existing.id, entry)
        if (asset.acquisitionJournalEntryId !== existing.id) {
            await updateFixedAsset(asset.id, { acquisitionJournalEntryId: existing.id })
        }
        return { success: true, entryId: existing.id, status: 'updated' }
    }

    const created = await createEntry(entry)
    await updateFixedAsset(asset.id, { acquisitionJournalEntryId: created.id })
    return { success: true, entryId: created.id, status: 'generated' }
}

// ========================================
// Opening Entry
// ========================================

async function findOpeningEntryByMeta(
    assetId: string,
    periodId: string,
    fiscalYear: number
): Promise<JournalEntry | undefined> {
    const entries = await db.entries.toArray()
    return entries.find(e => {
        const meta = e.metadata?.meta
        return (
            e.sourceModule === 'fixed-assets' &&
            e.sourceType === 'opening' &&
            meta?.source === 'fixedAssets' &&
            meta?.kind === 'opening' &&
            meta?.assetId === assetId &&
            meta?.periodId === periodId &&
            meta?.fiscalYear === fiscalYear
        )
    })
}

/**
 * Build opening entry for a fixed asset
 *
 * Logic:
 * - originType=PURCHASE + acquisitionDate in current year → no opening (use acquisition entry)
 * - originType=OPENING → always generate opening with opening.initialAccumDep
 * - No originType (legacy) → use date-based logic for backwards compatibility
 */
export async function buildFixedAssetOpeningEntry(
    asset: FixedAsset,
    fiscalYear: number
): Promise<JournalBuildResult> {
    const fiscalYearStart = new Date(fiscalYear, 0, 1)
    const acquisitionDate = new Date(asset.acquisitionDate)
    const isCurrentYearAsset = acquisitionDate >= fiscalYearStart

    // Determine if this asset needs an opening entry
    const originType = asset.originType || (isCurrentYearAsset ? 'PURCHASE' : 'OPENING')

    if (originType === 'PURCHASE' && isCurrentYearAsset) {
        return { entry: null, error: 'Este bien es una compra del ejercicio; ver asiento de adquisicion.' }
    }

    // For OPENING assets or legacy assets from previous years
    const valorOrigen = round2(asset.originalValue)

    // Calculate accumulated depreciation
    let amortAcumulada: number
    if (asset.opening?.initialAccumDep !== undefined && asset.opening.initialAccumDep > 0) {
        // Use explicitly provided initial accumulated depreciation
        amortAcumulada = round2(asset.opening.initialAccumDep)
    } else {
        // Calculate based on previous year depreciation
        const calcPrev = calculateFixedAssetDepreciation(asset, fiscalYear - 1)
        amortAcumulada = round2(calcPrev.acumuladaCierre)
    }

    const valorNeto = round2(Math.max(0, valorOrigen - amortAcumulada))

    const accounts = await db.accounts.toArray()
    const assetAccount = accounts.find(a => a.id === asset.accountId)
    const contraAccount = accounts.find(a => a.id === asset.contraAccountId)

    // Determine contrapartida account
    let openingContraAccount: Account | undefined
    if (asset.opening?.contraAccountId) {
        openingContraAccount = accounts.find(a => a.id === asset.opening!.contraAccountId)
    }
    if (!openingContraAccount) {
        const openingResult = await ensureOpeningBalanceAccount(accounts)
        if (!openingResult.account) {
            return { entry: null, error: openingResult.error || 'Falta cuenta de Apertura.' }
        }
        openingContraAccount = openingResult.account
    }

    if (!assetAccount) {
        return { entry: null, error: 'Falta cuenta del activo vinculada al bien.' }
    }
    if (!contraAccount) {
        return { entry: null, error: 'Falta cuenta de amortizacion acumulada vinculada al bien.' }
    }

    const lines: EntryLine[] = [
        {
            accountId: assetAccount.id,
            debit: valorOrigen,
            credit: 0,
            description: `Apertura ${asset.name}`,
        },
    ]

    if (amortAcumulada > 0) {
        lines.push({
            accountId: contraAccount.id,
            debit: 0,
            credit: amortAcumulada,
            description: `Amort. Acum. ${asset.name}`,
        })
    }

    if (valorNeto > 0) {
        lines.push({
            accountId: openingContraAccount.id,
            debit: 0,
            credit: valorNeto,
            description: 'Contrapartida apertura',
        })
    }

    const openingDate = `${fiscalYear}-01-01`

    return {
        entry: {
            date: openingDate,
            memo: `Apertura Bienes de Uso - ${asset.name} (${fiscalYear})`,
            lines,
            sourceModule: 'fixed-assets',
            sourceId: asset.id,
            sourceType: 'opening',
            createdAt: new Date().toISOString(),
            metadata: {
                journalRole: 'opening',
                assetId: asset.id,
                assetName: asset.name,
                fiscalYear,
                externalId: buildFixedAssetOpeningExternalId(fiscalYear, asset.id),
                meta: {
                    source: 'fixedAssets',
                    kind: 'opening',
                    assetId: asset.id,
                    periodId: asset.periodId,
                    fiscalYear,
                },
            },
        },
    }
}

export async function syncFixedAssetOpeningEntry(
    asset: FixedAsset,
    fiscalYear: number
): Promise<{ success: boolean; entryId?: string; error?: string; status?: 'generated' | 'updated' | 'skipped' }> {
    const fiscalYearStart = new Date(fiscalYear, 0, 1)
    const isCurrentYearAsset = new Date(asset.acquisitionDate) >= fiscalYearStart
    const originType = asset.originType || (isCurrentYearAsset ? 'PURCHASE' : 'OPENING')

    // PURCHASE assets from current year don't need opening entry
    if (originType === 'PURCHASE' && isCurrentYearAsset) {
        return { success: false, status: 'skipped', error: 'Este bien es una compra del ejercicio.' }
    }

    const { entry, error } = await buildFixedAssetOpeningEntry(asset, fiscalYear)
    if (!entry) {
        return { success: false, error: error || 'No se pudo generar el asiento de apertura.' }
    }

    let existing: JournalEntry | undefined
    if (asset.openingJournalEntryId) {
        existing = await db.entries.get(asset.openingJournalEntryId)
    }
    if (!existing) {
        existing = await findOpeningEntryByMeta(asset.id, asset.periodId, fiscalYear)
    }

    if (existing) {
        await updateEntry(existing.id, entry)
        if (asset.openingJournalEntryId !== existing.id) {
            await updateFixedAsset(asset.id, { openingJournalEntryId: existing.id })
        }
        return { success: true, entryId: existing.id, status: 'updated' }
    }

    const created = await createEntry(entry)
    await updateFixedAsset(asset.id, { openingJournalEntryId: created.id })
    return { success: true, entryId: created.id, status: 'generated' }
}

// ========================================
// Journal Entry Generation
// ========================================

interface JournalBuildResult {
    entry: Omit<JournalEntry, 'id'> | null
    error?: string
}

/**
 * Build the amortization journal entry for a fixed asset
 */
export async function buildAmortizationJournalEntry(
    asset: FixedAsset,
    fiscalYear: number,
    amortizacionEjercicio: number
): Promise<JournalBuildResult> {
    if (amortizacionEjercicio <= 0) {
        return { entry: null, error: 'No hay amortizacion a registrar para este ejercicio' }
    }

    const accounts = await db.accounts.toArray()

    // Resolve expense account (Amortizaciones Bienes de Uso)
    let expenseAccount = accounts.find(a => a.code === DEPRECIATION_EXPENSE_CODE)

    // If expense account doesn't exist, try to create it
    if (!expenseAccount) {
        return {
            entry: null,
            error: `Falta cuenta contable: Amortizaciones Bienes de Uso (${DEPRECIATION_EXPENSE_CODE}). Creala en el Plan de Cuentas.`,
        }
    }

    // Resolve contra account (Amort. Acumulada)
    const contraAccount = accounts.find(a => a.id === asset.contraAccountId)
    if (!contraAccount) {
        return {
            entry: null,
            error: 'Falta cuenta de Amortizacion Acumulada vinculada al bien',
        }
    }

    const lines: EntryLine[] = [
        {
            accountId: expenseAccount.id,
            debit: Math.round(amortizacionEjercicio * 100) / 100,
            credit: 0,
            description: `Amortizacion ${asset.name}`,
        },
        {
            accountId: contraAccount.id,
            debit: 0,
            credit: Math.round(amortizacionEjercicio * 100) / 100,
            description: `Amort. Acum. ${asset.name}`,
        },
    ]

    const closingDate = `${fiscalYear}-12-31`

    return {
        entry: {
            date: closingDate,
            memo: `Amortizacion Bienes de Uso - ${asset.name} - ${fiscalYear}`,
            lines,
            sourceModule: 'fixed-assets',
            sourceId: asset.id,
            sourceType: 'amortization',
            createdAt: new Date().toISOString(),
            metadata: {
                journalRole: 'amortization',
                assetId: asset.id,
                assetName: asset.name,
                fiscalYear,
            },
        },
    }
}

/**
 * Generate and save the amortization journal entry for a fixed asset
 */
export async function generateAmortizationEntry(
    asset: FixedAsset,
    fiscalYear: number
): Promise<{ success: boolean; entryId?: string; error?: string }> {
    // Check for existing entry for this fiscal year
    const existingEntries = await db.entries
        .filter(
            e =>
                e.sourceModule === 'fixed-assets' &&
                e.sourceId === asset.id &&
                e.metadata?.fiscalYear === fiscalYear
        )
        .toArray()

    if (existingEntries.length > 0) {
        return {
            success: false,
            error: 'Ya existe un asiento de amortizacion para este bien en este ejercicio',
        }
    }

    // Calculate depreciation
    const events = await db.fixedAssetEvents.where('assetId').equals(asset.id).toArray()
    const calc = calculateFixedAssetDepreciationWithEvents(asset, fiscalYear, events)

    if (!calc.amortizacionEjercicio || calc.amortizacionEjercicio <= 0) {
        return {
            success: false,
            error: 'No hay amortizacion calculada para este ejercicio',
        }
    }

    // Build journal entry
    const { entry, error } = await buildAmortizationJournalEntry(
        asset,
        fiscalYear,
        calc.amortizacionEjercicio
    )

    if (error || !entry) {
        return { success: false, error: error || 'No se pudo generar el asiento' }
    }

    // Create entry
    const created = await createEntry(entry)

    // Update asset with linked entry
    await updateFixedAsset(asset.id, {
        linkedJournalEntryIds: [...asset.linkedJournalEntryIds, created.id],
    })

    return { success: true, entryId: created.id }
}

// ========================================
// Event Journal Entries
// ========================================

async function findEventEntryByMeta(
    eventId: string,
    assetId: string,
    fiscalYear: number
): Promise<JournalEntry | undefined> {
    const entries = await db.entries.toArray()
    return entries.find(e => {
        const meta = e.metadata?.meta
        return (
            e.sourceModule === 'fixed-assets' &&
            e.sourceType === 'event' &&
            meta?.source === 'fixedAssets' &&
            meta?.kind === 'event' &&
            meta?.eventId === eventId &&
            meta?.assetId === assetId &&
            meta?.fiscalYear === fiscalYear
        )
    })
}

export async function buildFixedAssetEventJournalEntry(
    event: FixedAssetEvent,
    asset: FixedAsset,
    fiscalYear: number
): Promise<JournalBuildResult> {
    const accounts = await db.accounts.toArray()
    const assetAccount = accounts.find(a => a.id === asset.accountId)
    const contraAccount = accounts.find(a => a.id === asset.contraAccountId)

    if (!assetAccount) {
        return { entry: null, error: 'Falta cuenta del activo vinculada al bien.' }
    }
    if (!contraAccount) {
        return { entry: null, error: 'Falta cuenta de amortización acumulada vinculada al bien.' }
    }

    const amount = round2(event.amount || 0)
    const entryDate = event.date
    const lines: EntryLine[] = []

    if (event.type === 'IMPROVEMENT') {
        if (!event.contraAccountId) {
            return { entry: null, error: 'Seleccioná la cuenta contrapartida de la mejora.' }
        }
        if (amount <= 0) {
            return { entry: null, error: 'El importe de la mejora debe ser mayor a 0.' }
        }

        lines.push(
            {
                accountId: assetAccount.id,
                debit: amount,
                credit: 0,
                description: `Mejora ${asset.name}`,
            },
            {
                accountId: event.contraAccountId,
                debit: 0,
                credit: amount,
                description: 'Contrapartida mejora',
            }
        )
    } else if (event.type === 'DISPOSAL') {
        if (!event.contraAccountId) {
            return { entry: null, error: 'Seleccioná la cuenta contrapartida de la venta/baja.' }
        }
        const resultAccount = resolveDisposalResultAccount(accounts)
        if (!resultAccount) {
            return { entry: null, error: 'Falta cuenta Resultado venta bienes de uso (4.7.04).' }
        }

        const eventDateObj = new Date(event.date)
        const allEvents = await db.fixedAssetEvents.where('assetId').equals(asset.id).toArray()
        const accum = round2(
            calculateAccumulatedWithImprovementsToDate(asset, allEvents, eventDateObj)
        )
        const cost = round2(calculateCostWithImprovements(asset, allEvents, eventDateObj))
        const proceeds = amount

        if (proceeds < 0) {
            return { entry: null, error: 'El precio de venta no puede ser negativo.' }
        }

        lines.push(
            {
                accountId: event.contraAccountId,
                debit: proceeds,
                credit: 0,
                description: 'Venta/Baja bienes de uso',
            },
            {
                accountId: contraAccount.id,
                debit: accum,
                credit: 0,
                description: `Amort. Acum. ${asset.name}`,
            },
            {
                accountId: assetAccount.id,
                debit: 0,
                credit: cost,
                description: `Baja ${asset.name}`,
            }
        )

        const netDifference = round2(proceeds + accum - cost)
        if (Math.abs(netDifference) >= 0.01) {
            lines.push({
                accountId: resultAccount.id,
                debit: netDifference < 0 ? Math.abs(netDifference) : 0,
                credit: netDifference > 0 ? netDifference : 0,
                description:
                    netDifference >= 0 ? 'Ganancia venta bienes de uso' : 'Pérdida venta bienes de uso',
            })
        }
    } else if (event.type === 'REVALUATION') {
        if (amount === 0) {
            return { entry: null, error: 'El importe de revalúo no puede ser 0.' }
        }
        const reserve = event.contraAccountId
            ? accounts.find(a => a.id === event.contraAccountId)
            : resolveRevaluationReserveAccount(accounts)
        if (!reserve) {
            return { entry: null, error: 'Falta cuenta Reserva por revalúo (3.2.05).' }
        }

        if (amount > 0) {
            lines.push(
                { accountId: assetAccount.id, debit: amount, credit: 0, description: 'Revalúo técnico' },
                { accountId: reserve.id, debit: 0, credit: amount, description: 'Reserva por revalúo' }
            )
        } else {
            const abs = Math.abs(amount)
            lines.push(
                { accountId: assetAccount.id, debit: 0, credit: abs, description: 'Revalúo técnico' },
                { accountId: reserve.id, debit: abs, credit: 0, description: 'Reserva por revalúo' }
            )
        }
    } else if (event.type === 'DAMAGE') {
        if (amount <= 0) {
            return { entry: null, error: 'El importe del deterioro debe ser mayor a 0.' }
        }
        const damageAccount = resolveDamageExpenseAccount(accounts)
        if (!damageAccount) {
            return { entry: null, error: 'Falta cuenta de deterioro/obsolescencia (4.7.03).' }
        }
        lines.push(
            { accountId: damageAccount.id, debit: amount, credit: 0, description: 'Deterioro bien de uso' },
            { accountId: assetAccount.id, debit: 0, credit: amount, description: `Baja parcial ${asset.name}` }
        )
    } else {
        return { entry: null, error: 'Tipo de evento no soportado.' }
    }

    return {
        entry: {
            date: entryDate,
            memo: `Evento Bienes de Uso - ${asset.name} (${event.type})`,
            lines,
            sourceModule: 'fixed-assets',
            sourceId: event.id,
            sourceType: 'event',
            createdAt: new Date().toISOString(),
            metadata: {
                journalRole: 'event',
                assetId: asset.id,
                assetName: asset.name,
                eventId: event.id,
                eventType: event.type,
                fiscalYear,
                meta: {
                    source: 'fixedAssets',
                    kind: 'event',
                    assetId: asset.id,
                    eventId: event.id,
                    periodId: asset.periodId,
                    fiscalYear,
                    eventType: event.type,
                },
            },
        },
    }
}

export async function syncFixedAssetEventJournalEntry(
    event: FixedAssetEvent,
    asset: FixedAsset,
    fiscalYear: number
): Promise<{ success: boolean; entryId?: string; error?: string; status?: 'generated' | 'updated' }> {
    const { entry, error } = await buildFixedAssetEventJournalEntry(event, asset, fiscalYear)
    if (!entry) {
        return { success: false, error: error || 'No se pudo generar el asiento del evento.' }
    }

    let existing: JournalEntry | undefined
    if (event.linkedJournalEntryId) {
        existing = await db.entries.get(event.linkedJournalEntryId)
    }
    if (!existing) {
        existing = await findEventEntryByMeta(event.id, asset.id, fiscalYear)
    }

    if (existing) {
        await updateEntry(existing.id, entry)
        if (event.linkedJournalEntryId !== existing.id) {
            await updateFixedAssetEvent(event.id, { linkedJournalEntryId: existing.id })
        }
        return { success: true, entryId: existing.id, status: 'updated' }
    }

    const created = await createEntry(entry)
    await updateFixedAssetEvent(event.id, { linkedJournalEntryId: created.id })
    return { success: true, entryId: created.id, status: 'generated' }
}

// ========================================
// RT6 (Inflation Adjustment)
// ========================================

async function findRT6EntryByMeta(
    assetId: string,
    fiscalYear: number
): Promise<JournalEntry | undefined> {
    const entries = await db.entries.toArray()
    return entries.find(e => {
        const meta = e.metadata?.meta
        return (
            e.sourceModule === 'fixed-assets' &&
            e.sourceType === 'rt6' &&
            meta?.source === 'fixedAssets' &&
            meta?.kind === 'rt6' &&
            meta?.assetId === assetId &&
            meta?.fiscalYear === fiscalYear
        )
    })
}

async function getCierreValuacionState() {
    const all = await db.cierreValuacionState.toArray()
    return all.find(s => s.id === 'cierre-valuacion-state') || all[0]
}

export async function calculateRT6Adjustment(
    asset: FixedAsset,
    fiscalYear: number
): Promise<
    | {
          coef: number
          indexOrigin: number
          indexClose: number
          valorAjustado: number
          diferencia: number
          closingPeriod: string
          closingDate: string
      }
    | { error: string }
> {
    const cierreState = await getCierreValuacionState()
    const indices = cierreState?.indices || []
    if (!indices.length) {
        return { error: 'No hay índices RT6 cargados.' }
    }

    const originDate = asset.placedInServiceDate || asset.acquisitionDate
    const originPeriod = originDate.slice(0, 7)
    const closingDate = cierreState?.closingDate || `${fiscalYear}-12-31`
    const closingPeriod = closingDate.slice(0, 7)

    const indexOrigin = indices.find((i: { period: string }) => i.period === originPeriod)?.value
    const indexClose = indices.find((i: { period: string }) => i.period === closingPeriod)?.value

    if (!indexOrigin || !indexClose) {
        return { error: 'Faltan índices RT6 para el período de origen o cierre.' }
    }

    const coef = indexClose / indexOrigin
    const valorAjustado = round2(asset.originalValue * coef)
    const diferencia = round2(valorAjustado - asset.originalValue)

    return {
        coef,
        indexOrigin,
        indexClose,
        valorAjustado,
        diferencia,
        closingPeriod,
        closingDate,
    }
}

export async function buildFixedAssetRT6Entry(
    asset: FixedAsset,
    fiscalYear: number
): Promise<JournalBuildResult> {
    const calc = await calculateRT6Adjustment(asset, fiscalYear)
    if ('error' in calc) {
        return { entry: null, error: calc.error }
    }

    if (Math.abs(calc.diferencia) < 0.01) {
        return { entry: null, error: 'No hay diferencia RT6 para registrar.' }
    }

    const accounts = await db.accounts.toArray()
    const assetAccount = accounts.find(a => a.id === asset.accountId)
    const recpamAccount = resolveRecpamAccount(accounts)

    if (!assetAccount) {
        return { entry: null, error: 'Falta cuenta del activo vinculada al bien.' }
    }
    if (!recpamAccount) {
        return { entry: null, error: 'Falta cuenta RECPAM (4.6.05).' }
    }

    const diff = calc.diferencia
    const lines: EntryLine[] = diff > 0
        ? [
              { accountId: assetAccount.id, debit: diff, credit: 0, description: 'Ajuste RT6' },
              { accountId: recpamAccount.id, debit: 0, credit: diff, description: 'RECPAM' },
          ]
        : [
              { accountId: assetAccount.id, debit: 0, credit: Math.abs(diff), description: 'Ajuste RT6' },
              { accountId: recpamAccount.id, debit: Math.abs(diff), credit: 0, description: 'RECPAM' },
          ]

    return {
        entry: {
            date: calc.closingDate,
            memo: `Ajuste RT6 Bienes de Uso - ${asset.name} (${fiscalYear})`,
            lines,
            sourceModule: 'fixed-assets',
            sourceId: `${asset.id}:rt6:${fiscalYear}`,
            sourceType: 'rt6',
            createdAt: new Date().toISOString(),
            metadata: {
                journalRole: 'rt6',
                assetId: asset.id,
                assetName: asset.name,
                fiscalYear,
                coef: calc.coef,
                meta: {
                    source: 'fixedAssets',
                    kind: 'rt6',
                    assetId: asset.id,
                    periodId: asset.periodId,
                    fiscalYear,
                },
            },
        },
    }
}

export async function syncFixedAssetRT6Entry(
    asset: FixedAsset,
    fiscalYear: number
): Promise<{ success: boolean; entryId?: string; error?: string; status?: 'generated' | 'updated' }> {
    const { entry, error } = await buildFixedAssetRT6Entry(asset, fiscalYear)
    if (!entry) {
        return { success: false, error: error || 'No se pudo generar el ajuste RT6.' }
    }

    let existing: JournalEntry | undefined
    if (asset.rt6JournalEntryId) {
        existing = await db.entries.get(asset.rt6JournalEntryId)
    }
    if (!existing) {
        existing = await findRT6EntryByMeta(asset.id, fiscalYear)
    }

    if (existing) {
        await updateEntry(existing.id, entry)
        if (asset.rt6JournalEntryId !== existing.id) {
            await updateFixedAsset(asset.id, { rt6JournalEntryId: existing.id })
        }
        return { success: true, entryId: existing.id, status: 'updated' }
    }

    const created = await createEntry(entry)
    await updateFixedAsset(asset.id, { rt6JournalEntryId: created.id })
    return { success: true, entryId: created.id, status: 'generated' }
}

// ========================================
// Metrics & Aggregations
// ========================================

export interface FixedAssetsMetrics {
    hasData: boolean
    count: number
    totalCost: number
    totalAccumulated: number
    totalNBV: number
    estimatedDepreciation: number
}

/**
 * Calculate metrics for all fixed assets in a period
 */
export async function getFixedAssetsMetrics(
    periodId: string,
    fiscalYear: number
): Promise<FixedAssetsMetrics> {
    const assets = await getAllFixedAssets(periodId)
    const allEvents = await db.fixedAssetEvents.toArray()
    const activeAssets = assets.filter(
        a => a.status === 'active' || a.status === 'in_progress'
    )

    if (activeAssets.length === 0) {
        return {
            hasData: false,
            count: 0,
            totalCost: 0,
            totalAccumulated: 0,
            totalNBV: 0,
            estimatedDepreciation: 0,
        }
    }

    let totalCost = 0
    let totalAccumulated = 0
    let estimatedDepreciation = 0

    for (const asset of activeAssets) {
        const events = allEvents.filter(e => e.assetId === asset.id)
        const calc = calculateFixedAssetDepreciationWithEvents(asset, fiscalYear, events)
        totalCost += calc.valorOrigenAjustado
        totalAccumulated += calc.acumuladaCierre
        estimatedDepreciation += calc.amortizacionEjercicio
    }

    return {
        hasData: true,
        count: activeAssets.length,
        totalCost,
        totalAccumulated,
        totalNBV: totalCost - totalAccumulated,
        estimatedDepreciation,
    }
}

/**
 * Generate depreciation schedule (year by year) for an asset
 */
export function generateDepreciationSchedule(
    asset: FixedAsset,
    currentYear: number
): Array<{
    year: number
    baseAmortizable: number
    cuotaAnual: number
    acumulado: number
    valorResidual: number
    isCurrent: boolean
}> {
    const schedule: Array<{
        year: number
        baseAmortizable: number
        cuotaAnual: number
        acumulado: number
        valorResidual: number
        isCurrent: boolean
    }> = []

    if (asset.method === 'none' || asset.category === 'Terrenos') {
        return schedule
    }

    const startYear = new Date(asset.placedInServiceDate || asset.acquisitionDate).getFullYear()
    const lifeYears = asset.lifeYears || 5
    const C = asset.originalValue
    const VR = C * ((asset.residualValuePct || 0) / 100)
    const VA = C - VR
    const cuotaAnual = VA / lifeYears

    let acumulado = 0

    for (let i = 0; i < lifeYears; i++) {
        const year = startYear + i
        acumulado = Math.min(acumulado + cuotaAnual, VA)

        schedule.push({
            year,
            baseAmortizable: VA,
            cuotaAnual: Math.min(cuotaAnual, VA - (acumulado - cuotaAnual)),
            acumulado,
            valorResidual: C - acumulado,
            isCurrent: year === currentYear,
        })
    }

    return schedule
}
