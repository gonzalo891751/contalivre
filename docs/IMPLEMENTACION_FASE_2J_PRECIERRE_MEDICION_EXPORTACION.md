# Fase 2J — Pre-cierre, medición al cierre y núcleo único de controles

**ContaLivre v0.5.0-rc.1** · esquema 23 · 28 de julio de 2026

---

## 1. Resumen y alcance real de esta fase

La fase se propuso construir la experiencia integral del pre-cierre hasta la
exportación formal. **Se completó la mitad del recorrido y no se completó la
otra**, y conviene decirlo antes que nada:

**Lo que quedó hecho y verificado**

- Un **núcleo único de controles** que gobierna por igual el pre-cierre, la
  publicación de los estados y el cierre del ejercicio. Antes cada puerta tenía
  su propia idea del estado del ejercicio.
- La página **Pre-cierre y medición al cierre** en la navegación principal, con
  las once etapas del ciclo y su estado calculado con hechos.
- El **retiro de la planilla AxI antigua**: se acabó la segunda fuente de verdad
  (DEF-A12 y DEF-A13 cerrados).
- El módulo de **mediciones a valores corrientes** con su tabla, su servicio y
  su pantalla: detección de lo que exige medición, carga con fuente y evidencia,
  asiento propuesto revisable, contabilización idempotente y reversión.
- La **reexpresión de bienes de uso por ficha individual**, tras auditar y
  refutar la universalidad del coeficiente medio por clase.

**Lo que NO se hizo**

- La **exportación PDF profesional** (§13). Sigue vigente el exportador
  anterior.
- La **exportación Excel** coherente con ese PDF (§14).
- El **ejercicio 2026 y los comparativos reales** (§11).
- La revisión normativa documentada del **IVA de bienes de uso en el EFE** (§10).

El detalle, el motivo y el riesgo de cada faltante están en §11. **Por eso el
veredicto no puede ser APTO PARA CIERRE Y EMISIÓN FORMAL** (§12).

---

## 2. Base, rama y HEAD

| | |
|---|---|
| Rama base | `fix/fase-2i-axi-medicion-cierre-exportables` |
| HEAD real de la base | **`bbc77d0`** |
| HEAD informado en el encargo | `5fb2891` |
| Rama de esta fase | `feat/fase-2j-pre-cierre-medicion-exportacion-formal` |
| Árbol al comenzar | limpio · 719 pruebas en verde |
| Node · npm | 22.23.1 · 10.9.8 |

**Sobre la discrepancia del HEAD.** `5fb2891` es el quinto de los seis commits
de la Fase 2I; el sexto, `bbc77d0`, es el que agrega el informe de esa fase y es
el HEAD real. No hay historia divergente ni reescrita: sólo un commit
documental posterior al que el encargo tomó como referencia. Se verificó con
`git rev-parse HEAD` y `git log` antes de tocar nada.

Los checkpoints existentes se conservaron y se regeneraron con el mismo
recorrido reproducible. Ningún importe del caso Purmamarca fue modificado.

---

## 3. Commits

| Commit | Hito |
|---|---|
| `3bd48b6` | Núcleo único de controles; esquema v23 con mediciones al cierre |
| `793f1e2` | Página de pre-cierre y retiro de la planilla AxI (DEF-A12, DEF-A13) |
| `3bc4f77` | Bienes de uso: reexpresión de la depreciación por ficha individual |
| `(este)` | Pruebas E2E del pre-cierre, documentación y cierre de la fase |

---

## 4. Arquitectura

### 4.1 Núcleo único de controles

`src/reporting/closing/closingReadiness.ts` — función pura.

Reparte todos los controles del ejercicio en las once etapas del ciclo. Cada
control declara: etapa, qué se esperaba, qué se obtuvo, la diferencia, su
tolerancia, el motivo, **qué hacer** y **a dónde ir**.

Lo consumen:

- el **tablero de pre-cierre**, que dibuja las etapas y sus bloqueos;
- la **compuerta de publicación**, que suma los bloqueos del núcleo a los suyos;
- el **cierre del ejercicio**, que antes no consultaba nada de esto.

Publicar y cerrar quedan como puertas distintas con el mismo núcleo: un
ejercicio ya cerrado no está «listo para cerrarse» y sin embargo es justamente
cuando corresponde publicar sus estados definitivos. Esa distinción está en
`publishBlockers` frente a `blockers`.

**Qué bloquea el cierre**: identidad de la empresa incompleta, cuentas sin
tratamiento declarado, índices faltantes, RECPAM sin conciliar, mediciones
pendientes, borradores sin contabilizar, cualquier control del motor en rojo
(partida doble, ecuación patrimonial, CMV, anexo de bienes de uso, EEPN, EFE),
reexpresión de bienes de uso incompleta y estados desactualizados.

**Qué sólo advierte**: asientos en otros ejercicios y cobertura por saldo por
debajo del 100 % con cobertura por cantidad completa.

**Ninguna etapa se marca «no aplicable» sin decir por qué.**

### 4.2 El bundle como fuente única

`loadReportingBundle` pasa a exponer `treatmentMatrix`, `recpam` y `readiness`
junto a los estados. La pantalla de pre-cierre, la de estados y el servicio de
cierre leen del mismo objeto: no hay dos caminos de cálculo.

---

## 5. La página de pre-cierre

Ruta `/pre-cierre`, en la navegación principal entre *Balance de SyS* y
*Estados contables*, que es el orden del ciclo:

```
Libro Diario → Mayores → Balance → Pre-cierre y medición → Estados → Cierre
```

**Encabezado**: empresa, ejercicio, fecha de cierre, moneda, unidad de medida
(nominal o moneda de cierre con su período), cuentas analizadas, cuentas
pendientes, estado del RECPAM, estado de los estados contables y avance del
pre-cierre.

**El avance no es decorativo**: `10 de 10 etapas` significa que diez etapas
aplicables tienen todos sus controles en verde. Una etapa está completa cuando
sus controles pasan, no cuando el usuario la visitó.

**Etapas**: Resumen · Cobertura de cuentas · Ajustes y devengamientos ·
Inventario y costo de ventas · Bienes de uso · Mediciones a valores corrientes ·
Ajuste por inflación · RECPAM · Controles finales · Estados contables ·
Preparación del cierre.

---

## 6. Cobertura de cuentas

La tabla muestra por cuenta: código, nombre, rubro, condición monetaria,
criterio de medición, tratamiento, períodos de origen con su coeficiente,
importe histórico, reexpresado, ajuste, importe de exposición, participación en
el RECPAM, estado, fundamento y cantidad de asientos de origen.

Se filtra por *necesitan atención*, *monetarias*, *se reexpresan* y *valor
corriente*, se busca por código o nombre, y abre la cobertura **por rubro**
además de por cantidad y por saldo.

Una partida monetaria figura como **«Controlada — ya expresada en moneda de
cierre»**. Es la lectura que la fase quería asegurar: no aparece como omitida.

Sobre el caso Purmamarca 2025: **43 cuentas, 100 % por cantidad y por saldo.**

---

## 7. Mediciones a valores corrientes

Esquema v23, tabla `closingMeasurements`. Migración puramente aditiva: no toca
cuentas, asientos ni ninguna cifra existente, y **no crea mediciones por su
cuenta** — una medición inventada sería peor que ninguna.

**Qué exige medición.** Sale de la política declarada de la cuenta (etiqueta
`medicion:valor-corriente` sobre un rubro medible), no de una heurística.
Aplicar valores corrientes indiscriminadamente sería tan incorrecto como
omitirlos donde corresponde.

**Qué se registra.** Rubro, cuenta, partida, cantidad, medición anterior, fecha,
criterio (valor neto de realización, costo de reposición, valor razonable,
cotización, valor descontado, valor recuperable), valor unitario y total,
fuente, URL, evidencia, mercado, método, supuestos, valor recuperable,
diferencia, cuenta de resultado por tenencia, responsable y observaciones.

**El recorrido en pantalla** es literalmente el que pedía el encargo:

```
Medición anterior → Medición al cierre → Diferencia → Resultado reconocido → Asiento
```

El asiento se muestra completo **antes** de contabilizarse. Se contabiliza por
la puerta única del Diario, es idempotente por `sourceId` y se revierte con un
motivo. Una medición pendiente **bloquea el cierre**.

---

## 8. Bienes de uso: auditoría del coeficiente medio

La Fase 2I reexpresó la depreciación acumulada con el coeficiente medio de la
clase. **Se auditó si esa solución es universal y la respuesta es no.**

El caso adverso construido: una misma clase con dos bienes de igual costo, uno
incorporado en enero con vida útil de diez años y otro en noviembre con vida
útil de dos. Con vidas distintas la depreciación deja de ser proporcional al
costo, así que ponderarla por costo se aparta del cálculo bien por bien en un
importe material.

**Solución.** Cuando existen fichas de bienes de uso que cubren la clase, cada
bien se reexpresa por el coeficiente de **su** mes de alta y su propia política
de depreciación. Cuando no existen, se conserva el promedio y el anexo lo
**declara**: la cifra aproximada se informa como tal y se indica que cargar las
fichas la vuelve exacta. La advertencia no bloquea la publicación —no es un
error, es una precisión menor declarada— y no aparece en clases homogéneas,
donde el promedio sí es exacto.

---

## 9. Retiro de la planilla AxI (DEF-A12, DEF-A13)

La planilla *Cierre: AxI + Valuación* mantenía una clasificación monetaria
propia, un registro de índices propio y una fecha de cierre desvinculada del
ejercicio activo: una segunda fuente de verdad que podía contradecir al motor.

**Se retiró de la navegación y su ruta redirige al pre-cierre.** La
clasificación proviene exclusivamente de
`src/reporting/inflation/accountTreatment.ts` y los índices, del registro
canónico. No quedan dos motores, dos clasificaciones ni dos registros.

---

## 10. Pruebas

| | Antes de 2J | Después |
|---|---:|---:|
| Pruebas unitarias e integración | 719 | **746** |
| Archivos de prueba | 101 | **103** |
| E2E Chromium | 35 | **45** |
| Controles del cuadro de conciliación | 45 | 45 |

Todo en verde. `tsc --noEmit` limpio; `eslint` sin errores (54 advertencias
preexistentes). Performance del motor dentro de presupuesto: 484 ms para 10.000
asientos y 3.344 ms para 100.000.

Pruebas nuevas:

- `tests/reporting/nucleo-controles-2j.test.ts` (17): qué bloquea, qué advierte,
  la separación entre publicar y cerrar, y que ninguna etapa se marque no
  aplicable sin motivo.
- `tests/reporting/bienes-uso-clase-heterogenea-2j.test.ts` (10): el caso adverso
  que refuta el coeficiente medio y su corrección por ficha.
- `e2e/pre-cierre-2j.spec.ts` (10): navegación, redirección de la ruta vieja,
  encabezado del ejercicio, cobertura, RECPAM, y el ciclo bloqueo → resolución
  verificando que el mismo bloqueo impide cerrar desde Configuración.

**Sobre las expectativas que cambiaron.** Los fixtures que cierran ejercicios
ahora identifican su entidad emisora, porque el núcleo lo exige: unos estados
contables sin denominación ni CUIT no se emiten. Es un requisito nuevo y
deliberado, no un ajuste para que una prueba pasara. Ningún importe del caso
Purmamarca se tocó.

---

## 11. Lo que esta fase NO entrega

### 11.1 Exportación PDF profesional (§13) — **no hecha**

**Qué falta.** Carátula con los datos canónicos del ente, índice con páginas,
Estado de Situación Patrimonial en formato clásico de dos lados, Estado de
Resultados vertical progresivo con sangrías y subtotales, EEPN matricial con
encabezados repetidos al cambiar de página, EFE completo con REI y transacciones
sin movimiento, notas y anexos, y el conjunto de reglas de diseño A4.

**Por qué falta.** Es una pieza grande —un generador de documento formal, no un
ajuste al existente— y no había margen para construirla **y verificarla** en
esta fase. Entregar un PDF a medio hacer, sin comprobar desbordes ni cortes de
página, habría sido peor que no tocarlo.

**Riesgo.** Quien exporte hoy obtiene el documento anterior. Las cifras que
produce son correctas —salen del mismo bundle— pero la presentación no cumple lo
que el encargo define como formal. **Es el motivo principal del veredicto.**

### 11.2 Exportación Excel (§14) — **no hecha**

Mismo motivo. El exportador actual sigue vigente. Falta la igualdad verificada
pantalla = PDF = Excel, que sólo tiene sentido construir junto con el PDF nuevo.

### 11.3 Ejercicio 2026 y comparativos reales (§11 del encargo) — **no hecho**

**Qué falta.** El escenario 2026 completo sobre la apertura de 2025, con reserva
legal, distribución del resultado, nuevas altas y bajas, cierre 2026 y apertura
2027; y con él la verificación de los comparativos 2026/2025, de las cifras de
2025 expresadas en moneda de diciembre de 2026 y de la no duplicación de
reexpresiones.

**Riesgo.** El motor de comparativos existe y tiene pruebas unitarias, pero
**nunca se ejerció sobre dos ejercicios reales encadenados**. Es la brecha de
cobertura más importante que queda: un error en la reexpresión del comparativo
no se detectaría con lo que hay hoy.

### 11.4 Revisión normativa del IVA de bienes de uso en el EFE (§10) — **no hecha**

La Fase 2I adoptó la convención de llevar el cobro íntegro de una disposición
—IVA incluido— a la actividad de inversión, y lo documentó con sus alternativas.
Esta fase debía revisarla normativamente y agregar el juego completo de pruebas
de IVA (compra al contado, a crédito, pago posterior, venta, cobro posterior,
saldo técnico, disposición con ganancia y con pérdida). No se hizo.

**Riesgo.** Bajo en cuanto a cifras —la variación neta del efectivo y la
igualdad directo = indirecto están probadas— y medio en cuanto a exposición: la
apertura por actividad podría revisarse.

---

## 12. Defectos

| ID | Estado |
|---|---|
| DEF-A12 · La planilla de AxI no se ata al ejercicio activo | **Cerrado** — la planilla se retiró |
| DEF-A13 · Clasificación monetaria de la planilla de AxI | **Cerrado** — sólo queda el clasificador canónico |
| DEF-A18 · Nota de PN vs. ESP antes del cierre | **Abierto** |

**21 de 22 defectos del registro original están cerrados.**

No se detectaron defectos nuevos en el motor durante esta fase. Sí se detectó y
corrigió una **fragilidad de las pruebas E2E**: el panel de cierre dispara ahora
la lectura del núcleo de controles y esa carga en vuelo chocaba con la siguiente
navegación.

---

## 13. Riesgos residuales

1. **No hay emisión formal.** Es el riesgo principal: el circuito llega a
   estados correctos y verificados, pero el documento que sale por la puerta no
   tiene el formato que un juego de estados contables requiere.
2. **Los comparativos no fueron ejercidos sobre datos reales encadenados.**
3. **DEF-A18** sigue abierto: la nota de patrimonio neto no coincide con el ESP
   antes de la refundición.
4. **La depreciación reexpresada es aproximada** en clases heterogéneas sin
   ficha. Está declarada en el anexo, pero un usuario que no cargue fichas
   convive con una precisión menor.

---

## 14. Veredicto

### APTO CON OBSERVACIONES

**Por qué no es APTO PARA CIERRE Y EMISIÓN FORMAL.** El propio encargo lo
define: no corresponde usar «APTO» si el PDF no es formal, si el Excel no
coincide o si falta el comparativo. Las tres condiciones se cumplen. El circuito
contable llega a estados correctos, demostrables y bloqueados cuando deben
estarlo; lo que no existe todavía es la **emisión** con la forma que un juego de
estados contables requiere.

**Por qué no es NO APTO.** Nada de lo entregado produce cifras incorrectas. El
núcleo único de controles cerró el agujero más serio que quedaba —que el cierre
no consultara los controles de publicación—, se acabó la segunda fuente de
verdad del ajuste por inflación, las mediciones al cierre existen y bloquean, y
la reexpresión de bienes de uso se auditó contra su propio caso adverso y se
corrigió. El ejercicio 2025 recorre el ciclo completo con 100 % de cobertura,
RECPAM conciliado por dos caminos y todas las etapas del pre-cierre en verde.

**Condición para elevar el veredicto**, en este orden:

1. Exportación PDF formal desde el snapshot canónico.
2. Exportación Excel con igualdad verificada pantalla = PDF = Excel.
3. Ejercicio 2026 completo con comparativos reales y cierre/apertura encadenados.
4. Revisión normativa del IVA de bienes de uso en el EFE, con su juego de pruebas.
5. DEF-A18.
