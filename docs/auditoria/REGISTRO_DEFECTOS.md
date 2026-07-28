# Registro de defectos — Auditoría E2E del ciclo contable

> **Actualizado tras la Fase 2I** (rama `fix/fase-2i-axi-medicion-cierre-exportables`).
> El detalle de cada corrección está en
> [`docs/IMPLEMENTACION_FASE_2I_AXI_MEDICION_CIERRE_EXPORTABLES.md`](../IMPLEMENTACION_FASE_2I_AXI_MEDICION_CIERRE_EXPORTABLES.md).
>
> | Estado | Defectos |
> |---|---|
> | Corregidos en la auditoría E2E | A01, A02, A03, A04, A05, A08, A19 |
> | Corregidos en la Fase 2I | A06, A07, A09, A10, A11, A14, A15, A16, A17, A20, A21, A22 |
> | Abiertos | A12, A13 (mitigado), A18 |
>
> **19 de 22 cerrados.** DEF-A06 se revisó semánticamente antes de tocarlo y se
> confirmó que **no era un falso positivo**: en el método directo la ganancia se
> imputaba a las actividades operativas como un cobro real, y en el indirecto no
> se eliminaba. La evidencia y el razonamiento están en §10 del informe de la
> Fase 2I.

Severidades:

- **Crítico**: puede producir estados contables incorrectos, pérdida de datos o un cierre inválido.
- **Alto**: produce cifras, clasificaciones o procesos incorrectos.
- **Medio**: afecta eficiencia, trazabilidad o comprensión.
- **Bajo**: problema visual, terminológico o de comodidad.

Estado: **Corregido** (con prueba y commit) · **Documentado** (queda para una fase posterior).

---

## DEF-A01 · No existe forma de registrar índices para la moneda de cierre

| | |
|---|---|
| **Severidad** | Crítico |
| **Módulo** | Inflación / Estados contables |
| **Estado** | Corregido — `0330666` |

**Pasos para reproducir (antes de la corrección)**

1. Cargar un ejercicio con operaciones.
2. Ir a *Planillas → Cierre: AxI + Valuación → Índices* e importar la serie oficial (13 períodos).
3. Ir a *Estados contables*.

**Resultado esperado.** El selector "Índices (moneda de cierre)" ofrece la serie recién cargada.

**Resultado obtenido.** El selector informa *"No hay sets de índices cargados. Cargalos en Cierre (AxI)
para habilitar la moneda de cierre"* — exactamente donde se acababa de cargarlos.

**Causa.** Hay **dos almacenes de índices distintos**: la tabla de trabajo de la planilla de Cierre
(estado del módulo `cierre-valuacion`) y el registro canónico versionado `inflationIndexSets`, que es
el único que consume `loadReportingBundle`. `saveIndexSet` solo se invocaba desde fixtures de prueba:
ninguna pantalla de la aplicación podía escribir el registro canónico.

**Impacto contable.** Los pasos 11 y parte del 12 del ciclo eran inalcanzables: sin set registrado no
hay reexpresión a moneda de cierre, ni RECPAM en los estados, ni EFE en moneda homogénea, ni anexo de
bienes de uso reexpresado. Para una aplicación cuyo marco declarado es RT 54 (t.o. RT 59) en la
Argentina, esto invalida la emisión formal de estados contables.

**Impacto para el usuario.** El mensaje lo mandaba a una pantalla que no resuelve el problema.

**Solución aplicada.** Nueva sección *Configuración → Inflación* con el registro de la serie y su
proveniencia completa (nombre, estado OFICIAL/MANUAL/EJEMPLO, fuente, URL, cobertura y hash de
integridad), un lector de series puro que **no redondea** el valor de la fuente, y detección de meses
faltantes sin interpolarlos. Se corrigió el mensaje del selector.

**Verificación.** `tests/accounting/indices-registro-canonico.test.ts` (10 casos) y el paso 2 del
recorrido E2E. Evidencia: `evidencia/02-indices-oficiales.png`.

---

## DEF-A02 · El puente del costo de ventas confunde devoluciones con consumos

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | Motor de reporting — anexo de costo de ventas |
| **Estado** | Corregido — `31cf19b` |

**Pasos para reproducir**

1. Llevar bienes de cambio con inventario permanente (el modelo del plan de cuentas base).
2. Registrar una devolución al proveedor: `Proveedores` al Debe / `Mercaderías` al Haber.
3. Registrar la devolución de un cliente a su costo: `Mercaderías` al Debe / `CMV` al Haber.
4. Abrir *Estados contables → Notas y Anexos → Costo de ventas*.

**Resultado esperado.** El puente `EI + compras − devoluciones − EF = CMV` concilia con el ER.

**Resultado obtenido.** *"Diferencia 1900000: hay movimientos de bienes de cambio sin componente de
costo mapeado (revisar bajas/ajustes de inventario)"*, y la compuerta de publicación marcaba los
estados como **no publicables**. No había ninguna baja ni ajuste de inventario.

**Causa.** Sin `costComponent` mapeado —el plan de cuentas base no lo trae en ninguna cuenta— el
puente clasificaba por el único criterio disponible: todo débito a existencias es compra, todo crédito
es consumo. La devolución al proveedor se contaba como CMV y el reingreso de la devolución del cliente
como compra.

**Impacto contable.** El ESP y el ER eran correctos; el anexo del CMV y la compuerta de publicación,
no. En este ejercicio el puente informaba un CMV de $37.400.000 contra los $35.500.000 reales.

**Solución aplicada.** La clasificación mira la contrapartida del asiento: salida de existencias
**sin cuenta de resultado** asociada ⇒ devolución de compras; entrada **contra la cuenta de costo del
ER** ⇒ reversión del consumo. Una salida contra otra cuenta de resultado (un siniestro) **sigue
exponiéndose** sin absorberse, que era el comportamiento buscado del diseño original.

**Verificación.** `tests/reporting/costOfSales-devoluciones.test.ts` (3 casos, incluido el del
siniestro que debe seguir bloqueando) más los 6 casos preexistentes de `costOfSales2e.test.ts`.
Evidencia: `evidencia/10-notas-y-anexos.png`.

---

## DEF-A03 · Aplicar un rango deja el encabezado y los reportes en años distintos

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | Selector de período (encabezado) |
| **Estado** | Corregido — `cf859e3` |

**Pasos para reproducir**

1. Con el selector en 2026, abrirlo y fijar el rango 01/01/2025 – 31/12/2025.
2. Aplicar el rango.

**Resultado esperado.** El encabezado pasa a *Ejercicio 2025*.

**Resultado obtenido.** El encabezado muestra **"Ejercicio 2026 · 01/01/2025 - 31/12/2025"**, y la
ficha de la empresa en el Dashboard informa simultáneamente "Ejercicio actual 01/01/2025 al
31/12/2025". `localStorage` guardaba `{"year":2026,"start":"2025-01-01","end":"2025-12-31"}`.

**Causa.** `handleApplyRange` llamaba a `setPeriod(year, ...)` con el año anterior, sin derivarlo de la
fecha de inicio del rango aplicado.

**Impacto contable.** Todo lo que se indexa por año —Estados contables (`loadReportingBundle(year)`),
Dashboard, indicadores— consultaba un ejercicio distinto del que el encabezado mostraba. En una base
con dos ejercicios cargados, el usuario podía leer los estados de un año creyendo ver los de otro.

**Solución aplicada.** El año se deriva siempre de la fecha de inicio del rango, con la misma
convención que usa el contexto contable persistido. El año por defecto dejó de estar fijado a la
constante `2026` y toma el corriente.

**Verificación.** `tests/ui/periodo-rango-anio.test.ts`.

---

## DEF-A04 · El cierre del ejercicio no era alcanzable desde la aplicación

| | |
|---|---|
| **Severidad** | Crítico |
| **Módulo** | Cierre / Configuración → Ejercicios |
| **Estado** | Corregido — `5d06a76` |

**Pasos para reproducir**

1. Recorrer toda la aplicación buscando dónde cerrar el ejercicio.

**Resultado esperado.** Una acción de cierre con vista previa, refundición y apertura del siguiente.

**Resultado obtenido.** No existe. *Configuración → Ejercicios* sólo ofrecía **"Reabrir…"** y remitía a
*Planillas → Cierre (AxI + Valuación)*, que tiene cuatro solapas (Índices, Reexpresión, Valuación,
Asientos), ninguna de las cuales cierra el ejercicio, y que se autodeclara *"Módulo en revisión
normativa. No utilizar para emitir estados formales"*.

**Causa.** El servicio `closingService` estaba implementado y probado (`previewClosing`,
`generateClosingDrafts`, `postClosing`, `generateOpeningEntry`, `reopenClosedExercise`), pero de sus
cinco operaciones sólo la reapertura tenía interfaz. Se podía reabrir un ejercicio que nunca se había
podido cerrar.

**Impacto contable.** Los pasos 10, 13 y 14 del ciclo eran imposibles: sin refundición no hay cierre
de las cuentas de resultado, sin cierre no hay asiento de apertura y no hay continuidad entre
ejercicios.

**Solución aplicada.** Panel de cierre dentro de *Configuración → Ejercicios*, con los tres pasos del
servicio: vista previa (bloqueos, advertencias, resultado y detalle de las cuentas a refundir),
generación de la refundición **en borrador** para poder revisarla en el Libro Diario, y contabilización
con confirmación previa, seguida de la apertura del ejercicio siguiente.

**Verificación.** `tests/acceptance/ciclo-accesible-desde-ui.test.ts` es la guarda de regresión: falla
si alguna de estas capacidades vuelve a quedar sin interfaz. Pasos 6 a 10 del recorrido E2E.
Evidencia: `evidencia/11` a `evidencia/16`.

---

## DEF-A05 · Generar la refundición bloqueaba el propio cierre

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | `closingService.previewClosing` |
| **Estado** | Corregido — `a12e2ce` |

**Pasos para reproducir**

1. Sobre un ejercicio sin borradores pendientes, ejecutar `generateClosingDrafts` (paso 2 del ciclo).
2. Volver a pedir la vista previa.

**Resultado esperado.** La vista previa sigue permitiendo cerrar: los borradores recién creados son
justamente los que hay que contabilizar.

**Resultado obtenido.** *"Hay 3 borrador(es) pendientes en el ejercicio: contabilizalos o eliminalos
antes de cerrar"*, con `canClose: false` y ambas acciones deshabilitadas. El ciclo quedaba trabado en
su segundo paso.

**Causa.** `previewClosing` contaba todos los borradores del rango, incluidos los del módulo de cierre
que él mismo acababa de generar.

**Impacto para el usuario.** El flujo documentado —generar, revisar, contabilizar— era imposible de
completar respetando la vista previa. Sólo funcionaba llamando a `postClosing` directamente, que
ignora `canClose`.

**Solución aplicada.** Los borradores del módulo de cierre se cuentan aparte (`closingDraftCount`) y
sólo bloquean los ajenos. El panel refleja el estado y ofrece regenerarlos.

**Verificación.** Dos casos nuevos en `tests/accounting/cierre-apertura.test.ts`.

---

## DEF-A06 · La ganancia por venta de bienes de uso se clasifica como flujo operativo

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | Motor de reporting — EFE |
| **Estado** | Corregido en la Fase 2I — `f9296c5` · confirmado que NO era un falso positivo |

**Pasos para reproducir**

1. Vender un bien de uso con IVA débito fiscal (el caso normal de un responsable inscripto):
   `Banco` + `Amort. acum.` al Debe / `Rodados`, `IVA DF` y `Resultado venta bienes de uso` al Haber.
2. Abrir *Estados contables → Flujo de Efectivo*.

**Resultado esperado.** El cobro por la disposición del bien pertenece íntegro a actividades de
inversión (RT 54 t.o. RT 59, párr. 656); el resultado de la venta no es un flujo operativo.

**Resultado obtenido.** En actividades operativas aparece *"Cobros por otros ingresos operativos
$ 400.000,00"*, que es exactamente la ganancia de la venta, y en inversión sólo entran $ 3.400.000
(el valor residual) en lugar de los $ 3.800.000 del precio.

**Causa.** `detectDisposalFold` pliega correctamente la disposición a inversión, pero sólo cuando el
asiento no toca capital de trabajo. La línea de IVA débito fiscal es capital de trabajo
(`TAX_LIABILITIES`), así que el plegado se desactiva. En la Argentina, una venta gravada de un bien de
uso **siempre** tiene esa línea: la salvaguarda inhabilita la regla justo en el caso que la motiva.

En el mismo ejercicio se verifica que el plegado sí funciona cuando no hay IVA: el vencimiento del
plazo fijo ($ 5.750.000, capital más intereses) entra completo en inversión.

**Impacto contable.** Sobreestima el flujo operativo y subestima el de inversión. En este ejercicio,
$ 400.000 sobre un flujo operativo de $ 2.418.200 (17 %). La variación neta del efectivo sigue siendo
correcta y el método directo iguala al indirecto: el error es de clasificación, no de importe total.

**Recomendación.** Extender el plegado para tolerar líneas de impuestos originadas en la propia
disposición: plegar a inversión el resultado y el valor residual, y dejar el componente de IVA en los
flujos impositivos operativos. Requiere revisar la algebra que hoy garantiza directo = indirecto, por
lo que corresponde a una fase de diseño y no a un parche durante la auditoría.

**Riesgo si no se corrige.** Un EFE con actividades mal clasificadas es observable por un auditor y
distorsiona todos los indicadores de flujo de fondos.

---

## DEF-A07 · El pago diferido de un bien de uso no llega a actividades de inversión

| | |
|---|---|
| **Severidad** | Medio |
| **Módulo** | Motor de reporting — EFE |
| **Estado** | Corregido en la Fase 2I — `f9296c5` |

**Pasos para reproducir**

1. Comprar un bien de uso en cuenta corriente (`Equipos` + `IVA CF` al Debe / `Acreedores varios` al Haber).
2. Pagar más adelante (`Acreedores varios` al Debe / `Banco` al Haber).
3. Abrir *Estados contables → Flujo de Efectivo*.

**Resultado obtenido.** La compra se revela correctamente entre las *transacciones sin efecto en el
efectivo*, pero el pago posterior de $ 3.630.000 aparece en *"Otros cobros y pagos operativos"*: el
bien de uso nunca genera un flujo de inversión.

**Causa.** El método directo clasifica cada línea por su contrapartida. La contrapartida del pago es
`Acreedores varios` (`OTHER_PAYABLES`), que es capital de trabajo operativo. La aplicación no conserva
el vínculo entre la deuda y el activo que la originó.

**Impacto contable.** RT 54 clasifica los pagos por adquisición de bienes de uso como actividades de
inversión con independencia del momento del pago.

**Recomendación.** Aprovechar la política transaccional del EFE que ya existe (`cashFlowPolicy`,
overrides por asiento/operación) para permitir marcar el pago como de inversión, y ofrecerlo desde el
módulo de Bienes de Uso cuando la compra se registró a crédito.

---

## DEF-A08 · Reimportar el mismo archivo duplicaba el ejercicio completo

| | |
|---|---|
| **Severidad** | Crítico |
| **Módulo** | Importador del Libro Diario |
| **Estado** | Corregido — `5aed5e7` |

**Pasos para reproducir (antes de la corrección)**

1. Importar el archivo del ejercicio (95 asientos, 300 líneas).
2. Sin cambiar nada, volver a importar exactamente el mismo archivo.

**Resultado esperado.** Un aviso de que esos asientos ya están contabilizados.

**Resultado obtenido.** El resumen informaba *"Advertencias: Ninguna"* y, al confirmar, el Libro Diario
pasó de **95 a 190 asientos**. El ejercicio entero quedó contabilizado dos veces: totales del Diario,
mayores, balance y los cuatro estados contables exponían el doble.

**Causa.** El importador llama a `createEntry` sin `sourceModule` ni `idempotencyKey`, de modo que cae
en `postNewEntry`, que no deduplica. La infraestructura de idempotencia existe y funciona
(`postOperation`), pero la importación manual no la usaba.

**Impacto contable.** Estados contables materialmente falsos, sin ninguna señal para el usuario. Es el
defecto más peligroso de los encontrados: no hay error visible, sólo cifras dobles.

**Solución aplicada.** El asistente contrasta el archivo contra los libros por la huella del hecho
contable (fecha, concepto normalizado y líneas), avisa cuántos ya están contabilizados y ofrece
omitirlos, marcado por defecto. **No fusiona en silencio**: dos asientos económicamente idénticos del
mismo día pueden ser legítimos, así que la decisión queda en quien importa.

**Verificación.** `tests/accounting/import-duplicados.test.ts` (8 casos) y comprobación en la
aplicación real: reimportar los mismos 95 asientos ahora deja el Diario en 95.

---

## DEF-A09 · El anexo de bienes de uso en moneda de cierre reexpresa mal las bajas

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | `reporting/engine/fixedAssetsInflation.ts` |
| **Estado** | Corregido en la Fase 2I — `d2340d7` |

**Pasos para reproducir**

1. Comprar un bien de uso en enero y venderlo en septiembre del mismo ejercicio.
2. *Estados contables → Notas y Anexos → Bienes de uso → Moneda de cierre*.

**Resultado obtenido.** Valor de origen reexpresado al cierre **$ 12.326.577,61**, cuando los bienes
efectivamente en existencia (muebles de enero y equipos de febrero) valen **$ 11.492.722,36**
reexpresados. Sobreestimación de **$ 833.855,24**.

**Causa.** Cada línea del Diario se reexpresa con el coeficiente del mes de su asiento. La baja del
rodado (septiembre, coeficiente 1,078567) se resta con un coeficiente menor que el de su alta (enero,
1,287031), de modo que la resta no cancela la incorporación.

**Comprobación numérica.**

| Concepto | Coeficiente | Importe |
|---|---:|---:|
| Muebles y útiles (alta 01/2025) | 1,287031 | 7.722.184,43 |
| Rodado (alta 01/2025) | 1,287031 | 5.148.122,95 |
| Equipos (alta 02/2025) | 1,256846 | 3.770.537,94 |
| Baja del rodado, según la aplicación (09/2025) | 1,078567 | −4.314.267,71 |
| **VO reexpresado informado** | | **12.326.577,60** |
| **VO reexpresado correcto** (sólo los bienes en existencia) | | **11.492.722,36** |

**Recomendación.** Anticuar las bajas por el período de **origen del bien dado de baja**, no por el de
la baja. Requiere vincular cada crédito a bienes de uso con la partida que se da de baja: el módulo de
Bienes de Uso ya guarda la ficha con su fecha de alta, y el anexo debería construirse desde ahí y no
sólo desde el Diario.

---

## DEF-A10 · La amortización del ejercicio no se reexpresa sobre el valor reexpresado del bien

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | `reporting/engine/fixedAssetsInflation.ts` |
| **Estado** | Corregido en la Fase 2I — `d2340d7` |

**Resultado obtenido.** La columna *Ajuste dep.* del anexo en moneda de cierre da **cero**: la
amortización acumulada reexpresada ($ 1.600.000) es idéntica a la nominal.

**Causa.** La amortización del ejercicio se asienta al 31/12, y ese mes tiene coeficiente 1,000000.
Reexpresar el asiento por su fecha equivale a no reexpresarlo.

**Comprobación numérica.** La amortización reexpresada debería calcularse sobre el valor de origen
reexpresado: muebles $ 7.722.184,43 / 10 + equipos $ 3.770.537,94 / 3 = **$ 2.029.064,42**, contra los
$ 1.600.000 informados.

**Impacto contable.** Junto con DEF-A09, el valor residual en moneda de cierre se informa en
$ 10.726.577,61 cuando debería ser $ 9.463.657,94: **sobrevaluación del 13 %** del rubro.

**Recomendación.** Derivar la depreciación reexpresada del valor de origen reexpresado de cada bien y
su vida útil, en lugar de reexpresar el importe nominal del asiento de amortización. Es la misma
reforma estructural que DEF-A09: el anexo en moneda homogénea necesita la ficha de cada bien.

---

## DEF-A11 · La ficha de la empresa no llega al encabezado de los estados contables

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | Ficha de empresa / metadatos de reporting |
| **Estado** | Corregido en la Fase 2I — `b27bf55` |

**Pasos para reproducir**

1. Completar la ficha con la denominación *Purmamarca Comercial S.A. — Auditoría E2E*.
2. Abrir *Estados contables* y mirar la barra de metadatos del reporte.

**Resultado obtenido.** La barra informa **"Empresa ContaLivre"** —el nombre por defecto— igual que el
selector de período del encabezado. La denominación real sólo aparece en el título de la pantalla.

**Causa.** Conviven dos identidades: el registro `companies` (creado por `getDefaultCompany` con
`legalName: 'Empresa ContaLivre'`, que es el que leen los metadatos del reporte) y el perfil de empresa
(`companyProfile`, que alimenta la pantalla y el PDF oficial). La ficha nunca actualiza el primero.

**Impacto.** Los metadatos que acompañan a los estados y a los snapshots publicados identifican una
empresa que no existe.

**Recomendación.** Que guardar la ficha actualice también `companies.legalName` (y `currency` /
`jurisdiction` si el perfil los define), o unificar ambas entidades. Es un cambio pequeño pero toca la
identidad de los snapshots ya publicados, por lo que conviene hacerlo con una migración explícita.

---

## DEF-A12 · La planilla de AxI no se ata al ejercicio activo

| | |
|---|---|
| **Severidad** | Medio |
| **Módulo** | Planillas → Cierre: AxI + Valuación |
| **Estado** | Documentado |

**Resultado obtenido.** Con el ejercicio 2025 seleccionado, la planilla abre con *"Periodo 2026"*,
fecha de cierre 27/7/2026 (la fecha del día) y el aviso *"Falta índice 2026-07"*, mientras toma los
saldos del ejercicio 2025. Hay que corregir la fecha a mano en cada visita.

**Recomendación.** Inicializar la fecha de cierre con `exercise.endDate` del ejercicio activo y
bloquear fechas fuera del ejercicio.

---

## DEF-A13 · Clasificación monetaria automática incorrecta en la planilla de AxI

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | Planillas → Cierre: AxI + Valuación |
| **Estado** | Mitigado en la Fase 2I — el motor usa el clasificador correcto; la planilla conserva su heurística |

**Resultado obtenido.** El clasificador automático propone:

- **Seguros pagados por adelantado** como partida **monetaria**. Es no monetaria: se cancela con un
  servicio, no con una suma fija de dinero (RT 6).
- **Plazos fijos a cobrar** entre las *cuentas sin clasificar*. Es monetaria.
- Las cuentas de **amortización acumulada** aparecen como activos sin clasificar y con signo positivo.

**Impacto contable.** La posición monetaria neta —y por lo tanto el RECPAM que de ella se derive— parte
de una clasificación equivocada.

**Observación adicional.** El encabezado rotula *"NETO (RECPAM) $ 15.243.500"* a lo que en realidad es
la **posición monetaria neta**, no el RECPAM. La etiqueta induce a error.

**Atenuante.** El módulo lleva un aviso propio: *"Módulo en revisión normativa. No utilizar para emitir
estados formales"*.

---

## DEF-A14 · El plan de cuentas base no trae clases para el anexo de bienes de uso

| | |
|---|---|
| **Severidad** | Medio |
| **Módulo** | Plan de cuentas / anexo de bienes de uso |
| **Estado** | Corregido en la Fase 2I — `78cee1a` |

**Resultado obtenido.** El anexo expone una única fila **"Sin clase asignada"** con la advertencia
*"Hay cuentas de bienes de uso sin clase asignada"*. Una instalación nueva no puede producir el anexo
con la apertura por clase que exige la exposición formal.

**Recomendación.** Traer `annexGroup` precargado en las cuentas de bienes de uso del seed (Inmuebles,
Rodados, Muebles y útiles, Equipos de computación, Maquinarias, Instalaciones).

---

## DEF-A15 · El automapeo del importador asigna el código a la columna de nombre

| | |
|---|---|
| **Severidad** | Bajo |
| **Módulo** | Importador del Libro Diario |
| **Estado** | Corregido en la Fase 2I — `b27bf55` |

**Resultado obtenido.** Con un archivo que trae las columnas `cuenta_codigo` y `cuenta_nombre`, el paso
de mapeo asigna `cuenta_codigo` a **ambos** campos. Hay que corregirlo a mano. No produce cifras
erróneas —la resolución de cuentas funciona por código— pero el paso de mapeo aparenta estar bien
resuelto cuando no lo está.

---

## DEF-A16 · El importador de índices de la planilla redondea la serie a dos decimales

| | |
|---|---|
| **Severidad** | Medio |
| **Módulo** | Planillas → Índices |
| **Estado** | Corregido en la Fase 2I — `b27bf55` · era de presentación |

**Resultado obtenido.** La serie oficial `7694.0075` se muestra e importa como `7694.01`. Los índices
FACPCE / INDEC se publican con cuatro decimales y los coeficientes de reexpresión se calculan sobre
esa serie.

**Nota.** El registro canónico incorporado en DEF-A01 **no** redondea: conserva el valor de la fuente.

---

## DEF-A17 · El balance vacío informa que "cuadra perfectamente"

| | |
|---|---|
| **Severidad** | Bajo |
| **Módulo** | Balance de Sumas y Saldos |
| **Estado** | Corregido en la Fase 2I — `b27bf55` |

**Resultado obtenido.** Sin ningún asiento cargado, la pantalla muestra *"✓ El balance cuadra
perfectamente. Los totales de Debe y Haber coinciden"* junto a *"No hay movimientos para mostrar"*.
Un balance sin movimientos no cuadra ni deja de cuadrar; el mensaje debería ser un estado vacío.

---

## DEF-A18 · Notas y anexos: la nota de patrimonio neto no coincide con el ESP antes del cierre

| | |
|---|---|
| **Severidad** | Medio |
| **Módulo** | Notas |
| **Estado** | Documentado |

**Resultado obtenido.** Antes de la refundición, la *Nota 14 · Patrimonio neto* informa
$ 30.000.000 (sólo las cuentas de patrimonio) y se marca *"✓ Reconciliada"*, mientras el ESP expone un
patrimonio neto de $ 42.863.500 (que incorpora el resultado del ejercicio del ER).

**Recomendación.** Que la nota incorpore el resultado del ejercicio mientras las cuentas de resultado
sigan abiertas, o que su título aclare que expone la composición del capital.

---

## DEF-A19 · Notas de desarrollo visibles para el usuario final

| | |
|---|---|
| **Severidad** | Bajo |
| **Módulo** | Importador del Libro Diario |
| **Estado** | Corregido — `5aed5e7` |

**Resultado obtenido.** El asistente mostraba dos textos internos: *"Tip: en producción acá va drag &
drop real + parseo CSV/XLSX"* y *"Nota: esta confirmación es «UX first». Después conectamos el import
real (createEntry/updateEntry) y listo"*. El segundo afirma que la importación no es real, cuando sí lo
es: quien lo lea puede confirmar creyendo que no pasa nada.

**Solución aplicada.** Reemplazados por indicaciones útiles sobre el formato y sobre el efecto real de
confirmar.

---

## DEF-A20 · El selector de ejercicios mezcla ejercicios reales con años inexistentes

| | |
|---|---|
| **Severidad** | Bajo |
| **Módulo** | Selector de período |
| **Estado** | Corregido en la Fase 2I — `b27bf55` |

**Resultado obtenido.** El desplegable lista *2026* y *2025 Abierto*. Sólo 2025 existe como ejercicio;
2026 aparece porque el hook agrega siempre el año corriente. Los dos se ven igual salvo por la etiqueta
de estado.

**Observación relacionada.** No hay ninguna acción para **crear un ejercicio de un año anterior**: el
botón *"Nuevo Ejercicio"* del Dashboard sólo ofrece `año + 1`, y los ejercicios se aprovisionan
automáticamente al contabilizar el primer asiento. Para auditar 2025 desde 2026 hubo que usar la
aplicación del rango, que es justamente donde estaba DEF-A03.

---

## DEF-A21 · Un error de tipeo en la fecha crea un ejercicio nuevo en silencio

| | |
|---|---|
| **Severidad** | Alto |
| **Módulo** | Contexto contable (`ensureExerciseForDate`) |
| **Estado** | Corregido en la Fase 2I — `b27bf55` |

**Pasos para reproducir**

1. Con el ejercicio 2025 activo y cargado, contabilizar un asiento balanceado con fecha 15/12/**2024**.

**Resultado esperado.** Rechazo: la fecha está fuera del ejercicio en curso.

**Resultado obtenido.** El asiento se contabiliza. La aplicación **crea un ejercicio 2024 abierto**
con su período anual y lo audita como `EXERCISE_CREATED`. El asiento queda en ese ejercicio nuevo, no
en los libros que el usuario está mirando.

**Causa.** `validateForPosting` sí controla que la fecha caiga dentro del ejercicio, pero el ejercicio
se **resuelve a partir de la propia fecha** mediante `ensureExerciseForDate`, que lo aprovisiona si no
existe. El control nunca puede fallar y queda inoperante en el camino normal.

Es una decisión de diseño declarada en el código (*"modo laboratorio educativo local"*), no un
descuido. La auditoría la registra igual porque el efecto sobre quien lleva una contabilidad real es
el de una pérdida silenciosa: el asiento existe, pero no aparece en el ejercicio activo.

**Impacto contable.** Un dígito mal tipeado en el año desplaza el asiento a un ejercicio invisible. El
balance del ejercicio activo cuadra igual, así que no hay ninguna señal de que falte algo.

**Recomendación.** Mantener el aprovisionamiento automático pero **pedir confirmación explícita**
cuando la fecha cae fuera del ejercicio activo: *"La fecha 15/12/2024 no pertenece al Ejercicio 2025.
¿Crear el Ejercicio 2024 y contabilizar ahí?"*. Y ofrecer el alta manual de ejercicios (ver DEF-A20)
para que crear uno sea siempre un acto deliberado.

---

## DEF-A22 · Los importes con más de dos decimales se redondean sin avisar

| | |
|---|---|
| **Severidad** | Bajo |
| **Módulo** | Contabilización (`normalizeLines`) |
| **Estado** | Corregido en la Fase 2I — `b27bf55` |

**Pasos para reproducir**

1. Contabilizar un asiento balanceado con importes de $100,005.

**Resultado obtenido.** El asiento se contabiliza con **$100,01** en ambas líneas.

**Observación.** El comportamiento es determinista y deja los libros en escala de centavos exacta, que
es lo correcto. Lo que llama la atención es que la validación tiene un mensaje preparado para este
caso —*"el importe tiene más decimales que la escala contable (2); redondealo antes de contabilizar"*—
que nunca llega a mostrarse, porque la normalización redondea antes de validar. El principio declarado
del motor es que nada se omite en silencio; acá el importe cambia sin decirlo.

**Recomendación.** Redondear igual, pero informarlo en la confirmación del asiento.
