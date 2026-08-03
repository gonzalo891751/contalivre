/**
 * Qué línea toca cada tipo de operación intragrupo (Fase 2K §11).
 *
 * Explícito y tabulado, no adivinado. Cuando un tipo de operación no puede
 * alojar un resultado no trascendido (no queda ningún activo dentro del grupo
 * donde ese resultado esté contenido), el motor lo dice y bloquea en lugar de
 * inventar una contrapartida.
 */

import type { ConsolidatedLineId, IntragroupOperationType } from '../domain/types'

export interface OperationRule {
    /** línea de ingreso del vendedor */
    sellerLine: ConsolidatedLineId
    /** línea de costo o gasto del comprador */
    buyerLine: ConsolidatedLineId
    /**
     * Activo del comprador donde queda contenido el resultado no trascendido.
     * null = la operación se consume en el período y no deja resultado alojado
     * en ningún activo.
     */
    assetLine: ConsolidatedLineId | null
    /**
     * true si hay que eliminar la operación BRUTA (ingreso contra costo) además
     * del resultado no trascendido. false en las transferencias de activos, donde
     * el vendedor reconoce el resultado neto y el comprador capitaliza: allí no
     * hay un par ingreso/costo que anular.
     */
    grossElimination: boolean
    label: string
}

export const OPERATION_RULES: Record<IntragroupOperationType, OperationRule> = {
    GOODS: {
        sellerLine: 'ER_VENTAS',
        buyerLine: 'ER_COSTO_VENTAS',
        assetLine: 'AC_BIENES_CAMBIO',
        grossElimination: true,
        label: 'Compraventa de mercaderías',
    },
    SERVICES: {
        sellerLine: 'ER_VENTAS',
        buyerLine: 'ER_GASTOS_ADMINISTRACION',
        assetLine: null,
        grossElimination: true,
        label: 'Prestación de servicios',
    },
    RENT: {
        sellerLine: 'ER_OTROS_RESULTADOS',
        buyerLine: 'ER_GASTOS_ADMINISTRACION',
        assetLine: null,
        grossElimination: true,
        label: 'Alquiler',
    },
    INTEREST: {
        sellerLine: 'ER_INGRESOS_FINANCIEROS',
        buyerLine: 'ER_GASTOS_FINANCIEROS',
        assetLine: null,
        grossElimination: true,
        label: 'Intereses',
    },
    DIVIDENDS: {
        sellerLine: 'PN_RESULTADOS_ACUMULADOS',
        buyerLine: 'ER_RESULTADO_INVERSIONES_PERMANENTES',
        assetLine: null,
        grossElimination: true,
        label: 'Dividendos',
    },
    FIXED_ASSET: {
        sellerLine: 'ER_OTROS_RESULTADOS',
        buyerLine: 'ER_OTROS_RESULTADOS',
        assetLine: 'ANC_BIENES_USO',
        grossElimination: false,
        label: 'Transferencia de bienes de uso',
    },
    INTANGIBLE: {
        sellerLine: 'ER_OTROS_RESULTADOS',
        buyerLine: 'ER_OTROS_RESULTADOS',
        assetLine: 'ANC_INTANGIBLES',
        grossElimination: false,
        label: 'Transferencia de activos intangibles',
    },
    OTHER: {
        sellerLine: 'ER_OTROS_RESULTADOS',
        buyerLine: 'ER_OTROS_RESULTADOS',
        assetLine: null,
        grossElimination: true,
        label: 'Otra operación intragrupo',
    },
}

/** Explicación pedagógica de por qué se elimina una operación de este tipo */
export function operationRationale(type: IntragroupOperationType): string {
    switch (type) {
        case 'GOODS':
            return 'El grupo no puede venderse mercaderías a sí mismo. Para la entidad económica única no hubo venta ni compra: sólo un traslado interno de bienes. El ingreso del vendedor y el costo que el comprador cargó por esa compra se eliminan íntegramente, aunque el bien ya haya salido del grupo.'
        case 'SERVICES':
            return 'Un servicio prestado de una entidad del grupo a otra no es un ingreso del grupo ni un gasto del grupo: es trabajo interno. Se elimina el ingreso del prestador contra el gasto del receptor.'
        case 'RENT':
            return 'El grupo no puede alquilarse un bien a sí mismo: el alquiler cobrado por una entidad es el gasto de otra, y para la entidad económica única no existe ninguno de los dos.'
        case 'INTEREST':
            return 'El grupo no puede cobrarse intereses a sí mismo. El interés ganado por la prestamista y el perdido por la prestataria se eliminan por igual importe.'
        case 'DIVIDENDS':
            return 'Los dividendos que la controlada distribuye a la controladora no son ganancia del grupo: son un movimiento de fondos entre bolsillos de la misma entidad económica. Se elimina el ingreso de la controladora y se repone la distribución en los resultados acumulados de la controlada. Los dividendos pagados a la participación no controladora SÍ salen del grupo y no se eliminan.'
        case 'FIXED_ASSET':
            return 'Al transferir un bien de uso dentro del grupo, el vendedor reconoce un resultado y el comprador capitaliza el precio pagado. Para el grupo el bien nunca cambió de dueño: se elimina el resultado y el activo vuelve a su costo original, y el mayor valor se va realizando a medida que el bien se deprecia dentro del grupo.'
        case 'INTANGIBLE':
            return 'La transferencia interna de un intangible no genera resultado para el grupo: se elimina el resultado reconocido y el activo vuelve a su medición de origen.'
        case 'OTHER':
            return 'Operación entre entidades del grupo: para la entidad económica única no existe, y por eso su ingreso y su gasto se eliminan.'
    }
}
