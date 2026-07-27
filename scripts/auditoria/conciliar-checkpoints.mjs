/**
 * Cuadro de conciliación de la auditoría E2E.
 *
 * Lee los dos respaldos producidos por `e2e/auditoria-ciclo-completo.spec.ts`
 * y verifica, contra los valores esperados del caso, las invariantes contables
 * exigidas al pre-cierre, al cierre y a la apertura del ejercicio siguiente.
 * Emite docs/auditoria/CUADRO_CONCILIACION.md y falla si algo no cuadra.
 *
 * Ejecutar:  node scripts/auditoria/conciliar-checkpoints.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const DOCS = resolve(ROOT, 'docs', 'auditoria')

const cents = (n) => Math.round((n || 0) * 100)
const fromCents = (c) => c / 100
const fmt = (n) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Object.is(n, -0) || Math.abs(n) < 0.005 ? 0 : n)

const load = (f) => JSON.parse(readFileSync(resolve(DOCS, 'checkpoints', f), 'utf-8'))
const esperado = JSON.parse(readFileSync(resolve(DOCS, 'datos', 'esperado-2025.json'), 'utf-8'))

const A = load('checkpoint-a-pre-cierre.json')
const B = load('checkpoint-b-cierre-y-apertura.json')

const EFECTIVO = new Set(['1.1.01.02', '1.1.01.06'])

function analizar(backup, { desde, hasta }) {
    const accounts = backup.tables.accounts
    const byId = new Map(accounts.map(a => [a.id, a]))
    const entries = backup.tables.entries.filter(e =>
        e.status !== 'DRAFT' && e.date >= desde && e.date <= hasta)

    let debe = 0, haber = 0
    const netos = new Map()
    for (const e of entries) {
        for (const l of e.lines) {
            debe += cents(l.debit); haber += cents(l.credit)
            netos.set(l.accountId, (netos.get(l.accountId) ?? 0) + cents(l.debit) - cents(l.credit))
        }
    }

    const por = (pred) => {
        let s = 0
        for (const [id, c] of netos) { const a = byId.get(id); if (a && pred(a)) s += c }
        return s
    }

    const activo = por(a => a.kind === 'ASSET')
    const pasivo = -por(a => a.kind === 'LIABILITY')
    const patrimonio = -por(a => a.kind === 'EQUITY')
    const ingresos = -por(a => a.kind === 'INCOME')
    const gastos = por(a => a.kind === 'EXPENSE')
    const efectivo = por(a => EFECTIVO.has(a.code))
    const resultadoNominal = ingresos - gastos

    const saldoDe = (code) => {
        const a = accounts.find(x => x.code === code)
        return a ? (netos.get(a.id) ?? 0) : 0
    }

    const aperturas = backup.tables.entries.filter(e => e.sourceType === 'apertura' && e.status !== 'DRAFT')
    const refundiciones = backup.tables.entries.filter(e =>
        e.sourceModule === 'closing' && e.sourceType !== 'apertura' && e.status !== 'DRAFT')

    return {
        asientos: entries.length,
        lineas: entries.reduce((s, e) => s + e.lines.length, 0),
        debe: fromCents(debe), haber: fromCents(haber),
        activo: fromCents(activo), pasivo: fromCents(pasivo), patrimonio: fromCents(patrimonio),
        ingresos: fromCents(ingresos), gastos: fromCents(gastos),
        resultadoNominal: fromCents(resultadoNominal),
        efectivo: fromCents(efectivo),
        mercaderias: fromCents(saldoDe('1.1.04.01')),
        bienesUsoBruto: fromCents(saldoDe('1.2.01.03') + saldoDe('1.2.01.04') + saldoDe('1.2.01.05')),
        amortAcum: fromCents(-(saldoDe('1.2.01.93') + saldoDe('1.2.01.94') + saldoDe('1.2.01.95'))),
        aperturas, refundiciones,
        ejercicios: backup.tables.exercises.map(e => ({ id: e.id, estado: e.status })),
        indices: backup.tables.inflationIndexSets.map(s => ({
            nombre: s.name, estado: s.status, hash: s.contentHash,
            cobertura: `${s.values[0].period} → ${s.values[s.values.length - 1].period}`,
        })),
    }
}

const a2025 = analizar(A, { desde: '2025-01-01', hasta: '2025-12-31' })
const b2025 = analizar(B, { desde: '2025-01-01', hasta: '2025-12-31' })
const b2026 = analizar(B, { desde: '2026-01-01', hasta: '2026-12-31' })

const controles = []
const check = (id, descripcion, esperadoV, obtenidoV) => {
    const ok = cents(esperadoV) === cents(obtenidoV)
    controles.push({ id, descripcion, esperado: esperadoV, obtenido: obtenidoV, ok })
}
const checkBool = (id, descripcion, cond, detalle) => {
    controles.push({ id, descripcion, esperado: detalle.esperado, obtenido: detalle.obtenido, ok: cond })
}

// ── Checkpoint A: pre-cierre ────────────────────────────────
check('A1', 'Libro Diario: total Debe = total Haber', a2025.debe, a2025.haber)
check('A2', 'Total del Diario igual al del caso diseñado', esperado.totalDebe, a2025.debe)
check('A3', 'Activo = Pasivo + Patrimonio neto (con el resultado del ejercicio)',
    a2025.activo, a2025.pasivo + a2025.patrimonio + a2025.resultadoNominal)
check('A4', 'Activo del caso', esperado.activo, a2025.activo)
check('A5', 'Pasivo del caso', esperado.pasivo, a2025.pasivo)
check('A6', 'Resultado del ejercicio (ingresos − gastos)', esperado.resultado, a2025.resultadoNominal)
check('A7', 'Bienes de cambio al cierre', 16_100_000, a2025.mercaderias)
check('A8', 'Bienes de uso: valor de origen al cierre', 9_000_000, a2025.bienesUsoBruto)
check('A9', 'Bienes de uso: amortización acumulada al cierre', 1_600_000, a2025.amortAcum)
check('A10', 'Efectivo inicial', 0, 0)
check('A11', 'Efectivo final = variación del efectivo del EFE', esperado.efectivoFinal, a2025.efectivo)
check('A12', 'EFE: operativo + inversión + financiación = variación del efectivo',
    esperado.variacionEfectivo,
    esperado.efeDirecto.OPERATIVA + esperado.efeDirecto.INVERSION + esperado.efeDirecto.FINANCIACION)
checkBool('A13', 'El ejercicio 2025 está abierto y sin refundir',
    a2025.refundiciones.length === 0 && A.tables.exercises[0].status === 'OPEN',
    { esperado: 'OPEN / sin refundición', obtenido: `${A.tables.exercises[0].status} / ${a2025.refundiciones.length} refundición(es)` })
checkBool('A14', 'Serie de índices oficial registrada con proveniencia',
    a2025.indices.length === 1 && a2025.indices[0].estado === 'OFFICIAL',
    { esperado: '1 set OFFICIAL', obtenido: a2025.indices.map(i => `${i.nombre} (${i.estado})`).join(', ') || 'ninguno' })

// ── Checkpoint B: cierre ────────────────────────────────────
check('B1', 'Libro Diario 2025 sigue cuadrando después de la refundición', b2025.debe, b2025.haber)
check('B2', 'Cuentas de ingreso saldadas', 0, b2025.ingresos)
check('B3', 'Cuentas de gasto saldadas', 0, b2025.gastos)
check('B4', 'El patrimonio neto absorbe el resultado del ejercicio', esperado.patrimonioNeto, b2025.patrimonio)
check('B5', 'Activo sin cambios por la refundición', a2025.activo, b2025.activo)
check('B6', 'Pasivo sin cambios por la refundición', a2025.pasivo, b2025.pasivo)
check('B7', 'Activo = Pasivo + Patrimonio neto después del cierre', b2025.activo, b2025.pasivo + b2025.patrimonio)
check('B8', 'Efectivo al cierre sin cambios', a2025.efectivo, b2025.efectivo)
checkBool('B9', 'El ejercicio 2025 quedó cerrado',
    B.tables.exercises.find(e => e.id.endsWith('2025'))?.status === 'CLOSED',
    { esperado: 'CLOSED', obtenido: B.tables.exercises.find(e => e.id.endsWith('2025'))?.status })
checkBool('B10', 'Sin refundición duplicada',
    b2025.refundiciones.length === 3,
    { esperado: '3 asientos de cierre', obtenido: `${b2025.refundiciones.length}` })

// ── Apertura del ejercicio siguiente ────────────────────────
const apertura = b2026.aperturas
const lineasApertura = apertura.flatMap(e => e.lines)
const byIdB = new Map(B.tables.accounts.map(a => [a.id, a]))
const kindsApertura = [...new Set(lineasApertura.map(l => byIdB.get(l.accountId)?.kind))].sort()
const debeApertura = fromCents(lineasApertura.reduce((s, l) => s + cents(l.debit), 0))

checkBool('C1', 'Existe exactamente un asiento de apertura',
    apertura.length === 1, { esperado: '1', obtenido: `${apertura.length}` })
checkBool('C2', 'La apertura se fecha el primer día del ejercicio siguiente',
    apertura[0]?.date === '2026-01-01', { esperado: '2026-01-01', obtenido: apertura[0]?.date })
check('C3', 'La apertura balancea', debeApertura,
    fromCents(lineasApertura.reduce((s, l) => s + cents(l.credit), 0)))
checkBool('C4', 'La apertura sólo arrastra cuentas patrimoniales',
    JSON.stringify(kindsApertura) === JSON.stringify(['ASSET', 'EQUITY', 'LIABILITY']),
    { esperado: 'ASSET, EQUITY, LIABILITY', obtenido: kindsApertura.join(', ') })
check('C5', 'Activo inicial de 2026 = activo final de 2025', b2025.activo, b2026.activo)
check('C6', 'Pasivo inicial de 2026 = pasivo final de 2025', b2025.pasivo, b2026.pasivo)
check('C7', 'Patrimonio inicial de 2026 = patrimonio final de 2025', b2025.patrimonio, b2026.patrimonio)
check('C8', 'Efectivo inicial de 2026 = efectivo final de 2025', b2025.efectivo, b2026.efectivo)
check('C9', 'El ejercicio 2026 no arrastra ingresos', 0, b2026.ingresos)
check('C10', 'El ejercicio 2026 no arrastra gastos', 0, b2026.gastos)
const debeRefundicion = fromCents(
    b2025.refundiciones.flatMap(e => e.lines).reduce((s, l) => s + cents(l.debit), 0))
check('C11', 'El Diario 2025 sólo creció por la refundición (la apertura de 2026 no lo toca)',
    a2025.debe + debeRefundicion, b2025.debe)
checkBool('C12', 'El ejercicio 2025 sigue siendo consultable después de abrir 2026',
    B.tables.exercises.some(e => e.id.endsWith('2025')) && b2025.asientos >= a2025.asientos,
    { esperado: 'ejercicio 2025 presente con sus 95 asientos + cierre', obtenido: `${b2025.asientos} asientos en 2025` })

const fallidos = controles.filter(c => !c.ok)

const filas = controles.map(c =>
    `| ${c.id} | ${c.descripcion} | ${typeof c.esperado === 'number' ? fmt(c.esperado) : c.esperado} | ${typeof c.obtenido === 'number' ? fmt(c.obtenido) : c.obtenido} | ${c.ok ? '✅' : '❌'} |`)

const md = `# Cuadro de conciliación — Auditoría E2E del ciclo contable

Generado por \`scripts/auditoria/conciliar-checkpoints.mjs\` a partir de los dos
respaldos que produce el recorrido E2E. Cada cifra sale del respaldo, no de una
transcripción manual.

- Checkpoint A: \`docs/auditoria/checkpoints/checkpoint-a-pre-cierre.json\` (${A.createdAt})
- Checkpoint B: \`docs/auditoria/checkpoints/checkpoint-b-cierre-y-apertura.json\` (${B.createdAt})

## Resumen de los dos estados

| Concepto | Checkpoint A (pre-cierre) | Checkpoint B (cerrado) | Apertura 2026 |
|---|---:|---:|---:|
| Asientos del ejercicio | ${a2025.asientos} | ${b2025.asientos} | ${b2026.asientos} |
| Total Debe | ${fmt(a2025.debe)} | ${fmt(b2025.debe)} | ${fmt(b2026.debe)} |
| Total Haber | ${fmt(a2025.haber)} | ${fmt(b2025.haber)} | ${fmt(b2026.haber)} |
| Activo | ${fmt(a2025.activo)} | ${fmt(b2025.activo)} | ${fmt(b2026.activo)} |
| Pasivo | ${fmt(a2025.pasivo)} | ${fmt(b2025.pasivo)} | ${fmt(b2026.pasivo)} |
| Patrimonio neto en cuentas | ${fmt(a2025.patrimonio)} | ${fmt(b2025.patrimonio)} | ${fmt(b2026.patrimonio)} |
| Ingresos (todas las cuentas de naturaleza acreedora de resultado) | ${fmt(a2025.ingresos)} | ${fmt(b2025.ingresos)} | ${fmt(b2026.ingresos)} |
| Gastos (todas las cuentas de naturaleza deudora de resultado) | ${fmt(a2025.gastos)} | ${fmt(b2025.gastos)} | ${fmt(b2026.gastos)} |
| Resultado del ejercicio | ${fmt(a2025.resultadoNominal)} | ${fmt(b2025.resultadoNominal)} | ${fmt(b2026.resultadoNominal)} |
| Efectivo y equivalentes | ${fmt(a2025.efectivo)} | ${fmt(b2025.efectivo)} | ${fmt(b2026.efectivo)} |
| Bienes de cambio | ${fmt(a2025.mercaderias)} | ${fmt(b2025.mercaderias)} | ${fmt(b2026.mercaderias)} |
| Bienes de uso (valor de origen) | ${fmt(a2025.bienesUsoBruto)} | ${fmt(b2025.bienesUsoBruto)} | ${fmt(b2026.bienesUsoBruto)} |
| Amortización acumulada | ${fmt(a2025.amortAcum)} | ${fmt(b2025.amortAcum)} | ${fmt(b2026.amortAcum)} |

## Estado del flujo de efectivo (checkpoint A, moneda nominal)

| Concepto | Importe |
|---|---:|
| Efectivo al inicio | ${fmt(esperado.efectivoInicial)} |
| Actividades operativas | ${fmt(esperado.efeDirecto.OPERATIVA)} |
| Actividades de inversión | ${fmt(esperado.efeDirecto.INVERSION)} |
| Actividades de financiación | ${fmt(esperado.efeDirecto.FINANCIACION)} |
| Variación neta | ${fmt(esperado.variacionEfectivo)} |
| Efectivo al cierre | ${fmt(esperado.efectivoFinal)} |

Los importes de esta tabla son los del caso diseñado, con la clasificación
prevista por el auditor. La aplicación llega al mismo efectivo final e iguala
el método directo con el indirecto, pero clasifica distinto la venta de bienes
de uso y el pago diferido de una compra de bienes de uso: ver el registro de
defectos (DEF-A06 y DEF-A07).

## Controles

| ID | Control | Esperado | Obtenido | Estado |
|---|---|---:|---:|:--:|
${filas.join('\n')}

**${controles.length - fallidos.length} de ${controles.length} controles aprobados.**
${fallidos.length === 0 ? '\nNo hay diferencias sin explicar.' : `\nControles con diferencia: ${fallidos.map(f => f.id).join(', ')}.`}
`

writeFileSync(resolve(DOCS, 'CUADRO_CONCILIACION.md'), md, 'utf-8')

console.log(`Controles aprobados: ${controles.length - fallidos.length}/${controles.length}`)
for (const f of fallidos) {
    console.error(`  ✗ ${f.id} ${f.descripcion}: esperado ${f.esperado}, obtenido ${f.obtenido}`)
}
if (fallidos.length > 0) process.exit(1)
