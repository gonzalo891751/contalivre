# Flujo ideal del ciclo contable en ContaLivre

Propuesta de arquitectura funcional derivada de la auditoría E2E. No es un
rediseño visual: es el orden de las etapas, sus requisitos y sus bloqueos.

La guía debe ser **implícita**: estado del ejercicio visible, acciones
habilitadas o deshabilitadas con su motivo, y advertencias sólo cuando hay un
riesgo real. Sin tutoriales, sin modales de bienvenida, sin carteles repetidos.

---

## Secuencia normativa

El orden que sigue no es el que la aplicación propone hoy; es el que exige la
lógica contable. Los pasos 10 a 12 son el punto donde ContaLivre más se aparta.

```
1  Configuración        →  2  Apertura        →  3  Operaciones
                                                        ↓
6  Pre-cierre           ←  5  Ajustes         ←  4  Revisión
        ↓
7  Medición a valores corrientes
        ↓
8  Reexpresión a moneda de cierre  →  9  RECPAM
        ↓
10 Refundición  →  11 Estados contables  →  12 Cierre  →  13 Apertura siguiente
```

**Por qué este orden.** La reexpresión (8) va *después* de las mediciones a
valores corrientes (7) y de las depreciaciones y el costo de ventas (5), porque
esas partidas se reexpresan desde su anticuación y su valor recuperable se
compara contra el importe ya reexpresado. El RECPAM (9) se determina sobre la
posición monetaria una vez reexpresado todo lo no monetario: si se calcula antes,
la cifra queda como diferencia de cuadre y no como resultado explicado. La
refundición (10) va después de la reexpresión, no antes: refundir primero
obligaría a reexpresar un resultado ya volcado al patrimonio. Los estados (11)
se emiten con el ejercicio todavía abierto y el cierre (12) es el acto que los
congela.

---

## Etapa 1 · Configuración

| | |
|---|---|
| **Requisitos previos** | Ninguno |
| **Acciones permitidas** | Ficha de la empresa, plan de cuentas, mapeos, perfil sectorial, políticas del EFE, series de índices |
| **Acciones bloqueadas** | Contabilizar (no hay ejercicio) |
| **Información visible** | Qué falta para poder operar: denominación, CUIT, ejercicio, cuenta receptora del resultado |
| **Controles automáticos** | Cuentas imputables con grupo de exposición; cuenta de PN con grupo `RETAINED_EARNINGS` |
| **Reversión** | Total |

La ficha de la empresa debe ser la **única** fuente de la denominación: hoy
conviven dos y los estados salen con el nombre por defecto (DEF-A11).

---

## Etapa 2 · Apertura

| | |
|---|---|
| **Requisitos previos** | Empresa configurada |
| **Acciones permitidas** | Crear el ejercicio (incluidos ejercicios anteriores y períodos irregulares); cargar saldos iniciales o recibir el asiento de apertura del ejercicio previo |
| **Acciones bloqueadas** | Contabilizar fuera del rango del ejercicio |
| **Información visible** | Ejercicio activo, rango, estado, origen de los saldos iniciales |
| **Controles automáticos** | Los saldos de apertura balancean; sólo cuentas patrimoniales |
| **Reversión** | Editar el ejercicio mientras no tenga asientos |

Falta una acción explícita para **crear un ejercicio de un año elegido**
(DEF-A20). El aprovisionamiento automático al contabilizar es cómodo, pero deja
al usuario sin forma de preparar el ejercicio antes de cargar nada.

---

## Etapa 3 · Operaciones

| | |
|---|---|
| **Requisitos previos** | Ejercicio abierto |
| **Acciones permitidas** | Módulos operativos, asiento manual, importación |
| **Acciones bloqueadas** | Contabilizar en un período cerrado. Contabilizar fuera del ejercicio activo debe **pedir confirmación**, no crear un ejercicio en silencio (DEF-A21) |
| **Información visible** | Estado de cada asiento (borrador / contabilizado / revertido) y su origen |
| **Controles automáticos** | Partida doble, escala de centavos, cuenta imputable y vigente, fecha dentro del ejercicio, **detección de importaciones repetidas** |
| **Reversión** | Borradores: edición y borrado. Contabilizados: reversión auditada |

La fecha propuesta al abrir un asiento nuevo debe ser la última usada o el
cierre del ejercicio, nunca la fecha del día si cae fuera del ejercicio.

---

## Etapa 4 · Revisión

| | |
|---|---|
| **Requisitos previos** | Operaciones cargadas |
| **Acciones permitidas** | Diario, mayores, balance de sumas y saldos, trazabilidad hasta el asiento |
| **Información visible** | Diferencias entre módulos y Diario (la conciliación de bienes de uso ya lo hace bien) |
| **Controles automáticos** | Debe = Haber por asiento y total; Diario = mayores = balance |

---

## Etapa 5 · Ajustes

| | |
|---|---|
| **Requisitos previos** | Revisión sin diferencias |
| **Acciones permitidas** | Devengamientos, depreciaciones, costo de ventas, previsiones, diferencias de cambio, conciliación bancaria |
| **Información visible** | Checklist de ajustes típicos con su estado, derivado de los datos (hay bienes de uso sin depreciar en el ejercicio, hay inventario sin costo imputado, etc.) |
| **Controles automáticos** | Depreciación = anexo de bienes de uso; CMV = movimiento de bienes de cambio |
| **Reversión** | Reversión auditada de cada ajuste |

---

## Etapa 6 · Pre-cierre

| | |
|---|---|
| **Requisitos previos** | Ajustes hechos |
| **Acciones permitidas** | Ver el tablero de requisitos del cierre |
| **Acciones bloqueadas** | Refundir |
| **Información visible** | Una lista de verificación con lo que falta y el enlace a cada pantalla |
| **Controles automáticos** | Sin borradores ajenos; Diario balanceado; sin cuentas sin mapeo; índices completos para todo el ejercicio; inventario final cargado; depreciaciones del ejercicio; EFE sin flujos sin clasificar |

Es la etapa que la aplicación **ya resuelve bien**: la compuerta de publicación
de los estados corre 19 controles y explica cada bloqueo. Lo que falta es que
ese mismo tablero gobierne el cierre y no sólo la publicación.

---

## Etapa 7 · Medición a valores corrientes

| | |
|---|---|
| **Requisitos previos** | Pre-cierre sin bloqueos |
| **Acciones permitidas** | Valor neto de realización de bienes de cambio, valor recuperable de bienes de uso, cotizaciones de inversiones y moneda extranjera |
| **Información visible** | Comparación entre importe contable y valor corriente, con el ajuste resultante |
| **Controles automáticos** | La comparación con el valor recuperable se hace contra el importe **ya reexpresado** |

---

## Etapa 8 · Reexpresión a moneda de cierre

| | |
|---|---|
| **Requisitos previos** | Serie de índices registrada y **completa** para todo el ejercicio, con proveniencia |
| **Acciones permitidas** | Elegir el set, ver la anticuación por partida y el coeficiente aplicado |
| **Acciones bloqueadas** | Reexpresar con meses faltantes; reexpresar dos veces la misma partida |
| **Información visible** | Estado del set (oficial / manual / ejemplo), cobertura, hash de integridad, coeficiente por período |
| **Controles automáticos** | Sin doble reexpresión; sin interpolación de índices faltantes |
| **Reversión** | Cambiar de set recalcula; nada se contabiliza sin confirmación |

El registro canónico incorporado durante esta auditoría cubre el requisito de
proveniencia. Falta la anticuación **por partida** en bienes de uso: hoy se
reexpresa por la fecha del asiento y eso rompe las bajas y las depreciaciones
(DEF-A09 y DEF-A10).

---

## Etapa 9 · RECPAM

| | |
|---|---|
| **Requisitos previos** | Reexpresión completa |
| **Acciones permitidas** | Ver el cálculo mes a mes de la posición monetaria y su resultado |
| **Información visible** | Posición monetaria neta al inicio de cada mes, coeficiente, componente del resultado |
| **Controles automáticos** | El RECPAM se **deriva** de la posición monetaria; nunca es la cifra que hace cuadrar el estado |

La clasificación monetaria / no monetaria tiene que ser una propiedad **mapeada
de la cuenta**, revisable y con valor por defecto sensato, no una heurística que
confunde un seguro pagado por adelantado con una partida monetaria (DEF-A13).
Y el rótulo tiene que distinguir la posición monetaria del RECPAM.

---

## Etapa 10 · Refundición

| | |
|---|---|
| **Requisitos previos** | Todo lo anterior, con la vista previa sin bloqueos |
| **Acciones permitidas** | Generar la refundición **en borrador**, inspeccionarla en el Diario, contabilizarla |
| **Acciones bloqueadas** | Contabilizar con borradores ajenos pendientes o con el Diario descuadrado |
| **Información visible** | Ejercicio y fecha de cierre, cuentas a refundir con su saldo, resultado, cuenta receptora |
| **Controles automáticos** | Idempotencia (no se refunde dos veces); las cuentas de resultado quedan en cero |
| **Reversión** | Los borradores se regeneran o se borran; la refundición contabilizada se revierte con la reapertura |

Este es el flujo que el servicio ya implementaba y que la auditoría hizo
alcanzable desde la interfaz (DEF-A04) y ejecutable de punta a punta (DEF-A05).

---

## Etapa 11 · Estados contables

| | |
|---|---|
| **Requisitos previos** | Refundición contabilizada (o ejercicio pre-cierre, para una vista preliminar rotulada como tal) |
| **Acciones permitidas** | Ver, comparar, exportar en PDF y planilla, guardar una versión validada |
| **Acciones bloqueadas** | Publicar con controles en rojo |
| **Información visible** | Los 19 controles con su diferencia; unidad de medida; set de índices aplicado |
| **Controles automáticos** | Compuerta de publicación completa |
| **Reversión** | La versión validada se invalida sola si el Diario cambia |

---

## Etapa 12 · Cierre

| | |
|---|---|
| **Requisitos previos** | Refundición contabilizada |
| **Acciones permitidas** | Cerrar el ejercicio y sus períodos |
| **Acciones bloqueadas** | Toda contabilización con fecha dentro del ejercicio cerrado |
| **Información visible** | Estado del ejercicio en el encabezado y en la lista de ejercicios |
| **Controles automáticos** | Registro de auditoría del cierre con los asientos generados y el resultado |
| **Reversión** | Reapertura explícita, con motivo obligatorio, que revierte los asientos automáticos e invalida los estados publicados |

Verificado en la auditoría: tras el cierre, contabilizar al 30/12/2025 se rechaza
con *«El ejercicio "Ejercicio 2025" está cerrado y no admite contabilizaciones»*,
y el ejercicio sigue consultable.

---

## Etapa 13 · Apertura del ejercicio siguiente

| | |
|---|---|
| **Requisitos previos** | Ejercicio anterior cerrado |
| **Acciones permitidas** | Generar el asiento de apertura |
| **Acciones bloqueadas** | Generar una segunda apertura del mismo ejercicio |
| **Información visible** | Cuentas arrastradas y total; enlace al ejercicio de origen |
| **Controles automáticos** | Sólo cuentas patrimoniales; la apertura balancea; el saldo inicial iguala el final del ejercicio cerrado; las políticas contables y el plan de cuentas se heredan |
| **Reversión** | La reapertura del ejercicio anterior revierte también la apertura del siguiente |

Verificado: un único asiento al 01/01/2026, por $ 70.927.300 de cada lado, con
cuentas de activo, pasivo y patrimonio neto exclusivamente, y sin ninguna cuenta
nominal arrastrada.

---

## Lo que falta para que se sienta un sistema y no una colección de pantallas

1. **Un tablero del ejercicio.** Una sola pantalla que muestre en qué etapa está
   el ejercicio, qué falta para la siguiente y con un enlace a cada pendiente.
   Los datos ya existen (la compuerta de publicación los calcula); falta
   presentarlos como progreso del ciclo y no sólo como bloqueos de publicación.

2. **Un solo lugar para cada cosa.** Hoy hay dos almacenes de índices, dos
   identidades de empresa y dos lugares donde se define el ejercicio (la ficha y
   el selector del encabezado). Cada duplicación produjo un defecto de esta
   auditoría.

3. **Retirar o terminar el módulo de AxI.** Se autodeclara no apto para estados
   formales, propone una fecha de cierre que no es la del ejercicio y clasifica
   mal partidas monetarias. Mientras la reexpresión canónica viva en el motor de
   reporting, esa planilla confunde más de lo que ayuda.

4. **Anticuación por partida en bienes de uso.** Es el requisito técnico que
   falta para que la moneda de cierre sea correcta y no sólo esté disponible.
