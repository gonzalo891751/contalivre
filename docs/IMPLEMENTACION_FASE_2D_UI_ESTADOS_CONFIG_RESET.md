# Fase 2D — Ajuste final de UI: Estados, Configuración y reseteo total

**Rama:** `refactor/fase-2d-ui-estados-config-reset`
**Base:** `refactor/fase-2c-integracion-final` @ `5e47b27`
**Lema:** *Diseño anterior + motor nuevo + exportación formal.*

Esta fase recupera la experiencia visual anterior de los Estados como
**presentadores puros**, agrega una **exportación formal** diferenciada de la
vista web, consolida las opciones técnicas en **Configuración**, retira la
**Práctica guiada**, incorpora un **reseteo total seguro** y migra el tablero de
**Indicadores** al motor canónico.

## Restricción no negociable (verificada)

No se reintrodujo ningún motor/heurística de cálculo legacy en la UI. **Toda
cifra visible o exportable proviene de `loadReportingBundle` / `src/reporting`.**
Se recuperó el DISEÑO, no la LÓGICA. Tests que lo blindan:
`tests/acceptance/no-legacy-engines.test.ts`,
`tests/acceptance/indicators-canonical.test.ts`,
`tests/acceptance/no-practica-ui.test.ts`.

---

## Hitos

### 1 · Estados: diseño anterior recuperado (presentadores puros)
- `src/components/Estados/canonical/StatementView.tsx` + `statementFormat.ts`:
  tarjetas de sección con icono/total, **rubros desplegables a nivel cuenta**,
  badges de nota, **pills de variación** y comparativo, **drilldown** de
  trazabilidad por cuenta. Sin Dexie, sin recálculo: solo re-etiqueta el `level`
  de una línea con linaje para poder desplegarla.
- ESP en dos columnas (Activo / Pasivo+PN, una sola columna en comparativo),
  ER y EEPN en tarjeta única con totales intermedios resaltados; Notas con la
  misma gramática. Se retiró `ReportLineTable` (presentador básico sin usos).
- Las cinco secciones (ESP/ER/EFE/EEPN/Notas) siguen en el `EstadosHeader`.

### 2 · EFE con dos conmutadores + bloques por actividad
- `FlujoEfectivoCanonicalTab.tsx`: una sola sección con **Método** (Directo/
  Indirecto) y **Expresión** (Nominal/Moneda de cierre) independientes, tira
  resumen *inicio → variación → cierre* y bloques por actividad con drilldown.
  La moneda de cierre se habilita solo si el bundle trae la reexpresión.

### 3 · "Exportar estados": vista web vs exportación formal
- `src/lib/exportOptions.ts`: contrato de opciones (formato, contenido por
  estado, método del EFE, expresión, comparativo, borrador).
- `src/pdf/reportBundlePdfFormal.ts`: **PDF formal (RT 54 T.O. RT 59 —
  FACPCE/CENCyA)** con identificación del ente, un estado por sección con cifras
  comparativas y referencias a notas, leyenda "las notas forman parte
  integrante", pie con motor/versión/estado y numeración, y **marca de agua
  BORRADOR** si no es publicable o si se pide.
- `buildSelectedReportSheets` (planilla) filtra hojas por contenido y honra
  método/moneda del EFE. `buildReportSheets(bundle)` sin opciones se conserva
  (juego completo) para el test de consistencia.
- `ExportEstadosModal.tsx`: un único botón "Exportar estados" abre el modal.
  Se retiró el PDF por pestaña (`reportBundlePdf.ts`), ya redundante.

### 4 · Configuración unificada
- `src/pages/ConfiguracionPage.tsx` en `/configuracion` con menú interno:
  **General, Empresa, Ejercicios, Plan de cuentas y mapeos, Inflación,
  Importaciones, Respaldo, Datos, Acerca** (deep-link por `?seccion=`).
- Paneles reutilizables extraídos de `AcercaDe`/`MapeosPage`: `BackupPanel`,
  `VersionInfoPanel`, `CapabilitiesPanel`, `MapeosPanel`; nuevos
  `EjerciciosPanel` (fijar actual / reabrir con motivo) y `DangerZonePanel`.
- **Redirecciones:** `/mapeos → /configuracion?seccion=plan-cuentas`,
  `/acerca → /configuracion?seccion=acerca`. Se eliminaron las páginas
  `AcercaDe` y `MapeosPage`.

### 5 · Retiro de la Práctica guiada
- Se eliminó `PracticaPage` y su entrada de sidebar; `/practica` redirige al
  inicio. Los **escenarios educativos** (`src/accounting/scenarios`) se
  conservan como **utilidades de test golden** (`mapeos-escenarios.test.ts`,
  9 tests) pero sin superficie de UI. Test arquitectónico: `no-practica-ui`.

### 6 · Reseteo total ("Restablecer ContaLivre completamente")
- `src/accounting/maintenance/resetService.ts`: vacía **todas** las tablas Dexie
  en una transacción, limpia el localStorage propio y regenera el estado de
  instalación limpia (empresa por defecto + `systemMeta` con nueva identidad).
  Audita `APP_RESET` (nuevo tipo de evento).
- `DangerZonePanel` (Config → Datos) exige, en orden: **(1)** generar y descargar
  respaldo — *si falla, no se continúa*; **(2)** confirmar que se guardó; **(3)**
  tipear la frase `RESETEAR CONTALIVRE`; **(4)** segunda confirmación. No borra
  selectivamente por coincidencia de año: vacía todo y re-siembra.

### 7 · Limpieza de navegación
- Sidebar: se quitó "Mapeos de cuentas" (vive en Configuración) y se agregó
  "Configuración". `MobileDrawer`: nueva entrada "Configuración". `UserMenu`:
  "Configuración/Empresa" navegables. Dashboard/QuickActions sin enlaces muertos.

### 8 · Indicadores desde el ReportingBundle
- `IndicatorsDashboard.tsx` reescrito: consume `bundle.metrics`
  (`MetricCatalogEntry`) por categoría (liquidez/solvencia/rentabilidad/
  actividad/flujo). Cada tarjeta muestra valor por unidad, fórmula, sustitución,
  interpretación y advertencias, o el motivo cuando no es calculable. **Sin
  heurísticas por nombre, sin ∞/NaN y sin puntaje universal de "salud".**
- Nuevo hook `useReportingBundle` y selectores canónicos
  (`cashAndEquivalents`/`hasCashAccounts`). `OperacionesPage` toma
  "disponibilidades" del selector y deja de usar `useIndicatorsMetrics`, que se
  eliminó. Test arquitectónico: `indicators-canonical`.

### 9 · Responsive y accesibilidad de Estados
- `EstadosHeader`: pestañas `role="tablist"/tab` con `aria-selected`, scroll
  horizontal en móviles y foco visible. Contenido activo como `tabpanel`.
- `prefers-reduced-motion` respetado. Modales (Exportar / Trazabilidad) cierran
  con **Escape** y quedan rotulados (`aria-labelledby`).

### 10 · Validación y suites
- Suites nuevas: `export-options` (4), `reset` (3), `no-practica-ui` (3),
  `indicators-canonical` (4). Golden de escenarios y consistencia de exportación
  intactas.

---

## Deuda declarada (honesta)

- **`core/statements` (computeStatements)** sigue vivo: lo usa
  `useDashboardMetrics`, el hook de **gráficos** del Dashboard (barra de la
  ecuación, composición de activos/pasivos por rubro). Su retiro total requiere
  migrar esos gráficos al bundle (derivar composición desde
  `trialBalance` + taxonomía). Fuera del alcance de "indicadores".
- **`domain/reports/estadoResultados`** y **`utils/indicators`** quedaron sin
  consumidores en `src` (solo los usan sus tests unitarios). Se conservan hasta
  plegar esas conductas a los tests del motor canónico; ya no tienen UI.
- **`utils/resultsStatement`** NO se retira: es dependencia legítima del motor
  canónico (`isStructuralClosingEntry`, `excludeClosingEntries`).

---

## Validación final

| Chequeo | Resultado |
|---|---|
| `npx tsc --noEmit` | limpio |
| `npx eslint .` | 0 errores (53 warnings preexistentes) |
| `npx vitest run` | **317/317** (47 archivos) |
| `npx vite build` | OK · SW generado (rollup 4.44.0 pineado) |

Diff `5e47b27..HEAD`: 39 archivos, +2.578 / −2.094. Chunk de Estados 63,3 kB
(gzip 16,9). Warning de tamaño del chunk principal: preexistente (ignorar).

## Prueba manual sugerida

1. **Estados** → recorrer ESP/ER/EFE/EEPN/Notas; activar Comparativo; desplegar
   un rubro y abrir la trazabilidad de una cuenta (Escape cierra).
2. **EFE** → alternar Directo/Indirecto y Nominal/Moneda de cierre.
3. **Exportar estados** → PDF formal (verificar identificación del ente, notas y
   marca BORRADOR si no es publicable) y planilla filtrada por contenido.
4. **Configuración** → recorrer secciones; editar Empresa; abrir Mapeos;
   `/mapeos` y `/acerca` redirigen.
5. **Config → Datos** → completar el flujo de reseteo (respaldo → frase → doble
   confirmación) y recargar: la app queda como recién instalada.
6. **Indicadores** (Dashboard/Operaciones) → tarjetas con estado/motivo; sin
   ∞/NaN; sin puntaje global.
7. **Móvil** → sidebar/drawer con Configuración; pestañas de Estados con scroll.
