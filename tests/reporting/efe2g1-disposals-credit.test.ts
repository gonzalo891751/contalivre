/**
 * Fase 2G.1 — HITO 1: fija las DEUDAS pendientes de disposiciones a crédito.
 *
 * La Fase 2G plegó correctamente la disposición SIMPLE (venta al contado con
 * resultado) pero dejó pendientes (§14): ventas a crédito, cobros parciales y
 * operaciones mixtas. Sin resolución explícita, el motor NO debe clasificar en
 * silencio: debe DETECTAR la disposición no resuelta y bloquear (§4.5,
 * `UNRESOLVED_DISPOSAL`).
 *
 * Estas pruebas son `it.fails` en el HITO 1 (documentan que hoy el motor NO
 * detecta ni bloquea estos casos: los reparte en silencio). El HITO 3 agrega la
 * detección + el override auditable y las convierte en verdes (regresión
 * permanente). No se debe borrar ni ablandar la aserción: se debe hacer cumplir.
 */

import { describe, it, expect } from 'vitest'
import { buildStatements } from '../../src/reporting/engine/buildStatements'
import { buildCashFlows } from '../../src/reporting/engine/buildCashFlow'
import { makeAccount } from '../accounting/helpers'
import type { Account, JournalEntry } from '../../src/core/models'
import type { ReportingInput } from '../../src/reporting/domain/types'

const CTX = {
    companyId: 'c1', exerciseId: 'ex-2025', exerciseLabel: 'Ejercicio 2025',
    periodStart: '2025-01-01', periodEnd: '2025-12-31',
}

// Créditos por venta de bienes de uso: cuenta de créditos GENÉRICA operativa
// (TRADE_RECEIVABLES). Sin evidencia transaccional, el motor no puede saber que
// nace de una disposición de inversión: debe pedir resolución, no adivinar.
const ACCOUNTS: Account[] = [
    makeAccount({ id: 'caja', code: '1.1.01', name: 'Caja', kind: 'ASSET', statementGroup: 'CASH_AND_BANKS' }),
    makeAccount({ id: 'cred-bu', code: '1.1.05', name: 'Créditos por venta de bienes de uso', kind: 'ASSET', statementGroup: 'TRADE_RECEIVABLES' }),
    makeAccount({ id: 'ppe', code: '1.2.01', name: 'Bienes de uso', kind: 'ASSET', statementGroup: 'PPE', section: 'NON_CURRENT' }),
    makeAccount({ id: 'ganancia', code: '4.5.01', name: 'Resultado venta bienes de uso', kind: 'INCOME', statementGroup: 'OTHER_INCOME', section: 'OPERATING' }),
    makeAccount({ id: 'capital', code: '3.1.01', name: 'Capital', kind: 'EQUITY', statementGroup: 'CAPITAL' }),
]

let seq = 0
function entry(date: string, memo: string, lines: { accountId: string; debit: number; credit: number }[]): JournalEntry {
    seq += 1
    return { id: `c${seq}`, entryNumber: seq, date, memo, status: 'POSTED', lines, createdAt: date, updatedAt: date } as unknown as JournalEntry
}

function run(opening: Map<string, { debit: number; credit: number }>, entries: JournalEntry[]) {
    seq = 0
    const input: ReportingInput = { context: CTX, entries, openingBalances: opening, accounts: ACCOUNTS }
    const statements = buildStatements(input)
    return buildCashFlows(input, statements)
}

const disposalCheck = (flows: ReturnType<typeof run>) =>
    flows.validation.checks.find(c => c.id === 'efe-disposicion')

describe('Fase 2G.1 — deudas de disposiciones a crédito (HITO 1, it.fails)', () => {
    it.fails('venta a crédito sin resolver: el motor debe DETECTAR y bloquear (UNRESOLVED_DISPOSAL)', () => {
        const flows = run(
            new Map([['ppe', { debit: 20000, credit: 0 }], ['capital', { debit: 0, credit: 20000 }]]),
            [entry('2025-06-10', 'Venta de bienes de uso a crédito', [
                { accountId: 'cred-bu', debit: 30000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 20000 },
                { accountId: 'ganancia', debit: 0, credit: 10000 },
            ])],
        )
        // Hoy no existe control de disposición: el crédito por venta cae en capital
        // de trabajo operativo y la ganancia distorsiona el indirecto en silencio.
        const check = disposalCheck(flows)
        expect(check, 'debe existir un control efe-disposicion').toBeDefined()
        expect(check!.passed, 'la disposición no resuelta debe bloquear').toBe(false)
    })

    it.fails('cobro posterior de una venta a crédito debe clasificarse como inversión, no operativo', () => {
        // Venta a crédito en ejercicio previo (apertura del crédito) + cobro en el año.
        const flows = run(
            new Map([['cred-bu', { debit: 30000, credit: 0 }], ['capital', { debit: 0, credit: 30000 }]]),
            [entry('2025-06-10', 'Cobro de venta de bienes de uso', [
                { accountId: 'caja', debit: 30000, credit: 0 },
                { accountId: 'cred-bu', debit: 0, credit: 30000 },
            ])],
        )
        // Sin evidencia/override, hoy el cobro del crédito genérico entra a operativo.
        expect(flows.direct.investing.amount, 'el cobro debe ser inversión').toBe(30000)
        expect(flows.direct.operating.amount, 'el cobro NO es operativo').toBe(0)
    })

    it.fails('operación mixta: sólo el efectivo (10.000) es flujo de inversión, el crédito se revela', () => {
        const flows = run(
            new Map([['ppe', { debit: 22000, credit: 0 }], ['capital', { debit: 0, credit: 22000 }]]),
            [entry('2025-06-10', 'Venta mixta de bienes de uso', [
                { accountId: 'caja', debit: 10000, credit: 0 },
                { accountId: 'cred-bu', debit: 20000, credit: 0 },
                { accountId: 'ppe', debit: 0, credit: 22000 },
                { accountId: 'ganancia', debit: 0, credit: 8000 },
            ])],
        )
        // Hoy la línea de PPE (22.000) se imputa entera a inversión aunque sólo se
        // cobraron 10.000: sobre-expone el flujo de inversión.
        expect(flows.direct.investing.amount, 'sólo el efectivo cobrado es inversión').toBe(10000)
        expect(flows.direct.operating.amount, 'la venta mixta no genera flujo operativo').toBe(0)
    })
})
