/**
 * Fase 2A — Servicio monetario único (ACC-004).
 */

import { describe, it, expect } from 'vitest'
import {
    isZeroMoney,
    moneyEquals,
    roundMoney,
    sumMoney,
    validateAmount,
} from '../../src/accounting/domain/money'

describe('Fase 2A — servicio monetario', () => {
    it('rechaza NaN, Infinity y -Infinity', () => {
        expect(validateAmount(NaN, 'x')).toContain('NaN')
        expect(validateAmount(Infinity, 'x')).toContain('Infinity')
        expect(validateAmount(-Infinity, 'x')).toContain('Infinity')
        expect(validateAmount('100' as unknown, 'x')).toContain('debe ser un número')
    })

    it('rechaza negativos salvo permiso explícito', () => {
        expect(validateAmount(-1, 'x')).toContain('negativo')
        expect(validateAmount(-1, 'x', { allowNegative: true })).toBeNull()
    })

    it('acepta importes válidos', () => {
        expect(validateAmount(0, 'x')).toBeNull()
        expect(validateAmount(1234.56, 'x')).toBeNull()
    })

    it('redondeo central half-up a 2 decimales', () => {
        expect(roundMoney(1.005)).toBe(1.01)
        expect(roundMoney(1.004)).toBe(1.0)
        expect(roundMoney(-1.005)).toBe(-1.01)
        expect(roundMoney(2.675)).toBe(2.68)
    })

    it('suma sin drift de punto flotante', () => {
        // 0.1 + 0.2 !== 0.3 en float, pero sí en centavos
        expect(sumMoney([0.1, 0.2])).toBe(0.3)
        const many = Array(1000).fill(0.01)
        expect(sumMoney(many)).toBe(10)
    })

    it('igualdad exacta al centavo (sin tolerancia acumulativa)', () => {
        expect(moneyEquals(100.0, 100.0)).toBe(true)
        expect(moneyEquals(100.0, 100.01)).toBe(false)
        expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true)
        expect(moneyEquals(NaN, NaN)).toBe(false)
    })

    it('cero monetario', () => {
        expect(isZeroMoney(0)).toBe(true)
        expect(isZeroMoney(0.004)).toBe(true)
        expect(isZeroMoney(0.01)).toBe(false)
    })
})
