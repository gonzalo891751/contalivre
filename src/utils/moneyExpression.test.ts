
import { describe, it, expect } from 'vitest'
import { evaluateMoneyExpression } from './moneyExpression'

describe('evaluateMoneyExpression', () => {
    it('evaluates simple multiplication', () => {
        const result = evaluateMoneyExpression('=50*1000')
        expect(result.value).toBe(50000)
        expect(result.error).toBeUndefined()
    })

    it('evaluates parentheses', () => {
        const result = evaluateMoneyExpression('=(200+300)*2')
        expect(result.value).toBe(1000)
    })

    it('evaluates division and rounding', () => {
        const result = evaluateMoneyExpression('=1000/1.21')
        // 826.44628... -> 826.45
        expect(result.value).toBe(826.45)
    })

    it('handles Argentina format (dot thousands, comma decimal)', () => {
        const result = evaluateMoneyExpression('=1.234,56+10')
        expect(result.value).toBe(1244.56)
    })

    it('handles US format (comma thousands, dot decimal)', () => {
        const result = evaluateMoneyExpression('=1,234.56+10')
        expect(result.value).toBe(1244.56)
    })

    it('handles unary minus', () => {
        const result = evaluateMoneyExpression('=-100+50')
        expect(result.value).toBe(-50)
    })

    it('handles unary minus inside parens', () => {
        const result = evaluateMoneyExpression('=(-100)*2')
        expect(result.value).toBe(-200)
    })

    it('returns error for division by zero', () => {
        const result = evaluateMoneyExpression('=10/0')
        expect(result.value).toBeNull()
        expect(result.error).toBe('Division by zero')
    })

    it('returns error for invalid characters', () => {
        const result = evaluateMoneyExpression('=abc')
        expect(result.value).toBeNull()
        expect(result.error).toBeDefined()
    })

    it('returns error for unsupported operators (power)', () => {
        // 2 ** 3 -> parsed as 2 * * 3. 
        // 2 * 3 = 6. Then 6 * ... stack underflow.
        const result = evaluateMoneyExpression('=2**3')
        expect(result.value).toBeNull()
        expect(result.error).toBeDefined()
    })

    it('returns error for malformed expression', () => {
        const result = evaluateMoneyExpression('=5+')
        expect(result.value).toBeNull()
        expect(result.error).toBeDefined()
    })
})
