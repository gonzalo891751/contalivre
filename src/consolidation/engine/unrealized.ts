/**
 * Resultados no trascendidos a terceros (Fase 2K §11, §12).
 *
 * Tres cosas DISTINTAS que el módulo no mezcla:
 *
 *  1. Eliminación de la OPERACIÓN interna. El grupo no puede venderse a sí
 *     mismo: el ingreso del vendedor y el costo que el comprador cargó por esa
 *     compra se eliminan íntegramente, incluso cuando el bien ya salió del
 *     grupo. Es una eliminación de exposición, sin efecto sobre el resultado.
 *
 *  2. Eliminación del RESULTADO NO TRASCENDIDO contenido en el activo que
 *     todavía está dentro del grupo. Esta sí reduce el resultado y el activo.
 *
 *  3. Reversión de la eliminación cuando el activo finalmente sale del grupo,
 *     en la proporción realizada.
 *
 * Demostración de que las dos primeras, juntas, dan el costo correcto para
 * cualquier proporción realizada r:
 *
 *   costo intragrupo acumulado en la suma previa = C + r·T
 *     (C = costo del vendedor; r·T = costo que el comprador cargó al revender)
 *   costo que el grupo debe exponer                = r·C
 *   eliminación necesaria                          = C + r·T − r·C
 *
 *   A) elimina T          → −T
 *   B) repone U = (T−C)(1−r) → +U
 *   A + B = −T + T − C − r·T + r·C = −(C + r·T − r·C)   ✔ idéntico
 *
 * ATRIBUCIÓN. El resultado no trascendido se imputa a la entidad QUE LO GENERÓ,
 * es decir al vendedor:
 *   - vendedor = controlada  (ascendente / lateral): el ajuste se reparte entre
 *     los propietarios de la controladora y la PNC según la participación;
 *   - vendedor = controladora (descendente): el ajuste es íntegramente de los
 *     propietarios de la controladora y NO debe reducir la PNC.
 * Una sola regla —"se atribuye al vendedor"— cubre los tres sentidos.
 */

import { addAmounts, multiplyAmountByRate, roundMoney, subAmounts } from '../../accounting/domain/money'
import type { IntragroupDirection, IntragroupOperation } from '../domain/types'

export interface UnrealizedResult {
    operation: IntragroupOperation
    direction: IntragroupDirection
    /** entidad que generó el resultado (el vendedor) */
    originCompanyId: string
    /** entidad en cuyo activo quedó alojado el mayor valor (el comprador) */
    holdingCompanyId: string
    /** resultado interno total de la operación: precio intragrupo − costo del grupo */
    internalResult: number
    /** proporción que ya salió del grupo, 0..1 */
    realizedRatio: number
    /** resultado ya trascendido a terceros (no se elimina) */
    realizedResult: number
    /** resultado NO trascendido: se elimina contra el activo */
    unrealizedResult: number
    /** impuesto diferido sobre el resultado no trascendido (0 si no se reconoce) */
    deferredTax: number
    /** true si el importe lo fijó el usuario en lugar de derivarse */
    manual: boolean
    /** cálculo paso a paso, para la explicación pedagógica */
    computation: string[]
}

/**
 * Sentido de la operación. Se DERIVA de los roles, no se declara: si el
 * vendedor es la controladora es descendente; si es una controlada y el
 * comprador es la controladora, ascendente; entre dos controladas, lateral.
 */
export function deriveDirection(
    sellerCompanyId: string,
    buyerCompanyId: string,
    parentCompanyId: string
): IntragroupDirection {
    if (sellerCompanyId === parentCompanyId) return 'DOWNSTREAM'
    if (buyerCompanyId === parentCompanyId) return 'UPSTREAM'
    return 'LATERAL'
}

export function directionLabel(direction: IntragroupDirection): string {
    switch (direction) {
        case 'UPSTREAM': return 'Ascendente (la controlada vende a la controladora)'
        case 'DOWNSTREAM': return 'Descendente (la controladora vende a la controlada)'
        case 'LATERAL': return 'Lateral (una controlada vende a otra controlada)'
    }
}

export function computeUnrealized(
    operation: IntragroupOperation,
    parentCompanyId: string
): UnrealizedResult {
    const direction = deriveDirection(operation.sellerCompanyId, operation.buyerCompanyId, parentCompanyId)
    const internalResult = subAmounts(operation.transferAmount, operation.groupCost)
    const realizedRatio = operation.realizedRatio
    const realizedResult = multiplyAmountByRate(internalResult, realizedRatio)

    const derivedUnrealized = subAmounts(internalResult, realizedResult)
    const manual = operation.manualUnrealizedAmount !== undefined
    const unrealizedResult = manual
        ? roundMoney(operation.manualUnrealizedAmount!)
        : derivedUnrealized

    const deferredTax = operation.deferredTaxRate
        ? multiplyAmountByRate(unrealizedResult, operation.deferredTaxRate)
        : 0

    const computation: string[] = [
        `Precio de la operación dentro del grupo: ${fmt(operation.transferAmount)}`,
        `Costo del bien para el grupo: ${fmt(operation.groupCost)}`,
        `Resultado interno de la operación: ${fmt(operation.transferAmount)} − ${fmt(operation.groupCost)} = ${fmt(internalResult)}`,
        `Proporción que ya salió del grupo: ${(realizedRatio * 100).toFixed(2)} %`,
        `Resultado trascendido a terceros: ${fmt(internalResult)} × ${(realizedRatio * 100).toFixed(2)} % = ${fmt(realizedResult)}`,
    ]
    if (manual) {
        computation.push(
            `Resultado no trascendido fijado manualmente: ${fmt(unrealizedResult)} (derivado: ${fmt(derivedUnrealized)})`,
            `Fundamento: ${operation.manualReason ?? 'sin fundamento declarado'}`,
        )
    } else {
        computation.push(
            `Resultado NO trascendido: ${fmt(internalResult)} × ${((1 - realizedRatio) * 100).toFixed(2)} % = ${fmt(unrealizedResult)}`,
        )
    }
    if (operation.depreciationOnUnrealized) {
        computation.push(
            `Depreciación del período sobre el mayor valor transferido: ${fmt(operation.depreciationOnUnrealized)} ` +
            '(reduce el resultado no trascendido remanente)',
        )
    }
    if (operation.deferredTaxRate) {
        computation.push(
            `Impuesto diferido: ${fmt(unrealizedResult)} × ${(operation.deferredTaxRate * 100).toFixed(2)} % = ${fmt(deferredTax)}`,
        )
    } else {
        computation.push('Sin efecto impositivo diferido declarado para esta operación')
    }
    computation.push(
        `Atribución: ${directionLabel(direction)}. El ajuste se imputa a quien generó el resultado, ` +
        `la entidad vendedora.`,
    )

    return {
        operation,
        direction,
        originCompanyId: operation.sellerCompanyId,
        holdingCompanyId: operation.buyerCompanyId,
        internalResult,
        realizedRatio,
        realizedResult,
        unrealizedResult,
        deferredTax,
        manual,
        computation,
    }
}

/**
 * Resultado no trascendido remanente después de la depreciación del período,
 * para transferencias de bienes de uso: el mayor valor transferido se realiza
 * a medida que el bien se deprecia dentro del grupo.
 */
export function netUnrealizedAfterDepreciation(result: UnrealizedResult): number {
    const depreciation = result.operation.depreciationOnUnrealized ?? 0
    if (!depreciation) return result.unrealizedResult
    const net = subAmounts(result.unrealizedResult, depreciation)
    // La depreciación no puede realizar más de lo que hay pendiente.
    return result.unrealizedResult >= 0 ? Math.max(0, net) : Math.min(0, net)
}

/** Suma de resultados no trascendidos originados por una entidad concreta */
export function unrealizedOriginatedBy(
    companyId: string,
    results: UnrealizedResult[]
): number {
    return results
        .filter(r => r.originCompanyId === companyId)
        .reduce((sum, r) => addAmounts(sum, netUnrealizedAfterDepreciation(r)), 0)
}

/** Suma de resultados no trascendidos alojados en el activo de una entidad */
export function unrealizedHeldBy(
    companyId: string,
    results: UnrealizedResult[]
): number {
    return results
        .filter(r => r.holdingCompanyId === companyId)
        .reduce((sum, r) => addAmounts(sum, netUnrealizedAfterDepreciation(r)), 0)
}

function fmt(value: number): string {
    return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
