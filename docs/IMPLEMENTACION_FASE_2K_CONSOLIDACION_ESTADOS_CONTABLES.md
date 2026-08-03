# Fase 2K — Consolidación de estados contables

Informe de implementación · 2 de agosto de 2026
**Actualizado tras la integración de la Fase 2J** (ver §1 bis)

> **Aviso de vigencia.** Las secciones §2 a §13 se escribieron ANTES de que la
> rama objetivo avanzara: en ese momento `main` estaba en `c82dc04` y la Fase 2K
> ocupaba el esquema v23. La Fase 2J se integró después (PR #31) y se quedó con
> la v23, de modo que la consolidación pasó a **v24**. Donde el texto original
> dice «v23» refiriéndose a las tablas de consolidación, léase **v24**. Los
> importes, los casos de la planilla y las conclusiones contables NO cambiaron:
> se reverificaron íntegramente después del merge (§1 bis).

---

## 1. Entregables e identificación

| Dato | Valor |
|---|---|
| Rama | `feat/fase-2k-consolidacion-estados-contables` |
| HEAD final | `6eb8fe0` |
| Rama objetivo integrada | `origin/main` @ `a9179b3` (merge del PR #31 — Fase 2J) |
| Base original de la fase | `c82dc04` (`main`, merge del PR #30 — Fase 2I) |
| merge-base anterior | `c82dc04` |
| Estado de `main` | **Intacto**, en `a9179b3`. Sin merge, sin deploy, sin reescritura de historia |
| Árbol de trabajo | **Limpio** |
| Node / npm | **v22.23.1** / 10.9.8 (`C:\Tools\node-v22.23.1-win-x64`) |
| Esquema Dexie | v22 → v23 (Fase 2J) → **v24** (Fase 2K, `v24-fase2k-consolidacion`) |

### Commits atómicos

Los siete commits originales de la fase se conservan intactos: no hubo rebase,
squash, cherry-pick ni force push.

| # | SHA | Hito |
|---|---|---|
| 1 | `e1df8e6` | Contexto de reporting por entidad del grupo |
| 2 | `d263969` | Dominio, esquema y persistencia del grupo económico |
| 3 | `7268d3a` | Motor de eliminaciones, PNC y resultados no trascendidos |
| 4 | `73b34b2` | Estados consolidados, servicio y dataset Grupo Litoral |
| 5 | `42307ac` | Página del módulo, ayudas pedagógicas y exportaciones |
| 6 | `fc22d84` | E2E del recorrido completo y corrección de desborde móvil |
| 7 | `b4fa168` | ADR, informe de la fase y registro de defectos |

Y los tres de la integración:

| # | SHA | Hito |
|---|---|---|
| 8 | `7e5b2eb` | **Merge** de `origin/main` (Fase 2J): esquema v24 y convivencia |
| 9 | `f621615` | El menú móvil queda alineado con la barra lateral |
| 10 | `6eb8fe0` | Navegación resiliente en el paso 10 de la auditoría del ciclo |

---

## 1 bis. Integración de la Fase 2J

### Relevamiento del remoto

| Dato | Valor |
|---|---|
| Rama objetivo del PR | `main` |
| HEAD remoto al integrar | `a9179b3` — *Merge pull request #31 … fase-2j* |
| HEAD de la rama 2K antes | `b4fa168` |
| merge-base | `c82dc04` (sin cambios: la 2K nunca se había actualizado) |
| ¿La Fase 2J está integrada? | **Sí.** Cuatro commits (`3bd48b6`, `793f1e2`, `3bc4f77`, `187345a`) más el merge |
| ¿Qué fase introdujo la v23? | **La Fase 2J**, con `v23-closing-measurements` (tabla `closingMeasurements`) |
| ¿El informe anterior quedó desactualizado? | **Sí**, y por eso este aviso encabeza el documento |

La Fase 2J aportó: núcleo único de controles (`closingReadiness`), servicio de
medición a valores corrientes, página `/pre-cierre`, reexpresión de la
depreciación ficha por ficha y el retiro de la planilla AxI.

### Por qué la Fase 2K pasó de v23 a v24

La v23 de la Fase 2J **ya está en `main` y ya corrió en instalaciones reales**.
Reasignar esa numeración dejaría bases que ejecutaron «la v23» sin ninguna forma
de saber cuál de las dos migraciones aplicaron: el `lastMigrationId` diría una
cosa y las tablas presentes, otra. La numeración de una migración publicada es
inmutable por definición, así que la consolidación pasa íntegramente a **v24**,
que se ejecuta DESPUÉS de la v23 y nunca en su lugar.

### Conflictos y resolución, archivo por archivo

| Archivo | Conflicto | Resolución |
|---|---|---|
| `src/accounting/migration/migrateV23.ts` | add/add: ambas fases crearon el archivo | Se conserva **íntegra** la versión de la Fase 2J. El contenido de la 2K se traslada a `migrateV24.ts` con `MIGRATION_V24_ID = 'v24-fase2k-consolidacion'` |
| `src/storage/db.ts` | Ambas añadían import, declaración de tabla y bloque de versión | **Conviven los dos bloques.** `closingMeasurements` (2J) y las ocho tablas de consolidación (2K); `version(23)` y `version(24)` separadas, cada una con su upgrade. Ninguna tabla se reutiliza con otro significado; sin índices duplicados |
| `src/reporting/loadStatements.ts` | 2J añadía las fichas de bienes de uso; 2K, el parámetro `companyId` | **Conviven.** Y como `db.fixedAssets` tampoco lleva dimensión de empresa, se le aplica la MISMA guarda honesta que ya tenía moneda extranjera |
| `src/ui/Layout/Sidebar.tsx` | Ambas añadían un icono y una entrada | **Conviven** «Pre-cierre y medición» (2J) y «Consolidación» (2K), en ese orden, y se mantiene el retiro de la planilla AxI. La 2K aliasaba `TreeStructure`, que el mismo menú ya usa para «Plan de Cuentas»: se cambia por `Buildings` |
| `tests/accounting/migration-chain-2f.test.ts` | Ambas extendían la cadena | **Se extiende, no se reescribe** (ver abajo) |

`src/reporting/loadReportingBundle.ts`, `src/App.tsx` y `docs/auditoria/REGISTRO_DEFECTOS.md`
se auto-fusionaron sin conflicto y se verificó que conservaran ambas fases.

### Decisión semántica adicional: las fichas de bienes de uso

La Fase 2J agregó `db.fixedAssets.toArray()` a `loadReportingInput` para
reexpresar la depreciación bien por bien. Esa tabla **no tiene `companyId`**,
igual que el detalle de moneda extranjera. Cargarla sin más para una controlada
le habría atribuido las fichas de la controladora y su depreciación reexpresada
habría sido incorrecta **sin ningún aviso**. Se aplicó la misma guarda ya
existente: para una entidad distinta de la por defecto se informa **sin** ese
detalle, en lugar de atribuirle activos ajenos. Queda registrado en §11.7.

### La cadena de migraciones

`tests/accounting/migration-chain-2f.test.ts` ahora cubre **cuatro puntos de
partida reales**, sin perder cobertura anterior:

| Escenario | Qué verifica |
|---|---|
| v16 legacy → v24 | La data sobrevive a TODAS las migraciones; v23 y v24 corren **en ese orden** |
| v22 → v24 | Corren exactamente una v23 y una v24; la data legacy sobrevive |
| v23 → v24 | Corre **ÚNICAMENTE** la v24. La v23 no se repite (sigue con una sola ejecución) y una medición de la 2J escrita antes del upgrade **sigue intacta** |
| v24 → v24 | Reabrir **no vuelve a migrar**; un grupo económico escrito por el usuario sigue ahí |

Convivencia verificada: existe `closingMeasurements` (2J) y existen las ocho
tablas de consolidación (2K), y ninguna migración crea datos por su cuenta.

### Verificación posterior a la integración

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | **Limpio** |
| `npx vitest run` | **818 tests en 108 archivos, todos verdes** |
| — de los cuales, Fase 2K | **69 tests en 5 archivos** |
| `npx eslint .` | **0 errores**, 54 advertencias (todas preexistentes; en los archivos tocados por la integración, sólo la de `navGroups` en `Sidebar.tsx`, que ya venía de `main`) |
| `npx vite build` | **OK** (advertencia de tamaño de chunk, preexistente) |
| `npx playwright test` | **67 tests verdes** en Chromium escritorio, Chromium móvil y Firefox. Dos corridas completas consecutivas |
| Migración desde base limpia y desde bases previas | Cubierta por los cuatro escenarios de la cadena |

**Purmamarca no cambió.** Los seis archivos del caso son **byte a byte
idénticos** a los de la rama objetivo (verificado con `git hash-object` contra
`git rev-parse origin/main:<archivo>`), y sus once tests siguen reproduciendo los
importes exactos, incluido «reproduce EXACTAMENTE los importes esperados del EFE».

**Grupo Litoral sigue funcionando.** Los 69 tests de consolidación pasan sin
cambios. Reverificado tras el merge, reconstruyendo el cálculo:

| Magnitud | Valor |
|---|---|
| Resultado consolidado atribuible a los propietarios | **186.400,00** = resultado individual de la controladora |
| Resultado atribuible a la PNC | 15.600,00 |
| PNC al cierre | 77.600,00 |
| PNC de los casos descendentes (hojas 06–08) | **49.900,00** patrimonio y **10.900,00** resultado, iguales en los tres |
| Activo consolidado | 1.389.000,00 |
| Efectivo consolidado al cierre | 87.000,00 |

Los ocho casos de las hojas 01–08 y la validación independiente de «9 Resumen»
vuelven a pasar, igual que las operaciones ascendente, descendente y lateral, la
realización total y parcial, la eliminación inversión contra PN, los recíprocos,
los dividendos, los préstamos con intereses y el EFE consolidado.

**El invariante extracontable se mantiene:** el test que compara `db.entries`
byte a byte antes y después de consolidar sigue verde.

### Un defecto encontrado durante la integración

**DEF-2K-04 — carrera de navegación en el paso 10 de `auditoria-ciclo-completo`
(test de la Fase 2J).** Fallaba con `net::ERR_ABORTED` al navegar a `/asientos`
saliendo del panel de cierre con la lectura del núcleo de controles en vuelo. No
es un defecto del producto: en un navegador real el usuario no pierde la
navegación, se cancela la lectura.

El diagnóstico se hizo midiendo, no suponiendo: en `origin/main` pasó 2 de 2
corridas; en esta rama falló 3 de 4. La diferencia es el ancho de la ventana de
la carrera — la v24 agrega ocho almacenes, con lo que abrir IndexedDB tarda más
y la lectura sigue en vuelo más tiempo. `waitForLoadState('networkidle')` no
alcanza, porque la petición que aborta puede arrancar después de que la red
quedó quieta. Se resolvió reintentando la navegación una vez ante `ERR_ABORTED`,
**sin tocar ninguna aserción**. Dos corridas completas consecutivas: 67/67.

---

---

## 2. Auditoría previa: el estado real del repositorio

Antes de escribir código se midió el punto de partida.

| Medición | Resultado |
|---|---|
| Tests al inicio | **719 en 101 archivos, todos verdes** |
| `tsc --noEmit` | Limpio |
| `vite build` | OK (advertencia de tamaño de chunk, preexistente) |
| Esquema vigente | v22 (`cashFlowPolicies`, Fase 2G) |

### Divergencias entre la documentación y el repositorio

1. **`docs/AI_HANDOFF.md` y la memoria del proyecto declaraban 634 tests** (cifra
   de la Fase 2H). El repositorio tiene 719 en `main`.
2. **El lint no tiene "98 errores preexistentes"** como afirmaba la memoria:
   `npx eslint .` da **0 errores y 53 advertencias**.
3. **La aplicación era mono-empresa de hecho**, aunque el modelo de datos
   aparentaba soportar varias:
   - `resolveContextForYear` fijaba `DEFAULT_COMPANY_ID` sin parámetro;
   - `exerciseIdForYear(year)` devolvía `exercise-company-default-<año>` por
     construcción, ignorando el `companyId` que recibía `buildAnnualExercise`:
     **dos entidades no podían tener ejercicio propio para el mismo año**;
   - `loadReportingBundle` tomaba la empresa con
     `db.companies.toCollection().first()`;
   - `createDraftEntry` y `postOperation` forzaban la empresa por defecto;
   - `hasFormalOpeningEntry` no filtraba por empresa.
4. **El código de cuenta es único en TODA la base** (`accounts: 'id, &code, …'`),
   no por empresa. Condiciona el modelo de planes de cuentas (ver §11).

Ésta era la limitación real para admitir varias entidades en un grupo, y fue lo
primero que se resolvió.

---

## 3. Arquitectura

```
src/consolidation/
├── domain/
│   ├── types.ts            grupo, perímetro, mapeo, recíprocos, operaciones,
│   │                       ajustes, hoja de trabajo, PNC, preparación
│   ├── lines.ts            catálogo canónico de líneas + derivación desde la
│   │                       taxonomía existente
│   └── ownership.ts        participación efectiva, control, perímetro
├── engine/                 NÚCLEO PURO: sin React, sin Dexie, sin fecha actual
│   ├── worksheet.ts        hoja de consolidación, eliminaciones e invariantes
│   ├── unrealized.ts       resultados no trascendidos y su atribución
│   ├── operationRules.ts   qué línea toca cada tipo de operación intragrupo
│   └── statements.ts       ESP, ER, EEPN, EFE y notas consolidados
├── export/
│   ├── consolidatedWorkbook.ts   libro de trabajo en Excel (10 hojas)
│   └── consolidatedPdf.ts        juego formal en PDF
├── fixtures/grupoLitoral.ts      dataset demostrativo
├── repository.ts           ÚNICA puerta de escritura; jamás toca `entries`
└── service.ts              lectura pura: arma la entrada del motor
```

Las decisiones y sus alternativas descartadas están en
[`docs/ADR_CONSOLIDACION_ESTADOS_CONTABLES.md`](ADR_CONSOLIDACION_ESTADOS_CONTABLES.md).
Los tres pilares:

1. **Las controladas son entidades reales** con Libro Diario propio, no paquetes
   de reporte simulados (ADR-2K-1).
2. **Un único espacio Debe − Haber** para toda la hoja, con base en el balance de
   comprobación *antes de la refundición*: la ecuación patrimonial se verifica
   por aritmética, no comparando modelos (ADR-2K-2).
3. **El módulo no duplica motores**: consume representaciones canónicas y produce
   una representación canónica (ADR-2K-6).

---

## 4. El principio contable central, garantizado en tres capas

> Los ajustes y eliminaciones de consolidación son extracontables.

- **Esquema.** Las ocho tablas de la v24 son papeles de trabajo; ninguna es
  fuente de asientos.
- **Código.** `repository.ts` no importa `journalRepository` ni escribe en
  `entries`; `engine/` es puro y sin acceso a la base.
- **Tests.** Se compara `db.entries` **byte a byte** antes y después de crear el
  grupo, conciliar recíprocos, cargar operaciones intragrupo, asentar ajustes
  manuales y consolidar dos veces.

---

## 5. Descripción funcional

### Modelo de grupo y perímetro

Cubre lo pedido: denominación, moneda de presentación, controladora, varias
controladas, participación patrimonial **y** derechos de voto como campos
distintos, fechas de inicio y pérdida de control, participación directa e
indirecta con **participación efectiva** calculada a lo largo de la cadena
(0,8 × 0,6 = 0,48, con detección de ciclos), exclusión fundada, y asociadas y
negocios conjuntos registrados **sin** consolidarlos.

Dos distinciones que el módulo no colapsa:

- `relation` (naturaleza del vínculo) ≠ `method` (tratamiento contable). Una
  asociada **no "se consolida por VPP"**: se *mide* por VPP y queda fuera del
  perímetro.
- El **control** es una conclusión explícita y fundada. `addMember` **rechaza**
  el alta sin fundamento escrito, y el sistema advierte cuando la conclusión
  diverge de lo que sugiere el porcentaje, sin sobrescribir ninguna de las dos.

### Panel de preparación

Nueve familias de control con los cuatro estados pedidos (Completo, Requiere
revisión, Bloqueado, No aplica) y porcentaje de avance: perímetro definido,
control fundado por entidad, estados individuales disponibles y ejercicios
cerrados, compatibilidad de fechas de cierre (con el máximo de 3 meses y
exigencia de nota de homogeneización), mapeo completo, inversión identificada por
controlada, recíprocos conciliados, ajustes manuales aprobados y moneda uniforme.

### Mapeo contable

La línea consolidada se **deriva** de la taxonomía que ya lleva cada cuenta
(`kind` + clasificación corriente/no corriente + `statementGroup` +
`equityComponent`). El mapeo explícito corrige la derivación y agrega la
**categoría intragrupo** y la **contraparte**. El motor nunca depende del nombre
de una cuenta. Hay asistente de sugerencias con nivel de confianza y motivo.

### Motor

Determinístico (función pura, sin fecha actual ni azar), idempotente
(recalcular dos veces produce byte a byte lo mismo, verificado), con aritmética
en centavos enteros a través del módulo monetario existente. Toda eliminación
lleva regla, cálculo paso a paso, fundamento en lenguaje llano, referencia
normativa, entidades relacionadas y origen (automática / sugerida / manual). Una
eliminación desbalanceada **no se incorpora**: se denuncia.

Columnas del papel de trabajo: importe por entidad · suma previa ·
homogeneización · inversión contra PN · PNC · saldos recíprocos · operaciones
internas · resultados no trascendidos · impuesto diferido · ajustes manuales ·
consolidado.

### Resultados no trascendidos: dos pasos que no se mezclan

**A)** eliminación de la operación interna (ingreso contra costo, por el total,
aun cuando el bien ya salió del grupo). **B)** eliminación del resultado contenido
en el activo que sigue adentro. En el código se demuestra que A + B da el costo
correcto para cualquier proporción realizada *r*:

```
costo intragrupo en la suma previa = C + r·T
costo que el grupo debe exponer     = r·C
A) elimina T          → −T
B) repone U=(T−C)(1−r) → +U
A+B = −(C + r·T − r·C)   ✔ idéntico
```

**Atribución por una sola regla: el ajuste se imputa al vendedor.** Ascendente y
lateral corrigen el patrimonio de la controlada y por eso se reparten con la PNC;
descendente lo generó la controladora y por eso la PNC **no** se reduce. La
dirección se *deriva* de los roles y sólo se usa para explicar.

### PNC

Trazabilidad completa por controlada: porcentaje no controlado, PN de la
controlada, resultados no trascendidos propios, PN ajustado, PNC al cierre,
resultado del ejercicio, resultado ajustado, resultado atribuible a la PNC,
inversión contabilizada, VPP esperado y diferencia. Se expone **dentro del
patrimonio neto** (RT 54), nunca en el pasivo.

### Nada se fuerza a cuadrar

Si la inversión contabilizada difiere del VPP, la diferencia se expone como
llave de negocio y **bloquea la emisión**. No existe ninguna cuenta "ajuste de
cierre". El mismo criterio se aplica cuando falta el mapeo de la inversión,
cuando un resultado no trascendido no tiene activo donde alojarse y cuando una
partida recíproca queda sin conciliar.

---

## 6. Las páginas

Ruta `/consolidacion`, en CONTABILIDAD, después de "Estados contables". Seis
secciones. Capturas en `docs/evidence/phase2k/screenshots/`.

| Sección | Contenido |
|---|---|
| **Resumen del grupo** | Seis KPIs (grupo, ejercicio, entidades, avance, diferencias sin conciliar, eliminaciones), diagrama de la estructura con participación y PNC, estado general con la ecuación patrimonial y el flujo de siete pasos |
| **Perímetro** | Relación, participación, votos, control desde, tratamiento y fundamento por entidad; las excluidas aparecen atenuadas con su motivo |
| **Preparación** | Barra de avance y los controles ordenados por severidad, cada uno con detalle y remediación |
| **Papel de trabajo** | Grilla con encabezados fijos, agrupamiento por sección, columnas colapsables, búsqueda, filtro por entidad y detalle expandible por línea |
| **PNC** | Cuadro de determinación por controlada y atribución del resultado |
| **Estados consolidados** | ESP, ER, EEPN, EFE y notas, con exportación a PDF y Excel |

**Trazabilidad en la grilla.** Al abrir una línea se ven las entidades que la
forman, sus cuentas de origen, y cada eliminación con su tipo, su fundamento, su
cálculo paso a paso y su referencia normativa.

**Componente pedagógico.** Doce ayudas contextuales responden las preguntas de la
fase, incluidas «¿por qué la inversión desaparece?», «¿qué representa la PNC?»,
«¿por qué cambia la atribución según quién vendió?» y «¿por qué estos ajustes no
van al Libro Diario?».

**Accesibilidad.** Ningún estado se comunica sólo por color: los negativos van
entre paréntesis y con prefijo «negativo» para lectores de pantalla; los
controles llevan rótulo e icono; las filas expandibles son botones con
`aria-expanded`; las tablas tienen `caption` y `scope`; el foco es visible; la
barra de progreso es un `progressbar` con sus valores ARIA.

---

## 7. Resultados de verificación

Todo ejecutado con Node v22.23.1.

| Verificación | Resultado |
|---|---|
| `npx tsc --noEmit` | **Limpio** |
| `npx vitest run` | **788 tests en 106 archivos, todos verdes** (719 base + 69 nuevos) |
| `npx eslint .` | **0 errores**, 53 advertencias preexistentes. Código nuevo: 0 y 0 |
| `npx vite build` | **OK** (advertencia de chunk preexistente) |
| `npx playwright test` | **57 tests verdes** en Chromium escritorio, Chromium móvil (390×844) y Firefox. Los 53 preexistentes siguen pasando |
| Exportaciones | PDF de **7 páginas / 112 KB** y libro Excel de **22 KB**, ambos verificados |

Ningún test preexistente fue eliminado ni debilitado. El único modificado es
`tests/accounting/migration-chain-2f.test.ts`, **extendido** hasta v24:
cada fase que eleva el esquema alarga esa cadena para probar que una instalación
antigua sigue migrando hasta hoy sin perder nada.

---

## 8. Casos de la planilla de la cátedra

Fuente: *«03 EECC Consolidados Sencillo HJA - es el que se da en clases.xlsx»*
(Cátedra de Contabilidad IV, UCASAL). Las 12 hojas se leyeron y se reconstruyeron
**desde los enunciados**, no copiando fórmulas de Excel.

| Caso | Descripción | Hoja | Estado |
|---|---|---|---|
| A | Consolidación al 100 % sin operaciones internas | 01 (variante) | ✅ |
| B | Consolidación al 90 % sin operaciones internas | 01 | ✅ |
| C | Eliminación de crédito y deuda recíprocos | 02 | ✅ |
| D | Venta ascendente totalmente realizada | 03 | ✅ |
| E | Venta ascendente no realizada | 04 | ✅ |
| F | Venta ascendente parcialmente realizada (60 %) | 05 | ✅ |
| G | Venta descendente totalmente realizada | 06 | ✅ |
| H | Venta descendente no realizada | 07 | ✅ |
| I | Venta descendente parcialmente realizada (60 %) | 08 | ✅ |
| J | Eliminación de dividendos internos | — | ✅ |
| K | Eliminación de préstamo e intereses internos | 02 | ✅ |
| L | Transferencia interna de bien de uso con depreciación | — | ✅ |
| M | Eliminación de flujos de efectivo internos | — | ✅ (Grupo Litoral) |
| N | Varias controladas | — | ✅ |
| O | Comparativo entre dos ejercicios | — | ✅ (Grupo Litoral) |

**Las ocho hojas se reproducen al peso.** Ejemplos verificados: hoja 04 (VPP
396.900, PNC 44.100, resultado a la PNC 12.700, CMV consolidado 5.810.000, bienes
de cambio 760.000); hoja 07 (VPP 389.100 y PNC **49.900**, el 10 % del patrimonio
**sin ajustar**, que es el punto central del caso descendente).

**La hoja «9 Resumen» se recalculó, no se copió.** Se verifica la identidad
`PN de la controlada − VPP − PNC = resultado no trascendido` en los seis casos, y
que en los descendentes la PNC sea siempre 49.900 y 10.900 con independencia de
la proporción realizada.

### Divergencias deliberadas con la planilla

| Tema | Planilla | ContaLivre | Motivo |
|---|---|---|---|
| Exposición de la PNC | Línea entre pasivo y PN | **Dentro del patrimonio neto** | RT 54 vigente; la RT 21 queda como antecedente |
| Terminología | «Participación minoritaria», «emisora», «inversora» | «Participación no controladora», «controlada», «controladora» | RT 54 |
| Inversión de la controladora | Ya medida al VPP ajustado por construcción | Se toma **como esté contabilizada**; la diferencia se expone y bloquea | Una instalación real puede tenerla a costo o desactualizada |
| Resultados financieros | Intereses ganados y perdidos en líneas separadas | Se **mantienen separados** en la hoja aunque el ER individual los presente netos | Mezclados, eliminar intereses internos sería invisible |

En los fixtures la inversión se carga con el valor de la planilla, de modo que la
diferencia da exactamente cero y las cifras coinciden.

---

## 9. Dataset demostrativo «Grupo Litoral»

**No toca Purmamarca.** Crea dos entidades propias con Libro Diario propio y usa
el espacio de códigos de cuenta 9.x, que la instalación no utiliza.

- **Litoral Holding S.A.** (controladora) e **Iberá Distribuciones S.A.**
  (controlada al 80 %, PNC del 20 %).
- Ejercicios **2024 y 2025 completos y cerrados** (el 2024 es el comparativo).
- Préstamo intragrupo de 200.000 con 24.000 de intereses devengados y cobrados.
- Saldo comercial recíproco de 80.000 pendiente al cierre.
- Venta **ascendente** de 180.000 con costo de 120.000, **70 % revendido** a
  terceros ⇒ resultado no trascendido de 18.000.
- Dividendos de 40.000: 32.000 a la controladora (internos) y 8.000 a la PNC
  (salen del grupo).
- Inversión medida por VPP ⇒ diferencia de consolidación **exactamente cero**.

### Resultado verificado de punta a punta

| Concepto | Importe |
|---|---|
| Activo consolidado | 1.389.000,00 |
| Pasivo consolidado | 100.000,00 |
| PN atribuible a los propietarios | 1.211.400,00 |
| Participación no controladora | 77.600,00 |
| **Patrimonio neto consolidado** | **1.289.000,00** |
| Resultado del ejercicio del grupo | 202.000,00 |
| — atribuible a los propietarios | 186.400,00 |
| — atribuible a la PNC | 15.600,00 |
| Efectivo al cierre | 87.000,00 |

**La prueba ácida:** el resultado consolidado atribuible a los propietarios
(186.400) es **idéntico** al resultado individual de la controladora, y el
patrimonio atribuible a los propietarios (1.211.400) es **idéntico** a su
patrimonio individual. Es lo que debe ocurrir cuando la inversión se mide por VPP
y todo lo interno se eliminó bien.

---

## 10. Invariantes verificados

Los veinte del §20 de la fase, con el control automático que los cubre:

| # | Invariante | Cómo se verifica |
|---|---|---|
| 1 | Activo = Pasivo + PN | `consolidado-suma-cero` + `esp-cons-ecuacion` |
| 2 | PN = propietarios + PNC | `buildConsolidatedBalanceSheet` + tests |
| 3 | Resultado = propietarios + PNC | `er-cons-atribucion` |
| 4 | Inversión en controladas en cero | `inversion-eliminada` |
| 5 | El PN de las controladas no se duplica | Eliminación del 100 % del PN + PNC |
| 6 | Recíprocos conciliados en cero | Golden C y Grupo Litoral |
| 7 | Ingresos y gastos intragrupo en cero | Golden K (líneas financieras separadas) |
| 8 | Flujos de efectivo intragrupo en cero | `efe-cons-flujos-internos-cero` |
| 9 | Resultado no trascendido eliminado | Golden E, F, H, I, L |
| 10 | Toda eliminación con Debe = Haber | `eliminaciones-balanceadas` + siete controles por columna |
| 11 | Entidades + ajustes = consolidado | `filas-reconcilian` |
| 12 | Recalcular no duplica | Test de idempotencia (comparación JSON) |
| 13 | Estados fuente inmutables | Snapshot del balance antes y después |
| 14 | Libros y mayores sin cambios | Comparación byte a byte de `db.entries` |
| 15 | Trazabilidad de cada importe | `byEntity` + `accountIds` + `eliminationIds` |
| 16 | Porcentajes de PNC correctos | `pnc-coincide` |
| 17 | Atribución ascendente/descendente | Golden D–I y hoja «9 Resumen» recalculada |
| 18 | Efectivo final = suma depurada | `efe-cons-efectivo-final` + `efe-cons-vs-esp` |
| 19 | Comparativo del período correcto | Caso O |
| 20 | Sin NaN, Infinity ni centavos ocultos | `importes-finitos` + aritmética en centavos |

---

## 11. Lo que no se hizo, limitaciones y trabajo futuro

Esta sección dice con precisión qué funciona de punta a punta y qué no. Nada de
lo listado está «preparado» ni «parcialmente soportado»: **no está hecho**.

### No implementado, y el motor lo bloquea

1. **Conversión de estados en moneda extranjera.** Si dos entidades del grupo
   tienen monedas distintas, el control `moneda` queda en **BLOQUEADO** y el
   juego no se emite. No hay conversión de estados de subsidiarias del exterior.
2. **Cambios de participación dentro del ejercicio y pérdida de control.** El
   modelo registra `controlFrom` y `controlTo` y los usa para incluir o excluir
   una entidad del perímetro, pero **no** calcula el efecto patrimonial de
   comprar o vender participación sin perder control, ni la baja por pérdida de
   control. Una consolidación con esos hechos dará cifras incorrectas sin avisar:
   **es la limitación más seria de la fase.**
3. **Llave de negocio de adquisición.** La diferencia entre la inversión y el VPP
   se **calcula y se expone**, pero no se amortiza, no se somete a comparación
   con su valor recuperable y no se distingue de un mayor valor de activos
   identificables. Se expone y bloquea; no se contabiliza como llave.
4. **Consolidación indirecta real.** `computeEffectiveOwnership` calcula la
   participación efectiva a lo largo de la cadena y está probada, pero el motor
   de eliminaciones usa la participación del vínculo del ejercicio: **una
   subcontrolada en cadena de tres niveles no está probada y no debe usarse.**
5. **PNC con saldo deudor.** La aritmética lo permite (no hay tope en cero), pero
   **no hay ningún test** que lo cubra ni criterio de exposición definido.

### Limitaciones estructurales heredadas

6. **Plan de cuentas compartido por el grupo.** El código de cuenta es único en
   toda la base (`accounts: '&code'`), así que dos entidades no pueden tener cada
   una su cuenta «1.1.01 Caja» como registros distintos. En la práctica el grupo
   comparte un plan y los saldos difieren porque difieren los asientos —que es
   correcto y suficiente—, y el mapeo es por (empresa, cuenta), de modo que
   planes distintos funcionan **si los códigos son distintos**. Por eso el
   dataset usa el espacio 9.x. Un plan por empresa exige migrar el índice a
   `[companyId+code]`.
7. **Módulos operativos sin dimensión de empresa.** Inventario, bienes de uso,
   moneda extranjera, impuestos, inversiones y sueldos no llevan `companyId`. Las
   entidades distintas de la por defecto sólo pueden cargarse por **asientos
   directos**. En el detalle de moneda extranjera esto se declara explícitamente:
   para otras entidades se informa sin detalle operativo en lugar de atribuirles
   posiciones ajenas.
8. **El módulo no crea entidades desde la interfaz.** El alta de un grupo, de sus
   miembros, del mapeo, de los recíprocos, de las operaciones intragrupo y de los
   ajustes manuales está implementada y probada **en el repositorio**, y el
   dataset demostrativo la ejercita completa. Lo que **no** hay es formulario en
   pantalla para cada una de esas altas: la página de hoy **muestra, calcula,
   explica y exporta**, pero no edita. La conciliación intragrupo y el editor de
   ajustes manuales, tal como los describe la fase (§10 y §21, con responsable,
   comentario, aprobación y reversión desde la UI), **no tienen pantalla**.
9. **`detectReciprocals` no se usa desde la interfaz.** La función existe, está
   implementada y propone partidas cruzando el mapeo declarado, pero no hay botón
   que la invoque.
10. **Notas manuales del grupo.** Las notas se generan con datos reales y las que
    necesitan narrativa quedan marcadas `requiresNarrative`, pero **no hay
    editor** para escribir esa narrativa ni persistencia de notas del grupo
    (existe `manualDisclosures`, pero por ejercicio individual, no por
    consolidación).
11. **Anexos consolidados.** No se generan. El §15.6 pedía «anexos consolidados
    que correspondan»: no hay anexo de bienes de uso, de costo de ventas ni de
    gastos por función a nivel de grupo.
12. **Moneda de cierre del consolidado.** El campo `inflationIndexSetId` existe
    en el ejercicio de consolidación pero **el motor no lo usa**: no hay
    reexpresión del juego consolidado. Se consolidan los estados individuales tal
    como estén. Si las entidades ya están en moneda de cierre, el consolidado lo
    está; el módulo no lo verifica ni lo convierte.
13. **Bloqueo de versión y historial de recálculos.** `ConsolidationStatus`
    contempla `LOCKED` y `setConsolidationStatus` lo persiste, pero **no hay
    snapshot inmutable** del consolidado como sí lo hay para los estados
    individuales (`reportSnapshots`), ni historial de recálculos.

### Limitaciones del EFE consolidado

14. Los flujos internos se eliminan **a partir de lo declarado** en cada
    operación intragrupo (`cashFlow`), no detectando automáticamente los
    movimientos de efectivo entre entidades. Si el usuario no declara un pago
    interno, no se elimina y el EFE consolidado expondrá flujos que no cruzaron
    la frontera del grupo. El control `efe-cons-vs-esp` detecta las
    inconsistencias que llegan al efectivo, pero **no** una clasificación interna
    mal declarada entre actividades.
15. El EFE consolidado agrega por actividad (operativas, inversión, financiación)
    y no abre el detalle línea por línea como sí lo hace el EFE individual.
16. **Sin comparativo del EFE consolidado.**

### Del EEPN consolidado

17. Con el ejercicio comparativo vinculado, la evolución está completa. **Sin
    él**, el saldo inicial se declara indeterminable y no se estima. La fila de
    variaciones agrupa aportes, distribuciones y movimientos de reservas en un
    solo renglón: **no** se abre por tipo de movimiento como el EEPN matricial
    individual.

### Sobre las fuentes normativas

18. **No se pudo consultar** la RT 54 texto ordenado por RT 59, el material de la
    Unidad VIII, el módulo institucional, el programa de la materia ni el Informe
    CENCyA: **ninguno está disponible en el equipo ni en el repositorio**. Sólo
    se encontró la planilla de la cátedra y un archivo
    `RT 54 Modelos de EECC para EP con fines de lucro.xlsx` que no se utilizó.
    Las referencias normativas del módulo se apoyan en la doctrina general y en
    la propia planilla, y **deberían revisarse contra el texto de la norma antes
    de usar el módulo con fines profesionales.** Las citas se redactaron de forma
    conservadora, sin invocar artículos ni apartados concretos.

### Defectos abiertos

Ninguno conocido. Los tres encontrados durante la fase se corrigieron y quedaron
cubiertos por tests:

- **DEF-2K-01** — El resultado atribuible a la PNC tenía signo de exposición
  acreedor cuando es un cargo: el ER consolidado lo mostraba invertido y
  contaminaba el EEPN. Lo detectó el test de punta a punta del dataset.
- **DEF-2K-02** — El dataset dejaba los ejercicios individuales abiertos; lo
  denunció el propio control de preparación del módulo.
- **DEF-2K-03** — Desborde horizontal en móvil: con la hoja abierta el navegador
  expandía el viewport de layout y el encabezado y la barra inferior, que son
  `position: fixed`, se estiraban y la navegación quedaba fuera de la pantalla.
  Corregido con `contain: layout inline-size`. Lo detectó el E2E móvil.

---

## 12. Criterios de aceptación

| Criterio | Estado |
|---|---|
| Modelo persistente de grupos | ✅ |
| Vincular controladora y controladas | ✅ |
| Seleccionar ejercicios fuente | ✅ |
| Control de requisitos previos | ✅ |
| Mapeo contable | ✅ |
| Conciliación intragrupo | ⚠️ Motor y persistencia sí; **sin pantalla de edición** |
| Hoja de consolidación | ✅ |
| Eliminar inversión contra PN | ✅ |
| Calcular la PNC | ✅ |
| Eliminar saldos recíprocos | ✅ |
| Eliminar operaciones | ✅ |
| Eliminar resultados no trascendidos | ✅ |
| Distinguir ascendente y descendente | ✅ |
| ESP consolidado | ✅ |
| ER consolidado | ✅ |
| EEPN consolidado | ⚠️ Completo con comparativo; variaciones sin abrir por tipo |
| EFE consolidado | ⚠️ Real y verificado; flujos internos **declarados**, no detectados |
| Notas básicas | ⚠️ Se generan con datos reales; **sin editor de narrativa** |
| Trazabilidad | ✅ |
| Exportaciones | ✅ |
| Casos de la planilla cubiertos | ✅ |
| Invariantes cierran | ✅ |
| Estados individuales sin modificar | ✅ verificado byte a byte |
| Sin regresiones | ✅ 719 tests base + 53 E2E siguen verdes |
| Lint, pruebas y build verdes | ✅ |
| Árbol limpio | ✅ |
| Documentación honesta | ✅ ésta es la sección §11 |

---

## 13. Cómo verlo funcionando

```bash
npm run dev
```

Ir a **Consolidación** en el menú y pulsar «Cargar el caso demostrativo
*Grupo Litoral*». Crea dos entidades con sus libros y no modifica ninguna empresa
ni ningún asiento existente.

Para reproducir la verificación completa:

```bash
npx tsc --noEmit && npx vitest run && npx eslint . && npx vite build && npx playwright test
```
