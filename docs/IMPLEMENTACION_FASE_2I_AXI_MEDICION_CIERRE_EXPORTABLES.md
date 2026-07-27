# Fase 2I — Saneamiento del pre-cierre, AxI y medición al cierre

**ContaLivre v0.5.0-rc.1** · 27 de julio de 2026

---

## 1. Resumen

Esta fase transforma el pre-cierre de ContaLivre en un circuito verificable. Su
resultado más importante no es una cifra nueva sino una capacidad: la aplicación
puede ahora **demostrar que analizó el 100 % de las cuentas** de un ejercicio, y
determinar el RECPAM **dos veces por caminos independientes** y exigir que
coincidan.

Ese control dual encontró un error de criterio en su primera ejecución: el
aporte de capital debe medirse **reexpresado** para determinar el resultado por
diferencia patrimonial, aunque el Estado de Situación Patrimonial conserve su
valor nominal legal. Sin esa distinción las dos determinaciones diferían en
$ 8.610.922,11. Corregido, coinciden con **dos centavos** de redondeo.

Se corrigieron además los dos errores de reexpresión de bienes de uso que la
auditoría anterior había cuantificado, cerrando la sobrevaluación del 13 % del
rubro, y se revisó la clasificación de disposiciones en el EFE con la conclusión
—verificada en el código, no supuesta— de que **DEF-A06 no era un falso
positivo**.

**Veredicto: APTO CON OBSERVACIONES.** El motivo, en §14.

---

## 2. Base y HEAD

| | |
|---|---|
| Rama base | `audit/ciclo-contable-e2e-cierre-apertura` |
| HEAD de la base | `e4489a4` (árbol limpio) |
| Rama de esta fase | `fix/fase-2i-axi-medicion-cierre-exportables` |
| HEAD al cierre | `5fb2891` |
| Node | 22.23.1 · npm 10.9.8 |

**Sobre la discrepancia señalada en el encargo.** El HEAD real de la rama base
es `e4489a4` y la tabla del informe anterior termina en `5aed5e7`: no hay
divergencia de historia. La tabla se escribió *dentro* del commit `e4489a4`, que
es el que agrega el informe, y un commit no puede listarse a sí mismo. Los
commits desde `20eecc5` son **nueve**, no ocho; la tabla omitía el suyo. Queda
corregido en la fe de erratas (§12).

Los dos checkpoints existentes se conservaron: se trabajó sobre copias
restauradas y los archivos se regeneraron con el mismo recorrido reproducible.

---

## 3. Commits

| Commit | Hito |
|---|---|
| `f9296c5` | EFE: el cobro de una disposición va íntegro a su actividad (DEF-A06) y linaje del pago diferido (DEF-A07) |
| `78cee1a` | Matriz universal de tratamiento de cuentas y RECPAM dual |
| `d2340d7` | Bienes de uso: reexpresión por lotes de origen y depreciación sobre esa base (DEF-A09, DEF-A10) |
| `b27bf55` | Defectos residuales (A11, A15, A16, A17, A20, A21, A22) |
| `5fb2891` | Pantalla de cobertura y RECPAM, E2E de la fase y cuadro de conciliación ampliado |

---

## 4. Decisiones contables

### 4.1 El capital se mide reexpresado y se expone nominal

**Problema.** El capital social conserva su valor nominal legal en el ESP. Si se
lo toma nominal también para determinar el resultado por diferencia patrimonial,
el resultado queda sobrestimado por el ajuste del capital.

**Alternativas.** (a) Medir el capital nominal en todas partes: rompe la
determinación secuencial. (b) Reexpresar el capital también en la exposición:
contradice el criterio legal y la práctica argentina. (c) Separar medición de
exposición.

**Elegida: (c).** La cuenta se anticua por la fecha de cada aporte para medir el
patrimonio en moneda de cierre, y expone su valor nominal; la diferencia es
exactamente el importe que corresponde a *Ajuste de capital*. La matriz lo
declara con dos campos distintos (`restatedAmount` y `presentationAmount`) para
que no puedan confundirse.

### 4.2 El cobro de una disposición va íntegro a su actividad

**Problema.** RT 54 (t.o. RT 59) párr. 656: el cobro por la disposición de un
bien de uso pertenece a actividades de inversión. El motor tenía la regla, pero
una salvaguarda la desactivaba cuando el asiento tocaba capital de trabajo, y
una venta gravada **siempre** trae la línea de IVA débito fiscal.

**Alternativas.** (a) Separar el IVA y llevarlo a los flujos impositivos
operativos: más fino, pero rompe la algebra que garantiza directo = indirecto y
obliga a rediseñar la conciliación. (b) Tratar el impuesto de la propia
disposición como parte de la operación de capital.

**Elegida: (b).** Es la convención que el motor ya aplicaba a las disposiciones
sin impuesto —el vencimiento de un plazo fijo entra completo, capital e
intereses— así que extenderla mantiene el criterio interno consistente, preserva
la igualdad entre métodos y coincide con lo pedido en el encargo. La alternativa
(a) queda documentada como mejora posterior.

### 4.3 El origen económico de una deuda manda sobre la cuenta que la registra

Una compra de bienes de uso a crédito no produce flujo el día de la compra: se
revela como transacción sin movimiento de efectivo. Su cancelación posterior es
un egreso **de inversión**, aunque la contrapartida sea una cuenta genérica de
acreedores. El motor recuerda qué parte de cada deuda nació de una operación de
capital y aplica esa clasificación al pago, hasta el importe originado; el
excedente sigue siendo operativo.

### 4.4 Los ajustes del método indirecto son extracontables

Se marcaron explícitamente (`worksheetOnly`) y la pantalla lo dice: **«No afecta
el Libro Diario»**. Ninguna línea del papel de trabajo del EFE genera un asiento.

### 4.5 Una fecha fuera del ejercicio se rechaza

El aprovisionamiento automático se conserva sólo cuando **no existe ningún
ejercicio** —el nacimiento de la empresa—. Con ejercicios ya abiertos, una fecha
fuera de todos ellos se rechaza nombrando los que existen. Abrir un ejercicio
pasa a ser un acto deliberado, desde Configuración → Ejercicios o declarándolo
en la contabilización.

---

## 5. Matriz universal de tratamiento de cuentas

`src/reporting/inflation/accountTreatment.ts` — función pura.

Para cada cuenta con saldo **o movimiento** produce: rubro, naturaleza, saldo,
condición monetaria, criterio de medición, tratamiento, períodos de origen con
su coeficiente, moneda previa al ajuste, importe histórico, reexpresado, ajuste,
importe de exposición, participación en el RECPAM, estado, observaciones y los
asientos que formaron el saldo.

Tratamientos posibles:

| Tratamiento | Cuándo | Qué se hace |
|---|---|---|
| `MONETARIA_SIN_REEXPRESION` | condición monetaria declarada o derivada | no se reexpresa; participa del RECPAM |
| `REEXPRESION_POR_ANTICUACION` | no monetaria al costo | cada movimiento por el coeficiente de su mes |
| `VALOR_CORRIENTE_AL_CIERRE` | medición a valor corriente | ya está en moneda de cierre; no se multiplica de nuevo |
| `CAPITAL_NOMINAL_LEGAL` | capital social | se anticua para medir, se expone nominal |
| `SIGUE_A_LA_PARTIDA_PRINCIPAL` | ajuste de capital | recibe el ajuste, no se anticua |
| `REQUIERE_DECISION` | rubro mixto sin declarar | **bloquea**; no se asume nada |

Puntos deliberados:

- **«No necesita reexpresión» es una conclusión registrada**, con su motivo, no
  una cuenta ausente de la lista.
- Los períodos con movimiento **neto cero** también se listan: son evidencia de
  que el período fue examinado. Sin esto, una amortización acumulada que se
  constituye y se da de baja en el mismo mes quedaba fuera del recuento.
- El rubro *Inversiones* es mixto: cada instrumento exige una declaración
  explícita. Un plazo fijo en pesos es monetario; un fondo común, no.
- Un **gasto pagado por adelantado** es no monetario aunque se exponga en Otros
  créditos: se cancela con un servicio, no con dinero.
- Nada se decide por el nombre de la cuenta.

**Cobertura sobre el caso de la auditoría: 43 cuentas, 100 % — por cantidad y
por saldo.**

---

## 6. Funcionamiento del AxI y de la serie de índices

La serie canónica se registra en Configuración → Inflación con nombre, estado
(oficial / manual / ejemplo), fuente, URL, cobertura, fecha de importación y
hash de integridad. **No se redondea**: el valor entra tal como lo publica la
fuente y ahora también se muestra con sus cuatro decimales. Los meses faltantes
se detectan y se informan; jamás se interpolan.

**Limitación declarada.** La unificación de las *dos* tablas de índices no está
completa: la planilla `Cierre: AxI + Valuación` conserva su papel de trabajo
propio. Lo que sí quedó resuelto es cuál manda: el registro canónico es el único
que alimenta al motor, y es el único que la aplicación ofrece para habilitar la
moneda de cierre. La planilla sigue rotulada como módulo en revisión normativa.
DEF-A12 y DEF-A13 continúan abiertos y están en §13.

---

## 7. RECPAM: cálculo y control

`src/reporting/inflation/recpam.ts`

**A · Secuencial** — por diferencia patrimonial reexpresada:

```
Resultado total = PN final reexpresado − aportes reexpresados − resultados acumulados anteriores
RECPAM          = Resultado total − Σ (cuentas de resultado reexpresadas)
```

**B · Analítico** — por exposición de la posición monetaria:

```
RECPAM = −[ P₀ × (coef₀ − 1) + Σ Fₘ × (coefₘ − 1) ]
```

con `P₀` la posición monetaria inicial anticuada al período de apertura y `Fₘ`
el flujo monetario neto del mes `m`. Los flujos se consideran ocurridos al
cierre de su mes, la convención habitual de la RT 6 cuando no se dispone del
detalle diario, aplicada igual en las dos determinaciones para que sean
comparables.

**Conciliación.** Tolerancia explícita: un centavo por cuenta monetaria, mínimo
$1. Por encima de eso se expone la diferencia, se nombran las cuentas y los
períodos, y **se bloquea**: nunca se absorbe con un asiento balanceante. También
bloquean los índices faltantes y las cuentas sin tratamiento.

**Resultado sobre el Checkpoint A:**

| | |
|---|---:|
| RECPAM analítico | −4.432.331,92 |
| RECPAM secuencial | −4.432.331,94 |
| Diferencia | −0,02 |
| Tolerancia | 1,00 |
| Posición monetaria neta al cierre | 18.763.500,00 |

Es una **pérdida**, coherente con mantener una posición monetaria activa durante
un ejercicio con 31,55 % de inflación. La verificación se hizo además con una
implementación independiente (`scripts/auditoria/verificar-recpam.mjs`), fuera
del motor, que llega al mismo número.

---

## 8. Valores corrientes

Se implementó el **reconocimiento** del criterio, no la captura de las
mediciones: una cuenta declarada a valor corriente del cierre queda marcada como
ya expresada en moneda de cierre y **no vuelve a multiplicarse por un
coeficiente**, que era el riesgo de doble ajuste que el encargo señalaba. El
plan base declara así los Fondos Comunes de Inversión.

**Lo que no se hizo**, y queda para una fase posterior: la pantalla de carga de
mediciones al cierre por rubro (fuente, fecha, evidencia, método, supuestos,
comparación con valor recuperable, resultado por tenencia y asiento generado), y
los controles de la compuerta que detecten rubros que requieren medición y no
fueron procesados. Es el punto §8 del encargo que esta fase deja abierto.

---

## 9. Bienes de uso

`src/reporting/engine/fixedAssetsInflation.ts`, reescrito.

**DEF-A09.** Cada alta abre un lote con su período y su costo; una baja consume
lotes por antigüedad y retira el importe reexpresado del **origen** del bien dado
de baja. Antes se reexpresaba la baja por el mes en que ocurrió, como si el bien
hubiera nacido ese mes, y la resta no cancelaba la incorporación.

**DEF-A10.** La depreciación acumulada sigue al activo que regulariza,
identificado por su **clase de anexo**, con el coeficiente medio de los bienes
vivos de la clase. Con depreciación proporcional al costo —la línea recta del
plan base— equivale a calcularla sobre el valor de origen reexpresado. Antes se
reexpresaba por la fecha del asiento de amortización, que se registra al cierre
y tiene coeficiente 1.

**Verificado en la aplicación:**

| Concepto | Antes | Ahora | Correcto |
|---|---:|---:|---:|
| Valor de origen reexpresado | 12.326.577,61 | **11.492.722,37** | 11.492.722,36 |
| Depreciación acumulada reexpresada | 1.600.000,00 | **2.029.064,42** | 2.029.064,42 |
| Valor residual reexpresado | 10.726.577,61 | **9.463.657,95** | 9.463.657,94 |

Sobrevaluación corregida: **1.262.919,66**. Las diferencias de uno o dos
centavos contra la referencia son redondeo de coma flotante en el cálculo de
control, no en los libros.

El anexo además abre ahora por clase —*Muebles y útiles*, *Equipos de
computación*— en lugar de una única fila «Sin clase asignada» (DEF-A14).

---

## 10. EFE

**DEF-A06 · confirmado, no era un falso positivo.** Se verificó en el código
antes de tocarlo: en el método **directo** las líneas de resultado se imputaban
a `totals.operating`, es decir se presentaban como cobros operativos reales, y
en el **indirecto** el resultado de la venta no se eliminaba porque
`disposalResultCents` sólo se llenaba dentro de la rama del plegado. Los dos
métodos coincidían entre sí y los dos estaban mal de la misma manera. La
evidencia era la línea «Cobros por otros ingresos operativos $ 400.000,00»
dentro de actividades operativas.

**DEF-A07 · corregido** con linaje: compra → deuda originada → cancelación →
clasificación en inversión.

**Efecto sobre el caso:**

| Actividad | Antes | Ahora |
|---|---:|---:|
| Operativas | 2.418.200,00 | **4.850.200,00** |
| Inversión | −9.850.000,00 | **−12.282.000,00** |
| Financiación | 36.600.000,00 | 36.600.000,00 |
| **Variación neta** | 29.168.200,00 | **29.168.200,00** |

La variación neta no cambia —no puede cambiar—: lo que cambió es a qué actividad
pertenece cada peso. El desplazamiento se descompone exactamente en 3.630.000
del pago diferido, 798.000 del IVA de la disposición y 400.000 de la ganancia.

---

## 11. Defectos cerrados en esta fase

| ID | Título | Cómo se cerró |
|---|---|---|
| DEF-A06 | Ganancia por venta de BU como flujo operativo | Corregido; **verificado que no era falso positivo** |
| DEF-A07 | Pago diferido de BU fuera de inversión | Corregido con linaje deuda→origen |
| DEF-A09 | Bajas reexpresadas por el mes de la baja | Corregido por lotes de origen |
| DEF-A10 | Depreciación sobre base nominal | Corregido con el coeficiente del activo |
| DEF-A11 | Identidad de la empresa | La ficha actualiza la entidad contable |
| DEF-A14 | Clases del anexo de BU ausentes | Precargadas en el plan |
| DEF-A15 | Automapeo del importador | Dos pasadas, sin reutilizar encabezados |
| DEF-A16 | Redondeo de índices | Era de presentación; se muestran 4 decimales |
| DEF-A17 | Balance vacío «cuadra» | Estado vacío propio |
| DEF-A20 | Selector con años inexistentes | Alta explícita de ejercicios |
| DEF-A21 | Ejercicio creado en silencio | Rechazo con los ejercicios existentes |
| DEF-A22 | Redondeo silencioso | Queda registrado en el asiento |

**12 defectos cerrados.** Sumados a los 7 de la fase anterior: **19 de 22**.

---

## 12. Fe de erratas del informe de auditoría E2E

No se reescribe lo sucedido; se corrige lo mal dicho.

1. **Commits.** La tabla de §4 lista 8 commits y termina en `5aed5e7`. Los
   commits de la rama son **9**: falta `e4489a4`, que es el que agrega el propio
   informe y no podía listarse a sí mismo. El HEAD `e4489a4` del resumen es
   correcto.
2. **Cantidad de defectos.** El cuerpo del informe dice 22 y algunos anexos
   decían 20: el número correcto es **22**. Los dos últimos (DEF-A21 y DEF-A22)
   se incorporaron después de redactar el primer resumen.
3. **Nombre del producto.** El producto se llama **ContaLivre**. «ContaLibre»
   aparece en el encargo y se deslizó en algunos pasajes; no son dos productos.
4. **«Coinciden al centavo».** La afirmación es válida **en moneda nominal**. En
   moneda de cierre no lo era: el anexo de bienes de uso reexpresado tenía los
   errores DEF-A09 y DEF-A10, que el propio informe cuantificaba en otra
   sección. Corresponde leerla como «los estados en moneda nominal coinciden al
   centavo».
5. **36 controles y 24 invariantes.** Son dos planos distintos y no se
   contradicen. Las **24 invariantes** son las exigidas al sistema y se verifican
   *dentro de la aplicación*. Los **controles del cuadro de conciliación** —36
   entonces, **45** ahora— reverifican esas invariantes y otras derivadas *sobre
   los archivos de respaldo*, con aritmética independiente del motor. Un control
   puede cubrir parte de una invariante y una invariante puede necesitar varios
   controles.

---

## 13. Defectos y trabajo pendientes

| ID | Título | Severidad | Estado |
|---|---|---|---|
| DEF-A12 | La planilla de AxI no se ata al ejercicio activo | Medio | Abierto |
| DEF-A13 | Clasificación monetaria de la planilla de AxI | Alto | **Mitigado** |
| DEF-A18 | Nota de PN vs. ESP antes del cierre | Medio | Abierto |

**Sobre DEF-A13.** El clasificador correcto existe y gobierna el motor y la
pantalla nueva; la planilla vieja conserva su heurística. El riesgo baja de alto
a medio porque el RECPAM que se publica ya no sale de ahí, pero la planilla
sigue mostrando una clasificación equivocada y debería retirarse o reescribirse.

**Trabajo del encargo que esta fase no alcanzó:**

1. **Exportación PDF formal (§12).** No se rediseñó. Sigue vigente el exportador
   anterior. Es la pieza más grande que queda y necesita su propia fase:
   carátula con datos reales, índice, ESP en formato clásico a dos lados, ER
   vertical progresivo, EEPN matricial con encabezados repetidos, EFE completo,
   notas y anexos, y control de desbordes.
2. **Exportación Excel coherente con el PDF (§12).** Igual.
3. **Captura de mediciones a valores corrientes (§8).** Se implementó el
   reconocimiento del criterio, no la pantalla de carga con fuente, evidencia y
   resultado por tenencia.
4. **Tablero del pre-cierre con las 14 etapas (§10).** Los controles existen
   —compuerta de publicación, matriz de cobertura, conciliación del RECPAM— pero
   no están reunidos en una sola vista de progreso, y la compuerta de cierre
   todavía no comparte núcleo con la de publicación.
5. **Unificación completa del AxI (§5).** Ver arriba.

---

## 14. Resultados

### Moneda nominal — sin cambios, como corresponde

| Concepto | Importe |
|---|---:|
| Total Debe = Total Haber | 460.158.600,00 |
| Activo | 69.327.300,00 |
| Pasivo | 26.463.800,00 |
| Patrimonio neto | 42.863.500,00 |
| Resultado del ejercicio | 12.863.500,00 |
| Efectivo al cierre | 29.168.200,00 |

### Moneda de cierre (diciembre 2025)

| Concepto | Importe |
|---:|---:|
| Resultado de las cuentas de resultado reexpresadas | 15.796.861,58 |
| RECPAM | −4.432.331,92 |
| **Resultado del ejercicio en moneda de cierre** | **11.364.529,66** |
| Patrimonio neto final reexpresado | 49.975.451,77 |
| Aportes reexpresados | 38.610.922,13 |
| Bienes de uso · valor residual reexpresado | 9.463.657,95 |

### Pruebas

| | Antes de 2I | Después |
|---|---:|---:|
| Pruebas unitarias e integración | 707 | **719** |
| Archivos de prueba | 100 | **101** |
| E2E Chromium | 33 | **35** |
| Controles del cuadro de conciliación | 36 | **45** |

Todo en verde. `tsc --noEmit` limpio; `eslint` sin errores (53 advertencias
preexistentes, ninguna nueva). El motor mantiene su presupuesto de performance:
424 ms para 10.000 asientos y 2.937 ms para 100.000.

Pruebas nuevas, todas ligadas a un defecto o a una capacidad de esta fase:

- `tests/reporting/efe-disposiciones-2i.test.ts` (12)
- `tests/reporting/tratamiento-cuentas-2i.test.ts` (16, de los cuales 7 sobre el
  Checkpoint A real)
- `tests/reporting/bienes-uso-moneda-cierre-2i.test.ts` (12)
- `tests/accounting/defectos-residuales-2i.test.ts` (11)
- Dos pasos nuevos en `e2e/auditoria-ciclo-completo.spec.ts`

Ninguna prueba quedó en verde cambiando el valor esperado para que pasara. Hubo
un solo caso donde una expectativa cambió —la apertura de la conciliación del
método indirecto en `reporting-engine.test.ts`— y está documentado en el propio
test: el total operativo y la variación neta, que son las invariantes contables,
siguen siendo idénticos; lo que se movió fue el detalle, porque una deuda por la
compra de un bien de uso dejó de contarse como capital de trabajo operativo.

---

## 15. Riesgos residuales

1. **No hay exportación formal** que refleje las cifras corregidas. Quien emita
   un PDF hoy obtiene el diseño anterior.
2. **La planilla de AxI sigue disponible** con su clasificación monetaria
   equivocada (DEF-A13). Mitigado, no eliminado.
3. **Los valores corrientes no se capturan**: un ente que deba medir bienes de
   cambio a valor neto de realización no tiene dónde registrarlo.
4. **La conciliación del RECPAM no bloquea todavía la compuerta de cierre.** El
   bloqueo existe en el módulo, pero el cierre no lo consulta: falta unificar el
   núcleo de controles (§10 del encargo).
5. **El caso auditado tiene un solo ejercicio**, así que la información
   comparativa en moneda de cierre no está probada sobre datos reales.

---

## 16. Veredicto

### APTO CON OBSERVACIONES

**Por qué no es «APTO PARA CIERRE Y EMISIÓN EN MONEDA DE CIERRE».** Las cifras
en moneda de cierre ya son correctas y demostrables: la cobertura es total, el
RECPAM se concilia por dos caminos y el rubro que estaba sobrevaluado un 13 %
quedó corregido y verificado en la aplicación. Pero *emitir* implica exportar, y
la exportación formal —el punto §12 del encargo, con su carátula, su ESP a dos
lados y su control de desbordes— no se implementó en esta fase. Mientras el PDF
siga siendo el anterior, no corresponde declarar apta la emisión.

**Por qué no es «NO APTO».** Nada de lo que quedó abierto produce cifras
incorrectas. Los tres defectos vivos son de módulo aislado y rotulado
(DEF-A12/A13) o de presentación de una nota (DEF-A18). El circuito completo
—operaciones, ajustes, moneda de cierre, RECPAM, estados, refundición, cierre y
apertura— corre de punta a punta y concilia.

**Condición para elevar el veredicto:** implementar la exportación formal PDF y
Excel desde el mismo snapshot canónico que alimenta la pantalla, y llevar la
conciliación del RECPAM y la cobertura de cuentas a la compuerta de cierre.
