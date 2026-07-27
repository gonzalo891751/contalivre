/**
 * Verificación independiente del RECPAM sobre el Checkpoint A.
 *
 * Reimplementa las dos determinaciones con aritmética propia, fuera del motor,
 * para poder contrastarlas contra lo que produce la aplicación. Si las dos
 * implementaciones independientes coinciden, la cifra no es un artefacto del
 * código: es el resultado del caso.
 *
 * Ejecutar:  node scripts/auditoria/verificar-recpam.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = resolve(HERE, '..', '..', 'docs', 'auditoria')

const cents = (n) => Math.round((n || 0) * 100)
const fmt = (n) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const backup = JSON.parse(readFileSync(resolve(DOCS, 'checkpoints', 'checkpoint-a-pre-cierre.json'), 'utf-8'))
const accounts = backup.tables.accounts
const byId = new Map(accounts.map(a => [a.id, a]))
const indexSet = backup.tables.inflationIndexSets[0]
const IDX = new Map(indexSet.values.map(v => [v.period, v.value]))

const CLOSE = '2025-12'
const OPENING_PERIOD = '2024-12'
const PERIODS = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`)
const coef = (p) => IDX.get(CLOSE) / IDX.get(p)

// ─────────────────────────────────────────────────────────────
// Clasificación monetaria, con las mismas reglas del motor
// ─────────────────────────────────────────────────────────────
const GROUP_MONETARY = {
    CASH_AND_BANKS: 'MONETARY', TRADE_RECEIVABLES: 'MONETARY', OTHER_RECEIVABLES: 'MONETARY',
    TAX_CREDITS: 'MONETARY', INVENTORIES: 'NON_MONETARY', PPE: 'NON_MONETARY',
    INTANGIBLES: 'NON_MONETARY', INVESTMENTS: 'MIXED', TRADE_PAYABLES: 'MONETARY',
    TAX_LIABILITIES: 'MONETARY', PAYROLL_LIABILITIES: 'MONETARY', LOANS: 'MONETARY',
    OTHER_PAYABLES: 'MONETARY', DEFERRED_INCOME: 'MONETARY',
}
// La metadata declarada en el plan gana sobre la derivación por rubro
const DECLARED = {
    '1.1.03.21': 'NON_MONETARY', '1.1.03.22': 'NON_MONETARY', '1.1.03.23': 'NON_MONETARY',
    '1.1.05.01': 'MONETARY', '1.1.05.02': 'NON_MONETARY', '1.1.05.03': 'MONETARY',
    '1.2.03.01': 'NON_MONETARY',
}
const monetaryOf = (a) => {
    if (DECLARED[a.code]) return DECLARED[a.code]
    if (a.monetaryClassification) return a.monetaryClassification
    if (a.kind === 'EQUITY' || a.kind === 'INCOME' || a.kind === 'EXPENSE') return 'NON_MONETARY'
    return (a.statementGroup && GROUP_MONETARY[a.statementGroup]) || 'NOT_APPLICABLE'
}

// ─────────────────────────────────────────────────────────────
// Movimientos por cuenta y período
// ─────────────────────────────────────────────────────────────
const movements = new Map()   // accountId -> Map(period -> cents)
const balance = new Map()

for (const e of backup.tables.entries) {
    if (e.status === 'DRAFT') continue
    if (e.sourceModule === 'closing') continue
    if (e.date < '2025-01-01' || e.date > '2025-12-31') continue
    const period = e.date.slice(0, 7)
    for (const l of e.lines) {
        const c = cents(l.debit) - cents(l.credit)
        if (c === 0) continue
        if (!movements.has(l.accountId)) movements.set(l.accountId, new Map())
        const m = movements.get(l.accountId)
        m.set(period, (m.get(period) ?? 0) + c)
        balance.set(l.accountId, (balance.get(l.accountId) ?? 0) + c)
    }
}

// ─────────────────────────────────────────────────────────────
// Cobertura: toda cuenta con actividad tiene tratamiento
// ─────────────────────────────────────────────────────────────
const filas = []
for (const [accountId, byPeriod] of movements) {
    const a = byId.get(accountId)
    const mon = monetaryOf(a)
    const esCapital = a.kind === 'EQUITY' && a.statementGroup === 'CAPITAL' && a.code !== '3.1.02'
    const tratamiento = mon === 'MONETARY' ? 'MONETARIA_SIN_REEXPRESION'
        : esCapital ? 'CAPITAL_NOMINAL_LEGAL'
            : mon === 'NON_MONETARY' ? 'REEXPRESION_POR_ANTICUACION'
                : 'REQUIERE_DECISION'

    const hist = balance.get(accountId) ?? 0
    // El capital también se anticua para MEDIR el patrimonio en moneda de
    // cierre; lo que conserva su valor nominal es su exposición, no su medición.
    const anticua = tratamiento === 'REEXPRESION_POR_ANTICUACION' || tratamiento === 'CAPITAL_NOMINAL_LEGAL'
    let reexp = 0
    for (const [p, c] of byPeriod) {
        reexp += anticua ? Math.round(c * coef(p)) : c
    }
    filas.push({ code: a.code, name: a.name, kind: a.kind, mon, tratamiento, hist, reexp })
}
filas.sort((x, y) => (x.code < y.code ? -1 : 1))

const sinTratamiento = filas.filter(f => f.tratamiento === 'REQUIERE_DECISION')

// ─────────────────────────────────────────────────────────────
// A · RECPAM analítico
// ─────────────────────────────────────────────────────────────
const flujoMonetario = new Map()
for (const f of filas) {
    if (f.mon !== 'MONETARY') continue
    const a = accounts.find(x => x.code === f.code)
    for (const [p, c] of movements.get(a.id)) {
        flujoMonetario.set(p, (flujoMonetario.get(p) ?? 0) + c)
    }
}

let recpamAnalitico = 0
const evolucion = []
let posicion = 0
for (const p of PERIODS) {
    const flujo = flujoMonetario.get(p) ?? 0
    const contribucion = -Math.round(flujo * (coef(p) - 1))
    recpamAnalitico += contribucion
    evolucion.push({ p, flujo: flujo / 100, coef: coef(p), contribucion: contribucion / 100, posicion: (posicion + flujo) / 100 })
    posicion += flujo
}

// ─────────────────────────────────────────────────────────────
// B · RECPAM secuencial
// ─────────────────────────────────────────────────────────────
let activos = 0, pasivos = 0, aportes = 0, resultado = 0
for (const f of filas) {
    if (f.kind === 'ASSET') activos += f.reexp
    else if (f.kind === 'LIABILITY') pasivos += -f.reexp
    else if (f.kind === 'EQUITY') aportes += -f.reexp
    else resultado += -f.reexp
}
const pnFinal = activos - pasivos
const resultadoTotal = pnFinal - aportes
const recpamSecuencial = resultadoTotal - resultado

// ─────────────────────────────────────────────────────────────
console.log('── Cobertura ──')
console.log(`  Cuentas con actividad: ${filas.length}`)
console.log(`  Con tratamiento resuelto: ${filas.length - sinTratamiento.length}`)
console.log(`  Cobertura: ${(((filas.length - sinTratamiento.length) / filas.length) * 100).toFixed(2)} %`)
if (sinTratamiento.length > 0) {
    console.log('  Pendientes:')
    for (const f of sinTratamiento) console.log(`    ${f.code} ${f.name} (${f.mon})`)
}

console.log('\n── Posición monetaria ──')
for (const e of evolucion) {
    console.log(`  ${e.p}  flujo ${fmt(e.flujo).padStart(16)}  coef ${e.coef.toFixed(6)}  RECPAM ${fmt(e.contribucion).padStart(14)}`)
}
console.log(`  Posición monetaria neta al cierre: ${fmt(posicion / 100)}`)

console.log('\n── RECPAM ──')
console.log(`  Analítico   : ${fmt(recpamAnalitico / 100)}`)
console.log(`  Secuencial  : ${fmt(recpamSecuencial / 100)}`)
console.log(`  Diferencia  : ${fmt((recpamSecuencial - recpamAnalitico) / 100)}`)

console.log('\n── Resultado en moneda de cierre ──')
console.log(`  Resultado de las cuentas de resultado reexpresadas: ${fmt(resultado / 100)}`)
console.log(`  RECPAM                                           : ${fmt(recpamAnalitico / 100)}`)
console.log(`  Resultado del ejercicio en moneda de cierre       : ${fmt((resultado + recpamAnalitico) / 100)}`)
console.log(`  Patrimonio neto final reexpresado                 : ${fmt(pnFinal / 100)}`)
console.log(`  Aportes reexpresados                              : ${fmt(aportes / 100)}`)
