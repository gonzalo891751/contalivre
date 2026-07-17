# Implementación Fase 2B — Reporting, Inflación, EFE y Análisis

**ContaLivre — Modelo monetario definitivo, reversión uniforme, cierre contable, motor único de estados, ajuste por inflación, RECPAM, EFE y análisis económico-financiero**

| Dato | Valor |
|---|---|
| Fecha | 17 de julio de 2026 |
| Rama | `refactor/fase-2b-reporting-inflacion-efe` (desde `refactor/fase-2a-nucleo-contable`) |
| Commit base verificado | `c7b718c91427616c88d6e8847426c34c1a212c4d` (coincide con el esperado) |
| Node / npm | v25.9.0 / 11.12.1 |
| Antecedentes | `docs/AUDITORIA_INTEGRAL_CONTALIVRE_FASE_1.md`, `docs/IMPLEMENTACION_FASE_2A_NUCLEO_CONTABLE.md` |

---

## 22.1. Resumen ejecutivo

**Objetivo**: pasar de un Diario confiable (2A) a un sistema completo y coherente: cierre reproducible → estados consistentes desde un único motor → EFE conciliado → inflación con especificación correcta → análisis explicable.

**Cambios principales**:
1. **Gate de la 2A**: suite `phase2a.acceptance.test.ts` que reproduce end-to-end las 12 afirmaciones del informe anterior; pasó antes y después de esta fase.
2. **Modelo monetario definitivo** (ADR + schema v18): double con **integridad de centavos** — todo importe del Diario es la representación exacta de sus centavos enteros; aritmética contable en centavos; migración v18 que normaliza el histórico conservando el valor legacy y reportando excepciones.
3. **Reversión uniforme**: ningún POSTED muta su contenido económico. Editar una operación = reversión + asiento sustituto atómicos y enlazados; eliminarla = anulación por reversión (sin delete físico). Cambios solo descriptivos se actualizan in place auditados.
4. **Ciclo de cierre**: vista previa con bloqueantes, refundición de ingresos/gastos y transferencia a Resultados no asignados **en borrador** (modo educativo), contabilización idempotente, apertura patrimonial verificada (final N = inicial N+1, resultados no duplicados) y reapertura auditada que revierte todo.
5. **Motor único de reporting** (`src/reporting`, puro): TB normalizado con linaje → ESP/ER/EEPN/EFE + validación automática (`StatementValidationReport`). Clasificación 100 % estructural (sin heurísticas por nombre). Comparativos derivados del mismo motor.
6. **EFE directo e indirecto**: directo desde flujos reales línea por línea; indirecto derivado algebraicamente de componentes reales (resultado, ΔWC, devengadas sin efecto en efectivo); la igualdad se **verifica**, no se fuerza; transacciones no monetarias reveladas; pestaña habilitada en Estados.
7. **Inflación y RECPAM reconstruidos**: índices versionados con proveniencia y hash; anticuación real por mes de origen; RECPAM indirecto como **partida de conciliación** (especificación algebraica documentada, reemplaza al algoritmo que duplicaba exposiciones); RECPAM directo de control; conciliación exacta verificada; bloqueos por índice faltante y origen desconocido.
8. **Indicadores** con contrato `MetricResult` (nunca ∞/NaN/cero-sustituto), promedios o advertencia explícita, análisis vertical/horizontal, health score universal desactivado.
9. **Calidad**: lint **98 → 0 errores (exit 0)**, bundle inicial **3.470 → 1.873 KB (−46 %)**, motor con 100.000 líneas en 541 ms, excepción de seguridad de xlsx formalizada.

**Estado final**: 259/259 tests (163 → 259), tsc limpio, build OK, lint exit 0.

**Riesgos eliminados**: mutación económica de POSTED por módulos (ACC-002/011), RECPAM que duplicaba exposiciones (ACC-010), estados sin validación cruzada (ACC-005), EFE ausente (ACC-006), ∞ en indicadores (ANA-001), score engañoso (ANA-002), residuos de punto flotante en el Diario (ACC-004), falta de cierre/apertura formales (ACC-008).

**Riesgos pendientes**: ver 22.20 (pantalla legacy de cierre-valuación sin recablear al motor nuevo; ESP/ER/EEPN de la UI aún sobre presentadores legacy con validación cruzada del motor; adopción de claves explícitas de idempotencia módulo por módulo; xlsx con excepción temporal).

---

## 22.2. Verificación de la Fase 2A

Reproducida de forma independiente ANTES de implementar (gate `tests/accounting/phase2a.acceptance.test.ts`, 12/12 ✅; corre en cada `npm test`):

| Afirmación de Fase 2A | Verificada | Evidencia | Divergencia |
|---|---|---|---|
| `journalRepository.ts` único escritor de `entries` | ✅ | grep + test arquitectónico (gate #12) | Ninguna |
| Borradores no impactan libros | ✅ | gate #2 | Ninguna |
| POSTED inmutable (editar/borrar rechazado) | ✅ | gate #6 | Ninguna |
| Reversión enlazada, neto cero | ✅ | gate #7 | Ninguna |
| Ejercicios aislados (2025/2026) | ✅ | gate #9 | Ninguna |
| Idempotencia (repetir no duplica) | ✅ | gate #8 | Ninguna |
| Backup/restore conserva todos los registros | ✅ | gate #11 (restore en base vacía, registro a registro) | Ninguna |
| Bienes de Cambio no monetario | ✅ | gate #10 | Ninguna |
| Índice faltante bloquea | ✅ | gate #10 | Ninguna |
| Diario = Mayor = Balance | ✅ | gate #3 | Ninguna |
| Rechazos (cuenta inexistente/agrupadora/NaN/Infinity/período cerrado) | ✅ | gate #4–5 | Ninguna |
| Sin rutas alternativas al núcleo | ✅ | gate #12 + regla ESLint activa | Ninguna |

No se encontraron divergencias con el informe de la 2A.

## 22.3. Git y versiones

| Hito | Commit |
|---|---|
| 0 — Gate de aceptación 2A | `de8233c` |
| 1 — Modelo monetario (ADR + v18) | `8a374cf` |
| 2 — Reversión uniforme | `b250167` |
| 3 — Cierre/refundición/apertura | `eca7e55` |
| 4+6 — Motor de reporting + EFE | `8ea29dd` |
| 5 — Inflación y RECPAM | `c5f2ed6` |
| 7 — Indicadores y análisis | `7184cf9` |
| 8 — Notas/linaje/capacidades/seguridad/perf | `6a496d3` |
| 9 — Lint 98→0 | `b26402b` |
| Informe final (HEAD) | commit de este documento |

Schema: v17 → **v18**. App: 0.2.0 → **0.3.0**. Motor contable: **2B.1**. Norma declarada: RT 54 (TO RT 59), alcance educativo comercial/servicios (`versions.ts`). Sin merge automático a `Sesion1` ni a la rama 2A. Diff acumulado: 73 archivos, ~5.674 inserciones / 222 eliminaciones.

## 22.4. Modelo monetario

- **ADR**: `docs/ADR_MODELO_MONETARIO.md` — comparación de 5 estrategias (centavos persistidos, string decimal, BigInt, biblioteca decimal, double con integridad de centavos) contra IndexedDB, JSON/backup, límites, monedas, rendimiento, migración, PDF/XLSX y auditoría.
- **Estrategia elegida**: el valor canónico de todo importe contable es su **entero de centavos**; el `number` persistido es su representación exacta (conversión por desplazamiento decimal `toExponential`, determinista). `isCentExact` se verifica en la frontera de contabilización; `MAX_AMOUNT` = $90 billones; `-0`, NaN e infinitos rechazados.
- **Escalas** (`SCALES`): importe 2; cantidad 6; cotización/tasa 8; índice exacto según fuente. **Un solo redondeo** al producir el importe (`multiplyAmountByRate`); sumas y comparaciones en centavos (`addAmounts/subAmounts/sumMoney/moneyEquals`).
- **Migración v18** (`migrateV18.ts`): normaliza cada línea del Diario; conserva el original en `metadata.legacyAmounts`; >2 decimales reales, no finitos y fuera de rango van al **informe de excepciones** (`systemMeta.migrationExceptions`) con `needsReview` — sin redondeos silenciosos; idempotente por marcador propio (`moneyModelV18`, independiente de `schemaVersion` para la ruta v16→v18); transaccional (rollback Dexie); probada desde base v17 con floats sucios y re-ejecución.
- **Pruebas**: `money-model.v18.test.ts` (24 casos): aritmética exacta (0.1+0.2), un solo redondeo, `isCentExact` (residuo binario, −0), rango, frontera de contabilización, migración con legacy/excepciones/idempotencia. El motor de reporting y el EFE operan en centavos ⇒ sin diferencias de un centavo entre Diario/Mayor/estados/validación (verificado con igualdad estricta, no aproximada, en todos los tests del motor).

## 22.5. Reversión operativa

Regla implementada en el servicio único (todos los módulos la heredan al pasar por `replaceOperationEntry`/`voidOperationEntry`/`updateEntry`/`deleteEntry`):

| Módulo | Antes (2A) | Después (2B) | Reversión | Idempotencia | Test |
|---|---|---|---|---|---|
| Inventario/Bienes (bienes.ts) | Regeneración auditada in place | Reversión + sustituto / anulación por reversión | ✅ | clave `#vN` en sustitutos; anulación idempotente | `reversion-uniforme.test.ts` + suite bienes existente |
| Moneda extranjera (fx.ts) | Ídem | Ídem (vía voidOperationEntries/replace) | ✅ | ✅ | gate + suite fx flows |
| Clientes / Proveedores | Consultas sobre entries | Excluyen REVERSED; mutaciones vía servicio | ✅ | ✅ | `reversion-uniforme` (compat) |
| Gastos (ops.ts) | update/delete directo→servicio | Anulación por reversión en cascada; listados excluyen REVERSED | ✅ | ✅ | `deleteJournalEntryWithSync` test |
| Préstamos | createEntry (gate) | Igual + reversión al eliminar | ✅ | pendiente clave explícita | gate |
| Impuestos | updateEntry in place | Sustituto con nuevo id adoptado por el módulo | ✅ | por sourceId (findExistingEntry) | tsc + suites impuestos |
| Bienes de uso (fixedAssets) | updateEntry in place (5 flujos) | Sustituto adoptado (`acquisition/payment/opening/event/rt6 JournalEntryId`) | ✅ | por metadata | tsc + suites existentes |
| Inversiones | delete físico → void | Anulación por reversión + baja del movimiento | ✅ | ✅ | test familia inversiones e2e |
| Nómina/Deudas sociales | deleteEntry vía sync | Anulación por reversión con mensaje correcto | ✅ | ✅ | `journalSync` test |
| Conciliaciones / Cierres / Importadores | createEntry (gate) | Igual (creación); borradores eliminables | ✅ | n/a | gate |

Atomicidad: reversión + sustituto en **una** transacción (`inWriteTx(POSTING_TABLES)` con revalidación del estado dentro de la transacción); sin operación sin asiento ni reversión sin sustituto (verificado por tests). `replaceOperationEntry`/`voidOperationEntry` ya no son mutadores: son la implementación de la reversión uniforme; no existe ningún camino que altere fecha o líneas de un POSTED (el test del gate y `reversion-uniforme.test.ts` lo verifican conductualmente).

Parcial declarado: la **adopción de `postOperation` con clave explícita** en cada generador sigue siendo incremental — todos los generadores pasan por la puerta única validada y la reversión uniforme, pero varios aún crean asientos sin clave de idempotencia propia (auto-derivarla con riesgo de colisión habría podido fusionar asientos legítimos; se rechazó por seguridad de datos).

## 22.6. Cierre y apertura

- **Procedimiento** (`closingService.ts`): `previewClosing` (bloqueantes: borradores pendientes, Diario desbalanceado, cuentas inexistentes con saldo, falta de cuenta de resultado; advertencias de mapping; detalle de ingresos/gastos y resultado) → `generateClosingDrafts` (refundición ingresos, refundición gastos, transferencia a Resultados no asignados — **en borrador**, regenerables) → `postClosing` (contabiliza en orden estable, cierra ejercicio y períodos; **idempotente**) → `generateOpeningEntry` (solo cuentas patrimoniales, fecha de inicio de N+1, **idempotente**).
- **Invariantes probados** (`cierre-apertura.test.ts`, 10 tests): resultado exacto (300 en el caso base); ingresos/gastos en cero tras refundición; `resultados-no-asignados` recibe el resultado; ecuación patrimonial intacta; **patrimonio final N = inicial N+1**; resultados del ejercicio anterior no reaparecen como cuentas dinámicas; el ER del ejercicio cerrado sigue mostrando el período (exclusión ESTRUCTURAL de la refundición); con apertura formal el mecanismo de acumulación previa queda vacío (sin doble conteo, también en las consultas vivas de Estados e indicadores).
- **Reapertura**: motivo obligatorio; revierte apertura de N+1 + transferencia + refundiciones (orden inverso); reabre ejercicio y períodos; audit log con `invalidatesPublishedStatements`. Los estados con el motor se recalculan siempre desde el Diario ⇒ ninguna versión histórica se sobrescribe silenciosamente (no existe aún almacenamiento de estados publicados; ver deuda).
- **Modo educativo**: los tres asientos de cierre se pueden ver como borradores, entender y recién contabilizar; regenerables mientras sean borradores.

## 22.7. Motor de estados

- **Arquitectura**: `src/reporting/{domain,engine,metrics}` + `loadStatements.ts` (única puerta Dexie→motor) + `lineage.ts`. Núcleo puro sin React/Dexie/PDF.
- **Fuente canónica**: asientos POSTED/REVERSED del contexto + saldos de apertura explícitos (vacíos si hay apertura formal) + taxonomía de cuentas. Ninguna tabla operativa determina saldos contables.
- **Mappings**: exclusivamente estructurales (`kind`, `currentClassification`/`section`, `statementGroup`, `cashFlowCategory`, `isContra`); cuentas de resultado sin mapping van expuestas a "Otros" y **bloquean la publicación** (check `unmapped-results`); cuentas inexistentes aparecen como fila propia y bloquean (check `unknown-accounts`).
- **Estados**: ESP (AC/ANC/PC/PNC/PN, regularizadoras neteadas, resultado pendiente de refundición, ecuación validada), ER (ventas, costo, bruto, gastos por función, financieros incl. RECPAM, otros, neto — sin heurísticas de nombres), EEPN (apertura, aportes, distribuciones, reservas, otros, resultado, cierre; cierre EEPN = PN del ESP validado), EFE (22.9).
- **Comparativos**: derivados del ejercicio anterior con el mismo motor (`withComparative`), espejados línea a línea por id. Los comparativos importados manualmente (localStorage) quedan como legacy de la UI vieja, **no** ingresan al motor; deuda: marcarlos "externos" en pantalla.
- **Validación automática** (`StatementValidationReport`): Diario D=H; apertura balanceada; Mayor=Diario; A=P+PN; ER=EEPN; PN ESP=cierre EEPN; EFE variación=final−inicial; efectivo EFE=ESP; directo=indirecto; sin cuentas inexistentes ni sin mapping con saldo; sin flujos sin clasificar. `canPublish=false` si falla cualquiera.
- **UI**: pestaña EFE nueva consume el bundle y muestra el reporte de validación completo. **Parcial declarado**: las pestañas ESP/ER/EEPN siguen renderizando con los presentadores legacy (ahora alimentados por consultas aisladas y validados de forma cruzada por el motor); el recableado visual completo es deuda de 2C — el motor es la fuente canónica y el EFE/notas/indicadores/linaje ya solo salen de él.

## 22.8. Ajuste por inflación

- **Normativa**: base declarada RT 54 TO RT 59 (registrada en `versions.ts` y en la nota de bases); el set de índices registra fuente, URL, fecha de consulta/importación, actor, versión y estado. La verificación online de novedades FACPCE/CENCyA no se ejecutó desde la aplicación (entorno local); el registro exige que el usuario cargue la serie oficial con su proveniencia.
- **Índices** (`indexRegistry.ts`): sets versionados OFICIAL/MANUAL/EJEMPLO sin mezclas; hash de contenido anti-alteración; validación de períodos y valores; sin índice requerido ⇒ **no se calcula, no se contabiliza, no vale 1, no se interpola**.
- **Anticuación** (`anticuateMovements`): por cuenta y **mes real del asiento de origen**; los saldos de apertura sin anticuación ⇒ `insufficientOrigins` (información insuficiente que bloquea el cierre formal; jamás se asigna el inicio del ejercicio automáticamente).
- **Algoritmo** (`engine.ts`, especificación algebraica en el encabezado): reexpresión de partidas no monetarias, PN y resultados por coeficiente origen→cierre; comprobante propuesto en **DRAFT** balanceado (ajustes por cuenta + línea RECPAM), contabilizable solo por el servicio único.
- **RECPAM indirecto**: partida de **conciliación** — `RECPAM(ganancia+) = Σ nᵢ×(coefᵢ−1)`; la línea balanceante del comprobante es su opuesto. Sustituye al algoritmo legacy que sumaba posiciones monetarias de fin de mes (marcado `@deprecated`, hallazgo ACC-010).
- **RECPAM directo de control**: por exposición monetaria cronológica `−Σ mₚ×(coefₚ−1)`; con clasificación incompleta se declara **"No verificable por método directo"** con el detalle de lo que falta.
- **Conciliación**: exacta (diferencia en centavos = 0) y **verificada** — si no concilia, es un bloqueante explícito.
- **Golden cases** (`inflacion-motor.test.ts`, índices 100/160/200): capital 1.000.000→2.000.000; PPE 600.000→1.200.000; inventario de julio 200.000→250.000; venta de julio reexpresada; **RECPAM pérdida 375.000 con directo = indirecto**; comprobante balanceado con RECPAM al Debe; índice faltante (marzo) bloquea informando el período; origen desconocido bloquea; inflación cero ⇒ RECPAM 0; cuenta MIXED ⇒ directo no verificable. Total 14 tests.
- **Parcial declarado**: la pantalla legacy de Cierre/Valuación no fue recableada al motor nuevo; sigue **contenida** (solo borradores + advertencia normativa + bloqueo por índices). Capacidad declarada PARTIAL en `/acerca`.

## 22.9. EFE

- **Política de efectivo**: estructural — `statementGroup CASH_AND_BANKS` o `cashFlowCategory: 'CASH_EQUIVALENT'`; jamás por nombre. La misma política alimenta EFE, nota de efectivo e indicador de liquidez inmediata.
- **Clasificación**: override por cuenta (`cashFlowCategory`) y derivación estructural por statementGroup (WC operativo / inversión / financiación); cuentas sin categoría ⇒ renglón **"sin clasificar"** que mantiene los totales exactos y bloquea la publicación (nunca se reparte en silencio).
- **Método directo**: solo asientos que tocan efectivo; contribución exacta por línea de contrapartida (sin prorrateos); subcategorías estructurales (cobros de clientes, pagos a proveedores, personal, impuestos, otros).
- **Método indirecto**: `resultado − ΔWC_activos − ΔWC_pasivos + X`, con `X = −(mov. inversión+financiación de asientos sin efectivo)` — derivación algebraica de componentes reales, sin partida de ajuste inventada; inversión/financiación idénticas en ambos métodos.
- **Inflación**: el EFE se presenta en moneda nominal del ejercicio; la reexpresión de flujos a moneda de cierre queda declarada PARTIAL (depende de aplicar el ajuste al juego completo; el motor de coeficientes ya existe).
- **Conciliaciones (invariantes §11.6)**: variación = final − inicial ✅; efectivo EFE = ESP ✅; directo = indirecto ✅ (checks en cada bundle; golden: operativas −120.000, inversión 0, financiación 1.300.000, variación 1.180.000; PPE a crédito **revelada como no monetaria y excluida de flujos**; multiejercicio: EFE 2026 con apertura = variación 0).

## 22.10. Notas y anexos

- **Automáticas derivadas y reconciliadas** (`buildNotes.ts`): bases de preparación/normativa/moneda/contexto inflacionario/modo educativo; efectivo y equivalentes (reconcilia con EFE); créditos; bienes de cambio; bienes de uso; intangibles; deudas (**reconciliada exactamente contra el pasivo del ESP**); PN; anexo de gastos por función; determinación del CMV.
- **Manuales**: hechos posteriores, contingencias, partes relacionadas — declaradas `NOT_AVAILABLE` hasta que el usuario cargue contenido (no se inventan); la edición manual no pisa derivados (orígenes tipados por línea `DERIVED/MANUAL/NOT_AVAILABLE/NOT_APPLICABLE`).
- **Pendientes**: nota de moneda extranjera detallada y anexo de bienes de uso con cuadro de evolución (hoy saldo por cuenta); UI dedicada de notas del motor (la pestaña NA legacy sigue activa).

## 22.11. Indicadores

Contrato `MetricResult` (CALCULATED / NOT_CALCULABLE / NOT_APPLICABLE / INSUFFICIENT_INFORMATION) con fórmula, sustitución numérica, insumos con origen, interpretación prudente, advertencias y unidad. Sin ∞/NaN/cero-sustituto (test global). `safeDiv` legacy ya no devuelve `Infinity`; formatters muestran "No calculable". Health score universal desactivado por defecto con explicación (ANA-002).

| Indicador | Fórmula | Datos | Promedio | Estado | Test |
|---|---|---|---|---|---|
| Capital de trabajo | AC − PC | ESP | — | CALCULATED | ✅ |
| Liquidez corriente | AC / PC | ESP | — | CALCULATED / NOT_CALCULABLE si PC=0 | ✅ |
| Prueba ácida | (AC − Inventarios) / PC | ESP + metadata INVENTORIES | — | CALCULATED | ✅ |
| Liquidez inmediata | Efectivo / PC | política de efectivo del EFE | — | CALCULATED | ✅ |
| CFO / PC · CFO / Resultado · Flujo libre · Deuda/CFO · Cobertura intereses | EFE + ER | EFE del motor | — | CALCULATED / NOT_CALCULABLE tipado | ✅ |
| Endeudamiento · Autonomía · Solvencia · Inmovilización · Financ. inmovilización · Composición CP | ESP | ESP | — | CALCULATED (solvencia NOT_CALCULABLE si PT=0) | ✅ |
| Pasivo / PN | PT / PN | ESP | — | NOT_APPLICABLE si PN ≤ 0 | ✅ |
| Márgenes bruto/operativo/neto | ER | ER | — | CALCULATED | ✅ |
| ROA / ROE / DuPont / Rotación del activo | Resultado / promedio | ESP+comparativo | (inicio+cierre)/2 o **"aproximación con saldo final"** rotulada | CALCULATED | ✅ |
| Margen EBITDA | (Rdo. op. + D&A) / Ventas | — | — | INSUFFICIENT_INFORMATION (sin metadata de depreciaciones; sin heurísticas) | ✅ |
| Rotación / días de inventario | CMV / inv. promedio; 365/rotación | ER+ESP | ✅ | CALCULATED con **política de 365 días explícita** | ✅ |
| Días de cobranza / pago / ciclo de caja | requieren ventas/compras a crédito | — | — | INSUFFICIENT_INFORMATION (**no se inventan**) | ✅ |

Análisis vertical (ESP sobre activo/financiación; ER sobre ventas) y horizontal (absoluta y %, con base cero/negativa advertida sin % engañoso), ambos del mismo bundle con comparativo del motor.

## 22.12. Trazabilidad didáctica

- **Flujo**: cada `ReportLine` lleva `accountIds`; el TB normalizado lleva `entryIds` por cuenta; `getLineLineage(bundle, lineId, accountIds)` abre: cuentas → movimientos (fecha, memo, D/H, estado) → asiento (número) → operación de origen (`sourceModule/sourceType/sourceId`). Probado del ER y del ESP hasta los asientos (`notas-linaje.test.ts`).
- **Vistas**: pestaña EFE con desglose por renglón y validación; los indicadores muestran fórmula/sustitución/insumos-con-origen (el linaje del importe). Vista navegable "clic en el importe → drilldown" en las demás pestañas: pendiente de UI (el dato ya existe en el modelo).
- **Escenarios educativos**: **no implementados como feature de UI** (se declaran pendientes; ver 22.20). Los tres escenarios pedidos existen como golden cases ejecutables (comercial completo, servicios implícito en métricas, inflación con índices controlados), pero sin el flujo "empresa/ejercicio separado + consignas + reset" para el usuario final. No se simula lo contrario.

## 22.13. Tests

| Suite | Antes 2A | Después 2B | Resultado |
|---|---:|---:|---|
| Legacy + Fase 2A (28 archivos) | 163 | 163 | ✅ sin regresiones |
| `phase2a.acceptance.test.ts` (gate) | — | 12 | ✅ |
| `money-model.v18.test.ts` | — | 12 | ✅ |
| `reversion-uniforme.test.ts` | — | 11 | ✅ |
| `cierre-apertura.test.ts` | — | 10 | ✅ |
| `reporting-engine.test.ts` (ESP/ER/EEPN/EFE golden + multiejercicio + bloqueos) | — | 14 | ✅ |
| `inflacion-motor.test.ts` | — | 14 | ✅ |
| `indicadores.test.ts` | — | 15 | ✅ |
| `notas-linaje.test.ts` | — | 6 | ✅ |
| `performance.test.ts` (10k/100k) | — | 2 | ✅ |
| **Total** | **163** | **259** | **✅ 259/259** |

Deterministas (fechas e índices fijos), bases Dexie aisladas, importes exactos al centavo (igualdad estricta), sin snapshots.

## 22.14. Rendimiento

- **Bundle inicial**: 3.470 KB → **1.873 KB (−46 %)** por lazy loading de Estados, Planillas y Operaciones pesadas (React.lazy + Suspense). Precache PWA: 76 entradas (chunks divididos).
- **Motor completo** (TB+ESP+ER+EEPN+EFE×2+validación, dataset sintético determinista): **10.000 líneas: 79 ms**; **100.000 líneas: 541 ms** (tests con umbrales 3 s / 30 s para no ser flaky en CI).
- Consultas por rango indexado en todos los consumidores (sin `toArray()` global en reportes). Workers: no necesarios con estos tiempos; decisión documentada.

## 22.15. Seguridad y dependencias

- `npm audit --omit=dev`: **1 alta — xlsx, sin fix en npm**. Excepción temporal **formalmente aceptada y documentada** en `docs/SECURITY_EXCEPTION_XLSX.md` (superficie local, límites de importación activos, validación tipada en la puerta única; salida: migrar a exceljs en 2C). **SEC-002 NO se marca resuelto.**
- Sin `npm audit fix --force`; sin dependencias nuevas de producción en esta fase.
- Provenance de build (DEP-001 parcial): `VITE_COMMIT_SHA` y `VITE_BUILD_DATE` inyectados por Vite y visibles en `/acerca` junto con schema, motor y norma. Pipeline de Cloudflare sigue sin versionar (no verificable desde el repo; pendiente).

## 22.16. Hallazgos

| ID | Estado | Evidencia | Observación |
|---|---|---|---|
| ACC-002 | **Resuelto** | reversión uniforme (`journalService`), `reversion-uniforme.test.ts`, gate #6-7 | POSTED inmutable en TODOS los caminos; ediciones/anulaciones por reversión enlazada |
| ACC-004 | **Resuelto** | ADR + v18 + `money-model.v18.test.ts`; motor en centavos | Importes exactos al centavo end-to-end; excepciones reportadas, no silenciadas |
| ACC-005 | **Parcial (mayor parte)** | motor único + `StatementValidationReport`; ER=EEPN y PN=EEPN validados | Motor canónico único con validación; presentadores visuales ESP/ER/EEPN legacy pendientes de recableo |
| ACC-006 | **Resuelto (nominal) / Parcial (moneda de cierre)** | `buildCashFlow.ts`, pestaña EFE, invariantes ✅ | EFE directo+indirecto conciliados y expuestos; reexpresión de flujos pendiente |
| ACC-007 | **Parcial (avanzado)** | motor sin heurísticas; unmapped bloquea publicación | Asistente de revisión de mappings pendiente (la validación ya lista los faltantes) |
| ACC-008 | **Resuelto** | `closingService` + `cierre-apertura.test.ts` | Cierre/refundición/apertura/reapertura reproducibles e idempotentes |
| ACC-010 | **Resuelto (motor) / Parcial (UI legacy)** | `inflation/engine.ts` con especificación algebraica; legacy `@deprecated`; golden 375.000 conciliado | Cálculo correcto probado; pantalla vieja contenida hasta recableo |
| ACC-011 | **Resuelto (semántica) / Parcial (claves)** | reversión uniforme + idempotencia de anulación | Claves explícitas por generador: adopción incremental (riesgo de colisión al autoderivar) |
| NOR-001 | **Parcial** | juego ESP/ER/EEPN/EFE + notas reconciliadas + validación + norma declarada | Modelos CENCyA completos y comparativos externos estructurados pendientes |
| NOR-003 | **Parcial** | `versions.ts` (norma/versión) + registro de índices con fuente/fecha | Registry completo de normas y vigencias pendiente |
| NOR-004 | **Resuelto** | `indexRegistry` versionado con hash y estados; bloqueos probados | — |
| ANA-001 | **Resuelto** | `MetricResult`; `safeDiv` sin Infinity; tests | Ningún ∞/NaN en indicadores ni formatters |
| ANA-002 | **Resuelto** | fórmula/sustitución/insumos/advertencias; promedios o rotulado; score desactivado | — |
| ANA-003 | **Resuelto (alcance definido)** | vertical/horizontal + actividad + flujo; insuficientes tipados | Métricas sin datos estructurados se declaran, no se estiman |
| DAT-002 | **Resuelto** | migraciones v17+v18 idempotentes/testeadas; TB reconstruible del Diario | — |
| SEC-002 | **Aceptado con excepción documentada** | `SECURITY_EXCEPTION_XLSX.md` | NO resuelto: condición de salida definida (2C) |
| ARQ-001 | **Parcial** | motor/servicios puros extraídos; reglas fuera de componentes nuevos | Componentes legacy gigantes intactos adrede (evitar refactor cosmético masivo) |
| ARQ-002 | **Parcial** | motor canónico único; RECPAM legacy deprecado; exclusión de cierre estructural | ER presentacional duplicado hasta recableo de UI |
| TST-001 | **Resuelto** | 259 tests; gate 2A permanente; golden multi-área | — |
| TST-002 | **Resuelto** | **lint exit 0** (98→0), 0 hooks, tsc limpio | 53 warnings preexistentes (ninguno nuevo) |
| PER-001 | **Resuelto (mayor parte)** | bundle −46 %; 100k líneas en 541 ms; consultas indexadas | Virtualización de tablas largas pendiente |
| DEP-001 | **Parcial** | commit/fecha/schema/motor/norma visibles en `/acerca` | Pipeline Cloudflare no versionable desde el repo |
| DID-001 | **Parcial** | linaje modelo+API probados; EFE con drilldown; indicadores con sustitución | Vista clic-para-navegar en ESP/ER y escenarios guiados pendientes |

## 22.17. Comandos finales

| Comando | Resultado |
|---|---|
| `npm test` | **259/259 ✅** (38 archivos, ~17 s) |
| `npm run lint` | **exit 0 — 0 errores**, 53 warnings preexistentes |
| `npm run build` | ✅ (tsc -b + Vite; PWA 76 entradas) |
| `npm audit --omit=dev` | 1 alta (xlsx, excepción documentada) |
| `git status` | limpio tras cada hito; 9 commits + informe |
| `git diff --stat c7b718c..HEAD` | 73 archivos, ~5.674 inserciones / 222 eliminaciones |
| Bundle | `index-*.js` inicial 1.873 KB (antes 3.470 KB) |

## 22.18. Archivos modificados (selección por propósito y riesgo)

**Nuevos — núcleo (riesgo controlado por tests dedicados)**
- `src/accounting/migration/{versions,migrateV18}.ts` — modelo monetario v18.
- `src/accounting/application/closingService.ts` — ciclo de cierre.
- `src/accounting/inflation/{types,indexRegistry,engine}.ts` — inflación/RECPAM.
- `src/reporting/domain/types.ts`, `engine/{buildStatements,buildCashFlow,buildNotes}.ts`, `metrics/{types,metrics,analysis}.ts`, `loadStatements.ts`, `lineage.ts` — motor único.
- `src/accounting/capabilities.ts`, `docs/ADR_MODELO_MONETARIO.md`, `docs/SECURITY_EXCEPTION_XLSX.md`.
- `tests/accounting/*` (9 suites nuevas, 96 tests).

**Modificados — de mayor a menor riesgo**
- `src/accounting/application/journalService.ts` — reversión uniforme (riesgo alto; cubierto por 23 tests directos + gate).
- `src/storage/{fixedAssets,impuestos,ops,journalSync}.ts` — adopción del id sustituto / exclusión de anulados (riesgo medio; tsc + suites).
- `src/accounting/domain/money.ts`, `validation/validatePosting.ts` — integridad de centavos (riesgo medio; 24 tests).
- `src/utils/resultsStatement.ts`, `reporting/reportingContext.ts`, `pages/Estados.tsx`, `hooks/useIndicatorsMetrics.ts` — exclusión estructural de cierre y anti-doble-conteo con apertura (riesgo medio; tests de cierre).
- `src/App.tsx` (lazy), `vite.config.ts` (provenance), `EstadosHeader/FlujoEfectivoTab` (EFE UI), `AcercaDe` (capacidades) — riesgo bajo.
- Tipados de lint en ~20 archivos legacy (riesgo bajo: solo tipos, verificado por tsc + suite completa).

## 22.19. Prueba manual

1. **Gate**: `npm test` — verificar `phase2a.acceptance` y las 9 suites 2B en verde.
2. **Migración v18**: abrir la app con datos v17 → `/acerca` muestra "Schema Dexie v18", motor 2B.1, commit y fecha de build; los importes del Diario no cambian visualmente (normalización sub-centavo).
3. **Backup previo**: `/acerca` → Descargar respaldo (recomendado antes de probar cierres).
4. **Reversión uniforme**: editar el importe de una compra en Inventario → en el Diario aparecen el original **Revertido**, su reversión y el sustituto; el Mayor muestra solo el importe nuevo. Eliminar un movimiento de Inversiones → su asiento queda Revertido (no desaparece).
5. **Cierre**: con un ejercicio con ventas y gastos, ejecutar la vista previa (consola: `previewClosing`) → generar borradores → verlos en el Diario como Borrador → `postClosing` → Ventas/Gastos en cero, resultado en Resultados no asignados, ejercicio Cerrado; intentar contabilizar en ese año → rechazo por período cerrado.
6. **Apertura**: `generateOpeningEntry` → asiento de apertura 01/01 del año siguiente solo patrimonial; cambiar el ejercicio en el selector → ESP idéntico, ER en cero.
7. **Reapertura**: `reopenClosedExercise(id, 'motivo')` → cierre y apertura revertidos, ejercicio Abierto.
8. **EFE**: Estados → pestaña "Flujo de Efectivo" → métodos directo e indirecto con el banner verde de invariantes; comprar un bien de uso a crédito → aparece en "Transacciones sin efecto en el efectivo".
9. **Validación**: crear una cuenta de resultado sin grupo de exposición, imputarle un gasto → el reporte de validación marca `unmapped-results` y el estado deja de ser publicable.
10. **Inflación**: en tests (`inflacion-motor`) o consola: cargar set de índices MANUAL con `saveIndexSet`, correr `computeInflationAdjustment` → borrador propuesto balanceado; quitar un índice → bloqueo con el período informado.
11. **Indicadores**: dashboard sin ∞ (probar con pasivo cero) y sin score global; cada tarjeta con "No calculable" tipado donde corresponde.
12. **Performance**: `npx vitest run tests/accounting/performance.test.ts` — imprime 10k/100k ms.

## 22.20. Deuda pendiente

**Bloqueante para 2C**
1. Recablear las pestañas ESP/ER/EEPN y la pantalla de Cierre-Valuación al motor único (hoy: motor canónico + validación cruzada + UI legacy contenida).
2. Migrar importadores fuera de `xlsx` (condición de salida de la excepción SEC-002).

**Importante**
3. Claves de idempotencia explícitas (`postOperation`) generador por generador.
4. Asistente de revisión de mappings (la validación ya bloquea y lista faltantes).
5. Comparativos externos marcados como tales en UI, con fuente/moneda/estado.
6. EFE en moneda de cierre (integrar coeficientes del motor de inflación al juego completo).
7. Escenarios educativos guiados (empresa/ejercicio separados, consignas, reset) y drilldown clic-en-importe en ESP/ER.

**Futura**
8. Almacenamiento versionado de estados "publicados"; pipeline de deploy versionado; virtualización de tablas; nota de ME y anexo de bienes de uso con evolución completa.

**Fuera de alcance (declarado en `/acerca`)**: ESFL, agro, cooperativas, consolidación, discontinuadas, multiusuario.

## 22.21. Conclusión

- **¿ContaLivre es confiable como laboratorio educativo?** Sí. La cadena operación→asiento→libros→cierre→estados→indicadores es única, validada por invariantes ejecutables y trazable hasta el asiento; los datos se preservan (backup/restore probado) y nada muta libros sin auditoría.
- **¿Puede generar un juego completo consistente para una entidad comercial o de servicios?** Sí, en el alcance educativo declarado: ESP, ER, EEPN y EFE (directo e indirecto) salen del mismo modelo, con notas principales reconciliadas, comparativos derivados y un reporte de validación que impide publicar si algo no cierra.
- **¿El ajuste por inflación está validado?** El **motor** sí: especificación algebraica, anticuación real, índices con proveniencia, RECPAM directo=indirecto probado con casos de oro. El **flujo de usuario final** sigue PARTIAL: la pantalla legacy está contenida y el uso real exige índices oficiales cargados y validación profesional.
- **¿El EFE concilia?** Sí: variación = final − inicial, efectivo EFE = ESP y directo = indirecto se verifican en cada cálculo y en los golden cases.
- **¿Los indicadores son defendibles?** Sí dentro de su contrato: cada valor expone fórmula, sustitución, insumos con origen, promedio o su ausencia rotulada, y lo que no se puede calcular se declara — sin ∞, sin datos inventados, sin score universal.
- **¿Qué alcances siguen no soportados?** ESFL, agropecuario, cooperativas, consolidados/negocios conjuntos, discontinuadas y multiusuario (visibles como NOT_SUPPORTED en `/acerca`).
- **¿Listo para merge o requiere Fase 2C?** El branch está estable y verificado para merge a la rama de trabajo. Recomendación: **una Fase 2C acotada** (recableo de UI de estados al motor, salida de xlsx, claves de idempotencia por módulo y escenarios didácticos) antes de considerar el producto "completo"; ninguna de esas deudas compromete la corrección del núcleo entregado.
