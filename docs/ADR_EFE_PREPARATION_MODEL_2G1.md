# ADR (adenda 2G.1) — Preparación reexpresada, disposiciones a crédito y políticas

- **Estado:** Aceptado (adenda de [`ADR_EFE_PREPARATION_MODEL.md`](ADR_EFE_PREPARATION_MODEL.md)).
- **Contexto normativo:** RT 54 (TO RT 59) párr. 196-197, 656-661; Informe 29 FACPCE.
- **Alcance:** cierra las limitaciones §14 de la Fase 2G sin cambiar la alternativa B.

## 1. Preparación en moneda de cierre (dos modelos hermanos)

**Problema.** `CashFlowPreparationModel` se emitía sólo NOMINAL. La reexpresión de
flujos (`reexpressCashFlow`) y la exposición formal ya concilian en cierre, pero la
matriz/papel de trabajo no conservaba evidencia por contribución reexpresada.

**Decisión.** El motor emite **dos** DTO hermanos, nunca una matriz que cambie en
silencio según un selector:

- `bundle.preparation`: `CashFlowPreparationModel` con `identity.expression = 'NOMINAL'`.
- `bundle.preparationRestated`: `CashFlowPreparationModel` con
  `identity.expression = 'CLOSING_CURRENCY'`, presente sólo cuando se pidió un set de
  índices. Comparte el mismo tipo (contrato único), con campos adicionales de
  reexpresión poblados.

**Evidencia por contribución.** Se agrega `PrepContribution` con: `amountNominalCents`,
`originDate`, `originPeriod`, `originIndex`, `closeIndex`, `coefficient`,
`restatedRawCents` (antes de redondeo), `restatedCents`, `roundingDiffCents`,
`entryId`, `lineIndex`, `accountId`, `classification`, `activity`, `formula`, `control`.
Las contribuciones se **agregan por cuenta** para la matriz (una fila/imputación por
cuenta) y se retienen para el detalle diferido y la hoja "Reexpresión" del papel de
trabajo — no se vuelcan todas al DOM (performance §11).

**Identidad reexpresada.** `PreparationIdentity` gana: `expression`
(`NOMINAL | CLOSING_CURRENCY`), `indexSetId`, `indexSetHash`, `closePeriod`,
`algorithmVersion`, `coverage` (`COVERED | PARTIAL | MISSING`), `blockers[]`.

**Puente del efectivo reexpresado.** `openingPublishedCents` nominal +
`openingRestatedCents` (coef inicio→cierre), modificaciones de apertura nominales y
reexpresadas, `openingAdjustedRestatedCents`, `closingCents` (moneda de cierre por
naturaleza), `flowsRestatedCents`, `reiCents`, `netChangeCents`, control.

**Matriz directa reexpresada.** Cada cobro/pago por su fecha real × coeficiente del
período de origen; subtotales por actividad; controles fila/columna/total.

**Indirecto reexpresado (forma correcta).** No se fuerza una matriz nominal a
"parecer" cierre. El indirecto reexpresado se presenta como **conciliación** en
moneda de cierre: resultado reexpresado, ajustes devengados sin efecto, variaciones
de capital de trabajo reexpresadas, flujos de inversión/financiación reexpresados,
partidas sin clasificar y **REI** como línea de conciliación (no flujo). Es la misma
descomposición que `reexpressCashFlow.indirect`, con evidencia de coeficiente por
fila. Se documenta expresamente que el REI cierra el puente y no se duplica.

**Bloqueo por falta de índices.** Si falta un índice de un período con contribución
material: `coverage = MISSING/PARTIAL`, blocker explícito, se identifican las
contribuciones afectadas, **no** se simula coeficiente 1 como válido, se impide la
exportación validada y sólo se permite borrador con advertencia.

## 2. Disposiciones a crédito, cobros parciales y mixtas

**Estrategia de vínculo (auditable, no frágil).** Se usa la **operación** como
unidad: los asientos ya llevan `sourceOperationId`/`sourceModule`/`sourceType`. El
vínculo venta↔crédito↔cobro se resuelve por **override transaccional persistido**
(`CashFlowOverride`, `target: 'OPERATION' | 'ENTRY' | 'LINE'`) en la política, que el
motor **consume** vía `effectiveOverride`. No se compara por memo, importe, fecha ni
nombre de cuenta.

**Detección de disposición no resuelta.** Cuando un asiento dispone un activo no
operativo (PPE/intangibles/inversiones) con resultado y **no** es plegable
automáticamente por `detectDisposalFold` (venta a crédito, cobro parcial, mixta,
permuta, dación en pago, siniestro), el motor emite `UNRESOLVED_DISPOSAL`:
identifica la operación, agrega un blocker y **no** clasifica por defecto.

**Resolución por override.** El usuario resuelve indicando operación, líneas,
cobros, actividad, importe asignado, motivo, vigencia, fuente y fecha. Controles:
`importe asignado a la disposición ≤ efectivo real relacionado`. El override es
persistido, versionado, auditable, incluido en snapshots y en el hash, reversible y
visible en el papel de trabajo.

**Comportamiento contable esperado** (idéntico a la RT 54): la venta a crédito no
genera flujo hasta el cobro; el cobro posterior se clasifica íntegro como inversión;
el cobro parcial expone sólo el efectivo realmente cobrado; la operación mixta separa
efectivo (inversión) y crédito (revelación no monetaria/pendiente); la ganancia/
pérdida se ajusta en el indirecto.

## 3. Consumo de la política por el motor

El motor pasa a recibir la `CashFlowPolicy` efectiva (por entidad/ejercicio). Aplica:
rol de efectivo por `effectiveCashRole` + `roleCountsAsCash` (sobregiros), overrides
por `effectiveOverride`, y las políticas de intereses/dividendos/IG. La historicidad
(`validFrom/validTo/version`) evita reclasificar períodos cerrados o snapshots
validados.

## 4. Esquema

`CashFlowPolicy` (schema v22) ya modela clasificación por rol con atributos,
intereses/dividendos/IG/sobregiros y overrides con vigencia/versión. **Decisión:** no
se eleva el esquema si los campos existentes resuelven el panel y las disposiciones;
si un caso exige un campo nuevo persistido (p. ej. importe asignado y cobros
vinculados del override de disposición), se eleva **v22→v23** con migración
idempotente y no destructiva, backup/restore y pruebas v22→v23 + instalación fresca.
La decisión final y su justificación se registran en el HITO 9.

## 5. Snapshots e identidad

Los snapshots amplían su cobertura: preparación nominal y de cierre, coeficientes,
política completa, overrides de disposiciones, relaciones de cobro, bloqueos y su
resolución, comparativo y exports relevantes. El hash cambia ante cualquier cambio
material (vínculo de cobro, override, política, índice, coeficiente, contribución,
preparación reexpresada). Un snapshot 2G sin preparación de cierre sigue siendo
legible y muestra "Preparación en moneda de cierre no disponible en esta versión
histórica"; no se reconstruye evidencia inexistente.
