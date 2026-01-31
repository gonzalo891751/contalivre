/**
 * Bienes de Cambio - Storage Layer
 *
 * CRUD operations for the new costing-based inventory module.
 * Uses Dexie (IndexedDB) for persistence.
 */

import { db } from './db'
import type { Account, JournalEntry, EntryLine } from '../core/models'
import type {
    BienesProduct,
    BienesMovement,
    BienesSettings,
    CostingMethod,
    AccountMappingKey,
} from '../core/inventario/types'
import {
    createDefaultBienesSettings,
    generateInventoryId,
} from '../core/inventario/types'
import {
    calculateExitCost,
    calculateProductValuation,
    canChangeCostingMethod,
} from '../core/inventario/costing'
import { createEntry } from './entries'

const ACCOUNT_FALLBACKS: Record<string, { code: string; names: string[] }> = {
    mercaderias: { code: '1.1.04.01', names: ['Mercaderias'] },
    ivaCF: { code: '1.1.03.01', names: ['IVA Credito Fiscal'] },
    ivaDF: { code: '2.1.03.01', names: ['IVA Debito Fiscal'] },
    ventas: { code: '4.1.01', names: ['Ventas'] },
    cmv: { code: '4.3.01', names: ['Costo mercaderias vendidas'] },
    compras: { code: '4.8.01', names: ['Compras'] },
    diferenciaInventario: { code: '4.3.02', names: ['Diferencia de inventario'] },
    aperturaInventario: { code: '3.2.01', names: ['Apertura inventario', 'Resultados acumulados'] },
    gastosCompras: { code: '4.8.02', names: ['Gastos sobre compras', 'Gastos s/compras'] },
    bonifCompras: { code: '4.8.03', names: ['Bonificaciones sobre compras', 'Bonif. s/compras'] },
    devolCompras: { code: '4.8.04', names: ['Devoluciones sobre compras', 'Devol. s/compras'] },
    bonifVentas: { code: '4.8.05', names: ['Bonificaciones sobre ventas', 'Bonif. s/ventas'] },
    devolVentas: { code: '4.8.06', names: ['Devoluciones sobre ventas', 'Devol. s/ventas'] },
    descuentosObtenidos: { code: '4.6.09', names: ['Descuentos obtenidos'] },
    descuentosOtorgados: { code: '4.2.01', names: ['Descuentos otorgados'] },
    caja: { code: '1.1.01.01', names: ['Caja'] },
    banco: { code: '1.1.01.02', names: ['Bancos cuenta corriente', 'Banco cuenta corriente', 'Bancos'] },
    proveedores: { code: '2.1.01.01', names: ['Proveedores'] },
    deudores: { code: '1.1.02.01', names: ['Deudores por ventas'] },
}

const ACCOUNT_CODE_ALIASES: Partial<Record<keyof typeof ACCOUNT_FALLBACKS, { codes: string[]; nameAny?: string[] }>> = {
    compras: { codes: ['5.1.03'], nameAny: ['compra'] },
    gastosCompras: { codes: ['5.1.04', '4.8.03', '5.1.05'], nameAny: ['gasto', 'flete', 'seguro'] },
    bonifCompras: { codes: ['5.1.05', '4.8.02', '5.1.04'], nameAny: ['bonif'] },
    devolCompras: { codes: ['5.1.06'], nameAny: ['devol'] },
    bonifVentas: { codes: ['4.1.03'], nameAny: ['bonif'] },
    devolVentas: { codes: ['4.1.04'], nameAny: ['devol'] },
}

const normalizeText = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const matchesPeriod = (itemPeriodId: string | undefined, periodId?: string) => {
    if (!periodId) return true
    // Legacy data (undefined periodId) is assumed to be 2025. 
    // This prevents old data from appearing in new exercises (e.g. 2026).
    const effectiveItemPeriod = itemPeriodId || '2025'
    return effectiveItemPeriod === periodId
}

const resolveAccountByIdOrCode = (accounts: Account[], idOrCode?: string) => {
    if (!idOrCode) return null
    return accounts.find(a => a.id === idOrCode) || accounts.find(a => a.code === idOrCode) || null
}

const resolveAccountId = (
    accounts: Account[],
    options: { mappedId?: string | null; code?: string; names?: string[] }
): string | null => {
    const direct = resolveAccountByIdOrCode(accounts, options.mappedId || undefined)
    if (direct) return direct.id
    if (options.code) {
        const byCode = accounts.find(a => a.code === options.code)
        if (byCode) return byCode.id
    }
    if (options.names && options.names.length > 0) {
        const targets = options.names.map(normalizeText)
        const byName = accounts.find(a => targets.includes(normalizeText(a.name)))
        if (byName) return byName.id
    }
    return null
}

const resolveMappedAccountId = (
    accounts: Account[],
    settings: BienesSettings,
    key: AccountMappingKey,
    fallbackKey: keyof typeof ACCOUNT_FALLBACKS
) => {
    const mappedId = settings.accountMappings?.[key] || null
    const fallback = ACCOUNT_FALLBACKS[fallbackKey]
    const resolved = resolveAccountId(accounts, {
        mappedId,
        code: fallback?.code,
        names: fallback?.names,
    })
    if (resolved) return resolved

    const alias = ACCOUNT_CODE_ALIASES[fallbackKey]
    if (alias?.codes && alias.codes.length > 0) {
        for (const code of alias.codes) {
            const acc = accounts.find(a => a.code === code)
            if (!acc) continue
            if (!alias.nameAny || alias.nameAny.length === 0) return acc.id
            const name = normalizeText(acc.name)
            if (alias.nameAny.some(token => name.includes(normalizeText(token)))) {
                return acc.id
            }
        }
    }
    return null
}

const resolveCounterpartyAccountId = (
    accounts: Account[],
    movement: BienesMovement
): string | null => {
    const method = (movement.paymentMethod || '').toLowerCase()
    const isCuenta = method.includes('cuenta')
    const isTransfer = method.includes('transfer')
    const isCheque = method.includes('cheque')
    const isEfectivo = method.includes('efectivo')

    const isPurchaseAdjust = movement.type === 'VALUE_ADJUSTMENT'
        && (movement.adjustmentKind === 'BONUS_PURCHASE' || movement.adjustmentKind === 'DISCOUNT_PURCHASE')
    const isSaleAdjust = movement.type === 'VALUE_ADJUSTMENT'
        && (movement.adjustmentKind === 'BONUS_SALE' || movement.adjustmentKind === 'DISCOUNT_SALE')

    if (movement.type === 'PURCHASE' || isPurchaseAdjust) {
        if (isCuenta) {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.proveedores)
        }
        if (isTransfer || isCheque) {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.banco)
        }
        if (isEfectivo) {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.caja)
        }
        return resolveAccountId(accounts, ACCOUNT_FALLBACKS.proveedores) || resolveAccountId(accounts, ACCOUNT_FALLBACKS.caja)
    }

    if (movement.type === 'SALE' || isSaleAdjust) {
        if (isCuenta) {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.deudores)
        }
        if (isTransfer || isCheque) {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.banco)
        }
        if (isEfectivo) {
            return resolveAccountId(accounts, ACCOUNT_FALLBACKS.caja)
        }
        return resolveAccountId(accounts, ACCOUNT_FALLBACKS.caja) || resolveAccountId(accounts, ACCOUNT_FALLBACKS.banco)
    }

    return null
}

/**
 * Validate that journal entries balance (sum debits == sum credits, tolerance 0.01)
 */
const validateEntriesBalance = (entries: Omit<JournalEntry, 'id'>[]): string | null => {
    for (const entry of entries) {
        const totalDebit = entry.lines.reduce((s, l) => s + (l.debit || 0), 0)
        const totalCredit = entry.lines.reduce((s, l) => s + (l.credit || 0), 0)
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return `Asiento desbalanceado: Debe=${totalDebit.toFixed(2)}, Haber=${totalCredit.toFixed(2)} (${entry.memo})`
        }
    }
    return null
}

const buildEntryMetadata = (movement: BienesMovement, product?: BienesProduct) => ({
    sourceModule: 'inventory',
    sourceId: movement.id,
    sourceType: movement.type.toLowerCase(),
    movementId: movement.id,
    productId: movement.productId,
    productName: product?.name,
    reference: movement.reference,
    counterparty: movement.counterparty,
})

/**
 * Build journal entries for RT6 (inflation adjustment) VALUE_ADJUSTMENT with autoJournal ON.
 * Debit or Credit Mercaderias based on valueDelta sign; contra = Diferencia de inventario.
 */
const buildRT6JournalEntries = async (
    movement: BienesMovement,
    product?: BienesProduct
): Promise<{ entries: Omit<JournalEntry, 'id'>[]; error?: string }> => {
    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()

    const mercaderiasId = resolveAccountId(accounts, {
        mappedId: product?.accountMercaderias || settings.accountMappings?.mercaderias || null,
        code: ACCOUNT_FALLBACKS.mercaderias.code,
        names: ACCOUNT_FALLBACKS.mercaderias.names,
    })
    const diferenciaId = resolveMappedAccountId(accounts, settings, 'diferenciaInventario', 'diferenciaInventario')

    const missing: string[] = []
    if (!mercaderiasId) missing.push('Mercaderias')
    if (!diferenciaId) missing.push('Diferencia de inventario')
    if (missing.length > 0) {
        return { entries: [], error: `Faltan cuentas contables: ${missing.join(', ')}` }
    }

    const amount = Math.abs(movement.valueDelta || 0)
    if (amount <= 0) {
        return { entries: [], error: 'El ajuste RT6 no tiene importe.' }
    }

    const metadata = buildEntryMetadata(movement, product)
    const isPositive = (movement.valueDelta || 0) > 0
    const lines: EntryLine[] = isPositive
        ? [
            { accountId: mercaderiasId!, debit: amount, credit: 0, description: 'Ajuste RT6 - revaluo mercaderias' },
            { accountId: diferenciaId!, debit: 0, credit: amount, description: 'Diferencia de inventario (RT6)' },
        ]
        : [
            { accountId: diferenciaId!, debit: amount, credit: 0, description: 'Diferencia de inventario (RT6)' },
            { accountId: mercaderiasId!, debit: 0, credit: amount, description: 'Ajuste RT6 - desvalorizacion mercaderias' },
        ]

    return {
        entries: [{
            date: movement.date,
            memo: `Ajuste RT6 ${movement.rt6Period || ''} - ${product?.name || movement.productId}`,
            lines,
            sourceModule: 'inventory',
            sourceId: movement.id,
            sourceType: 'value_adjustment',
            createdAt: new Date().toISOString(),
            metadata: { ...metadata, journalRole: 'rt6_adjustment' },
        }],
    }
}

/**
 * Build journal entries for CAPITALIZATION VALUE_ADJUSTMENT (solo gasto capitalizable).
 * Debit: Gastos s/compras (neto) + IVA CF (if applicable)
 * Credit: payment splits or counterparty accounts
 */
const buildCapitalizationJournalEntries = async (
    movement: BienesMovement,
    product?: BienesProduct
): Promise<{ entries: Omit<JournalEntry, 'id'>[]; error?: string }> => {
    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const ivaCFId = resolveMappedAccountId(accounts, settings, 'ivaCF', 'ivaCF')
    const gastosComprasId = resolveMappedAccountId(accounts, settings, 'gastosCompras', 'gastosCompras')
    const descuentosObtenidosId = resolveMappedAccountId(accounts, settings, 'descuentosObtenidos', 'descuentosObtenidos')
    const hasSplits = movement.paymentSplits && movement.paymentSplits.length > 0
    const contraId = resolveCounterpartyAccountId(accounts, movement)

    const capitalizableNet = movement.valueDelta || 0
    const totalGastos = movement.gastosCompra || 0
    const effectiveGastos = totalGastos > 0 ? totalGastos : Math.abs(capitalizableNet)

    if (effectiveGastos <= 0) {
        return { entries: [], error: 'El gasto no tiene importe para generar asiento.' }
    }

    const missing: string[] = []
    if (!gastosComprasId) missing.push('Gastos sobre compras')
    if (!contraId && !hasSplits) missing.push('Cuenta contrapartida')
    if (movement.ivaAmount > 0 && !ivaCFId) missing.push('IVA Credito Fiscal')
    if (missing.length > 0) {
        return { entries: [], error: `Faltan cuentas contables: ${missing.join(', ')}` }
    }

    const metadata = buildEntryMetadata(movement, product)
    const lines: EntryLine[] = []

    // Debit: always to Gastos s/compras (capitalization impacts only cost layers, not journal debit account)
    lines.push({
        accountId: gastosComprasId!,
        debit: effectiveGastos,
        credit: 0,
        description: capitalizableNet > 0 ? 'Gastos sobre compras (capitalizable)' : 'Gastos sobre compras',
    })

    // Debit: IVA CF if applicable
    if (movement.ivaAmount > 0 && ivaCFId) {
        lines.push({ accountId: ivaCFId, debit: movement.ivaAmount, credit: 0, description: 'IVA credito fiscal' })
    }

    // Credit: financial discount if present
    const descuentoAmt = movement.descuentoFinancieroAmount || 0
    if (descuentoAmt > 0 && descuentosObtenidosId) {
        lines.push({ accountId: descuentosObtenidosId, debit: 0, credit: descuentoAmt, description: 'Descuento financiero obtenido' })
    }

    // Credit: payment splits or single counterparty
    if (hasSplits) {
        movement.paymentSplits!.forEach(split => {
            lines.push({ accountId: split.accountId, debit: 0, credit: split.amount, description: 'Pago / Contrapartida' })
        })
    } else {
        lines.push({ accountId: contraId!, debit: 0, credit: movement.total, description: 'Pago / Proveedores' })
    }

    return {
        entries: [{
            date: movement.date,
            memo: `Gasto s/compra - ${product?.name || movement.productId}`,
            lines,
            sourceModule: 'inventory',
            sourceId: movement.id,
            sourceType: 'value_adjustment',
            createdAt: new Date().toISOString(),
            metadata: { ...metadata, journalRole: 'capitalization' },
        }],
    }
}

/**
 * Build journal entries for post adjustments (bonificaciones / descuentos financieros).
 */
const buildPostAdjustmentJournalEntries = async (
    movement: BienesMovement,
    product?: BienesProduct
): Promise<{ entries: Omit<JournalEntry, 'id'>[]; error?: string }> => {
    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const ivaCFId = resolveMappedAccountId(accounts, settings, 'ivaCF', 'ivaCF')
    const ivaDFId = resolveMappedAccountId(accounts, settings, 'ivaDF', 'ivaDF')
    const bonifComprasId = resolveMappedAccountId(accounts, settings, 'bonifCompras', 'bonifCompras')
    const bonifVentasId = resolveMappedAccountId(accounts, settings, 'bonifVentas', 'bonifVentas')
    const descuentosObtenidosId = resolveMappedAccountId(accounts, settings, 'descuentosObtenidos', 'descuentosObtenidos')
    const descuentosOtorgadosId = resolveMappedAccountId(accounts, settings, 'descuentosOtorgados', 'descuentosOtorgados')
    const hasSplits = movement.paymentSplits && movement.paymentSplits.length > 0
    const contraId = resolveCounterpartyAccountId(accounts, movement)

    const neto = movement.subtotal || movement.valueDelta || 0
    const ivaAmount = movement.ivaAmount || 0
    const total = movement.total || neto + ivaAmount

    const missing: string[] = []
    if (!hasSplits && !contraId) missing.push('Cuenta contrapartida')

    switch (movement.adjustmentKind) {
        case 'BONUS_PURCHASE':
            if (!bonifComprasId) missing.push('Bonificaciones s/compras')
            if (ivaAmount > 0 && !ivaCFId) missing.push('IVA Credito Fiscal')
            break
        case 'BONUS_SALE':
            if (!bonifVentasId) missing.push('Bonificaciones s/ventas')
            if (ivaAmount > 0 && !ivaDFId) missing.push('IVA Debito Fiscal')
            break
        case 'DISCOUNT_PURCHASE':
            if (!descuentosObtenidosId) missing.push('Descuentos obtenidos')
            break
        case 'DISCOUNT_SALE':
            if (!descuentosOtorgadosId) missing.push('Descuentos otorgados')
            break
        default:
            return { entries: [], error: 'Ajuste de bonif/desc sin adjustmentKind valido.' }
    }

    if (missing.length > 0) {
        return { entries: [], error: `Faltan cuentas contables: ${missing.join(', ')}` }
    }

    if (neto <= 0) {
        return { entries: [], error: 'El ajuste no tiene importe para generar asiento.' }
    }

    const metadata = buildEntryMetadata(movement, product)
    const lines: EntryLine[] = []

    const pushContraDebit = () => {
        if (hasSplits) {
            movement.paymentSplits!.forEach(split => {
                lines.push({ accountId: split.accountId, debit: split.amount, credit: 0, description: 'Contrapartida' })
            })
        } else {
            lines.push({ accountId: contraId!, debit: total, credit: 0, description: 'Contrapartida' })
        }
    }

    const pushContraCredit = () => {
        if (hasSplits) {
            movement.paymentSplits!.forEach(split => {
                lines.push({ accountId: split.accountId, debit: 0, credit: split.amount, description: 'Contrapartida' })
            })
        } else {
            lines.push({ accountId: contraId!, debit: 0, credit: total, description: 'Contrapartida' })
        }
    }

    if (movement.adjustmentKind === 'BONUS_PURCHASE') {
        pushContraDebit()
        lines.push({ accountId: bonifComprasId!, debit: 0, credit: neto, description: 'Bonificacion s/compras' })
        if (ivaAmount > 0 && ivaCFId) {
            lines.push({ accountId: ivaCFId, debit: 0, credit: ivaAmount, description: 'IVA CF reversion' })
        }
    }

    if (movement.adjustmentKind === 'BONUS_SALE') {
        lines.push({ accountId: bonifVentasId!, debit: neto, credit: 0, description: 'Bonificacion s/ventas' })
        if (ivaAmount > 0 && ivaDFId) {
            lines.push({ accountId: ivaDFId, debit: ivaAmount, credit: 0, description: 'IVA DF reversion' })
        }
        pushContraCredit()
    }

    if (movement.adjustmentKind === 'DISCOUNT_PURCHASE') {
        pushContraDebit()
        lines.push({ accountId: descuentosObtenidosId!, debit: 0, credit: total, description: 'Descuento financiero obtenido' })
    }

    if (movement.adjustmentKind === 'DISCOUNT_SALE') {
        lines.push({ accountId: descuentosOtorgadosId!, debit: total, credit: 0, description: 'Descuento financiero otorgado' })
        pushContraCredit()
    }

    const memoMap: Record<string, string> = {
        BONUS_PURCHASE: 'Bonificacion post-compra',
        BONUS_SALE: 'Bonificacion post-venta',
        DISCOUNT_PURCHASE: 'Descuento financiero obtenido',
        DISCOUNT_SALE: 'Descuento financiero otorgado',
    }

    return {
        entries: [{
            date: movement.date,
            memo: `${memoMap[movement.adjustmentKind!] || 'Ajuste post'} - ${product?.name || movement.productId}`,
            lines,
            sourceModule: 'inventory',
            sourceId: movement.id,
            sourceType: 'value_adjustment',
            createdAt: new Date().toISOString(),
            metadata: { ...metadata, journalRole: 'post_adjustment' },
        }],
    }
}

const buildJournalEntriesForMovement = async (
    movement: BienesMovement,
    product?: BienesProduct
): Promise<{ entries: Omit<JournalEntry, 'id'>[]; error?: string }> => {
    if (movement.type === 'COUNT') {
        return { entries: [], error: 'El conteo fisico no genera asiento directo.' }
    }

    // VALUE_ADJUSTMENT: decide based on adjustmentKind + autoJournal + linked entries
    if (movement.type === 'VALUE_ADJUSTMENT') {
        // Already has linked entries — don't duplicate
        if (movement.linkedJournalEntryIds?.length) {
            return { entries: [] }
        }
        // autoJournal OFF — caller doesn't want journal generation (e.g. RT6 conciliation)
        if (!movement.autoJournal) {
            return { entries: [] }
        }
        // RT6: generate RT6 journal entries (sign-aware)
        if (movement.adjustmentKind === 'RT6') {
            // RT6 manual with autoJournal ON — generate the adjustment entry
            return buildRT6JournalEntries(movement, product)
        }
        // CAPITALIZATION: generate purchase-like journal entry for capitalizable expense
        if (movement.adjustmentKind === 'CAPITALIZATION') {
            return buildCapitalizationJournalEntries(movement, product)
        }
        if (
            movement.adjustmentKind === 'BONUS_PURCHASE'
            || movement.adjustmentKind === 'BONUS_SALE'
            || movement.adjustmentKind === 'DISCOUNT_PURCHASE'
            || movement.adjustmentKind === 'DISCOUNT_SALE'
        ) {
            return buildPostAdjustmentJournalEntries(movement, product)
        }
        // Legacy or unknown — no adjustmentKind: safe fallback, don't generate
        // (Retrocompat: old VALUE_ADJUSTMENT without adjustmentKind = RT6 conciliation)
        if (movement.rt6Period || movement.rt6SourceEntryId) {
            return { entries: [] }
        }
        return { entries: [], error: 'VALUE_ADJUSTMENT sin adjustmentKind: no se puede generar asiento seguro.' }
    }

    const accounts = await db.accounts.toArray()
    const settings = await loadBienesSettings()
    const isPeriodic = settings.inventoryMode === 'PERIODIC'

    const mercaderiasId = resolveAccountId(accounts, {
        mappedId: product?.accountMercaderias || settings.accountMappings?.mercaderias || null,
        code: ACCOUNT_FALLBACKS.mercaderias.code,
        names: ACCOUNT_FALLBACKS.mercaderias.names,
    })
    const ivaCFId = resolveMappedAccountId(accounts, settings, 'ivaCF', 'ivaCF')
    const ivaDFId = resolveMappedAccountId(accounts, settings, 'ivaDF', 'ivaDF')
    const ventasId = resolveAccountId(accounts, {
        mappedId: product?.accountVentas || settings.accountMappings?.ventas || null,
        code: ACCOUNT_FALLBACKS.ventas.code,
        names: ACCOUNT_FALLBACKS.ventas.names,
    })
    const cmvId = resolveAccountId(accounts, {
        mappedId: product?.accountCMV || settings.accountMappings?.cmv || null,
        code: ACCOUNT_FALLBACKS.cmv.code,
        names: ACCOUNT_FALLBACKS.cmv.names,
    })
    const comprasId = isPeriodic
        ? resolveMappedAccountId(accounts, settings, 'compras', 'compras')
        : null
    const diferenciaId = resolveMappedAccountId(accounts, settings, 'diferenciaInventario', 'diferenciaInventario')
    const contraId = resolveCounterpartyAccountId(accounts, movement)
    const hasSplits = movement.paymentSplits && movement.paymentSplits.length > 0

    // Determine which account receives the purchase debit
    const purchaseDebitAccountId = isPeriodic ? (comprasId || mercaderiasId) : mercaderiasId

    const missing: string[] = []
    if (!purchaseDebitAccountId && movement.type === 'PURCHASE') missing.push(isPeriodic ? 'Compras' : 'Mercaderias')
    if (!mercaderiasId && movement.type !== 'PURCHASE') missing.push('Mercaderias')
    if (!contraId && !hasSplits && (movement.type === 'PURCHASE' || movement.type === 'SALE')) missing.push('Cuenta contrapartida')
    if (movement.type === 'PURCHASE' && !ivaCFId && movement.ivaAmount > 0) missing.push('IVA Credito Fiscal')
    if (movement.type === 'SALE' && !ivaDFId && movement.ivaAmount > 0) missing.push('IVA Debito Fiscal')
    if (movement.type === 'SALE' && !ventasId) missing.push('Ventas')
    if (movement.type === 'SALE' && !isPeriodic && !cmvId) missing.push('CMV')
    if (movement.type === 'ADJUSTMENT' && !diferenciaId) missing.push('Diferencia de inventario')

    if (missing.length > 0) {
        return { entries: [], error: `Faltan cuentas contables: ${missing.join(', ')}` }
    }

    const entries: Omit<JournalEntry, 'id'>[] = []
    const createdAt = new Date().toISOString()
    const metadata = buildEntryMetadata(movement, product)

    const pushEntry = (memo: string, lines: EntryLine[], extraMeta?: Record<string, any>) => {
        entries.push({
            date: movement.date,
            memo,
            lines,
            sourceModule: 'inventory',
            sourceId: movement.id,
            sourceType: movement.type.toLowerCase(),
            createdAt,
            metadata: { ...metadata, ...extraMeta },
        })
    }

    const subtotal = movement.subtotal
    const ivaAmount = movement.ivaAmount
    const total = movement.total

    // Resolve optional sub-accounts for bonif/gastos/descuento
    const gastosComprasId = resolveMappedAccountId(accounts, settings, 'gastosCompras', 'gastosCompras')
    const bonifComprasId = resolveMappedAccountId(accounts, settings, 'bonifCompras', 'bonifCompras')
    const devolComprasId = resolveMappedAccountId(accounts, settings, 'devolCompras', 'devolCompras')
    const bonifVentasId = resolveMappedAccountId(accounts, settings, 'bonifVentas', 'bonifVentas')
    const devolVentasId = resolveMappedAccountId(accounts, settings, 'devolVentas', 'devolVentas')
    const descuentosObtenidosId = resolveMappedAccountId(accounts, settings, 'descuentosObtenidos', 'descuentosObtenidos')
    const descuentosOtorgadosId = resolveMappedAccountId(accounts, settings, 'descuentosOtorgados', 'descuentosOtorgados')

    const bonifAmt = movement.bonificacionAmount || 0
    const descuentoAmt = movement.descuentoFinancieroAmount || 0
    const gastosAmt = movement.gastosCompra || 0

    if (movement.type === 'PURCHASE') {
        if (movement.isDevolucion) {
            // DEVOLUCIÓN DE COMPRA: reverse entry
            // Debe: Proveedores/Anticipos (total c/IVA)
            // Haber: Devoluciones s/compras (neto)
            // Haber: IVA CF (reverso)
            const lines: EntryLine[] = [
                { accountId: contraId!, debit: total, credit: 0, description: 'Proveedores - devolucion' },
            ]
            if (devolComprasId) {
                lines.push({ accountId: devolComprasId, debit: 0, credit: subtotal, description: 'Devolucion s/compras' })
            } else {
                lines.push({ accountId: purchaseDebitAccountId!, debit: 0, credit: subtotal, description: 'Devolucion compra' })
            }
            if (ivaAmount > 0 && ivaCFId) {
                lines.push({ accountId: ivaCFId, debit: 0, credit: ivaAmount, description: 'IVA CF reverso' })
            }
            pushEntry(`Devolucion compra - ${product?.name || movement.productId}`, lines, { journalRole: 'purchase_return' })
        } else {
            // COMPRA NORMAL with bonif/gastos/descuento
            // subtotal is NET (after bonif). When bonif is shown separately, debit GROSS amount.
            const useBonifGross = bonifAmt > 0 && !!bonifComprasId
            const purchaseDebitAmount = useBonifGross ? subtotal + bonifAmt : subtotal
            const purchaseDesc = isPeriodic ? 'Compra (cuenta Compras)' : 'Compra de mercaderias'
            const lines: EntryLine[] = []
            // Skip zero-amount purchase debit (e.g. soloGasto with qty=0)
            if (purchaseDebitAmount > 0) {
                lines.push({ accountId: purchaseDebitAccountId!, debit: purchaseDebitAmount, credit: 0, description: purchaseDesc })
            }
            if (gastosAmt > 0 && gastosComprasId) {
                lines.push({ accountId: gastosComprasId, debit: gastosAmt, credit: 0, description: 'Gastos s/compras' })
            }
            if (ivaAmount > 0 && ivaCFId) {
                lines.push({ accountId: ivaCFId, debit: ivaAmount, credit: 0, description: 'IVA credito fiscal' })
            }
            if (useBonifGross) {
                lines.push({ accountId: bonifComprasId!, debit: 0, credit: bonifAmt, description: 'Bonificacion s/compras' })
            }
            if (descuentoAmt > 0 && descuentosObtenidosId) {
                lines.push({ accountId: descuentosObtenidosId, debit: 0, credit: descuentoAmt, description: 'Descuento financiero obtenido' })
            }
            if (hasSplits) {
                movement.paymentSplits!.forEach(split => {
                    lines.push({ accountId: split.accountId, debit: 0, credit: split.amount, description: 'Pago / Contrapartida' })
                })
            } else {
                lines.push({ accountId: contraId!, debit: 0, credit: total, description: 'Pago / Proveedores' })
            }
            pushEntry(`Compra mercaderias - ${product?.name || movement.productId}`, lines, { journalRole: 'purchase' })
        }
    }

    if (movement.type === 'SALE') {
        if (movement.isDevolucion) {
            // DEVOLUCIÓN DE VENTA
            // Debe: Devol s/ventas (neto)
            // Debe: IVA DF (reverso)
            // Haber: Deudores/Caja (total devuelto)
            const lines: EntryLine[] = []
            if (devolVentasId) {
                lines.push({ accountId: devolVentasId, debit: subtotal, credit: 0, description: 'Devolucion s/ventas' })
            } else {
                lines.push({ accountId: ventasId!, debit: subtotal, credit: 0, description: 'Devolucion venta' })
            }
            if (ivaAmount > 0 && ivaDFId) {
                lines.push({ accountId: ivaDFId, debit: ivaAmount, credit: 0, description: 'IVA DF reverso' })
            }
            lines.push({ accountId: contraId!, debit: 0, credit: total, description: 'Devolucion a cliente' })
            pushEntry(`Devolucion venta - ${product?.name || movement.productId}`, lines, { journalRole: 'sale_return' })
        } else {
            // VENTA NORMAL with bonif/descuento
            // subtotal is NET (after bonif). When bonif is shown separately, credit GROSS Ventas.
            const useBonifGross = bonifAmt > 0 && !!bonifVentasId
            const ventasCreditAmount = useBonifGross ? subtotal + bonifAmt : subtotal

            const saleLines: EntryLine[] = []
            if (hasSplits) {
                movement.paymentSplits!.forEach(split => {
                    saleLines.push({ accountId: split.accountId, debit: split.amount, credit: 0, description: 'Cobro / Contrapartida' })
                })
            } else {
                saleLines.push({ accountId: contraId!, debit: total, credit: 0, description: 'Cobro / Deudores' })
            }

            if (useBonifGross) {
                saleLines.push({ accountId: bonifVentasId!, debit: bonifAmt, credit: 0, description: 'Bonificacion s/ventas' })
            }
            if (descuentoAmt > 0 && descuentosOtorgadosId) {
                saleLines.push({ accountId: descuentosOtorgadosId, debit: descuentoAmt, credit: 0, description: 'Descuento financiero otorgado' })
            }
            saleLines.push({ accountId: ventasId!, debit: 0, credit: ventasCreditAmount, description: 'Ventas' })
            if (ivaAmount > 0 && ivaDFId) {
                saleLines.push({ accountId: ivaDFId, debit: 0, credit: ivaAmount, description: 'IVA debito fiscal' })
            }
            pushEntry(`Venta mercaderias - ${product?.name || movement.productId}`, saleLines, { journalRole: 'sale' })

            // Asiento de CMV (solo en modo PERMANENT)
            if (!isPeriodic && cmvId && mercaderiasId) {
                const cmvAmount = Math.abs(movement.costTotalAssigned || 0)
                if (cmvAmount > 0) {
                    const cmvLines: EntryLine[] = movement.isDevolucion
                        ? [
                            { accountId: mercaderiasId, debit: cmvAmount, credit: 0, description: 'Reingreso de mercaderias' },
                            { accountId: cmvId, debit: 0, credit: cmvAmount, description: 'Reversion CMV' },
                        ]
                        : [
                            { accountId: cmvId, debit: cmvAmount, credit: 0, description: 'CMV' },
                            { accountId: mercaderiasId, debit: 0, credit: cmvAmount, description: 'Salida de mercaderias' },
                        ]
                    const memoPrefix = movement.isDevolucion ? 'Reversion CMV' : 'CMV venta'
                    pushEntry(`${memoPrefix} - ${product?.name || movement.productId}`, cmvLines, { journalRole: 'cogs' })
                }
            }
        }
    }

    if (movement.type === 'ADJUSTMENT') {
        const amount = movement.quantity < 0
            ? Math.abs(movement.costTotalAssigned || 0)
            : Math.abs(movement.subtotal || 0)

        if (amount <= 0) {
            return { entries: [], error: 'El ajuste no tiene importe para generar asiento.' }
        }

        if (movement.quantity > 0) {
            pushEntry(
                `Ajuste inventario (entrada) - ${product?.name || movement.productId}`,
                [
                    { accountId: mercaderiasId!, debit: amount, credit: 0, description: 'Ingreso por ajuste' },
                    { accountId: diferenciaId!, debit: 0, credit: amount, description: 'Diferencia de inventario' },
                ],
                { journalRole: 'adjustment_in' }
            )
        } else {
            pushEntry(
                `Ajuste inventario (salida) - ${product?.name || movement.productId}`,
                [
                    { accountId: diferenciaId!, debit: amount, credit: 0, description: 'Diferencia de inventario' },
                    { accountId: mercaderiasId!, debit: 0, credit: amount, description: 'Salida por ajuste' },
                ],
                { journalRole: 'adjustment_out' }
            )
        }
    }

    return { entries }
}

const isAutoGeneratedEntryForMovement = (entry: JournalEntry | undefined, movementId: string) => {
    if (!entry) return false
    return entry.sourceModule === 'inventory'
        && entry.sourceId === movementId
        && !!entry.metadata?.journalRole
}

const stripInventoryLinkFromEntry = (entry: JournalEntry, movementId: string): JournalEntry => {
    if (entry.sourceModule !== 'inventory' || entry.sourceId !== movementId) {
        return entry
    }

    const metadata = { ...(entry.metadata || {}) }
    delete metadata.sourceModule
    delete metadata.sourceId
    delete metadata.sourceType
    delete metadata.linkedBy
    delete metadata.movementId
    delete metadata.productId
    delete metadata.productName

    return {
        ...entry,
        sourceModule: undefined,
        sourceId: undefined,
        sourceType: undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
}

// ========================================
// Settings
// ========================================

/**
 * Load bienes settings (creates default if not exists)
 */
export async function loadBienesSettings(): Promise<BienesSettings> {
    const settings = await db.bienesSettings.get('bienes-settings')
    if (settings) {
        // Backward compatibility: fill new fields if missing
        let needsUpdate = false
        if (!settings.inventoryMode) {
            settings.inventoryMode = 'PERMANENT'
            needsUpdate = true
        }
        if (settings.autoJournalEntries === undefined) {
            settings.autoJournalEntries = true
            needsUpdate = true
        }
        if (needsUpdate) {
            await db.bienesSettings.put(settings)
        }
        return settings
    }

    const defaultSettings = createDefaultBienesSettings()
    await db.bienesSettings.put(defaultSettings)
    return defaultSettings
}

/**
 * Save bienes settings
 */
export async function saveBienesSettings(settings: BienesSettings): Promise<void> {
    settings.lastUpdated = new Date().toISOString()
    await db.bienesSettings.put(settings)
}

/**
 * Update costing method (with validation)
 */
export async function updateCostingMethod(
    newMethod: CostingMethod,
    periodId?: string
): Promise<{ success: boolean; error?: string }> {
    const movements = await getAllBienesMovements(periodId)
    if (!canChangeCostingMethod(movements)) {
        return {
            success: false,
            error: 'No se puede cambiar el metodo de costeo porque ya hay ventas o ajustes registrados.',
        }
    }

    const settings = await loadBienesSettings()
    settings.costMethod = newMethod
    settings.lastUpdated = new Date().toISOString()
    await db.bienesSettings.put(settings)
    return { success: true }
}

// ========================================
// Products
// ========================================

/**
 * Get all bienes products
 */
export async function getAllBienesProducts(periodId?: string): Promise<BienesProduct[]> {
    const products = await db.bienesProducts.toArray()
    return products.filter(product => matchesPeriod(product.periodId, periodId))
}

/**
 * Get product by ID
 */
export async function getBienesProductById(id: string): Promise<BienesProduct | undefined> {
    return db.bienesProducts.get(id)
}

/**
 * Get product by SKU
 */
export async function getBienesProductBySku(sku: string): Promise<BienesProduct | undefined> {
    return db.bienesProducts.where('sku').equals(sku).first()
}

/**
 * Create new product
 */
export async function createBienesProduct(
    product: Omit<BienesProduct, 'id' | 'createdAt' | 'updatedAt'>,
    options?: { generateOpeningJournal?: boolean }
): Promise<BienesProduct> {
    // Check SKU uniqueness
    const existing = await getBienesProductBySku(product.sku)
    if (existing) {
        throw new Error(`Ya existe un producto con el SKU "${product.sku}"`)
    }

    const now = new Date().toISOString()
    const newProduct: BienesProduct = {
        ...product,
        id: generateInventoryId('bprod'),
        createdAt: now,
        updatedAt: now,
    }

    const hasOpening = product.openingQty > 0 && product.openingUnitCost > 0
    const shouldGenerateJournal = hasOpening && options?.generateOpeningJournal

    if (!hasOpening || !shouldGenerateJournal) {
        // No opening movement needed, just save product as-is
        await db.bienesProducts.add(newProduct)
        return newProduct
    }

    // Create initial stock movement + journal entry atomically
    const settings = await loadBienesSettings()
    const openingAmount = product.openingQty * product.openingUnitCost

    const initialMovement: BienesMovement = {
        id: generateInventoryId('bmov'),
        date: product.openingDate,
        type: 'ADJUSTMENT',
        productId: newProduct.id,
        quantity: product.openingQty,
        periodId: product.periodId,
        unitCost: product.openingUnitCost,
        ivaRate: 0,
        ivaAmount: 0,
        subtotal: openingAmount,
        total: openingAmount,
        costMethod: settings.costMethod,
        costUnitAssigned: 0,
        costTotalAssigned: 0,
        notes: 'Inventario inicial',
        autoJournal: true,
        linkedJournalEntryIds: [],
        journalStatus: 'generated',
        createdAt: now,
        updatedAt: now,
    }

    // Build opening journal entry: Debe Mercaderias / Haber Apertura Inventario
    const allAccounts = await db.accounts.toArray()
    const mercaderiasId = resolveAccountId(allAccounts, {
        mappedId: product.accountMercaderias || settings.accountMappings?.mercaderias || null,
        code: ACCOUNT_FALLBACKS.mercaderias.code,
        names: ACCOUNT_FALLBACKS.mercaderias.names,
    })
    const aperturaId = resolveMappedAccountId(allAccounts, settings, 'aperturaInventario', 'aperturaInventario')

    if (!mercaderiasId || !aperturaId) {
        throw new Error(`Faltan cuentas contables para inventario inicial: ${!mercaderiasId ? 'Mercaderias' : ''} ${!aperturaId ? 'Apertura Inventario' : ''}`.trim())
    }

    const journalEntry: Omit<JournalEntry, 'id'> = {
        date: product.openingDate,
        memo: `Inventario inicial - ${product.name}`,
        lines: [
            { accountId: mercaderiasId, debit: openingAmount, credit: 0, description: 'Inventario inicial mercaderias' },
            { accountId: aperturaId, debit: 0, credit: openingAmount, description: 'Contrapartida apertura inventario' },
        ],
        sourceModule: 'inventory',
        sourceId: initialMovement.id,
        sourceType: 'opening',
        createdAt: now,
        metadata: {
            sourceModule: 'inventory',
            sourceId: initialMovement.id,
            sourceType: 'opening',
            movementId: initialMovement.id,
            productId: newProduct.id,
            productName: product.name,
            journalRole: 'opening_stock',
        },
    }

    // Save atomically: product (with openingQty=0 to avoid double count) + movement + entry
    const productToSave: BienesProduct = {
        ...newProduct,
        openingQty: 0,
        openingUnitCost: 0,
    }

    await db.transaction('rw', db.bienesProducts, db.bienesMovements, db.entries, async () => {
        const createdEntry = await createEntry(journalEntry)
        initialMovement.linkedJournalEntryIds = [createdEntry.id]
        await db.bienesProducts.add(productToSave)
        await db.bienesMovements.add(initialMovement)
    })

    return productToSave
}

/**
 * Update product
 */
export async function updateBienesProduct(
    id: string,
    updates: Partial<BienesProduct>
): Promise<void> {
    // If SKU is being changed, check uniqueness
    if (updates.sku) {
        const existing = await getBienesProductBySku(updates.sku)
        if (existing && existing.id !== id) {
            throw new Error(`Ya existe un producto con el SKU "${updates.sku}"`)
        }
    }

    await db.bienesProducts.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Delete product (only if no movements)
 */
export async function deleteBienesProduct(id: string): Promise<{ success: boolean; error?: string }> {
    const movements = await db.bienesMovements.where('productId').equals(id).count()
    if (movements > 0) {
        return {
            success: false,
            error: 'No se puede eliminar el producto porque tiene movimientos registrados.',
        }
    }

    await db.bienesProducts.delete(id)
    return { success: true }
}

// ========================================
// Movements
// ========================================

/**
 * Get all bienes movements
 */
export async function getAllBienesMovements(periodId?: string): Promise<BienesMovement[]> {
    const movements = await db.bienesMovements.orderBy('date').reverse().toArray()
    return movements.filter(movement => matchesPeriod(movement.periodId, periodId))
}

/**
 * Get movements by product
 */
export async function getBienesMovementsByProduct(
    productId: string,
    periodId?: string
): Promise<BienesMovement[]> {
    const movements = await db.bienesMovements
        .where('productId')
        .equals(productId)
        .sortBy('date')
    return movements.filter(movement => matchesPeriod(movement.periodId, periodId))
}

/**
 * Get movements by date range
 */
export async function getBienesMovementsByDateRange(
    startDate: string,
    endDate: string,
    periodId?: string
): Promise<BienesMovement[]> {
    const movements = await db.bienesMovements
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray()
    return movements.filter(movement => matchesPeriod(movement.periodId, periodId))
}

/**
 * Create movement with cost calculation
 */
export async function createBienesMovement(
    movement: Omit<BienesMovement, 'id' | 'costUnitAssigned' | 'costTotalAssigned' | 'createdAt' | 'updatedAt' | 'journalStatus'>
): Promise<BienesMovement> {
    const now = new Date().toISOString()
    const settings = await loadBienesSettings()

    // Calculate costs for exits
    let costUnitAssigned = 0
    let costTotalAssigned = 0
    let costLayersUsed: BienesMovement['costLayersUsed'] | undefined
    let product: BienesProduct | undefined

    if (movement.type === 'VALUE_ADJUSTMENT') {
        // VALUE_ADJUSTMENT: no cost calculation, no stock change.
        // Journal generation depends on adjustmentKind + autoJournal.
        const vaMovement: BienesMovement = {
            ...movement,
            id: generateInventoryId('bmov'),
            costMethod: settings.costMethod,
            costUnitAssigned: 0,
            costTotalAssigned: 0,
            linkedJournalEntryIds: movement.linkedJournalEntryIds || [],
            journalStatus: (movement.linkedJournalEntryIds || []).length > 0 ? 'linked' : 'none',
            createdAt: now,
            updatedAt: now,
        }

        // If autoJournal is ON and no pre-existing linked entries, generate journal
        if (movement.autoJournal && !(movement.linkedJournalEntryIds || []).length) {
            product = await getBienesProductById(movement.productId)
            const { entries, error } = await buildJournalEntriesForMovement(vaMovement, product)
            if (error) {
                throw new Error(error)
            }
            // Hardening: validate journal balance
            const balErr = validateEntriesBalance(entries)
            if (balErr) {
                throw new Error(balErr)
            }
            if (entries.length > 0) {
                const createdEntries: JournalEntry[] = []
                await db.transaction('rw', db.bienesMovements, db.entries, async () => {
                    for (const entryData of entries) {
                        const created = await createEntry(entryData)
                        createdEntries.push(created)
                    }
                    await db.bienesMovements.add({
                        ...vaMovement,
                        linkedJournalEntryIds: createdEntries.map(e => e.id),
                        journalStatus: 'generated',
                    })
                })
                return {
                    ...vaMovement,
                    linkedJournalEntryIds: createdEntries.map(e => e.id),
                    journalStatus: 'generated',
                }
            }
        }

        await db.bienesMovements.add(vaMovement)
        return vaMovement
    }

    if (movement.type === 'SALE' && movement.isDevolucion) {
        product = await getBienesProductById(movement.productId)
        if (!product) {
            throw new Error('Producto no encontrado')
        }

        const existingMovements = await getBienesMovementsByProduct(movement.productId, movement.periodId)
        const source = movement.sourceMovementId
            ? existingMovements.find(m => m.id === movement.sourceMovementId)
            : undefined
        const qty = Math.abs(movement.quantity)

        if (source?.costLayersUsed && source.costLayersUsed.length > 0) {
            const sourceQty = Math.abs(source.quantity || 0)
            const ratio = sourceQty > 0 ? qty / sourceQty : 0
            const totalCost = source.costLayersUsed.reduce((sum, layer) => sum + (layer.unitCost * layer.quantity * ratio), 0)
            costTotalAssigned = totalCost
            costUnitAssigned = qty > 0 ? totalCost / qty : 0
        } else if (source?.costUnitAssigned) {
            costUnitAssigned = source.costUnitAssigned
            costTotalAssigned = costUnitAssigned * qty
        } else {
            const valuation = calculateProductValuation(product, existingMovements, settings.costMethod)
            costUnitAssigned = valuation.averageCost
            costTotalAssigned = costUnitAssigned * qty
        }
    } else if (movement.type === 'SALE' || (movement.type === 'ADJUSTMENT' && movement.quantity < 0)) {
        product = await getBienesProductById(movement.productId)
        if (!product) {
            throw new Error('Producto no encontrado')
        }

        const existingMovements = await getBienesMovementsByProduct(movement.productId, movement.periodId)
        const qty = movement.type === 'SALE' ? movement.quantity : Math.abs(movement.quantity)

        const costResult = calculateExitCost(
            product,
            existingMovements,
            qty,
            settings.costMethod
        )

        if (costResult.error && !settings.allowNegativeStock) {
            throw new Error(costResult.error)
        }

        costUnitAssigned = costResult.unitCost
        costTotalAssigned = costResult.totalCost
        if (movement.type === 'SALE') {
            costLayersUsed = costResult.layersUsed
        }
    }
    if (!product) {
        product = await getBienesProductById(movement.productId)
    }

    const newMovement: BienesMovement = {
        ...movement,
        id: generateInventoryId('bmov'),
        costMethod: settings.costMethod,
        costUnitAssigned,
        costTotalAssigned,
        costLayersUsed,
        linkedJournalEntryIds: movement.linkedJournalEntryIds || [],
        journalStatus: movement.autoJournal ? 'generated' : 'none',
        createdAt: now,
        updatedAt: now,
    }

    if (!movement.autoJournal) {
        await db.bienesMovements.add(newMovement)

        if (movement.type === 'SALE' && !settings.costMethodLocked) {
            settings.costMethodLocked = true
            await saveBienesSettings(settings)
        }

        return newMovement
    }

    const { entries, error } = await buildJournalEntriesForMovement(newMovement, product)
    if (error) {
        throw new Error(error)
    }

    // Hardening: validate journal balance before persisting
    const balanceError = validateEntriesBalance(entries)
    if (balanceError) {
        throw new Error(balanceError)
    }

    const createdEntries: JournalEntry[] = []
    await db.transaction('rw', db.bienesMovements, db.entries, async () => {
        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.bienesMovements.add({
            ...newMovement,
            linkedJournalEntryIds: createdEntries.map(entry => entry.id),
            journalStatus: 'generated',
        })
    })

    if (movement.type === 'SALE' && !settings.costMethodLocked) {
        settings.costMethodLocked = true
        await saveBienesSettings(settings)
    }

    return {
        ...newMovement,
        linkedJournalEntryIds: createdEntries.map(entry => entry.id),
        journalStatus: 'generated',
    }
}

/**
 * Reconciles movement links vs actual journal entries (cleans orphans)
 */
export async function reconcileMovementJournalLinks(
    periodId?: string
): Promise<{ updated: number }> {
    const allMovements = await db.bienesMovements.toArray()
    const scopedMovements = periodId
        ? allMovements.filter(movement => matchesPeriod(movement.periodId, periodId))
        : allMovements
    const withLinks = scopedMovements.filter(m => (m.linkedJournalEntryIds || []).length > 0 || m.journalStatus === 'missing')

    if (withLinks.length === 0) {
        return { updated: 0 }
    }

    const allIds = new Set<string>()
    withLinks.forEach(movement => {
        movement.linkedJournalEntryIds?.forEach(id => allIds.add(id))
    })

    if (allIds.size === 0) {
        let updated = 0
        await db.transaction('rw', db.bienesMovements, async () => {
            for (const movement of withLinks) {
                if ((movement.linkedJournalEntryIds || []).length === 0 && movement.journalStatus !== 'none') {
                    await db.bienesMovements.update(movement.id, {
                        journalStatus: movement.journalStatus === 'missing' ? 'missing' : 'none',
                        journalMissingReason: movement.journalStatus === 'missing' ? movement.journalMissingReason || 'entry_deleted' : undefined,
                        updatedAt: new Date().toISOString(),
                    })
                    updated++
                }
            }
        })
        return { updated }
    }

    const entries = await db.entries.where('id').anyOf(Array.from(allIds)).toArray()
    const entryMap = new Map(entries.map(entry => [entry.id, entry]))
    let updated = 0

    await db.transaction('rw', db.bienesMovements, async () => {
        for (const movement of withLinks) {
            const linkedIds = movement.linkedJournalEntryIds || []
            const existingIds = linkedIds.filter(id => entryMap.has(id))
            const changed = existingIds.length !== linkedIds.length
            const hasMissing = existingIds.length === 0

            const existingEntries = existingIds.map(id => entryMap.get(id)).filter(Boolean) as JournalEntry[]
            const hasManual = existingEntries.some(entry => !isAutoGeneratedEntryForMovement(entry, movement.id))

            let nextStatus: BienesMovement['journalStatus'] = movement.journalStatus || 'none'
            if (hasMissing) {
                nextStatus = 'missing'
            } else if (nextStatus === 'desync') {
                nextStatus = 'desync'
            } else if (existingEntries.length > 0) {
                nextStatus = hasManual ? 'linked' : 'generated'
            } else {
                nextStatus = 'none'
            }

            const shouldUpdate = changed || nextStatus !== movement.journalStatus
            if (!shouldUpdate) continue

            await db.bienesMovements.update(movement.id, {
                linkedJournalEntryIds: existingIds,
                journalStatus: nextStatus,
                journalMissingReason: hasMissing ? 'entry_deleted' : undefined,
                updatedAt: new Date().toISOString(),
            })
            updated++
        }
    })

    return { updated }
}

/**
 * Update movement (limited fields)
 */
export async function updateBienesMovement(
    id: string,
    updates: Pick<BienesMovement, 'notes' | 'reference' | 'counterparty' | 'paymentMethod'>
): Promise<void> {
    await db.bienesMovements.update(id, {
        ...updates,
        updatedAt: new Date().toISOString(),
    })
}

/**
 * Update movement and keep journal entries consistent.
 */
export async function updateBienesMovementWithJournal(
    id: string,
    updates: Omit<BienesMovement, 'id' | 'costUnitAssigned' | 'costTotalAssigned' | 'createdAt' | 'updatedAt' | 'journalStatus' | 'linkedJournalEntryIds'>,
    options?: { manualLinkAction?: 'keep' | 'regenerate' }
): Promise<BienesMovement> {
    const existing = await db.bienesMovements.get(id)
    if (!existing) {
        throw new Error('Movimiento no encontrado')
    }

    const settings = await loadBienesSettings()
    const now = new Date().toISOString()

    const baseMovement: BienesMovement = {
        ...existing,
        ...updates,
        costMethod: settings.costMethod,
        updatedAt: now,
    }

    const product = await getBienesProductById(baseMovement.productId)
    if (!product) {
        throw new Error('Producto no encontrado')
    }

    // Recalculate costs for exits
    if (baseMovement.type === 'SALE' && baseMovement.isDevolucion) {
        const existingMovements = await getBienesMovementsByProduct(baseMovement.productId, baseMovement.periodId)
        const movementsForCost = existingMovements.filter(movement => movement.id !== id)
        const source = baseMovement.sourceMovementId
            ? movementsForCost.find(movement => movement.id === baseMovement.sourceMovementId)
            : undefined
        const qty = Math.abs(baseMovement.quantity)

        if (source?.costLayersUsed && source.costLayersUsed.length > 0) {
            const sourceQty = Math.abs(source.quantity || 0)
            const ratio = sourceQty > 0 ? qty / sourceQty : 0
            const totalCost = source.costLayersUsed.reduce((sum, layer) => sum + (layer.unitCost * layer.quantity * ratio), 0)
            baseMovement.costTotalAssigned = totalCost
            baseMovement.costUnitAssigned = qty > 0 ? totalCost / qty : 0
        } else if (source?.costUnitAssigned) {
            baseMovement.costUnitAssigned = source.costUnitAssigned
            baseMovement.costTotalAssigned = baseMovement.costUnitAssigned * qty
        } else {
            const valuation = calculateProductValuation(product, movementsForCost, settings.costMethod)
            baseMovement.costUnitAssigned = valuation.averageCost
            baseMovement.costTotalAssigned = baseMovement.costUnitAssigned * qty
        }
        baseMovement.costLayersUsed = undefined
    } else if (baseMovement.type === 'SALE' || (baseMovement.type === 'ADJUSTMENT' && baseMovement.quantity < 0)) {
        const existingMovements = await getBienesMovementsByProduct(baseMovement.productId, baseMovement.periodId)
        const movementsForCost = existingMovements.filter(movement => movement.id !== id)
        const qty = baseMovement.type === 'SALE' ? baseMovement.quantity : Math.abs(baseMovement.quantity)

        const costResult = calculateExitCost(product, movementsForCost, qty, settings.costMethod)
        if (costResult.error && !settings.allowNegativeStock) {
            throw new Error(costResult.error)
        }

        baseMovement.costUnitAssigned = costResult.unitCost
        baseMovement.costTotalAssigned = costResult.totalCost
        if (baseMovement.type === 'SALE') {
            baseMovement.costLayersUsed = costResult.layersUsed
        }
    } else {
        baseMovement.costUnitAssigned = 0
        baseMovement.costTotalAssigned = 0
        baseMovement.costLayersUsed = undefined
    }

    const linkedIds = existing.linkedJournalEntryIds || []
    const linkedEntries = linkedIds.length > 0
        ? await db.entries.where('id').anyOf(linkedIds).toArray()
        : []
    const existingLinkedIds = linkedEntries.map(entry => entry.id)
    const autoEntries = linkedEntries.filter(entry => isAutoGeneratedEntryForMovement(entry, id))
    const manualEntries = linkedEntries.filter(entry => !isAutoGeneratedEntryForMovement(entry, id))
    const hasManualEntries = manualEntries.length > 0

    if (hasManualEntries && options?.manualLinkAction !== 'keep' && options?.manualLinkAction !== 'regenerate') {
        throw new Error('Movimiento vinculado a asiento manual. Selecciona cómo proceder.')
    }

    const shouldRegenerate = options?.manualLinkAction === 'regenerate'
        || autoEntries.length > 0
        || baseMovement.autoJournal

    if (hasManualEntries && options?.manualLinkAction === 'keep') {
        await db.transaction('rw', db.bienesMovements, async () => {
            await db.bienesMovements.update(id, {
                ...baseMovement,
                linkedJournalEntryIds: existingLinkedIds,
                journalStatus: 'desync',
                journalMissingReason: undefined,
                updatedAt: now,
            })
        })

        return {
            ...baseMovement,
            linkedJournalEntryIds: existingLinkedIds,
            journalStatus: 'desync',
            updatedAt: now,
        }
    }

    let createdEntries: JournalEntry[] = []

    if (shouldRegenerate && baseMovement.type !== 'COUNT') {
        const { entries, error } = await buildJournalEntriesForMovement(baseMovement, product)
        if (error) {
            throw new Error(error)
        }

        await db.transaction('rw', db.bienesMovements, db.entries, async () => {
            if (autoEntries.length > 0) {
                await db.entries.bulkDelete(autoEntries.map(entry => entry.id))
            }

            if (hasManualEntries) {
                for (const entry of manualEntries) {
                    const cleaned = stripInventoryLinkFromEntry(entry, id)
                    await db.entries.put(cleaned)
                }
            }

            for (const entryData of entries) {
                const created = await createEntry(entryData)
                createdEntries.push(created)
            }

            await db.bienesMovements.update(id, {
                ...baseMovement,
                autoJournal: true,
                linkedJournalEntryIds: createdEntries.map(entry => entry.id),
                journalStatus: 'generated',
                journalMissingReason: undefined,
                updatedAt: now,
            })
        })

        if (baseMovement.type === 'SALE' && !settings.costMethodLocked) {
            settings.costMethodLocked = true
            await saveBienesSettings(settings)
        }

        return {
            ...baseMovement,
            autoJournal: true,
            linkedJournalEntryIds: createdEntries.map(entry => entry.id),
            journalStatus: 'generated',
            updatedAt: now,
        }
    }

    const fallbackStatus: BienesMovement['journalStatus'] = existing.journalStatus === 'missing' ? 'missing' : 'none'

    await db.transaction('rw', db.bienesMovements, async () => {
        await db.bienesMovements.update(id, {
            ...baseMovement,
            linkedJournalEntryIds: existingLinkedIds,
            journalStatus: existingLinkedIds.length > 0 ? (hasManualEntries ? 'linked' : 'generated') : fallbackStatus,
            journalMissingReason: existingLinkedIds.length === 0 && fallbackStatus === 'missing' ? 'entry_deleted' : undefined,
            updatedAt: now,
        })
    })

    if (baseMovement.type === 'SALE' && !settings.costMethodLocked) {
        settings.costMethodLocked = true
        await saveBienesSettings(settings)
    }

    return {
        ...baseMovement,
        linkedJournalEntryIds: existingLinkedIds,
        journalStatus: existingLinkedIds.length > 0 ? (hasManualEntries ? 'linked' : 'generated') : fallbackStatus,
        updatedAt: now,
    }
}

/**
 * Generate journal entries for an existing movement (atomic)
 */
export async function generateJournalForMovement(
    movementId: string
): Promise<{ movement: BienesMovement; entries: JournalEntry[] }> {
    const movement = await db.bienesMovements.get(movementId)
    if (!movement) {
        throw new Error('Movimiento no encontrado')
    }
    if (movement.type === 'COUNT') {
        throw new Error('El conteo fisico no genera asiento directo')
    }
    if (movement.linkedJournalEntryIds?.length) {
        throw new Error('El movimiento ya tiene asientos vinculados')
    }

    const product = await getBienesProductById(movement.productId)
    const { entries, error } = await buildJournalEntriesForMovement(movement, product)
    if (error) {
        throw new Error(error)
    }

    const createdEntries: JournalEntry[] = []
    await db.transaction('rw', db.bienesMovements, db.entries, async () => {
        for (const entryData of entries) {
            const created = await createEntry(entryData)
            createdEntries.push(created)
        }

        await db.bienesMovements.update(movementId, {
            linkedJournalEntryIds: createdEntries.map(entry => entry.id),
            journalStatus: 'generated',
            journalMissingReason: undefined,
            updatedAt: new Date().toISOString(),
        })
    })

    return {
        movement: {
            ...movement,
            linkedJournalEntryIds: createdEntries.map(entry => entry.id),
            journalStatus: 'generated',
            updatedAt: new Date().toISOString(),
        },
        entries: createdEntries,
    }
}

/**
 * Link movement to existing journal entries (atomic)
 */
export async function linkMovementToEntries(
    movementId: string,
    entryIds: string[]
): Promise<BienesMovement> {
    const movement = await db.bienesMovements.get(movementId)
    if (!movement) {
        throw new Error('Movimiento no encontrado')
    }
    if (entryIds.length === 0) {
        throw new Error('Selecciona al menos un asiento')
    }

    const uniqueIds = Array.from(new Set([...(movement.linkedJournalEntryIds || []), ...entryIds]))
    const sourceType = movement.type.toLowerCase()

    await db.transaction('rw', db.bienesMovements, db.entries, async () => {
        for (const entryId of entryIds) {
            const entry = await db.entries.get(entryId)
            if (!entry) {
                throw new Error('Asiento no encontrado')
            }
            const updated: JournalEntry = {
                ...entry,
                sourceModule: entry.sourceModule || 'inventory',
                sourceId: entry.sourceId || movement.id,
                sourceType: entry.sourceType || sourceType,
                metadata: {
                    ...(entry.metadata || {}),
                    sourceModule: 'inventory',
                    sourceId: movement.id,
                    sourceType,
                    linkedBy: 'inventory',
                },
            }
            await db.entries.put(updated)
        }

        await db.bienesMovements.update(movementId, {
            linkedJournalEntryIds: uniqueIds,
            journalStatus: 'linked',
            journalMissingReason: undefined,
            updatedAt: new Date().toISOString(),
        })
    })

    return {
        ...movement,
        linkedJournalEntryIds: uniqueIds,
        journalStatus: 'linked',
        updatedAt: new Date().toISOString(),
    }
}

/**
 * Delete movement (only if it's the last one for the product)
 */
export async function deleteBienesMovement(id: string): Promise<{ success: boolean; error?: string }> {
    const movement = await db.bienesMovements.get(id)
    if (!movement) {
        return { success: false, error: 'Movimiento no encontrado' }
    }
    if (movement.linkedJournalEntryIds && movement.linkedJournalEntryIds.length > 0) {
        return {
            success: false,
            error: 'No se puede eliminar un movimiento con asientos vinculados. Desvincule o registre un ajuste.',
        }
    }

    // Get all movements for this product ordered by date
    const productMovements = await db.bienesMovements
        .where('productId')
        .equals(movement.productId)
        .sortBy('createdAt')

    // Can only delete if it's the last movement
    const isLast = productMovements[productMovements.length - 1]?.id === id
    if (!isLast) {
        return {
            success: false,
            error: 'Solo se puede eliminar el ultimo movimiento registrado para este producto.',
        }
    }

    await db.bienesMovements.delete(id)
    return { success: true }
}

/**
 * Delete movement and handle linked journal entries.
 */
export async function deleteBienesMovementWithJournal(
    id: string,
    options?: { keepManualEntries?: boolean }
): Promise<{ success: boolean; error?: string; deletedEntries?: number }> {
    const movement = await db.bienesMovements.get(id)
    if (!movement) {
        return { success: false, error: 'Movimiento no encontrado' }
    }

    const linkedIds = movement.linkedJournalEntryIds || []
    const linkedEntries = linkedIds.length > 0
        ? await db.entries.where('id').anyOf(linkedIds).toArray()
        : []
    const autoEntries = linkedEntries.filter(entry => isAutoGeneratedEntryForMovement(entry, id))
    const manualEntries = linkedEntries.filter(entry => !isAutoGeneratedEntryForMovement(entry, id))

    if (manualEntries.length > 0 && !options?.keepManualEntries) {
        return {
            success: false,
            error: 'Movimiento vinculado a asiento manual. Confirma para eliminar sin tocar el asiento.',
        }
    }

    await db.transaction('rw', db.bienesMovements, db.entries, async () => {
        if (autoEntries.length > 0) {
            await db.entries.bulkDelete(autoEntries.map(entry => entry.id))
        }
        if (manualEntries.length > 0 && options?.keepManualEntries) {
            for (const entry of manualEntries) {
                const cleaned = stripInventoryLinkFromEntry(entry, id)
                await db.entries.put(cleaned)
            }
        }
        await db.bienesMovements.delete(id)
    })

    return { success: true, deletedEntries: autoEntries.length }
}

/**
 * Delete product with its movements and generated entries.
 */
export async function deleteBienesProductWithMovements(
    id: string
): Promise<{ success: boolean; error?: string; deletedMovements?: number; deletedEntries?: number }> {
    const product = await db.bienesProducts.get(id)
    if (!product) {
        return { success: false, error: 'Producto no encontrado' }
    }

    const movements = await db.bienesMovements.where('productId').equals(id).toArray()
    const linkedIds = new Set<string>()
    movements.forEach(movement => {
        movement.linkedJournalEntryIds?.forEach(entryId => linkedIds.add(entryId))
    })

    const entries = linkedIds.size > 0
        ? await db.entries.where('id').anyOf(Array.from(linkedIds)).toArray()
        : []
    const entryMap = new Map(entries.map(entry => [entry.id, entry]))

    const autoEntryIds = new Set<string>()
    const manualEntries = new Map<string, { entry: JournalEntry; movementId: string }>()

    movements.forEach(movement => {
        const ids = movement.linkedJournalEntryIds || []
        ids.forEach(entryId => {
            const entry = entryMap.get(entryId)
            if (!entry) return
            if (isAutoGeneratedEntryForMovement(entry, movement.id)) {
                autoEntryIds.add(entry.id)
            } else {
                manualEntries.set(entry.id, { entry, movementId: movement.id })
            }
        })
    })

    await db.transaction('rw', db.bienesProducts, db.bienesMovements, db.entries, async () => {
        if (autoEntryIds.size > 0) {
            await db.entries.bulkDelete(Array.from(autoEntryIds))
        }
        if (manualEntries.size > 0) {
            for (const { entry, movementId } of manualEntries.values()) {
                const cleaned = stripInventoryLinkFromEntry(entry, movementId)
                await db.entries.put(cleaned)
            }
        }
        if (movements.length > 0) {
            await db.bienesMovements.bulkDelete(movements.map(m => m.id))
        }
        await db.bienesProducts.delete(id)
    })

    return {
        success: true,
        deletedMovements: movements.length,
        deletedEntries: autoEntryIds.size,
    }
}

// ========================================
// Bulk Operations
// ========================================

/**
 * Clear all bienes data (for testing/reset)
 */
export async function clearAllBienesData(): Promise<void> {
    await Promise.all([
        db.bienesProducts.clear(),
        db.bienesMovements.clear(),
        db.bienesSettings.clear(),
    ])
}

/**
 * Clear bienes data for a given period, with optional entry deletion.
 */
export async function clearBienesPeriodData(
    periodId: string,
    options: { deleteGeneratedEntries: boolean }
): Promise<{ deletedProducts: number; deletedMovements: number; deletedEntries: number }> {
    const allProducts = await db.bienesProducts.toArray()
    const allMovements = await db.bienesMovements.toArray()

    const products = allProducts.filter(product => matchesPeriod(product.periodId, periodId))
    const movements = allMovements.filter(movement => matchesPeriod(movement.periodId, periodId))

    const movementIds = new Set(movements.map(m => m.id))
    const allEntries = await db.entries.toArray()
    const linkedEntries = allEntries.filter(entry => entry.sourceModule === 'inventory' && entry.sourceId && movementIds.has(entry.sourceId))

    const autoEntries = linkedEntries.filter(entry => isAutoGeneratedEntryForMovement(entry, entry.sourceId || ''))
    const manualEntries = linkedEntries.filter(entry => !isAutoGeneratedEntryForMovement(entry, entry.sourceId || ''))

    await db.transaction('rw', db.bienesProducts, db.bienesMovements, db.entries, db.bienesSettings, async () => {
        if (options.deleteGeneratedEntries) {
            if (autoEntries.length > 0) {
                await db.entries.bulkDelete(autoEntries.map(entry => entry.id))
            }
            if (manualEntries.length > 0) {
                for (const entry of manualEntries) {
                    const cleaned = stripInventoryLinkFromEntry(entry, entry.sourceId || '')
                    await db.entries.put(cleaned)
                }
            }
        } else {
            for (const entry of linkedEntries) {
                const cleaned = stripInventoryLinkFromEntry(entry, entry.sourceId || '')
                await db.entries.put(cleaned)
            }
        }

        if (movements.length > 0) {
            await db.bienesMovements.bulkDelete(movements.map(m => m.id))
        }
        if (products.length > 0) {
            await db.bienesProducts.bulkDelete(products.map(p => p.id))
        }

        const settings = await db.bienesSettings.get('bienes-settings')
        if (settings) {
            await db.bienesSettings.put({
                ...settings,
                costMethodLocked: false,
                lastUpdated: new Date().toISOString(),
            })
        }
    })

    return {
        deletedProducts: products.length,
        deletedMovements: movements.length,
        deletedEntries: options.deleteGeneratedEntries ? autoEntries.length : 0,
    }
}

/**
 * Import products from array
 */
export async function importBienesProducts(
    products: Omit<BienesProduct, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const errors: string[] = []
    let imported = 0
    let skipped = 0

    for (const product of products) {
        try {
            const existing = await getBienesProductBySku(product.sku)
            if (existing) {
                skipped++
                continue
            }
            await createBienesProduct(product)
            imported++
        } catch (e) {
            errors.push(`${product.sku}: ${e instanceof Error ? e.message : 'Error desconocido'}`)
        }
    }

    return { imported, skipped, errors }
}

// ========================================
// Queries for UI
// ========================================

/**
 * Get products with low stock alerts
 */
export async function getProductsWithLowStock(): Promise<BienesProduct[]> {
    const products = await getAllBienesProducts()
    const movements = await getAllBienesMovements()

    // Calculate current stock for each product
    const stockMap = new Map<string, number>()
    for (const p of products) {
        stockMap.set(p.id, p.openingQty)
    }

    for (const m of movements) {
        const current = stockMap.get(m.productId) || 0
        if (m.type === 'PURCHASE') {
            stockMap.set(m.productId, current + m.quantity)
        } else if (m.type === 'SALE') {
            stockMap.set(m.productId, current - m.quantity)
        } else if (m.type === 'ADJUSTMENT') {
            stockMap.set(m.productId, current + m.quantity)
        }
    }

    return products.filter(p => {
        const stock = stockMap.get(p.id) || 0
        return stock < p.reorderPoint
    })
}

/**
 * Get all SKUs (for validation)
 */
export async function getAllBienesSKUs(): Promise<string[]> {
    const products = await getAllBienesProducts()
    return products.map(p => p.sku)
}

// ========================================
// Periodic Closing - Entry Generation
// ========================================

/**
 * Check if periodic closing entries already exist for a given period
 */
export async function hasPeriodicClosingEntries(periodId: string): Promise<boolean> {
    const entries = await db.entries.toArray()
    return entries.some(e =>
        e.sourceModule === 'inventory' &&
        e.sourceType === 'periodic_closing' &&
        e.metadata?.periodId === periodId
    )
}

/**
 * Generate and persist periodic closing entries (refundición + CMV + ventas netas)
 * Idempotent: won't duplicate if already generated for this period.
 *
 * @returns Created entry IDs or error
 */
export async function generatePeriodicClosingJournalEntries(
    data: {
        existenciaInicial: number
        compras: number
        gastosCompras: number
        bonifCompras: number
        devolCompras: number
        existenciaFinalTeorica: number
        existenciaFinalFisica?: number | null
        ventas: number
        bonifVentas: number
        devolVentas: number
        closingDate: string
        periodId: string
        periodLabel: string
    }
): Promise<{ entryIds: string[]; cmv: number; difInv: number; error?: string }> {
    // Idempotency check
    const alreadyExists = await hasPeriodicClosingEntries(data.periodId)
    if (alreadyExists) {
        return { entryIds: [], cmv: 0, difInv: 0, error: 'Ya se generaron asientos de cierre para este periodo.' }
    }

    const settings = await loadBienesSettings()
    if (settings.inventoryMode !== 'PERIODIC') {
        return { entryIds: [], cmv: 0, difInv: 0, error: 'El modo de inventario no es Periodico (Diferencias).' }
    }

    const allAccounts = await db.accounts.toArray()

    // Required accounts
    const mercaderiasId = resolveMappedAccountId(allAccounts, settings, 'mercaderias', 'mercaderias')
    const comprasId = resolveMappedAccountId(allAccounts, settings, 'compras', 'compras')
    const cmvId = resolveMappedAccountId(allAccounts, settings, 'cmv', 'cmv')

    const missing: string[] = []
    if (!mercaderiasId) missing.push('Mercaderias')
    if (!comprasId) missing.push('Compras')
    if (!cmvId) missing.push('CMV')
    if (missing.length > 0) {
        return { entryIds: [], cmv: 0, difInv: 0, error: `Faltan cuentas: ${missing.join(', ')}. Configura las cuentas primero.` }
    }

    // Diferencia de inventario account (required if physical EF is provided)
    const diferenciaInventarioId = resolveMappedAccountId(allAccounts, settings, 'diferenciaInventario', 'diferenciaInventario')
    if (data.existenciaFinalFisica != null && !diferenciaInventarioId) {
        return { entryIds: [], cmv: 0, difInv: 0, error: 'Falta cuenta Diferencia de inventario (4.3.02). Configura la cuenta para poder generar asientos con inventario fisico.' }
    }

    // Optional sub-accounts (for refundición)
    const gastosComprasId = resolveMappedAccountId(allAccounts, settings, 'gastosCompras', 'gastosCompras')
    const bonifComprasId = resolveMappedAccountId(allAccounts, settings, 'bonifCompras', 'bonifCompras')
    const devolComprasId = resolveMappedAccountId(allAccounts, settings, 'devolCompras', 'devolCompras')
    const ventasId = resolveMappedAccountId(allAccounts, settings, 'ventas', 'ventas')
    const bonifVentasId = resolveMappedAccountId(allAccounts, settings, 'bonifVentas', 'bonifVentas')
    const devolVentasId = resolveMappedAccountId(allAccounts, settings, 'devolVentas', 'devolVentas')

    const { generatePeriodicClosingEntries } = await import('../core/inventario/closing')

    const { entries: closingEntries, cmv, difInv } = generatePeriodicClosingEntries(
        {
            existenciaInicial: data.existenciaInicial,
            compras: data.compras,
            gastosCompras: data.gastosCompras,
            bonifCompras: data.bonifCompras,
            devolCompras: data.devolCompras,
            existenciaFinalTeorica: data.existenciaFinalTeorica,
            existenciaFinalFisica: data.existenciaFinalFisica,
            ventas: data.ventas,
            bonifVentas: data.bonifVentas,
            devolVentas: data.devolVentas,
        },
        {
            mercaderiasId: mercaderiasId!,
            comprasId: comprasId!,
            cmvId: cmvId!,
            gastosComprasId: gastosComprasId || undefined,
            bonifComprasId: bonifComprasId || undefined,
            devolComprasId: devolComprasId || undefined,
            ventasId: ventasId || undefined,
            bonifVentasId: bonifVentasId || undefined,
            devolVentasId: devolVentasId || undefined,
            diferenciaInventarioId: diferenciaInventarioId || undefined,
        },
        data.periodLabel
    )

    if (closingEntries.length === 0) {
        return { entryIds: [], cmv, difInv, error: 'No hay asientos de cierre que generar (valores en cero).' }
    }

    const now = new Date().toISOString()
    const entryIds: string[] = []

    await db.transaction('rw', db.entries, async () => {
        for (const closingEntry of closingEntries) {
            const created = await createEntry({
                date: data.closingDate,
                memo: closingEntry.memo,
                lines: closingEntry.lines,
                sourceModule: 'inventory',
                sourceId: `periodic-closing-${data.periodId}`,
                sourceType: 'periodic_closing',
                createdAt: now,
                metadata: {
                    sourceModule: 'inventory',
                    sourceType: 'periodic_closing',
                    periodId: data.periodId,
                    journalRole: 'periodic_closing',
                },
            })
            entryIds.push(created.id)
        }
    })

    return { entryIds, cmv, difInv }
}
