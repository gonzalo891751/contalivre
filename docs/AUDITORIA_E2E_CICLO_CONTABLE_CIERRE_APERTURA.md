# Auditoría E2E del ciclo contable, cierre y apertura

**ContaLivre v0.5.0-rc.1** · 27 de julio de 2026

---

> ## Fe de erratas
>
> Este informe se conserva tal como se emitió. La **Fase 2I** corrigió doce de
> los defectos que acá figuran como documentados y detectó cinco imprecisiones
> en el propio informe, que se enmiendan sin reescribir lo sucedido:
>
> 1. **Commits (§4).** La tabla lista 8 y termina en `5aed5e7`. Los commits de
>    la rama son **9**: falta `e4489a4`, que es el que agrega este informe y no
>    podía listarse a sí mismo. El HEAD `e4489a4` del resumen es correcto.
> 2. **Cantidad de defectos.** El número correcto es **22**; algunos anexos
>    decían 20 porque DEF-A21 y DEF-A22 se incorporaron después.
> 3. **Nombre del producto.** Es **ContaLivre**. «ContaLibre» se deslizó en
>    algunos pasajes; no son dos productos.
> 4. **«Coinciden al centavo» (§10.1).** Vale **en moneda nominal**. En moneda
>    de cierre no valía: el anexo de bienes de uso reexpresado tenía los errores
>    DEF-A09 y DEF-A10, cuantificados en §10.3 de este mismo informe.
> 5. **36 controles frente a 24 invariantes.** No se contradicen: las
>    invariantes se verifican dentro de la aplicación; los controles del cuadro
>    de conciliación las reverifican sobre los respaldos con aritmética
>    independiente. Hoy son 45.
>
> Estado actualizado de los defectos y resultados en moneda de cierre:
> [`docs/IMPLEMENTACION_FASE_2I_AXI_MEDICION_CIERRE_EXPORTABLES.md`](IMPLEMENTACION_FASE_2I_AXI_MEDICION_CIERRE_EXPORTABLES.md).

---

## 1. Resumen ejecutivo

Se auditó ContaLivre recorriendo el ciclo contable completo de una empresa
comercial argentina —desde su constitución hasta el cierre del ejercicio y la
apertura del siguiente— con un caso de 95 asientos y 300 líneas diseñado y
autocontrolado antes de cargarlo.

**El motor contable es sólido.** Las cifras que produce coinciden **al centavo**
con el caso diseñado: balance de sumas y saldos, Estado de Situación
Patrimonial, Estado de Resultados, Estado de Evolución del Patrimonio Neto y
Estado de Flujo de Efectivo. La compuerta de publicación corre 19 controles
propios, explica cada bloqueo y no admite una línea balanceante: cuando algo no
concilia lo dice y se niega a publicar. El cierre, la refundición y la apertura
del ejercicio siguiente son correctos y están protegidos contra la duplicación.

**Lo que fallaba era el acceso a ese motor.** Dos capacidades centrales del
ciclo estaban implementadas y probadas en el dominio pero **no tenían ninguna
puerta de entrada en la aplicación**:

- No existía forma de registrar una serie de índices en el registro que consume
  el motor, de modo que la **moneda de cierre nunca podía habilitarse**: sin
  reexpresión, sin RECPAM, sin EFE en moneda homogénea (DEF-A01).
- No existía forma de **cerrar un ejercicio**: sólo estaba cableada la
  reapertura, así que se podía reabrir lo que nunca se había podido cerrar
  (DEF-A04).

A eso se sumó el defecto más peligroso encontrado: **reimportar el mismo archivo
duplicaba el ejercicio entero sin ningún aviso** —95 asientos pasaron a 190, con
el resumen informando "Advertencias: Ninguna"— y todos los estados exponían el
doble (DEF-A08).

Se corrigieron **siete** defectos, cada uno con pruebas y commit propio, y se
documentaron **quince** más, entre ellos dos errores de reexpresión en el anexo
de bienes de uso que sobrevalúan el rubro un 13 %, una clasificación incorrecta
en el EFE que desplaza la ganancia por venta de bienes de uso a actividades
operativas, y un aprovisionamiento silencioso de ejercicios que hace que un
error de tipeo en el año esconda el asiento en libros que el usuario no ve.

**Veredicto: APTO CON OBSERVACIONES.** Con las correcciones aplicadas, la
aplicación recorre el ciclo completo y produce estados contables que concilian.
No es apta todavía para emitir estados **en moneda de cierre** sin revisión
manual del anexo de bienes de uso ni para presentar el EFE sin revisar la
clasificación de las disposiciones de activos. El detalle está en §14.

---

## 2. Alcance

Se auditó:

- el ciclo completo de las 14 etapas del recorrido descripto en el encargo;
- la corrección contable de las cifras contra un caso cerrado de antemano;
- las 24 invariantes contables exigidas;
- la experiencia de uso de quien conoce contabilidad pero no la aplicación;
- la secuencia normativa propuesta por el sistema frente a la que exige la RT 54.

**Fuera de alcance:** los módulos operativos específicos (Bienes de Uso,
Inventario, Préstamos, Impuestos, Sueldos, Moneda Extranjera, Conciliaciones) se
recorrieron pero no se auditaron en profundidad; el ejercicio se cargó por el
importador del Libro Diario, que es un camino real de la aplicación. La
conciliación entre el módulo de Bienes de Uso y el Diario informa
—correctamente— una diferencia, porque los bienes se cargaron por el Diario.

---

## 3. Entorno

| | |
|---|---|
| Aplicación | ContaLivre v0.5.0-rc.1, esquema Dexie 22 |
| Node | 22.23.1 (`C:\Tools\node-v22.23.1-win-x64`), npm 10.9.8 |
| Sistema | Windows 11, servidor de desarrollo de Vite |
| Navegadores | Chromium 1920×1080 (Playwright) e inspección interactiva |
| Fecha de la auditoría | 27/07/2026 |
| Marco contable | RT 54 (texto ordenado por RT 59) y RT 6 para la reexpresión |

**Estado inicial del repositorio.** Rama `refactor/fase-2h-integrada-cierre-final`
en `20eecc5`, árbol limpio, 634 pruebas unitarias en verde. No se hizo merge ni
deploy, no se tocó `main` y no se borró información existente.

---

## 4. Rama y commits

Rama: **`audit/ciclo-contable-e2e-cierre-apertura`**, creada desde `20eecc5`.

| Commit | Tipo | Descripción |
|---|---|---|
| `3efb8fd` | test | Caso E2E autocontrolado de Purmamarca 2025 |
| `cf859e3` | fix | El año del ejercicio se deriva del rango aplicado (DEF-A03) |
| `0330666` | feat | Registro de la serie de índices desde la interfaz (DEF-A01) |
| `31cf19b` | fix | Devoluciones vs. consumos en el puente del CMV (DEF-A02) |
| `5d06a76` | feat | Entrada por la interfaz al cierre del ejercicio (DEF-A04) |
| `a12e2ce` | fix | Los borradores de la refundición no bloquean el cierre (DEF-A05) |
| `ea18371` | test | Recorrido E2E completo con checkpoints y evidencia |
| `5aed5e7` | fix | Aviso y omisión de asientos ya importados (DEF-A08, DEF-A19) |

Cada corrección es pequeña, aislada, acompañada de pruebas y trazable a un
defecto del registro.

---

## 5. Empresa creada y ejercicio

**Purmamarca Comercial S.A. — Auditoría E2E** · CUIT 30-71234567-4 ·
Compraventa mayorista de mercaderías · Av. Belgrano 1234, San Salvador de Jujuy.

**Ejercicio 2025**, del 01/01/2025 al 31/12/2025. Se eligió 2025 porque es el
último ejercicio anual completo con toda la serie oficial de índices publicada.

La empresa nace con el ejercicio: el aporte inicial de capital **es** el saldo de
apertura, de modo que el recorrido cubre efectivamente "desde el nacimiento".

Circuitos cubiertos: aporte de capital en banco, fondo fijo, compras al contado y
en cuenta corriente, flete activado al costo, devolución al proveedor, ventas al
contado y a crédito con su costo por PEPS, devolución de un cliente con reingreso
al costo, bonificación cedida, cobros y pagos totales y parciales, alquileres,
servicios, publicidad, seguro pagado por adelantado con su devengamiento, sueldos
y cargas sociales de doce meses con once pagos, comisiones bancarias, compra de
tres bienes de uso (uno de ellos en cuenta corriente), venta de un bien de uso con
resultado, depreciaciones, préstamo bancario con amortización parcial e intereses
devengados, dos plazos fijos con intereses, liquidación trimestral de IVA con
saldo técnico a favor arrastrado, e impuesto a las ganancias.

**Limitaciones declaradas del caso.** La liquidación de IVA se hizo trimestral y
no mensual, y no se aplicó IVA a los intereses financieros. Ambas son
simplificaciones del caso, no carencias de la aplicación. La empresa no tiene
ejercicio anterior, así que la información comparativa se probó vacía.

---

## 6. Normativa aplicada

RT 54 (texto ordenado por RT 59) como marco general, y RT 6 para la reexpresión.
Referencias puntuales usadas en el análisis:

- **Reconocimiento y medición**: costo de incorporación de bienes de cambio
  incluyendo los costos de adquisición (el flete se activó); depreciación de
  bienes de uso; devengamiento de intereses y de gastos.
- **EFE**: RT 54 t.o. RT 59 párr. 656 — el cobro por la disposición de un bien de
  uso pertenece íntegro a las actividades de inversión. Es la base de DEF-A06.
- **Reexpresión**: anticuación de cada partida a su período de origen y
  aplicación del coeficiente `índice de cierre / índice de origen`; la
  depreciación se calcula sobre el valor de origen **reexpresado**. Es la base de
  DEF-A09 y DEF-A10.
- **Clasificación monetaria**: un gasto pagado por adelantado que se cancela con
  un servicio es una partida **no monetaria**. Es la base de DEF-A13.

**Sobre la secuencia que propone el sistema.** ContaLivre no propone una
secuencia explícita: el ciclo está repartido entre pantallas sin orden visible, y
dos de sus etapas no tenían acceso. La secuencia correcta y las razones
normativas de cada paso están en `docs/auditoria/FLUJO_IDEAL.md`. El punto más
delicado es que la reexpresión debe ir **después** de las mediciones a valores
corrientes y **antes** de la refundición: refundir primero obligaría a reexpresar
un resultado ya volcado al patrimonio.

---

## 7. Fuentes de índices

| | |
|---|---|
| **Serie** | Índice de Precios al Consumidor Nacional. Nivel General. Base diciembre 2016 = 100. Valores mensuales |
| **Organismo** | Instituto Nacional de Estadística y Censos (INDEC) |
| **Vía de consulta** | Portal de datos abiertos del Estado argentino, serie `145.3_INGNACNAL_DICI_M_15` |
| **URL** | `https://apis.datos.gob.ar/series/api/series/?ids=145.3_INGNACNAL_DICI_M_15` |
| **Período utilizado** | diciembre 2024 – diciembre 2025 (13 valores) |
| **Fecha de consulta** | 27/07/2026 |
| **Vinculación con cada mes** | Cada valor corresponde al mes calendario; el coeficiente de reexpresión de una partida es `índice(2025-12) / índice(mes de origen)` |

| Período | Índice | | Período | Índice |
|---|---:|---|---|---:|
| 2024-12 | 7.694,0075 | | 2025-07 | 9.023,9730 |
| 2025-01 | 7.864,1257 | | 2025-08 | 9.193,2441 |
| 2025-02 | 8.052,9927 | | 2025-09 | 9.384,0922 |
| 2025-03 | 8.353,3158 | | 2025-10 | 9.603,8623 |
| 2025-04 | 8.585,6078 | | 2025-11 | 9.841,3581 |
| 2025-05 | 8.714,4871 | | 2025-12 | 10.121,3715 |
| 2025-06 | 8.855,5681 | | | |

**Verificación cruzada.** Los valores se contrastaron contra la serie de
variación intermensual del mismo organismo (`145.3_INGNACUAL_DICI_M_38`): los
trece cocientes reproducen las variaciones publicadas. La variación diciembre a
diciembre resulta 31,55 %, consistente con el 31,5 % informado por el INDEC para
2025. Ningún valor fue interpolado ni completado.

**Sobre FACPCE.** El índice de la Res. JG 539/18 que la FACPCE publica para
aplicar la RT 6 y la RT 54 se actualiza, según la propia Federación, *"de acuerdo
con la serie del Índice de precios al consumidor con cobertura nacional (IPC
Nacional) publicado por el INDEC"*. La FACPCE lo distribuye en un archivo Excel,
no en la página; se utilizó la serie del INDEC, que es su fuente, con la
proveniencia registrada dentro de la aplicación.

**Nota de auditoría.** Los índices que ContaLivre trae precargados en la planilla
de AxI son **ficticios** (implican una inflación anual del 170 % para 2025 contra
el 31,5 % real). La propia pantalla lo advierte. Fueron reemplazados por la serie
oficial.

---

## 8. Metodología

1. **Diseño del caso antes de cargarlo.** `scripts/auditoria/caso-purmamarca-2025.mjs`
   construye las 95 operaciones y **aborta** si alguna invariante no se cumple:
   partida doble por asiento y total, ecuación patrimonial, IVA saldado y
   variación del efectivo explicada por el EFE directo. Sólo entonces emite la
   matriz maestra, los valores esperados y los CSV.
2. **Carga por la interfaz.** Ficha de la empresa, registro de la serie de
   índices e importación del ejercicio por el asistente del Libro Diario.
3. **Verificación pantalla por pantalla** contra los valores esperados.
4. **Corrección de los defectos bloqueantes**, cada uno con su prueba.
5. **Checkpoints y evidencia** producidos por el recorrido E2E.
6. **Conciliación numérica** de los dos checkpoints con
   `scripts/auditoria/conciliar-checkpoints.mjs`.

**Uso de herramientas fuera de la interfaz.** Se usaron la consola del navegador
y la base de datos para *inspeccionar* y para *diagnosticar*, nunca para saltear
una pantalla defectuosa. Las dos veces que hizo falta una capacidad inexistente
—registrar índices y cerrar el ejercicio— no se resolvió por consola: se
documentó como defecto y se construyó la pantalla que faltaba.

**Limitación de la instrumentación.** La carga del archivo en los asistentes de
importación se hizo asignando el archivo al campo correspondiente por
instrumentación, porque el entorno de auditoría no puede operar el diálogo de
archivos del sistema operativo. El código ejecutado es el mismo que el de un
usuario que arrastra el archivo.

---

## 9. Operaciones realizadas

95 asientos, 300 líneas, distribuidos en los doce meses del ejercicio.
El detalle completo —identificador, fecha, descripción económica, comprobante,
cuentas, importes y clasificación prevista en el EFE— está en
**`docs/auditoria/MATRIZ_OPERACIONES.md`**, junto con los saldos esperados de
cada cuenta al 31/12/2025.

| Bloque | Asientos |
|---|---:|
| Constitución y fondo fijo | 2 |
| Bienes de uso (altas, depreciaciones y venta) | 7 |
| Mercaderías: compras, devolución, ventas y costo | 24 |
| Gastos: alquileres, servicios, publicidad, seguro, comisiones, caja chica | 25 |
| Sueldos y cargas sociales | 23 |
| Financiación e inversiones financieras | 7 |
| IVA e impuesto a las ganancias | 7 |

---

## 10. Resultados

### 10.1 Cifras obtenidas

Todas coinciden **exactamente** con el caso diseñado.

| Concepto | Esperado | Obtenido |
|---|---:|---:|
| Total Debe = Total Haber del Diario | 460.158.600,00 | 460.158.600,00 |
| Activo | 69.327.300,00 | 69.327.300,00 |
| Activo corriente | 61.927.300,00 | 61.927.300,00 |
| Activo no corriente | 7.400.000,00 | 7.400.000,00 |
| Pasivo corriente | 17.463.800,00 | 17.463.800,00 |
| Pasivo no corriente | 9.000.000,00 | 9.000.000,00 |
| Patrimonio neto | 42.863.500,00 | 42.863.500,00 |
| Ingresos por ventas (netos) | 86.610.000,00 | 86.610.000,00 |
| Costo de ventas | 35.500.000,00 | 35.500.000,00 |
| Resultado antes del impuesto | 19.790.000,00 | 19.790.000,00 |
| Impuesto a las ganancias | 6.926.500,00 | 6.926.500,00 |
| Resultado del ejercicio | 12.863.500,00 | 12.863.500,00 |
| Efectivo al cierre | 29.168.200,00 | 29.168.200,00 |

### 10.2 Estado de Flujo de Efectivo

La aplicación explica exactamente la variación del efectivo (0 → 29.168.200) e
iguala el método directo con el indirecto. **Clasifica distinto** de lo previsto:

| Actividad | Previsto por el auditor | Informado por la aplicación |
|---|---:|---:|
| Operativas | 6.950.200,00 | 2.418.200,00 |
| Inversión | −14.382.000,00 | −9.850.000,00 |
| Financiación | 36.600.000,00 | 36.600.000,00 |
| **Variación neta** | **29.168.200,00** | **29.168.200,00** |

Las diferencias son de criterio y de defecto, y se explican íntegramente:

- **IVA de los bienes de uso (4.532.000).** La aplicación lleva el componente de
  IVA de las compras y ventas de bienes de uso a los flujos impositivos
  operativos y sólo el neto a inversión. Es un criterio **defendible y
  consistente**, más riguroso que el del caso diseñado, que había clasificado el
  desembolso completo en inversión.
- **Ganancia por venta de bienes de uso (400.000).** Aparece en operativas cuando
  corresponde a inversión: **DEF-A06**.
- **Pago diferido de la compra de equipos (3.630.000).** Aparece en operativas
  cuando corresponde a inversión: **DEF-A07**.

En moneda de cierre el EFE agrega una línea explícita de **reexpresión (REI)** de
−4.159.803,02 que concilia los flujos reexpresados con el efectivo real, sin
duplicar el resultado por exposición del efectivo. Es un tratamiento correcto.

### 10.3 Moneda de cierre

Una vez registrada la serie oficial, la aplicación produce por primera vez
estados en moneda de cierre. El anexo de bienes de uso reexpresado **no es
correcto**: sobrevalúa el rubro un 13 % por los defectos DEF-A09 y DEF-A10.

| Concepto | Informado | Correcto | Diferencia |
|---|---:|---:|---:|
| Valor de origen reexpresado | 12.326.577,61 | 11.492.722,36 | +833.855,25 |
| Depreciación acumulada reexpresada | 1.600.000,00 | 2.029.064,42 | −429.064,42 |
| **Valor residual reexpresado** | **10.726.577,61** | **9.463.657,94** | **+1.262.919,67** |

---

## 11. Controles contables

Las 24 invariantes exigidas. El detalle numérico está en
**`docs/auditoria/CUADRO_CONCILIACION.md`** (36 controles, todos aprobados),
generado a partir de los dos respaldos.

| # | Invariante | Resultado |
|---:|---|---|
| 1 | Debe = Haber en cada asiento | ✅ Verificado en los 95 asientos. Un asiento descuadrado se rechaza con *«faltan $10.00 en el Haber»*; una cuenta agrupadora, con *«es agrupadora y no es imputable»* |
| 2 | Debe = Haber en el total del Diario | ✅ 460.158.600,00 |
| 3 | Diario = mayores | ✅ |
| 4 | Mayores = balance de sumas y saldos | ✅ |
| 5 | Activo = Pasivo + Patrimonio neto | ✅ |
| 6 | Resultado coincidente entre mayores, balance, ER, EEPN y ESP | ✅ 12.863.500,00 en los cinco |
| 7 | Costo de ventas = movimiento de bienes de cambio | ✅ tras corregir DEF-A02 |
| 8 | Depreciaciones coincidentes entre asiento, mayor, anexo, ER y ESP | ✅ 2.200.000,00 del ejercicio; residual 7.400.000,00 |
| 9 | Caja y bancos = movimientos registrados | ✅ 28.989.200,00 + 179.000,00 |
| 10 | El EFE explica la variación del efectivo | ✅ 0 → 29.168.200,00 |
| 11 | Método directo = método indirecto | ✅ control propio de la aplicación |
| 12 | Las operaciones sin efectivo no aparecen como cobros o pagos | ✅ se revelan aparte |
| 13 | Bienes de uso clasificados en inversión | ❌ **DEF-A06 y DEF-A07** |
| 14 | Préstamos y amortizaciones en financiación | ✅ +12.000.000 / −3.000.000 |
| 15 | Resultados financieros y por tenencia del efectivo sin duplicaciones | ✅ línea REI explícita |
| 16 | Coeficientes correctos en moneda de cierre | ⚠️ correctos por período; mal aplicados a bajas y depreciaciones (**DEF-A09**, **DEF-A10**) |
| 17 | Sin doble reexpresión | ✅ |
| 18 | El RECPAM no es una cifra balanceante | ✅ en el motor canónico. ⚠️ la planilla de AxI rotula como RECPAM la posición monetaria (**DEF-A13**) |
| 19 | Las cuentas de resultado quedan en cero tras la refundición | ✅ verificado cuenta por cuenta |
| 20 | Las cuentas patrimoniales no desaparecen tras el cierre | ✅ 42.863.500,00 |
| 21 | El ejercicio siguiente no arrastra cuentas nominales | ✅ sólo ASSET, LIABILITY y EQUITY |
| 22 | Saldo inicial del ejercicio siguiente = saldo final del cerrado | ✅ 70.927.300,00 de cada lado |
| 23 | Información comparativa | ⚠️ no evaluable: es el primer ejercicio de la empresa |
| 24 | Cada cifra rastreable hasta sus asientos | ✅ notas con linaje y anexos con las cuentas de origen |

**Ninguna diferencia quedó sin explicar.** Las tres marcadas con ❌ o ⚠️ tienen su
causa identificada, su importe cuantificado y su ficha en el registro de
defectos. No se corrigió ninguna diferencia con un asiento genérico de ajuste.

---

## 12. Problemas detectados y correcciones

El registro completo está en **`docs/auditoria/REGISTRO_DEFECTOS.md`**.

| ID | Título | Severidad | Estado |
|---|---|---|---|
| DEF-A01 | No existe forma de registrar índices para la moneda de cierre | Crítico | Corregido |
| DEF-A04 | El cierre del ejercicio no era alcanzable desde la aplicación | Crítico | Corregido |
| DEF-A08 | Reimportar el mismo archivo duplicaba el ejercicio completo | Crítico | Corregido |
| DEF-A02 | El puente del CMV confunde devoluciones con consumos | Alto | Corregido |
| DEF-A03 | Aplicar un rango deja el encabezado y los reportes en años distintos | Alto | Corregido |
| DEF-A05 | Generar la refundición bloqueaba el propio cierre | Alto | Corregido |
| DEF-A19 | Notas de desarrollo visibles para el usuario final | Bajo | Corregido |
| DEF-A06 | La ganancia por venta de bienes de uso se clasifica como operativa | Alto | Documentado |
| DEF-A09 | El anexo en moneda de cierre reexpresa mal las bajas | Alto | Documentado |
| DEF-A10 | La amortización no se reexpresa sobre el valor reexpresado | Alto | Documentado |
| DEF-A11 | La ficha de la empresa no llega al encabezado de los estados | Alto | Documentado |
| DEF-A13 | Clasificación monetaria automática incorrecta en la planilla de AxI | Alto | Documentado |
| DEF-A21 | Un error de tipeo en la fecha crea un ejercicio nuevo en silencio | Alto | Documentado |
| DEF-A07 | El pago diferido de un bien de uso no llega a inversión | Medio | Documentado |
| DEF-A12 | La planilla de AxI no se ata al ejercicio activo | Medio | Documentado |
| DEF-A14 | El plan de cuentas base no trae clases para el anexo de bienes de uso | Medio | Documentado |
| DEF-A16 | El importador de índices de la planilla redondea a dos decimales | Medio | Documentado |
| DEF-A18 | La nota de patrimonio neto no coincide con el ESP antes del cierre | Medio | Documentado |
| DEF-A15 | El automapeo del importador asigna el código a la columna de nombre | Bajo | Documentado |
| DEF-A17 | El balance vacío informa que "cuadra perfectamente" | Bajo | Documentado |
| DEF-A20 | El selector mezcla ejercicios reales con años inexistentes | Bajo | Documentado |
| DEF-A22 | Los importes con más de dos decimales se redondean sin avisar | Bajo | Documentado |

**Resumen de 22 defectos: 3 críticos, 9 altos, 5 medios, 5 bajos.
7 corregidos con prueba y commit, 15 documentados.**

Los defectos estructurales —los que exigen anticuación por partida en bienes de
uso o revisar la algebra que garantiza directo = indirecto en el EFE— se
documentaron con su importe y su recomendación, sin improvisar un rediseño
durante la auditoría.

---

## 13. Evaluación del cierre

**Lo que funciona.** El servicio de cierre es de buena calidad: vista previa con
bloqueos explicados, refundición **en borrador** revisable en el Libro Diario
antes de contabilizar, contabilización idempotente, registro de auditoría con los
asientos generados y el resultado, protección del ejercicio cerrado y reapertura
que exige motivo, revierte los asientos automáticos e invalida los estados
publicados.

Verificado en el recorrido: tras el cierre, el intento de contabilizar al
30/12/2025 se rechaza con *«El ejercicio "Ejercicio 2025" está cerrado y no
admite contabilizaciones»*; volver a abrir el panel ya no ofrece contabilizar y
la cantidad de asientos no cambia; el ejercicio sigue consultable.

**Lo que faltaba.** Todo eso era inalcanzable (DEF-A04) y, apenas se lo hizo
alcanzable, el flujo se trababa en su segundo paso (DEF-A05). Es un patrón que
se repite en esta auditoría: el dominio está mejor construido que su acceso.

**Contra la lista de requisitos del encargo**, el cierre ahora: muestra el
ejercicio y la fecha, verifica que no haya asientos descuadrados, detecta
borradores pendientes, exige la cuenta receptora del resultado, muestra la vista
previa con las cuentas que se cerrarán, evita cierres duplicados, es idempotente,
genera registro de auditoría, permite revertirlo, bloquea la modificación del
ejercicio cerrado, habilita la reapertura sólo con motivo explícito y prepara la
apertura del siguiente.

**Lo que todavía no verifica:** que los índices estén completos, que las
mediciones a valores corrientes se hayan hecho, que el inventario final esté
cargado ni que el EFE esté sin flujos pendientes de clasificación. Esos controles
**ya existen** en la compuerta de publicación de los estados; falta que gobiernen
también el cierre. Es la recomendación de la etapa 6 del flujo ideal.

---

## 14. Evaluación de la apertura del ejercicio siguiente

Correcta y verificada:

- se crea el ejercicio 2026 y el asiento de apertura se fecha el 01/01/2026;
- arrastra 70.927.300,00 de cada lado, sólo cuentas de activo, pasivo y
  patrimonio neto;
- no arrastra ninguna cuenta de resultado;
- el resultado del ejercicio anterior queda dentro del patrimonio neto;
- no se duplica: un segundo intento devuelve el asiento existente;
- el ejercicio anterior permanece consultable y sus cifras no cambian;
- el plan de cuentas y las políticas se heredan; la serie de índices sigue
  registrada y puede ampliarse sin tocar el ejercicio anterior.

**Lo que falta.** El usuario no percibe con claridad que pasó de un ejercicio al
otro: no hay un aviso, ni un cambio de estado visible en el encabezado, ni una
invitación a revisar las políticas del nuevo ejercicio. El cambio de contexto
ocurre en silencio.

---

## 15. Evaluación de experiencia de usuario

**Lo bueno.** El vocabulario contable es correcto y consistente. La distinción
entre borrador y contabilizado está bien resuelta y bien explicada en el propio
modal de carga. El modal de asiento muestra total Debe, total Haber y diferencia
en vivo, y no deja guardar hasta que cierre. Los mensajes de error del motor son
específicos y accionables ("faltan $X en el Haber", "la cuenta es agrupadora y no
es imputable", "la fecha está fuera del ejercicio"). La compuerta de publicación
es ejemplar: dice qué control falla, con qué diferencia, y se niega a publicar.
La honestidad del producto es notable: los indicadores se niegan a mostrar un
puntaje universal de "salud financiera" y explican por qué; los módulos en
revisión lo advierten.

**Lo que cuesta.**

- **No se entiende dónde empezar ni en qué etapa se está.** El Dashboard muestra
  "Primeros pasos 1/2 completado" desde el arranque, sin relación con el estado
  real. No hay ninguna representación del ciclo.
- **El período activo se contradice consigo mismo.** Hasta la corrección de
  DEF-A03, el encabezado y la ficha de la empresa mostraban años distintos en la
  misma pantalla.
- **No se distingue configurar de contabilizar.** El plan de cuentas, los mapeos
  y las políticas conviven en Configuración con el respaldo y la zona peligrosa.
- **Es fácil no saber si una cifra es histórica o de cierre.** La barra de
  metadatos lo dice bien en Estados contables, pero en el resto de las pantallas
  no hay ninguna marca de la unidad de medida.
- **La fecha por defecto de un asiento nuevo es la de hoy**, aunque caiga fuera
  del ejercicio activo: en esta auditoría proponía 27/07/2026 trabajando sobre
  2025.
- **Se repite información y se pierde contexto.** Hay dos lugares donde se define
  el ejercicio, dos almacenes de índices y dos identidades de empresa. Cada una
  de esas duplicaciones produjo un defecto.

**Trazabilidad.** Buena en el sentido estado → nota → cuentas, con el linaje
disponible en las notas y las cuentas de origen en cada anexo. Falta el salto
directo de una cifra del estado al asiento que la originó.

---

## 16. Riesgos residuales

1. **Estados en moneda de cierre con el rubro de bienes de uso sobrevaluado**
   (DEF-A09 y DEF-A10). En este ejercicio, 13 % del rubro. Es el riesgo más alto
   que queda abierto, porque la pantalla no da ninguna señal de que la cifra sea
   dudosa.
2. **EFE con actividades mal clasificadas** (DEF-A06 y DEF-A07). La variación neta
   es correcta, pero la apertura por actividad es observable.
3. **Identidad de la empresa en los estados y en los snapshots publicados**
   (DEF-A11): los metadatos identifican una empresa que no existe.
4. **La planilla de AxI sigue disponible** con clasificación monetaria incorrecta
   y una fecha de cierre que no es la del ejercicio. Su aviso propio atenúa el
   riesgo, pero no lo elimina.
5. **Asientos que desaparecen del ejercicio activo** por un error de tipeo en el
   año (DEF-A21). El balance del ejercicio en curso sigue cuadrando, así que no
   hay ninguna señal de que falte una operación.
5. **Un solo escenario por instalación.** La aplicación no permite tener dos
   empresas o dos escenarios en paralelo; la única forma de conservar dos estados
   es exportar respaldos. Esto se convirtió en una limitación operativa de esta
   misma auditoría (§17).

---

## 17. Checkpoints conservados

**Checkpoint A — pre-cierre.**
`docs/auditoria/checkpoints/checkpoint-a-pre-cierre.json`

El ejercicio 2025 completo: empresa configurada, serie oficial de índices
registrada, 95 asientos contabilizados, ejercicio **abierto**, sin refundición,
con las cuentas de resultado todavía abiertas y los estados conciliando.

**Checkpoint B — cierre y apertura.**
`docs/auditoria/checkpoints/checkpoint-b-cierre-y-apertura.json`

El mismo ejercicio con la refundición contabilizada (3 asientos), el ejercicio
2025 cerrado y el asiento de apertura del ejercicio 2026 generado.

**Cómo abrirlos.** *Configuración → Respaldo → Restaurar*, eligiendo el archivo.
La restauración es transaccional: valida el archivo completo antes de tocar la
base y genera un respaldo automático previo.

**Limitación documentada.** ContaLivre guarda un único escenario por instalación:
no permite duplicar una empresa ni un ejercicio, ni tener dos escenarios
simultáneos. Por eso los dos checkpoints se conservan como archivos de respaldo y
no como dos empresas dentro de la aplicación. Se priorizó la conservación del
Checkpoint A: el cierre se ejecutó sobre una copia del escenario en un contexto
de navegador separado, sin tocar el estado del Checkpoint A.

---

## 18. Pruebas automatizadas

| Suite | Antes | Después |
|---|---:|---:|
| Pruebas unitarias e integración | 634 | **666** |
| Archivos de prueba | 93 | **97** |
| E2E Chromium | 23 | **33** |

Pruebas nuevas, todas ligadas a un defecto de esta auditoría:

- `tests/accounting/indices-registro-canonico.test.ts` — lectura de la serie sin
  redondeo, huecos detectados sin interpolar, registro con proveniencia y
  detección de alteración por hash (DEF-A01).
- `tests/reporting/costOfSales-devoluciones.test.ts` — devolución al proveedor,
  reingreso al costo y la garantía de que un siniestro **sigue** exponiéndose
  (DEF-A02).
- `tests/ui/periodo-rango-anio.test.ts` — el año se deriva del rango (DEF-A03).
- `tests/acceptance/ciclo-accesible-desde-ui.test.ts` — guarda de regresión: falla
  si el registro de índices o el cierre vuelven a quedar sin interfaz (DEF-A01,
  DEF-A04).
- `tests/accounting/cierre-apertura.test.ts` — dos casos nuevos sobre los
  borradores de la refundición (DEF-A05).
- `tests/accounting/import-duplicados.test.ts` — huella del hecho contable y
  detección de reimportaciones (DEF-A08).
- `e2e/auditoria-ciclo-completo.spec.ts` — el ciclo completo en 10 pasos, que
  además produce los checkpoints y la evidencia.
- `scripts/auditoria/conciliar-checkpoints.mjs` — 36 controles numéricos sobre
  los respaldos.

Todo en verde: 666 pruebas unitarias, 33 E2E en Chromium (incluidas las 23
preexistentes, sin regresiones), `tsc --noEmit` limpio y `eslint` sin errores
(53 advertencias preexistentes, ninguna nueva).

---

## 19. Prioridades sugeridas

1. **Corregir la reexpresión de bienes de uso** (DEF-A09, DEF-A10). Es lo que
   separa "la moneda de cierre está disponible" de "la moneda de cierre es
   correcta". Requiere construir el anexo desde la ficha de cada bien.
2. **Unificar la identidad de la empresa** (DEF-A11). Cambio pequeño, impacto
   alto: hoy los estados salen con un nombre que no es el de la empresa.
3. **Resolver la clasificación de disposiciones en el EFE** (DEF-A06, DEF-A07).
4. **Llevar los controles de la compuerta de publicación al pre-cierre**, para
   que el cierre exija índices completos, inventario y mediciones.
5. **Un tablero del ciclo** que muestre en qué etapa está el ejercicio y qué
   falta. Los datos ya se calculan; falta presentarlos.
6. **Terminar o retirar la planilla de AxI** (DEF-A12, DEF-A13, DEF-A16).
7. **Precargar las clases de bienes de uso** en el plan de cuentas (DEF-A14).
8. Los defectos bajos: automapeo, balance vacío, selector de ejercicios.

---

## 20. Recomendación final

### APTO CON OBSERVACIONES

**Motivos.** Con las siete correcciones aplicadas, ContaLivre recorre el ciclo
contable completo desde la constitución hasta la apertura del ejercicio
siguiente, y produce estados contables que concilian al centavo con un caso
diseñado de forma independiente. El cierre es seguro, idempotente, auditado y
reversible; la apertura es correcta y no arrastra cuentas nominales. La compuerta
de publicación es un control genuino y no una formalidad.

**Defectos bloqueantes que quedan.** Ninguno para operar en moneda nominal.
Para emitir estados **en moneda de cierre**, el anexo de bienes de uso reexpresado
requiere revisión manual (DEF-A09, DEF-A10). Para presentar el EFE, la apertura
por actividad requiere revisión (DEF-A06, DEF-A07).

**Sin las correcciones de esta auditoría, el veredicto habría sido NO APTO PARA
CIERRE REAL**: no se podía cerrar el ejercicio, no se podía habilitar la moneda
de cierre, y una reimportación accidental duplicaba el ejercicio entero sin
aviso.

**Qué funciona.** El núcleo contable, el motor de reporting, los controles de
integridad, el cierre y la apertura, la trazabilidad hasta las cuentas de origen,
el respaldo y la restauración, y la honestidad del producto al declarar sus
propias limitaciones.

**Qué no funciona.** La reexpresión de bienes de uso, la clasificación de las
disposiciones de activos en el EFE, la identidad de la empresa en los reportes y
la planilla de ajuste por inflación.

**Qué debe mejorarse.** La aplicación todavía se siente como una colección de
módulos: el ciclo no está representado en ninguna parte, el usuario no sabe en
qué etapa está, y varias entidades están duplicadas. La propuesta de arquitectura
funcional está en `docs/auditoria/FLUJO_IDEAL.md`.

---

## Anexos

| Documento | Contenido |
|---|---|
| `docs/auditoria/MATRIZ_OPERACIONES.md` | Las 95 operaciones con su asiento, importe y clasificación en el EFE, más los saldos esperados |
| `docs/auditoria/CUADRO_CONCILIACION.md` | 36 controles numéricos sobre los dos checkpoints |
| `docs/auditoria/REGISTRO_DEFECTOS.md` | Los 20 defectos con reproducción, causa, impacto y solución |
| `docs/auditoria/FLUJO_IDEAL.md` | Arquitectura funcional propuesta del ciclo |
| `docs/auditoria/evidencia/` | 16 capturas del recorrido completo |
| `docs/auditoria/checkpoints/` | Los dos respaldos restaurables |
| `docs/auditoria/datos/` | CSV de asientos e índices y valores esperados |
| `scripts/auditoria/` | Generador del caso y script de conciliación |
| `e2e/auditoria-ciclo-completo.spec.ts` | El recorrido reproducible |
