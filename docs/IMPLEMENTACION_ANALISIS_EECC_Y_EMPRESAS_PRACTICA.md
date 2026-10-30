# Análisis de Estados Contables y empresas de práctica

## Qué cambia para el usuario

- **Análisis de EECC** (`/analisis`, menú Contabilidad): reemplaza las tarjetas de
  indicadores del inicio. Organiza los índices como en la materia (liquidez,
  plazos y ciclo, estructura, rentabilidad, flujo de efectivo) más el análisis
  vertical y horizontal de ESP y ER. Cada índice muestra su resolución paso a
  paso (fórmula → reemplazo → lectura), de dónde sale cada dato, variantes de
  cátedra y el valor del ejercicio anterior.
- **Supuestos declarados**: IVA para homogeneizar plazos, % de ventas y compras
  a crédito, promedio o saldo de cierre, año de 365 o 360 días.
- **Modo práctica**: oculta los resultados; el alumno calcula y la app corrige
  (tolerancia ±1%).
- **Empresas de práctica** (`/empresas` y selector en el encabezado): cada
  empresa es una base IndexedDB propia. Se crean con o sin fines de lucro, vacías
  o con un caso de dos ejercicios (2024 cerrado, 2025 abierto).

## Motor de indicadores (`src/reporting/metrics/metrics.ts`)

| Índice | Fórmula | Antes |
|---|---|---|
| Plazo de bienes de cambio | BC prom. / CMV × 365 | igual |
| Plazo de cobranza | Créditos por ventas prom. / (Ventas × (1 + IVA) × % crédito) × 365 | siempre "sin datos" |
| Plazo de pago | Deudas comerciales prom. / (Compras × (1 + IVA) × % crédito) × 365 | siempre "sin datos" |
| Ciclo operativo / de efectivo | plazo BC + cobranza; − plazo de pago | siempre "sin datos" |
| Solvencia | PN / Pasivo (variante A / P) | A / P |
| Endeudamiento | Pasivo / PN (variantes P/A, PN/A, PC/PN, PNC/PN) | P / A |
| Rentabilidad del activo | (Resultado + intereses del pasivo) / Activo prom. | Resultado / Activo |
| Rentabilidad del PN, costo de la deuda, efecto palanca (RPN / RA) | — | sin palanca |
| Cobertura de intereses | (RAI + intereses) / intereses | usaba el neto financiero |
| EBITDA | RO + depreciaciones del anexo de bienes de uso | siempre "sin datos" |

- Compras: del puente del costo de ventas (o CMV + EF − EI).
- Intereses: cuentas con tag `analisis:costo-financiero` (en el plan base:
  4.6.02 y 4.6.04; las instalaciones existentes lo reciben por
  `repairInflationMetadata`).
- Promedios: saldos de cierre del ejercicio anterior; si no está cargado, la
  apertura del propio ejercicio (`StatementsBundle.openingNet`): saldos previos,
  asiento de apertura del cierre o asiento con concepto "apertura" del primer día.
- Ente sin fines de lucro: RA, RPN y palanca "no aplican"; se agrega
  autosuficiencia (recursos / gastos ordinarios).
- Análisis horizontal del ESP: ya no duplica activo y pasivo corriente.

## Entes sin fines de lucro

`Company.entityKind` llega al motor por `EngineContext`. El ER pasa a "Estado de
Recursos y Gastos" (recursos ordinarios, gastos generales de administración,
gastos específicos de sectores, superávit/déficit). El plan de cuentas `ESFL`
(`loadSeedDataIfNeeded('ESFL')`) reusa códigos y mappings del comercial con las
denominaciones propias (fondo social, superávits no asignados, cuotas sociales…).
Pendiente de verificar contra el Informe CENCyA N° 28 (no fue accesible desde el
entorno de desarrollo).

## Empresas de práctica (`src/storage/workspaces.ts`)

- Registro y empresa activa en localStorage (`contalivre.workspaces.*`); `db.ts`
  abre la base de la empresa activa. La principal conserva `EntrenadorContable`.
- Al cambiar de empresa, las claves de localStorage propias de la empresa se
  guardan en una foto y se restaura la de la otra; se recarga la app.
- El reseteo total vacía sólo la empresa abierta.
- `workspaceSetup.ts`: primera apertura → plan de cuentas según el tipo, identidad
  del ente (CUIT de fantasía) y caso de práctica opcional.

## Tests

`tests/accounting/analisis-estados.test.ts` (valores verificados a mano),
`tests/accounting/empresas-practica.test.ts`, `indicadores.test.ts` actualizado.
