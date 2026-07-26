# Fase 2H — Cobertura sectorial, anexos contables e integración de Operaciones

> **Estado: PARCIAL.** Se implementaron y verificaron los hitos H0, H1, H2, H3, H4, H8, H9 y H10.
> Los hitos H5, H6, H7, H11 y H12 **no se implementaron** en esta entrega y se detallan en
> «Alcance no cubierto». Este informe no declara terminada la fase.

---

## 1. Identificación

| Dato | Valor |
|---|---|
| Rama | `refactor/fase-2h-cobertura-sectorial-anexos-operaciones` |
| Base | `6152ea8` (merge PR #25, Fase 2G) |
| HEAD final | `54a4c720d8807c3e2faaa448e32b4d5758e3ac61` |
| Estado de `main` | **Intacto en `6152ea8`.** Sin merge, sin rebase, sin push |
| Árbol de trabajo | Limpio (`git status --porcelain` vacío) |
| Esquema inicial | 22 |
| Esquema final | **22 (sin elevar)** |
| Versión de app | `0.5.0-rc.1` (sin cambios) |
| Diff vs `main` | 24 archivos, +3682 / −895 |

### Desvío de entorno que debés conocer

El proyecto fija Node **22.23.1** (`.nvmrc`, `.node-version`, `engines: >=22 <23`).
En esta máquina el único Node instalado es **v25.9.0** (`D:\Archivos de programas\NODE 4s\node.exe`),
sin `nvm`, `fnm` ni `volta`. No instalé nada para no alterar tu entorno.

**Todo lo reportado corre bajo Node 25.9.0 / npm 11.12.1.** La suite completa, el lint y el build
pasan, pero el criterio «las nuevas pruebas pasan en Node 22» **no está verificado en Node 22**.
Recomiendo re-ejecutar el gate con Node 22 antes de dar la fase por buena.

---

## 2. Diagnóstico previo (estado real al inicio)

| Verificación | Resultado |
|---|---|
| Rama inicial | `main` |
| Árbol de trabajo | **Limpio** |
| Tests unitarios | 466 pasando (74 archivos) |
| Lint | **0 errores**, 53 warnings |
| `tsc --noEmit` | Limpio |
| Build | OK |
| Motor canónico | Operativo: `loadReportingBundle` es la única puerta |

Observación relevante: la rama `refactor/fase-2g1-cierre-efe` (`bbf22b8`, sobre `0fe88ad`) **sigue sin
mergear**. Trae el EFE en moneda de cierre en la preparación, disposiciones a crédito y el seed
Purmamarca. La Fase 2H se basó en `main` como pediste, así que **ese trabajo no está incluido acá**.

Nota: la memoria del proyecto decía «98 errores de lint preexistentes». Ya no es cierto: hoy son **0
errores**. Actualicé ese dato.

---

## 3. Errores reproducidos y su causa real

### 3.1 Controles segmentados que se vuelven texto plano (§3.A y §3.B)

No era CSS frágil, ni Tailwind, ni hidratación. Era **una sola clase de bug en dos lugares: el CSS
vivía dentro de un `<style>` cuya vida dependía de una rama de renderizado.**

**EFE** — `FlujoEfectivoCanonicalTab.tsx:217` (antes):

```jsx
if (view === 'PREPARACION') {
    return (
        <div>
            {viewSwitch}
            <PreparacionEfe bundle={bundle} />
            <style>{statementStyles}</style>   {/* ← faltaba efeStyles */}
        </div>
    )
}
```

La rama de exposición emitía `<style>{statementStyles}{efeStyles}</style>`. Las reglas
`.efe-segmented*` del conmutador vivían **sólo** en `efeStyles`. Al pasar a Preparación el botón se
quedaba sin ninguna regla → «ExposiciónPreparación» como texto corrido.

**EEPN** — `CanonicalTabs.tsx:137-144` (antes): los botones `.eqm-filter-btn` se dibujaban en
`EEPNCanonicalTab`, pero su CSS estaba dentro de `EquityMatrixView`. Al elegir «Vista resumida» ese
componente **se desmontaba**, su `<style>` desaparecía del DOM y quedaba «Vista matricialVista
resumida». Esto explica por qué el usuario lo veía «en algunas condiciones»: sólo en la vista resumida.

### 3.2 Importes fantasma (§13)

La causa **no** era datos demo, seeds, localStorage, registros huérfanos ni falta de filtros.

`OperacionesPage.tsx:644` tenía el importe **escrito a mano en el JSX**:

```jsx
<div className="text-xs text-slate-500">Saldo a pagar</div>
<div className="font-mono text-lg font-bold text-slate-900">$ 320.000</div>
```

Lo mismo con `<Warning /> 2 Vencimientos` (línea 638) y el guión fijo de Clientes (línea 605).

Como agravante real, la página **sí** hacía contabilidad paralela: `db.entries.toArray()` sin filtrar
`companyId` ni `status`, con aritmética propia de ventas y CMV (`computeFromEntries`, líneas 188-229).
Un borrador o el ejercicio de otra empresa alteraban la portada.

### 3.3 Pestañas de anexos deshabilitadas (§7)

`NotesAndAnnexesTab.tsx:196`: `disabled={!available[t.id]}` con `title="Sin datos aplicables en este
ejercicio"`. La pestaña quedaba gris e **inalcanzable**. El caso más claro es moneda extranjera:
`ForeignCurrencyView` **ya tenía escrito** su estado vacío, pero era imposible llegar a leerlo.

---

## 4. Decisiones arquitectónicas

### ADR-2H-01 — El CSS de un control común no puede vivir en un `<style>` de componente

**Contexto.** Dos bugs idénticos causados por acoplar la vida del CSS a una rama de renderizado.
**Decisión.** Un único `SegmentedControl` (`src/ui/SegmentedControl.tsx`) sin `<style>` propio; sus
reglas `.cl-seg*` viven en `src/styles/index.css`, la hoja global importada una sola vez en
`main.tsx`.
**Consecuencia.** El diseño del control ya no puede depender de que un hermano esté montado. Una
prueba impide volver a definir `.cl-seg*` dentro de un componente.
**Alternativa descartada.** Parchear la rama que faltaba: arregla el síntoma y deja la trampa puesta.

### ADR-2H-02 — Toda cifra de Operaciones deriva del bundle canónico

**Decisión.** `src/reporting/operationsSelectors.ts` agrupa `bundle.statements.trialBalance` por
`statementGroup`. No consulta Dexie ni hace aritmética contable nueva.
**Consecuencia.** Hereda **sin repetirlos** los filtros de `getEntriesForContext`: sólo
`status !== 'DRAFT'`, sólo la empresa del contexto, sólo el rango del ejercicio. Los filtros correctos
dejan de ser algo que cada pantalla deba recordar.

### ADR-2H-03 — Un plan de cuentas con extensiones, no cinco planes

**Decisión.** Núcleo común (el seed actual) más extensiones sectoriales aditivas. Las cuentas
sectoriales son cuentas normales del mismo plan, con los mismos metadatos, y las cifras las sigue
produciendo `loadReportingBundle`.
**Consecuencia.** No hay un segundo motor ni ramas de cálculo por actividad.

### ADR-2H-04 — La adaptación sectorial es de exposición, no del modelo

**Decisión.** El vocabulario (`EXPOSURE_VOCABULARY`) cambia denominaciones visibles; la aritmética es
idéntica. Una asociación civil expone «Estado de Recursos y Gastos», «Recursos» y «superávit o
déficit», pero el resultado se calcula igual.
**Política de conflicto.** Si conviven varios perfiles, `NONPROFIT` manda: una entidad no puede
exponer «ventas» y «recursos» a la vez.

### ADR-2H-05 — Activación aditiva, desactivación no destructiva

**Decisión.** Activar un perfil **sólo agrega** cuentas faltantes, resueltas por código contra el plan
real. Desactivar **nunca borra**.
**Consecuencia.** Si ya existe una cuenta con ese código (tuya o del núcleo) se **reutiliza** y se
respeta su nombre. Cambiar de perfil no puede destruir información contable.

---

## 5. Migraciones

**No se elevó el esquema. Sigue en la versión 22.**

No hizo falta: las cuentas sectoriales son filas normales de `accounts` y el perfil activo se guarda
en `settings` bajo la clave `sector-profiles`. Dexie sólo versiona *stores* e *índices*, y no se
agregó ninguno. El campo `Account.sectorProfile` es un campo de registro no indexado.

La incorporación de cuentas es una migración de datos **explícita y bajo demanda** (la dispara el
usuario desde Configuración), no automática al abrir la app. Es determinística, idempotente y
compatible con datos anteriores. Está probada: activar dos veces no crea ninguna cuenta nueva y
ningún código queda repetido en el plan.

---

## 6. Cuentas agregadas por perfil

| Perfil | Cuentas | Rango de códigos |
|---|---:|---|
| Comercial (núcleo) | — | Seed existente, sin cambios |
| Servicios | 4 | `4.3.08*` |
| Industrial | 9 | `1.1.10*`, `4.3.07*` |
| Agropecuaria | 19 | `1.1.07*`, `1.1.08*`, `1.2.06*`, `4.1.06`, `4.3.06`, `4.6.10`, `4.6.11`, `4.7.10`, `4.7.11` |
| Sin fines de lucro | 26 | `1.1.09*`, `2.1.08*`, `3.5*`, `4.1.10*`, `4.4.10*`, `4.5.20*` |

**Colisión real detectada y corregida.** El código `4.5.10` ya era «Impuestos y tasas» en el núcleo.
Los gastos institucionales de ONG se movieron a `4.5.20`; de lo contrario la cuenta hija habría
quedado colgada de un rubro ajeno. Se agregó una prueba que compara **todo** el catálogo sectorial
contra los códigos del seed para que no vuelva a pasar.

Cada cuenta declara: rubro (`statementGroup`), corriente/no corriente, clasificación monetaria para la
reexpresión, categoría de EFE, función del gasto cuando aplica, nota y anexo. Sin esos metadatos la
cuenta existiría pero no llegaría a los estados.

Cobertura agropecuaria: activos biológicos corrientes y no corrientes, en crecimiento, desarrollo y
terminados destinados a la venta, con regularizadora de desvalorización; productos agropecuarios
obtenidos, materias primas e insumos, producción en proceso; hacienda reproductora y plantaciones
permanentes con depreciación acumulada; ventas y costo de productos agropecuarios; **resultado por
producción separado del resultado por tenencia**; mermas y subsidios.

Cobertura sin fines de lucro: créditos por cuotas sociales con previsión; fondos con destino
específico como **pasivo** hasta cumplir la afectación; patrimonio social con fondos restringidos y
bienes recibidos por donación; recursos por cuotas, donaciones, subsidios, campañas y prestaciones;
gastos separados entre programas y administración.

---

## 7. Cambios en Operaciones

Se retiraron, como pedía §12: las cuatro tarjetas de KPI (Ventas del mes, CMV del mes, Margen bruto,
Caja disponible) y los botones globales «Registrar venta» / «Registrar compra», que duplicaban caminos
ya existentes dentro de cada módulo.

La portada quedó organizada por procesos: Activos y tenencias · Ventas, créditos y cobranzas ·
Compras, gastos y proveedores · Personal y obligaciones sociales · Financiamiento e impuestos.

Cada tarjeta muestra qué hace el módulo, qué importe informa, cuántos asientos del ejercicio lo
movieron y qué genera en el Libro Diario. Los estados son explícitos y **no se comunican sólo por
color**: «Con movimientos», «Sin movimientos» y «Requiere configuración» (ninguna cuenta mapeada al
rubro, que antes se confundía con un cero legítimo).

Las tarjetas pasaron de `div` clickeables a `Link` reales, con foco visible.

Se normalizó el **cero negativo**: negar un saldo acreedor nulo producía `-$ 0,00`.

---

## 8. Moneda extranjera y anexos

Las cinco subpestañas de Notas y Anexos son ahora **siempre navegables**. La falta de datos se marca
con la leyenda «sin datos» (texto, no sólo color, en una píldora visualmente separada) y adentro cada
anexo muestra un `EmptyState` con motivo, origen de los datos y acción sugerida.

Se agregó `src/ui/EmptyState.tsx` como componente común, con `role="status"`.

---

## 9. Accesibilidad

- `SegmentedControl`: `radiogroup` + `radio`, roving tabindex, flechas ↑↓←→ que saltan opciones
  deshabilitadas, foco visible, y **motivo obligatorio** para toda opción deshabilitada (expuesto como
  `title` y como descripción accesible).
- El estado activo no se comunica sólo por color: suma fondo, peso y un subrayado.
- Soporte de `prefers-reduced-motion` y de tema oscuro en el control común.
- Estados vacíos y avisos con `role="status"`.
- Importes con `tabular-nums` alineados a la derecha, formato es-AR.

---

## 10. Fixtures creados

`src/accounting/fixtures/sectorFixtures.ts` — **no se cargan automáticamente**, se invocan explícitamente.

- `loadAgroFixture()` (ej. 2026): aporte inicial, compra de insumos, aplicación a la sementera,
  resultado por producción sin venta, cosecha, venta a crédito, costo de lo vendido y merma.
- `loadNonprofitFixture()` (ej. 2026): cuotas devengadas y cobradas, donación, subsidio con cargo de
  rendición, aplicación del subsidio, gasto administrativo, gasto de actividad deportiva y
  adquisición de un bien de uso.

---

## 11. Commits

| SHA | Hito | Descripción |
|---|---|---|
| `773f054` | H1 | Unificar controles segmentados de EFE y EEPN |
| `74ff594` | H9, H10 | Eliminar importes fantasma y rehacer la portada de Operaciones |
| `582467c` | H2, H3, H4 | Cobertura sectorial agropecuaria y sin fines de lucro |
| `54a4c72` | H8 | Pestañas de Notas y Anexos navegables con estado vacío |

---

## 12. Archivos principales

**Nuevos**
- `src/ui/SegmentedControl.tsx`, `src/ui/EmptyState.tsx`, `src/ui/ModuleStatusBadge.tsx`
- `src/reporting/operationsSelectors.ts`
- `src/core/sectorProfiles/types.ts`, `src/core/sectorProfiles/catalog.ts`
- `src/storage/sectorProfiles.ts`, `src/hooks/useSectorProfiles.ts`
- `src/components/Configuracion/panels/SectorProfilesPanel.tsx`
- `src/accounting/fixtures/sectorFixtures.ts`

**Modificados**
- `src/pages/OperacionesPage.tsx` (reescrito), `src/pages/ConfiguracionPage.tsx`
- `src/components/Estados/canonical/{FlujoEfectivoCanonicalTab,CanonicalTabs,EquityMatrixView,NotesAndAnnexesTab}.tsx`
- `src/styles/index.css`, `src/core/models.ts`

---

## 13. Pruebas

| Archivo | Pruebas | Cubre |
|---|---:|---|
| `tests/ui/segmented-control-2h.test.tsx` | 15 | Comportamiento accesible del control + invariante de CSS |
| `tests/acceptance/operaciones-sin-importes-fantasma.test.ts` | 13 | Cero sin fantasmas, borrador, empresa, apertura, reversión |
| `tests/accounting/sector-profiles-2h.test.ts` | 18 | Catálogo, idempotencia, no duplicación, preservación |
| `tests/reporting/sector-coverage-2h.test.ts` | 17 | Agro y ONG llegan a ESP, ER, EFE y EEPN |
| `tests/ui/annex-tabs-2h.test.ts` | 6 | Pestañas navegables y estado vacío |

### Resultado exacto del gate

```
npx vitest run    → 79 archivos, 535 pruebas, 535 pasando (baseline 466)
npm run lint      → 53 problemas: 0 errores, 53 warnings (igual que la baseline)
npx tsc --noEmit  → limpio
npm run build     → OK (exit 0)
E2E Playwright    → NO EJECUTADO en esta entrega
```

---

## 14. Verificación manual realizada

No me apoyé sólo en tests verdes. Levanté la app y comprobé en el DOM:

1. **EFE.** En Exposición los cuatro controles tienen caja, borde, radio y padding reales. Al pasar a
   Preparación el conmutador **conserva** su diseño (`display:flex`, `border:solid`,
   `border-radius:10px`, `padding:7px 16px`) y el estado activo se mueve correctamente.
2. **EEPN.** El conmutador conserva su caja tanto en «Vista matricial» como en «Vista resumida», que
   era el caso roto.
3. **Operaciones con empresa vacía.** Todos los módulos informan `$ 0,00`. No aparece `320.000`, no
   aparece la palabra «Vencimientos» y **no hay ningún importe con signo negativo**.
4. **Perfiles.** Activar «Entidad sin fines de lucro» incorporó 26 cuentas y la exposición cambió en
   vivo a «Estado de Recursos y Gastos». La pestaña de Resultados pasó a titularse así.
5. **Anexos.** Las cinco subpestañas abren (`disabled: false`) y Moneda extranjera muestra su
   explicación completa.

**Advertencia metodológica.** Durante la verificación observé el estado activo/inactivo *invertido* en
`getComputedStyle`. Investigado a fondo: es un artefacto del panel de vista previa, que al no componer
frames congela las transiciones CSS en su valor inicial. Neutralizando `transition` los valores son
correctos. **No es un bug de la aplicación**, pero conviene saberlo si medís estilos por script.

---

## 15. Alcance NO cubierto

Estos hitos del pedido **no se implementaron**. No los di por hechos ni los declaré parcialmente listos.

| Hito | Estado | Detalle |
|---|---|---|
| **H5** — Motor de gastos por función | **No implementado** | Ya existía de la Fase 2E: reglas versionadas por cuenta (`ExpenseAllocationRule`), validación de suma exacta a 100 % y editor en Configuración. **No hay prorrateo fijo 60/40 cableado** (lo verifiqué). **Falta** lo que pedía §8: bases de distribución por empleados, superficie, horas y unidades producidas; hoy sólo hay porcentajes fijos. |
| **H6** — Anexo de costo por actividad | **No implementado** | Existe `costOfSales` con modos y componentes (Fase 2E/2F). **Falta** la adaptación explícita a industria, servicios y agro, y el subtotal derivado de costo de producción. Las cuentas de costo agro/industrial/servicios **ya existen** (H2-H4), pero el anexo no las presenta de forma diferenciada. |
| **H7** — Integración de bienes de uso | **No implementado** | No se unificó el circuito Operaciones → planilla de amortizaciones → anexo. Sigue siendo el punto más débil. |
| **H8** — Anexo de moneda extranjera | **Parcial** | Se resolvió la accesibilidad (pestaña navegable + estado vacío). **No** se auditó ni amplió el contenido del cuadro (columnas de política de cotización, fecha, conciliación ampliada). |
| **H11** — Exportaciones | **No implementado** | No se verificó ni se agregaron pruebas de que PDF y XLSX coincidan con pantalla para los anexos nuevos. |
| **H12** — E2E y accesibilidad automatizada | **No implementado** | No se agregaron specs de Playwright ni se corrió la suite E2E existente. La accesibilidad se implementó pero se verificó por unit test y por DOM, no con E2E en Chromium y Firefox. |

---

## 16. Deuda técnica y riesgos

1. **Node 22 sin verificar** (riesgo medio). Todo corrió en Node 25.9.0. Re-ejecutar el gate en 22.
2. **E2E sin correr** (riesgo medio). No sé si las suites existentes siguen verdes tras rehacer
   `OperacionesPage`. Es lo primero que revisaría.
3. **Rama 2G.1 sin mergear** (riesgo medio). Si esperabas ver el EFE de preparación en moneda de
   cierre, no está en esta rama porque no está en `main`.
4. **Perfil sectorial global, no por empresa** (riesgo bajo). Se guarda en `settings`, no por
   `companyId`. Con varias empresas compartirían perfil.
5. **`ForeignCurrencyView` sigue con su CSS en un `<style>` local** (riesgo bajo). Hoy es correcto
   porque markup y CSS son del mismo componente, pero es el mismo patrón que causó los bugs de H1.
6. **Warnings de lint** (riesgo bajo). Siguen 53, iguales a la baseline. No introduje ninguno nuevo.

---

## 17. Cómo probarlo, paso por paso

```bash
git checkout refactor/fase-2h-cobertura-sectorial-anexos-operaciones
```

```bash
npm run dev
```

**A. Controles segmentados (criterios 1 y 2)**
1. Entrá a `/estados` → pestaña **Flujo de Efectivo**.
2. Mirá los controles Vista / Método / Expresión / Modo: son botones con caja.
3. Pasá a **Preparación**. El conmutador debe seguir siendo un control segmentado, no texto corrido.
4. Andá a **Evolución PN**, elegí **Vista resumida**. El conmutador debe conservar su caja.
5. Probá con teclado: Tab hasta el control y movete con ← →.
6. En Expresión, pasá el mouse por «Moneda de cierre» deshabilitada: debe explicar por qué.

**B. Sin importes fantasma (criterio 9)**
1. Entrá a `/operaciones` con un ejercicio sin asientos.
2. Verificá: todos los módulos en `$ 0,00`, **ningún** `$ 320.000`, **ningún** «Vencimientos»,
   **ningún** `-$ 0,00`, y el aviso que explica por qué todo está en cero.
3. Cargá un asiento en `/asientos` (p. ej. Mercaderías a Proveedores por 150.000) y **contabilizalo**.
4. Volvé a `/operaciones`: Proveedores debe mostrar `$ 150.000` y «Con movimientos».
5. Dejá otro asiento **en borrador**: la portada **no** debe moverse.

**C. Perfiles sectoriales (criterios 3 y 4)**
1. Andá a `/configuracion?seccion=plan-cuentas` → **Perfiles de actividad**.
2. Activá **Agropecuaria**: informa cuántas cuentas incorporó.
3. Volvé a activarla: debe decir que ya estaban y **no duplicar** nada (comprobalo en `/cuentas`).
4. Activá **Entidad sin fines de lucro** y andá a `/estados` → **Resultados**: el título debe pasar a
   **«Estado de Recursos y Gastos»**.
5. Desactivá el perfil y confirmá en `/cuentas` que **las cuentas siguen ahí**.

**D. Anexos (criterio 8)**
1. `/estados` → **Notas y Anexos**.
2. Las cinco subpestañas deben abrir, incluso marcadas «sin datos».
3. Abrí **Moneda extranjera**: debe explicar por qué no hay partidas y de dónde saldrían.

**E. Gate**
```bash
npx vitest run
```
```bash
npm run lint
```
```bash
npm run build
```

---

## 18. Confirmación

- **No se hizo merge.** `main` sigue en `6152ea8`.
- **No se hizo deploy.**
- **No hubo rebase, squash ni reescritura de historia.**
- **No se borraron datos** ni se reemplazó el motor contable canónico.
- El árbol de trabajo terminó **limpio**.
