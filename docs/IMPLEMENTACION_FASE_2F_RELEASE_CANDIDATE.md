# IMPLEMENTACIÓN FASE 2F — RELEASE CANDIDATE

**Hardening final, validación visual real, cierre de workflows pendientes y RC verificable de punta a punta**

Fecha: 2026-07-20 · Rama: `refactor/fase-2f-release-candidate` · Base: `refactor/fase-2e-estados-anexos-pedagogicos` @ `7721be9`

---

## 22.1. Resumen ejecutivo

**Estado de la RC**: **lista para preview y merge; NO desplegada a producción** (sin merge ni deploy automáticos, según lo pedido).

Esta fase NO amplió el modelo contable: cerró los workflows que en 2E existían solo como motor, validó la aplicación en un navegador real con datos no triviales, unificó el entorno y la versión, y produjo evidencia verificable (capturas, PDF y planillas reales revisados con extracción de texto, no solo "se genera el archivo").

**Cambios principales:**
1. Versión única `0.4.0-rc.1` (fuente: `package.json`) y entorno reproducible Node 22 LTS; build verificado en clon limpio.
2. Dataset determinista **ContaLivre RC Acceptance** (2024 comparativo + 2025 actual) con 11 golden tests.
3. **Playwright** con validación visual real en 6 resoluciones + móvil + Firefox; 41 capturas y 5 exportables.
4. **Editor visual de reglas de distribución de gastos** (versionado, validado, auditado).
5. **Notas manuales persistentes** (schema v21, versionadas, sanitizadas, con invalidación de snapshots).
6. **`equityMovementType` persistido**: la AREA se puebla en su fila del EEPN.
7. **Componentes estructurados del CMV** (compras, devoluciones, fletes, otros, bajas anormales aisladas).
8. **Moneda extranjera** con detalle operativo reconciliado contra el Diario.
9. **Bienes de uso en moneda de cierre** + **selector único de set de índices** (EFE + PPE).
10. **Dashboard migrado al motor canónico**; `core/statements` y `domain/reports/estadoResultados` eliminados.
11. Cadena de migraciones v16→v21 y backup/restore/reset probados (unit + E2E).
12. Exportaciones revisadas con pdfjs: **defecto de ESP duplicado detectado y corregido**.
13. Performance 10k/100k medida; warnings/vulnerabilidades saneadas y documentadas.

**Bloqueantes**: ninguno.

**Pendientes** (no bloqueantes): ver §22.20.

---

## 22.2. Git y versiones

| Ítem | Valor |
|---|---|
| Rama base | `refactor/fase-2e-estados-anexos-pedagogicos` @ `7721be9` |
| Rama de trabajo | `refactor/fase-2f-release-candidate` |
| HEAD | `a00a7e4092722567e21cfcd5a8863a526bf7b3a9` |
| Commits 2F | 15 (uno por hito + `.gitattributes`) |
| Diff acumulado | 126 archivos, +4.127 / −1.764 |
| App | **0.4.0-rc.1** (fuente única `package.json`) |
| Motor contable | **2F.0** |
| Schema Dexie | **v21** |
| Node / npm | **22.23.1 / 10.9.8** (pineado `.nvmrc`/`.node-version`/`engines`) |

**Commits por hito**: baseline+erratas `0d0ac4b` · versión/Node `2577b56` · dataset `5e4de59` · Playwright `4e6d07e` · editor reglas `c6489fe` · notas manuales `dd5d174` · PN/AREA `46ad13e` · CMV `bb66f88` · FX `9dcc355` · bienes de uso/índices `7b434fe` · Dashboard `b03e849` · migraciones/reset `ab6300a` · exportaciones `9a44aa5` · performance/seguridad `a00a7e4`.

---

## 22.3. Correcciones del informe 2E

Verificadas al inicio (fe de erratas agregada al informe 2E):
- **57 archivos** de test (no 58); **71 pruebas nuevas** (no 61; la tabla ya sumaba 71).
- HEAD exacto de 2E: `7721be9c82a0c3dfb69f51cc9cc689bc49da2361`.
- Versiones desalineadas (`package 0.1.0` / runtime `0.3.0` / motor `2B.1`) → **unificadas** a `0.4.0-rc.1` / `2F.0`.
- Node del doc de deploy estaba EOL (20) → repineado a **22 LTS** con prueba real.

---

## 22.4. Evidencia visual

41 capturas + 5 exportables en `docs/evidence/phase2f/` ([INDEX.md](evidence/phase2f/INDEX.md)).

| Pantalla | Escritorio | Móvil | Resultado | Incidencias |
|---|---|---|---|---|
| ESP | ✓ 1920/1440/1366/1024/tablet | ✓ 390 | OK | — |
| ER completo | ✓ | ✓ | antes de impuesto/IG/continuadas | encabezados repetidos → corregido |
| EEPN matriz | ✓ | ✓ (por movimiento) | grupos, cierre 1.536.000 | encabezado truncado → corregido |
| EFE directo/indirecto + resumen/detalle | ✓ | ✓ | explicaciones de ajustes | — |
| EFE moneda de cierre | ✓ | — | REI conciliado | — |
| Notas + regularizadoras | ✓ | ✓ | — | — |
| Gastos por función | ✓ | — | regla aplicada | — |
| CMV puente | ✓ | ✓ | conciliado | — |
| Bienes de uso + moneda de cierre | ✓ | — | VO nominal+ajuste=reexpresado | — |
| Moneda extranjera | ✓ | — | — | — |
| Estado bloqueado/revalidado | ✓ | — | banner + botón deshabilitado | — |
| Editor de reglas | ✓ | — | 70/30 aplicada 42.000/18.000 | — |

Incidencias detectadas por la validación real y **corregidas**: versión hardcodeada `v1.0.4`, encabezado truncado del EEPN, encabezados repetidos del ER, y **ESP duplicado en PDF/planilla** (§22.14).

---

## 22.5. Dataset de aceptación

`src/accounting/fixtures/rcAcceptance.ts` — 29 cuentas `rc-` con mappings estructurales completos; ejercicios FIJOS 2024 (cerrado con refundición y apertura) y 2025 (24 operaciones). Cargable/eliminable solo en entorno de prueba (panel montado fuera de producción), guardia contra asientos reales, idempotente, no es la Práctica guiada.

Saldos esperados documentados (`RC_EXPECTED`): resultado 2025 **32.000**, antes de impuesto **62.000**, IG **30.000**, PN cierre **1.536.000**, CMV **450.000** (EI 150.000 heredada por apertura), gastos por función ADMIN 258.000 / SELLING 96.000 / FIN 64.000, efectivo cierre **1.356.000**, FX 150.000. Golden: `tests/acceptance/rc-dataset.golden.test.ts` (11).

---

## 22.6. Distribución de gastos

- **Servicio** `allocationRulesService`: crear (DRAFT/ACTIVE), validar (100 % exacto, positivos, funciones, cuenta apta —COGS e IG bloqueados—, motivo, superposición de vigencias), versionar con cierre automático de la anterior (nunca retroactivo silencioso), finalizar vigencia, editar/eliminar solo borradores. Todo auditado.
- **Editor** `ExpenseAllocationEditor` en Configuración → Plan de cuentas: saldo del período, funciones+%, suma, vigencias, motivo, **vista previa con importes** ("se modifica la exposición, no el Diario"), historial con duplicar/nueva versión/finalizar.
- **Pruebas**: servicio (7) + E2E (crear 70/30 desde la UI y verlo en el anexo).

## 22.7. Notas manuales

- **Modelo** `ManualDisclosure` (schema v21, tabla `manualDisclosures`): noteType, DRAFT/VALIDATED, notApplicable con fundamento, versión, supersedesId.
- **Servicio**: sanitización a texto plano (sin HTML/control-chars), versionado con historial intacto, y **guardar VALIDATED invalida los snapshots del ejercicio** (los borradores no).
- **Integración**: 6 notas manuales en el bundle (identificadas MANUAL, N/A con fundamento, nunca texto de ejemplo); PDF/planilla las heredan; editor en la pestaña Notas.
- **Pruebas**: 6 unit + E2E (guardar, invalidar).

## 22.8. EEPN

- `JournalEntry.equityMovementType` estampado al contabilizar (inmutable); las reversiones lo heredan. NewEntryModal ofrece el selector al imputar PN.
- El motor de la matriz prioriza la clasificación explícita sobre la estructural; **AREA se puebla en "Modificaciones de ejercicios anteriores"** solo con confirmación (los legacy sin metadata conservan la estructural — nada se inventa).
- Evidencia: `eepn-matriz-1920` (AREA −20.000 en su fila, inicio ajustado 1.244.000).

## 22.9. CMV

- `CostOfSalesComponent` + `Account.costComponent`. Puente ampliado: EI + Compras − Devoluciones + Adquisición + Otros = Disponibles − EF − **Bajas anormales aisladas** = CMV. Las pérdidas anormales se exponen como diferencia real, no ensucian el costo; con ellas aisladas el puente concilia con el ER. Sin mapping, el modelo perpetuo 2E queda intacto.
- **Pruebas**: `costOfSalesComponents2f` (2) + golden RC.

## 22.10. FX y bienes de uso

- **FX**: `loadForeignCurrency` normaliza la posición operativa (FxAccount+FxMovement) en `ForeignCurrencyDetail`; el motor enriquece la nota con cantidad/cotización/fuente/fecha y **expone la diferencia** con la medición del Diario (fuente del saldo). Sin detalle: información insuficiente. Pruebas: `foreignCurrency2f` (4).
- **Bienes de uso moneda de cierre**: `fixedAssetsInflation` reexpresa VO y depreciación anticuando cada movimiento; ajuste = reexpresado − nominal; bloquea si falta índice. Toggle nominal/cierre. Pruebas: `inflationSet2f` (3).

## 22.11. Índices

- `loadReportingBundle({ inflationIndexSetId })`: un **único set** alimenta EFE y bienes de uso; verifica el hash, computa cobertura y faltantes, y lo expone en el bundle (`inflationSet`). El snapshot congela el `indexSetId`.
- `InflationSetSelector` en la barra: nombre, estado (oficial/manual/ejemplo), fuente, fecha, hash, cobertura, faltantes. "Moneda de cierre" no se habilita sin set válido.
- Consistencia del juego: la misma serie en EFE, bienes de uso y snapshot.

## 22.12. Dashboard

- **Motor anterior**: `useDashboardMetrics` usaba `computeLedger`/`computeTrialBalance`/`computeStatements` (legacy).
- **Motor final**: deriva TODO del `ReportingBundle` (`useReportingBundle`); activo, pasivo, PN, efectivo, liquidez y composición salen del mismo motor que Estados.
- **Código eliminado**: `src/core/statements.ts`, `src/domain/reports/estadoResultados.ts` y su export del barrel; tests puros retirados, cobertura de devoluciones plegada al canónico.
- **Prueba**: `dashboard-canonical` (arquitectura + igualdad de totales Dashboard=Estados contra golden RC).

## 22.13. Migraciones y datos

- `tests/accounting/migration-chain-2f.test.ts`: base v16 legacy → upgrades encadenadas v17→v21 → data preservada, schema v21, tablas nuevas usables.
- Backup incluye las tablas 2F; reset deja la app utilizable (empresa+meta, sin datos previos); restore recupera reglas/notas/asientos; un backup de schema más nuevo se rechaza sin tocar datos.
- **E2E** `reset-restore`: reset total en navegador real → app utilizable → dataset recargable.

## 22.14. Exportaciones

- Artefactos reales generados con el dataset RC y revisados con **pdfjs** (texto extraído): [EXPORT_REVIEW.md](evidence/phase2f/EXPORT_REVIEW.md).
- **Defecto detectado y corregido**: el ESP se **duplicaba** en PDF y planilla (se listaban currentAssets/nonCurrentAssets y además totalAssets, que los reexpande). Corregido con `balanceSheetRows`/`asTotal`. Verificado en el PDF regenerado.
- Comparación normativa FACPCE/CENCyA: coincidencias (4 estados + orden + subtotales + notas), diferencias deliberadas (alcance educativo declarado, códigos de cuenta, pie con trazabilidad) y campos pendientes (firma profesional, informe del auditor). No se afirma "conforme" por generarse el archivo.

## 22.15. E2E

| Navegador | Escenarios | Resultado |
|---|---|---|
| Chromium desktop (1920) | visual-acceptance (3), resolutions (4×), exports, allocation-editor, reset-restore, full-flow | ✓ |
| Chromium mobile (390×844) | mobile | ✓ |
| Firefox desktop (1440) | full-flow integral | ✓ |

**13 tests E2E** verdes. El flujo integral (§19): app limpia → dataset → estados → editar regla → guardar nota → versión validada → modificar nota → **invalidación observable** → reset.

## 22.16. Rendimiento

| Caso | 2C | 2E | 2F | Budget |
|---|---|---|---|---|
| 10.000 asientos → bundle | n/m | n/m | **169 ms** | < 1.500 ms |
| 100.000 asientos → bundle | n/m | n/m | **1.328 ms** | < 12.000 ms |

Escala ~lineal; sin virtualización necesaria a nivel de motor. `tests/reporting/performance2f.test.ts` con budgets que fallan ante regresión de orden de magnitud. Detalle: [SECURITY_PERF.md](evidence/phase2f/SECURITY_PERF.md).

## 22.17. Seguridad

- **Producción** (`npm audit --omit=dev`): **2 moderate** = `uuid<11.1.1` vía `exceljs`, **no explotable** (exceljs no pasa `buf` a uuid v3/v5/v6). `brace-expansion` resuelto con `npm audit fix`. Ninguna alta/crítica shipea.
- **Solo dev**: `esbuild` (dev-server) vía vitest/playwright — no se despliega. Documentado con condición de salida.
- Lint: **0 errores** (se corrigió el `no-control-regex` introducido), **53 warnings preexistentes** (ninguno en 2E/2F), documentados sin desactivar reglas.

## 22.18. Tests

| Suite | Antes (2E) | Después (2F) | Resultado |
|---|---|---|---|
| Unit (vitest) | 388 (57 arch.) | **423 (64 arch.)** | ✓ |
| E2E (Playwright) | 0 | **13** (Chromium desktop+móvil, Firefox) | ✓ |

Nuevas suites 2F: rc-dataset.golden (11), allocationRulesService (7), manualDisclosures (6), equityMatrix (metadata explícita, +2), costOfSalesComponents2f (2), foreignCurrency2f (4), inflationSet2f (3), dashboard-canonical (4), migration-chain-2f (3), performance2f (2), + ajustes. Retiradas: statements.test, estadoResultados.devoluciones (legacy).

## 22.19. Prueba manual (guion reproducible)

```
1. npm ci && npm test && npm run lint && npm run build   (Node 22.23.1)
2. npm run dev
3. Configuración → Datos → "Cargar dataset RC"
4. Estados → recorrer ESP/ER/EEPN(matriz y resumen)/EFE(directo/indirecto,
   resumen/detalle)/Notas/Gastos/CMV/Bienes de uso/Moneda extranjera
5. Barra → Índices "Índices RC (ejemplo)" → EFE y Bienes de uso "Moneda de cierre"
6. Configuración → Plan de cuentas → Distribución de gastos: crear regla 70/30
7. Estados → Notas → Editar notas manuales → guardar validada
8. "Guardar versión validada" → modificar la nota → ver INVALIDATED
9. Exportar estados (PDF + planilla) → revisar
10. Configuración → Datos → reset → recargar dataset
```
Automatizado en `e2e/full-flow.spec.ts` (Chromium + Firefox).

## 22.20. Deuda pendiente

**Bloqueante**: ninguna.

**Importante**:
- Selector de `equityMovementType` también en el formulario móvil de asientos (hoy solo desktop).
- Migración de datos legacy de PN a `equityMovementType` (hoy solo asientos nuevos lo estampan; los previos usan clasificación estructural).

**Futura**:
- 53 warnings de lint en UI legacy (FX/planillas): refactor a `useMemo` de expresiones lógicas.
- `esbuild` dev-only / `uuid` vía exceljs: actualizar cuando haya versión no-breaking.
- Virtualización de UI para tablas con 100k filas de detalle (no aplica al RC).
- Fixture RC: el cierre 2024 usa una cuenta del seed (`3.3.01`) para la refundición; los totales reconcilian pero mezcla seed+rc (nuance didáctica).

**Fuera de alcance**: actividad industrial (MP/PP/PT), operaciones discontinuadas, informe del auditor y firma profesional en el PDF, cotización FX automática con fuente normativa.

## 22.21. Veredicto

| Pregunta | Respuesta |
|---|---|
| ¿La versión es reproducible? | **Sí** — fuente única `package.json`, Node 22 LTS pineado, build verificado en clon limpio. |
| ¿Existe evidencia visual? | **Sí** — 41 capturas + 5 exportables reales, revisados con pdfjs. |
| ¿EEPN/EFE/notas/anexos son comprensibles? | **Sí** — validados en navegador real con datos no triviales. |
| ¿Los workflows son utilizables desde UI? | **Sí** — reglas de gasto, notas manuales, índices, moneda de cierre, AREA, todos con flujo accesible. |
| ¿Los exportables fueron revisados realmente? | **Sí** — texto extraído; un defecto (ESP duplicado) detectado y corregido. |
| ¿Dashboard y Estados coinciden? | **Sí** — mismo motor canónico; legacy eliminado; test de igualdad. |
| ¿Migraciones y reset son seguros? | **Sí** — cadena v16→v21 y backup/reset/restore probados (unit + E2E). |
| ¿Está lista para preview? | **Sí.** |
| ¿Está lista para merge? | **Sí** (sin merge automático realizado). |
| ¿Está lista para producción? | **Tras el staging de §4 del doc de deploy** (preview Cloudflare + smoke + autorización manual). No se desplegó. |

---

### Validación final ejecutada

```
npx vitest run        → 423/423 ✅ (64 archivos)
npm run e2e           → 13/13 ✅ (Chromium desktop+móvil, Firefox)
npm run lint          → 0 errores, 53 warnings (preexistentes) ✅
npm run build         → OK (20,4 s) ✅
npm audit --omit=dev  → 2 moderate (uuid vía exceljs, no explotable) ✅
Node 22.23.1 · clon limpio verificado (npm ci/test/lint/build) ✅
```
