# ADR — Modelo de preparación del Estado de Flujo de Efectivo (Fase 2G)

- **Estado:** Aceptado
- **Fecha:** 2026-07-22
- **Contexto normativo:** RT 54 (texto ordenado por RT 59), Informe 29 FACPCE/CECyT.
- **Fundamento:** [`AUDITORIA_EFE_ESTADO_ACTUAL.md`](AUDITORIA_EFE_ESTADO_ACTUAL.md) (§23-28).

## 1. Contexto

La auditoría concluyó que ContaLivre podía reproducir numéricamente el caso Purmamarca
pero **no generalizaba**: la venta de bienes de uso con resultado se clasificaba mal, la
moneda de cierre duplicaba partidas sin clasificar, la puerta de publicación no gobernaba
las expresiones reexpresadas, faltaba comparativo, y no existía evidencia matricial
(fórmulas, operandos, controles por celda) para un papel de trabajo auditable. Se pedía una
experiencia matricial "tipo Purmamarca" sin recalcular en React.

## 2. Decisión

Se adopta la **alternativa B** de la auditoría: el motor canónico emite, junto a los dos
estados formales, un **DTO hermano de preparación** (`CashFlowPreparationModel`) con toda la
evidencia. Se separan **tres contratos**:

1. **Evidencia / preparación** — `CashFlowPreparationModel`
   ([`src/reporting/preparation/cashFlowPreparation.ts`](../src/reporting/preparation/cashFlowPreparation.ts)):
   identidad + hash, puente del efectivo, filas matriciales, imputaciones con fórmula/
   operandos/lineage, puentes devengado→percibido y controles exactos en centavos.
2. **Estado formal** — `CashFlowStatement2B`
   ([`src/reporting/domain/types.ts`](../src/reporting/domain/types.ts)): sólo líneas
   exponibles, apertura/modificación/apertura modificada, actividades, REI/RFyT, variación,
   cierre, comparativo y revelaciones.
3. **Presentación** — la UI (`FlujoEfectivoCanonicalTab` + `PreparacionEfe`), el PDF
   (`reportBundlePdfFormal`), el XLSX formal (`exportReportBundle`) y el XLSX del papel de
   trabajo (`exportWorkingPaper`). Cada presentador consume el contrato que le corresponde.

## 3. Alternativas consideradas

| Alt. | Descripción | Veredicto |
|---|---|---|
| A. Ampliar `ReportLine` con fórmula/entryIds/controles | Menos tipos | **Descartada**: mezcla estado formal y papel de trabajo; riesgo de export accidental de la matriz. |
| **B. DTO de preparación hermano** | `buildCashFlows` + `buildCashFlowPreparation` | **Elegida**: fuente única, separación clara, reutiliza el cálculo. |
| C. Motor matricial como base | Primero matriz, luego presentadores | Viable pero refactor mayor y riesgo de regresión; innecesario. |
| D. Derivación sólo en UI | React reconstruye desde el bundle | **Descartada**: duplica contabilidad, pierde exactitud, rompe la separación de export. |

## 4. Por qué NO se calcula en React

Toda cifra sale del `ReportingBundle`. La UI de preparación (`PreparacionEfe`) sólo filtra,
ordena y formatea `bundle.preparation`. Motivos: (a) una segunda lógica contable en React
divergiría del motor; (b) los controles por fila/columna/total deben ser exactos en centavos
y auditables; (c) los snapshots y el papel de trabajo deben ser reproducibles desde la misma
evidencia. Test de contrato en [`efe2g-contracts.test.ts`](../tests/reporting/efe2g-contracts.test.ts).

## 5. Reconciliación de la matriz

La variación matricial (`cierre − inicio`, Debe−Haber) de cada cuenta NO efectivo es su
propia imputación a una causa/actividad ⇒ **control por fila = 0 por construcción**. Como el
balance cierra, `Σ variaciones = 0`, de modo que la variación del efectivo queda explicada
por `−Σ(variaciones no efectivo)`. La **exposición económica** de cada actividad es el signo
invertido de su columna; su suma reproduce la variación del efectivo. Purmamarca: controles
fila/columna/total en cero, exposición 4.000/30.000/5.000.

## 6. Política EFE versionada

`CashFlowPolicy` ([`src/reporting/policy/cashFlowPolicy.ts`](../src/reporting/policy/cashFlowPolicy.ts))
por entidad, persistida (tabla `cashFlowPolicies`, schema v22). Define efectivo/equivalentes
con atributos (liquidez, riesgo, plazo, restricción), intereses/dividendos/IG, sobregiros y
overrides auditables con vigencia. La migración v22 crea una política **heredada** determinista
marcada `requiresReview`. Historicidad: clasificaciones y overrides con `validFrom/validTo`; el
motor honra `NOT_APPLICABLE` (no clasifica en silencio a inversión).

## 7. Transacciones mixtas y disposición de activos

`detectDisposalFold` reconoce la disposición de un activo/pasivo NO operativo con resultado
asociado cuando las contrapartidas pertenecen a UNA sola actividad (inversión XOR financiación)
sin capital de trabajo ni partidas sin clasificar: el efectivo BRUTO va íntegro a la actividad y
el resultado se elimina del operativo (directo e indirecto). Los casos mixtos/venta a crédito NO
se pliegan: requieren evidencia transaccional/override y nunca se reclasifican en silencio.

## 8. Comparativo

`loadReportingBundle` construye el EFE del ejercicio anterior con el **mismo motor** (sus
asientos, apertura y mappings) y adosa `comparativeAmount` a las líneas actuales
(`attachCashFlowComparative`). En moneda de cierre se conserva la evidencia del coeficiente.

## 9. Inflación

`reexpressCashFlow` aplica el coeficiente del período de cada flujo y calcula el REI del
efectivo como conciliación (no un flujo). Se corrigió el doble conteo de partidas sin
clasificar (EFE-004) y se aplicó el mismo `detectDisposalFold` para que nominal y cierre
coincidan conceptualmente. El REI se expone en UI, PDF y XLSX y reconcilia la variación.

## 10. Snapshots e identidad

`serializeBundleForSnapshot` congela ambos métodos, reexpresión, preparación, gate y
validación. El hash de contenido (`materialHashInput`) es **determinista** (excluye
timestamps) y cambia ante cualquier cambio material; `snapshotDivergesFromCurrent` detecta
divergencia sin borrar. La puerta de VALIDATED usa `publicationGate.canPublish`.

## 11. Performance

El modelo de preparación agrega por cuenta (una fila/imputación por cuenta con movimiento),
no por contribución individual, evitando decenas de miles de nodos en el DOM. La matriz de la
UI se filtra en cliente sobre datos ya agregados; el detalle por celda se abre bajo demanda.
Los límites de performance del motor (10k/100k asientos) no se degradan: el DTO reutiliza el
recorrido existente de `buildStatements`/`buildCashFlows`.

## 12. Consecuencias

- `ReportingBundle` gana `preparation` y `publicationGate` (campos requeridos).
- Esquema Dexie 21 → 22 (migración no destructiva e idempotente).
- Motor `2G.0`; versión candidata `0.5.0-rc.1`.
- El exportador formal nunca consume la matriz; existe un export auxiliar de papel de trabajo.
