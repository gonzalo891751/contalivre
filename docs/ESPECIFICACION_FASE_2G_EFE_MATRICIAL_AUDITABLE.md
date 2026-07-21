# Especificación — Fase 2G: Estado de Flujo de Efectivo auditable, matricial y formal

> **Provenencia.** Este documento reproduce la especificación de trabajo entregada
> para la Fase 2G. Es el contrato de alcance de la fase. La auditoría técnica que la
> fundamenta es [`AUDITORIA_EFE_ESTADO_ACTUAL.md`](AUDITORIA_EFE_ESTADO_ACTUAL.md).
> La implementación se documenta en
> [`IMPLEMENTACION_FASE_2G_EFE_MATRICIAL_AUDITABLE.md`](IMPLEMENTACION_FASE_2G_EFE_MATRICIAL_AUDITABLE.md)
> y las decisiones de diseño en [`ADR_EFE_PREPARATION_MODEL.md`](ADR_EFE_PREPARATION_MODEL.md).

## 1. Objetivo general

El módulo del Estado de Flujo de Efectivo (EFE) debe ofrecer **dos experiencias separadas**
que consumen la **misma evidencia de cálculo**:

- **A. Exposición formal** — estado contable sintético y profesional: método directo o
  indirecto; moneda nominal o de cierre; cifras actuales y comparativas; efectivo inicial,
  modificaciones del saldo inicial, efectivo inicial modificado, efectivo final, aumento/
  disminución neta; actividades operativas, de inversión y de financiación; RFyT/REI generados
  por el efectivo; operaciones de inversión y financiación que no afectaron efectivo; controles
  y estado de validación; exportación PDF y XLSX formal.
- **B. Preparación / papel de trabajo** — vista interna, didáctica y auditable: saldos iniciales
  y finales; variaciones; imputaciones; origen/aplicación; clasificación por actividad; total
  imputado; control por fila/columna/general; puentes devengado→percibido; fórmulas; operandos;
  cuentas; asientos; líneas de asiento; reglas de clasificación; coeficientes de reexpresión;
  trazabilidad exacta de cada cifra.

No se construye una segunda lógica contable en React. Exposición formal y papel de trabajo son
dos consumidores distintos de una misma evidencia.

## 2. Reglas no negociables

1. No hacer merge. 2. No hacer deploy. 3. No modificar la rama principal. 4. No reescribir
historia. 5. No hacer squash. 6. No hardcodear Purmamarca en código productivo. 7. No calcular
cifras contables en componentes React. 8. No reconstruir la matriz desde el DOM o totales
reducidos. 9. El papel de trabajo no debe contaminar la exportación formal. 10. No ocultar
diferencias con tolerancias artificiales. 11. No reemplazar diferencias por cero. 12. No asignar
partidas dudosas silenciosamente. 13. Una operación sin clasificación certera genera partida sin
clasificar + bloqueo + explicación + acción concreta. 14. Aritmética contable en centavos enteros.
15. No introducir dependencias pesadas sin justificación documentada. 16. No rediseñar los demás
estados. 17. No romper ESP/ER/EEPN/notas/anexos/análisis/exportaciones existentes. 18. No eliminar
funcionalidades válidas del EFE. 19. La interfaz funciona en escritorio y móvil. 20. Toda cifra
visible debe poder demostrar su origen.

## 3. Preparación del repositorio

Base auditada: rama `refactor/fase-2f-release-candidate`, HEAD
`8984545765102a5f4d9b85c46234985dcdb7c7da`, versión `0.4.0-rc.1`, motor `2F.0`, esquema `21`,
Node esperado `22.23.1` (rango `>=22 <23`). No usar Node 25 para validar. Rama de trabajo:
`refactor/fase-2g-efe-matricial-auditable`. Baseline (pruebas focalizadas, suite completa, build,
lint) registrada antes de comenzar. Commits atómicos, uno por hito.

## 4. Arquitectura objetivo (alternativa B de la auditoría)

Tres contratos separados:

1. **Evidencia y preparación** — `CashFlowPreparationModel`: matriz, fórmulas, controles,
   puentes, trazabilidad, explicación pedagógica, auditoría.
2. **Estado contable formal** — `CashFlowStatement`/`CashFlowStatement2G` (evolución compatible):
   solo líneas formalmente exponibles, comparativos, apertura, modificación de apertura, apertura
   modificada, actividades, REI/RFyT, variación, cierre, referencias a notas y revelaciones.
3. **Presentación** — view models/presenters que adaptan los dos contratos a UI, PDF formal,
   XLSX formal, XLSX papel de trabajo y snapshots.

`buildCashFlows` (o su sucesor) produce algo equivalente a
`{ direct, indirect, validation, preparation, disclosures, publicationGate }`. La interfaz nunca
recalcula variaciones, contribuciones, subtotales, controles, puentes, REI ni comparativos.

## 5. Correcciones P0 del motor

- **5.1 Venta de bienes de uso / intangibles / inversiones (EFE-001).** El cobro bruto por venta
  se expone en inversión (p. ej. `Caja 30.000 / Bien de uso 20.000 / Ganancia 10.000` ⇒ inversión
  +30.000, operativa 0 por esa operación; en el indirecto se elimina la ganancia de 10.000). Soportar
  venta con ganancia/pérdida/al valor contable; cobro total, a crédito, posterior, parcial; varios
  bienes; operación mixta; baja sin cobro; indemnización identificable. Sin vínculo cierto de un cobro
  posterior con la disposición: no clasificar silenciosamente como operativo; usar lineage/metadata/
  override; si no se resuelve, generar blocker.
- **5.2 Moneda de cierre (EFE-004).** Corregir la duplicación de partidas sin clasificar en el
  indirecto reexpresado. Debe cumplirse `CFO directo reexpresado = CFO indirecto reexpresado` y
  `operación + inversión + financiación + RFyT/REI + partidas separadas = variación neta`. Regresión
  permanente.
- **5.3 Publication gate unificado (EFE-003).** Puerta única que considera validación general,
  controles nominales y reexpresados, cobertura/identidad del set de índices, partidas sin clasificar,
  igualdad directo/indirecto, conciliación inicio+variación=cierre, conciliación EFE/ESP, comparativo,
  políticas pendientes, revelaciones obligatorias, errores de mapping e integridad de snapshots. Estado
  bloqueado no permite guardar/exportar como validado; sólo borrador explícito con marca de agua, lista
  de bloqueos, fecha, método, moneda, versión de motor y política.
- **5.4 REI y revelaciones en exportaciones (EFE-002).** PDF/XLSX formal incluyen la línea de efecto
  sobre el efectivo de inflación/diferencias de cambio/otros RFyT/REI. La suma exportada reconcilia.
  Operaciones no monetarias en nota/sección separada, nunca en el total de flujos. No reemplazar
  revelaciones nominales por el REI al pasar a moneda de cierre.

## 6. Política EFE versionada

Política contable del EFE identificable y versionada por entidad y período, definida vía ADR. Cubre:
efectivo y equivalentes (efectivo, depósito a la vista, equivalente, fondo restringido, inversión no
equivalente, sobregiro, excluido; con finalidad, liquidez, convertibilidad, riesgo, plazo, restricción,
vigencia); intereses cobrados/pagados; dividendos cobrados/pagados; impuesto a las ganancias (operativo
por defecto, asociación específica con evidencia); sobregiros; overrides auditables por cuenta/asiento/
operación/línea (clasificación, motivo, usuario, fecha, vigencia, versión); historicidad (no reclasificar
períodos cerrados/snapshots validados). Si se requiere persistencia: elevar esquema Dexie 21→22 con
migración no destructiva, migrar configuraciones, conservar compatibilidad, marcar heredadas para revisión,
probar migración v21→v22. Implementar `NOT_APPLICABLE`, subcategorías, vigencia e invalidación de snapshots.

## 7. CashFlowPreparationModel

DTO inmutable y serializable del papel de trabajo. Mínimo: **identidad** (empresa, ejercicio, fecha de
cierre, método, expresión, moneda, versión normativa, versión de motor, versión de política EFE, hash de
mappings, hash del set de índices, hash de contenido, fecha de generación); **puente del efectivo**
(inicial publicado, modificaciones de ejercicios anteriores, cambios de criterio, inicial modificado,
final, variación neta, componentes de efectivo/equivalentes, exclusiones, conciliación con ESP);
**filas matriciales** (identificador estable, cuenta/código/nombre, naturaleza, grupo/subgrupo, saldo
inicial/final, variación con signo técnico e interpretación económica, aumentó/disminuyó, origen/
aplicación, actividad, política y regla aplicadas, total imputado, control, estado conciliado/advertencia/
bloqueado/sin movimiento, referencias de lineage); **imputaciones** (identificador, columna/causa,
etiqueta, método, actividad, importe en centavos, fórmula, operandos, signo, regla, cuentas, asientos,
líneas, fecha, operación de origen, cash accounts, contrapartida, efectivo bruto, importe asignado,
resultado asociado, clasificación auto/manual, explicación, control); **reexpresión** (período origen,
índice origen/cierre, coeficiente, importe nominal/reexpresado, redondeo, REI asociado, fuente del índice);
**controles** (fila, columna, actividad, método, efectivo, contra ESP, clasificaciones, comparativo,
reexpresado, general — todos exactos en centavos).

## 8. Método directo: papel de trabajo y puentes

El directo formal sigue basándose en movimientos reales de efectivo. La vista didáctica explica los
puentes cuando la información lo permita: **ventas→cobros** (ventas devengadas + créditos iniciales −
créditos finales ± NC ± anticipos ± impuestos ± incobrables ± otros = cobros; Purmamarca 35.000 − 3.000 =
32.000); **CMV→compras** (EI + compras ± ajustes − EF = CMV; Purmamarca 20.000 + 10.000 − 0 = 30.000);
**compras→pagos** (compras + proveedores iniciales − finales ± anticipos ± IVA ± NC ± reclasificaciones =
pagos; Purmamarca 30.000 − 2.000 = 28.000). Las fórmulas surgen del DTO, no del componente. Residual ≠ 0
⇒ bloquear el puente. Arquitectura preparada para pagos al personal, cargas sociales, impuestos, intereses,
dividendos y otros. Sólo mostrar un puente conciliado cuando sea demostrable.

## 9. Método indirecto: papel de trabajo

Mostrar: resultado base; partidas que integran el resultado sin afectar efectivo; partidas que afectarán
efectivo en otro período; devengadas antes que afectan ahora; resultados cuyo flujo pertenece a inversión/
financiación; variaciones de activos y pasivos operativos; IG; intereses/dividendos según política; partidas
sin clasificar; flujo operativo resultante. Soportar depreciaciones, amortizaciones, previsiones, resultados
de tenencia, RECPAM, diferencias de cambio, resultado por venta de PPE, variaciones de créditos/inventarios/
proveedores/obligaciones, IG, no monetarias y AREA. Purmamarca: resultado 15.000 − créditos 3.000 −
inventarios 10.000 + proveedores 2.000 = operativo 4.000; la venta de PPE y el aporte no integran operativo.

## 10. Comparativo

Comparativo real del EFE calculado por el mismo motor (asientos del período anterior, política aplicable,
mappings vigentes, apertura, revelaciones e índices correspondientes). En moneda de cierre se expresa en
moneda de cierre actual conservando la evidencia del coeficiente. UI/PDF/XLSX muestran Actual y Anterior.
Sin información suficiente: "Comparativo no disponible" con causa; no simular ceros; impedir presentación
formal comparativa inválida cuando sea obligatoria.

## 11. Exposición formal

Mantener el diseño de los estados. Estructura: denominación del ente; título "Estado de Flujo de Efectivo",
método, ejercicio, comparativo, moneda; **variación del efectivo** (inicio, modificaciones, inicio modificado,
cierre, aumento/disminución); **causas** (operativas, inversión, financiación con subtotales; RFyT/REI del
efectivo); variación neta; **referencias** (conciliación efectivo/ESP, política de efectivo/equivalentes,
operaciones no monetarias, notas). Resumen oculta detalle; detalle lo expone. No mezclar papel de trabajo.

## 12. Experiencia de usuario

Selector principal `[ Exposición ] [ Preparación ]` que convive con Directo/Indirecto, Moneda nominal/cierre,
Resumen/Detalle y Comparativo. **Exposición**: conservar/mejorar la pantalla actual (tarjetas, ecuación,
actividades, subtotales, REI, comparativo, revelaciones, controles, trazabilidad, exportación). **Preparación**:
moderna, didáctica; encabezado "Cómo se construye el Estado de Flujo de Efectivo"; cuatro pasos (determinar la
variación → analizar cambios → imputar a causas → conciliar y exponer). **Matriz** (escritorio): encabezados
agrupados, primera columna fija, encabezado sticky, scroll horizontal indicado, filas expandibles, filtros,
búsqueda, "ocultar sin movimiento", "solo diferencias", selector de actividad, leyenda de signos, total inferior.
Columnas mínimas: cuenta/concepto, saldo inicial, saldo final, variación, origen/aplicación, imputaciones, total
imputado, control; columnas de imputación dinámicas derivadas del modelo (no hardcodear "Purmamarca"). **Signos**:
modelo con signo técnico; UI prioriza interpretación económica (entrada/salida, origen/aplicación, aumento/
disminución); color nunca es el único medio. **Celda**: panel con causa, importe, fórmula simbólica, sustitución
numérica, resultado, regla, política, cuenta, asiento, fecha, memo, línea D/H, cuenta de efectivo, operación de
origen, coeficiente si corresponde, control, acceso al Mayor y al asiento. **Controles**: filas/columnas
conciliadas, diferencia total, directo=indirecto, inicio+variación=cierre, EFE=ESP, sin clasificar, políticas
pendientes, estado de publicación (verde sólo si el cálculo real lo aprueba). **Móvil**: tarjetas por cuenta,
imputaciones desplegables, panel de fórmula en bottom sheet; sin recortes ni scroll horizontal de página;
viewport obligatorio 390×844 con aserciones geométricas.

## 13. Accesibilidad

Matriz y diálogos usables con teclado: encabezados semánticos, tablas con asociaciones correctas, botones reales,
foco visible, Enter/Espacio, Escape, foco inicial, trampa de foco en modal, retorno de foco, etiquetas accesibles,
estados no sólo por color, reducción de movimiento. Pruebas de teclado del modal de trazabilidad.

## 14. Exportaciones

Dos acciones separadas. **A. Exportar estados** (formal): PDF/XLSX; directo/indirecto/ambos; nominal/cierre;
comparativo; REI/RFyT; revelaciones; notas; estado de validación; marca de agua si borrador; nunca incluye la
matriz. **B. Exportar papel de trabajo** (XLSX auxiliar): "Papel de trabajo del Estado de Flujo de Efectivo",
con advertencia "Documento interno de preparación. No integra por sí solo los estados contables formales." Hojas
sugeridas: resumen/controles, matriz directa, puentes directos, matriz indirecta, trazabilidad, operaciones no
monetarias, políticas/mappings, reexpresión. El exportador del papel de trabajo consume `CashFlowPreparationModel`;
el formal no consume la matriz.

## 15. Snapshots, versionado e identidad

Congelar/reproducir: directo/indirecto nominal y en cierre, comparativo, apertura y modificaciones, revelaciones,
operaciones no monetarias, REI, validation, publication gate, política EFE, mappings, set de índices y hash, versión
normativa y de motor, y modelo de preparación (o evidencia suficiente). El hash depende del contenido material
completo y cambia ante cambios en asientos, cuentas, mappings, políticas, overrides, índices, comparativo, disclosures,
método, moneda y reglas. No guardar como validado un snapshot con blockers. Cambiar política/mapping invalida el
snapshot o lo mantiene congelado identificando la divergencia.

## 16. Caso Purmamarca permanente

Fixture permanente de pruebas (no dato productivo). Efectivo inicial 10.000, final 49.000, variación 39.000.
Directo: cobro ventas 32.000, pago proveedores −28.000, operación 4.000, venta PPE 30.000, aporte 5.000, variación
39.000. Indirecto: resultado 15.000, créditos −3.000, inventarios −10.000, proveedores +2.000, operación 4.000,
inversión 30.000, financiación 5.000, variación 39.000. Matriz: control fila/columna/total 0; directo=indirecto.
Puentes: 35.000−3.000=32.000; 20.000+10.000−0=30.000; 30.000−2.000=28.000. Seed/helper E2E para recorrer el caso sin
contaminar producción; documentar carga para QA manual.

## 17. Casos adversos obligatorios

Venta PPE con ganancia/pérdida/al valor contable; venta PPE a crédito con cobro posterior; cobro parcial; compra PPE a
crédito; financiación no monetaria; capitalización de deuda; fondo restringido; equivalente >3 meses; equivalente con
riesgo no insignificante; sobregiro; intereses pagados operativo/financiación; intereses cobrados; dividendos pagados/
cobrados; IG asociado a inversión; operación mixta; cuenta sin mapping; `NOT_APPLICABLE`; cambio de mapping con vigencia;
AREA; modificación del efectivo inicial; partida sin clasificar nominal/reexpresada; REI; comparativo nominal/cierre;
índices incompletos; snapshot invalidado por política; export bloqueado; export borrador con advertencia; móvil sin
clipping; modal con foco correcto. Cada caso comprueba importes, no sólo ausencia de error.

## 18. Pruebas y gates

Test rojo antes de cada corrección P0. Cobertura: **unitarias** (clasificación, signos, fórmulas, puentes,
contribuciones, políticas, reexpresión, controles, hash); **integración** (Diario→ReportingInput→EFE, directo,
indirecto, preparación, comparativo, snapshot, migración, export); **contrato** (estado formal sin campos matriciales
accidentales; preparación conserva evidencia; PDF/XLSX consumen presenters; directo/indirecto comparten inversión y
financiación); **E2E** (Chromium/Firefox escritorio, Chromium móvil, directo/indirecto, nominal/cierre, exposición/
preparación, comparativo, trazabilidad, export formal, export papel de trabajo, estado bloqueado, Purmamarca);
**exportaciones** (PDF directo/indirecto/ambos/cierre, XLSX formal y papel de trabajo — cifras que suman, REI expuesto,
comparativo, revelaciones, sin texto cortado, sin matriz como estado formal, borradores marcados); **responsive**
(`scrollWidth <= clientWidth` donde no debe haber overflow, importe visible, sin solapamientos, viewport, apertura/
cierre); **performance** (10.000 y 100.000 asientos, bundle, construcción del modelo de preparación, render de matriz
agregada, apertura de lineage — sin degradar límites; agregación/carga diferida permitidas si hash/snapshot/trazabilidad
siguen reproducibles). **Gates finales**: suite completa, focalizadas, migraciones, build, lint, E2E Chromium/Firefox/
móvil, export tests, inspección visual. Lint: 0 errores, sin aumentar warnings sin justificación.

## 19. Migración y compatibilidad

Si el esquema sube a 22: migración idempotente, sin pérdida de cuentas/asientos/ejercicios, sin alterar importes, sin
reclasificar cerrados en silencio, preservando mappings, creando la política heredada determinista, marcando lo no
verificable, con prueba desde una base v21 realista. Compatibilidad con empresas/ejercicios/snapshots/exports/datos RC
existentes. Snapshot viejo sin evidencia suficiente: visualizable con su versión histórica, sin fingir la nueva matriz;
mostrar "Papel de trabajo no disponible para esta versión".

## 20. Orquestación única

Revisar `loadStatementsForYear` y rutas parciales. Una única orquestación canónica produce statements, cash flow,
preparation, disclosures, comparatives, inflation, validation y metadata. Las rutas alternativas delegan, se deprecan o
se eliminan. No mantener dos motores.

## 21. Configuración

Sección "Políticas del Estado de Flujo de Efectivo" en Configuración: cuentas de efectivo, equivalentes, fondos
restringidos, sobregiros, intereses, dividendos, IG, overrides, vigencia, partidas sin clasificar. Muestra estado
completo, requiere revisión, bloqueos, cuentas y períodos afectados, con textos pedagógicos. El asistente de mappings
considera la falta de clasificación EFE como bloqueo cuando sea material.

## 22. Documentación técnica

`docs/ADR_EFE_PREPARATION_MODEL.md` (alternativas, por qué no se calcula en React, separación preparación/formal,
política EFE, modelo de lineage, transacciones mixtas, comparativo, inflación, snapshots, performance).
`docs/IMPLEMENTACION_FASE_2G_EFE_MATRICIAL_AUDITABLE.md` (resumen, rama y commits, baseline, arquitectura anterior/nueva,
diagramas Mermaid, migración, política, motor, preparación, UI, exportaciones, snapshots, pruebas, performance, evidencia,
limitaciones, deuda, pasos de prueba manual). Evidencias en `docs/evidence/phase2g/`.

## 23. Experiencia visual

Respetar el diseño actual: claro, moderno, sobrio, didáctico, espacioso, legible, coherente. Evitar estética de planilla
Excel antigua, exceso de bordes/colores, columnas comprimidas, tipografías diminutas, scroll descontrolado, tablas sin
jerarquía, indicadores verdes falsos. Usar encabezados agrupados, fondos suaves, badges, subtotales destacados, controles
visibles, ayudas contextuales, estados vacíos explicativos y fórmulas monoespaciadas. La matriz de Purmamarca es
inspiración lógica, no estética.

## 24. Commits obligatorios

HITO 0 `docs: incorporar auditoría y especificación de la fase 2G` · HITO 1 `test: fijar Purmamarca y casos adversos del
EFE` · HITO 2 `fix: corregir disposiciones de activos y flujo bruto` · HITO 3 `fix: cerrar reexpresión y puerta de
publicación EFE` · HITO 4 `feat: versionar políticas EFE y migración v22` · HITO 5 `feat: incorporar modelo de preparación
y lineage exacto` · HITO 6 `feat: completar apertura y comparativo del EFE` · HITO 7 `fix: completar exposición y
exportaciones formales EFE` · HITO 8 `feat: robustecer snapshots e identidad de contenido` · HITO 9 `feat: implementar
experiencia matricial de preparación` · HITO 10 `fix: completar configuración accesibilidad y responsive EFE` · HITO 11
`test: cerrar contratos exports y aceptación E2E` · HITO 12 `docs: cerrar implementación de la fase 2G`. No mezclar motor
y UI en el mismo commit. Cada commit deja sus pruebas en verde. Sin commits vacíos. Sin merge.

## 25. Versionado

Al finalizar: motor `2G.0`; esquema `22` si hubo persistencia; versión candidata sugerida `0.5.0-rc.1`. Fuente única de
versión, sin duplicados hardcodeados.

## 26. Criterios de aceptación

Ver auditoría §30 y esta especificación §§1–25. En síntesis: Purmamarca reproduce importes y controles en cero; matriz
en el motor; cada celda con fórmula/operandos/lineage; venta PPE con ganancia muestra cobro bruto en inversión y elimina
el resultado del indirecto; directo=indirecto; nominal y cierre coinciden conceptualmente; sin doble conteo; REI en UI/PDF/
XLSX; exportaciones concilian; no monetarias reveladas; comparativo real; apertura/modificación/apertura modificada;
política de efectivo explícita; fondos restringidos no automáticos; intereses/dividendos/IG con política auditable;
`NOT_APPLICABLE`; vigencia histórica; blockers impiden validar y exportar validado; borrador identificado; snapshot congela
ambos métodos y expresiones; hash cambia ante todo cambio material; exposición/preparación separadas; export formal sin
matriz; export auxiliar del papel de trabajo; móvil sin recorte; modal con foco; ESP/ER/EEPN/notas siguen funcionando;
suite/build/lint/E2E aprobados; documentación fiel al código.

## 27. Validación manual e informe final

Validación manual (empresa RC, Purmamarca, directo/indirecto, exposición/preparación, matriz, filtros, ocultar ceros,
abrir celda/fórmula/asiento/Mayor, nominal/cierre, comparativo, no monetarias, export PDF/XLSX formal/papel de trabajo,
estado bloqueado, borrador, viewport 390×844, teclado) con evidencia registrada. Informe final con rama, base, HEAD final,
commits, archivos, migración, defectos corregidos, arquitectura, resultados (Purmamarca, venta PPE, cierre, comparativo,
PDF/XLSX, papel de trabajo, móvil, accesibilidad), pruebas y cantidad, build, lint, E2E, performance, warnings,
limitaciones, ubicación del informe y pasos de prueba. Confirmar: sin merge, sin deploy, sin tocar main, árbol limpio, sin
temporales, listo para revisión manual. No declarar terminado con criterios críticos pendientes ni ocultar fallos.
