import { describe, it, expect } from 'vitest'
import { validateEntry } from '../src/core/validation'
import type { JournalEntry } from '../src/core/models'

describe('validateEntry', () => {
    it('should pass for a valid balanced entry', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'Test entry',
            lines: [
                { accountId: 'acc1', debit: 1000, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: 1000 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(true)
        expect(result.errors).toHaveLength(0)
        expect(result.diff).toBe(0)
    })

    it('should fail for unbalanced entry (more debit)', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'Unbalanced',
            lines: [
                { accountId: 'acc1', debit: 1000, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: 500 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.diff).toBe(500)
        expect(result.errors.some((e) => e.includes('Haber'))).toBe(true)
    })

    it('should fail for unbalanced entry (more credit)', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'Unbalanced',
            lines: [
                { accountId: 'acc1', debit: 500, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: 1000 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.diff).toBe(-500)
        expect(result.errors.some((e) => e.includes('Debe'))).toBe(true)
    })

    it('should fail if a line has both debit and credit', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'Invalid line',
            lines: [
                { accountId: 'acc1', debit: 500, credit: 500 },
                { accountId: 'acc2', debit: 0, credit: 0 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.errors.some((e) => e.includes('simultáneamente'))).toBe(true)
    })

    it('should fail for negative amounts', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'Negative',
            lines: [
                { accountId: 'acc1', debit: -100, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: -100 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.errors.some((e) => e.includes('negativo'))).toBe(true)
    })

    it('should fail for less than 2 lines', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'One line',
            lines: [{ accountId: 'acc1', debit: 1000, credit: 0 }],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.errors.some((e) => e.includes('2 líneas'))).toBe(true)
    })

    it('should fail if line has no account', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'No account',
            lines: [
                { accountId: '', debit: 1000, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: 1000 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.errors.some((e) => e.includes('cuenta'))).toBe(true)
    })

    it('should fail if entry has no date', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '',
            memo: 'No date',
            lines: [
                { accountId: 'acc1', debit: 1000, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: 1000 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(false)
        expect(result.errors.some((e) => e.includes('fecha'))).toBe(true)
    })

    it('should handle small rounding differences (tolerance)', () => {
        const entry: JournalEntry = {
            id: '1',
            date: '2024-01-15',
            memo: 'Rounding',
            lines: [
                { accountId: 'acc1', debit: 100.01, credit: 0 },
                { accountId: 'acc2', debit: 0, credit: 100 },
            ],
        }

        const result = validateEntry(entry)

        expect(result.ok).toBe(true)
    })
})
