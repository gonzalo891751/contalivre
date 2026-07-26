# Fase 2H integrada — cierre final

> Rama del PR #28, sincronizada con `origin/main`.
> **No fue mergeada ni desplegada.** Queda lista para revisión.

---

## 0. Cierre del PR #28 (sincronización con main)

| Dato | Valor |
|---|---|
| Fecha de integración | 26/07/2026 |
| HEAD anterior de la rama | `1939201` |
| `origin/main` integrado | `a45b986` |
| Commit de merge | `a587b8e` |
| **HEAD final de la rama** | **`815348a`** |
| Respaldo previo | rama `backup/fase-2h-antes-de-sincronizar-main-1939201` y tag `backup-fase-2h-1939201` |
| Árbol | Limpio |

### Por qué GitHub informaba conflictos

No había conflicto de contenido: era una **historia en cruz (criss-cross)**. La rama y `main`
tenían **dos** bases de merge, no una:

```
git merge-base --all a45b986 1939201
→ bbf22b8   (cierre 2G.1)
→ 6152ea8   (merge de la fase 2G)
```

La rama de integración se creó desde 2G.1 e incorporó la 2H parcial, que a su vez venía de
`6152ea8`. `main`, por su lado, llegó al mismo contenido por otro camino al mergear el PR #26. Con
dos bases, la comparación simple que usa GitHub marca conflicto **exactamente** en los archivos que
2G.1 tocó y la 2H también — los tres que reportaba.

Verificación de que no había divergencia real: `git diff bbf22b8 origin/main` es **vacío**; ambos
árboles ya eran idénticos (`fd9d72e`).

La estrategia `ort` de git construye una base virtual mergeando ambas bases y resuelve sin
conflicto: *«Merge made by the 'ort' strategy»*, sin marcadores y sin intervención manual.

**El merge no aporta contenido: aporta estructura.** A partir de él `origin/main` es ancestro de la
rama y queda **una sola base de merge** (`a45b986`), así que GitHub deja de ver el cruce.

### Resolución de cada archivo señalado

| Archivo | Qué aportaba cada lado | Resolución |
|---|---|---|
| `src/components/Estados/canonical/FlujoEfectivoCanonicalTab.tsx` | **2G.1**: `prepRestatedAvailable`, conmutador de Expresión en Preparación y `PreparacionEfe` con la prop `expression`. **2H**: `SegmentedControl`, `efeStyles` en la rama de Preparación, `disabledReason` | **Ambos**. Verificado en el archivo final: `prepRestatedAvailable` (l. 187), `expression=` (l. 218), `SegmentedControl` en los cinco controles, `{statementStyles}{efeStyles}` en las **dos** ramas de renderizado (l. 219 y 367) |
| `e2e/preparacion-efe.spec.ts` | **2G.1**: tres tests (matriz y detalle de celda, moneda de cierre con banner y export, panel de políticas). **2H**: selectores por rol accesible | **Ambos**. Los tres tests intactos, con `getByRole('radio')` y `toBeEnabled` sobre el control real |
| `playwright.config.ts` | **2G.1**: proyecto `firefox-desktop` con su `testMatch`. **2H**: `fase2h` agregado a ese `testMatch` | **Ambos**. Los tres proyectos conservados con `baseURL`, `webServer`, `reuseExistingServer`, `timeout` 180 s, `expect.timeout` 15 s, `workers: 1`, `retries: 0`, `trace: retain-on-failure`, `screenshot: off`, `testDir`, `reporter`. Sin proyectos duplicados |

---

## 1. Ramas y HEAD

| Rama | HEAD | Rol |
|---|---|---|
| `main` | `a45b986` | Base del proyecto. **Ya contiene 2G.1** (PR #26). No se modificó |
| `refactor/fase-2g1-cierre-efe` | `bbf22b8` | Cierre funcional del EFE (2G.1). Intacta |
| `refactor/fase-2h-cobertura-sectorial-anexos-operaciones` | `12cce94` | Entrega parcial de 2H. Intacta |
| **`refactor/fase-2h-integrada-cierre-final`** | **`815348a`** | **Rama del PR #28** |

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

## 10.bis — Endurecimientos del cierre del PR #28

### Perfil sectorial por empresa

Era global de la instalación: activar «sin fines de lucro» en el club cambiaba la exposición de la
empresa comercial y de la agropecuaria. Ahora vive en
`settings['sector-profiles'].byCompany[companyId]`, y la empresa se resuelve desde
`systemMeta.currentCompanyId` con la empresa por defecto como respaldo.

**Sin elevar el esquema** (sigue en 22): `byCompany` es un campo dentro de un registro de `settings`
que ya existía, no un store ni un índice nuevo.

Migración lógica, no destructiva y **sin filtraciones**:

- si ya existe `byCompany`, esa es la única fuente y el campo global se ignora (por eso desactivar un
  perfil no se «deshace» en la lectura siguiente);
- si todavía no existe, el arreglo global se atribuye **únicamente** a la empresa por defecto, que es
  la que lo generó cuando la instalación era de una sola empresa;
- el campo `active` **nunca se borra**: queda como respaldo del valor anterior.

La primera versión de esta corrección tenía una filtración real (el global se aplicaba a cualquier
empresa sin entrada propia, así que el club heredaba el perfil de la comercial). La prueba lo detectó
y se corrigió antes de cerrar.

Verificado en la aplicación con dos empresas: `company-default` expone «Estado de Recursos y Gastos»
y `Club Social QA` expone «Estado de Resultados»; al activar Agropecuaria en el club, la empresa por
defecto **no** se alteró. Estado persistido observado:

```json
{ "active": ["COMMERCIAL","NONPROFIT"],
  "byCompany": { "company-default": ["COMMERCIAL","NONPROFIT"],
                 "company-club-qa": ["COMMERCIAL","AGRICULTURAL"] } }
```

### Cobertura móvil (390×844)

Tres escenarios nuevos sobre las áreas que tocó la fase, con aserciones geométricas reales:

| Escenario | Qué verifica |
|---|---|
| **A — EFE en Preparación** | El conmutador conserva `border-style: solid` en 390 px, `aria-checked` correcto, el conmutador de Expresión de 2G.1 es alcanzable, ningún control fuera del viewport, sin desborde horizontal |
| **B — Operaciones vacía** | Todo en `$ 0,00`, sin `320.000`, sin «Vencimientos», sin `-$ 0,00`, aviso presente, tarjetas apiladas en una columna (misma `x`), navegación funcional |
| **C — Notas y Anexos** | Las cinco subpestañas habilitadas; se recorren los cuatro anexos verificando `aria-selected` y que cada uno muestre datos o su estado vacío, sin desborde en ninguno |

### Pie de provenance del PDF

Antes: `Motor 2G.0 · schema v22 · reporte ca341a6b · VALIDATED`.
Ahora: **`ContaLivre 0.5.0-rc.1 · Motor contable 2G.0 · esquema v22 · VALIDADO`**.

Se distingue la versión de la aplicación de la del motor contable, se traduce estado y esquema, y el
identificador del reporte se mueve a los **metadatos** del archivo (título, autor, asunto y palabras
clave, junto al commit). La trazabilidad se conserva completa. No se tocaron cálculos.

---

## 11. Riesgos y deuda técnica

1. **`db.amortizationState` (V1) sigue existiendo** (riesgo bajo). La planilla ya usa V2 por defecto
   y la conciliación demuestra que el anexo no depende de V1, pero el store legacy y su botón
   «Migrar a V2» siguen ahí. Retirarlo es una tarea de limpieza posterior.
2. **Diferencias de cambio por cuenta** (riesgo bajo). Se informa el total del ejercicio, no la
   apertura por partida: no existe un mapping que ligue cada diferencia a su cuenta de origen. Se
   declara explícitamente en vez de estimarlo.
3. **Atribución del perfil global histórico** (riesgo bajo). Si una instalación previa tenía el
   perfil global y su empresa corriente **no** era `company-default`, esa empresa arrancará con el
   núcleo comercial y habrá que reactivar su perfil. No se pierde ninguna cuenta ni dato: sólo la
   selección, que se rehace con un clic.
4. **Precisión del reparto por inductor** (riesgo bajo). El porcentaje derivado se persiste
   redondeado a dos decimales como caché legible; la fuente de verdad es `driverValue`, y el reparto
   en centavos se hace sobre el porcentaje efectivo, no sobre el redondeado.
5. **Historia en cruz ya neutralizada** (riesgo bajo). Si `main` vuelve a avanzar, basta repetir
   `git fetch` + `git merge --no-ff origin/main`; ya no hay cruce porque `origin/main` es ancestro.

---

## 12. Commits de la rama de integración

| SHA | Contenido |
|---|---|
| `cf730a7` | merge: incorporar Fase 2H sobre el cierre 2G.1 |
| `67b4e01` | feat: bases de distribución de gastos y costo por actividad (H5 y H6) |
| `9f6d80f` | feat: circuito único de bienes de uso y anexo de moneda extranjera (H7 y H8) |
| `f9ce865` | feat: exportar los anexos nuevos y verificar los artefactos (H11) |
| `d664c70` | test: aceptación E2E de la Fase 2H e informe integrado (H12) |
| `1939201` | docs: fijar los SHA finales en el informe integrado |

### Cierre del PR #28

| SHA | Contenido |
|---|---|
| `a587b8e` | merge: sincronizar Fase 2H con `origin/main` (a45b986) |
| `2659fe0` | fix: asociar el perfil sectorial a cada empresa |
| `9aae215` | fix: clarificar la provenance del PDF profesional |
| `bc07945` | test: ampliar la aceptación móvil a las áreas de la Fase 2H |
| `815348a` | docs: actualizar el cierre del PR #28 |

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

Ejecutado sobre el HEAD final `bc07945`, después de sincronizar con `origin/main`.

| Comando | Resultado |
|---|---|
| `node --version` | `v22.23.1` |
| `npm --version` | `10.9.8` |
| `npm ci` | exit 0 (instalación limpia) |
| `npx tsc --noEmit` | Sin salida · **exit 0** |
| `npm run lint` | `✖ 53 problems (0 errors, 53 warnings)` · **0 errores** |
| `npm run build` | `precache 84 entries (7478.72 KiB)` · `dist/sw.js` generado · **exit 0** |
| `npx vitest run` | **92 archivos, 634 pruebas, 634 pasando** · 63,57 s |
| `npx playwright test` | **41 pruebas, 41 pasando** · 4,8 min · **exit 0** |
| `node scripts/inspect-exports.mjs` | 14 hojas XLSX y 3 PDF verificados |

### E2E por proyecto

| Proyecto | Pruebas | Resultado |
|---|---:|---|
| `chromium-desktop` (1920×1080) | 23 | 23 pasando |
| `chromium-mobile` (390×844) | 4 | 4 pasando |
| `firefox-desktop` (1440×900) | 14 | 14 pasando |
| **Total** | **41** | **41 pasando** |

### Inspección de exportaciones sobre el HEAD final

- **XLSX** — 14 hojas, incluida «Gastos (preparación)» con sus diez columnas.
- **PDF** `juego-completo`, `eepn-matriz`, `efe-directo` — los tres con título de estado y RT 54;
  pie con «Motor contable» y «esquema vNN»; **sin** `VALIDATED`, **sin** `schema v`, **sin** el id
  técnico del reporte, sin botones, sin papel de trabajo y sin hashes.

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

- **No se hizo merge a `main`.** `main` sigue en `a45b986`. El PR #28 queda listo para que lo mergee
  quien corresponda.
- **No se hizo deploy.**
- **No hubo rebase, squash ni reescritura de historia.** Las tres ramas de origen quedaron intactas.
- **No se usó `--force` ni `--force-with-lease`.** El push es normal, sobre una rama que sólo avanza.
- **No se modificó `main` directamente.**
- **No se saltearon ni se marcaron como skip pruebas** para conseguir verde. No hay `test.skip`,
  `describe.skip`, `fixme` ni reintentos artificiales (`retries: 0`).
- Los 53 warnings de lint son exactamente la baseline; **no se agregó ninguno** y hay 0 errores.
- Respaldo del estado previo en `backup/fase-2h-antes-de-sincronizar-main-1939201` y en el tag
  `backup-fase-2h-1939201`.
- El árbol termina limpio.
