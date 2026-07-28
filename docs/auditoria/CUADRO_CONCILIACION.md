# Cuadro de conciliación — Auditoría E2E del ciclo contable

Generado por `scripts/auditoria/conciliar-checkpoints.mjs` a partir de los dos
respaldos que produce el recorrido E2E. Cada cifra sale del respaldo, no de una
transcripción manual.

- Checkpoint A: `docs/auditoria/checkpoints/checkpoint-a-pre-cierre.json` (2026-07-28T02:59:54.219Z)
- Checkpoint B: `docs/auditoria/checkpoints/checkpoint-b-cierre-y-apertura.json` (2026-07-28T03:00:05.483Z)

## Resumen de los dos estados

| Concepto | Checkpoint A (pre-cierre) | Checkpoint B (cerrado) | Apertura 2026 |
|---|---:|---:|---:|
| Asientos del ejercicio | 95 | 98 | 1 |
| Total Debe | 460.158.600,00 | 638.108.600,00 | 70.927.300,00 |
| Total Haber | 460.158.600,00 | 638.108.600,00 | 70.927.300,00 |
| Activo | 69.327.300,00 | 69.327.300,00 | 69.327.300,00 |
| Pasivo | 26.463.800,00 | 26.463.800,00 | 26.463.800,00 |
| Patrimonio neto en cuentas | 30.000.000,00 | 42.863.500,00 | 42.863.500,00 |
| Ingresos (todas las cuentas de naturaleza acreedora de resultado) | 87.880.000,00 | 0,00 | 0,00 |
| Gastos (todas las cuentas de naturaleza deudora de resultado) | 75.016.500,00 | 0,00 | 0,00 |
| Resultado del ejercicio | 12.863.500,00 | 0,00 | 0,00 |
| Efectivo y equivalentes | 29.168.200,00 | 29.168.200,00 | 29.168.200,00 |
| Bienes de cambio | 16.100.000,00 | 16.100.000,00 | 16.100.000,00 |
| Bienes de uso (valor de origen) | 9.000.000,00 | 9.000.000,00 | 9.000.000,00 |
| Amortización acumulada | 1.600.000,00 | 1.600.000,00 | 1.600.000,00 |

## Estado del flujo de efectivo (checkpoint A, moneda nominal)

| Concepto | Importe |
|---|---:|
| Efectivo al inicio | 0,00 |
| Actividades operativas | 6.950.200,00 |
| Actividades de inversión | -14.382.000,00 |
| Actividades de financiación | 36.600.000,00 |
| Variación neta | 29.168.200,00 |
| Efectivo al cierre | 29.168.200,00 |

Los importes de esta tabla son los del caso diseñado, con la clasificación
prevista por el auditor. La aplicación llega al mismo efectivo final e iguala
el método directo con el indirecto, pero clasifica distinto la venta de bienes
de uso y el pago diferido de una compra de bienes de uso: ver el registro de
defectos (DEF-A06 y DEF-A07).

## Moneda de cierre (Fase 2I)

| Concepto | Importe |
|---|---:|
| Resultado de las cuentas de resultado reexpresadas | 15.796.861,58 |
| RECPAM (analítico) | -4.432.331,92 |
| RECPAM (secuencial) | -4.432.331,94 |
| **Resultado del ejercicio en moneda de cierre** | **11.364.529,66** |
| Resultado del ejercicio en moneda nominal | 12.863.500,00 |
| Patrimonio neto final reexpresado | 49.975.451,77 |
| Aportes reexpresados | 38.610.922,13 |

## Controles

Los controles A, B y C son los del recorrido nominal de la auditoría E2E; los D
son los que agregó la Fase 2I sobre la expresión en moneda de cierre. Son un
plano distinto de las 24 invariantes contables del informe: cada invariante se
verifica en la aplicación, y estos controles la reverifican sobre los respaldos
con aritmética independiente.

| ID | Control | Esperado | Obtenido | Estado |
|---|---|---:|---:|:--:|
| A1 | Libro Diario: total Debe = total Haber | 460.158.600,00 | 460.158.600,00 | ✅ |
| A2 | Total del Diario igual al del caso diseñado | 460.158.600,00 | 460.158.600,00 | ✅ |
| A3 | Activo = Pasivo + Patrimonio neto (con el resultado del ejercicio) | 69.327.300,00 | 69.327.300,00 | ✅ |
| A4 | Activo del caso | 69.327.300,00 | 69.327.300,00 | ✅ |
| A5 | Pasivo del caso | 26.463.800,00 | 26.463.800,00 | ✅ |
| A6 | Resultado del ejercicio (ingresos − gastos) | 12.863.500,00 | 12.863.500,00 | ✅ |
| A7 | Bienes de cambio al cierre | 16.100.000,00 | 16.100.000,00 | ✅ |
| A8 | Bienes de uso: valor de origen al cierre | 9.000.000,00 | 9.000.000,00 | ✅ |
| A9 | Bienes de uso: amortización acumulada al cierre | 1.600.000,00 | 1.600.000,00 | ✅ |
| A10 | Efectivo inicial | 0,00 | 0,00 | ✅ |
| A11 | Efectivo final = variación del efectivo del EFE | 29.168.200,00 | 29.168.200,00 | ✅ |
| A12 | EFE: operativo + inversión + financiación = variación del efectivo | 29.168.200,00 | 29.168.200,00 | ✅ |
| A13 | El ejercicio 2025 está abierto y sin refundir | OPEN / sin refundición | OPEN / 0 refundición(es) | ✅ |
| A14 | Serie de índices oficial registrada con proveniencia | 1 set OFFICIAL | IPC Nacional Nivel General — dic-2024 a dic-2025 (OFFICIAL) | ✅ |
| B1 | Libro Diario 2025 sigue cuadrando después de la refundición | 638.108.600,00 | 638.108.600,00 | ✅ |
| B2 | Cuentas de ingreso saldadas | 0,00 | 0,00 | ✅ |
| B3 | Cuentas de gasto saldadas | 0,00 | 0,00 | ✅ |
| B4 | El patrimonio neto absorbe el resultado del ejercicio | 42.863.500,00 | 42.863.500,00 | ✅ |
| B5 | Activo sin cambios por la refundición | 69.327.300,00 | 69.327.300,00 | ✅ |
| B6 | Pasivo sin cambios por la refundición | 26.463.800,00 | 26.463.800,00 | ✅ |
| B7 | Activo = Pasivo + Patrimonio neto después del cierre | 69.327.300,00 | 69.327.300,00 | ✅ |
| B8 | Efectivo al cierre sin cambios | 29.168.200,00 | 29.168.200,00 | ✅ |
| B9 | El ejercicio 2025 quedó cerrado | CLOSED | CLOSED | ✅ |
| B10 | Sin refundición duplicada | 3 asientos de cierre | 3 | ✅ |
| C1 | Existe exactamente un asiento de apertura | 1 | 1 | ✅ |
| C2 | La apertura se fecha el primer día del ejercicio siguiente | 2026-01-01 | 2026-01-01 | ✅ |
| C3 | La apertura balancea | 70.927.300,00 | 70.927.300,00 | ✅ |
| C4 | La apertura sólo arrastra cuentas patrimoniales | ASSET, EQUITY, LIABILITY | ASSET, EQUITY, LIABILITY | ✅ |
| C5 | Activo inicial de 2026 = activo final de 2025 | 69.327.300,00 | 69.327.300,00 | ✅ |
| C6 | Pasivo inicial de 2026 = pasivo final de 2025 | 26.463.800,00 | 26.463.800,00 | ✅ |
| C7 | Patrimonio inicial de 2026 = patrimonio final de 2025 | 42.863.500,00 | 42.863.500,00 | ✅ |
| C8 | Efectivo inicial de 2026 = efectivo final de 2025 | 29.168.200,00 | 29.168.200,00 | ✅ |
| C9 | El ejercicio 2026 no arrastra ingresos | 0,00 | 0,00 | ✅ |
| C10 | El ejercicio 2026 no arrastra gastos | 0,00 | 0,00 | ✅ |
| C11 | El Diario 2025 sólo creció por la refundición (la apertura de 2026 no lo toca) | 638.108.600,00 | 638.108.600,00 | ✅ |
| C12 | El ejercicio 2025 sigue siendo consultable después de abrir 2026 | ejercicio 2025 presente con sus 95 asientos + cierre | 98 asientos en 2025 | ✅ |
| D1 | Todas las cuentas con movimiento tienen tratamiento declarado | 0 sin tratamiento | 0 | ✅ |
| D2 | Ninguna partida monetaria fue reexpresada | 0 reexpresadas | 0 | ✅ |
| D3 | RECPAM secuencial = RECPAM analítico (tolerancia $1) | 0,00 | 0,00 | ✅ |
| D4 | El RECPAM es una pérdida, coherente con posición monetaria activa | pérdida | -4.432.331,92 | ✅ |
| D5 | Resultado en moneda de cierre = resultado reexpresado + RECPAM | 11.364.529,66 | 11.364.529,66 | ✅ |
| D6 | La serie de índices conserva los decimales de la fuente | 7694,0075 y 10121,3715 | 7694.0075 y 10121.3715 | ✅ |
| D7 | El set de índices es oficial y con proveniencia | OFFICIAL con hash | OFFICIAL | ✅ |
| D8 | Las cuentas de bienes de uso tienen clase de anexo asignada | todas con clase | Muebles y útiles / Rodados / Equipos de computación | ✅ |
| D9 | La identidad de la empresa llega a la entidad contable | Purmamarca… | Purmamarca Comercial S.A. — Auditoría E2E | ✅ |

**45 de 45 controles aprobados.**

No hay diferencias sin explicar.
