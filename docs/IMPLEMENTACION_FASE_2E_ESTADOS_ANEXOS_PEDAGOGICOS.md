# IMPLEMENTACIÓN FASE 2E — ESTADOS Y ANEXOS PEDAGÓGICOS

**EEPN matricial · EFE explicativo · notas cuantitativas · gastos por función · determinación del CMV · ER completo · exportación formal**

Fecha: 2026-07-19 · Rama: `refactor/fase-2e-estados-anexos-pedagogicos` · Base: `refactor/fase-2d-ui-estados-config-reset` @ `98fb9ab`

---

## 21.1. Resumen ejecutivo

**Objetivo.** Mejorar la comprensión visual y pedagógica de los estados y anexos que necesitan cuadros de doble entrada, conciliaciones y composiciones, sin reconstruir el motor: todo sigue saliendo de `loadReportingBundle` / `buildStatements`.

**Cambios principales.**

1. **ER completo**: resultado antes del impuesto como subtotal explícito, impuesto a las ganancias SOLO por mapping estructural (`statementGroup: 'INCOME_TAX'`) con estados `CALCULATED / NOT_APPLICABLE / INSUFFICIENT_INFORMATION` (nunca $0 fingido), resultado de operaciones que continúan (discontinuadas: capability sin soporte).
2. **EEPN matricial de doble entrada**: columnas dinámicas por componente del PN (mapping `equityComponent` + derivación estructural), filas conceptuales con clasificación estructural de movimientos, transferencias internas que suman 0, vista matricial por defecto con toggle a la resumida, vista móvil por movimiento.
3. **EFE pedagógico**: subcategorías operativas estructurales finas (IG, intereses, personal, gastos, otros ingresos), inversión/financiación por cuenta, método indirecto con ajustes descompuestos por cuenta y explicación de por qué cada uno suma o resta, ecuación visual, tarjetas por actividad, modos Resumen/Detalle.
4. **Notas cuantitativas**: composición cuenta por cuenta con regularizadoras en negativo, comparativo, variación, reconciliación por dos caminos de agregación, numeración y referencia cruzada clickeable (badge "Nota X" en ESP/ER → abre y enfoca la nota).
5. **Anexo de gastos por función**: matriz cuenta × función desde `resultFunction`/derivación estructural + reglas versionadas de distribución (`expenseAllocationRules`, schema v20) con suma exacta 100 % en centavos; unmapped expuesto y bloqueante.
6. **Determinación del CMV**: puente EI + compras − EF = CMV verificado contra el ER y el ESP; diferencias expuestas sin línea balanceante; alcances comercial/servicios/no aplicable.
7. **Anexos de bienes de uso** (por clase estructural, VO + depreciaciones + residual conciliado con el ESP) y **moneda extranjera** (metadata estructural; cantidad/cotización como información insuficiente, sin fuentes automáticas).
8. **Exportación formal**: EEPN matricial en A4 apaisado, EFE directo/indirecto/ambos, notas numeradas con comparativo, cuatro anexos; planilla con las mismas hojas; UI = bundle = PDF = planilla verificado por tests.
9. **Limpieza de UI**: subtítulo nuevo, identificadores técnicos en popover "Detalles técnicos", "Guardar versión validada", chip compacto "✓ Estados conciliados", tabular-nums sin fuente mono.

**Estado.** 388/388 tests, lint 0 errores, build OK, árbol limpio. Listo para preview.

**Riesgos pendientes.** Ver §21.18 (editor visual de reglas de distribución, AREA sin metadata estructural, capturas manuales).

---

## 21.2. Base y Git

| Ítem | Valor |
|---|---|
| Rama base | `refactor/fase-2d-ui-estados-config-reset` |
| Commit base | `98fb9ab` (Fase 2D hito 10) — árbol limpio |
| Rama de trabajo | `refactor/fase-2e-estados-anexos-pedagogicos` |
| Node / npm | v25.9.0 / 11.12.1 |
| Schema Dexie | v19 → **v20** (`expenseAllocationRules`) |
| Versión app | 0.1.0 (package) / 0.3.0 (APP_VERSION runtime) |
| Merge automático | NO realizado |

**Commits por hito** (uno por hito, sin agrupación):

| Hito | Commit | Contenido |
|---|---|---|
| 1 | `52c75a9` | Gate de regresión 2A–2D + limpieza de presentadores muertos |
| 2 | `2c68c1f` | ER completo (antes de impuesto, IG estructural) |
| 3 | `3386e22` | EEPN matricial de doble entrada |
| 4 | `0517d3e` | EFE pedagógico y explicativo |
| 5 | `980c9a2` | Notas cuantitativas como composición de rubros |
| 6 | `118b36f` | Anexo de gastos por función con reglas versionadas |
| 7 | `3ea5106` | Determinación del costo de ventas (puente del CMV) |
| 8 | `5f95e2a` | Anexos de bienes de uso y moneda extranjera |
| 9 | `6578ccd` | Exportación formal (EEPN matriz, EFE ambos, anexos) |
| 10 | `750d3bd` | Limpieza de cabecera, terminología y validación compacta |
| 11 | (este commit) | Validación final e informe |

Diff acumulado: 59 archivos, ~5.400 inserciones (neto; incluye ~5.100 borrados de presentadores legacy muertos).

---

## 21.3. Gate anterior (2A–2D)

Suite: `tests/acceptance/phase2e-baseline.acceptance.test.ts` (13 pruebas), ejecutada **antes y después** de la implementación.

| Afirmación | Verificada | Evidencia | Divergencia |
|---|---|---|---|
| Único escritor del Diario | ✅ | gate + `phase2a.acceptance` (escrituras fuera del repositorio) | — |
| Borradores fuera de libros | ✅ | gate: draft no afecta totalAssets | — |
| POSTED inmutable | ✅ | gate: update/delete → PostingError | — |
| Reversión enlazada | ✅ | gate: REVERSED con contenido intacto, neto 0 | — |
| Ejercicios aislados | ✅ | gate: cierre 2025 no contamina 2026 | — |
| Cierre y apertura | ✅ | gate: PN heredado sin duplicar resultado | — |
| Diario = Mayor = Balance | ✅ | checks `journal-balance`, `ledger-journal` | — |
| Activo = Pasivo + PN | ✅ | check `equation` | — |
| ER = resultado del EEPN | ✅ | check `er-eepn` | — |
| Cierre EEPN = PN del ESP | ✅ | check `eepn-esp` | — |
| EFE directo = indirecto | ✅ | check `efe-metodos` | — |
| Efectivo final EFE = ESP | ✅ | check `efe-esp` | — |
| Variación EFE = cierre − inicio | ✅ | check `efe-variacion` | — |
| Estados usa loadReportingBundle | ✅ | verificación estática de imports | — |
| Exportaciones usan el mismo bundle | ✅ | estática: sin `storage/db` en pdf/lib export | — |
| Componentes nuevos sin motores legacy | ✅ | estática sobre todo `components/Estados` | — |
| Indicadores canónicos | ✅ | estática + `indicators-canonical` | — |
| Reset y backup operativos | ✅ | gate: exportBackup + paneles presentes | — |
| /practica fuera de la interfaz | ✅ | estática + `no-practica-ui` | — |
| No reaparecen componentes eliminados | ✅ | estática: sin xlsx, sin RECPAM legacy | ⚠ ver abajo |

**Divergencia detectada y corregida en el hito 1**: quedaban en el árbol 5 presentadores legacy MUERTOS de antes de la Fase 2D (`FlujoEfectivoTab`, `EvolucionPNTab`, `NotasAnexosTab`, `EstadoSituacionPatrimonialGemini`, `DocumentToolbar`); uno consultaba Dexie directamente. Ninguno estaba referenciado desde la app. Se eliminaron y el gate ahora lo impide a futuro (verificación de `storage/db` sobre toda la carpeta Estados).

---

## 21.4. Estado de Resultados

- **Estructura** (`IncomeStatement2B`): ventas → CMV → bruto → gastos adm. → gastos com. → operativo → financieros y por tenencia (RECPAM identificable en su composición/nota) → otros → **resultado antes del impuesto** → **impuesto a las ganancias** → **resultado de operaciones que continúan** → resultado del ejercicio. Operaciones discontinuadas: capability NOT_SUPPORTED declarada (neto = continuadas).
- **Impuesto**: nuevo `StatementGroup 'INCOME_TAX'` (models + taxonomía monetaria + MapeosPanel + cuenta semilla 4.9.01). Estados: `CALCULATED` (hay cuentas mapeadas; $0 legítimo si no se devengó), `NOT_APPLICABLE` (sin actividad de resultados), `INSUFFICIENT_INFORMATION` (actividad sin mapping — la vista y las exportaciones muestran el texto, **jamás $0,00 calculado**). Sin inferencias por nombre: hay test con cuenta trampa "Provisión impuesto ganancias IG" mapeada a OTHER_EXPENSES que va a Otros.
- **Subtotales/mappings**: `er:antes-impuesto`, `er:impuesto`, `er:continuadas` con linaje completo.
- **Invariantes**: check nuevo `er-pretax` (antes del impuesto − IG = neto) + `er-eepn` preservado.
- **Pruebas**: `tests/reporting/incomeStatement2e.test.ts` (6).

## 21.5. EEPN

- **Matriz** (`engine/equityMatrix.ts`, `EquityMatrixViewModel` en `StatementsBundle.equityMatrix`): derivada SOLO de asientos + aperturas + taxonomía + ER canónico.
- **Columnas dinámicas** por `equityComponent` (mapping explícito en Account; derivación de respaldo CAPITAL→CAPITAL, RESERVES→OTHER_RESERVE, RETAINED_EARNINGS→PRIOR_RETAINED_EARNINGS; nunca por nombre), agrupadas en Aportes de los propietarios / Ganancias reservadas / Resultados no asignados / Resultados diferidos (solo si hay datos) / Otros. Nada hardcodeado al ejemplo del profesor.
- **Filas**: saldos al inicio (incluye apertura formal), AREA (fila conceptual; sin metadata estructural queda vacía y oculta en modo compacto), saldo inicial ajustado, separador "Variaciones del ejercicio", aportes, retiros, distribuciones, constitución/desafectación de reservas, capitalizaciones, absorción de pérdidas, resultado del ejercicio, otros, total de variaciones, saldos al cierre. Clasificación ESTRUCTURAL por componente/sentido/contrapartida; transferencias internas del PN suman 0 en la fila (ese es el punto pedagógico).
- **Responsive**: escritorio con encabezados agrupados sticky y primera columna fija; móvil (<768px) con selector de movimiento + tarjeta de impactos por componente + total + trazabilidad.
- **Filtros**: "Solo movimientos" (default) / "Estructura completa" (guiones, no ceros).
- **Invariantes** (§6.8): fila = Σ columnas; inicio ajustado + variaciones = cierre (por columna); cierre matriz = cierre EEPN (= PN del ESP, ya verificado); resultado matriz = ER. Checks `eepn-matrix-closing` y `eepn-matrix-internal` en la validación global.
- **Pruebas**: `tests/reporting/equityMatrix2e.test.ts` (7). Capturas: pendiente manual (§21.17).

## 21.6. EFE

- **Directo**: subcategorías estructurales por `statementGroup` de la contrapartida — cobros de clientes, cobros por otros ingresos operativos, pagos a proveedores de bienes y servicios, pagos al personal y cargas, pagos de gastos de adm./com., pagos de IG, pagos/cobros de otros impuestos, intereses cobrados/pagados, otros. Filas sin datos NO existen (nada ficticio). Inversión y financiación con detalle por cuenta.
- **Indirecto**: resultado → ajustes sin efecto en el efectivo **descompuestos por cuenta** (p. ej. depreciación) → Δ activos operativos por cuenta (aumento resta) → Δ pasivos operativos por cuenta (aumento suma); cada renglón con explicación pedagógica de por qué suma o resta (p. ej. "la depreciación redujo el resultado, pero no produjo una salida de efectivo, por eso se suma").
- **Nominal/cierre**: toggles conservados; la reexpresión comparte las mismas subcategorías; REI visible como línea de conciliación; bloqueo si falta índice (sin coeficiente 1 implícito).
- **Diseño**: cabecera inicial → variación → final + **ecuación visual** (operativo + inversión + financiación [+ sin clasificar] [+ REI] = variación); tarjetas por actividad desplegables con participación y drilldown; modo Resumen/Detalle.
- **Conciliaciones**: `efe-metodos`, `efe-esp`, `efe-variacion` intactas (los totales no cambiaron; solo se descompusieron).
- **Pruebas**: `tests/reporting/cashFlow2e.test.ts` (6) + golden 2B actualizado a las etiquetas 2E.

## 21.7. Notas

- `buildNotes` reescrito: notas **numeradas** con composición cuenta por cuenta, comparativo por línea y por total, variación calculable, reconciliación contra lo que el ESP expone para las mismas cuentas (dos caminos de agregación) y `noteRef` estampado en las líneas del ESP/ER.
- **Regularizadoras en negativo** con marca "(regularizadora)": Deudores 350 / Previsión (200) / neto 150 — nunca escondidas en el neto.
- **Notas mínimas** (§8.2): bases, efectivo (reconcilia con EFE y ESP), inversiones, créditos por ventas, otros créditos, bienes de cambio, bienes de uso, intangibles, deudas comerciales, préstamos, remuneraciones y cargas, cargas fiscales, otras deudas, PN, resultados financieros y por tenencia (composición del renglón del ER), y manuales (hechos posteriores, contingencias, partes relacionadas) como NOT_AVAILABLE. Sin saldos ⇒ NOT_APPLICABLE con total nulo.
- **Referencias cruzadas**: badge "Nota X" clickeable en ESP/ER → navega a Notas, expande y hace scroll a la nota; desde la nota, clic en cuenta → linaje.
- **Narrativa separada**: política contable (texto), composición (tabla), origen por línea (manual/no disponible/no aplicable); lo manual jamás modifica totales derivados.
- **UI**: subtabs [Notas · Gastos por función · Costo de ventas · Bienes de uso · Moneda extranjera] con deshabilitado real por datos; tarjetas colapsadas con número, actual, comparativo, variación y estado de reconciliación.
- **Pruebas**: `tests/reporting/notes2e.test.ts` (6) + `notas-linaje` y `snapshots-anexos` actualizados.

## 21.8. Gastos por función

- **Matriz** (`engine/expensesByFunction.ts`): cuenta × función desde `resultFunction` explícito (tipado `ResultFunction`) o derivación estructural (ADMIN_EXPENSES→ADMINISTRATION, SELLING→SELLING, FINANCIAL_EXPENSES→FINANCIAL, OTHER_EXPENSES→OTHER). **COGS e INCOME_TAX excluidos** (no duplican CMV ni IG). Sin inferencia por nombre.
- **Reglas de asignación**: `ExpenseAllocationRule` versionada (validFrom/validTo, allocations, reason, createdBy, versión) en la tabla Dexie v20 `expenseAllocationRules`, cargada por el loader e incluida en el backup automáticamente. Reparto en centavos exactos (residuo al mayor porcentaje); suma ≠ 100 % ⇒ regla inválida reportada y la cuenta cae a su derivación (jamás reparto silencioso). La asignación es de exposición: los asientos históricos no se tocan.
- **Conciliación**: `gastos-fn-er` (total del anexo = gastos expuestos en el ER por otro camino) y `gastos-fn-unmapped`; check consolidado `gastos-funcion` bloquea la publicación si hay gastos sin función o reglas inválidas.
- **Cuentas sin mapping**: panel de advertencia con importes y guía a Configuración; fila por cuenta en la exportación marcada "(SIN FUNCIÓN)".
- **UI**: sticky headers y cuenta fija, totales por fila/columna con porcentajes, filtros por función y por cuenta, comparativo, badge % para cuentas distribuidas por regla, drilldown. Colores suaves (nada de amarillo Excel).
- **Configuración**: columna "Función gasto" en MapeosPanel (solo EXPENSE) con impacto descripto antes de guardar y auditoría existente (valor anterior/nuevo, actor, fecha, motivo, metadataVersion).
- **Pruebas**: `tests/reporting/expensesByFunction2e.test.ts` (6).

## 21.9. Costo de ventas

- **Fórmula** (`engine/costOfSales.ts`): EI + compras y costos incorporables = bienes disponibles − EF = CMV, derivada de las cuentas INVENTORIES y los flujos reales (la apertura formal integra la EI). Costos incorporables: sin categoría estructural separada ⇒ integran la línea de compras y la línea propia se declara NOT_APPLICABLE con explicación (no un cero fingido).
- **Datos**: cada componente con importe, estado, cuentas, comparativo y linaje.
- **Conciliación**: `cmv-er` (puente = CMV del ER; una baja de inventario contra otras cuentas **expone la diferencia con detalle y bloquea**, sin línea balanceante) y `cmv-ef-esp` (EF = bienes de cambio del ESP). Check consolidado `cmv-puente`.
- **Alcances**: COMMERCIAL (puente completo), SERVICES (costo según ER, sin existencias forzadas), NOT_APPLICABLE; industrial declarado sin soporte estructural (no se fingen MP/PP/PT).
- **UI**: puente visual de tarjetas encadenadas con operadores, subtotal intermedio, resultado destacado, estado de conciliación, comparativo y drilldown.
- **Pruebas**: `tests/reporting/costOfSales2e.test.ts` (6).

## 21.10. Otros anexos

- **Bienes de uso** (`engine/fixedAssetsAnnex.ts`): cuadro por clase estructural (`annexGroup`; sin mapping ⇒ "Sin clase asignada" con advertencia, jamás inferencia por nombre) con VO inicial/altas/bajas/final, dep. acumulada inicial/del ejercicio/bajas/final y valor residual; totales; comparativo por clase; invariante `ppe-anexo` (residual = Bienes de uso netos del ESP). Reexpresión: sin columna propia (la expresión del juego es nominal; el ajuste integral se expone por separado — documentado).
- **Moneda extranjera** (`engine/foreignCurrency.ts`): cuentas con `currency` estructural ≠ ARS; tipo de partida, clasificación monetaria, medición contable y comparativo; **cantidad y cotización = Información insuficiente** (sin datos estructurados); nota explícita de que no se usa DolarAPI ni cotizaciones automáticas sin fuente/fecha. Subtab oculto sin datos.
- **Pendientes**: ver §21.18.
- **Pruebas**: `tests/reporting/annexes2e.test.ts` (5).

## 21.11. Exportación

- **PDF formal** (`pdf/reportBundlePdfFormal.ts`): ER con secuencia completa (impuesto como texto de estado cuando no está calculado); **EEPN matricial en página A4 apaisada** con encabezados agrupados en dos filas, subtotales y comparativo; EFE por método elegido incl. "Ambos"; notas numeradas con comparativo; anexos de gastos, CMV, bienes de uso y moneda extranjera como tablas sobrias; pie con motor/versión/estado, leyenda de notas, paginación y marca BORRADOR por dimensiones de cada página.
- **Planilla** (`lib/exportReportBundle.ts`): hoja EEPN matricial + "EEPN resumen"; EFE por método(s); hojas nuevas Gastos por función, Costo de ventas, Bienes de uso, Moneda extranjera; notas numeradas con comparativo; **ninguna celda recalcula** (valores tomados del bundle).
- **Modal**: contenido "Anexos" y pill "Ambos".
- **Consistencia UI = view model = bundle = PDF = planilla**: verificada por `tests/reporting/export2e.test.ts` (7) + `consistencia-export` + `export-options` para antes de impuesto, impuesto, resultado final, total PN (matriz), flujos, notas, gastos, CMV y bienes de uso.

## 21.12. UI/UX

- Cabecera: "4 estados contables básicos e información complementaria"; identificadores técnicos (app, motor, schema, hash de reporte, commit, build) en popover **"Detalles técnicos"** (cierre por clic afuera/Escape); **"Guardar versión validada"** en lugar de "Publicar snapshot" (snapshot solo interno).
- Validación: con todo verde, chip compacto **"✓ Estados conciliados"** que despliega el detalle de invariantes al clic; banner grande solo con errores/bloqueantes (detalle abierto).
- Números: `font-variant-numeric: tabular-nums` en todos los importes; fuentes monoespaciadas eliminadas de importes (permanecen solo en fórmulas de indicadores, que son código).
- Responsive: EEPN con matriz sticky en escritorio y vista por movimiento en móvil; gastos y bienes de uso con scroll interno propio; EFE con tarjetas apiladas y toggles legibles; notas como tarjetas.
- Accesibilidad: `role=tablist/tab`, `scope` en encabezados de tablas, `aria-expanded`/`aria-controls` en desplegables, foco visible, Escape en modales/popovers, `prefers-reduced-motion` respetado, celdas activables por teclado (Enter/Espacio).

## 21.13. Tests

| Suite | Antes | Después | Resultado |
|---|---|---|---|
| Total del repositorio | 317 (47 archivos) | **388 (58 archivos)** | ✅ verde |
| `phase2e-baseline.acceptance` (gate) | — | 13 | ✅ |
| `phase2e-ui.acceptance` | — | 9 | ✅ |
| `incomeStatement2e` | — | 6 | ✅ |
| `equityMatrix2e` | — | 7 | ✅ |
| `cashFlow2e` | — | 6 | ✅ |
| `notes2e` | — | 6 | ✅ |
| `expensesByFunction2e` | — | 6 | ✅ |
| `costOfSales2e` | — | 6 | ✅ |
| `annexes2e` | — | 5 | ✅ |
| `export2e` | — | 7 | ✅ |
| Actualizados (misma semántica, ids/etiquetas 2E) | `reporting-engine` (subcategorías), `notas-linaje`, `snapshots-anexos`, `consistencia-export`, `export-options` | | ✅ |

## 21.14. Rendimiento

- Bundle: chunk `Estados` 63,3 kB → 126,8 kB (nuevas vistas matriciales/anexos); `index` 1.609 kB → 1.633 kB (motor + view models); dist total 7,4 MB con PWA precache. El warning de chunks >500 kB es preexistente (2C) y no empeora su causa (exceljs/jspdf ya estaban laz-loaded).
- Matrices: construcción O(asientos × líneas) en un pase por view model, aritmética íntegra en centavos enteros; sin recomputación en React (los view models llegan calculados).
- 10k/100k asientos: no se midió en esta fase (sin cambios de complejidad asintótica sobre 2C; el motor sigue siendo un pase lineal por asiento). Queda como deuda futura una medición formal (§21.18).
- Exportaciones: jsPDF/exceljs siguen bajo demanda (dynamic import).

## 21.15. Seguridad

- `npm audit --omit=dev`: **3 moderate** preexistentes (exceljs → uuid vulnerable), sin cambios; sin vulnerabilidades nuevas ni dependencias agregadas (la fase no suma ninguna dependencia).
- Importación/exportación: el backup incluye la tabla nueva automáticamente (itera `db.tables`); la restauración filtra por tablas conocidas como antes.

## 21.16. Archivos

**Creados** (riesgo bajo = puro/testeado):

| Archivo | Rol | Test |
|---|---|---|
| `src/reporting/engine/equityMatrix.ts` | Motor EEPN matricial | equityMatrix2e |
| `src/reporting/engine/expensesByFunction.ts` | Motor anexo de gastos | expensesByFunction2e |
| `src/reporting/engine/costOfSales.ts` | Motor puente CMV | costOfSales2e |
| `src/reporting/engine/fixedAssetsAnnex.ts` | Motor anexo bienes de uso | annexes2e |
| `src/reporting/engine/foreignCurrency.ts` | Motor moneda extranjera | annexes2e |
| `src/accounting/migration/migrateV20.ts` | Migración schema v20 | migration (upgrade chain) |
| `src/components/Estados/canonical/EquityMatrixView.tsx` | Vista matriz EEPN | phase2e-ui (arquitectura) |
| `src/components/Estados/canonical/ExpensesByFunctionView.tsx` | Vista gastos | phase2e-ui |
| `src/components/Estados/canonical/CostOfSalesBridgeView.tsx` | Vista puente CMV | phase2e-ui |
| `src/components/Estados/canonical/FixedAssetsAnnexView.tsx` | Vista bienes de uso | phase2e-ui |
| `src/components/Estados/canonical/ForeignCurrencyView.tsx` | Vista moneda extranjera | phase2e-ui |
| `src/components/Estados/canonical/NotesAndAnnexesTab.tsx` | Pestaña notas + subtabs | phase2e-ui |
| `tests/…` (9 suites nuevas) | ver §21.13 | — |

**Modificados** (principales): `core/models.ts` (INCOME_TAX, EquityComponent, EquityMovementType, ResultFunction, ExpenseAllocationRule), `reporting/domain/types.ts`, `engine/buildStatements.ts`, `engine/buildCashFlow.ts`, `engine/cashFlowInflation.ts`, `engine/buildNotes.ts`, `reporting/loadStatements.ts`, `storage/db.ts` (v20), `storage/seed.ts` (4.9 IG), `accounting/migration/versions.ts`, `accounting/taxonomy/taxonomy.ts`, `accounting/taxonomy/mappingAssistant.ts`, `components/Estados/canonical/*` (CanonicalTabs, StatementView, statementFormat, ValidationBanner, ReportMetadataBar, FlujoEfectivoCanonicalTab), `components/Estados/EstadosHeader.tsx`, `components/Estados/ExportEstadosModal.tsx`, `components/Configuracion/panels/MapeosPanel.tsx`, `components/Indicators/IndicatorsDashboard.tsx`, `pages/Estados.tsx`, `pdf/reportBundlePdfFormal.ts`, `lib/exportReportBundle.ts`, `lib/exportOptions.ts`.

**Eliminados** (muertos, hito 1): `FlujoEfectivoTab.tsx`, `EvolucionPNTab.tsx`, `NotasAnexosTab.tsx`, `EstadoSituacionPatrimonialGemini.tsx`, `DocumentToolbar.tsx`.

## 21.17. Capturas

⚠ **Pendiente de validación manual con navegador** (este entorno de implementación no ejecuta la app con datos): ER, EEPN escritorio y móvil (390×844), EFE directo/indirecto, Notas, Gastos, CMV, PDF y planilla. Guion de validación manual sugerido (§18 del prompt): cargar caso comercial → ER (antes de impuesto e IG) → EEPN matriz (columnas, celda, linaje, vista resumida) → EFE directo (expandir operativas) → EFE indirecto (leer por qué suma/resta) → nominal/cierre → Notas (efectivo; créditos y previsión) → Anexo de gastos (distribución) → CMV (puente) → Bienes de uso → exportar PDF y planilla → comparar importes → móvil.

## 21.18. Deuda pendiente

**Bloqueante**: ninguna conocida.

**Importante**:
- Capturas y validación manual en navegador (§21.17) antes del merge.
- Editor visual de reglas de distribución de gastos (la tabla, el motor, la validación y la exposición existen; hoy una regla se crea por datos/servicio, no por UI dedicada — el mapping 100 % a una función sí tiene UI en MapeosPanel).

**Futura**:
- Metadata estructural para AREA (`equityMovementType` persistido por asiento) para poblar la fila "Modificaciones de ejercicios anteriores"; hoy los ajustes van a "Otros movimientos".
- Categoría estructural para costos incorporables separados de compras.
- Cantidades y cotizaciones por cuenta en moneda extranjera (con fuente y fecha).
- Medición formal de rendimiento con 10k/100k asientos.
- Notas manuales editables (hechos posteriores/contingencias) con persistencia.

**Fuera de alcance** (declarado): actividad industrial (MP/PP/PT), operaciones discontinuadas, reexpresión por columna en el anexo de bienes de uso.

## 21.19. Recomendación

| Pregunta | Respuesta |
|---|---|
| ¿El EEPN es comprensible para un estudiante? | Sí: matriz de doble entrada con columnas por componente, transferencias internas que suman 0 a la vista, tooltips por fila/columna y drilldown a asientos. |
| ¿El EFE explica cómo se forma? | Sí: ecuación visual, subcategorías reales, y cada ajuste del indirecto dice por qué suma o resta con su detalle por cuenta. |
| ¿Las notas muestran composiciones reales? | Sí: cuenta por cuenta, regularizadoras en negativo, comparativo y reconciliación verificada por dos caminos. |
| ¿El anexo de gastos concilia? | Sí (check `gastos-funcion`); los gastos sin función se exponen y bloquean. |
| ¿El CMV concilia? | Sí (checks `cmv-er`, `cmv-ef-esp`); las diferencias reales se exponen sin plug. |
| ¿El ER muestra el resultado antes del impuesto? | Sí, con IG estructural y estados honestos (nunca $0 fingido). |
| ¿Toda cifra sigue saliendo del motor canónico? | Sí: view models construidos dentro de `buildStatements`; presentadores puros sin Dexie (verificado por tests estáticos). |
| ¿PDF y planilla coinciden? | Sí (suite `export2e` + `consistencia-export`). |
| ¿Listo para preview? | **Sí.** |
| ¿Listo para merge? | **Sí, tras la validación manual con capturas (§21.17).** No se realizó merge automático. |

---

### Validación final ejecutada

```
npx vitest run        → 388/388 ✅ (58 archivos)
npm run lint          → 0 errores, 53 warnings (preexistentes) ✅
npm run build         → OK (warning de chunks preexistente) ✅
npm audit --omit=dev  → 3 moderate (preexistentes, exceljs→uuid) ✅
git status            → árbol limpio ✅
```
