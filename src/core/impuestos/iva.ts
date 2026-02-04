import type { JournalEntry } from '../models'
import type { IVATotals } from './types'

export function computeIVATotalsFromEntries(
    entries: JournalEntry[],
    accountIds: {
        ivaDFId?: string | null
        ivaCFId?: string | null
        retencionSufridaId?: string | null
        percepcionIVASufridaId?: string | null
    }
): IVATotals {
    const { ivaDFId, ivaCFId, retencionSufridaId, percepcionIVASufridaId } = accountIds
    let debitoFiscal = 0
    let creditoFiscal = 0
    let retencionesSufridas = 0
    let percepcionesSufridas = 0

    for (const entry of entries) {
        for (const line of entry.lines) {
            // IVA DF: credit - debit (pasivo)
            if (ivaDFId && line.accountId === ivaDFId) {
                debitoFiscal += (line.credit || 0) - (line.debit || 0)
            }
            // IVA CF: debit - credit (activo)
            if (ivaCFId && line.accountId === ivaCFId) {
                creditoFiscal += (line.debit || 0) - (line.credit || 0)
            }
            // Retenciones sufridas: debit - credit (activo)
            if (retencionSufridaId && line.accountId === retencionSufridaId) {
                retencionesSufridas += (line.debit || 0) - (line.credit || 0)
            }
            // Percepciones IVA sufridas: debit - credit (activo)
            if (percepcionIVASufridaId && line.accountId === percepcionIVASufridaId) {
                percepcionesSufridas += (line.debit || 0) - (line.credit || 0)
            }
        }
    }

    const pagosACuenta = retencionesSufridas + percepcionesSufridas
    const saldo = debitoFiscal - creditoFiscal - pagosACuenta

    return {
        debitoFiscal,
        creditoFiscal,
        pagosACuenta,
        saldo,
        retencionesSufridas,
        percepcionesSufridas,
    }
}

export function applyIVACarry(
    baseTotals: IVATotals,
    options?: { carryIvaFavor?: number; carryAvailable?: boolean }
): IVATotals {
    const carryAvailable = options?.carryAvailable ?? false
    const rawCarry = options?.carryIvaFavor ?? 0
    const carry = carryAvailable ? Math.max(0, rawCarry) : 0

    const posicionMesSinArrastre = baseTotals.saldo
    const raw = posicionMesSinArrastre

    let ivaAPagar = 0
    let ivaAFavorDelMes = 0
    let ivaFavorAnteriorAplicado = 0

    if (raw >= 0) {
        ivaFavorAnteriorAplicado = Math.min(carry, raw)
        ivaAPagar = raw - ivaFavorAnteriorAplicado
    } else {
        ivaAFavorDelMes = Math.abs(raw)
    }

    const ivaAFavorFinal = (carry - ivaFavorAnteriorAplicado) + ivaAFavorDelMes
    const posicionMesConArrastre = ivaAPagar > 0 ? ivaAPagar : -ivaAFavorFinal

    return {
        ...baseTotals,
        saldo: posicionMesConArrastre,
        ivaFavorAnterior: carry,
        ivaFavorAnteriorAplicado,
        ivaFavorAnteriorDisponible: carryAvailable,
        posicionMesSinArrastre,
        posicionMesConArrastre,
        ivaAFavorDelMes,
        ivaAFavorFinal,
        ivaAPagar,
    }
}
