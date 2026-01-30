
# Auditoría Técnica y Diagnóstico Funcional: Inventario vs. Contabilidad (RT6)

- **Fecha:** 2026-01-30
- **Autor:** Gemini Staff Engineer
- **Estado:** COMPLETADO

## 1. Resumen Ejecutivo

Este documento presenta una auditoría del flujo de **Inventario (Bienes de Cambio)** y su interacción con la **Contabilidad (Libro Diario)**, enfocándose en la correcta aplicación del **Ajuste por Inflación (RT6)**.

El hallazgo principal es una **severa inconsistencia por mezcla de monedas** en el módulo de Cierre de Inventario. Aunque el sistema calcula correctamente los ajustes RT6 en el módulo contable y posee un mecanismo (`VALUE_ADJUSTMENT`) para reflejarlos en Inventario, el proceso de cierre de inventario falla al operar. Específicamente, la fórmula de Costo de Mercadería Vendida (`CMV = EI + CN - EF`) utiliza una **Existencia Final (EF) en moneda homogénea** pero la combina con una **Existencia Inicial (EI) y Compras Netas (CN) en moneda histórica**. Esto genera un CMV y, consecuentemente, asientos de cierre contablemente incorrectos que no reflejan la realidad económica ajustada.

La propuesta de solución se centra en tres etapas:
1.  **Trazabilidad y Base Homogénea:** Fortalecer el modelo de datos para que el inventario pueda manejar costos en moneda de origen y homogénea de forma explícita.
2.  **Aplicación Integral de RT6:** Modificar el proceso "Aplicar ajuste RT6" para que reexprese no solo las existencias, sino también las compras, devoluciones y otros movimientos del período.
3.  **Cierre Consistente:** Asegurar que la pantalla de Cierre opere exclusivamente en moneda homogénea y añada la funcionalidad para registrar Diferencias de Inventario.

## 2. Mapa del Flujo de Datos

El flujo actual, desde el movimiento de inventario hasta el cierre, es una mezcla de procesos automáticos y manuales que no están completamente integrados.

**Diagrama Textual del Flujo:**

```
[Módulo Inventario: Movimiento] -> (genera) -> [Módulo Diario: Asiento Original]
           |                                                 |
           |                                                 v
           +-------------------------------------> [Módulo Contable: Planilla RT6]
                                                               |
(calcula ajustes y genera) -> [Módulo Diario: Asiento de Ajuste RT6]
                                                               |
                                                               v
[Módulo Inventario: Conciliación] -> (detecta Asiento RT6) -> [Acción Manual: "Aplicar ajuste RT6"]
                                                               |
                                 (crea) -> [Módulo Inventario: Movimiento 'VALUE_ADJUSTMENT']
                                                               |
                                                               v
[Módulo Inventario: Cierre] -> (calcula CMV y genera) -> [Módulo Diario: Asiento de Cierre]
```

**Archivos y Funciones Clave por Etapa:**

1.  **Carga de Movimientos y Asientos Originales:**
    *   `src/pages/Planillas/InventarioBienesPage.tsx`: UI para crear movimientos.
    *   `src/storage/bienes.ts` (`createBienesMovement`): Guarda el movimiento y, si `autoJournal=true`, genera el asiento a través de `createEntry`.

2.  **Cálculo y Generación de Asientos RT6:**
    *   `src/pages/Planillas/CierreValuacionPage.tsx`: UI del módulo de Ajuste por Inflación.
    *   `src/core/cierre-valuacion/auto-partidas-rt6.ts` (`autoGeneratePartidasRT6`): Analiza el mayor y prepara las partidas a ajustar.
    *   `src/core/cierre-valuacion/calc.ts`: Calcula los coeficientes y valores reexpresados.
    *   `src/core/cierre-valuacion/asientos.ts` (`generateCierreDrafts`): Genera los borradores de asientos de ajuste.

3.  **Conciliación y Aplicación de Ajuste en Inventario:**
    *   `src/pages/Planillas/InventarioBienesPage.tsx`: La pestaña "Conciliación" detecta asientos RT6.
    *   `getEntryInventoryMatch` (en `InventarioBienesPage.tsx`): Identifica los asientos por el memo "ajuste por inflaci" o `sourceModule: 'cierre-valuacion'`.
    *   `handleApplyRT6Adjustment` (en `InventarioBienesPage.tsx`): Lógica del botón "Aplicar ajuste RT6". Crea movimientos `VALUE_ADJUSTMENT` prorrateando el ajuste entre las compras del mes.

4.  **Valuación de Inventario y Cierre:**
    *   `src/core/inventario/costing.ts`: Motor de costeo (FIFO/PPP). **Sí intenta aplicar** el `valueDelta` de los `VALUE_ADJUSTMENT`.
    *   `src/core/inventario/closing.ts`: Lógica para el cálculo de CMV y generación de asientos de cierre periódico. **No utiliza `costing.ts`** y opera con valores históricos.
    *   `InventarioBienesPage.tsx`: Orquesta la UI de la pestaña "Cierre", recogiendo valores de distintas fuentes (históricas y ajustadas) para alimentar a `closing.ts`.

## 3. Inventario: Modelo de Datos Actual

-   **Fuente de Verdad:** Base de datos IndexedDB (Dexie), tablas `bienesMovements` y `bienesProducts`.
-   **Archivo Clave:** `src/core/inventario/types.ts`.
-   **Modelo `BienesMovement`:**
    -   Contiene todos los datos operativos de un movimiento (cantidad, tipo, costo/precio histórico).
    -   **Campos para RT6:**
        -   `type: 'VALUE_ADJUSTMENT'`: Tipo especial de movimiento sin cantidad, solo para ajustes de valor.
        -   `valueDelta?: number`: El monto del ajuste (positivo o negativo).
        -   `rt6Period?: string`: Período `YYYY-MM` del ajuste.
        -   `rt6SourceEntryId?: string`: ID del asiento del Libro Diario que originó este ajuste. **Este es el vínculo de trazabilidad.**
-   **Modelo `CostLayer` (para FIFO/LIFO):**
    -   `unitCost: number`: El costo unitario de cada capa de inventario. El motor de costeo en `costing.ts` modifica este valor al aplicar un `VALUE_ADJUSTMENT`.

## 4. RT6: Cálculo y Armado de Asientos

-   **Fuente de Verdad:** Partidas generadas a partir del Libro Mayor (`db.entries`) y almacenadas en el estado de `CierreValuacionState`.
-   **Archivos Clave:** `src/core/cierre-valuacion/auto-partidas-rt6.ts`, `calc.ts`, `asientos.ts`.
-   **Proceso:**
    1.  `autoGeneratePartidasRT6` lee el mayor y determina qué cuentas no monetarias deben ajustarse, incluyendo "Mercaderías" y sus cuentas de movimiento (Compras, etc.).
    2.  `calculateRT6Totals` aplica los coeficientes de inflación para obtener el valor homogéneo y el RECPAM por partida.
    3.  `generateCierreDrafts` y `buildVoucher` construyen los asientos contables finales, agrupando por un lado los ajustes de PN y Resultados y por otro la contrapartida RECPAM.
-   **Diagnóstico:** Este módulo funciona correctamente y de forma aislada. Genera los asientos de ajuste RT6 de manera adecuada y los envía al Libro Diario. El problema es la falta de integración aguas abajo.

## 5. Conciliación: Detección y Falencias

-   **Archivo Clave:** `src/pages/Planillas/InventarioBienesPage.tsx`.
-   **Cómo detecta asientos:** La función `getEntryInventoryMatch` busca en el `memo` del asiento la frase "ajuste por inflaci" o si el `sourceModule` es `cierre-valuacion`. Esto es efectivo para identificar los asientos.
-   **Qué hace "Aplicar ajuste RT6":**
    1.  Toma el monto total del ajuste de las líneas de inventario del asiento.
    2.  Busca movimientos de compra (`PURCHASE`) en el mismo mes que el asiento de ajuste.
    3.  Si encuentra compras, **prorratea** el monto del ajuste entre ellas y crea N movimientos de tipo `VALUE_ADJUSTMENT`, uno por cada compra.
    4.  Si no encuentra compras, falla (o intenta un fallback si hay un solo producto).
-   **Falencias del enfoque actual:**
    *   **Manual y propenso a olvidos:** El usuario debe realizar la acción.
    *   **Prorrateo impreciso:** El ajuste contable es sobre el saldo total de la cuenta (EI + Compras del período). El sistema lo aplica solo a las compras del mes del asiento, lo que es una simplificación que genera desvíos.
    *   **No maneja ajuste de Saldo Inicial:** Si el ajuste corresponde a la reexpresión del Saldo Inicial, el mecanismo de prorrateo por compras fallará.

## 6. Hallazgos

-   **P0: Mezcla de monedas en el cálculo de Cierre.**
    -   **Evidencia:** `InventarioBienesPage.tsx` alimenta a la fórmula de CMV en `closing.ts` con `existenciaInicial` y `comprasNetas` a valor histórico, pero con una `existenciaFinal` (teórica) que sí incluye los ajustes RT6 procesados por `costing.ts`.
    -   **Impacto:** El CMV es incorrecto, el resultado bruto es incorrecto y los asientos de cierre derivados son incorrectos. Es el problema más grave.

-   **P1: El mecanismo "Aplicar ajuste RT6" es un parche impreciso.**
    -   **Evidencia:** La lógica en `handleApplyRT6Adjustment` dentro de `InventarioBienesPage.tsx` prorratea el ajuste total solo en las compras de un mes.
    -   **Impacto:** El ajuste no se aplica correctamente a las capas de costo que corresponden (ej. saldo inicial) y el valor homogéneo del inventario es una estimación, no el valor que surge de la contabilidad.

-   **P1: La lógica de ajuste de costo en FIFO/LIFO es conceptualmente extraña.**
    -   **Evidencia:** La fórmula `layer.unitCost += delta / totalLayerQty` en `costing.ts` (`buildCostLayers`) incrementa el costo de cada unidad en el mismo valor absoluto, sin importar su costo original.
    -   **Impacto:** Aunque intenta hacer un ajuste, no es proporcional al valor de cada capa, distorsionando los costos relativos.

-   **P2: No existe un flujo para la Diferencia de Inventario en moneda homogénea.**
    -   **Evidencia:** El flujo de cierre actual en `InventarioBienesPage.tsx` y `closing.ts` permite un asiento de ajuste por diferencia, pero opera sobre la mezcla de monedas ya descrita. No hay una sección clara para el "Inventario Final Físico" y el cálculo de la diferencia sobre una base homogénea.

-   **P2: Falta de visibilidad para el usuario.**
    -   **Evidencia:** La UI no presenta de forma clara y separada los valores en **moneda de origen** vs. **moneda homogénea**. El usuario no puede validar qué valores está usando el sistema para el cierre, generando desconfianza.

## 7. Diagnóstico Raíz (Root Cause)

El sistema presenta una **arquitectura desacoplada por diseño pero incompleta en su implementación**. El módulo de contabilidad (`cierre-valuacion`) y el de inventario (`inventario`) operan como silos. El mecanismo `VALUE_ADJUSTMENT` fue introducido como un "puente" para conectar ambos, pero la integración se detuvo a mitad de camino.

El motor de costeo (`costing.ts`) fue modificado para *recibir* estos ajustes, pero el módulo de **cierre de inventario (`closing.ts`) nunca fue actualizado para consumir los resultados de este motor**. Sigue operando con su lógica original basada en la fórmula de CMV con valores históricos, a la cual se le inyecta una Existencia Final ajustada, causando la inconsistencia.

En resumen: **El Cierre de Inventario no respeta la fuente de verdad de la valuación homogénea (el motor de costeo) y en su lugar realiza un cálculo propio mezclando monedas.**

## 8. Propuesta de Solución

### Etapa 1: Trazabilidad y Base Origen/Homogéneo

1.  **Modificar Modelo de Datos (`types.ts`):**
    *   En `CostLayer`, agregar `unitCostHomogeneo: number`.
    *   En `ProductValuation`, agregar `totalValueHomogeneo: number`.
    *   En `BienesMovement`, para las salidas (ventas), agregar `costTotalAssignedHomogeneo: number`.
    Esto hace explícita la separación de monedas.

2.  **Actualizar Motor de Costeo (`costing.ts`):**
    *   Al construir las capas (`buildCostLayers`), inicializar `unitCostHomogeneo = unitCost`.
    *   Al procesar un `VALUE_ADJUSTMENT`, la lógica debe modificar **únicamente `unitCostHomogeneo`**, dejando `unitCost` (el de origen) intacto.
    *   Proponer una lógica de ajuste proporcional:
        ```typescript
        // En buildCostLayers, dentro del if para VALUE_ADJUSTMENT
        const totalValueOrigen = layers.reduce((s, l) => s + l.quantity * l.unitCost, 0);
        if (totalValueOrigen > 0) {
            const adjustmentRatio = 1 + (delta / totalValueOrigen);
            for (const layer of layers) {
                layer.unitCostHomogeneo *= adjustmentRatio;
            }
        }
        ```

3.  **Actualizar Valuación y KPIs:**
    *   `calculateProductValuation` debe ahora calcular `totalValue` (origen) y `totalValueHomogeneo`.
    *   Los KPIs y vistas de Dashboard deben poder mostrar ambos valores.

### Etapa 2: Aplicar RT6 Completo

1.  **Rediseñar `handleApplyRT6Adjustment` (`InventarioBienesPage.tsx`):**
    *   En lugar de prorratear, debe leer el **valor homogéneo total** de la cuenta "Mercaderías" (o sus componentes) directamente desde la planilla de `CierreValuacionState`.
    *   Calcular el `delta` total (`valorHomogeneo - valorOrigen`).
    *   Crear un **único** movimiento `VALUE_ADJUSTMENT` por producto (o por capa si se quiere más granularidad) que aplique el `delta` a las capas de costo existentes (modificando `unitCostHomogeneo`). Este proceso debe ser más robusto y no depender de "compras del mes".

2.  **Reexpresar Movimientos del Período:**
    *   El proceso de "Aplicar ajuste RT6" también debe reexpresar las **Compras, Devoluciones y Bonificaciones** del período para que el cálculo de Compras Netas sea homogéneo.
    *   Esto se puede lograr creando `VALUE_ADJUSTMENT` asociados a esos movimientos o, más simple, calculando un `comprasNetasHomogeneas` directamente en la pantalla de cierre.

### Etapa 3: Cierre Consistente y Diferencia de Inventario

1.  **Refactorizar la Pestaña "Cierre" (`InventarioBienesPage.tsx`):**
    *   La pantalla **debe mostrar dos columnas: "Valores de Origen" y "Valores Homogéneos"** para EI, Compras Netas, EF y CMV.
    *   Todos los cálculos para la columna "Valores Homogéneos" deben usar los campos `...Homogeneo` del motor de costeo.
    *   El **asiento de cierre de CMV debe generarse usando los importes de la columna "Valores Homogéneos"**.

2.  **Implementar Diferencia de Inventario:**
    *   Añadir un campo `Inventario Final Físico (Homogéneo)` en la UI de Cierre.
    *   Calcular `Δ = IF_fisico_homog - EF_teorico_homog`.
    *   Previsualizar el asiento de ajuste por diferencia:
        *   Si `Δ > 0`: `Debe: Mercaderías / Haber: Diferencia de Inventario (Ganancia)`
        *   Si `Δ < 0`: `Debe: Diferencia de Inventario (Pérdida) / Haber: Mercaderías`
    *   Permitir al usuario generar este asiento adicional.

## 9. Criterios de Aceptación (Checklist)

-   [ ] El sistema puede almacenar y diferenciar costos de origen y homogéneos.
-   [ ] Al aplicar RT6, el costo de origen de las capas de inventario no se modifica.
-   [ ] Al aplicar RT6, el costo homogéneo de todas las capas (incluido el saldo inicial) se actualiza.
-   [ ] La pantalla de Cierre muestra columnas separadas para valores históricos y homogéneos.
-   [ ] La fórmula `CMV = EI + CN - EF` en la columna homogénea utiliza los tres componentes en moneda homogénea.
-   [ ] El asiento contable de CMV generado por el cierre utiliza los importes homogéneos.
-   [ ] El usuario puede introducir un inventario físico final y el sistema calcula la diferencia contra el teórico homogéneo.
-   [ ] El sistema genera un asiento de ajuste por diferencia de inventario correcto.

## 10. Plan de Pruebas

**Pruebas Unitarias:**

-   `costing.ts`:
    -   Verificar que `buildCostLayers` no altera `unitCost` al recibir un `VALUE_ADJUSTMENT`.
    -   Verificar que `buildCostLayers` sí altera `unitCostHomogeneo` proporcionalmente.
    -   Verificar que `calculateProductValuation` retorna `totalValue` y `totalValueHomogeneo` correctos.
-   `closing.ts`:
    -   Simular `PeriodicClosingData` con valores homogéneos y verificar que los asientos generados son correctos.

**Pruebas E2E Manuales:**

1.  **Escenario Base:**
    *   Cargar Saldo Inicial para un producto.
    *   Cargar una Compra en enero.
    *   Cargar una Venta en febrero.
    *   Verificar que el CMV se calcula a costo de origen.
2.  **Escenario con RT6:**
    *   Sobre el escenario anterior, ejecutar el proceso de Ajuste por Inflación en el módulo contable.
    *   Ir a Inventario -> Conciliación y "Aplicar ajuste RT6".
    *   **Validar:**
        *   En la valuación de stock, el "Valor Homogéneo" es mayor al "Valor de Origen".
        *   Ir a la pestaña Cierre.
        *   **Validar:** La columna "Homogéneo" muestra EI, CN y EF reexpresados.
        *   **Validar:** El CMV homogéneo es diferente al CMV de origen.
    *   Generar asiento de cierre.
    *   **Validar:** El asiento en el Libro Diario refleja el CMV homogéneo.
3.  **Escenario con Diferencia de Inventario:**
    *   Sobre el escenario anterior, en la pestaña Cierre, ingresar un "Inventario Final Físico" 10% mayor al teórico.
    *   **Validar:** El sistema muestra una "Diferencia de Inventario (Ganancia)".
    *   Generar el asiento de ajuste por diferencia.
    *   **Validar:** El asiento `Mercaderías` a `Diferencia de Inventario` se crea correctamente.

## 11. Riesgos y Mitigaciones

-   **Riesgo:** Modificar el modelo de datos (`CostLayer`) podría impactar performance si hay muchos datos.
    -   **Mitigación:** Las modificaciones son aditivas (`unitCostHomogeneo`). Realizar pruebas de carga con un volumen alto de movimientos.
-   **Riesgo:** La refactorización del flujo de cierre es compleja y puede introducir nuevos bugs.
    -   **Mitigación:** Abordar la solución por las etapas propuestas, probando cada una exhaustivamente. Depender fuertemente del plan de pruebas manual E2E.
-   **Riesgo:** El usuario puede confundirse con las dos columnas (Origen vs. Homogéneo).
    -   **Mitigación:** Usar un diseño de UI claro, con tooltips y ayudas visuales que expliquen el propósito de cada columna. La columna "Homogéneo" debe ser la principal para la toma de decisiones al cierre.
