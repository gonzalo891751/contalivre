/**
 * Inversiones Module - Storage Layer
 *
 * CRUD operations and journal entry generation for investments.
 * Follows patterns from fixedAssets.ts and impuestos.ts for consistency.
 */

import { db } from './db'
import { createEntry } from './entries'
import { createAccount, generateNextCode } from './accounts'
import type { Account, JournalEntry, EntryLine } from '../core/models'
import { resolveOpeningEquityAccountId } from './openingEquity'
import {
    type InvestmentInstrument,
    type InvestmentMovement,
    type InvestmentSettings,
    type InvestmentNotification,
    type InvestmentRubro,
    type JournalPreview,
    type JournalPreviewLine,
    type InstrumentPosition,
    type RubroSummary,
    generateInstrumentId,
    generateMovementId,
    generateNotificationId,
    createDefaultSettings,
    DEFAULT_ACCOUNT_CODES,
    RESULT_ACCOUNTS,
    RUBRO_LABELS,
    RUBRO_ICONS,
} from '../core/inversiones/types'

// ========================================
// Constants
// ========================================

const SETTINGS_ID = 'inv-settings'
const SOURCE_MODULE = 'INVERSIONES'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

// ========================================
// Account Resolution Helpers
// ========================================

const findAccountByCodeOrName = (
    accounts: Account[],
    options: { codes?: string[]; names?: string[]; nameIncludes?: string[]; kind?: Account['kind'] }
): Account | null => {
    if (options.codes?.length) {
        const byCode = accounts.find(a => options.codes?.includes(a.code) && !a.isHeader)
        if (byCode) return byCode
    }
    if (options.names?.length) {
        const byName = accounts.find(a =>
            options.names?.some(name => normalizeText(a.name) === normalizeText(name)) && !a.isHeader
        )
        if (byName) return byName
    }
    if (options.nameIncludes?.length) {
        const byInclude = accounts.find(a => {
            const normalized = normalizeText(a.name)
            return options.nameIncludes?.some(token => normalized.includes(normalizeText(token))) && !a.isHeader
        })
        if (byInclude) return byInclude
    }
    if (options.kind) {
        return accounts.find(a => a.kind === options.kind && !a.isHeader) || null
    }
    return null
}

/** Resolve account for result/income types */
export function resolveResultAccount(
    accounts: Account[],
    type: keyof typeof RESULT_ACCOUNTS
): Account | null {
    const config = RESULT_ACCOUNTS[type]
    return findAccountByCodeOrName(accounts, {
        codes: [config.code],
        names: config.names,
        nameIncludes: config.names,
    })
}

/** Get or create opening balance account */
export async function ensureOpeningBalanceAccount(
    accounts: Account[]
): Promise<{ account?: Account; warning?: string; error?: string }> {
    const resolvedId = resolveOpeningEquityAccountId(accounts)
    if (resolvedId) {
        const resolved = accounts.find(a => a.id === resolvedId)
        if (resolved) return { account: resolved }
    }

    const byName = findAccountByCodeOrName(accounts, {
        names: ['Apertura / Saldos Iniciales', 'Apertura'],
        nameIncludes: ['apertura', 'saldos iniciales'],
    })
    if (byName) return { account: byName }

    const parent = accounts.find(a => a.kind === 'EQUITY' && a.isHeader) ||
        accounts.find(a => a.kind === 'EQUITY')

    if (!parent) {
        return { error: 'No existe una cuenta de Patrimonio Neto para crear Apertura.' }
    }

    try {
        const code = await generateNextCode(parent.id)
        const created = await createAccount({
            code,
            name: 'Apertura / Saldos Iniciales',
            kind: 'EQUITY',
            section: parent.section || 'CURRENT',
            group: parent.group || 'Resultados acumulados',
            statementGroup: parent.statementGroup || 'RETAINED_EARNINGS',
            parentId: parent.id,
            normalSide: 'CREDIT',
            isContra: false,
            isHeader: false,
            tags: ['opening_balance'],
        })
        return { account: created, warning: 'Cuenta Apertura creada automaticamente.' }
    } catch (err) {
        return {
            error: err instanceof Error ? err.message : 'No se pudo crear la cuenta de Apertura.',
        }
    }
}

/** Get or create instrument account (subcuenta específica) */
export async function ensureInstrumentAccount(
    instrument: InvestmentInstrument,
    accounts: Account[]
): Promise<{ account?: Account; warning?: string; error?: string }> {
    // If already linked, return it
    if (instrument.accountId) {
        const existing = accounts.find(a => a.id === instrument.accountId)
        if (existing) return { account: existing }
    }

    // Find parent account for this rubro
    const rubroConfig = DEFAULT_ACCOUNT_CODES[instrument.rubro]
    const parent = accounts.find(a => a.code === rubroConfig.parent && a.isHeader) ||
        accounts.find(a => a.code.startsWith(rubroConfig.prefix.split('.').slice(0, 3).join('.')) && a.isHeader)

    if (!parent) {
        return { error: `No se encuentra cuenta padre para ${RUBRO_LABELS[instrument.rubro]}` }
    }

    // Check if account already exists by ticker
    const existingByName = accounts.find(a =>
        normalizeText(a.name).includes(normalizeText(instrument.ticker)) &&
        a.code.startsWith(rubroConfig.prefix)
    )
    if (existingByName) {
        return { account: existingByName }
    }

    // Create new account
    try {
        const code = await generateNextCode(parent.id)
        const accountName = instrument.name || instrument.ticker
        const created = await createAccount({
            code,
            name: accountName,
            kind: 'ASSET',
            section: instrument.rubro === 'VPP' ? 'NON_CURRENT' : 'CURRENT',
            group: parent.group || RUBRO_LABELS[instrument.rubro],
            statementGroup: 'INVESTMENTS',
            parentId: parent.id,
            normalSide: 'DEBIT',
            isContra: false,
            isHeader: false,
            tags: ['investment', instrument.rubro.toLowerCase()],
        })
        return { account: created, warning: `Cuenta ${code} creada para ${accountName}.` }
    } catch (err) {
        return {
            error: err instanceof Error ? err.message : 'No se pudo crear la cuenta del instrumento.',
        }
    }
}

// ========================================
// Settings CRUD
// ========================================

/** Load investment settings */
export async function loadInvestmentSettings(): Promise<InvestmentSettings> {
    const existing = await db.invSettings.get(SETTINGS_ID)
    if (existing) return existing

    const defaults: InvestmentSettings = {
        id: SETTINGS_ID,
        ...createDefaultSettings(),
        updatedAt: new Date().toISOString(),
    }
    await db.invSettings.put(defaults)
    return defaults
}

/** Save investment settings */
export async function saveInvestmentSettings(settings: Partial<InvestmentSettings>): Promise<InvestmentSettings> {
    const current = await loadInvestmentSettings()
    const updated: InvestmentSettings = {
        ...current,
        ...settings,
        id: SETTINGS_ID,
        updatedAt: new Date().toISOString(),
    }
    await db.invSettings.put(updated)
    return updated
}

async function enableRubroForPeriod(periodId: string | undefined, rubro: InvestmentRubro): Promise<void> {
    if (!periodId) return
    const current = await loadInvestmentSettings()
    const enabled = { ...(current.enabledRubros || {}) }
    const set = new Set<InvestmentRubro>(enabled[periodId] || [])
    if (set.has(rubro)) return
    set.add(rubro)
    enabled[periodId] = Array.from(set)
    await saveInvestmentSettings({ enabledRubros: enabled })
}

// ========================================
// Instruments CRUD
// ========================================

/** Get all instruments for a period */
export async function getAllInstruments(periodId?: string): Promise<InvestmentInstrument[]> {
    const instruments = await db.invInstruments.toArray()
    if (!periodId) return instruments
    return instruments.filter(i => i.periodId === periodId || !i.periodId)
}

/** Get instruments by rubro */
export async function getInstrumentsByRubro(rubro: InvestmentRubro, periodId?: string): Promise<InvestmentInstrument[]> {
    let instruments = await db.invInstruments.where('rubro').equals(rubro).toArray()
    if (periodId) {
        instruments = instruments.filter(i => i.periodId === periodId || !i.periodId)
    }
    return instruments
}

/** Get instrument by ID */
export async function getInstrumentById(id: string): Promise<InvestmentInstrument | undefined> {
    return db.invInstruments.get(id)
}

/** Create instrument */
export async function createInstrument(
    data: Omit<InvestmentInstrument, 'id' | 'createdAt' | 'updatedAt'>
): Promise<InvestmentInstrument> {
    const now = new Date().toISOString()
    const instrument: InvestmentInstrument = {
        ...data,
        id: generateInstrumentId(),
        createdAt: now,
        updatedAt: now,
    }
    await db.invInstruments.add(instrument)
    // Auto-habilitar rubro cuando se crea el primer instrumento del rubro/ejercicio
    try {
        await enableRubroForPeriod(instrument.periodId, instrument.rubro)
    } catch {
        // Non-blocking: settings are optional UX state
    }
    return instrument
}

/** Update instrument */
export async function updateInstrument(
    id: string,
    updates: Partial<Omit<InvestmentInstrument, 'id' | 'createdAt'>>
): Promise<InvestmentInstrument> {
    const existing = await db.invInstruments.get(id)
    if (!existing) throw new Error('Instrumento no encontrado')

    const updated: InvestmentInstrument = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    }
    await db.invInstruments.put(updated)
    return updated
}

/** Delete instrument (only if no movements) */
export async function deleteInstrument(id: string): Promise<{ success: boolean; error?: string }> {
    const movements = await db.invMovements.where('instrumentId').equals(id).count()
    if (movements > 0) {
        return { success: false, error: 'El instrumento tiene movimientos asociados.' }
    }
    await db.invInstruments.delete(id)
    return { success: true }
}

// ========================================
// Movements CRUD
// ========================================

/** Get all movements for a period */
export async function getAllMovements(periodId?: string): Promise<InvestmentMovement[]> {
    const movements = await db.invMovements.toArray()
    if (!periodId) return movements
    return movements.filter(m => m.periodId === periodId || !m.periodId)
}

/** Get movements by instrument */
export async function getMovementsByInstrument(instrumentId: string): Promise<InvestmentMovement[]> {
    return db.invMovements.where('instrumentId').equals(instrumentId).toArray()
}

/** Get movements by rubro */
export async function getMovementsByRubro(rubro: InvestmentRubro, periodId?: string): Promise<InvestmentMovement[]> {
    let movements = await db.invMovements.where('rubro').equals(rubro).toArray()
    if (periodId) {
        movements = movements.filter(m => m.periodId === periodId || !m.periodId)
    }
    return movements.sort((a, b) => a.date.localeCompare(b.date))
}

/** Get movement by ID */
export async function getMovementById(id: string): Promise<InvestmentMovement | undefined> {
    return db.invMovements.get(id)
}

/** Create movement */
export async function createMovement(
    data: Omit<InvestmentMovement, 'id' | 'createdAt' | 'updatedAt'>
): Promise<InvestmentMovement> {
    const now = new Date().toISOString()
    const movement: InvestmentMovement = {
        ...data,
        id: generateMovementId(),
        createdAt: now,
        updatedAt: now,
    }
    await db.invMovements.add(movement)
    return movement
}

/** Update movement */
export async function updateMovement(
    id: string,
    updates: Partial<Omit<InvestmentMovement, 'id' | 'createdAt'>>
): Promise<InvestmentMovement> {
    const existing = await db.invMovements.get(id)
    if (!existing) throw new Error('Movimiento no encontrado')

    const updated: InvestmentMovement = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    }
    await db.invMovements.put(updated)
    return updated
}

/** Delete movement (cascades to journal entry) */
export async function deleteMovement(id: string): Promise<{ success: boolean; error?: string }> {
    const movement = await db.invMovements.get(id)
    if (!movement) return { success: false, error: 'Movimiento no encontrado' }

    // Delete linked journal entry if exists
    if (movement.journalEntryId) {
        await db.entries.delete(movement.journalEntryId)
    }

    await db.invMovements.delete(id)
    return { success: true }
}

// ========================================
// Costing (PPP/FIFO/UEPS)
// ========================================

/** Calculate PPP (Precio Promedio Ponderado) for an instrument */
export async function calculatePPP(instrumentId: string): Promise<{ quantity: number; totalCost: number; ppp: number }> {
    const movements = await getMovementsByInstrument(instrumentId)

    let quantity = 0
    let totalCost = 0

    for (const mov of movements.sort((a, b) => a.date.localeCompare(b.date))) {
        if (mov.type === 'BUY' || mov.type === 'OPENING' || mov.type === 'VPP_ALTA' || mov.type === 'PF_CONSTITUTE') {
            const qty = mov.quantity || 1
            const cost = mov.amount + (mov.fees || 0) // Include fees in cost basis
            quantity += qty
            totalCost += cost
        } else if (mov.type === 'SELL' || mov.type === 'PF_MATURITY') {
            const qty = mov.quantity || 1
            const costToRemove = quantity > 0 ? (totalCost / quantity) * qty : 0
            quantity -= qty
            totalCost -= costToRemove
        }
    }

    const ppp = quantity > 0 ? round2(totalCost / quantity) : 0
    return { quantity, totalCost: round2(totalCost), ppp }
}

/** Calculate cost for a sale using PPP */
export async function calculateSaleCostPPP(
    instrumentId: string,
    sellQuantity: number,
    _sellDate?: string // Reserved for future FIFO/UEPS date-based costing
): Promise<{ costAssigned: number; gainLoss: number; error?: string }> {
    void _sellDate
    const { quantity, ppp } = await calculatePPP(instrumentId)

    if (sellQuantity > quantity) {
        return { costAssigned: 0, gainLoss: 0, error: `Cantidad insuficiente. Disponible: ${quantity}` }
    }

    const costAssigned = round2(ppp * sellQuantity)
    return { costAssigned, gainLoss: 0 }
}

// ========================================
// Journal Entry Generation
// ========================================

/** Build journal entry preview for a movement */
export async function buildJournalPreview(
    movement: Omit<InvestmentMovement, 'id' | 'createdAt' | 'updatedAt'>,
    instrument?: InvestmentInstrument
): Promise<JournalPreview> {
    const accounts = await db.accounts.toArray()
    const lines: JournalPreviewLine[] = []
    let memo = ''
    let error: string | undefined
    let warning: string | undefined

    const requiresContraAccount =
        movement.type === 'BUY' ||
        movement.type === 'SELL' ||
        movement.type === 'INCOME' ||
        movement.type === 'PF_CONSTITUTE' ||
        movement.type === 'PF_MATURITY' ||
        movement.type === 'VPP_ALTA'

    const contraAccountId = movement.contraAccountId
    const contraAccount = contraAccountId ? accounts.find(a => a.id === contraAccountId) : undefined

    if (requiresContraAccount && !contraAccount) {
        error = 'Cuenta contrapartida requerida'
        return { lines, totalDebit: 0, totalCredit: 0, isBalanced: false, memo: '', date: movement.date, error }
    }

    if (contraAccount?.isHeader) {
        error = 'La cuenta contrapartida debe ser imputable (no cabecera)'
        return { lines, totalDebit: 0, totalCredit: 0, isBalanced: false, memo: '', date: movement.date, error }
    }

    // Get or resolve instrument account
    let instrumentAccount: Account | undefined
    if (instrument) {
        const result = await ensureInstrumentAccount(instrument, accounts)
        if (result.account) {
            instrumentAccount = result.account
            if (result.warning) warning = result.warning
        } else {
            error = result.error
        }
    }

    switch (movement.type) {
        case 'BUY':
        case 'OPENING': {
            // Debe: Cuenta instrumento
            // Debe: IVA CF (si hay IVA sobre comisiones)
            // Haber: Contrapartida (Banco/Caja)
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            const netAmount = movement.amount + (movement.fees || 0)
            const ivaAmount = movement.feesIva || 0

            lines.push({
                accountId: instrumentAccount.id,
                accountCode: instrumentAccount.code,
                accountName: instrumentAccount.name,
                debit: movement.amount + (movement.fees || 0),
                credit: 0,
                description: movement.type === 'OPENING' ? 'Apertura inversión' : `Compra ${instrument?.ticker || ''}`,
            })

            if (ivaAmount > 0) {
                const ivaCF = findAccountByCodeOrName(accounts, {
                    codes: ['1.1.03.01'],
                    names: ['IVA Credito Fiscal', 'IVA CF'],
                })
                if (ivaCF) {
                    lines.push({
                        accountId: ivaCF.id,
                        accountCode: ivaCF.code,
                        accountName: ivaCF.name,
                        debit: ivaAmount,
                        credit: 0,
                        description: 'IVA sobre comisiones',
                    })
                }
            }

            if (movement.type === 'OPENING') {
                const openingResult = await ensureOpeningBalanceAccount(accounts)
                if (openingResult.account) {
                    lines.push({
                        accountId: openingResult.account.id,
                        accountCode: openingResult.account.code,
                        accountName: openingResult.account.name,
                        debit: 0,
                        credit: netAmount + ivaAmount,
                        description: 'Saldo inicial inversión',
                    })
                }
            } else {
                lines.push({
                    accountId: contraAccount!.id,
                    accountCode: contraAccount!.code,
                    accountName: contraAccount!.name,
                    debit: 0,
                    credit: netAmount + ivaAmount,
                    description: `Pago compra ${instrument?.ticker || ''}`,
                })
            }

            memo = movement.type === 'OPENING'
                ? `Apertura ${instrument?.name || instrument?.ticker || 'inversión'}`
                : `Compra ${instrument?.ticker || ''} - ${movement.quantity || 1} @ ${movement.price || movement.amount}`
            break
        }

        case 'SELL': {
            // Debe: Banco (neto recibido)
            // Haber: Cuenta instrumento (costo de baja)
            // Debe/Haber: Resultado (ganancia o pérdida)
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            // Validate quantity: cannot sell more than owned
            if (instrument && movement.quantity) {
                const { quantity: ownedQty } = await calculatePPP(instrument.id)
                if (movement.quantity > ownedQty) {
                    error = `Cantidad insuficiente. Disponible: ${ownedQty}, Solicitado: ${movement.quantity}`
                    break
                }
            }

            const netReceived = movement.amount - (movement.fees || 0) - (movement.feesIva || 0)
            const costAssigned = movement.costAssigned || movement.amount // If not calculated, use amount
            const gainLoss = netReceived - costAssigned

            lines.push({
                accountId: contraAccount!.id,
                accountCode: contraAccount!.code,
                accountName: contraAccount!.name,
                debit: netReceived,
                credit: 0,
                description: `Cobro venta ${instrument?.ticker || ''}`,
            })

            lines.push({
                accountId: instrumentAccount.id,
                accountCode: instrumentAccount.code,
                accountName: instrumentAccount.name,
                debit: 0,
                credit: costAssigned,
                description: `Baja ${instrument?.ticker || ''} (costo)`,
            })

            if (gainLoss !== 0) {
                const resultAccount = resolveResultAccount(accounts, 'RESULTADO_VENTA')
                if (resultAccount) {
                    if (gainLoss > 0) {
                        lines.push({
                            accountId: resultAccount.id,
                            accountCode: resultAccount.code,
                            accountName: resultAccount.name,
                            debit: 0,
                            credit: gainLoss,
                            description: 'Ganancia por venta',
                        })
                    } else {
                        lines.push({
                            accountId: resultAccount.id,
                            accountCode: resultAccount.code,
                            accountName: resultAccount.name,
                            debit: Math.abs(gainLoss),
                            credit: 0,
                            description: 'Pérdida por venta',
                        })
                    }
                }
            }

            memo = `Venta ${instrument?.ticker || ''} - ${movement.quantity || 1} unidades`
            break
        }

        case 'INCOME': {
            // Debe: Banco
            // Haber: Dividendos/Intereses ganados
            const incomeAccount = movement.rubro === 'PLAZO_FIJO'
                ? resolveResultAccount(accounts, 'INTERESES_GANADOS')
                : movement.rubro === 'RENTAS'
                    ? resolveResultAccount(accounts, 'ALQUILERES_GANADOS')
                    : resolveResultAccount(accounts, 'DIVIDENDOS_GANADOS')

            lines.push({
                accountId: contraAccount!.id,
                accountCode: contraAccount!.code,
                accountName: contraAccount!.name,
                debit: movement.amount,
                credit: 0,
                description: `Cobro ${movement.rubro === 'RENTAS' ? 'alquiler' : 'dividendo/interés'}`,
            })

            if (incomeAccount) {
                lines.push({
                    accountId: incomeAccount.id,
                    accountCode: incomeAccount.code,
                    accountName: incomeAccount.name,
                    debit: 0,
                    credit: movement.amount,
                    description: `${movement.rubro === 'RENTAS' ? 'Alquiler' : 'Dividendo/Interés'} ${instrument?.ticker || ''}`,
                })
            }

            memo = `Cobro ${movement.rubro === 'RENTAS' ? 'alquiler' : movement.rubro === 'PLAZO_FIJO' ? 'interés' : 'dividendo'} ${instrument?.ticker || ''}`
            break
        }

        case 'VALUATION': {
            // Ajuste por tenencia
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            const diff = movement.valuationDiff || 0
            if (diff === 0) {
                warning = 'Sin diferencia de valuación'
                break
            }

            const tenenciaAccount = resolveResultAccount(accounts, 'RESULTADO_TENENCIA')

            if (diff > 0) {
                // Sube valor: Debe instrumento, Haber resultado
                lines.push({
                    accountId: instrumentAccount.id,
                    accountCode: instrumentAccount.code,
                    accountName: instrumentAccount.name,
                    debit: diff,
                    credit: 0,
                    description: 'Ajuste valuación al alza',
                })
                if (tenenciaAccount) {
                    lines.push({
                        accountId: tenenciaAccount.id,
                        accountCode: tenenciaAccount.code,
                        accountName: tenenciaAccount.name,
                        debit: 0,
                        credit: diff,
                        description: 'Resultado por tenencia',
                    })
                }
            } else {
                // Baja valor: Debe resultado, Haber instrumento
                if (tenenciaAccount) {
                    lines.push({
                        accountId: tenenciaAccount.id,
                        accountCode: tenenciaAccount.code,
                        accountName: tenenciaAccount.name,
                        debit: Math.abs(diff),
                        credit: 0,
                        description: 'Resultado por tenencia (pérdida)',
                    })
                }
                lines.push({
                    accountId: instrumentAccount.id,
                    accountCode: instrumentAccount.code,
                    accountName: instrumentAccount.name,
                    debit: 0,
                    credit: Math.abs(diff),
                    description: 'Ajuste valuación a la baja',
                })
            }

            memo = `Valuación cierre ${instrument?.ticker || ''}`
            break
        }

        case 'PF_CONSTITUTE': {
            // Debe: Plazo fijo
            // Haber: Banco
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            lines.push({
                accountId: instrumentAccount.id,
                accountCode: instrumentAccount.code,
                accountName: instrumentAccount.name,
                debit: movement.pfCapital || movement.amount,
                credit: 0,
                description: `Constitución PF ${instrument?.pfBankName || ''}`,
            })

            lines.push({
                accountId: contraAccount!.id,
                accountCode: contraAccount!.code,
                accountName: contraAccount!.name,
                debit: 0,
                credit: movement.pfCapital || movement.amount,
                description: 'Transferencia a plazo fijo',
            })

            memo = `Constitución PF ${instrument?.pfBankName || ''} - Capital ${movement.pfCapital || movement.amount}`
            break
        }

        case 'PF_MATURITY': {
            // Debe: Banco (capital + interés)
            // Haber: Plazo fijo (capital)
            // Haber: Intereses ganados
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            const capital = movement.pfCapital || 0
            const interest = movement.pfInterestActual || movement.pfInterestExpected || 0
            const total = capital + interest

            lines.push({
                accountId: contraAccount!.id,
                accountCode: contraAccount!.code,
                accountName: contraAccount!.name,
                debit: total,
                credit: 0,
                description: `Cobro PF vencido`,
            })

            lines.push({
                accountId: instrumentAccount.id,
                accountCode: instrumentAccount.code,
                accountName: instrumentAccount.name,
                debit: 0,
                credit: capital,
                description: 'Baja capital PF',
            })

            const interestAccount = resolveResultAccount(accounts, 'INTERESES_GANADOS')
            if (interestAccount && interest > 0) {
                lines.push({
                    accountId: interestAccount.id,
                    accountCode: interestAccount.code,
                    accountName: interestAccount.name,
                    debit: 0,
                    credit: interest,
                    description: 'Intereses ganados PF',
                })
            }

            memo = `Vencimiento PF ${instrument?.pfBankName || ''} - Capital ${capital} + Interés ${interest}`
            break
        }

        case 'VPP_ALTA': {
            // Debe: Inversiones permanentes
            // Haber: Banco/Apertura
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            lines.push({
                accountId: instrumentAccount.id,
                accountCode: instrumentAccount.code,
                accountName: instrumentAccount.name,
                debit: movement.amount,
                credit: 0,
                description: `Alta VPP ${instrument?.vppCompanyName || ''}`,
            })

            lines.push({
                accountId: contraAccount!.id,
                accountCode: contraAccount!.code,
                accountName: contraAccount!.name,
                debit: 0,
                credit: movement.amount,
                description: `Pago participación ${instrument?.vppCompanyName || ''}`,
            })

            memo = `Alta VPP ${instrument?.vppCompanyName || ''} - ${instrument?.vppPercentage || 0}%`
            break
        }

        case 'VPP_UPDATE': {
            // Ajuste por variación PN
            if (!instrumentAccount) {
                error = 'Cuenta del instrumento no configurada'
                break
            }

            const diff = (movement.vppCarryingValue || 0) - (movement.vppPreviousValue || 0)
            if (diff === 0) {
                warning = 'Sin variación en VPP'
                break
            }

            const vppResultAccount = resolveResultAccount(accounts, 'RESULTADO_VPP')

            if (diff > 0) {
                lines.push({
                    accountId: instrumentAccount.id,
                    accountCode: instrumentAccount.code,
                    accountName: instrumentAccount.name,
                    debit: diff,
                    credit: 0,
                    description: 'Ajuste VPP al alza',
                })
                if (vppResultAccount) {
                    lines.push({
                        accountId: vppResultAccount.id,
                        accountCode: vppResultAccount.code,
                        accountName: vppResultAccount.name,
                        debit: 0,
                        credit: diff,
                        description: 'Resultado por VPP',
                    })
                }
            } else {
                if (vppResultAccount) {
                    lines.push({
                        accountId: vppResultAccount.id,
                        accountCode: vppResultAccount.code,
                        accountName: vppResultAccount.name,
                        debit: Math.abs(diff),
                        credit: 0,
                        description: 'Resultado por VPP (pérdida)',
                    })
                }
                lines.push({
                    accountId: instrumentAccount.id,
                    accountCode: instrumentAccount.code,
                    accountName: instrumentAccount.name,
                    debit: 0,
                    credit: Math.abs(diff),
                    description: 'Ajuste VPP a la baja',
                })
            }

            memo = `Ajuste VPP ${instrument?.vppCompanyName || ''}`
            break
        }

        default:
            warning = `Tipo de movimiento no soportado: ${movement.type}`
    }

    const totalDebit = round2(lines.reduce((sum, l) => sum + l.debit, 0))
    const totalCredit = round2(lines.reduce((sum, l) => sum + l.credit, 0))
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

    return {
        lines,
        totalDebit,
        totalCredit,
        isBalanced,
        memo,
        date: movement.date,
        warning,
        error,
    }
}

/** Create journal entry from preview and link to movement */
export async function createJournalEntryFromMovement(
    movementId: string,
    preview: JournalPreview
): Promise<{ entry?: JournalEntry; error?: string }> {
    // Idempotence check: if movement already has a journal entry, don't create another
    const movement = await db.invMovements.get(movementId)
    if (movement?.journalEntryId) {
        const existingEntry = await db.entries.get(movement.journalEntryId)
        if (existingEntry) {
            return { entry: existingEntry as JournalEntry }
        }
    }

    if (!preview.isBalanced) {
        return { error: 'El asiento no está balanceado' }
    }

    if (preview.lines.length === 0) {
        return { error: 'El asiento no tiene líneas' }
    }

    const entryLines: EntryLine[] = preview.lines.map(l => ({
        accountId: l.accountId || '',
        debit: l.debit,
        credit: l.credit,
        description: l.description,
    }))

    const entry = await createEntry({
        date: preview.date,
        memo: preview.memo,
        lines: entryLines,
        sourceModule: SOURCE_MODULE,
        sourceId: movementId,
        metadata: {
            generatedBy: 'inversiones',
            movementId,
        },
    })

    // Link entry to movement
    await updateMovement(movementId, { journalEntryId: entry.id })

    return { entry }
}

// ========================================
// Position & Summary Calculations
// ========================================

/** Calculate position for an instrument */
export async function calculateInstrumentPosition(instrument: InvestmentInstrument): Promise<InstrumentPosition> {
    const { quantity, totalCost, ppp } = await calculatePPP(instrument.id)
    const movements = await getMovementsByInstrument(instrument.id)

    // Calculate realized gains and income
    let realizedGainLoss = 0
    let totalIncome = 0
    let lastValuationDate: string | undefined
    let currentPrice: number | undefined

    for (const mov of movements) {
        if (mov.type === 'SELL' && mov.gainLoss) {
            realizedGainLoss += mov.gainLoss
        }
        if (mov.type === 'INCOME' || mov.type === 'VPP_DIVIDEND' || mov.type === 'PF_MATURITY') {
            if (mov.type === 'PF_MATURITY') {
                totalIncome += mov.pfInterestActual || mov.pfInterestExpected || 0
            } else {
                totalIncome += mov.amount
            }
        }
        if (mov.type === 'VALUATION') {
            lastValuationDate = mov.date
            currentPrice = mov.valuationPrice
        }
    }

    const currentValue = currentPrice && quantity > 0 ? round2(currentPrice * quantity) : undefined
    const unrealizedGainLoss = currentValue ? round2(currentValue - totalCost) : undefined

    return {
        instrument,
        currentQuantity: quantity,
        averageCost: ppp,
        totalCost,
        currentPrice,
        currentValue,
        unrealizedGainLoss,
        realizedGainLoss,
        totalIncome,
        hasValuation: !!lastValuationDate,
        lastValuationDate,
    }
}

/** Calculate summary for a rubro */
export async function calculateRubroSummary(rubro: InvestmentRubro, periodId?: string): Promise<RubroSummary> {
    const instruments = await getInstrumentsByRubro(rubro, periodId)
    const positions: InstrumentPosition[] = []

    let totalValue = 0
    let totalCost = 0
    let unrealizedGainLoss = 0
    let realizedGainLoss = 0
    let totalIncome = 0
    let pendingValuations = 0

    for (const instrument of instruments) {
        const position = await calculateInstrumentPosition(instrument)
        positions.push(position)

        totalCost += position.totalCost
        totalValue += position.currentValue || position.totalCost
        unrealizedGainLoss += position.unrealizedGainLoss || 0
        realizedGainLoss += position.realizedGainLoss
        totalIncome += position.totalIncome

        if (!position.hasValuation && position.currentQuantity > 0) {
            pendingValuations++
        }
    }

    let status: 'ok' | 'warning' | 'error' = 'ok'
    let statusMessage: string | undefined

    if (pendingValuations > 0) {
        status = 'warning'
        statusMessage = `${pendingValuations} instrumento(s) sin valuación`
    }

    return {
        rubro,
        label: RUBRO_LABELS[rubro],
        icon: RUBRO_ICONS[rubro],
        totalValue,
        totalCost,
        unrealizedGainLoss,
        realizedGainLoss,
        totalIncome,
        instrumentCount: instruments.length,
        positions,
        status,
        statusMessage,
        pendingValuations,
    }
}

// ========================================
// Notifications
// ========================================

/** Check and create PF maturity notifications */
export async function checkPFMaturityNotifications(periodId?: string): Promise<InvestmentNotification[]> {
    const settings = await loadInvestmentSettings()
    const daysThreshold = settings.pfNotificationDays || 7

    const instruments = await getInstrumentsByRubro('PLAZO_FIJO', periodId)
    const movements = await getMovementsByRubro('PLAZO_FIJO', periodId)
    const notifications: InvestmentNotification[] = []

    // Find active PFs (constituted but not matured)
    const activePFs = new Map<string, { instrument: InvestmentInstrument; constituteMovement: InvestmentMovement }>()

    for (const mov of movements) {
        if (mov.type === 'PF_CONSTITUTE' && mov.instrumentId) {
            const instrument = instruments.find(i => i.id === mov.instrumentId)
            if (instrument) {
                activePFs.set(mov.instrumentId, { instrument, constituteMovement: mov })
            }
        }
        if ((mov.type === 'PF_MATURITY' || mov.type === 'PF_RENEW') && mov.instrumentId) {
            activePFs.delete(mov.instrumentId)
        }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const [instrumentId, { instrument, constituteMovement }] of activePFs) {
        const endDate = constituteMovement.pfEndDate
        if (!endDate) continue

        const maturityDate = new Date(endDate)
        maturityDate.setHours(0, 0, 0, 0)

        const daysUntilMaturity = Math.ceil((maturityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilMaturity <= daysThreshold && daysUntilMaturity >= 0) {
            // Check if notification already exists
            const existing = await db.invNotifications
                .where({ type: 'PF_MATURITY', instrumentId })
                .first()

            if (!existing) {
                const notification: InvestmentNotification = {
                    id: generateNotificationId(),
                    type: 'PF_MATURITY',
                    instrumentId,
                    title: `Plazo Fijo ${instrument.pfBankName || instrument.name} vence pronto`,
                    description: daysUntilMaturity === 0
                        ? 'Vence hoy'
                        : `Vence en ${daysUntilMaturity} días (${endDate})`,
                    dueDate: endDate,
                    seen: false,
                    dismissed: false,
                    createdAt: new Date().toISOString(),
                }
                await db.invNotifications.add(notification)
                notifications.push(notification)
            }
        }
    }

    return notifications
}

/** Get all investment notifications */
export async function getInvestmentNotifications(): Promise<InvestmentNotification[]> {
    return db.invNotifications.toArray()
}

/** Mark notification as seen */
export async function markNotificationSeen(id: string): Promise<void> {
    await db.invNotifications.update(id, { seen: true })
}

/** Dismiss notification */
export async function dismissNotification(id: string): Promise<void> {
    await db.invNotifications.update(id, { dismissed: true })
}

// ========================================
// Sync with Cierre/Valuación
// ========================================

/** Sync valuations from CierreValuacion state */
export async function syncFromCierreValuacion(): Promise<{ synced: number; errors: string[] }> {
    const state = await db.cierreValuacionState.where('id').equals('cierre-valuacion-state').first()
    if (!state) {
        return { synced: 0, errors: ['No hay datos de Cierre/Valuación'] }
    }

    const accounts = await db.accounts.toArray()
    const instruments = await getAllInstruments()
    const errors: string[] = []
    let synced = 0

    // Map valuations by account code
    const valuationsByCode = new Map<string, { valCorriente: number; resTenencia: number }>()

    if (state.valuations) {
        for (const [itemId, valuation] of Object.entries(state.valuations)) {
            // Find the RT6 item to get the account code
            const rt6Item = state.partidasRT6?.find((p: { id: string }) => p.id === itemId)
            if (rt6Item && rt6Item.cuentaCodigo) {
                const val = valuation as { valCorriente?: number; resTenencia?: number }
                valuationsByCode.set(rt6Item.cuentaCodigo, {
                    valCorriente: val.valCorriente ?? 0,
                    resTenencia: val.resTenencia ?? 0,
                })
            }
        }
    }

    // Update instruments with matched valuations
    for (const instrument of instruments) {
        const account = accounts.find(a => a.id === instrument.accountId)
        if (!account) continue

        const valuation = valuationsByCode.get(account.code)
        if (valuation) {
            // Mark as synced - actual valuation movement should be created by user
            synced++
        }
    }

    // Update settings with sync timestamp
    await saveInvestmentSettings({
        lastSyncDate: new Date().toISOString(),
        lastSyncStatus: errors.length > 0 ? 'warning' : 'ok',
    })

    return { synced, errors }
}

// ========================================
// Metrics for Dashboard
// ========================================

/** Get investment metrics for the operations page card */
export async function getInvestmentMetrics(periodId?: string): Promise<{
    hasData: boolean
    totalValue: number
    totalGainLoss: number
    pendingAlerts: number
}> {
    const rubros: InvestmentRubro[] = ['ACCIONES', 'BONOS', 'FCI', 'PLAZO_FIJO', 'CRIPTO', 'RENTAS', 'VPP']

    let totalValue = 0
    let totalGainLoss = 0
    let pendingAlerts = 0
    let hasData = false

    for (const rubro of rubros) {
        const summary = await calculateRubroSummary(rubro, periodId)
        totalValue += summary.totalValue
        totalGainLoss += summary.unrealizedGainLoss + summary.realizedGainLoss
        pendingAlerts += summary.pendingValuations

        if (summary.instrumentCount > 0) {
            hasData = true
        }
    }

    // Add PF maturity alerts
    await checkPFMaturityNotifications(periodId)
    const notifications = await getInvestmentNotifications()
    pendingAlerts += notifications.filter(n => !n.dismissed && !n.seen).length

    return {
        hasData,
        totalValue: round2(totalValue),
        totalGainLoss: round2(totalGainLoss),
        pendingAlerts,
    }
}
