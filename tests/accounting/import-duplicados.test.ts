/**
 * Auditoría E2E — repetir una importación duplicaba el ejercicio (DEF-A08).
 *
 * Reproducción: se importó el archivo del ejercicio 2025 (95 asientos) y, sin
 * cambiar nada, se volvió a importar el MISMO archivo. El asistente informó
 * "Advertencias: Ninguna" y el Libro Diario pasó de 95 a 190 asientos: todo el
 * año quedó contabilizado dos veces.
 *
 * La huella no fusiona en silencio: identifica los repetidos para poder
 * avisarlos y omitirlos. Dos asientos económicamente idénticos del mismo día
 * pueden ser legítimos, así que la decisión queda en quien importa.
 */

import { describe, it, expect } from 'vitest'
import { entryFingerprint, splitAlreadyImported } from '../../src/accounting/application/importDedup'

const asiento = (date: string, memo: string, lines: Array<[string, number, number]>) => ({
    date, memo,
    lines: lines.map(([accountId, debit, credit]) => ({ accountId, debit, credit })),
})

const VENTA = asiento('2025-02-20', 'Venta de mercaderías al contado', [
    ['banco', 15_972_000, 0],
    ['ventas', 0, 13_200_000],
    ['ivaDF', 0, 2_772_000],
])

describe('huella del hecho contable', () => {
    it('es la misma aunque cambie el orden de las líneas', () => {
        const otroOrden = asiento('2025-02-20', 'Venta de mercaderías al contado', [
            ['ivaDF', 0, 2_772_000],
            ['ventas', 0, 13_200_000],
            ['banco', 15_972_000, 0],
        ])
        expect(entryFingerprint(otroOrden)).toBe(entryFingerprint(VENTA))
    })

    it('ignora acentos, mayúsculas y espacios repetidos del concepto', () => {
        const variante = asiento('2025-02-20', '  VENTA  DE MERCADERIAS AL CONTADO ', VENTA.lines.map(
            l => [l.accountId, l.debit, l.credit] as [string, number, number]))
        expect(entryFingerprint(variante)).toBe(entryFingerprint(VENTA))
    })

    it('cambia si cambia la fecha, el importe o la cuenta', () => {
        const otraFecha = { ...VENTA, date: '2025-02-21' }
        const otroImporte = asiento('2025-02-20', 'Venta de mercaderías al contado', [
            ['banco', 15_972_001, 0], ['ventas', 0, 13_200_001], ['ivaDF', 0, 2_772_000],
        ])
        const otraCuenta = asiento('2025-02-20', 'Venta de mercaderías al contado', [
            ['caja', 15_972_000, 0], ['ventas', 0, 13_200_000], ['ivaDF', 0, 2_772_000],
        ])
        expect(entryFingerprint(otraFecha)).not.toBe(entryFingerprint(VENTA))
        expect(entryFingerprint(otroImporte)).not.toBe(entryFingerprint(VENTA))
        expect(entryFingerprint(otraCuenta)).not.toBe(entryFingerprint(VENTA))
    })
})

describe('detección de asientos ya importados', () => {
    const COMPRA = asiento('2025-01-15', 'Compra de mercaderías', [
        ['mercaderias', 10_000_000, 0], ['banco', 0, 10_000_000],
    ])

    it('la primera importación no reporta repetidos', () => {
        const { repetidos, nuevos } = splitAlreadyImported([VENTA, COMPRA], [])
        expect(repetidos).toHaveLength(0)
        expect(nuevos).toHaveLength(2)
    })

    it('reimportar el mismo archivo marca todo como repetido', () => {
        const { repetidos, nuevos } = splitAlreadyImported([VENTA, COMPRA], [VENTA, COMPRA])
        expect(repetidos).toHaveLength(2)
        expect(nuevos).toHaveLength(0)
    })

    it('sólo marca lo que ya está: lo nuevo del archivo se importa', () => {
        const NUEVO = asiento('2025-03-01', 'Pago a proveedores', [
            ['proveedores', 5_000_000, 0], ['banco', 0, 5_000_000],
        ])
        const { repetidos, nuevos } = splitAlreadyImported([VENTA, COMPRA, NUEVO], [VENTA, COMPRA])
        expect(repetidos.map(r => r.memo)).toEqual([VENTA.memo, COMPRA.memo])
        expect(nuevos).toEqual([NUEVO])
    })

    it('un archivo que trae el mismo asiento dos veces marca la segunda aparición', () => {
        const { repetidos, nuevos } = splitAlreadyImported([COMPRA, COMPRA], [])
        expect(nuevos).toHaveLength(1)
        expect(repetidos).toHaveLength(1)
    })

    it('los borradores del Diario no cuentan como ya contabilizados', () => {
        // El llamador filtra los DRAFT antes de comparar; acá se fija la
        // expectativa de que comparar contra una lista vacía deja todo nuevo.
        const { nuevos } = splitAlreadyImported([VENTA], [])
        expect(nuevos).toHaveLength(1)
    })
})
