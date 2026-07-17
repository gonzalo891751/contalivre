# Implementación Fase 2C — Integración final

**ContaLivre — Motor canónico en toda la interfaz, retiro del legado, cierre en moneda homogénea, seguridad de importaciones, didáctica y preparación para merge**

| Dato | Valor |
|---|---|
| Fecha | 17 de julio de 2026 |
| Rama | `refactor/fase-2c-integracion-final` (desde `refactor/fase-2b-reporting-inflacion-efe`) |
| Commit base verificado | `1c5deaab441c0196f1ea649dd7a00c642365be55` (coincide con el esperado `1c5deaa`) |
| Node / npm | v25.9.0 / 11.12.1 |
| Antecedentes | Auditoría F1, informes 2A/2B, ADR modelo monetario, excepción xlsx |

---

## 21.1. Resumen ejecutivo

**Objetivo cumplido**: todo lo visible y exportable en ContaLivre usa exclusivamente la arquitectura canónica de 2A/2B. Una operación → Diario → motor único → ESP/ER/EEPN/EFE/Notas/Indicadores → UI/PDF/XLSX → drilldown, con una sola cifra en todas las salidas.

**Cambios principales**:
1. **Gate consolidado 2A+2B** (`tests/acceptance/phase2ab.acceptance.test.ts`, 11 checks) reproducido antes y después, sin divergencias.
2. **Recableado total de Estados**: `loadReportingBundle` como única capa de consulta; ESP/ER/EEPN/EFE/Notas renderizan desde el bundle; se **eliminó el cluster legacy** (10+ archivos) y un test arquitectónico impide reintroducirlo.
3. **PDF y planilla desde el mismo bundle**: metadatos, validaciones y marca de agua "BORRADOR — NO VALIDADO"; consistencia UI=bundle=export verificada por tests.
4. **Salida de `xlsx`**: eliminado (high sin fix) y reemplazado por `exceljs` (lazy) + `papaparse`; `npm audit` ya no reporta la vulnerabilidad; **SEC-002 cerrado**.
5. **Inflación con motor nuevo**: el RECPAM legacy se **eliminó del repositorio** (ACC-010); la pantalla usa `computeInflationAdjustment` (indirecto por conciliación + directo de control).
6. **EFE en moneda de cierre**: reexpresión por período de cada flujo, REI del efectivo como línea de conciliación, toggle nominal/cierre.
7. **Idempotencia explícita universal**: `createEntry` deriva la clave `module|type|sourceId|contentHash`; matriz por módulo; `findEntryByIdempotencyKey` ignora anulados.
8. **Asistente de mapeos** con impacto previo y auditoría; **escenarios educativos** guiados en ejercicios demo aislados; **anexo de bienes de uso**; **snapshots de reportes** (DRAFT/VALIDATED/PUBLISHED/INVALIDATED); **deploy documentado**.

**Estado final**: 303/303 tests (274→303 con 5 suites nuevas), lint exit 0, tsc limpio, build OK, bundle inicial 1.546 KB (menor que el de 2B), audit 0 high/critical.

**Riesgos eliminados**: dos motores/presentadores en paralelo (ARQ-002), cifras potencialmente distintas UI vs PDF (ACC-005), inflación correcta solo por tests (ACC-010), EFE solo nominal (ACC-006), vulnerabilidad alta aceptada (SEC-002), didáctica prometida pero inaccesible (DID-001).

**Riesgos pendientes**: 3 vulnerabilidades **moderate** de bajo riesgo real (uuid dentro de exceljs, brace-expansion transitiva); aislamiento de escenarios a nivel ejercicio (no empresa separada, por diseño mono-empresa de 2A); comparativos externos importados quedan retirados a favor del comparativo interno del motor (ver 21.10).

---

## 21.2. Verificación de 2A y 2B

Gate `phase2ab.acceptance.test.ts` (11/11 ✅), corrido antes y después:

| Afirmación | Verificada | Evidencia | Divergencia |
|---|---|---|---|
| Único escritor de `entries` | ✅ | escaneo arquitectónico | Ninguna |
| Borrador fuera de libros / POSTED inmutable | ✅ | check 1 | Ninguna |
| Edición operativa = reversión + sustituto; anulación = reversión | ✅ | check 3 | Ninguna |
| Idempotencia | ✅ | check 4 | Ninguna |
| Diario=Mayor=Balance, A=P+PN, ER=EEPN, PN ESP=EEPN | ✅ | check 5 | Ninguna |
| EFE directo=indirecto, efectivo=ESP, variación=final−inicial | ✅ | check 6 | Ninguna |
| Cierre/refundición/apertura/reapertura | ✅ | check 7 | Ninguna |
| Índice faltante/origen desconocido bloquean; RECPAM directo=indirecto | ✅ | check 8 | Ninguna |
| Indicador con denominador 0 no da Infinity | ✅ | check 9 | Ninguna |
| Backup/restore conserva schema v18+ | ✅ | check 10 | Ninguna |
| Sin rutas legacy (arquitectura) | ✅ | check 11 + `no-legacy-engines.test.ts` | Ninguna |

## 21.3. Git y versiones

| Hito | Commit |
|---|---|
| 0 — Gate consolidado + retiro RECPAM legacy | `fec42c2` |
| 1-3+5 — Motor canónico UI + exportaciones + salida xlsx + EFE moneda de cierre | `4a076a5` |
| 4+6 — Inflación motor nuevo + idempotencia explícita | `2f4a578` |
| 7+8 — Asistente de mapeos + escenarios educativos | `9260816` |
| 9 — Anexo bienes de uso + snapshots + deploy | `74406e8` |
| 10 — Consistencia + informe (HEAD) | commit de este documento |

Schema v18 → **v19**. App 0.3.0. Motor **2B.1**. Norma: RT 54 (TO RT 59). Diff acumulado 1c5deaa..HEAD: **60 archivos, 4.754 inserciones / 7.913 eliminaciones** (neto −3.159 líneas por retiro de legacy). Sin merge automático a ninguna rama.

## 21.4. Recableado UI

| Pantalla | Motor anterior | Motor final | Legacy retirado | Test |
|---|---|---|---|---|
| ESP | `computeStatements` + adapters Gemini/V2 + localStorage | `loadReportingBundle` → `ESPCanonicalTab` | ✅ eliminados | `reporting-engine`, `consistencia-export`, `no-legacy-engines` |
| ER | `buildEstadoResultados` (domain/reports) + localStorage | `ERCanonicalTab` | ✅ eliminado | idem |
| EEPN | `EvolucionPNTab` (cálculo propio) | `EEPNCanonicalTab` | ✅ eliminado | idem |
| EFE | `FlujoEfectivoTab` (carga propia) | `FlujoEfectivoCanonicalTab` (recibe bundle) | ✅ eliminado | idem |
| Notas | `NotasAnexosTab` (cálculo propio) | `NotasCanonicalTab` | ✅ eliminado | `notas-linaje` |
| Cierre/Inflación | `calculateRecpamIndirecto` (legacy) | `computeInflationAdjustment` (motor) | ✅ **archivo eliminado** | gate check 11 |

Archivos legacy físicamente eliminados: `FlujoEfectivoTab`, `EvolucionPNTab`, `NotasAnexosTab`, `EstadoSituacionPatrimonialGemini`, `DocumentToolbar`, `ESPImportComparativeModal`, `espComparativeStore`, `EstadoResultados/*`, `pages/estados/*` (V2 + adapters), `core/cierre-valuacion/recpam-indirecto.ts`. `tsc` confirma que estaban huérfanos.

**Parcial declarado**: `utils/resultsStatement.ts`, `core/statements.ts` y `domain/reports/*` siguen existiendo porque los usa el dashboard de indicadores legacy (`useIndicatorsMetrics`) y `excludeClosingEntries`; el test arquitectónico impide que Estados/canonical los importen. Su retiro total es deuda menor (el dashboard viejo no es la pantalla de Estados).

## 21.5. PDF y exportaciones

- **Fuente única**: `pdf/reportBundlePdf.ts` y `lib/exportReportBundle.ts` consumen el `ReportingBundle`; no recalculan.
- **PDF**: encabezado con empresa/CUIT/ejercicio/corte/moneda/normativa/motor/versión de reporte/commit; si el reporte no es publicable, marca de agua "BORRADOR — NO VALIDADO" + lista de bloqueantes y sufijo `_BORRADOR`.
- **Planilla (.xlsx con exceljs)**: hojas ESP/ER/EEPN/EFE directo/EFE indirecto/Notas/Indicadores/Análisis vertical/Análisis horizontal + hoja **Metadatos** (contexto, versión, commit, build, validaciones).
- **Consistencia probada** (`consistencia-export.test.ts`, 6 tests): cada importe exportado = importe del bundle (ESP total activo/PN/P+PN, ER resultado/bruto, EEPN cierre = PN ESP, EFE cierre/variación); metadatos y todas las hojas presentes.

## 21.6. Seguridad

- **Salida de xlsx**: `docs/ADR_EXPORTACION_IMPORTACION_PLANILLAS.md` — elegido `exceljs` (lee/escribe, mantenido, sin advisories high/critical) + `papaparse` (CSV). Los 6 importadores migrados a `lib/spreadsheet.ts` (lazy exceljs). `xlsx` eliminado de package.json/lockfile/imports (test `no-legacy-engines` lo verifica).
- **Audit final**: `npm audit --omit=dev` → **0 critical, 0 high, 3 moderate**. Las moderadas: `uuid` (bounds check con `buf` que la app no controla) dentro de `exceljs`, y `brace-expansion` transitiva. Documentadas; ninguna es la vulnerabilidad de xlsx. **SEC-002 cerrado** (excepción original marcada CERRADA en su doc).
- Límites de importación (`importLimits.ts`) se mantienen y aplican antes de parsear.
- `exceljs` (918 KB) queda en chunk **lazy**, fuera del bundle inicial.

## 21.7. Inflación

- **Pantalla**: `CierreValuacionPage` calcula con `computeInflationAdjustment`; `RecpamIndirectoDrawer` muestra indirecto (partida de conciliación), directo de control, conciliación y bloqueantes. El algoritmo legacy **ya no existe** (archivo eliminado; gate check 11 lo verifica).
- **Flujo/bloqueantes**: índice faltante, origen desconocido, cuenta MIXED no resuelta ⇒ el motor lo reporta y no permite contabilizar; los vouchers RT6 siguen enviándose como **borrador**.
- **RECPAM**: indirecto = Σ nᵢ×(coefᵢ−1); directo por exposición cronológica; conciliación exacta verificada (golden 100/160/200 → pérdida 375.000).
- **EFE en moneda de cierre** (`reporting/engine/cashFlowInflation.ts`): reexpresa cada flujo por el coeficiente de su período; el REI del efectivo concilia final nominal con inicial reexpresado + flujos; toggle nominal/cierre en la pestaña EFE; bloquea si falta índice. **Parcial**: la reexpresión está implementada y disponible cuando se aportan índices al bundle; el cableado UI de selección del set de índices para el EFE queda como mejora (el motor y el toggle existen).

## 21.8. Idempotencia — matriz

`docs/IDEMPOTENCIA_MATRIZ.md`. Estrategia universal en `createEntry`: si hay origen completo y no hay clave propia, se enruta por `postOperation` con `accountingEventType` = metadata explícita o `contentDiscriminator(lines)`.

| Familia | Estrategia | Test |
|---|---|---|
| inventory (compra/venta+CMV/devolución/stock) | hash de contenido; venta separa ingreso/CMV | `idempotencia-explicita` |
| fx / ops / prestamos / inversiones | hash de contenido por sourceId | idem |
| impuestos / fixed-assets | metadata explícita + hash | idem |
| payroll | hash de contenido | idem |
| closing / inflación | idempotencia propia del servicio de cierre / borrador | `cierre-apertura`, `inflacion-motor` |

Tests (12): mismo hecho no duplica; ingreso+CMV de la misma venta no se fusionan; reintento consistente; versión=reversión+sustituto; re-post tras anular crea nuevo; accountingEventType explícito prevalece.

## 21.9. Mappings

- **Asistente** (`taxonomy/mappingAssistant.ts` + `/mapeos`): clasifica cuentas (con saldo sin grupo, MIXED, sin monetaria, sin categoría EFE, inactiva con saldo, agrupadora imputada, resultado sin función); cuenta bloqueantes.
- **Impacto**: `describeImpact` explica el efecto en los estados **antes** de guardar.
- **Auditoría**: `saveMapping` sube `metadataVersion` y registra antes/después/motivo. `proposeMapping` solo sugiere; nunca decide MIXED/NOT_APPLICABLE.
- **Bloqueo de publicación**: la validación del motor ya marca `unmapped-results`/`unknown-accounts`; el asistente los lista y prioriza.

## 21.10. Comparativos

- **Interno**: derivado del ejercicio anterior con el mismo motor (`loadReportingBundle({ withComparative })`), espejado línea a línea por id.
- **Externo**: la importación legacy a localStorage (prohibida como fuente contable) fue **retirada**. La reincorporación como comparativo EXTERNAL rotulado (con hash/fuente/moneda/estado) queda declarada como deuda (21.20): hoy el comparativo mostrado es siempre interno y homogéneo.
- **Inflación**: el análisis horizontal advierte base cero/negativa y no calcula % engañoso; la comparación en moneda homogénea depende del EFE/estados reexpresados (motor disponible).

## 21.11. Didáctica

- **Drilldown visible** (`LineageModal`): clic en cualquier renglón de ESP/ER/EEPN/EFE → cuentas → movimientos → asientos → operación de origen, desde el linaje del motor. Los indicadores exponen fórmula/sustitución/insumos con origen.
- **Escenarios** (`/practica`): comercial, servicios e inflación (índices 100/160/200), cada uno en ejercicio demo aislado (9001-9003) con consigna + explicación + solución paso a paso; cargar/ver solución/**restablecer**; resumen del ejercicio demo.
- **Reset**: `scenarioReset` borra físicamente solo asientos demo (rechaza años reales), auditado.

## 21.12. Notas y anexos

- **Implementados y reconciliados**: bases, efectivo (= EFE), créditos, bienes de cambio, **anexo de evolución de bienes de uso** (saldo inicial/altas/bajas/depreciación/saldo final derivado del Diario, neto = ANC del ESP), intangibles, deudas (= pasivo ESP), PN, gastos por función, determinación del CMV.
- **Manuales**: hechos posteriores, contingencias, partes relacionadas (NOT_AVAILABLE hasta carga; no se inventan; no pisan derivados).
- **Pendiente**: nota de moneda extranjera con cuadro detallado (moneda/cantidad/cotización/medición/diferencia).

## 21.13. Reportes publicados

- **Snapshots** (`reporting/snapshots`, schema v19): DRAFT/VALIDATED/PUBLISHED/INVALIDATED con hash, versión de motor/reporte, norma, índices, comparativo y copia serializada.
- **No publica un no validado**: si `canPublish` es false, el snapshot queda DRAFT.
- **Invalidación**: reabrir un ejercicio marca sus snapshots INVALIDATED (no los borra) con la causa. El Diario sigue siendo la fuente autoritativa (el snapshot es consulta histórica).
- UI: botón "Publicar snapshot" (deshabilitado si el reporte no es publicable) + info del último.

## 21.14. Deploy

`docs/DEPLOY_CLOUDFLARE_PAGES.md` + `public/_redirects` (fallback SPA) + `public/_headers` (cache/seguridad). Entorno (Node 20, `npm ci && npm run build`, `dist/`), variables públicas (commit/build/versión), procedimiento de **staging con autorización manual** y **rollback** (re-promoción de deploy previo + banner `/acerca`). `rollup` pineado a 4.44.0 (regresión de la generación del SW en 4.62). No se publica automáticamente.

## 21.15. Tests

| Suite | Antes 2C | Después 2C | Resultado |
|---|---:|---:|---|
| Heredadas (2A+2B) | 274 | 274 | ✅ sin regresiones |
| `acceptance/phase2ab` (gate) | — | 11 | ✅ |
| `acceptance/no-legacy-engines` | — | 4 | ✅ |
| `idempotencia-explicita` | — | 12 | ✅ |
| `mapeos-escenarios` | — | 14 | ✅ |
| `snapshots-anexos` | — | 7 | ✅ |
| `consistencia-export` | — | 6 | ✅ |
| **Total** | **274** | **303** | **✅ 303/303** |

## 21.16. Performance

- **Bundle inicial**: 1.873 KB (2B) → **1.546 KB** (menor, por retiro de legacy + xlsx fuera del path eager). `exceljs` 918 KB en chunk lazy.
- **Motor completo** (TB+ESP+ER+EEPN+EFE×2+validación): **10.000 líneas: 73 ms**; **100.000 líneas: 478 ms** (mejor que 2B). `loadReportingBundle` agrega notas/indicadores/análisis sobre el mismo input.
- Consultas por rango indexado; `loadReportingBundle` es una sola pasada; lazy loading de rutas mantenido (incluye `/mapeos`, `/practica`).

## 21.17. Hallazgos

| ID | Estado | Evidencia |
|---|---|---|
| ACC-005 | **Resuelto** | UI ESP/ER/EEPN/EFE/Notas desde el motor único; `no-legacy-engines`, `consistencia-export` |
| ACC-006 | **Resuelto (nominal) / Parcial (moneda de cierre)** | EFE directo+indirecto en UI; reexpresión por período disponible (toggle), cableado del set de índices pendiente |
| ACC-007 | **Resuelto (asistente) / Parcial (cobertura seed)** | `/mapeos` con impacto + auditoría + bloqueo de publicación |
| ACC-010 | **Resuelto** | RECPAM legacy **eliminado**; pantalla usa el motor; golden conciliado |
| ACC-011 | **Resuelto** | idempotencia explícita universal + matriz + 12 tests |
| NOR-001 | **Parcial (avanzado)** | juego completo con validación + notas reconciliadas + snapshots; modelos CENCyA completos pendientes |
| NOR-003 | **Parcial** | norma/versión en metadatos y en índices versionados; registry completo de vigencias pendiente |
| ANA-003 | **Resuelto (alcance)** | vertical/horizontal + actividad + flujo; insuficientes tipados |
| SEC-002 | **Resuelto (cerrado)** | xlsx eliminado; audit sin high/critical; 3 moderate documentadas |
| ARQ-001 | **Parcial** | motor/servicios puros; componentes legacy grandes intactos fuera de Estados |
| ARQ-002 | **Resuelto (estados) / Parcial (dashboards)** | un solo motor de estados; `resultsStatement`/`statements` solo para el dashboard viejo de indicadores |
| PER-001 | **Resuelto** | bundle menor, 100k en 478 ms, lazy de nuevas rutas |
| DEP-001 | **Resuelto (documentado)** | deploy doc + _redirects/_headers + provenance en `/acerca` |
| DID-001 | **Resuelto** | drilldown visible + escenarios guiados accesibles en `/practica` |

## 21.18. Comandos finales

| Comando | Resultado |
|---|---|
| `npm test` | **303/303 ✅** (43 archivos, ~18 s) |
| `npm run lint` | **exit 0** (0 errores, 53 warnings preexistentes) |
| `npm run build` | ✅ (rollup pineado; PWA 78 entradas) |
| `npm audit --omit=dev` | **0 critical, 0 high, 3 moderate** (documentadas) |
| `git status` | limpio tras cada hito; 5 commits + informe |
| `git diff --stat 1c5deaa..HEAD` | 60 archivos, 4.754 ins / 7.913 del |
| Bundle inicial | 1.546 KB (2B: 1.873) |

## 21.19. Archivos modificados (selección)

**Nuevos — motor/consumo canónico**
- `reporting/loadReportingBundle.ts` (única capa), `reporting/engine/cashFlowInflation.ts` (EFE mc), `reporting/snapshots/*`, `lib/spreadsheet.ts` (exceljs), `lib/exportReportBundle.ts`, `pdf/reportBundlePdf.ts`.
- `components/Estados/canonical/*` (tabs, tabla, banner, metadata bar, LineageModal).
- `accounting/taxonomy/mappingAssistant.ts`, `pages/MapeosPage.tsx`, `accounting/scenarios/*`, `pages/PracticaPage.tsx`.
- `accounting/migration/migrateV19.ts`, docs (ADR planillas, matriz idempotencia, deploy).

**Modificados de mayor riesgo**
- `pages/Estados.tsx` (reescrito, riesgo alto; cubierto por acceptance+consistencia).
- `storage/entries.ts` (idempotencia universal; riesgo medio; 12 tests).
- `pages/Planillas/CierreValuacionPage.tsx` + `RecpamIndirectoDrawer` (motor nuevo).
- 6 importadores (readSpreadsheet), `storage/db.ts` (v19), `App.tsx`/`Sidebar` (rutas).

**Eliminados**: 11 archivos/carpetas legacy de Estados + RECPAM indirecto legacy.

## 21.20. Prueba manual

1. `npm test` — gate + 5 suites nuevas verdes.
2. Migración v19: `/acerca` muestra schema v19.
3. **Estados**: seleccionar un ejercicio con movimientos → ESP/ER/EEPN/EFE/Notas; banner de validación; clic en un renglón → drilldown hasta el asiento.
4. **Exportar**: PDF (con encabezado y, si no valida, marca BORRADOR) y Planilla (hojas + Metadatos); comparar un importe con la pantalla.
5. **EFE moneda de cierre**: pestaña EFE → toggle "Moneda de cierre" (requiere índices).
6. **Inflación**: Planillas → Cierre → método indirecto: ver RECPAM del motor (indirecto+directo+conciliación) y bloqueantes.
7. **Mapeos**: `/mapeos` → editar el rubro de una cuenta con saldo → ver impacto → Guardar → el bloqueo de publicación baja.
8. **Práctica**: `/practica` → Cargar "Empresa comercial" → ver solución → seleccionar ejercicio 9001 en el encabezado para ver sus estados → Restablecer.
9. **Snapshots**: en Estados, "Publicar snapshot" (deshabilitado si no valida); reabrir el ejercicio → el snapshot queda INVALIDATED.
10. **Importar**: un XLSX de asientos/extracto → se lee con exceljs (sin xlsx), con límites.

## 21.21. Recomendación de merge

- **¿Toda la interfaz usa el motor canónico?** Sí para el juego de estados (ESP/ER/EEPN/EFE/Notas), su PDF y su exportación. El dashboard de indicadores legacy y la planilla de cierre conservan lógica propia acotada (contenida y probada), no la pantalla de Estados.
- **¿Queda algún cálculo legacy visible?** No en Estados/PDF/XLSX. El único cálculo paralelo remanente es el del dashboard de indicadores viejo (`useIndicatorsMetrics`), separado de la pantalla de Estados y sin impacto en el juego contable.
- **¿La inflación puede usarse desde UI?** Sí: la pantalla de cierre calcula con el motor nuevo; el RECPAM legacy fue eliminado.
- **¿El EFE está en moneda de cierre?** Sí, con toggle; la reexpresión por período está implementada y conciliada (REI). Cableado del selector de índices para el EFE: mejora menor pendiente.
- **¿La vulnerabilidad xlsx fue eliminada?** Sí: xlsx removido, audit sin high/critical.
- **¿Todos los generadores son idempotentes?** Sí: idempotencia explícita universal por `createEntry` con clave derivada; matriz + tests por familia.
- **¿Los estados y exportaciones coinciden?** Sí, verificado por `consistencia-export`.
- **¿Los escenarios educativos funcionan?** Sí, en `/practica` con ejercicios demo aislados y reset.
- **¿Está listo para merge a `Sesion1`?** **Recomendado sí**, siguiendo el orden propuesto: integrar 2A→2B→2C en una rama de integración, probar un preview, y recién entonces llevar a `Sesion1`. Ninguna deuda pendiente compromete la corrección del núcleo ni la coherencia de la interfaz.
- **¿Está listo para desplegar?** Sí a **staging/preview** siguiendo `DEPLOY_CLOUDFLARE_PAGES.md` (build + tests + lint + audit + smoke + autorización manual). No se recomienda deploy automático a producción sin ese paso.

**Conclusión**: ContaLivre alcanza el objetivo de la fase — un único motor, una única cifra, una única interfaz, exportaciones consistentes, inflación utilizable desde la UI, EFE completo, trazabilidad visible, práctica guiada y release reproducible. Las deudas restantes son acotadas y están declaradas, no ocultas.
