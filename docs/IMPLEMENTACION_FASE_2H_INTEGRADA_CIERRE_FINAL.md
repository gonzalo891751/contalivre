# Fase 2H integrada — cierre final

> Rama de integración de la Fase 2H sobre el cierre de la Fase 2G.1.
> **No fue mergeada ni desplegada.** Queda lista para revisión.

---

## 1. Ramas y HEAD

| Rama | HEAD | Rol |
|---|---|---|
| `main` | `a45b986` | Base del proyecto. **Ya contiene 2G.1** (PR #26) |
| `refactor/fase-2g1-cierre-efe` | `bbf22b8` | Cierre funcional del EFE (2G.1) |
| `refactor/fase-2h-cobertura-sectorial-anexos-operaciones` | `12cce94` | Entrega parcial de 2H |
| **`refactor/fase-2h-integrada-cierre-final`** | **`f9ce865`** *(ver §12)* | **Rama de integración de esta entrega** |

Hallazgo de la verificación inicial: **`main` se movió**. Estaba en `6152ea8` y ahora está en
`a45b986`, que incorporó 2G.1 vía PR #26. El árbol de `main` y el de `refactor/fase-2g1-cierre-efe`
son **idénticos** (`fd9d72e`), así que basar la integración en 2G.1 —como pediste— es equivalente en
contenido a basarla en `main`.

Las tres ramas de origen quedaron **intactas**: no se les hizo commit, rebase ni reescritura.

---

## 2. Cómo se integró

```bash
git checkout -b refactor/fase-2h-integrada-cierre-final refactor/fase-2g1-cierre-efe
git merge --no-ff refactor/fase-2h-cobertura-sectorial-anexos-operaciones
```

Merge no destructivo, sin rebase y sin cherry-pick: el historial de las dos ramas se conserva
completo.

### Conflicto encontrado (uno solo)

`src/components/Estados/canonical/FlujoEfectivoCanonicalTab.tsx`, en la rama de renderizado de la
vista de **Preparación** del EFE.

| Lado | Qué aportaba |
|---|---|
| **2G.1** | Conmutador de Expresión (Moneda nominal / Moneda de cierre) con `prepRestatedAvailable`, y `PreparacionEfe` recibiendo la prop `expression`. Emitía `<style>{statementStyles}</style>` |
| **2H** | `<style>{statementStyles}{efeStyles}</style>`: la corrección del CSS que se perdía al conmutar de vista |

**Resolución: se conservaron los dos lados.** Se mantiene la funcionalidad de 2G.1 (preparación
reexpresada a moneda de cierre) y se migra ese conmutador al `SegmentedControl` común, sumando
`efeStyles` a esa rama.

**Este conflicto es exactamente el bug de tu captura original.** El control
«Moneda nominalMoneda de cierre» que se veía como texto plano existe **sólo** en la vista de
Preparación, que llegó con 2G.1, y su CSS vivía en `efeStyles`, que esa rama no emitía en ese
`return`. Ninguna de las dos ramas por separado lo corregía: 2G.1 tenía el control pero no el CSS, y
2H tenía el arreglo pero no ese control. **La integración es lo que finalmente lo resuelve.**

El resto de los archivos (`CanonicalTabs`, `EquityMatrixView`, `NotesAndAnnexesTab`,
`OperacionesPage`, `models`, `styles`) se combinó automáticamente sin conflicto.

---

## 3. Node 22 real utilizado

Existía la instalación portable esperada. **No se instaló ni desinstaló nada.**

| Dato | Valor |
|---|---|
| Ruta | `C:\Tools\node-v22.23.1-win-x64\node.exe` |
| `node --version` | `v22.23.1` |
| `npm --version` | `10.9.8` |

Todos los comandos finales se ejecutaron anteponiendo esa ruta al `PATH`:

```bash
$env:PATH = "C:\Tools\node-v22.23.1-win-x64;" + $env:PATH
```

El Node global del sistema (v25.9.0) quedó intacto.

---

## 4. Aclaración del conteo de hitos

El informe anterior decía «8 de 13 terminados, 5 pendientes» y después enumeraba **seis**
identificadores. **El texto estaba mal: los pendientes eran seis, no cinco** (H5, H6, H7, H8, H11 y
H12; H8 estaba parcial y se lo contó de las dos formas).

Estado real, hito por hito, sin agrupar:

| Hito | Antes | Ahora | Evidencia | Falta |
|---|---|---|---|---|
| H0 Gate y auditoría | Terminado | **Terminado** | §1, §2 | — |
| H1 Segmentados EFE/EEPN | Terminado | **Terminado** | 15 unit + 3 E2E | — |
| H2 Perfiles sectoriales | Terminado | **Terminado** | 18 unit | — |
| H3 Agropecuario | Terminado | **Terminado** | 17 unit + fixture | — |
| H4 Sin fines de lucro | Terminado | **Terminado** | 17 unit + fixture + E2E | — |
| H5 Gastos por función | **Pendiente** | **Terminado** | 14 unit + 2 E2E | — |
| H6 Costo por actividad | **Pendiente** | **Terminado** | 12 unit + fixture industrial | — |
| H7 Bienes de uso | **Pendiente** | **Terminado** | 11 unit | Ver §11 (deuda) |
| H8 Moneda extranjera | **Parcial** | **Terminado** | 9 unit + 6 unit anexos | — |
| H9 Importes fantasma | Terminado | **Terminado** | 13 unit + 1 E2E | — |
| H10 Portada Operaciones | Terminado | **Terminado** | Captura + E2E | — |
| H11 Exportaciones | **Pendiente** | **Terminado** | 7 unit + inspección real | — |
| H12 E2E y validación | **Pendiente** | **Terminado** | 38 E2E en 3 proyectos | — |

**13 de 13 hitos terminados.**

---

## 5. Esquema

**Sin cambios: sigue en la versión 22.**

Nada de lo agregado necesitó un store ni un índice nuevo. Las cuentas sectoriales son filas normales
de `accounts`; el perfil activo vive en `settings`; `basis`, `basisLabel` y `driverValue` son campos
de registro dentro de `expenseAllocationRules`, que ya existía. Las reglas creadas antes de esta fase
se interpretan como `MANUAL_PERCENTAGE`, así que **no hizo falta migrar nada**.

---

## 6. H5 — Gastos por función

La Fase 2E ya repartía por porcentajes con control exacto al 100 %; **no existía ningún prorrateo
60/40 cableado** (se verificó en el motor). Lo que faltaba eran las **bases**.

Bases implementadas: porcentaje manual, cantidad de empleados, superficie, horas, unidades producidas
y base personalizada con inductor propio.

Con base por inductor el usuario carga el **valor** por función y el porcentaje se **deriva**, de modo
que suma 100 por construcción. El reparto en centavos cierra exactamente contra el saldo contable: el
residuo de redondeo va a la función de mayor participación.

Por cada asignación se informa: cuenta, saldo contable, función, base, valor del inductor, porcentaje
resultante, importe asignado, origen, regla y **diferencia de control**. El anexo suma una vista de
**Preparación** (papel de trabajo) junto a la de Exposición.

La asignación sigue siendo de **exposición**: no toca el asiento ni duplica el gasto.

Ejemplo verificado en la aplicación (captura `2h-gastos-base-empleados.png`): base «Cantidad de
empleados», Administración 3 → 75,00 %, Comercialización 1 → 25,00 %, total 100,00 %.

---

## 7. H6 — Costo por actividad

El motor sólo distinguía comercial, servicios y no aplicable; su propia cabecera declaraba que la
actividad industrial «no tenía soporte estructural declarado».

Se agregaron los modos **INDUSTRIAL** y **AGRICULTURAL**, detectados por *mapping* y nunca por
nombre, con precedencia **agro > industria > comercio > servicios** y motivo visible (`modeReason`).

El costo de producción es un **subtotal derivado y conciliado**:

```
  materia prima + mano de obra + costos indirectos + depreciaciones productivas
    = costo de producción del período
  + producción en proceso inicial − final      = costo de productos terminados
  + productos terminados iniciales − finales   = costo de productos vendidos
```

y esa cadena se concilia contra el CMV del puente de existencias.

### Dos duplicaciones reales encontradas y corregidas en el motor

1. **Transferencias internas entre etapas.** Aplicar insumos a la producción o pasar producción a
   productos terminados se contaba a la vez como compra y como costo de ventas. Ahora se neutraliza
   la porción compensada y sólo se computa el neto. En el caso agropecuario esto explicaba una
   diferencia de **1.500.000** contra el ER.
2. **Salidas hacia el proceso productivo.** Son salida real del inventario pero **no** son costo de
   ventas: se exponen como transferencia a producción y recién integran el costo cuando se vende el
   terminado.

Además se mapeó la cuenta de **mortandad y mermas** como baja anormal (`ABNORMAL_LOSS`): sin ese
mapping el puente no conciliaba con el ER (diferencia de 50.000).

Los costos de producción se capitalizan a producción en proceso, así que el componente del anexo se
mide por el **débito del período** y no por el saldo de cierre, que quedaría en cero.

### Precedencia de fuentes

1. Módulo de inventario, cuando hay movimientos reconciliados.
2. Flujos del Libro Diario sobre cuentas con `statementGroup = INVENTORIES`.
3. Saldos de apertura explícitos y asiento formal de apertura.
4. Ecuación patrimonial (EI + compras − EF) cuando no hay inventario detallado.

No hay dos costos de ventas: el puente y el ER se comparan y cualquier diferencia se expone; **jamás
se agrega una línea balanceante**.

---

## 8. H7 — Bienes de uso

Se cierra el circuito y se hace visible cualquier desvío en lugar de dejar dos bases que se
contradicen en silencio.

`src/reporting/fixedAssetsReconciliation.ts` compara los totales de las fichas del módulo contra el
anexo canónico (armado desde el Libro Diario) en valor de origen, depreciación acumulada y valor
residual. **No recalcula la amortización**: reutiliza `getFixedAssetsMetrics`, la misma función que
usa la ficha, para no crear una tercera versión de la misma cifra.

El panel se muestra dentro del anexo e informa además las **fichas sin asiento enlazado**, que son la
causa más frecuente de diferencia. El saldo contable siempre manda: el selector expone la diferencia,
no la ajusta.

La planilla `/planillas/amortizaciones` ya consumía `getAllFixedAssets` (V2), la misma fuente que
alimenta los asientos del anexo. La conciliación deja demostrado que no hay base paralela en uso.

Casos verificados: alta, depreciación del ejercicio, conciliación, ficha sin asiento, bien con valor
residual, reversión del alta, idempotencia de la sincronización y módulo vacío.

---

## 9. H8 — Moneda extranjera

Se completó el **contenido**, no sólo la accesibilidad:

- clasificación **corriente / no corriente** por partida, con mapping explícito y derivación de
  respaldo por sección, nunca inferida por el nombre;
- **totales por naturaleza**: activos, pasivos y posición neta;
- **diferencias de cambio del ejercicio**, identificadas por *mapping* (`notesGroup`).

Se mantiene la regla de no inventar datos: sin detalle operativo, cantidad y cotización siguen como
«información insuficiente»; **sin cuentas mapeadas a la nota, las diferencias de cambio no se
informan como cero**: se declara que falta la configuración y dónde hacerla.

---

## 10. H11 — Exportaciones

El XLSX de trabajo incorpora lo que la fase agregó al motor: hoja **«Gastos (preparación)»** con las
diez columnas de trazabilidad, apertura del costo de producción, y moneda extranjera con columna
corriente, totales y diferencias de cambio. El PDF profesional queda limpio.

### Inspección real de los artefactos

Se agregó `scripts/inspect-exports.mjs`, que **abre** el XLSX con exceljs y **descomprime los streams
del PDF** para leer su texto. No se aceptó que el archivo «se haya creado».

Resultado sobre los exportables regenerados con el dataset RC:

- **XLSX** — 14 hojas. «Gastos (preparación)» presente con las diez columnas; el alquiler se reparte
  60/40 en **54.000 y 36.000** con su regla identificada; moneda extranjera informa activos
  **150.000**, pasivos **0**, posición neta **150.000**; el total de gastos **418.000** es
  exactamente la suma de las funciones (258.000 + 96.000 + 64.000).
- **PDF** `juego-completo`, `eepn-matriz`, `efe-directo` — los tres llevan título del estado y
  RT 54; ninguno lleva botones, filtros, papel de trabajo ni hashes técnicos.

Observación (no corregida a propósito): el pie del PDF muestra `Motor 2G.0 · schema v22 · reporte
ca341a6b · VALIDATED`. Es una decisión deliberada de la Fase 2G (provenance del reporte), no un hash
técnico accidental. Se deja como está y se señala por si preferís retirarlo.

---

## 11. Riesgos y deuda técnica

1. **`db.amortizationState` (V1) sigue existiendo** (riesgo bajo). La planilla ya usa V2 por defecto
   y la conciliación demuestra que el anexo no depende de V1, pero el store legacy y su botón
   «Migrar a V2» siguen ahí. Retirarlo es una tarea de limpieza posterior.
2. **Diferencias de cambio por cuenta** (riesgo bajo). Se informa el total del ejercicio, no la
   apertura por partida: no existe un mapping que ligue cada diferencia a su cuenta de origen. Se
   declara explícitamente en vez de estimarlo.
3. **Perfil sectorial global, no por empresa** (riesgo bajo). Se guarda en `settings`, no por
   `companyId`. Con varias empresas compartirían perfil.
4. **`main` avanzó durante la fase** (riesgo bajo). La integración se basó en 2G.1, cuyo árbol es
   idéntico al de `main` al momento de verificar. Conviene reconfirmar antes de abrir el PR.
5. **Precisión del reparto por inductor** (riesgo bajo). El porcentaje derivado se persiste
   redondeado a dos decimales como caché legible; la fuente de verdad es `driverValue`, y el reparto
   en centavos se hace sobre el porcentaje efectivo, no sobre el redondeado.

---

## 12. Commits de la rama de integración

| SHA | Contenido |
|---|---|
| `cf730a7` | merge: incorporar Fase 2H sobre el cierre 2G.1 |
| `67b4e01` | feat: bases de distribución de gastos y costo por actividad (H5 y H6) |
| `9f6d80f` | feat: circuito único de bienes de uso y anexo de moneda extranjera (H7 y H8) |
| `f9ce865` | feat: exportar los anexos nuevos y verificar los artefactos (H11) |
| *(ver §14)* | test/docs: E2E de la Fase 2H e informe final (H12) |

Debajo del merge queda el historial completo de la rama 2H parcial (`773f054`, `74ff594`, `582467c`,
`54a4c72`, `12cce94`) y el de 2G.1.

---

## 13. Cómo probarlo, paso por paso

```bash
git checkout refactor/fase-2h-integrada-cierre-final
```

```bash
npm run dev
```

**A. El bug original de la captura (EFE en Preparación)**
1. `/estados` → **Flujo de Efectivo**. Cargá el dataset RC desde
   Configuración → Datos si el ejercicio está vacío.
2. Pasá a **Preparación**. El conmutador de Vista y el de **Moneda nominal / Moneda de cierre** deben
   verse como controles segmentados con caja, no como texto corrido.
3. Movete con `Tab` y las flechas ← →.
4. Pasá el mouse por «Moneda de cierre» si está deshabilitada: debe explicar por qué.

**B. EEPN**
1. **Evolución PN** → **Vista resumida**. El conmutador conserva su caja (era el caso roto).

**C. Empresa vacía**
1. `/operaciones` con un ejercicio sin asientos: todo en `$ 0,00`, sin `320.000`, sin «Vencimientos»,
   sin `-$ 0,00`, y con el aviso que explica por qué.

**D. Gastos por función con base**
1. `/configuracion?seccion=plan-cuentas` → **Distribución de gastos entre funciones**.
2. Elegí una cuenta, poné **Base de distribución = Cantidad de empleados**.
3. Cargá 3 y 1: debe mostrar 75,00 % y 25,00 % y **Total: 100,00 % ✓**.
4. Guardá la regla y andá a `/estados` → **Notas y Anexos** → **Gastos por función** →
   **Preparación**: verás base, valor del inductor, porcentaje, importe y control por asignación.

**E. Costo por actividad**
1. Con el perfil **Industrial** activo y movimientos de producción, el anexo de Costo de ventas
   agrega la sección **Costo de producción** con la cadena hasta el costo de lo vendido.

**F. Bienes de uso**
1. Cargá un bien desde Operaciones → Bienes de uso y contabilizá el alta.
2. `/estados` → **Notas y Anexos** → **Bienes de uso**: al pie aparece la **conciliación** módulo ↔
   Libro Diario.
3. Cargá un bien y **no** lo contabilices: la conciliación debe marcar la diferencia y nombrar la
   ficha sin asiento.

**G. Perfiles sectoriales**
1. Activá **Agropecuaria**, desactivala y volvé a activarla: debe decir que ya estaban y no duplicar
   (comprobalo en `/cuentas`).
2. Activá **Entidad sin fines de lucro** y mirá `/estados` → **Resultados**: pasa a llamarse
   **Estado de Recursos y Gastos**.

**H. Exportaciones**
```bash
npx playwright test exports
```
```bash
node scripts/inspect-exports.mjs
```

**I. Gate completo con Node 22**
```bash
$env:PATH = "C:\Tools\node-v22.23.1-win-x64;" + $env:PATH; npm ci
```
```bash
$env:PATH = "C:\Tools\node-v22.23.1-win-x64;" + $env:PATH; npx vitest run
```
```bash
$env:PATH = "C:\Tools\node-v22.23.1-win-x64;" + $env:PATH; npm run lint
```
```bash
$env:PATH = "C:\Tools\node-v22.23.1-win-x64;" + $env:PATH; npm run build
```
```bash
$env:PATH = "C:\Tools\node-v22.23.1-win-x64;" + $env:PATH; npx playwright test
```

---

## 14. Resultado exacto de cada comando

Todo ejecutado con **Node v22.23.1 / npm 10.9.8** desde `C:\Tools\node-v22.23.1-win-x64`.

| Comando | Resultado |
|---|---|
| `npm ci` | `added 776 packages in 6m` · exit 0 |
| `npx tsc --noEmit` | Sin salida · **exit 0** |
| `npm run lint` | `✖ 53 problems (0 errors, 53 warnings)` · **0 errores** |
| `npm run build` | `dist/sw.js`, `dist/workbox-835c8c05.js` generados · **exit 0** |
| `npx vitest run` | **90 archivos, 616 pruebas, 616 pasando** · 54,67 s |
| `npx playwright test` | **38 pruebas, 38 pasando** · 4,2 min · **exit 0** |
| `node scripts/inspect-exports.mjs` | 14 hojas XLSX y 3 PDF verificados (§10) |

### Warnings de lint

Son **exactamente los 53 de la baseline** (`main` en `6152ea8` ya tenía 0 errores y 53 warnings).
**Esta fase no introdujo ninguno.** Durante el trabajo se introdujo un error de lint
(`'cellsOf' is assigned a value but never used`) y se corrigió antes de cerrar: el último `npm run
lint` devuelve 0 errores.

### Cobertura E2E por proyecto

| Proyecto | Pruebas | Specs |
|---|---:|---|
| `chromium-desktop` | 23 | allocation-editor, exports, **fase2h**, full-flow, preparacion-efe, reset-restore, resolutions, visual-acceptance |
| `chromium-mobile` (390×844) | 1 | mobile |
| `firefox-desktop` (1440×900) | 14 | exports, **fase2h**, full-flow, preparacion-efe |

### Fallos encontrados durante la integración y su causa

La combinación **sí rompió** pruebas que pasaban por separado. No se ocultaron: se corrigió la causa.

| Fallo | Causa real | Corrección |
|---|---|---|
| 6 E2E de 2G.1/2F fallaban tras el merge | `SegmentedControl` pone `role="radio"`, que **reemplaza** el rol implícito `button`. Todos los `getByRole('button')` de las suites previas dejaron de encontrar los controles | Selectores actualizados a `radio` / `radiogroup`, **agregando** además la verificación de `aria-checked` (la aserción quedó más estricta, no más laxa) |
| `visual-acceptance` no encontraba el filtro del EEPN | En la entrega parcial yo había **renombrado** «Mostrar solo movimientos» a «Solo movimientos» sin necesidad | Se restauraron las etiquetas originales |
| `visual-acceptance` no encontraba el toggle de bienes de uso | Reemplacé `button` por `radio` de más: ese toggle no era un `SegmentedControl` | Se migró también ese control al componente común (consistencia) |

---

---

## 15. Confirmación

- **No se hizo merge a `main`.** `main` sigue en `a45b986`.
- **No se hizo deploy.**
- **No hubo rebase, squash ni reescritura de historia.** Las tres ramas de origen quedaron intactas.
- **No se saltearon ni se marcaron como skip pruebas** para conseguir verde.
- El árbol termina limpio.
