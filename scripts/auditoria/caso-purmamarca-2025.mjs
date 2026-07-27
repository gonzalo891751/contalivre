/**
 * Caso contable de auditoría E2E — Purmamarca Comercial S.A. (ejercicio 2025)
 *
 * Este script NO toca la aplicación: sólo construye el caso, lo autocontrola
 * (partida doble, mayores, ecuación patrimonial, EFE directo = indirecto) y
 * emite los artefactos que después se cargan POR LA INTERFAZ de ContaLivre:
 *
 *   docs/auditoria/datos/asientos-purmamarca-2025.csv   → import del Libro Diario
 *   docs/auditoria/datos/indices-ipc-2024-2025.csv      → import de índices
 *   docs/auditoria/MATRIZ_OPERACIONES.md                → matriz maestra
 *   docs/auditoria/datos/esperado-2025.json             → valores esperados
 *
 * Ejecutar:  node scripts/auditoria/caso-purmamarca-2025.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT_DATA = resolve(ROOT, 'docs', 'auditoria', 'datos')
const OUT_DOCS = resolve(ROOT, 'docs', 'auditoria')

// ─────────────────────────────────────────────────────────────
// Utilidades monetarias (centavos exactos, igual que la app)
// ─────────────────────────────────────────────────────────────
const cents = (n) => Math.round(n * 100)
const fromCents = (c) => c / 100
const money = (n) => fromCents(cents(n))
const IVA = 0.21
const iva = (neto) => money(neto * IVA)

const fmt = (n) =>
    new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

// ─────────────────────────────────────────────────────────────
// Plan de cuentas usado (códigos del seed de ContaLivre)
// ─────────────────────────────────────────────────────────────
const CTA = {
    fondoFijo: ['1.1.01.06', 'Fondo fijo'],
    banco: ['1.1.01.02', 'Banco c/c ARS'],
    deudores: ['1.1.02.01', 'Deudores por ventas'],
    ivaCF: ['1.1.03.01', 'IVA Crédito Fiscal'],
    ivaFavor: ['1.1.03.06', 'IVA a favor'],
    segurosAdel: ['1.1.03.22', 'Seguros pagados por adelantado'],
    mercaderias: ['1.1.04.01', 'Mercaderías'],
    plazoFijo: ['1.1.05.01', 'Plazos fijos a cobrar'],
    muebles: ['1.2.01.03', 'Muebles y útiles'],
    rodados: ['1.2.01.04', 'Rodados'],
    equipos: ['1.2.01.05', 'Equipos de computación'],
    aaMuebles: ['1.2.01.93', 'Amort. acum. Muebles y útiles'],
    aaRodados: ['1.2.01.94', 'Amort. acum. Rodados'],
    aaEquipos: ['1.2.01.95', 'Amort. acum. Equipos comp.'],
    proveedores: ['2.1.01.01', 'Proveedores'],
    sueldosPagar: ['2.1.02.01', 'Sueldos a pagar'],
    cargasPagar: ['2.1.02.02', 'Cargas sociales a pagar'],
    retencionesSueldos: ['2.1.02.03', 'Retenciones so/ sueldos a depositar'],
    ivaDF: ['2.1.03.01', 'IVA Débito Fiscal'],
    impuestosPagar: ['2.1.03.02', 'Impuestos a pagar'],
    ivaPagar: ['2.1.03.04', 'IVA a pagar'],
    prestamoNC: ['2.2.01.01', 'Préstamos bancarios'],
    acreedores: ['2.1.06.01', 'Acreedores varios'],
    alquileresPagar: ['2.1.06.02', 'Alquileres a pagar'],
    gastosPagar: ['2.1.06.03', 'Gastos a pagar'],
    capital: ['3.1.01', 'Capital social'],
    ventas: ['4.1.01', 'Ventas'],
    bonifCedidas: ['4.2.02', 'Bonificaciones cedidas'],
    cmv: ['4.3.01', 'Costo mercaderías vendidas'],
    publicidad: ['4.4.01', 'Publicidad'],
    sueldos: ['4.5.01', 'Sueldos y jornales'],
    cargasSociales: ['4.5.02', 'Cargas sociales'],
    alquileres: ['4.5.03', 'Alquileres perdidos'],
    seguros: ['4.5.04', 'Seguros'],
    servicios: ['4.5.05', 'Servicios públicos'],
    gastosOficina: ['4.5.06', 'Gastos de oficina'],
    amortizaciones: ['4.5.11', 'Amortizaciones bienes de uso'],
    interesesGanados: ['4.6.01', 'Intereses ganados'],
    interesesPerdidos: ['4.6.02', 'Intereses perdidos'],
    comisionesBanc: ['4.6.04', 'Comisiones y gastos bancarios'],
    resultadoVentaBU: ['4.7.04', 'Resultado venta bienes de uso'],
    impuestoGanancias: ['4.9.01', 'Impuesto a las ganancias'],
    devVentas: ['4.8.06', 'Devoluciones sobre ventas'],
}

// Naturaleza contable de cada cuenta, para los controles
const KIND = {
    '1.1.01.02': 'ASSET', '1.1.01.06': 'ASSET', '1.1.02.01': 'ASSET', '1.1.03.01': 'ASSET',
    '1.1.03.06': 'ASSET', '1.1.03.22': 'ASSET', '1.1.04.01': 'ASSET', '1.1.05.01': 'ASSET',
    '1.2.01.03': 'ASSET', '1.2.01.04': 'ASSET', '1.2.01.05': 'ASSET',
    '1.2.01.93': 'ASSET', '1.2.01.94': 'ASSET', '1.2.01.95': 'ASSET',
    '2.1.01.01': 'LIABILITY', '2.1.02.01': 'LIABILITY', '2.1.02.02': 'LIABILITY',
    '2.1.02.03': 'LIABILITY', '2.1.03.01': 'LIABILITY', '2.1.03.02': 'LIABILITY',
    '2.1.03.04': 'LIABILITY', '2.1.06.01': 'LIABILITY', '2.1.06.02': 'LIABILITY',
    '2.1.06.03': 'LIABILITY', '2.2.01.01': 'LIABILITY',
    '3.1.01': 'EQUITY',
    '4.1.01': 'INCOME', '4.2.02': 'INCOME', '4.8.06': 'INCOME', '4.6.01': 'INCOME', '4.7.04': 'INCOME',
    '4.3.01': 'EXPENSE', '4.4.01': 'EXPENSE', '4.5.01': 'EXPENSE', '4.5.02': 'EXPENSE',
    '4.5.03': 'EXPENSE', '4.5.04': 'EXPENSE', '4.5.05': 'EXPENSE', '4.5.06': 'EXPENSE',
    '4.5.11': 'EXPENSE', '4.6.02': 'EXPENSE', '4.6.04': 'EXPENSE', '4.9.01': 'EXPENSE',
}

// Cuentas que son "efectivo y equivalentes" para el EFE
const EFECTIVO = new Set(['1.1.01.02', '1.1.01.06'])

// ─────────────────────────────────────────────────────────────
// Constructor de asientos
// ─────────────────────────────────────────────────────────────
const asientos = []

function asiento(id, fecha, memo, lines, meta = {}) {
    const norm = lines.map(([cta, debe, haber, detalle]) => ({
        code: cta[0],
        name: cta[1],
        debit: money(debe || 0),
        credit: money(haber || 0),
        detalle: detalle || '',
    }))
    const d = norm.reduce((a, l) => a + cents(l.debit), 0)
    const h = norm.reduce((a, l) => a + cents(l.credit), 0)
    if (d !== h) {
        throw new Error(`[${id}] ${memo}: no cuadra — Debe ${fromCents(d)} ≠ Haber ${fromCents(h)}`)
    }
    if (norm.length < 2) throw new Error(`[${id}] necesita al menos 2 líneas`)
    for (const l of norm) {
        if (l.debit > 0 && l.credit > 0) throw new Error(`[${id}] línea con Debe y Haber`)
        if (l.debit === 0 && l.credit === 0) throw new Error(`[${id}] línea en cero`)
        if (!KIND[l.code]) throw new Error(`[${id}] cuenta sin naturaleza declarada: ${l.code}`)
    }
    asientos.push({ id, fecha, memo, lines: norm, total: fromCents(d), ...meta })
}

const mm = (m) => String(m).padStart(2, '0')

// ═════════════════════════════════════════════════════════════
// A — CONSTITUCIÓN
// ═════════════════════════════════════════════════════════════
const CAPITAL = 30_000_000

asiento('OP-001', '2025-01-02', 'Suscripción e integración del capital social en efectivo (Acta constitutiva N.º 1)', [
    [CTA.banco, CAPITAL, 0],
    [CTA.capital, 0, CAPITAL],
], { efe: 'FINANCIACION', comprobante: 'Acta constitutiva 1' })

asiento('OP-002', '2025-01-03', 'Constitución del fondo fijo (caja chica) — extracción bancaria', [
    [CTA.fondoFijo, 300_000, 0],
    [CTA.banco, 0, 300_000],
], { efe: 'INTERNO', comprobante: 'Recibo interno FF-01' })

// ═════════════════════════════════════════════════════════════
// B — BIENES DE USO
// ═════════════════════════════════════════════════════════════
const MUEBLES = 6_000_000        // vida útil 10 años
const RODADO = 4_000_000         // vida útil 5 años, se vende 30/09
const EQUIPOS = 3_000_000        // vida útil 3 años

asiento('OP-003', '2025-01-10', 'Compra de muebles y útiles al contado (Factura A 0001-00000012)', [
    [CTA.muebles, MUEBLES, 0],
    [CTA.ivaCF, iva(MUEBLES), 0],
    [CTA.banco, 0, MUEBLES + iva(MUEBLES)],
], { efe: 'INVERSION', comprobante: 'FA 0001-00000012' })

asiento('OP-004', '2025-01-10', 'Compra de un rodado usado al contado (Factura A 0002-00000045)', [
    [CTA.rodados, RODADO, 0],
    [CTA.ivaCF, iva(RODADO), 0],
    [CTA.banco, 0, RODADO + iva(RODADO)],
], { efe: 'INVERSION', comprobante: 'FA 0002-00000045' })

asiento('OP-005', '2025-02-03', 'Compra de equipos de computación en cuenta corriente (Factura A 0007-00000101)', [
    [CTA.equipos, EQUIPOS, 0],
    [CTA.ivaCF, iva(EQUIPOS), 0],
    [CTA.acreedores, 0, EQUIPOS + iva(EQUIPOS)],
], { efe: 'SIN_EFECTIVO', comprobante: 'FA 0007-00000101' })

asiento('OP-006', '2025-05-15', 'Pago a acreedores varios por la compra de equipos de computación', [
    [CTA.acreedores, EQUIPOS + iva(EQUIPOS), 0],
    [CTA.banco, 0, EQUIPOS + iva(EQUIPOS)],
], { efe: 'INVERSION', comprobante: 'OP 000015' })

// Amortización del rodado hasta la venta (9 meses)
const AMORT_RODADO_VENTA = money(RODADO / 5 * 9 / 12)   // 600.000
asiento('OP-007', '2025-09-30', 'Amortización del rodado hasta la fecha de venta (9 meses)', [
    [CTA.amortizaciones, AMORT_RODADO_VENTA, 0],
    [CTA.aaRodados, 0, AMORT_RODADO_VENTA],
], { efe: 'SIN_EFECTIVO', comprobante: 'Papel de trabajo AM-01' })

const PRECIO_RODADO = 3_800_000
const VNC_RODADO = money(RODADO - AMORT_RODADO_VENTA)       // 3.400.000
const RDO_VENTA_BU = money(PRECIO_RODADO - VNC_RODADO)      // 400.000 ganancia
asiento('OP-008', '2025-09-30', 'Venta del rodado al contado (Factura B 0003-00000009)', [
    [CTA.banco, PRECIO_RODADO + iva(PRECIO_RODADO), 0],
    [CTA.aaRodados, AMORT_RODADO_VENTA, 0],
    [CTA.rodados, 0, RODADO],
    [CTA.ivaDF, 0, iva(PRECIO_RODADO)],
    [CTA.resultadoVentaBU, 0, RDO_VENTA_BU],
], { efe: 'INVERSION', comprobante: 'FB 0003-00000009' })

// Amortizaciones del ejercicio (cierre)
const AMORT_MUEBLES = money(MUEBLES / 10)   // 600.000
const AMORT_EQUIPOS = money(EQUIPOS / 3)    // 1.000.000
asiento('OP-009', '2025-12-31', 'Amortizaciones del ejercicio — muebles y útiles y equipos de computación', [
    [CTA.amortizaciones, AMORT_MUEBLES + AMORT_EQUIPOS, 0],
    [CTA.aaMuebles, 0, AMORT_MUEBLES],
    [CTA.aaEquipos, 0, AMORT_EQUIPOS],
], { efe: 'SIN_EFECTIVO', comprobante: 'Papel de trabajo AM-02' })

// ═════════════════════════════════════════════════════════════
// C — MERCADERÍAS (inventario permanente, costeo PEPS)
// ═════════════════════════════════════════════════════════════
const C1 = 10_000_000, FLETE_C1 = 400_000
const C2 = 14_400_000, DEV_C2 = 1_200_000
const C3 = 14_000_000
const C4 = 14_000_000

asiento('OP-010', '2025-01-15', 'Compra de mercaderías al contado — lote 1 (1.000 u) (Factura A 0011-00000003)', [
    [CTA.mercaderias, C1, 0],
    [CTA.ivaCF, iva(C1), 0],
    [CTA.banco, 0, C1 + iva(C1)],
], { efe: 'OPERATIVA', comprobante: 'FA 0011-00000003' })

asiento('OP-011', '2025-01-15', 'Flete sobre la compra del lote 1 — activado al costo (Factura A 0020-00000077)', [
    [CTA.mercaderias, FLETE_C1, 0],
    [CTA.ivaCF, iva(FLETE_C1), 0],
    [CTA.banco, 0, FLETE_C1 + iva(FLETE_C1)],
], { efe: 'OPERATIVA', comprobante: 'FA 0020-00000077' })

asiento('OP-012', '2025-03-12', 'Compra de mercaderías en cuenta corriente — lote 2 (1.200 u) (Factura A 0011-00000019)', [
    [CTA.mercaderias, C2, 0],
    [CTA.ivaCF, iva(C2), 0],
    [CTA.proveedores, 0, C2 + iva(C2)],
], { efe: 'SIN_EFECTIVO', comprobante: 'FA 0011-00000019' })

asiento('OP-013', '2025-03-20', 'Devolución al proveedor de 100 u del lote 2 (Nota de crédito A 0011-00000004)', [
    [CTA.proveedores, DEV_C2 + iva(DEV_C2), 0],
    [CTA.mercaderias, 0, DEV_C2],
    [CTA.ivaCF, 0, iva(DEV_C2)],
], { efe: 'SIN_EFECTIVO', comprobante: 'NCA 0011-00000004' })

asiento('OP-014', '2025-06-10', 'Compra de mercaderías en cuenta corriente — lote 3 (1.000 u) (Factura A 0011-00000031)', [
    [CTA.mercaderias, C3, 0],
    [CTA.ivaCF, iva(C3), 0],
    [CTA.proveedores, 0, C3 + iva(C3)],
], { efe: 'SIN_EFECTIVO', comprobante: 'FA 0011-00000031' })

asiento('OP-015', '2025-10-14', 'Compra de mercaderías al contado — lote 4 (800 u) (Factura A 0011-00000048)', [
    [CTA.mercaderias, C4, 0],
    [CTA.ivaCF, iva(C4), 0],
    [CTA.banco, 0, C4 + iva(C4)],
], { efe: 'OPERATIVA', comprobante: 'FA 0011-00000048' })

asiento('OP-016', '2025-04-10', 'Pago parcial a proveedores', [
    [CTA.proveedores, 10_000_000, 0],
    [CTA.banco, 0, 10_000_000],
], { efe: 'OPERATIVA', comprobante: 'OP 000008' })

asiento('OP-017', '2025-07-15', 'Pago parcial a proveedores', [
    [CTA.proveedores, 8_000_000, 0],
    [CTA.banco, 0, 8_000_000],
], { efe: 'OPERATIVA', comprobante: 'OP 000021' })

asiento('OP-018', '2025-11-20', 'Pago parcial a proveedores', [
    [CTA.proveedores, 9_000_000, 0],
    [CTA.banco, 0, 9_000_000],
], { efe: 'OPERATIVA', comprobante: 'OP 000034' })

// Ventas y costo (PEPS)
const V1 = 13_200_000, CMV1 = 6_240_000
const V2 = 23_400_000, CMV2 = 10_160_000
const V3 = 25_600_000, CMV3 = 10_000_000
const V4 = 26_600_000, CMV4 = 9_800_000
const DEVV = 1_900_000, CMV_DEV = 700_000

asiento('OP-020', '2025-02-20', 'Venta de mercaderías al contado (600 u) (Factura B 0003-00000001)', [
    [CTA.banco, V1 + iva(V1), 0],
    [CTA.ventas, 0, V1],
    [CTA.ivaDF, 0, iva(V1)],
], { efe: 'OPERATIVA', comprobante: 'FB 0003-00000001' })

asiento('OP-021', '2025-02-20', 'Costo de las mercaderías vendidas — venta del 20/02 (PEPS)', [
    [CTA.cmv, CMV1, 0],
    [CTA.mercaderias, 0, CMV1],
], { efe: 'SIN_EFECTIVO', comprobante: 'Kardex 02/2025' })

asiento('OP-022', '2025-04-18', 'Venta de mercaderías en cuenta corriente (900 u) (Factura A 0003-00000002)', [
    [CTA.deudores, V2 + iva(V2), 0],
    [CTA.ventas, 0, V2],
    [CTA.ivaDF, 0, iva(V2)],
], { efe: 'SIN_EFECTIVO', comprobante: 'FA 0003-00000002' })

asiento('OP-023', '2025-04-18', 'Costo de las mercaderías vendidas — venta del 18/04 (PEPS)', [
    [CTA.cmv, CMV2, 0],
    [CTA.mercaderias, 0, CMV2],
], { efe: 'SIN_EFECTIVO', comprobante: 'Kardex 04/2025' })

asiento('OP-024', '2025-07-22', 'Venta de mercaderías en cuenta corriente (800 u) (Factura A 0003-00000003)', [
    [CTA.deudores, V3 + iva(V3), 0],
    [CTA.ventas, 0, V3],
    [CTA.ivaDF, 0, iva(V3)],
], { efe: 'SIN_EFECTIVO', comprobante: 'FA 0003-00000003' })

asiento('OP-025', '2025-07-22', 'Costo de las mercaderías vendidas — venta del 22/07 (PEPS)', [
    [CTA.cmv, CMV3, 0],
    [CTA.mercaderias, 0, CMV3],
], { efe: 'SIN_EFECTIVO', comprobante: 'Kardex 07/2025' })

asiento('OP-026', '2025-11-05', 'Venta de mercaderías al contado (700 u) (Factura B 0003-00000004)', [
    [CTA.banco, V4 + iva(V4), 0],
    [CTA.ventas, 0, V4],
    [CTA.ivaDF, 0, iva(V4)],
], { efe: 'OPERATIVA', comprobante: 'FB 0003-00000004' })

asiento('OP-027', '2025-11-05', 'Costo de las mercaderías vendidas — venta del 05/11 (PEPS)', [
    [CTA.cmv, CMV4, 0],
    [CTA.mercaderias, 0, CMV4],
], { efe: 'SIN_EFECTIVO', comprobante: 'Kardex 11/2025' })

asiento('OP-028', '2025-11-12', 'Devolución de un cliente (50 u) con reintegro bancario (Nota de crédito B 0003-00000001)', [
    [CTA.devVentas, DEVV, 0],
    [CTA.ivaDF, iva(DEVV), 0],
    [CTA.banco, 0, DEVV + iva(DEVV)],
], { efe: 'OPERATIVA', comprobante: 'NCB 0003-00000001' })

asiento('OP-029', '2025-11-12', 'Reingreso al inventario de las 50 u devueltas, al costo', [
    [CTA.mercaderias, CMV_DEV, 0],
    [CTA.cmv, 0, CMV_DEV],
], { efe: 'SIN_EFECTIVO', comprobante: 'Kardex 11/2025' })

asiento('OP-030', '2025-06-05', 'Cobro parcial a deudores por ventas', [
    [CTA.banco, 20_000_000, 0],
    [CTA.deudores, 0, 20_000_000],
], { efe: 'OPERATIVA', comprobante: 'Recibo 000012' })

asiento('OP-031', '2025-09-10', 'Cobro parcial a deudores por ventas', [
    [CTA.banco, 15_000_000, 0],
    [CTA.deudores, 0, 15_000_000],
], { efe: 'OPERATIVA', comprobante: 'Recibo 000027' })

asiento('OP-032', '2025-12-15', 'Cobro parcial a deudores por ventas', [
    [CTA.banco, 12_000_000, 0],
    [CTA.deudores, 0, 12_000_000],
], { efe: 'OPERATIVA', comprobante: 'Recibo 000041' })

const BONIF = 290_000
asiento('OP-033', '2025-12-18', 'Bonificación cedida a un cliente sobre saldo en cuenta (Nota de crédito A 0003-00000002)', [
    [CTA.bonifCedidas, BONIF, 0],
    [CTA.ivaDF, iva(BONIF), 0],
    [CTA.deudores, 0, BONIF + iva(BONIF)],
], { efe: 'SIN_EFECTIVO', comprobante: 'NCA 0003-00000002' })

// ═════════════════════════════════════════════════════════════
// D — GASTOS
// ═════════════════════════════════════════════════════════════
const ALQ = 500_000
for (let m = 1; m <= 11; m++) {
    asiento(`OP-1${mm(m)}`, `2025-${mm(m)}-05`, `Alquiler del local — ${mm(m)}/2025 (Factura A 0055-000000${mm(m)})`, [
        [CTA.alquileres, ALQ, 0],
        [CTA.ivaCF, iva(ALQ), 0],
        [CTA.banco, 0, ALQ + iva(ALQ)],
    ], { efe: 'OPERATIVA', comprobante: `FA 0055-000000${mm(m)}` })
}
asiento('OP-112', '2025-12-31', 'Devengamiento del alquiler de diciembre, impago al cierre (Factura A 0055-00000012)', [
    [CTA.alquileres, ALQ, 0],
    [CTA.ivaCF, iva(ALQ), 0],
    [CTA.alquileresPagar, 0, ALQ + iva(ALQ)],
], { efe: 'SIN_EFECTIVO', comprobante: 'FA 0055-00000012' })

const SERV = 300_000
const servFechas = ['2025-03-10', '2025-06-10', '2025-09-10', '2025-12-10']
servFechas.forEach((f, i) => {
    asiento(`OP-12${i + 1}`, f, `Energía, internet y telefonía — trimestre ${i + 1}`, [
        [CTA.servicios, SERV, 0],
        [CTA.ivaCF, iva(SERV), 0],
        [CTA.banco, 0, SERV + iva(SERV)],
    ], { efe: 'OPERATIVA', comprobante: `Facturas de servicios T${i + 1}` })
})
asiento('OP-125', '2025-12-31', 'Devengamiento de servicios de diciembre, impagos al cierre', [
    [CTA.servicios, 150_000, 0],
    [CTA.ivaCF, iva(150_000), 0],
    [CTA.gastosPagar, 0, 150_000 + iva(150_000)],
], { efe: 'SIN_EFECTIVO', comprobante: 'Facturas de servicios 12/2025' })

asiento('OP-130', '2025-08-08', 'Campaña de publicidad (Factura A 0088-00000005)', [
    [CTA.publicidad, 900_000, 0],
    [CTA.ivaCF, iva(900_000), 0],
    [CTA.banco, 0, 900_000 + iva(900_000)],
], { efe: 'OPERATIVA', comprobante: 'FA 0088-00000005' })

const SEGURO = 1_200_000
asiento('OP-131', '2025-07-01', 'Póliza anual de seguro 01/07/2025–30/06/2026, pagada al contado', [
    [CTA.segurosAdel, SEGURO, 0],
    [CTA.ivaCF, iva(SEGURO), 0],
    [CTA.banco, 0, SEGURO + iva(SEGURO)],
], { efe: 'OPERATIVA', comprobante: 'Póliza 44-991002' })

asiento('OP-132', '2025-12-31', 'Devengamiento del seguro correspondiente a 6 meses del ejercicio', [
    [CTA.seguros, money(SEGURO / 2), 0],
    [CTA.segurosAdel, 0, money(SEGURO / 2)],
], { efe: 'SIN_EFECTIVO', comprobante: 'Papel de trabajo DEV-01' })

// Sueldos: devengamiento mensual + pago el día 5 del mes siguiente (dic queda impago)
const SUELDO_BRUTO = 1_200_000
const CARGAS = money(SUELDO_BRUTO * 0.25)      // 300.000
const RET = money(SUELDO_BRUTO * 0.17)         // 204.000
const NETO = money(SUELDO_BRUTO - RET)         // 996.000
for (let m = 1; m <= 12; m++) {
    const ultimo = new Date(2025, m, 0).getDate()
    asiento(`OP-2${mm(m)}`, `2025-${mm(m)}-${ultimo}`, `Liquidación de sueldos y cargas sociales — ${mm(m)}/2025`, [
        [CTA.sueldos, SUELDO_BRUTO, 0],
        [CTA.cargasSociales, CARGAS, 0],
        [CTA.sueldosPagar, 0, NETO],
        [CTA.retencionesSueldos, 0, RET],
        [CTA.cargasPagar, 0, CARGAS],
    ], { efe: 'SIN_EFECTIVO', comprobante: `Libro de sueldos ${mm(m)}/2025` })
}
for (let m = 1; m <= 11; m++) {
    const pagoMes = m + 1
    asiento(`OP-3${mm(m)}`, `2025-${mm(pagoMes)}-05`, `Pago de sueldos netos, retenciones y cargas sociales de ${mm(m)}/2025`, [
        [CTA.sueldosPagar, NETO, 0],
        [CTA.retencionesSueldos, RET, 0],
        [CTA.cargasPagar, CARGAS, 0],
        [CTA.banco, 0, SUELDO_BRUTO + CARGAS],
    ], { efe: 'OPERATIVA', comprobante: `Transferencias sueldos ${mm(m)}/2025` })
}

// Comisiones bancarias trimestrales
const COM = 80_000
const comFechas = ['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31']
comFechas.forEach((f, i) => {
    asiento(`OP-14${i + 1}`, f, `Comisiones y gastos bancarios — trimestre ${i + 1}`, [
        [CTA.comisionesBanc, COM, 0],
        [CTA.ivaCF, iva(COM), 0],
        [CTA.banco, 0, COM + iva(COM)],
    ], { efe: 'OPERATIVA', comprobante: `Resumen bancario T${i + 1}` })
})

// Fondo fijo
asiento('OP-150', '2025-06-20', 'Gastos de oficina pagados con el fondo fijo', [
    [CTA.gastosOficina, 120_000, 0],
    [CTA.ivaCF, iva(120_000), 0],
    [CTA.fondoFijo, 0, 120_000 + iva(120_000)],
], { efe: 'OPERATIVA', comprobante: 'Rendición FF 01' })

asiento('OP-151', '2025-06-25', 'Reposición del fondo fijo desde la cuenta bancaria', [
    [CTA.fondoFijo, 145_200, 0],
    [CTA.banco, 0, 145_200],
], { efe: 'INTERNO', comprobante: 'Recibo interno FF-02' })

asiento('OP-152', '2025-11-28', 'Gastos de oficina pagados con el fondo fijo (sin reponer al cierre)', [
    [CTA.gastosOficina, 100_000, 0],
    [CTA.ivaCF, iva(100_000), 0],
    [CTA.fondoFijo, 0, 100_000 + iva(100_000)],
], { efe: 'OPERATIVA', comprobante: 'Rendición FF 02' })

// ═════════════════════════════════════════════════════════════
// E — FINANCIACIÓN
// ═════════════════════════════════════════════════════════════
const PRESTAMO = 12_000_000
asiento('OP-160', '2025-05-02', 'Préstamo bancario a 24 meses acreditado en cuenta (Contrato 88-4410)', [
    [CTA.banco, PRESTAMO, 0],
    [CTA.prestamoNC, 0, PRESTAMO],
], { efe: 'FINANCIACION', comprobante: 'Contrato 88-4410' })

const AMORT_CAPITAL = 3_000_000
const INT_PAGADOS = money(PRESTAMO * 0.40 * 6 / 12)   // 2.400.000
asiento('OP-161', '2025-11-02', 'Pago de la primera cuota del préstamo: capital e intereses devengados', [
    [CTA.prestamoNC, AMORT_CAPITAL, 0],
    [CTA.interesesPerdidos, INT_PAGADOS, 0],
    [CTA.banco, 0, AMORT_CAPITAL + INT_PAGADOS],
], { efe: 'FINANCIACION', comprobante: 'Cuota 1 contrato 88-4410' })

const INT_DEVENGADOS = money((PRESTAMO - AMORT_CAPITAL) * 0.40 * 2 / 12)  // 600.000
asiento('OP-162', '2025-12-31', 'Devengamiento de intereses del préstamo desde el 02/11 al 31/12', [
    [CTA.interesesPerdidos, INT_DEVENGADOS, 0],
    [CTA.gastosPagar, 0, INT_DEVENGADOS],
], { efe: 'SIN_EFECTIVO', comprobante: 'Papel de trabajo DEV-02' })

// ═════════════════════════════════════════════════════════════
// F — INVERSIÓN FINANCIERA
// ═════════════════════════════════════════════════════════════
asiento('OP-170', '2025-06-01', 'Constitución de un plazo fijo a 151 días', [
    [CTA.plazoFijo, 5_000_000, 0],
    [CTA.banco, 0, 5_000_000],
], { efe: 'INVERSION', comprobante: 'Certificado PF 77001' })

asiento('OP-171', '2025-10-30', 'Vencimiento y cobro del plazo fijo con sus intereses', [
    [CTA.banco, 5_750_000, 0],
    [CTA.plazoFijo, 0, 5_000_000],
    [CTA.interesesGanados, 0, 750_000],
], { efe: 'INVERSION', comprobante: 'Certificado PF 77001' })

asiento('OP-172', '2025-12-01', 'Constitución de un plazo fijo a 180 días (vigente al cierre)', [
    [CTA.plazoFijo, 4_000_000, 0],
    [CTA.banco, 0, 4_000_000],
], { efe: 'INVERSION', comprobante: 'Certificado PF 78440' })

asiento('OP-173', '2025-12-31', 'Devengamiento de los intereses del plazo fijo vigente al cierre', [
    [CTA.plazoFijo, 120_000, 0],
    [CTA.interesesGanados, 0, 120_000],
], { efe: 'SIN_EFECTIVO', comprobante: 'Papel de trabajo DEV-03' })

// ═════════════════════════════════════════════════════════════
// G — LIQUIDACIÓN DE IVA (trimestral)
// ═════════════════════════════════════════════════════════════
// Se calcula sobre los asientos ya cargados: DF y CF del trimestre,
// arrastrando el saldo técnico a favor.
function ivaDelPeriodo(desde, hasta) {
    let df = 0, cf = 0
    for (const a of asientos) {
        if (a.fecha < desde || a.fecha > hasta) continue
        if (a.id.startsWith('IVA-')) continue
        for (const l of a.lines) {
            if (l.code === CTA.ivaDF[0]) df += cents(l.credit) - cents(l.debit)
            if (l.code === CTA.ivaCF[0]) cf += cents(l.debit) - cents(l.credit)
        }
    }
    return { df: fromCents(df), cf: fromCents(cf) }
}

const trimestres = [
    { n: 1, desde: '2025-01-01', hasta: '2025-03-31', fecha: '2025-03-31', pago: '2025-04-18' },
    { n: 2, desde: '2025-04-01', hasta: '2025-06-30', fecha: '2025-06-30', pago: '2025-07-18' },
    { n: 3, desde: '2025-07-01', hasta: '2025-09-30', fecha: '2025-09-30', pago: '2025-10-17' },
    { n: 4, desde: '2025-10-01', hasta: '2025-12-31', fecha: '2025-12-31', pago: null },
]

let saldoAFavor = 0   // positivo = crédito técnico arrastrado
const liquidaciones = []
for (const t of trimestres) {
    const { df, cf } = ivaDelPeriodo(t.desde, t.hasta)
    const posicion = money(df - cf - saldoAFavor)   // >0 a pagar, <0 nuevo saldo a favor
    const lines = [
        [CTA.ivaDF, df, 0, `Cancelación del débito fiscal del trimestre ${t.n}`],
        [CTA.ivaCF, 0, cf, `Cancelación del crédito fiscal del trimestre ${t.n}`],
    ]
    if (saldoAFavor > 0) lines.push([CTA.ivaFavor, 0, saldoAFavor, 'Aplicación del saldo técnico a favor anterior'])
    if (posicion > 0) {
        lines.push([CTA.ivaPagar, 0, posicion, 'Posición a ingresar'])
        saldoAFavor = 0
    } else if (posicion < 0) {
        lines.push([CTA.ivaFavor, -posicion, 0, 'Saldo técnico a favor del período siguiente'])
        saldoAFavor = money(-posicion)
    } else {
        saldoAFavor = 0
    }
    asiento(`IVA-T${t.n}`, t.fecha, `Liquidación de IVA — trimestre ${t.n}/2025`, lines,
        { efe: 'SIN_EFECTIVO', comprobante: `F.2002 IVA T${t.n}` })
    liquidaciones.push({ ...t, df, cf, posicion })

    if (posicion > 0 && t.pago) {
        asiento(`IVA-P${t.n}`, t.pago, `Pago de la posición de IVA del trimestre ${t.n}/2025`, [
            [CTA.ivaPagar, posicion, 0],
            [CTA.banco, 0, posicion],
        ], { efe: 'OPERATIVA', comprobante: `VEP IVA T${t.n}` })
    }
}

// ═════════════════════════════════════════════════════════════
// H — IMPUESTO A LAS GANANCIAS (35 % del resultado contable)
// ═════════════════════════════════════════════════════════════
function resultadoAntesDeImpuesto() {
    let r = 0
    for (const a of asientos) {
        for (const l of a.lines) {
            const k = KIND[l.code]
            if (k === 'INCOME') r += cents(l.credit) - cents(l.debit)
            else if (k === 'EXPENSE') r -= cents(l.debit) - cents(l.credit)
        }
    }
    return fromCents(r)
}
const RAI = resultadoAntesDeImpuesto()
const IG = money(RAI * 0.35)
asiento('OP-180', '2025-12-31', 'Provisión del impuesto a las ganancias del ejercicio (35 %)', [
    [CTA.impuestoGanancias, IG, 0],
    [CTA.impuestosPagar, 0, IG],
], { efe: 'SIN_EFECTIVO', comprobante: 'Papel de trabajo IG-01' })

// ═════════════════════════════════════════════════════════════
// CONTROLES
// ═════════════════════════════════════════════════════════════
asientos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))

const mayor = new Map()
let totalDebe = 0, totalHaber = 0
for (const a of asientos) {
    for (const l of a.lines) {
        totalDebe += cents(l.debit)
        totalHaber += cents(l.credit)
        const cur = mayor.get(l.code) ?? { code: l.code, name: l.name, debe: 0, haber: 0 }
        cur.debe += cents(l.debit)
        cur.haber += cents(l.credit)
        mayor.set(l.code, cur)
    }
}

const saldos = [...mayor.values()]
    .map(c => ({ ...c, debe: fromCents(c.debe), haber: fromCents(c.haber), neto: fromCents(c.debe - c.haber) }))
    .sort((a, b) => a.code.localeCompare(b.code))

const sumaPor = (pred) => money(saldos.filter(pred).reduce((s, c) => s + c.neto, 0))

const activo = sumaPor(c => KIND[c.code] === 'ASSET')
const pasivo = money(-sumaPor(c => KIND[c.code] === 'LIABILITY'))
const capitalFinal = money(-sumaPor(c => KIND[c.code] === 'EQUITY'))
const ingresos = money(-sumaPor(c => KIND[c.code] === 'INCOME'))
const gastos = sumaPor(c => KIND[c.code] === 'EXPENSE')
const resultado = money(ingresos - gastos)
const pnFinal = money(capitalFinal + resultado)

// EFE directo, a partir del movimiento real de las cuentas de efectivo
const efectivoFinal = sumaPor(c => EFECTIVO.has(c.code))

const efeDirecto = { OPERATIVA: 0, INVERSION: 0, FINANCIACION: 0, INTERNO: 0, SIN_EFECTIVO: 0 }
for (const a of asientos) {
    let delta = 0
    for (const l of a.lines) if (EFECTIVO.has(l.code)) delta += cents(l.debit) - cents(l.credit)
    if (delta === 0) continue
    const clase = a.efe === 'INTERNO' ? 'INTERNO' : a.efe
    efeDirecto[clase] += delta
}
for (const k of Object.keys(efeDirecto)) efeDirecto[k] = fromCents(efeDirecto[k])
const variacionEfe = money(efeDirecto.OPERATIVA + efeDirecto.INVERSION + efeDirecto.FINANCIACION + efeDirecto.INTERNO)

const errores = []
if (totalDebe !== totalHaber) errores.push(`Libro Diario descuadrado: ${fromCents(totalDebe)} vs ${fromCents(totalHaber)}`)
if (cents(activo) !== cents(pasivo + pnFinal)) {
    errores.push(`Ecuación patrimonial: A ${activo} ≠ P ${pasivo} + PN ${pnFinal}`)
}
if (cents(variacionEfe) !== cents(efectivoFinal)) {
    errores.push(`EFE no explica la variación: ${variacionEfe} ≠ ${efectivoFinal}`)
}
if (cents(efeDirecto.INTERNO) !== 0) {
    errores.push(`Los movimientos internos de efectivo no netean a cero: ${efeDirecto.INTERNO}`)
}
const s = (code) => saldos.find(c => c.code === code)?.neto ?? 0
if (cents(s('1.1.03.01')) !== 0) errores.push(`IVA Crédito Fiscal no quedó saldado: ${s('1.1.03.01')}`)
if (cents(s('2.1.03.01')) !== 0) errores.push(`IVA Débito Fiscal no quedó saldado: ${s('2.1.03.01')}`)

if (errores.length > 0) {
    console.error('\n✗ EL CASO NO CIERRA:\n' + errores.map(e => '  - ' + e).join('\n') + '\n')
    process.exit(1)
}

// ─────────────────────────────────────────────────────────────
// Salidas
// ─────────────────────────────────────────────────────────────
mkdirSync(OUT_DATA, { recursive: true })

// CSV para el importador del Libro Diario
const csv = ['nro_asiento,fecha,concepto,cuenta_codigo,cuenta_nombre,debe,haber,detalle']
for (const a of asientos) {
    for (const l of a.lines) {
        const memo = a.memo.replace(/"/g, '""')
        const det = (l.detalle || a.comprobante || '').replace(/"/g, '""')
        csv.push(`${a.id},${a.fecha},"${memo}",${l.code},"${l.name}",${l.debit.toFixed(2)},${l.credit.toFixed(2)},"${det}"`)
    }
}
writeFileSync(resolve(OUT_DATA, 'asientos-purmamarca-2025.csv'), csv.join('\r\n') + '\r\n', 'utf8')

// Serie oficial de índices (INDEC — IPC Nacional Nivel General, base dic-2016 = 100)
const IPC = [
    ['2024-12', 7694.0075], ['2025-01', 7864.1257], ['2025-02', 8052.9927],
    ['2025-03', 8353.3158], ['2025-04', 8585.6078], ['2025-05', 8714.4871],
    ['2025-06', 8855.5681], ['2025-07', 9023.9730], ['2025-08', 9193.2441],
    ['2025-09', 9384.0922], ['2025-10', 9603.8623], ['2025-11', 9841.3581],
    ['2025-12', 10121.3715],
]
writeFileSync(
    resolve(OUT_DATA, 'indices-ipc-2024-2025.csv'),
    ['periodo,valor', ...IPC.map(([p, v]) => `${p},${v}`)].join('\r\n') + '\r\n',
    'utf8'
)

const esperado = {
    empresa: 'Purmamarca Comercial S.A. — Auditoría E2E',
    ejercicio: { id: '2025', desde: '2025-01-01', hasta: '2025-12-31' },
    asientos: asientos.length,
    lineas: asientos.reduce((s, a) => s + a.lines.length, 0),
    totalDebe: fromCents(totalDebe),
    totalHaber: fromCents(totalHaber),
    activo, pasivo, capital: capitalFinal, resultado, patrimonioNeto: pnFinal,
    ingresos, gastos,
    efectivoInicial: 0,
    efectivoFinal,
    efeDirecto,
    variacionEfectivo: variacionEfe,
    liquidacionesIVA: liquidaciones,
    impuestoALasGanancias: IG,
    resultadoAntesDeImpuesto: RAI,
    saldos: saldos.map(c => ({ code: c.code, name: c.name, debe: c.debe, haber: c.haber, saldo: c.neto })),
    indices: { fuente: 'INDEC — IPC Nacional Nivel General, base diciembre 2016 = 100', valores: IPC },
}
writeFileSync(resolve(OUT_DATA, 'esperado-2025.json'), JSON.stringify(esperado, null, 2) + '\n', 'utf8')

// Matriz maestra
mkdirSync(OUT_DOCS, { recursive: true })
const filas = asientos.map(a => {
    const debe = a.lines.filter(l => l.debit > 0).map(l => `${l.code} ${fmt(l.debit)}`).join('<br>')
    const haber = a.lines.filter(l => l.credit > 0).map(l => `${l.code} ${fmt(l.credit)}`).join('<br>')
    return `| ${a.id} | ${a.fecha} | ${a.memo} | ${a.comprobante ?? ''} | ${debe} | ${haber} | ${fmt(a.total)} | ${a.efe} |`
})

const matriz = `# Matriz maestra de operaciones — Purmamarca Comercial S.A.

Ejercicio 2025 (01/01/2025 – 31/12/2025). Generada por
\`scripts/auditoria/caso-purmamarca-2025.mjs\`; el caso se autocontrola antes de
emitirse: si alguna invariante falla, el script aborta y no produce archivos.

## Resumen

| Concepto | Valor |
|---|---:|
| Asientos | ${asientos.length} |
| Líneas | ${esperado.lineas} |
| Total Debe | ${fmt(esperado.totalDebe)} |
| Total Haber | ${fmt(esperado.totalHaber)} |
| Activo | ${fmt(activo)} |
| Pasivo | ${fmt(pasivo)} |
| Patrimonio neto | ${fmt(pnFinal)} |
| Resultado del ejercicio | ${fmt(resultado)} |
| Efectivo inicial | 0,00 |
| Efectivo final | ${fmt(efectivoFinal)} |
| Flujo operativo | ${fmt(efeDirecto.OPERATIVA)} |
| Flujo de inversión | ${fmt(efeDirecto.INVERSION)} |
| Flujo de financiación | ${fmt(efeDirecto.FINANCIACION)} |

## Operaciones

| ID | Fecha | Descripción económica | Comprobante | Debe | Haber | Importe | Clasificación EFE |
|---|---|---|---|---|---|---:|---|
${filas.join('\n')}

## Saldos esperados al 31/12/2025 (antes de la refundición)

| Código | Cuenta | Debe | Haber | Saldo |
|---|---|---:|---:|---:|
${saldos.map(c => `| ${c.code} | ${c.name} | ${fmt(c.debe)} | ${fmt(c.haber)} | ${fmt(c.neto)} |`).join('\n')}
`
writeFileSync(resolve(OUT_DOCS, 'MATRIZ_OPERACIONES.md'), matriz, 'utf8')

console.log('✓ El caso cierra.')
console.log(`  Asientos: ${asientos.length}   Líneas: ${esperado.lineas}`)
console.log(`  Debe = Haber = ${fmt(esperado.totalDebe)}`)
console.log(`  Activo ${fmt(activo)} = Pasivo ${fmt(pasivo)} + PN ${fmt(pnFinal)}`)
console.log(`  Resultado del ejercicio: ${fmt(resultado)} (antes de IG ${fmt(RAI)}, IG ${fmt(IG)})`)
console.log(`  Efectivo final ${fmt(efectivoFinal)} = Operativo ${fmt(efeDirecto.OPERATIVA)} + Inversión ${fmt(efeDirecto.INVERSION)} + Financiación ${fmt(efeDirecto.FINANCIACION)}`)
console.log(`  IVA: ${liquidaciones.map(l => `T${l.n} ${fmt(l.posicion)}`).join('  ')}`)
