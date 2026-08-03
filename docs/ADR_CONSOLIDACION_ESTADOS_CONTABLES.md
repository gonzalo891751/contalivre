# ADR — Consolidación de estados contables (Fase 2K)

Estado: **aceptado** · Fecha: 2026-08-02 · Rama: `feat/fase-2k-consolidacion-estados-contables`

Registra las decisiones de arquitectura que gobiernan el módulo de consolidación
y, sobre todo, **por qué** se tomaron. Las alternativas descartadas se documentan
para que una fase futura no las reintente sin conocer el motivo.

---

## ADR-2K-1 — Las controladas son entidades reales, no paquetes de reporte

**Contexto.** Hasta la Fase 2I la aplicación era, de hecho, mono-empresa:
`resolveContextForYear` fijaba `DEFAULT_COMPANY_ID` y `exerciseIdForYear(year)`
producía `exercise-company-default-<año>` por construcción, así que dos entidades
no podían tener ejercicio propio para el mismo año.

**Alternativa descartada.** Representar cada controlada como un "paquete de
reporte" (un conjunto de saldos importado o cargado a mano) y consolidar sobre
eso. Era mucho más barato y no tocaba nada del núcleo.

**Decisión.** Las controladas son **empresas de pleno derecho** de la
instalación, con su propio Libro Diario, sus propios ejercicios y sus estados
producidos por el mismo motor canónico. Se parametrizó `companyId` en el contexto
de reporting, en los cargadores y en la puerta de contabilización.

**Por qué.** Un paquete de reporte habría convertido el módulo en una planilla
con otra piel: las cifras de las controladas no se podrían auditar hasta el
asiento, la trazabilidad se cortaría en el saldo importado, y el invariante "los
estados fuente son inmutables" sería trivial por vacío. Con entidades reales,
cada importe consolidado se puede seguir hasta el asiento que lo originó.

**Costo aceptado.** El cambio toca el núcleo contable. Se mitigó con
compatibilidad literal: `exerciseIdFor(DEFAULT_COMPANY_ID, year)` devuelve
exactamente el id histórico, y todos los parámetros nuevos son opcionales, de
modo que omitirlos reproduce el comportamiento previo. Los 719 tests
preexistentes pasan sin modificación.

---

## ADR-2K-2 — Un único espacio Debe−Haber para toda la hoja

**Contexto.** La hoja de consolidación combina rubros patrimoniales y de
resultado, importes por entidad, y ocho clases de ajuste. Había que decidir en
qué convención de signos vivía.

**Alternativas descartadas.**
1. Trabajar con "importes de exposición" (todos positivos, el signo lo pone el
   rubro). Es lo que hace la planilla de la cátedra.
2. Mantener dos modelos: uno patrimonial y otro de resultados.

**Decisión.** **Todo** el papel de trabajo es un único balance de comprobación en
neto Debe − Haber. La base de cada entidad es su balance **antes de la
refundición** (se excluye el asiento estructural de cierre y se conservan los
saldos de apertura), cuya suma es exactamente cero.

**Por qué.** Con esta convención:

- cada eliminación es un asiento balanceado en el mismo espacio;
- la suma de toda la hoja consolidada es cero **por construcción**;
- la ecuación patrimonial no se "verifica comparando dos modelos": es
  aritmética, y si no cierra hay un error real que el motor denuncia;
- el signo de exposición se aplica **sólo al presentar**, así que una eliminación
  nunca cambia de sentido según la vista.

**Consecuencia.** `naturalSign` vive en el catálogo de líneas, no en los
importes. Un defecto real apareció por esto y quedó cubierto por tests: el
resultado atribuible a la PNC tenía signo acreedor cuando es un cargo.

---

## ADR-2K-3 — La atribución del resultado no trascendido se decide por el vendedor

**Contexto.** La norma distingue operaciones ascendentes, descendentes y
laterales, y la atribución del ajuste cambia en cada caso.

**Alternativa descartada.** Codificar tres reglas, una por sentido, con la
dirección declarada por el usuario.

**Decisión.** Una sola regla: **el resultado no trascendido se imputa a la
entidad que lo generó, es decir al vendedor**. La dirección se *deriva* de los
roles (`deriveDirection`) y sólo se usa para explicar, nunca para calcular.

**Por qué.** Las tres reglas son la misma vista desde ángulos distintos:

- vendedor = controlada ⇒ corrige *su* patrimonio ⇒ se reparte con la PNC según
  la participación;
- vendedor = controladora ⇒ la controlada no ganó de más ⇒ la PNC **no** se
  reduce y el ajuste completo recae sobre los propietarios de la controladora;
- entre dos controladas ⇒ se aplica la participación de la vendedora.

Una regla es más difícil de romper que tres, y hace imposible el error clásico de
reducir la PNC en una operación descendente. Los seis casos de la planilla
(hojas 03 a 08) lo confirman al peso.

---

## ADR-2K-4 — Nada se fuerza a cuadrar

**Contexto.** En los casos de cátedra la inversión de la controladora ya está
medida al VPP ajustado, así que la eliminación cierra sola. En una instalación
real puede estar a costo, desactualizada o mal medida.

**Alternativa descartada.** Absorber la diferencia en la línea de patrimonio o
crear una cuenta de ajuste que haga cerrar el papel de trabajo.

**Decisión.** El motor calcula el VPP que *debería* tener la inversión y expone
la diferencia en una línea propia —`ANC_LLAVE_NEGOCIO`, "diferencia de
consolidación"—, **bloqueando la emisión formal** hasta que alguien la explique.
La hoja sigue cerrando: la diferencia está expuesta, no escondida.

**Por qué.** Es el requisito §20 de la fase y, más allá de eso, es la única
conducta defendible: una diferencia sin explicar es información, no ruido.
Tapada con un ajuste automático, el juego "cuadra" y miente.

**Alcance del bloqueo.** El mismo criterio se aplica cuando falta el mapeo de la
inversión, cuando un resultado no trascendido no tiene activo donde alojarse y
cuando una partida recíproca queda sin conciliar.

---

## ADR-2K-5 — Los ajustes son extracontables por diseño, no por convención

**Contexto.** El invariante central de la fase: las eliminaciones no pueden tocar
los libros de ninguna entidad.

**Decisión.** Se garantiza en tres capas:

1. **Esquema.** Las ocho tablas de la v23 son papeles de trabajo; ninguna es
   fuente de asientos.
2. **Código.** `src/consolidation/repository.ts` es la única puerta de escritura
   del módulo y no importa `journalRepository` ni escribe en `entries`. El motor
   (`engine/`) es una función pura sin acceso a la base.
3. **Tests.** Se compara el contenido de `db.entries` byte a byte antes y después
   de crear el grupo, conciliar recíprocos, cargar operaciones, asentar ajustes
   manuales y consolidar dos veces.

**Por qué.** Un invariante que sólo vive en la documentación se rompe en la fase
siguiente. Éste falla el build si alguien lo viola.

---

## ADR-2K-6 — La consolidación consume representaciones canónicas y no duplica motores

**Decisión.** El módulo **no** implementa su propio ESP, ER, EEPN ni EFE:

- la hoja se construye sobre `buildNormalizedTrialBalance`, el mismo del motor
  individual;
- los estados consolidados reutilizan `ReportLine`, el mismo tipo que la UI, el
  PDF y el Excel ya saben presentar;
- el EFE consolidado parte del `CashFlowStatement2B` canónico que cada entidad ya
  produjo y le aplica las eliminaciones de flujos internos.

**Por qué.** Dos motores de EFE divergen: es cuestión de tiempo. Además, si el
consolidado se construyera con su propia lógica, una corrección en el motor
individual dejaría de propagarse y las cifras separadas y consolidadas se
contradirían.

**Verificación.** La prueba ácida del dataset: con la inversión medida por VPP,
el resultado consolidado atribuible a los propietarios (186.400) es **idéntico**
al resultado individual de la controladora.

---

## ADR-2K-7 — El catálogo de líneas se deriva de la taxonomía existente

**Decisión.** La línea consolidada de una cuenta se deriva de `kind` +
clasificación corriente/no corriente + `statementGroup` + `equityComponent`: la
misma taxonomía que alimenta el ESP y el ER individuales. El mapeo explícito sólo
**corrige** esa derivación.

**Por qué.** No hay taxonomía paralela que mantener sincronizada, y el motor
nunca depende del nombre de una cuenta: "Caja", "Mercaderías" o "Inversión
permanente" no significan nada para él.

**Excepción deliberada.** Ingresos y gastos financieros se exponen **separados**
en la hoja aunque el ER individual los presente netos. Mezclados, eliminar los
intereses internos —ingreso de una entidad y gasto de la otra por igual
importe— sería invisible y el invariante "los ingresos y gastos intragrupo quedan
en cero" no podría verificarse.

---

## ADR-2K-8 — La PNC integra el patrimonio neto (RT 54), no el pasivo (RT 21)

**Contexto.** La planilla de la cátedra expone la "participación minoritaria" en
una línea propia entre el pasivo y el patrimonio neto, y usa la terminología de
la RT 21.

**Decisión.** ContaLivre expone la **participación no controladora dentro del
patrimonio neto**, separada del patrimonio atribuible a los propietarios de la
controladora, conforme la RT 54 (texto ordenado por RT 59). La RT 21 se cita sólo
como antecedente histórico.

**Por qué.** Los importes son idénticos; lo que cambia es el lugar y el nombre, y
ambos comunican una idea contable distinta. La PNC no es una obligación del
grupo: son co-propietarios de una de sus sociedades. La divergencia con la
planilla está documentada en los propios golden tests.

---

## ADR-2K-9 — El control es una conclusión fundada, no un umbral

**Decisión.** `addMember` **rechaza** el alta de una entidad sin fundamento
escrito sobre la existencia de control. `assessControl` compara la conclusión
declarada con la señal objetiva (porcentaje de votos) y marca la divergencia para
que la interfaz la advierta, sin sobrescribir ninguna de las dos.

**Por qué.** Puede haber control con menos del 50 % y no haberlo con más. Un
sistema que deduce control del porcentaje enseña mal y, en un caso real, concluye
mal en silencio.

**Corolario.** `relation` (naturaleza del vínculo) y `method` (tratamiento
contable) son campos **distintos**. Una asociada no "se consolida por VPP": se
*mide* por VPP y queda fuera del perímetro.

---

## ADR-2K-10 — La consolidación vive después del cierre individual, en página propia

**Decisión.** Ruta `/consolidacion`, en el grupo CONTABILIDAD del menú, inmediatamente
después de "Estados contables".

**Por qué.** El pre-cierre y el cierre siguen siendo procesos de cada entidad
jurídica. Meter la consolidación dentro de "Estados contables" —que trabaja sobre
la empresa seleccionada y su ejercicio— habría mezclado dos contextos distintos:
empresa/ejercicio individual contra grupo/ejercicio de consolidación. La página
propia mantiene esa frontera visible, que es justamente lo que el módulo enseña.

---

## Limitaciones conocidas que estas decisiones dejan abiertas

Se detallan con precisión en la sección "Lo que no se hizo" del informe de la
fase. En resumen: plan de cuentas compartido por el grupo (consecuencia de que el
código de cuenta es único en toda la base), sin conversión de estados en moneda
extranjera, sin cambios de participación ni pérdida de control dentro del
ejercicio, y detección de recíprocos por mapeo declarado en lugar de automática.
