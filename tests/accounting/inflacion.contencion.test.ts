/**
 * Fase 2A — Contención del ajuste por inflación (NOR-004).
 * Un índice faltante NUNCA se sustituye silenciosamente por coeficiente 1:
 * la partida queda en error e informa qué período falta.
 */

import { describe, it, expect } from 'vitest'
import { calculateCoef, calculateCoefFromDate, computeRT6Partida } from '../../src/core/cierre-valuacion/calc'
import type { IndexRow, PartidaRT6 } from '../../src/core/cierre-valuacion/types'

const INDICES: IndexRow[] = [
    { period: '2025-01', value: 100 },
    { period: '2025-12', value: 200 },
]

describe('Fase 2A — índices faltantes bloquean, no valen 1', () => {
    it('calculateCoef devuelve null si falta un índice', () => {
        expect(calculateCoef(200, 100)).toBe(2)
        expect(calculateCoef(undefined, 100)).toBeNull()
        expect(calculateCoef(200, undefined)).toBeNull()
        expect(calculateCoef(200, 0)).toBeNull()
    })

    it('calculateCoefFromDate devuelve null para períodos sin índice', () => {
        expect(calculateCoefFromDate(INDICES, '2025-01-15', '2025-12')).toBe(2)
        expect(calculateCoefFromDate(INDICES, '2025-07-15', '2025-12')).toBeNull()
    })

    it('computeRT6Partida marca error e informa el período faltante', () => {
        const partida: PartidaRT6 = {
            id: 'p1',
            rubro: 'Mercaderias',
            grupo: 'ACTIVO',
            rubroLabel: 'Mercaderías',
            cuentaCodigo: '1.1.04.01',
            cuentaNombre: 'Mercaderías',
            items: [
                { id: 'l1', fechaOrigen: '2025-07-10', importeBase: 1000, detalle: 'lote julio' },
            ],
        } as unknown as PartidaRT6

        const computed = computeRT6Partida(partida, INDICES, '2025-12')
        expect(computed.status).toBe('error')
        expect(computed.missingPeriods).toContain('2025-07')
    })

    it('con todos los índices presentes reexpresa correctamente', () => {
        const partida: PartidaRT6 = {
            id: 'p2',
            rubro: 'Mercaderias',
            grupo: 'ACTIVO',
            rubroLabel: 'Mercaderías',
            cuentaCodigo: '1.1.04.01',
            cuentaNombre: 'Mercaderías',
            items: [
                { id: 'l1', fechaOrigen: '2025-01-10', importeBase: 1000, detalle: 'lote enero' },
            ],
        } as unknown as PartidaRT6

        const computed = computeRT6Partida(partida, INDICES, '2025-12')
        expect(computed.status).toBe('ok')
        expect(computed.missingPeriods).toEqual([])
        expect(computed.totalHomog).toBe(2000)
        expect(computed.totalRecpam).toBe(1000)
    })
})
