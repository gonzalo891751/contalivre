# Fase 2K.1 — Refinamiento UX/UI del módulo de Consolidación

Informe de implementación · 3 de agosto de 2026

---

## 1. Entregables e identificación

| Dato | Valor |
|---|---|
| Rama | `feat/fase-2k1-refinamiento-ui-consolidacion` |
| HEAD | `ea384f2` |
| Base exacta | `9d6f237` (punta de `feat/fase-2k-consolidacion-estados-contables`, ya integrada con `origin/main` @ `a9179b3`) |
| Estado de `main` | **Intacto** |
| Árbol de trabajo | **Limpio** |
| Node / npm | v22.23.1 / 10.9.8 |
| Esquema Dexie | **v24, sin cambios** — esta fase no toca persistencia |

### Commits

| # | SHA | Hito |
|---|---|---|
| 1 | `ea384f2` | Sistema visual del módulo sobre los tokens de marca |
| 2 | *(este documento)* | Informe de la fase |

---

## 2. Criterio de rediseño

El diagnóstico no fue estético sino **de sistema**: el módulo de la Fase 2K se
resolvió con colores escritos a mano, **sin usar ni una sola vez** los tokens
2026 de ContaLivre. La auditoría lo confirmó:

```
var(--…) en el CSS del módulo:  0 usos
#64748b (gris apagado):        13 usos   ← el color más frecuente
#e2e8f0 / #cbd5e1 (bordes):    18 usos
```

De ahí venían los síntomas: gris dominante, dos únicos niveles de superficie
(blanco sobre gris), bordes de un solo peso y, por lo tanto, **ninguna
jerarquía**. Todo pesaba igual.

Cuatro decisiones guiaron el trabajo:

1. **Construir sobre el sistema, no al lado.** Hoja propia
   (`src/styles/consolidacion.css`) apoyada en los tokens de marca, con una capa
   del módulo: escala de superficies de **cuatro** niveles (lienzo → sección →
   tarjeta → dato), escala tipográfica explícita y acentos semánticos.
2. **Arreglar la información, no sólo el color.** El problema más grave no era
   cromático: dos de las seis "tarjetas KPI" no eran métricas sino identidad del
   grupo, y por eso competían con las cifras. Se movieron a un encabezado.
3. **Color con intención.** El azul profundo de la barra lateral es el color de
   autoridad (encabezado, cabeceras de tabla, nodo de la controladora). El acento
   vivo se reserva para lo accionable y lo activo. Nada comunica **sólo** por
   color.
4. **Un sistema de componentes.** Los patrones que el módulo repetía a mano
   pasan a `components/Consolidacion/ui.tsx`, para que la jerarquía sea una
   decisión del sistema y no de cada pantalla.

---

## 3. Antes: problemas

| # | Problema | Causa real |
|---|---|---|
| 1 | Pantalla gris y lavada | Cero tokens; `#64748b` como color más usado |
| 2 | Sin jerarquía entre bloques | Un solo nivel de superficie y un solo peso de borde |
| 3 | Tarjetas todas iguales | Mismo estilo para identidad y para métricas |
| 4 | KPIs poco expresivos | Cifra al mismo tamaño que el rótulo, sin icono ni tono |
| 5 | Navegación interna sin protagonismo | Pestañas finas, activo apenas marcado por un borde de 2 px |
| 6 | Ayuda pedagógica tosca | Cajas grises que parecían botones deshabilitados |
| 7 | Estructura del grupo mejorable | Participación y PNC como una cadena de texto concatenada |
| 8 | Estado general plano | El patrimonio neto consolidado no se distinguía del resto |
| 9 | Estado inicial vacío y frío | Todo centrado, párrafos largos en el eje, icono diminuto |
| 10 | **Tres columnas escondidas** | La columna fija «Consolidado» las tapaba |
| 11 | **Filas de total incorrectas** | En vista agrupada mostraban «—» en vez de la suma |

Los puntos **10 y 11 son defectos funcionales**, no cosméticos, y aparecieron al
revisar la pantalla con detenimiento. Ver §7.

---

## 4. Después: mejoras

### Encabezado del grupo (nuevo)

La identidad —grupo, controladora, ejercicio, cierre, período, moneda, unidad de
medida y estado de emisión— sale de las tarjetas y pasa a un encabezado propio
en el azul de marca, con los selectores integrados y un distintivo de estado
(«Listo para emitir» / «Emisión bloqueada»). El `h1` de la página deja de ser un
título genérico y pasa a ser **el nombre del grupo**.

### Tarjetas de métrica

Las seis cajas iguales se reducen a **cuatro métricas reales**, cada una con
cifra protagonista (29 px, `font-variant-numeric: tabular-nums`), rótulo
discreto, icono y barra de acento semántico. La rejilla ya no deja el hueco que
producía el 4 + 2.

### Navegación interna

Barra segmentada con superficie propia y sombra; el estado activo es un bloque
sólido en el azul de marca, no un subrayado de 2 px. Se desplaza en horizontal
en pantallas chicas sin romperse.

### Estructura del grupo

Árbol con conectores reales (línea vertical y codo). La participación, la PNC y
el carácter directo/indirecto pasan de cadena de texto a **chips**
individuales, legibles de un vistazo.

### Estado del grupo

Filas con contraste tipográfico, sangría para las dos que componen el
patrimonio, y el **patrimonio neto consolidado destacado sobre superficie
oscura**, como cierre visual del bloque. El veredicto pasa a ser un banner con
icono y explicación.

### Flujo de consolidación

«Cómo se llega al consolidado» deja de ser una lista plana y pasa a un **flujo
numerado con conector vertical**, con el último paso en verde. Responde
directamente a «la consolidación no es sólo una tabla, sino un flujo».

### Ayudas pedagógicas

Acordeón con marca de icono estable, cursor de despliegue que rota, acento al
abrirse y cuerpo con interlineado 1.62. La referencia normativa pasa a una
píldora. El contenido **sólo se monta al abrirse**.

### Estado inicial

Dos columnas: a la izquierda, texto alineado a la izquierda en medida legible
(56ch) con el CTA como acción principal; a la derecha, un **esquema sobrio de
controladora + controladas** con su pie explicativo. En móvil el esquema pasa
arriba.

### Papel de trabajo

- **Primera columna (Rubro) y última (Consolidado) fijas**: al desplazar en
  horizontal nunca se pierden ni la etiqueta de la fila ni la respuesta.
- **Bandas de columna**: origen · suma previa · ajustes · consolidado, con
  superficies distintas. La columna consolidada va sobre el acento.
- Cabecera en el azul de marca, filas con realce al pasar el puntero, totales
  con doble regla.

---

## 5. Componentes creados

`src/components/Consolidacion/ui.tsx`:

| Componente | Reemplaza a |
|---|---|
| `SectionCard` | `<section className="card">` + `<h3>` sueltos |
| `MetricCard` | La función local `Kpi` |
| `Chip` | `<span className="cons-tag">` repetido |
| `Callout` | `<div className="alert alert-info">` |
| `HelpAccordion` / `HelpGrid` | `HelpBlock` local, duplicado en tres pantallas |
| `ExecRow` / `ExecTotal` | `<dl>` con estilos ad hoc |
| `Verdict` | Mezcla de `<p className="cons-status-ok">` y `alert-warning` |

---

## 6. Pantallas modificadas

| Pantalla | Cambio |
|---|---|
| Estado inicial | Rediseño completo con esquema del grupo |
| Resumen del grupo | Encabezado, KPIs, árbol, estado ejecutivo, flujo y ayudas |
| Perímetro | Callout, sección con encabezado, chips de tratamiento |
| Preparación | Tarjeta de avance con leyenda de recuento, controles con chip |
| Papel de trabajo | Columnas fijas, bandas, vista agrupada por defecto |
| PNC | Cuatro métricas nuevas arriba, tabla en sección, celdas destacadas |
| Estados consolidados | Pestañas secundarias subrayadas, notas sobre superficie propia |

---

## 7. Dos defectos funcionales encontrados y corregidos

**DEF-2K1-01 · La columna fija «Consolidado» tapaba tres columnas.**
Al fijar la última columna, las de «Resultados no trascendidos», «Impuesto
diferido» y «Ajustes manuales» quedaban **debajo** de ella y sólo aparecían al
desplazar, sin ninguna señal de que existieran. La corrección no fue quitar el
anclaje —perderíamos la respuesta de vista— sino **invertir el valor por
defecto**: la hoja se abre con los ajustes agrupados en una sola columna, con lo
que entra entera en pantalla, y el desglose por tipo queda a un clic
(«Desglosar ajustes»).

**DEF-2K1-02 · Las filas de total mostraban «—» en la vista agrupada.**
La columna combinada de ajustes rendía un cero fijo en las filas de total, de
modo que la suma previa y el consolidado no reconciliaban a la vista. Ahora suma
las ocho columnas de ajuste. Verificado en pantalla, las cinco filas cierran:

| Fila | Suma previa | Ajustes | Consolidado |
|---|---|---|---|
| Total activo corriente | 1.687.000,00 | (298.000,00) | 1.389.000,00 |
| Total activo no corriente | 310.400,00 | (310.400,00) | — |
| Total pasivo corriente | 380.000,00 | (280.000,00) | 100.000,00 |
| Total patrimonio neto | 1.335.000,00 | (232.400,00) | 1.102.600,00 |
| Total resultados | 2.450.400,00 | (436.800,00) | 2.013.600,00 |

---

## 8. La lógica contable no cambió

`git status` sobre los directorios del motor no reporta **ningún** archivo
modificado:

```
src/consolidation/domain      src/consolidation/engine
src/consolidation/service.ts  src/consolidation/repository.ts
src/consolidation/fixtures    src/consolidation/export
src/accounting                src/reporting
```

Los cambios se limitan a `src/pages/ConsolidacionPage.tsx`,
`src/components/Consolidacion/*`, `src/styles/*`, `src/main.tsx` y el E2E.

**Los importes son los mismos**: activo consolidado 1.389.000,00 · patrimonio de
los propietarios 1.211.400,00 · PNC 77.600,00 · patrimonio neto consolidado
1.289.000,00 · resultado atribuible a los propietarios 186.400,00 · resultado
atribuible a la PNC 15.600,00.

---

## 9. Validación

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | **Limpio** |
| `npx vitest run` | **818 tests en 108 archivos, todos verdes** (sin variación) |
| — de los cuales, consolidación | **69** |
| `npx eslint .` | **0 errores**, 54 advertencias (todas preexistentes) |
| `npx vite build` | **OK** |
| `npx playwright test` | **67 verdes** en Chromium escritorio, Chromium móvil y Firefox |
| Purmamarca | **Intacto**: no se tocó ningún archivo del caso |
| Grupo Litoral | **Sin cambios de importes** |

### Sobre el E2E

Tres aserciones apuntaban al marcado viejo y se actualizaron **verificando lo
mismo sobre la estructura nueva**, sin debilitar nada:

| Antes | Ahora |
|---|---|
| Texto `80.00 % · participación directa · PNC 20.00 %` | Tres comprobaciones sobre el nodo del árbol: participación, PNC y carácter directo |
| `heading "Consolidación del grupo"` | `heading "Grupo Litoral"` + la controladora en el encabezado |
| `.cons-status-ok` | `.cons-verdict-ok` |

---

## 10. Responsive y accesibilidad

- **Notebook (1440)**: la rejilla de métricas baja a cuatro columnas cómodas y
  el papel de trabajo entra completo sin desplazamiento horizontal.
- **Tablet (≤1180)**: métricas a `minmax(190px, 1fr)`, cifra a 26 px.
- **Móvil (≤768)**: encabezado apilado con selectores a ancho completo, métricas
  a dos columnas, secciones con menos sangría; **≤480** pasa a una columna.
- El módulo **no ensancha el documento**: se conserva `contain: layout
  inline-size` en el contenedor de la grilla, la corrección de la Fase 2K que
  evitaba que el encabezado fijo se estirara en móvil. El E2E móvil lo verifica.
- Nada comunica sólo por color: los negativos van entre paréntesis y con prefijo
  «negativo» para lectores de pantalla; los estados llevan rótulo e icono.
- `aria-expanded` en acordeones y filas expandibles, `aria-controls` con `useId`,
  `caption` y `scope` en tablas, foco visible en todos los controles, y se
  respeta `prefers-reduced-motion`.

---

## 11. Limitaciones visuales todavía pendientes

1. **Sin modo oscuro.** El módulo sigue el modo claro de ContaLivre. Los tokens
   están listos, pero no hay tema oscuro en el producto.
2. **La tarjeta de estructura del grupo queda corta** frente a la de estado
   cuando hay una sola controlada: sobra espacio en blanco a su derecha. Con dos
   o más controladas se equilibra sola. No se forzó una altura pareja porque
   estirar contenido vacío es peor que el hueco.
3. **El esquema del estado inicial es fijo** (una controladora y dos
   controladas). Es una ilustración, no un diagrama de datos.
4. **Sin densidad configurable.** No hay conmutador cómodo/compacto para la
   grilla; quien trabaje con muchas entidades puede querer filas más ajustadas.
5. **La vista desglosada del papel de trabajo sigue requiriendo desplazamiento
   horizontal** con dos entidades y siete columnas de ajuste. Es correcto y las
   columnas fijas lo hacen llevadero, pero con cinco o más entidades la lectura
   se vuelve incómoda; haría falta congelar entidades o paginarlas.
6. **Las pantallas que la Fase 2K no construyó siguen sin existir**: no hay
   editor de conciliación intragrupo ni de ajustes manuales. Esta fase mejoró lo
   que había; no agregó funcionalidad.
7. **Sin animaciones de transición entre pestañas.** Fue deliberado: se
   priorizó respuesta inmediata sobre movimiento.

---

## 12. Evidencia

Capturas antes y después en:

```
docs/evidence/phase2k1/antes/     9 capturas (escritorio y móvil)
docs/evidence/phase2k1/despues/   9 capturas equivalentes
```

Y la evidencia del E2E de la Fase 2K, regenerada con el diseño nuevo, en
`docs/evidence/phase2k/screenshots/`.
