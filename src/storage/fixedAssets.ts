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

/** Account codes for deductions & withholdings */
const DESCUENTO_OBTENIDO_CODE = '4.6.09'
const RETENCION_PRACTICADA_CODE = '2.1.03.03'
const PERCEPCION_SUFRIDA_CODE = '1.1.03.08'
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

/** Parse ISO date string (YYYY-MM-DD) as local time to avoid timezone shift.
 *  new Date('2025-01-01') parses as UTC midnight, which in UTC-3 becomes Dec 31 2024 21:00 local,
 *  causing getFullYear() to return 2024 instead of 2025. */
function parseDateLocal(dateStr: string): Date {
    const parts = dateStr.split('-').map(Number)
    if (parts.length >= 3 && parts.every(n => !isNaN(n))) {
        return new Date(parts[0], parts[1] - 1, parts[2])
    }
    // Fallback for non-ISO formats
    return new Date(dateStr)
}

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
 * Delete a fixed asset with cascade: removes all linked journal entries and events.
 * Collects entry IDs from all linkage fields + metadata search to avoid orphans.
 */
export async function deleteFixedAsset(id: string): Promise<{ success: boolean; error?: string; deletedEntries?: number; deletedEvents?: number }> {
    const asset = await db.fixedAssets.get(id)
    if (!asset) {
        return { success: false, error: 'Bien de uso no encontrado' }
    }

    // Collect all linked entry IDs from explicit fields
    const entryIdsToDelete = new Set<string>()
    if (asset.openingJournalEntryId) entryIdsToDelete.add(asset.openingJournalEntryId)
    if (asset.acquisitionJournalEntryId) entryIdsToDelete.add(asset.acquisitionJournalEntryId)
    if (asset.paymentJournalEntryId) entryIdsToDelete.add(asset.paymentJournalEntryId)
    if (asset.rt6JournalEntryId) entryIdsToDelete.add(asset.rt6JournalEntryId)
    for (const eid of asset.linkedJournalEntryIds) {
        entryIdsToDelete.add(eid)
    }

    // Also search entries by metadata to catch any not tracked in explicit fields
    try {
        const metaEntries = await db.entries
            .filter(e => e.sourceModule === 'fixed-assets' && e.sourceId === id)
            .toArray()
        for (const e of metaEntries) {
            entryIdsToDelete.add(e.id)
        }
    } catch {
        // Non-critical: explicit IDs should cover most cases
    }

    // Collect event-linked entry IDs
    const events = await db.fixedAssetEvents.where('assetId').equals(id).toArray()
    for (const evt of events) {
        if (evt.linkedJournalEntryId) entryIdsToDelete.add(evt.linkedJournalEntryId)
    }

    // Delete all linked entries
    const idsArray = Array.from(entryIdsToDelete)
    if (idsArray.length > 0) {
        await db.entries.bulkDelete(idsArray)
    }

    // Delete all events for this asset
    const eventIds = events.map(e => e.id)
    if (eventIds.length > 0) {
        await db.fixedAssetEvents.bulkDelete(eventIds)
    }

    // Delete the asset
    await db.fixedAssets.delete(id)

    return { success: true, deletedEntries: idsArray.length, deletedEvents: eventIds.length }
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

    // Parse dates (use parseDateLocal to avoid timezone shift)
    const acquisitionDate = parseDateLocal(asset.placedInServiceDate || asset.acquisitionDate)
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

    // For OPENING-type assets, override acumuladaInicio with user-provided value
    // opening.initialAccumDep = accumulated depreciation at the START of the import year
    if (asset.originType === 'OPENING' && asset.opening?.initialAccumDep !== undefined) {
        const importYear = parseInt(asset.periodId) || fiscalYear
        const yearsSinceImport = Math.max(0, fiscalYear - importYear)
        acumuladaInicio = asset.opening.initialAccumDep + yearsSinceImport * amortizacionAnual
        amortizacionEjercicio = amortizacionAnual
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
    const baseDate = parseDateLocal(asset.placedInServiceDate || asset.acquisitionDate)
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
        e => e.type === 'IMPROVEMENT' && parseDateLocal(e.date) <= fiscalYearEnd && e.amount > 0
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
        const eventDate = parseDateLocal(event.date)
        const component: FixedAsset = {
            ...asset,
            originType: 'PURCHASE', // improvements are always treated as new components
            opening: undefined,
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

    const acquisitionDate = parseDateLocal(asset.placedInServiceDate || asset.acquisitionDate)
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
        e => e.type === 'IMPROVEMENT' && parseDateLocal(e.date) <= asOfDate && e.amount > 0
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
        const eventDate = parseDateLocal(event.date)
        const component: FixedAsset = {
            ...asset,
            originType: 'PURCHASE',
            opening: undefined,
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
 * Resolve acreedores account: subcuenta per counterparty, or parent 2.1.06.01 for generic.
 * Reuses the same pattern as ops.ts.
 */
async function resolveAcreedoresAccountForFA(counterpartyName?: string): Promise<string> {
    const ACREEDORES_CODE = '2.1.06.01'
    if (!counterpartyName?.trim()) {
        const parent = await db.accounts.where('code').equals(ACREEDORES_CODE).first()
        if (!parent) throw new Error(`Cuenta "${ACREEDORES_CODE}" no encontrada`)
        return parent.id
    }
    const { findOrCreateChildAccountByName } = await import('./accounts')
    return findOrCreateChildAccountByName(ACREEDORES_CODE, counterpartyName.trim())
}

/**
 * Build acquisition (purchase) journal entry #1 — FACTURA / DEVENGAMIENTO
 *
 * ASIENTO #1 (siempre):
 *   Debit:  Bien de Uso (subcuenta) por neto (o total si no discrimina IVA)
 *   Debit:  IVA Crédito Fiscal (si discrimina)
 *   Credit: Acreedores Varios (genérico o subcuenta tercero) por TOTAL
 */
export async function buildFixedAssetAcquisitionEntry(
    asset: FixedAsset
): Promise<JournalBuildResult> {
    if (!asset.acquisition) {
        return { entry: null, error: 'No hay datos de adquisicion.' }
    }

    const acq = asset.acquisition
    const accounts = await db.accounts.toArray()
    const assetAccount = accounts.find(a => a.id === asset.accountId)
    const ivaCFAccount = resolveIvaCFAccount(accounts)

    if (!assetAccount) {
        return { entry: null, error: 'Falta cuenta del activo vinculada al bien.' }
    }

    // Resolve acreedores account
    let acreedoresAccountId: string
    try {
        acreedoresAccountId = await resolveAcreedoresAccountForFA(acq.counterpartyName)
    } catch {
        return { entry: null, error: 'Falta cuenta Acreedores Varios (2.1.06.01) en Plan de Cuentas.' }
    }

    const lines: EntryLine[] = []

    if (acq.withVat && acq.vatAmount > 0) {
        if (!ivaCFAccount) {
            return { entry: null, error: 'Falta cuenta IVA Credito Fiscal (1.1.03.01) en Plan de Cuentas.' }
        }
        lines.push({
            accountId: assetAccount.id,
            debit: round2(acq.netAmount),
            credit: 0,
            description: `Alta ${asset.name}`,
        })
        lines.push({
            accountId: ivaCFAccount.id,
            debit: round2(acq.vatAmount),
            credit: 0,
            description: 'IVA Credito Fiscal',
        })
    } else {
        lines.push({
            accountId: assetAccount.id,
            debit: round2(acq.totalAmount),
            credit: 0,
            description: `Alta ${asset.name}`,
        })
    }

    // Debit: Percepciones sufridas (added to invoice, increases debt to acreedores)
    const percepciones = (acq.withholdings || []).filter(w => w.kind === 'PERCEPCION' && w.amount > 0)
    const percepcionesTotal = round2(percepciones.reduce((sum, p) => sum + p.amount, 0))
    if (percepcionesTotal > 0) {
        const percAccount = accounts.find(a => a.code === PERCEPCION_SUFRIDA_CODE)
        if (percAccount) {
            for (const perc of percepciones) {
                lines.push({
                    accountId: percAccount.id,
                    debit: round2(perc.amount),
                    credit: 0,
                    description: `Percepcion ${perc.taxType} sufrida`,
                })
            }
        }
    }

    // Credit: Acreedores Varios por el TOTAL + percepciones
    const acreedoresCredit = round2(acq.totalAmount + percepcionesTotal)
    const cpLabel = acq.counterpartyName?.trim()
        ? `Acreedor - ${acq.counterpartyName.trim()}`
        : 'Acreedores Varios'
    lines.push({
        accountId: acreedoresAccountId,
        debit: 0,
        credit: acreedoresCredit,
        description: cpLabel,
    })

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
                counterparty: { name: acq.counterpartyName?.trim() || '', accountId: acreedoresAccountId },
                totals: {
                    net: acq.netAmount,
                    vat: acq.vatAmount,
                    percepciones: percepcionesTotal || undefined,
                    total: acreedoresCredit,
                },
                discriminateVat: acq.withVat,
                vatRate: acq.vatRate,
                doc: { docType: acq.docType, number: acq.docNumber },
                deductions: acq.deductions?.length ? acq.deductions : undefined,
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

const buildFixedAssetPaymentExternalId = (assetId: string) =>
    `FA_PAYMENT:${assetId}`

/**
 * Build payment journal entry #2 — PAGO INMEDIATO
 *
 * ASIENTO #2 (solo si pagadoAhora > 0):
 *   Debit:  Acreedores Varios por monto cancelado (cash + desc.fin. + retenciones)
 *   Credit: Banco / Caja / Valores / Documentos (cash según splits)
 *   Credit: Descuentos Obtenidos (4.6.09) — descuento financiero
 *   Credit: Retenciones a depositar (2.1.03.03) — retenciones practicadas
 */
export async function buildFixedAssetPaymentEntry(
    asset: FixedAsset,
    acquisitionEntryId?: string
): Promise<JournalBuildResult> {
    if (!asset.acquisition) {
        return { entry: null, error: 'No hay datos de adquisicion.' }
    }

    const acq = asset.acquisition
    if (!acq.splits || acq.splits.length === 0) {
        return { entry: null, error: 'No hay pagos inmediatos registrados.' }
    }

    const splitsTotal = round2(acq.splits.reduce((sum, s) => sum + s.amount, 0))

    // Retenciones (withheld from payment, credited to 2.1.03.03)
    const retenciones = (acq.withholdings || []).filter(w => w.kind === 'RETENCION' && w.amount > 0)
    const retencionesTotal = round2(retenciones.reduce((sum, r) => sum + r.amount, 0))

    // Descuento financiero (financial discount, credited to 4.6.09)
    const descFinDeductions = (acq.deductions || []).filter(d => d.type === 'DESCUENTO_FINANCIERO' && d.amount > 0)
    const descFinTotal = round2(descFinDeductions.reduce((sum, d) => sum + d.amount, 0))

    // Total that gets cancelled from Acreedores = cash + retenciones + desc.financiero
    const paymentTotal = round2(splitsTotal + retencionesTotal + descFinTotal)
    if (paymentTotal <= 0) {
        return { entry: null, error: 'El total de pagos es 0.' }
    }

    const accounts = await db.accounts.toArray()

    // Validate split accounts exist
    for (const split of acq.splits) {
        const splitAccount = accounts.find(a => a.id === split.accountId)
        if (!splitAccount) {
            return { entry: null, error: `Cuenta de pago no encontrada: ${split.accountId}` }
        }
    }

    // Resolve acreedores account
    let acreedoresAccountId: string
    try {
        acreedoresAccountId = await resolveAcreedoresAccountForFA(acq.counterpartyName)
    } catch {
        return { entry: null, error: 'Falta cuenta Acreedores Varios (2.1.06.01) en Plan de Cuentas.' }
    }

    const lines: EntryLine[] = []

    // Debit: Acreedores por monto cancelado (includes desc.fin. + retenciones)
    const cpLabel = acq.counterpartyName?.trim()
        ? `Pago a ${acq.counterpartyName.trim()}`
        : 'Pago Acreedores Varios'
    lines.push({
        accountId: acreedoresAccountId,
        debit: paymentTotal,
        credit: 0,
        description: cpLabel,
    })

    // Credit: Cada medio de pago (cash)
    for (const split of acq.splits) {
        lines.push({
            accountId: split.accountId,
            debit: 0,
            credit: round2(split.amount),
            description: split.description || 'Pago adquisicion',
        })
    }

    // Credit: Descuentos Obtenidos (4.6.09)
    if (descFinTotal > 0) {
        const descAccount = accounts.find(a => a.code === DESCUENTO_OBTENIDO_CODE)
        if (descAccount) {
            lines.push({
                accountId: descAccount.id,
                debit: 0,
                credit: descFinTotal,
                description: 'Descuento financiero obtenido',
            })
        }
    }

    // Credit: Retenciones a depositar (2.1.03.03)
    if (retencionesTotal > 0) {
        const retAccount = accounts.find(a => a.code === RETENCION_PRACTICADA_CODE)
        if (retAccount) {
            for (const ret of retenciones) {
                lines.push({
                    accountId: retAccount.id,
                    debit: 0,
                    credit: round2(ret.amount),
                    description: `Retencion ${ret.taxType} a depositar`,
                })
            }
        }
    }

    const docRef = acq.docType && acq.docNumber
        ? ` - ${acq.docType} ${acq.docNumber}`
        : ''

    return {
        entry: {
            date: acq.date,
            memo: `Pago Bien de Uso - ${asset.name}${docRef}`,
            lines,
            sourceModule: 'fixed-assets',
            sourceId: asset.id,
            sourceType: 'payment',
            createdAt: new Date().toISOString(),
            metadata: {
                journalRole: 'payment',
                assetId: asset.id,
                assetName: asset.name,
                counterparty: { name: acq.counterpartyName?.trim() || '', accountId: acreedoresAccountId },
                paymentTotal,
                retenciones: retencionesTotal || undefined,
                descuentoFinanciero: descFinTotal || undefined,
                applyTo: acquisitionEntryId
                    ? { entryId: acquisitionEntryId, amount: paymentTotal }
                    : undefined,
                externalId: buildFixedAssetPaymentExternalId(asset.id),
                meta: {
                    source: 'fixedAssets',
                    kind: 'payment',
                    assetId: asset.id,
                    periodId: asset.periodId,
                },
            },
        },
    }
}

/**
 * Sync (create or update) acquisition journal entry #1 for a fixed asset
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

/**
 * Sync (create or update) payment journal entry #2 for a fixed asset
 * Only creates if there are immediate payments (splits with amount > 0)
 */
export async function syncFixedAssetPaymentEntry(
    asset: FixedAsset
): Promise<{ success: boolean; entryId?: string; error?: string; status?: 'generated' | 'updated' | 'skipped' }> {
    if (!asset.acquisition) {
        return { success: false, status: 'skipped' }
    }

    const paymentTotal = round2((asset.acquisition.splits || []).reduce((sum, s) => sum + s.amount, 0))
    if (paymentTotal <= 0) {
        return { success: true, status: 'skipped' }
    }

    const { entry, error } = await buildFixedAssetPaymentEntry(asset, asset.acquisitionJournalEntryId || undefined)
    if (!entry) {
        return { success: false, error: error || 'No se pudo generar el asiento de pago.' }
    }

    let existing: JournalEntry | undefined
    if (asset.paymentJournalEntryId) {
        existing = await db.entries.get(asset.paymentJournalEntryId)
    }

    if (existing) {
        await updateEntry(existing.id, entry)
        return { success: true, entryId: existing.id, status: 'updated' }
    }

    const created = await createEntry(entry)
    await updateFixedAsset(asset.id, { paymentJournalEntryId: created.id })
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
    const acquisitionDate = parseDateLocal(asset.acquisitionDate)
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
    const isCurrentYearAsset = parseDateLocal(asset.acquisitionDate) >= fiscalYearStart
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
                meta: {
                    source: 'fixedAssets',
                    kind: 'amortization',
                    type: 'AMORTIZATION',
                    assetId: asset.id,
                    period: String(fiscalYear),
                    asOf: closingDate,
                    periodId: asset.periodId,
                    fiscalYear,
                    granularity: 'annual',
                },
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
    // Check for existing amortization entries for this fiscal year (annual or monthly)
    const existingEntries = await db.entries
        .filter(
            e =>
                e.sourceModule === 'fixed-assets' &&
                e.sourceId === asset.id &&
                e.sourceType === 'amortization' &&
                (e.metadata?.fiscalYear === fiscalYear || e.metadata?.meta?.fiscalYear === fiscalYear)
        )
        .toArray()

    if (existingEntries.length > 0) {
        return {
            success: false,
            error: 'Ya existen asientos de amortizacion para este bien en este ejercicio.',
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

        const eventDateObj = parseDateLocal(event.date)
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

    const startYear = parseDateLocal(asset.placedInServiceDate || asset.acquisitionDate).getFullYear()
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

// ========================================
// Monthly Depreciation & Devengado vs Contabilizado
// ========================================

const MONTH_NAMES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export interface MonthlyDepreciationRow {
    month: number           // 1-12
    year: number
    label: string           // 'Enero', 'Febrero', etc
    daysInMonth: number
    daysInUse: number
    devengadoMes: number
    devengadoAcumulado: number  // total accumulated depreciation from inception through this month end
}

/**
 * Generate monthly depreciation schedule for a fiscal year.
 * Uses daily proration: amortMes = amortMensual * (diasEnUso / diasDelMes)
 */
export function generateMonthlyDepreciationSchedule(
    asset: FixedAsset,
    fiscalYear: number
): MonthlyDepreciationRow[] {
    const C = asset.originalValue
    const residualPct = asset.residualValuePct ?? 0
    const VR = C * (residualPct / 100)
    const VA = Math.max(0, C - VR)
    const rows: MonthlyDepreciationRow[] = []

    // Non-depreciable or in-project assets: return empty schedule
    if (asset.method === 'none' || asset.category === 'Terrenos' || VA <= 0 || asset.status === 'in_progress') {
        for (let m = 0; m < 12; m++) {
            const daysInMonth = new Date(fiscalYear, m + 1, 0).getDate()
            rows.push({
                month: m + 1, year: fiscalYear, label: MONTH_NAMES_ES[m],
                daysInMonth, daysInUse: 0, devengadoMes: 0, devengadoAcumulado: 0,
            })
        }
        return rows
    }

    const lifeYears = asset.lifeYears || 1
    const amortAnual = VA / lifeYears
    const amortMensual = amortAnual / 12
    const lifeMonths = lifeYears * 12

    const acquisitionDate = parseDateLocal(asset.placedInServiceDate || asset.acquisitionDate)
    const fiscalYearStart = new Date(fiscalYear, 0, 1)
    const fiscalYearEnd = new Date(fiscalYear, 11, 31)

    // If asset acquired after fiscal year end, no depreciation
    if (acquisitionDate > fiscalYearEnd) {
        for (let m = 0; m < 12; m++) {
            const daysInMonth = new Date(fiscalYear, m + 1, 0).getDate()
            rows.push({
                month: m + 1, year: fiscalYear, label: MONTH_NAMES_ES[m],
                daysInMonth, daysInUse: 0, devengadoMes: 0, devengadoAcumulado: 0,
            })
        }
        return rows
    }

    // Calculate accumulated depreciation before fiscal year start
    let acumAnterior = 0
    if (asset.originType === 'OPENING' && asset.opening?.initialAccumDep !== undefined) {
        const importYear = parseInt(asset.periodId) || fiscalYear
        const yearsBefore = Math.max(0, fiscalYear - importYear)
        acumAnterior = asset.opening.initialAccumDep + yearsBefore * amortAnual
    } else if (acquisitionDate < fiscalYearStart) {
        const prevYearEnd = new Date(fiscalYear - 1, 11, 31)
        const monthsPrior = calculateMonthsBetween(acquisitionDate, prevYearEnd) + 1
        acumAnterior = Math.min(monthsPrior, lifeMonths) * amortMensual
    }
    acumAnterior = Math.min(round2(acumAnterior), VA)

    // Determine depreciation start date for this fiscal year
    const depStartDate = acquisitionDate > fiscalYearStart ? acquisitionDate : fiscalYearStart

    let devengadoAcumulado = acumAnterior
    let totalAssigned = 0

    for (let m = 0; m < 12; m++) {
        const monthStart = new Date(fiscalYear, m, 1)
        const monthEnd = new Date(fiscalYear, m + 1, 0) // last day of month
        const daysInMonth = monthEnd.getDate()

        // Not yet active or already fully depreciated
        if (depStartDate > monthEnd || devengadoAcumulado >= VA - 0.005) {
            rows.push({
                month: m + 1, year: fiscalYear, label: MONTH_NAMES_ES[m],
                daysInMonth, daysInUse: 0, devengadoMes: 0,
                devengadoAcumulado: round2(devengadoAcumulado),
            })
            continue
        }

        // Calculate days in use this month
        let daysInUse: number
        if (depStartDate > monthStart) {
            // First partial month: from acquisition date to end of month
            daysInUse = daysInMonth - depStartDate.getDate() + 1
        } else {
            daysInUse = daysInMonth
        }

        // Handle disposal (if asset has disposal date)
        if (asset.disposalDate) {
            const dispDate = parseDateLocal(asset.disposalDate)
            if (dispDate >= monthStart && dispDate <= monthEnd) {
                daysInUse = Math.min(daysInUse, dispDate.getDate())
            } else if (dispDate < monthStart) {
                daysInUse = 0
            }
        }

        let devengadoMes = round2(amortMensual * (daysInUse / daysInMonth))

        // Clamp: don't exceed VA
        if (devengadoAcumulado + devengadoMes > VA) {
            devengadoMes = round2(VA - devengadoAcumulado)
        }

        devengadoAcumulado = round2(devengadoAcumulado + devengadoMes)
        totalAssigned += devengadoMes

        rows.push({
            month: m + 1, year: fiscalYear, label: MONTH_NAMES_ES[m],
            daysInMonth, daysInUse, devengadoMes: round2(devengadoMes),
            devengadoAcumulado: round2(devengadoAcumulado),
        })
    }

    // Rounding adjustment: distribute remainder to last active month
    // so the yearly total matches the annual calculation
    const calcFiscalYear = calculateFixedAssetDepreciation(asset, fiscalYear)
    const expectedTotal = calcFiscalYear.amortizacionEjercicio
    const diff = round2(expectedTotal - totalAssigned)
    if (Math.abs(diff) > 0.005 && Math.abs(diff) < 1) {
        let lastActiveIdx = -1
        for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].devengadoMes > 0) { lastActiveIdx = i; break }
        }
        if (lastActiveIdx >= 0) {
            rows[lastActiveIdx].devengadoMes = round2(rows[lastActiveIdx].devengadoMes + diff)
            // Recalculate accumulated from that point
            let acc = lastActiveIdx > 0 ? rows[lastActiveIdx - 1].devengadoAcumulado : acumAnterior
            for (let i = lastActiveIdx; i < 12; i++) {
                acc = round2(acc + rows[i].devengadoMes)
                rows[i].devengadoAcumulado = acc
            }
        }
    }

    return rows
}

/**
 * Query posted (contabilizado) amortization amounts for a fixed asset.
 * Returns the total accumulated depreciation that has been posted to the books.
 */
export interface PostedAmortizationInfo {
    /** Total accumulated depreciation posted to books (opening + amortization entries) */
    total: number
    /** Amortization entries for the current fiscal year only */
    currentYearAmort: number
    /** List of relevant posted entries */
    entries: Array<{
        entryId: string
        date: string
        amount: number
        period?: string
        type: string
    }>
}

export async function getAmortizationContabilizada(
    asset: FixedAsset
): Promise<PostedAmortizationInfo> {
    const allEntries = await db.entries
        .filter(e =>
            e.sourceModule === 'fixed-assets' &&
            (e.sourceId === asset.id || e.metadata?.assetId === asset.id || e.metadata?.meta?.assetId === asset.id)
        )
        .toArray()

    let total = 0
    let currentYearAmort = 0
    const entries: PostedAmortizationInfo['entries'] = []

    for (const entry of allEntries) {
        const role = entry.sourceType || entry.metadata?.journalRole
        if (role !== 'opening' && role !== 'amortization') continue

        // Sum credits to contra-account (accumulated depreciation)
        const creditAmount = entry.lines
            .filter(l => l.accountId === asset.contraAccountId && l.credit > 0)
            .reduce((sum, l) => sum + l.credit, 0)

        if (creditAmount > 0) {
            total += creditAmount
            if (role === 'amortization') {
                currentYearAmort += creditAmount
            }
            entries.push({
                entryId: entry.id,
                date: entry.date,
                amount: round2(creditAmount),
                period: entry.metadata?.meta?.period || entry.metadata?.fiscalYear?.toString(),
                type: role,
            })
        }
    }

    return {
        total: round2(total),
        currentYearAmort: round2(currentYearAmort),
        entries: entries.sort((a, b) => a.date.localeCompare(b.date)),
    }
}

/**
 * Build monthly amortization entry with metadata for idempotency.
 */
export async function buildMonthlyAmortizationEntry(
    asset: FixedAsset,
    fiscalYear: number,
    month: number,
    amount: number
): Promise<JournalBuildResult> {
    if (amount <= 0) {
        return { entry: null, error: 'No hay amortizacion a registrar para este mes.' }
    }

    const accounts = await db.accounts.toArray()
    const expenseAccount = accounts.find(a => a.code === DEPRECIATION_EXPENSE_CODE)
    if (!expenseAccount) {
        return { entry: null, error: `Falta cuenta: Amortizaciones Bienes de Uso (${DEPRECIATION_EXPENSE_CODE}).` }
    }

    const contraAccount = accounts.find(a => a.id === asset.contraAccountId)
    if (!contraAccount) {
        return { entry: null, error: 'Falta cuenta de Amortizacion Acumulada vinculada al bien.' }
    }

    const monthEnd = new Date(fiscalYear, month, 0)
    const closingDate = `${fiscalYear}-${String(month).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`
    const periodStr = `${fiscalYear}-${String(month).padStart(2, '0')}`

    const roundedAmount = round2(amount)
    const lines: EntryLine[] = [
        {
            accountId: expenseAccount.id,
            debit: roundedAmount,
            credit: 0,
            description: `Amortizacion ${asset.name} (${MONTH_NAMES_ES[month - 1]})`,
        },
        {
            accountId: contraAccount.id,
            debit: 0,
            credit: roundedAmount,
            description: `Amort. Acum. ${asset.name}`,
        },
    ]

    return {
        entry: {
            date: closingDate,
            memo: `Amortizacion Bienes de Uso - ${asset.name} - ${MONTH_NAMES_ES[month - 1]} ${fiscalYear}`,
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
                meta: {
                    source: 'fixedAssets',
                    kind: 'amortization',
                    type: 'AMORTIZATION',
                    assetId: asset.id,
                    period: periodStr,
                    asOf: closingDate,
                    periodId: asset.periodId,
                    fiscalYear,
                    granularity: 'monthly',
                },
            },
        },
    }
}

/**
 * Sync (create or skip) monthly amortization entry with idempotency.
 */
export async function syncMonthlyAmortizationEntry(
    asset: FixedAsset,
    fiscalYear: number,
    month: number,
    amount: number
): Promise<{ success: boolean; entryId?: string; error?: string; status?: 'generated' | 'updated' | 'skipped' }> {
    const periodStr = `${fiscalYear}-${String(month).padStart(2, '0')}`
    if (amount <= 0) {
        return { success: false, status: 'skipped', error: 'No hay monto a registrar.' }
    }

    // Check for existing entry for this period (idempotency)
    const existing = await db.entries
        .filter(e =>
            e.sourceModule === 'fixed-assets' &&
            e.sourceId === asset.id &&
            e.sourceType === 'amortization' &&
            e.metadata?.meta?.period === periodStr
        )
        .first()

    if (existing) {
        return { success: true, entryId: existing.id, status: 'skipped' }
    }

    const { entry, error } = await buildMonthlyAmortizationEntry(asset, fiscalYear, month, amount)
    if (!entry) {
        return { success: false, error: error || 'No se pudo generar el asiento.' }
    }

    const created = await createEntry(entry)
    await updateFixedAsset(asset.id, {
        linkedJournalEntryIds: [...asset.linkedJournalEntryIds, created.id],
    })
    return { success: true, entryId: created.id, status: 'generated' }
}

/**
 * Generate all pending monthly amortization entries up to end of fiscal year.
 */
export async function syncPendingAmortizationEntries(
    asset: FixedAsset,
    fiscalYear: number
): Promise<{ success: boolean; entriesCreated: number; totalAmount: number; error?: string }> {
    const schedule = generateMonthlyDepreciationSchedule(asset, fiscalYear)
    let entriesCreated = 0
    let totalAmount = 0
    let currentAsset = asset

    for (const row of schedule) {
        if (row.devengadoMes <= 0) continue

        const result = await syncMonthlyAmortizationEntry(currentAsset, fiscalYear, row.month, row.devengadoMes)
        if (result.success && result.status === 'generated') {
            entriesCreated++
            totalAmount += row.devengadoMes
            // Refresh asset to get updated linkedJournalEntryIds
            const refreshed = await db.fixedAssets.get(asset.id)
            if (refreshed) currentAsset = refreshed
        }
    }

    return { success: true, entriesCreated, totalAmount: round2(totalAmount) }
}
