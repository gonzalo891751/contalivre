/**
 * Conciliación de bienes de uso — Fase 2H (§H7).
 *
 * El circuito tiene dos representaciones legítimas del mismo hecho:
 *
 *   Operaciones → Bienes de uso   (ficha del bien: `db.fixedAssets`)
 *   Libro Diario → anexo canónico (`bundle.statements.fixedAssetsAnnex`)
 *
 * La ficha NO es una segunda contabilidad: es el detalle operativo que genera
 * los asientos. El anexo, en cambio, se construye SIEMPRE desde el Diario. Si
 * las dos difieren hay un bien sin contabilizar, un asiento cargado a mano o una
 * cuenta mal mapeada, y eso debe verse, no taparse.
 *
 * Este selector compara ambas fuentes y expone la diferencia. No corrige ni
 * ajusta nada: el saldo contable siempre manda.
 */

import { toCents } from '../accounting/domain/money'
import type { FixedAsset } from '../core/fixedAssets/types'
import type { ReportingBundle } from './loadReportingBundle'

export interface FixedAssetsReconciliationRow {
    label: string
    /** total según las fichas del módulo de Bienes de uso */
    perModule: number
    /** total según el anexo, que se arma con el Libro Diario */
    perLedger: number
    difference: number
    reconciled: boolean
}

export interface FixedAssetsReconciliation {
    rows: FixedAssetsReconciliationRow[]
    reconciled: boolean
    /** cantidad de fichas consideradas */
    assetCount: number
    /** fichas sin ningún asiento enlazado: la causa más común de diferencia */
    assetsWithoutEntries: { id: string; name: string }[]
    /** true si el módulo no tiene fichas cargadas (no es un error) */
    empty: boolean
}

/**
 * Totales del módulo. Llegan calculados por el propio módulo de Bienes de uso
 * (`getFixedAssetsMetrics`), que ya aplica método, vida útil, valor residual y
 * eventos: acá NO se recalcula la amortización, para no crear una tercera
 * versión de la misma cifra.
 */
export interface FixedAssetsModuleTotals {
    totalCost: number
    totalAccumulated: number
    count: number
}

/** Compara el módulo con el anexo canónico construido desde el Diario. */
export function reconcileFixedAssets(
    bundle: ReportingBundle,
    moduleTotals: FixedAssetsModuleTotals,
    assets: FixedAsset[]
): FixedAssetsReconciliation {
    const annex = bundle.statements.fixedAssetsAnnex

    const grossModuleCents = toCents(moduleTotals.totalCost)
    const depModuleCents = toCents(moduleTotals.totalAccumulated)

    // Una ficha sin ningún asiento enlazado es la causa más frecuente de que el
    // módulo y el Diario no coincidan.
    const assetsWithoutEntries = assets
        .filter(asset => {
            const linked = [
                asset.acquisitionJournalEntryId,
                asset.openingJournalEntryId,
                asset.rt6JournalEntryId,
                ...(asset.linkedJournalEntryIds ?? []),
            ].filter(Boolean)
            return linked.length === 0
        })
        .map(asset => ({ id: asset.id, name: asset.name }))

    const grossLedgerCents = toCents(annex.totals.grossClosing)
    const depLedgerCents = toCents(annex.totals.accumDepClosing)

    const row = (label: string, moduleCents: number, ledgerCents: number): FixedAssetsReconciliationRow => {
        const difference = (moduleCents - ledgerCents) / 100 || 0
        return {
            label,
            perModule: moduleCents / 100 || 0,
            perLedger: ledgerCents / 100 || 0,
            difference,
            reconciled: moduleCents === ledgerCents,
        }
    }

    const rows = [
        row('Valor de origen al cierre', grossModuleCents, grossLedgerCents),
        row('Depreciación acumulada al cierre', depModuleCents, depLedgerCents),
        row('Valor residual', grossModuleCents - depModuleCents, grossLedgerCents - depLedgerCents),
    ]

    return {
        rows,
        reconciled: rows.every(r => r.reconciled),
        assetCount: moduleTotals.count,
        assetsWithoutEntries,
        empty: moduleTotals.count === 0 && grossLedgerCents === 0,
    }
}
