/**
 * Fase 2A — Integridad Diario–Mayor–Balance (§3.1).
 * Total Debe Diario = Total Haber Diario = Débitos Mayor = Créditos Mayor,
 * balance de comprobación equilibrado y ninguna línea desaparece.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, seedTestAccounts, line, simpleLines } from './helpers'
import { postNewEntry } from '../../src/accounting/application/journalService'
import { insertEntryRecord } from '../../src/accounting/repositories/journalRepository'
import { computeLedger, UNKNOWN_ACCOUNT_ID } from '../../src/core/ledger'
import { computeTrialBalance } from '../../src/core/balance'
import { sumMoney } from '../../src/accounting/domain/money'
import { db } from '../../src/storage/db'

describe('Fase 2A — integridad Diario = Mayor = Balance', () => {
    beforeEach(async () => {
        await resetDb()
        await seedTestAccounts()
        await postNewEntry({ date: '2025-01-10', memo: 'aporte', lines: simpleLines('caja', 'capital', 1000000) })
        await postNewEntry({ date: '2025-02-05', memo: 'compra', lines: simpleLines('mercaderias', 'caja', 250000.33) })
        await postNewEntry({
            date: '2025-03-01', memo: 'venta mixta',
            lines: [
                line('caja', 100000, 0),
                line('deudores', 21000.67, 0),
                line('ventas', 0, 121000.67),
            ],
        })
    })

    it('Diario: total Debe = total Haber', async () => {
        const entries = await db.entries.toArray()
        const totalDebit = sumMoney(entries.flatMap(e => e.lines.map(l => l.debit)))
        const totalCredit = sumMoney(entries.flatMap(e => e.lines.map(l => l.credit)))
        expect(totalDebit).toBe(totalCredit)
        expect(totalDebit).toBe(1371001.0)
    })

    it('Mayor: débitos y créditos igualan al Diario, sin líneas perdidas', async () => {
        const entries = await db.entries.toArray()
        const accounts = await db.accounts.toArray()
        const ledger = computeLedger(entries, accounts)

        const ledgerDebits = sumMoney(Array.from(ledger.values()).map(a => a.totalDebit))
        const ledgerCredits = sumMoney(Array.from(ledger.values()).map(a => a.totalCredit))
        const journalDebits = sumMoney(entries.flatMap(e => e.lines.map(l => l.debit)))

        expect(ledgerDebits).toBe(journalDebits)
        expect(ledgerCredits).toBe(journalDebits)

        const movementCount = Array.from(ledger.values()).reduce((n, a) => n + a.movements.length, 0)
        const lineCount = entries.reduce((n, e) => n + e.lines.length, 0)
        expect(movementCount).toBe(lineCount)
    })

    it('Balance de comprobación equilibrado', async () => {
        const entries = await db.entries.toArray()
        const accounts = await db.accounts.toArray()
        const tb = computeTrialBalance(computeLedger(entries, accounts), accounts)
        expect(tb.isBalanced).toBe(true)
        expect(tb.totalSumDebit).toBe(tb.totalSumCredit)
    })

    it('una línea legacy con cuenta inexistente NO desaparece del Mayor', async () => {
        // Simula un asiento histórico corrupto (solo posible vía repositorio;
        // el servicio lo rechazaría)
        await insertEntryRecord({
            id: 'legacy-bad', date: '2025-04-01', memo: 'legacy con cuenta borrada',
            status: 'POSTED',
            lines: [
                { accountId: 'cuenta-borrada', debit: 500, credit: 0 },
                { accountId: 'capital', debit: 0, credit: 500 },
            ],
        })

        const entries = await db.entries.toArray()
        const accounts = await db.accounts.toArray()
        const ledger = computeLedger(entries, accounts)

        const unknownBucket = ledger.get(UNKNOWN_ACCOUNT_ID)
        expect(unknownBucket).toBeDefined()
        expect(unknownBucket!.totalDebit).toBe(500)

        // Los totales del mayor siguen igualando al diario
        const ledgerDebits = sumMoney(Array.from(ledger.values()).map(a => a.totalDebit))
        const journalDebits = sumMoney(entries.flatMap(e => e.lines.map(l => l.debit)))
        expect(ledgerDebits).toBe(journalDebits)
    })
})
