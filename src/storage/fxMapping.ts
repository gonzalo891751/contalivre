import { createAccount, generateNextCode, getAllAccounts } from './accounts'
import { getDefaultNormalSide } from '../core/models'
import type { Account, AccountKind, AccountSection, StatementGroup } from '../core/models'
import type { CurrencyCode, FxAssetSubtype, FxLiabilitySubtype } from '../core/monedaExtranjera/types'
import { DEFAULT_FX_ACCOUNT_CODES } from '../core/monedaExtranjera/types'

export type SuggestionConfidence = 'high' | 'medium' | 'low'

export interface LedgerAccountSuggestion {
    account?: Account
    confidence: SuggestionConfidence
    reason: string
    parentHint?: Account
}

const normalize = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()

const includesAny = (value: string, keywords: string[]) =>
    keywords.some(keyword => value.includes(keyword))

const scoreAccount = (account: Account, keywords: string[], currency?: CurrencyCode) => {
    let score = 0
    const name = normalize(account.name)

    if (currency && name.includes(currency.toLowerCase())) score += 2
    if (keywords.some(keyword => name.includes(keyword))) score += 2
    if (account.code.includes('1.1') || account.code.includes('2.1')) score += 1

    return score
}

const pickBestAccount = (accounts: Account[], keywords: string[], currency?: CurrencyCode) => {
    let best: Account | undefined
    let bestScore = 0

    for (const account of accounts) {
        const score = scoreAccount(account, keywords, currency)
        if (score > bestScore) {
            bestScore = score
            best = account
        }
    }

    return { best, score: bestScore }
}

const findParentHint = (accounts: Account[], account?: Account, fallbackPrefix?: string) => {
    if (account?.parentId) {
        return accounts.find(item => item.id === account.parentId)
    }
    if (fallbackPrefix) {
        const candidates = accounts.filter(item => item.code.startsWith(fallbackPrefix) && item.isHeader)
        if (candidates.length > 0) {
            return candidates.sort((a, b) => a.code.length - b.code.length)[0]
        }
    }
    return accounts.find(item => item.isHeader && item.code.split('.').length <= 2)
}

export async function suggestLedgerAccountForFxAsset(params: {
    name: string
    subtype: FxAssetSubtype
    currency: CurrencyCode
    accounts?: Account[]
}): Promise<LedgerAccountSuggestion> {
    const accounts = params.accounts || await getAllAccounts()
    const postable = accounts.filter(acc => !acc.isHeader)

    const normalizedName = normalize(params.name)
    const isBank = includesAny(normalizedName, ['banco', 'cta', 'cuenta', 'galicia', 'santander', 'bbva', 'icbc', 'macro'])
    const isCash = includesAny(normalizedName, ['caja', 'efectivo', 'fuerte'])
    const isCrypto = includesAny(normalizedName, ['cripto', 'wallet', 'usdt', 'binance'])

    const keywords = isBank
        ? ['banco', 'cta', 'cuenta']
        : isCash
            ? ['caja', 'efectivo', 'fuerte']
            : isCrypto
                ? ['cripto', 'wallet', 'usdt']
                : ['moneda extranjera', 'usd', 'me']

    const { best, score } = pickBestAccount(postable, keywords, params.currency)
    const confidence: SuggestionConfidence = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'

    const reason = best
        ? `Coincidencia por nombre y tipo (${params.subtype}).`
        : 'No se encontro una cuenta exacta; sugerencia basada en defaults.'

    const fallbackPrefix = isBank || isCash ? DEFAULT_FX_ACCOUNT_CODES.cajaME.split('.').slice(0, 3).join('.') : DEFAULT_FX_ACCOUNT_CODES.inversionME.split('.').slice(0, 3).join('.')

    return {
        account: best,
        confidence,
        reason,
        parentHint: findParentHint(accounts, best, fallbackPrefix),
    }
}

export async function suggestLedgerAccountForFxDebt(params: {
    name: string
    creditor: string
    subtype: FxLiabilitySubtype
    currency: CurrencyCode
    accounts?: Account[]
}): Promise<LedgerAccountSuggestion> {
    const accounts = params.accounts || await getAllAccounts()
    const postable = accounts.filter(acc => !acc.isHeader)

    const normalizedName = normalize(`${params.name} ${params.creditor}`)
    const isProveedor = includesAny(normalizedName, ['proveedor', 'comercial', 'acreedor'])

    const keywords = isProveedor
        ? ['proveedor', 'acreedor', 'deuda']
        : ['prestamo', 'deuda', 'pasivo', 'socio']

    const { best, score } = pickBestAccount(postable, keywords, params.currency)
    const confidence: SuggestionConfidence = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'

    const reason = best
        ? 'Cuenta sugerida por tipo de deuda y acreedor.'
        : 'Sin coincidencias fuertes; usar cuenta default de pasivo ME.'

    const fallbackPrefix = DEFAULT_FX_ACCOUNT_CODES.pasivoME.split('.').slice(0, 3).join('.')

    return {
        account: best,
        confidence,
        reason,
        parentHint: findParentHint(accounts, best, fallbackPrefix),
    }
}

export async function ensureLedgerAccountExists(params: {
    name: string
    kind: AccountKind
    accounts?: Account[]
    parentId?: string | null
    group?: string
    section?: AccountSection
    statementGroup?: StatementGroup | null
}): Promise<Account> {
    const accounts = params.accounts || await getAllAccounts()
    const normalized = normalize(params.name)

    const existing = accounts.find(acc => normalize(acc.name) === normalized)
    if (existing) return existing

    const parent = params.parentId ? accounts.find(acc => acc.id === params.parentId) : null

    const code = await generateNextCode(parent?.id ?? null)

    const newAccount = await createAccount({
        code,
        name: params.name,
        kind: parent?.kind || params.kind,
        section: parent?.section || params.section || 'CURRENT',
        group: parent?.group || params.group || params.name,
        statementGroup: parent?.statementGroup ?? params.statementGroup ?? null,
        parentId: parent?.id ?? null,
        normalSide: parent?.normalSide || getDefaultNormalSide(parent?.kind || params.kind),
        isContra: parent?.isContra || false,
        isHeader: false,
    })

    return newAccount
}

