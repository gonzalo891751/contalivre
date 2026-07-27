# Matriz maestra de operaciones — Purmamarca Comercial S.A.

Ejercicio 2025 (01/01/2025 – 31/12/2025). Generada por
`scripts/auditoria/caso-purmamarca-2025.mjs`; el caso se autocontrola antes de
emitirse: si alguna invariante falla, el script aborta y no produce archivos.

## Resumen

| Concepto | Valor |
|---|---:|
| Asientos | 95 |
| Líneas | 300 |
| Total Debe | 460.158.600,00 |
| Total Haber | 460.158.600,00 |
| Activo | 69.327.300,00 |
| Pasivo | 26.463.800,00 |
| Patrimonio neto | 42.863.500,00 |
| Resultado del ejercicio | 12.863.500,00 |
| Efectivo inicial | 0,00 |
| Efectivo final | 29.168.200,00 |
| Flujo operativo | 6.950.200,00 |
| Flujo de inversión | -14.382.000,00 |
| Flujo de financiación | 36.600.000,00 |

## Operaciones

| ID | Fecha | Descripción económica | Comprobante | Debe | Haber | Importe | Clasificación EFE |
|---|---|---|---|---|---|---:|---|
| OP-001 | 2025-01-02 | Suscripción e integración del capital social en efectivo (Acta constitutiva N.º 1) | Acta constitutiva 1 | 1.1.01.02 30.000.000,00 | 3.1.01 30.000.000,00 | 30.000.000,00 | FINANCIACION |
| OP-002 | 2025-01-03 | Constitución del fondo fijo (caja chica) — extracción bancaria | Recibo interno FF-01 | 1.1.01.06 300.000,00 | 1.1.01.02 300.000,00 | 300.000,00 | INTERNO |
| OP-101 | 2025-01-05 | Alquiler del local — 01/2025 (Factura A 0055-00000001) | FA 0055-00000001 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-003 | 2025-01-10 | Compra de muebles y útiles al contado (Factura A 0001-00000012) | FA 0001-00000012 | 1.2.01.03 6.000.000,00<br>1.1.03.01 1.260.000,00 | 1.1.01.02 7.260.000,00 | 7.260.000,00 | INVERSION |
| OP-004 | 2025-01-10 | Compra de un rodado usado al contado (Factura A 0002-00000045) | FA 0002-00000045 | 1.2.01.04 4.000.000,00<br>1.1.03.01 840.000,00 | 1.1.01.02 4.840.000,00 | 4.840.000,00 | INVERSION |
| OP-010 | 2025-01-15 | Compra de mercaderías al contado — lote 1 (1.000 u) (Factura A 0011-00000003) | FA 0011-00000003 | 1.1.04.01 10.000.000,00<br>1.1.03.01 2.100.000,00 | 1.1.01.02 12.100.000,00 | 12.100.000,00 | OPERATIVA |
| OP-011 | 2025-01-15 | Flete sobre la compra del lote 1 — activado al costo (Factura A 0020-00000077) | FA 0020-00000077 | 1.1.04.01 400.000,00<br>1.1.03.01 84.000,00 | 1.1.01.02 484.000,00 | 484.000,00 | OPERATIVA |
| OP-201 | 2025-01-31 | Liquidación de sueldos y cargas sociales — 01/2025 | Libro de sueldos 01/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-005 | 2025-02-03 | Compra de equipos de computación en cuenta corriente (Factura A 0007-00000101) | FA 0007-00000101 | 1.2.01.05 3.000.000,00<br>1.1.03.01 630.000,00 | 2.1.06.01 3.630.000,00 | 3.630.000,00 | SIN_EFECTIVO |
| OP-102 | 2025-02-05 | Alquiler del local — 02/2025 (Factura A 0055-00000002) | FA 0055-00000002 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-301 | 2025-02-05 | Pago de sueldos netos, retenciones y cargas sociales de 01/2025 | Transferencias sueldos 01/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-020 | 2025-02-20 | Venta de mercaderías al contado (600 u) (Factura B 0003-00000001) | FB 0003-00000001 | 1.1.01.02 15.972.000,00 | 4.1.01 13.200.000,00<br>2.1.03.01 2.772.000,00 | 15.972.000,00 | OPERATIVA |
| OP-021 | 2025-02-20 | Costo de las mercaderías vendidas — venta del 20/02 (PEPS) | Kardex 02/2025 | 4.3.01 6.240.000,00 | 1.1.04.01 6.240.000,00 | 6.240.000,00 | SIN_EFECTIVO |
| OP-202 | 2025-02-28 | Liquidación de sueldos y cargas sociales — 02/2025 | Libro de sueldos 02/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-103 | 2025-03-05 | Alquiler del local — 03/2025 (Factura A 0055-00000003) | FA 0055-00000003 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-302 | 2025-03-05 | Pago de sueldos netos, retenciones y cargas sociales de 02/2025 | Transferencias sueldos 02/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-121 | 2025-03-10 | Energía, internet y telefonía — trimestre 1 | Facturas de servicios T1 | 4.5.05 300.000,00<br>1.1.03.01 63.000,00 | 1.1.01.02 363.000,00 | 363.000,00 | OPERATIVA |
| OP-012 | 2025-03-12 | Compra de mercaderías en cuenta corriente — lote 2 (1.200 u) (Factura A 0011-00000019) | FA 0011-00000019 | 1.1.04.01 14.400.000,00<br>1.1.03.01 3.024.000,00 | 2.1.01.01 17.424.000,00 | 17.424.000,00 | SIN_EFECTIVO |
| OP-013 | 2025-03-20 | Devolución al proveedor de 100 u del lote 2 (Nota de crédito A 0011-00000004) | NCA 0011-00000004 | 2.1.01.01 1.452.000,00 | 1.1.04.01 1.200.000,00<br>1.1.03.01 252.000,00 | 1.452.000,00 | SIN_EFECTIVO |
| IVA-T1 | 2025-03-31 | Liquidación de IVA — trimestre 1/2025 | F.2002 IVA T1 | 2.1.03.01 2.772.000,00<br>1.1.03.06 5.308.800,00 | 1.1.03.01 8.080.800,00 | 8.080.800,00 | SIN_EFECTIVO |
| OP-141 | 2025-03-31 | Comisiones y gastos bancarios — trimestre 1 | Resumen bancario T1 | 4.6.04 80.000,00<br>1.1.03.01 16.800,00 | 1.1.01.02 96.800,00 | 96.800,00 | OPERATIVA |
| OP-203 | 2025-03-31 | Liquidación de sueldos y cargas sociales — 03/2025 | Libro de sueldos 03/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-104 | 2025-04-05 | Alquiler del local — 04/2025 (Factura A 0055-00000004) | FA 0055-00000004 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-303 | 2025-04-05 | Pago de sueldos netos, retenciones y cargas sociales de 03/2025 | Transferencias sueldos 03/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-016 | 2025-04-10 | Pago parcial a proveedores | OP 000008 | 2.1.01.01 10.000.000,00 | 1.1.01.02 10.000.000,00 | 10.000.000,00 | OPERATIVA |
| OP-022 | 2025-04-18 | Venta de mercaderías en cuenta corriente (900 u) (Factura A 0003-00000002) | FA 0003-00000002 | 1.1.02.01 28.314.000,00 | 4.1.01 23.400.000,00<br>2.1.03.01 4.914.000,00 | 28.314.000,00 | SIN_EFECTIVO |
| OP-023 | 2025-04-18 | Costo de las mercaderías vendidas — venta del 18/04 (PEPS) | Kardex 04/2025 | 4.3.01 10.160.000,00 | 1.1.04.01 10.160.000,00 | 10.160.000,00 | SIN_EFECTIVO |
| OP-204 | 2025-04-30 | Liquidación de sueldos y cargas sociales — 04/2025 | Libro de sueldos 04/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-160 | 2025-05-02 | Préstamo bancario a 24 meses acreditado en cuenta (Contrato 88-4410) | Contrato 88-4410 | 1.1.01.02 12.000.000,00 | 2.2.01.01 12.000.000,00 | 12.000.000,00 | FINANCIACION |
| OP-105 | 2025-05-05 | Alquiler del local — 05/2025 (Factura A 0055-00000005) | FA 0055-00000005 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-304 | 2025-05-05 | Pago de sueldos netos, retenciones y cargas sociales de 04/2025 | Transferencias sueldos 04/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-006 | 2025-05-15 | Pago a acreedores varios por la compra de equipos de computación | OP 000015 | 2.1.06.01 3.630.000,00 | 1.1.01.02 3.630.000,00 | 3.630.000,00 | INVERSION |
| OP-205 | 2025-05-31 | Liquidación de sueldos y cargas sociales — 05/2025 | Libro de sueldos 05/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-170 | 2025-06-01 | Constitución de un plazo fijo a 151 días | Certificado PF 77001 | 1.1.05.01 5.000.000,00 | 1.1.01.02 5.000.000,00 | 5.000.000,00 | INVERSION |
| OP-030 | 2025-06-05 | Cobro parcial a deudores por ventas | Recibo 000012 | 1.1.01.02 20.000.000,00 | 1.1.02.01 20.000.000,00 | 20.000.000,00 | OPERATIVA |
| OP-106 | 2025-06-05 | Alquiler del local — 06/2025 (Factura A 0055-00000006) | FA 0055-00000006 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-305 | 2025-06-05 | Pago de sueldos netos, retenciones y cargas sociales de 05/2025 | Transferencias sueldos 05/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-014 | 2025-06-10 | Compra de mercaderías en cuenta corriente — lote 3 (1.000 u) (Factura A 0011-00000031) | FA 0011-00000031 | 1.1.04.01 14.000.000,00<br>1.1.03.01 2.940.000,00 | 2.1.01.01 16.940.000,00 | 16.940.000,00 | SIN_EFECTIVO |
| OP-122 | 2025-06-10 | Energía, internet y telefonía — trimestre 2 | Facturas de servicios T2 | 4.5.05 300.000,00<br>1.1.03.01 63.000,00 | 1.1.01.02 363.000,00 | 363.000,00 | OPERATIVA |
| OP-150 | 2025-06-20 | Gastos de oficina pagados con el fondo fijo | Rendición FF 01 | 4.5.06 120.000,00<br>1.1.03.01 25.200,00 | 1.1.01.06 145.200,00 | 145.200,00 | OPERATIVA |
| OP-151 | 2025-06-25 | Reposición del fondo fijo desde la cuenta bancaria | Recibo interno FF-02 | 1.1.01.06 145.200,00 | 1.1.01.02 145.200,00 | 145.200,00 | INTERNO |
| IVA-T2 | 2025-06-30 | Liquidación de IVA — trimestre 2/2025 | F.2002 IVA T2 | 2.1.03.01 4.914.000,00<br>1.1.03.06 3.754.800,00 | 1.1.03.01 3.360.000,00<br>1.1.03.06 5.308.800,00 | 8.668.800,00 | SIN_EFECTIVO |
| OP-142 | 2025-06-30 | Comisiones y gastos bancarios — trimestre 2 | Resumen bancario T2 | 4.6.04 80.000,00<br>1.1.03.01 16.800,00 | 1.1.01.02 96.800,00 | 96.800,00 | OPERATIVA |
| OP-206 | 2025-06-30 | Liquidación de sueldos y cargas sociales — 06/2025 | Libro de sueldos 06/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-131 | 2025-07-01 | Póliza anual de seguro 01/07/2025–30/06/2026, pagada al contado | Póliza 44-991002 | 1.1.03.22 1.200.000,00<br>1.1.03.01 252.000,00 | 1.1.01.02 1.452.000,00 | 1.452.000,00 | OPERATIVA |
| OP-107 | 2025-07-05 | Alquiler del local — 07/2025 (Factura A 0055-00000007) | FA 0055-00000007 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-306 | 2025-07-05 | Pago de sueldos netos, retenciones y cargas sociales de 06/2025 | Transferencias sueldos 06/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-017 | 2025-07-15 | Pago parcial a proveedores | OP 000021 | 2.1.01.01 8.000.000,00 | 1.1.01.02 8.000.000,00 | 8.000.000,00 | OPERATIVA |
| OP-024 | 2025-07-22 | Venta de mercaderías en cuenta corriente (800 u) (Factura A 0003-00000003) | FA 0003-00000003 | 1.1.02.01 30.976.000,00 | 4.1.01 25.600.000,00<br>2.1.03.01 5.376.000,00 | 30.976.000,00 | SIN_EFECTIVO |
| OP-025 | 2025-07-22 | Costo de las mercaderías vendidas — venta del 22/07 (PEPS) | Kardex 07/2025 | 4.3.01 10.000.000,00 | 1.1.04.01 10.000.000,00 | 10.000.000,00 | SIN_EFECTIVO |
| OP-207 | 2025-07-31 | Liquidación de sueldos y cargas sociales — 07/2025 | Libro de sueldos 07/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-108 | 2025-08-05 | Alquiler del local — 08/2025 (Factura A 0055-00000008) | FA 0055-00000008 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-307 | 2025-08-05 | Pago de sueldos netos, retenciones y cargas sociales de 07/2025 | Transferencias sueldos 07/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-130 | 2025-08-08 | Campaña de publicidad (Factura A 0088-00000005) | FA 0088-00000005 | 4.4.01 900.000,00<br>1.1.03.01 189.000,00 | 1.1.01.02 1.089.000,00 | 1.089.000,00 | OPERATIVA |
| OP-208 | 2025-08-31 | Liquidación de sueldos y cargas sociales — 08/2025 | Libro de sueldos 08/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-109 | 2025-09-05 | Alquiler del local — 09/2025 (Factura A 0055-00000009) | FA 0055-00000009 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-308 | 2025-09-05 | Pago de sueldos netos, retenciones y cargas sociales de 08/2025 | Transferencias sueldos 08/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-031 | 2025-09-10 | Cobro parcial a deudores por ventas | Recibo 000027 | 1.1.01.02 15.000.000,00 | 1.1.02.01 15.000.000,00 | 15.000.000,00 | OPERATIVA |
| OP-123 | 2025-09-10 | Energía, internet y telefonía — trimestre 3 | Facturas de servicios T3 | 4.5.05 300.000,00<br>1.1.03.01 63.000,00 | 1.1.01.02 363.000,00 | 363.000,00 | OPERATIVA |
| IVA-T3 | 2025-09-30 | Liquidación de IVA — trimestre 3/2025 | F.2002 IVA T3 | 2.1.03.01 6.174.000,00 | 1.1.03.01 835.800,00<br>1.1.03.06 3.754.800,00<br>2.1.03.04 1.583.400,00 | 6.174.000,00 | SIN_EFECTIVO |
| OP-007 | 2025-09-30 | Amortización del rodado hasta la fecha de venta (9 meses) | Papel de trabajo AM-01 | 4.5.11 600.000,00 | 1.2.01.94 600.000,00 | 600.000,00 | SIN_EFECTIVO |
| OP-008 | 2025-09-30 | Venta del rodado al contado (Factura B 0003-00000009) | FB 0003-00000009 | 1.1.01.02 4.598.000,00<br>1.2.01.94 600.000,00 | 1.2.01.04 4.000.000,00<br>2.1.03.01 798.000,00<br>4.7.04 400.000,00 | 5.198.000,00 | INVERSION |
| OP-143 | 2025-09-30 | Comisiones y gastos bancarios — trimestre 3 | Resumen bancario T3 | 4.6.04 80.000,00<br>1.1.03.01 16.800,00 | 1.1.01.02 96.800,00 | 96.800,00 | OPERATIVA |
| OP-209 | 2025-09-30 | Liquidación de sueldos y cargas sociales — 09/2025 | Libro de sueldos 09/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-110 | 2025-10-05 | Alquiler del local — 10/2025 (Factura A 0055-00000010) | FA 0055-00000010 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-309 | 2025-10-05 | Pago de sueldos netos, retenciones y cargas sociales de 09/2025 | Transferencias sueldos 09/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-015 | 2025-10-14 | Compra de mercaderías al contado — lote 4 (800 u) (Factura A 0011-00000048) | FA 0011-00000048 | 1.1.04.01 14.000.000,00<br>1.1.03.01 2.940.000,00 | 1.1.01.02 16.940.000,00 | 16.940.000,00 | OPERATIVA |
| IVA-P3 | 2025-10-17 | Pago de la posición de IVA del trimestre 3/2025 | VEP IVA T3 | 2.1.03.04 1.583.400,00 | 1.1.01.02 1.583.400,00 | 1.583.400,00 | OPERATIVA |
| OP-171 | 2025-10-30 | Vencimiento y cobro del plazo fijo con sus intereses | Certificado PF 77001 | 1.1.01.02 5.750.000,00 | 1.1.05.01 5.000.000,00<br>4.6.01 750.000,00 | 5.750.000,00 | INVERSION |
| OP-210 | 2025-10-31 | Liquidación de sueldos y cargas sociales — 10/2025 | Libro de sueldos 10/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-161 | 2025-11-02 | Pago de la primera cuota del préstamo: capital e intereses devengados | Cuota 1 contrato 88-4410 | 2.2.01.01 3.000.000,00<br>4.6.02 2.400.000,00 | 1.1.01.02 5.400.000,00 | 5.400.000,00 | FINANCIACION |
| OP-026 | 2025-11-05 | Venta de mercaderías al contado (700 u) (Factura B 0003-00000004) | FB 0003-00000004 | 1.1.01.02 32.186.000,00 | 4.1.01 26.600.000,00<br>2.1.03.01 5.586.000,00 | 32.186.000,00 | OPERATIVA |
| OP-027 | 2025-11-05 | Costo de las mercaderías vendidas — venta del 05/11 (PEPS) | Kardex 11/2025 | 4.3.01 9.800.000,00 | 1.1.04.01 9.800.000,00 | 9.800.000,00 | SIN_EFECTIVO |
| OP-111 | 2025-11-05 | Alquiler del local — 11/2025 (Factura A 0055-00000011) | FA 0055-00000011 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 1.1.01.02 605.000,00 | 605.000,00 | OPERATIVA |
| OP-310 | 2025-11-05 | Pago de sueldos netos, retenciones y cargas sociales de 10/2025 | Transferencias sueldos 10/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-028 | 2025-11-12 | Devolución de un cliente (50 u) con reintegro bancario (Nota de crédito B 0003-00000001) | NCB 0003-00000001 | 4.8.06 1.900.000,00<br>2.1.03.01 399.000,00 | 1.1.01.02 2.299.000,00 | 2.299.000,00 | OPERATIVA |
| OP-029 | 2025-11-12 | Reingreso al inventario de las 50 u devueltas, al costo | Kardex 11/2025 | 1.1.04.01 700.000,00 | 4.3.01 700.000,00 | 700.000,00 | SIN_EFECTIVO |
| OP-018 | 2025-11-20 | Pago parcial a proveedores | OP 000034 | 2.1.01.01 9.000.000,00 | 1.1.01.02 9.000.000,00 | 9.000.000,00 | OPERATIVA |
| OP-152 | 2025-11-28 | Gastos de oficina pagados con el fondo fijo (sin reponer al cierre) | Rendición FF 02 | 4.5.06 100.000,00<br>1.1.03.01 21.000,00 | 1.1.01.06 121.000,00 | 121.000,00 | OPERATIVA |
| OP-211 | 2025-11-30 | Liquidación de sueldos y cargas sociales — 11/2025 | Libro de sueldos 11/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |
| OP-172 | 2025-12-01 | Constitución de un plazo fijo a 180 días (vigente al cierre) | Certificado PF 78440 | 1.1.05.01 4.000.000,00 | 1.1.01.02 4.000.000,00 | 4.000.000,00 | INVERSION |
| OP-311 | 2025-12-05 | Pago de sueldos netos, retenciones y cargas sociales de 11/2025 | Transferencias sueldos 11/2025 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.1.01.02 1.500.000,00 | 1.500.000,00 | OPERATIVA |
| OP-124 | 2025-12-10 | Energía, internet y telefonía — trimestre 4 | Facturas de servicios T4 | 4.5.05 300.000,00<br>1.1.03.01 63.000,00 | 1.1.01.02 363.000,00 | 363.000,00 | OPERATIVA |
| OP-032 | 2025-12-15 | Cobro parcial a deudores por ventas | Recibo 000041 | 1.1.01.02 12.000.000,00 | 1.1.02.01 12.000.000,00 | 12.000.000,00 | OPERATIVA |
| OP-033 | 2025-12-18 | Bonificación cedida a un cliente sobre saldo en cuenta (Nota de crédito A 0003-00000002) | NCA 0003-00000002 | 4.2.02 290.000,00<br>2.1.03.01 60.900,00 | 1.1.02.01 350.900,00 | 350.900,00 | SIN_EFECTIVO |
| IVA-T4 | 2025-12-31 | Liquidación de IVA — trimestre 4/2025 | F.2002 IVA T4 | 2.1.03.01 5.126.100,00 | 1.1.03.01 3.387.300,00<br>2.1.03.04 1.738.800,00 | 5.126.100,00 | SIN_EFECTIVO |
| OP-009 | 2025-12-31 | Amortizaciones del ejercicio — muebles y útiles y equipos de computación | Papel de trabajo AM-02 | 4.5.11 1.600.000,00 | 1.2.01.93 600.000,00<br>1.2.01.95 1.000.000,00 | 1.600.000,00 | SIN_EFECTIVO |
| OP-112 | 2025-12-31 | Devengamiento del alquiler de diciembre, impago al cierre (Factura A 0055-00000012) | FA 0055-00000012 | 4.5.03 500.000,00<br>1.1.03.01 105.000,00 | 2.1.06.02 605.000,00 | 605.000,00 | SIN_EFECTIVO |
| OP-125 | 2025-12-31 | Devengamiento de servicios de diciembre, impagos al cierre | Facturas de servicios 12/2025 | 4.5.05 150.000,00<br>1.1.03.01 31.500,00 | 2.1.06.03 181.500,00 | 181.500,00 | SIN_EFECTIVO |
| OP-132 | 2025-12-31 | Devengamiento del seguro correspondiente a 6 meses del ejercicio | Papel de trabajo DEV-01 | 4.5.04 600.000,00 | 1.1.03.22 600.000,00 | 600.000,00 | SIN_EFECTIVO |
| OP-144 | 2025-12-31 | Comisiones y gastos bancarios — trimestre 4 | Resumen bancario T4 | 4.6.04 80.000,00<br>1.1.03.01 16.800,00 | 1.1.01.02 96.800,00 | 96.800,00 | OPERATIVA |
| OP-162 | 2025-12-31 | Devengamiento de intereses del préstamo desde el 02/11 al 31/12 | Papel de trabajo DEV-02 | 4.6.02 600.000,00 | 2.1.06.03 600.000,00 | 600.000,00 | SIN_EFECTIVO |
| OP-173 | 2025-12-31 | Devengamiento de los intereses del plazo fijo vigente al cierre | Papel de trabajo DEV-03 | 1.1.05.01 120.000,00 | 4.6.01 120.000,00 | 120.000,00 | SIN_EFECTIVO |
| OP-180 | 2025-12-31 | Provisión del impuesto a las ganancias del ejercicio (35 %) | Papel de trabajo IG-01 | 4.9.01 6.926.500,00 | 2.1.03.02 6.926.500,00 | 6.926.500,00 | SIN_EFECTIVO |
| OP-212 | 2025-12-31 | Liquidación de sueldos y cargas sociales — 12/2025 | Libro de sueldos 12/2025 | 4.5.01 1.200.000,00<br>4.5.02 300.000,00 | 2.1.02.01 996.000,00<br>2.1.02.03 204.000,00<br>2.1.02.02 300.000,00 | 1.500.000,00 | SIN_EFECTIVO |

## Saldos esperados al 31/12/2025 (antes de la refundición)

| Código | Cuenta | Debe | Haber | Saldo |
|---|---|---:|---:|---:|
| 1.1.01.02 | Banco c/c ARS | 147.506.000,00 | 118.516.800,00 | 28.989.200,00 |
| 1.1.01.06 | Fondo fijo | 445.200,00 | 266.200,00 | 179.000,00 |
| 1.1.02.01 | Deudores por ventas | 59.290.000,00 | 47.350.900,00 | 11.939.100,00 |
| 1.1.03.01 | IVA Crédito Fiscal | 15.915.900,00 | 15.915.900,00 | 0,00 |
| 1.1.03.06 | IVA a favor | 9.063.600,00 | 9.063.600,00 | 0,00 |
| 1.1.03.22 | Seguros pagados por adelantado | 1.200.000,00 | 600.000,00 | 600.000,00 |
| 1.1.04.01 | Mercaderías | 53.500.000,00 | 37.400.000,00 | 16.100.000,00 |
| 1.1.05.01 | Plazos fijos a cobrar | 9.120.000,00 | 5.000.000,00 | 4.120.000,00 |
| 1.2.01.03 | Muebles y útiles | 6.000.000,00 | 0,00 | 6.000.000,00 |
| 1.2.01.04 | Rodados | 4.000.000,00 | 4.000.000,00 | 0,00 |
| 1.2.01.05 | Equipos de computación | 3.000.000,00 | 0,00 | 3.000.000,00 |
| 1.2.01.93 | Amort. acum. Muebles y útiles | 0,00 | 600.000,00 | -600.000,00 |
| 1.2.01.94 | Amort. acum. Rodados | 600.000,00 | 600.000,00 | 0,00 |
| 1.2.01.95 | Amort. acum. Equipos comp. | 0,00 | 1.000.000,00 | -1.000.000,00 |
| 2.1.01.01 | Proveedores | 28.452.000,00 | 34.364.000,00 | -5.912.000,00 |
| 2.1.02.01 | Sueldos a pagar | 10.956.000,00 | 11.952.000,00 | -996.000,00 |
| 2.1.02.02 | Cargas sociales a pagar | 3.300.000,00 | 3.600.000,00 | -300.000,00 |
| 2.1.02.03 | Retenciones so/ sueldos a depositar | 2.244.000,00 | 2.448.000,00 | -204.000,00 |
| 2.1.03.01 | IVA Débito Fiscal | 19.446.000,00 | 19.446.000,00 | 0,00 |
| 2.1.03.02 | Impuestos a pagar | 0,00 | 6.926.500,00 | -6.926.500,00 |
| 2.1.03.04 | IVA a pagar | 1.583.400,00 | 3.322.200,00 | -1.738.800,00 |
| 2.1.06.01 | Acreedores varios | 3.630.000,00 | 3.630.000,00 | 0,00 |
| 2.1.06.02 | Alquileres a pagar | 0,00 | 605.000,00 | -605.000,00 |
| 2.1.06.03 | Gastos a pagar | 0,00 | 781.500,00 | -781.500,00 |
| 2.2.01.01 | Préstamos bancarios | 3.000.000,00 | 12.000.000,00 | -9.000.000,00 |
| 3.1.01 | Capital social | 0,00 | 30.000.000,00 | -30.000.000,00 |
| 4.1.01 | Ventas | 0,00 | 88.800.000,00 | -88.800.000,00 |
| 4.2.02 | Bonificaciones cedidas | 290.000,00 | 0,00 | 290.000,00 |
| 4.3.01 | Costo mercaderías vendidas | 36.200.000,00 | 700.000,00 | 35.500.000,00 |
| 4.4.01 | Publicidad | 900.000,00 | 0,00 | 900.000,00 |
| 4.5.01 | Sueldos y jornales | 14.400.000,00 | 0,00 | 14.400.000,00 |
| 4.5.02 | Cargas sociales | 3.600.000,00 | 0,00 | 3.600.000,00 |
| 4.5.03 | Alquileres perdidos | 6.000.000,00 | 0,00 | 6.000.000,00 |
| 4.5.04 | Seguros | 600.000,00 | 0,00 | 600.000,00 |
| 4.5.05 | Servicios públicos | 1.350.000,00 | 0,00 | 1.350.000,00 |
| 4.5.06 | Gastos de oficina | 220.000,00 | 0,00 | 220.000,00 |
| 4.5.11 | Amortizaciones bienes de uso | 2.200.000,00 | 0,00 | 2.200.000,00 |
| 4.6.01 | Intereses ganados | 0,00 | 870.000,00 | -870.000,00 |
| 4.6.02 | Intereses perdidos | 3.000.000,00 | 0,00 | 3.000.000,00 |
| 4.6.04 | Comisiones y gastos bancarios | 320.000,00 | 0,00 | 320.000,00 |
| 4.7.04 | Resultado venta bienes de uso | 0,00 | 400.000,00 | -400.000,00 |
| 4.8.06 | Devoluciones sobre ventas | 1.900.000,00 | 0,00 | 1.900.000,00 |
| 4.9.01 | Impuesto a las ganancias | 6.926.500,00 | 0,00 | 6.926.500,00 |
