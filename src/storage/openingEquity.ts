import type { Account } from '../core/models'

const CAPITAL_SOCIAL_CODE_PREFIXES = ['3.1.01', '3.01.01']
const CAPITAL_SOCIAL_NAME_HINTS = ['capital social', 'capital suscripto', 'capital integrado']

const RETAINED_EARNINGS_CODE_PREFIXES = ['3.2.01', '3.2']
const RETAINED_EARNINGS_NAME_HINTS = [
    'resultados no asignados',
    'resultados acumulados',
    'resultados ejercicios anteriores',
]

const OPENING_BALANCE_NAME_HINTS = ['apertura', 'saldos iniciales']
const OPENING_BALANCE_TAG = 'opening_balance'

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

const isEquity = (account: Account) =>
    account.kind === 'EQUITY' || account.type === 'PatrimonioNeto'

const isImputable = (account: Account) => !account.isHeader

const resolveByIdOrCode = (accounts: Account[], idOrCode?: string | null) => {
    if (!idOrCode) return null
    return accounts.find(a => a.id === idOrCode) || accounts.find(a => a.code === idOrCode) || null
}

const findByCodePrefix = (accounts: Account[], prefixes: string[]) => {
    const candidates = accounts.filter(a =>
        prefixes.some(prefix => a.code.startsWith(prefix))
    )
    return candidates.find(a => isImputable(a)) || candidates[0] || null
}

const findByNameHints = (accounts: Account[], hints: string[]) => {
    const normalizedHints = hints.map(normalizeText)
    return accounts.find(a => {
        const name = normalizeText(a.name)
        return normalizedHints.some(h => name.includes(h)) && isImputable(a)
    }) || null
}

export const resolveOpeningEquityAccountId = (
    accounts: Account[],
    preferredIdOrCode?: string | null
): string | null => {
    if (!accounts || accounts.length === 0) return null

    const preferred = resolveByIdOrCode(accounts, preferredIdOrCode)
    if (preferred) return preferred.id

    const capitalByCode = findByCodePrefix(accounts, CAPITAL_SOCIAL_CODE_PREFIXES)
    if (capitalByCode && isEquity(capitalByCode)) return capitalByCode.id

    const capitalByName = findByNameHints(
        accounts.filter(isEquity),
        CAPITAL_SOCIAL_NAME_HINTS
    )
    if (capitalByName) return capitalByName.id

    const retainedByCode = findByCodePrefix(accounts, RETAINED_EARNINGS_CODE_PREFIXES)
    if (retainedByCode && isEquity(retainedByCode)) return retainedByCode.id

    const retainedByName = findByNameHints(
        accounts.filter(isEquity),
        RETAINED_EARNINGS_NAME_HINTS
    )
    if (retainedByName) return retainedByName.id

    const openingByTag = accounts.find(
        a => isEquity(a) && isImputable(a) && a.tags?.includes(OPENING_BALANCE_TAG)
    )
    if (openingByTag) return openingByTag.id

    const openingByName = findByNameHints(
        accounts.filter(isEquity),
        OPENING_BALANCE_NAME_HINTS
    )
    if (openingByName) return openingByName.id

    const anyEquity = accounts.find(a => isEquity(a) && isImputable(a))
    return anyEquity ? anyEquity.id : null
}
