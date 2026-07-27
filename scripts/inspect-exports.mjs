/**
 * Inspección real de los exportables — Fase 2H (§H11).
 *
 * No alcanza con que el archivo "se haya creado": este script ABRE los
 * artefactos y verifica su contenido.
 *
 *   XLSX → se abre con exceljs; lista hojas, encabezados y totales.
 *   PDF  → descomprime los streams y extrae el texto, para comprobar que el
 *          documento profesional lleva título, normativa y leyendas, y que NO
 *          lleva botones, filtros, papel de trabajo ni hashes técnicos.
 *
 * Uso (requiere haber corrido antes `npx playwright test exports`):
 *   node scripts/inspect-exports.mjs
 */
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'

const DIR = 'D:/Git/ContaLivre/docs/evidence/phase2f/exports'

// ── XLSX ────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(`${DIR}/planilla-completa.xlsx`)

console.log('=== XLSX: hojas ===')
for (const ws of wb.worksheets) {
    console.log(` - ${ws.name}  (${ws.rowCount} filas x ${ws.columnCount} col)`)
}

const show = (name, maxRows = 6) => {
    const ws = wb.getWorksheet(name)
    if (!ws) { console.log(`\n[${name}] NO EXISTE`); return }
    console.log(`\n=== ${name} ===`)
    for (let i = 1; i <= Math.min(maxRows, ws.rowCount); i++) {
        const vals = ws.getRow(i).values.slice(1).map(v => (v === null || v === undefined ? '' : String(v)))
        console.log('  ' + vals.join(' | '))
    }
    // última fila (totales)
    const last = ws.getRow(ws.rowCount).values.slice(1).map(v => (v ?? ''))
    console.log('  ...ultima: ' + last.join(' | '))
}

show('Gastos por función')
show('Gastos (preparación)')
show('Costo de ventas', 8)
show('Moneda extranjera')
show('Bienes de uso')

// ── PDF ─────────────────────────────────────────────────────
function pdfText(file) {
    const buf = readFileSync(file)
    let out = ''
    // streams FlateDecode
    const re = /stream\r?\n/g
    let m
    while ((m = re.exec(buf.toString('latin1'))) !== null) {
        const start = m.index + m[0].length
        const end = buf.toString('latin1').indexOf('endstream', start)
        if (end < 0) continue
        const chunk = buf.subarray(start, end)
        try { out += zlib.inflateSync(chunk).toString('latin1') } catch { out += chunk.toString('latin1') }
    }
    // texto entre paréntesis de los operadores Tj/TJ
    const texts = [...out.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)].map(x => x[1])
    return texts.join(' ').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))
}

for (const f of ['juego-completo.pdf', 'eepn-matriz.pdf', 'efe-directo.pdf']) {
    const t = pdfText(`${DIR}/${f}`)
    console.log(`\n=== PDF ${f} (${t.length} chars extraidos) ===`)
    console.log('  muestra: ' + t.slice(0, 400).replace(/\s+/g, ' '))
    const forbidden = [
        ['botones/filtros', /Exportar estados|Aplicar Rango|Gestionar m[oó]dulo/i],
        ['papel de trabajo', /Valor de la base|Papel de trabajo|Diferencia de control/i],
        ['hash tecnico', /[0-9a-f]{32,}/i],
    ]
    console.log(`  ${/Estado de/i.test(t) ? 'OK ' : 'REVISAR'} tiene titulo de estado`)
    console.log(`  ${/RT ?54/i.test(t) ? 'OK ' : 'REVISAR'} menciona RT 54`)
    // Pie de provenance clarificado (cierre del PR #28)
    console.log(`  ${/Motor contable/i.test(t) ? 'OK ' : 'REVISAR'} pie dice "Motor contable"`)
    console.log(`  ${/esquema v\d+/i.test(t) ? 'OK ' : 'REVISAR'} pie dice "esquema vNN"`)
    console.log(`  ${!/VALIDATED|schema v/i.test(t) ? 'OK ' : 'REVISAR'} pie sin ingles (VALIDATED/schema)`)
    console.log(`  ${!/reporte [0-9a-f]{6,}/i.test(t) ? 'OK ' : 'REVISAR'} pie sin id tecnico del reporte`)
    for (const [label, re] of forbidden) {
        const hit = t.match(re)
        console.log(`  ${hit ? 'REVISAR' : 'OK '} sin ${label}${hit ? ` -> "${hit[0].slice(0, 40)}"` : ''}`)
    }
}
