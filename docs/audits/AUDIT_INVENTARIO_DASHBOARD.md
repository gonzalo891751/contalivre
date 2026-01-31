# AUDITORÍA TOTAL — Dashboard Inventario (Operaciones > Inventario) — ContaLivre

**Fecha:** 31 de Enero de 2026
**Auditor:** Senior Fullstack Engineer + Contador (ARG)
**Módulo:** Bienes de Cambio (Inventario)

## 0) Executive Summary

El módulo de inventario actual funciona correctamente como una **"Calculadora de Saldos"** (Snapshot), pero falla críticamente como un **"Sistema de Trazabilidad"** (Flow).

**Estado Actual:**
- ✅ **Cálculo de Saldos:** El stock actual y la valuación (Histórica y Homogénea) son matemáticamente correctos para el momento presente.
- ❌ **Flujo de Lotes (PEPS):** La visualización del flujo es **falsa**. Solo muestra los lotes *remanentes*. No existe historial de "cuánto entró" vs "cuánto salió" de cada lote.
- ❌ **Devoluciones de Venta:** Rompen la lógica PEPS. Al devolver mercadería, el sistema crea un **nuevo lote** con la fecha de la devolución (ej: Febrero), en lugar de restaurar la prioridad del lote original (ej: Enero). Esto hace que la mercadería devuelta quede "al final de la cola" de consumo, alterando el costeo de futuras ventas.
- ❌ **KPIs:** El dashboard está limitado al "Mes Seleccionado", lo que impide ver la performance acumulada del ejercicio.

**Impacto:**
- **Contable (Alto):** El CMV futuro puede distorsionarse si las devoluciones se costean como "nuevas".
- **Usuario (Crítico):** El usuario no puede auditar "qué pasó" con un lote específico (traza completa). El gráfico de "Flow" es confuso porque desaparecen los lotes agotados.

**Prioridades:**
- **P0:** Corregir la lógica de Devoluciones (restaurar fecha original).
- **P1:** Implementar el motor de "Layer History" para visualizar el flujo real (Entrada -> Consumo -> Remanente).
- **P2:** Agregar selector de rango (Mes vs Ejercicio) y completar KPIs faltantes.

---

## 1) Reproducción del caso (Dataset de referencia)

**Escenario: "Lata de tomate" (SKU L-001) - Método PEPS**

| Fecha | Movimiento | Cantidad | Costo Unit. | Comentario |
| :--- | :--- | :--- | :--- | :--- |
| 01/01 | Compra (Lote A) | +10,000 | $400 | Inicial |
| 05/01 | Gasto (Flete) | - | - | $242,000 (Aumenta costo Lote A) |
| 15/02 | Venta 1 | -4,000 | | Consume parcial Lote A |
| 20/02 | Venta 2 | -2,000 | | Consume parcial Lote A |
| 25/02 | Devolución Vta 1 | +200 | | Vuelve al stock |

**Resultado Esperado (Golden Case):**
- **Lote A (01/01):**
    - Inicial: 10,000 u
    - Consumo Vta 1: 4,000 u
    - Consumo Vta 2: 2,000 u
    - Reingreso Devol: 200 u
    - **Remanente: 4,200 u**
    - *Fecha de antigüedad: 01/01 (Debe ser el primero en salir en Marzo)*

**Resultado Actual (Bug):**
- **Lote A (01/01):** Remanente 4,000 u.
- **Lote B (25/02) [FALSO]:** Remanente 200 u (Creado por la devolución).
    - *Fecha de antigüedad: 25/02 (Queda último en la cola PEPS, después de compras de Enero/Feb).*

---

## 2) Expected vs Actual

| Elemento | Actual (Current Behavior) | Esperado (Expected Behavior) | Sev | Causa |
| :--- | :--- | :--- | :--- | :--- |
| **Devolución de Venta** | Crea una **nueva capa** con fecha de devolución (`mov.date`). | Restaura stock en la capa original o crea capa con fecha original (`source.date`). | **P0** | `costing.ts`: usa `mov.date` al hacer push. |
| **Visualización Flujo** | Muestra solo capas con `qty > 0`. Los lotes agotados desaparecen. | Muestra el ciclo de vida: Barra total (100%) -> Sección consumida (gris) -> Sección activa (color). | **P1** | `buildCostLayers` filtra `quantity > 0`. |
| **Historial de Lote** | No existe. Solo se sabe el estado final. | Drill-down: Ver qué ventas consumieron este lote específico. | P2 | Falta estructura de datos de "Eventos de Capa". |
| **KPIs Temporales** | Calculados solo para el mes seleccionado (`monthRange`). | Toggle para ver "Acumulado Ejercicio" vs "Mes". | P1 | `InventarioBienesPage` hardcodea el rango mensual. |
| **Tooltip UI** | Tooltips complejos dentro de `overflow-hidden` se cortan. | Tooltip en Portal/Fixed o mejor manejo de z-index. | P2 | CSS `overflow-hidden` en container de tarjetas. |

---

## 3) Mapa del Sistema

**Rutas Relevantes:**

1.  **Página Principal:** `d:\Git\ContaLivre\src\pages\Planillas\InventarioBienesPage.tsx`
    -   Maneja el estado global, carga de datos y cálculo de KPIs (`kpis`, `valuations`).
    -   Contiene la lógica de renderizado de pestañas.

2.  **Visualización de Lotes:** `d:\Git\ContaLivre\src\pages\Planillas\components\ProductLotsDrawer.tsx`
    -   Renderiza el panel lateral "Detalle de lotes".
    -   Recibe `ProductEndingValuation` que ya viene filtrado (solo remanentes).

3.  **Motor de Costeo:** `d:\Git\ContaLivre\src\core\inventario\costing.ts`
    -   `buildCostLayers`: Función CORE. Reconstruye capas desde cero.
    -   `calculateExitCost`: Determina costo de salida y consumo.
    -   **Aquí reside el error de lógica de devoluciones.**

4.  **Tipos de Datos:** `d:\Git\ContaLivre\src\core\inventario\types.ts`
    -   `CostLayer`: `{ date, quantity, unitCost, movementId }`.
    -   Falta concepto de `initialQuantity` en la capa.

5.  **Valuación Homogénea (RT6):** `d:\Git\ContaLivre\src\core\inventario\valuation-homogenea.ts`
    -   `computeProductEndingValuation`: Aplica índices de inflación a las capas remanentes.

---

## 4) Auditoría del Data Model

**1. Representación de Capas (`CostLayer`):**
- **Problema:** La interfaz `CostLayer` es volátil. Solo representa el "ahora".
- **Faltante:** No tiene `id` único persistente (se genera al vuelo). No tiene `initialQuantity`.
- **Consecuencia:** Imposible dibujar una barra de progreso "4000/10000 consumidos" porque el denominador (10000) se perdió.

**2. Algoritmo PEPS (`buildCostLayers` en `costing.ts`):**
- Itera movimientos cronológicamente.
- `PURCHASE`: Hace `layers.push`.
- `SALE`: Consume (`layer.quantity -= consume`). Si llega a 0, la capa desaparece del array final.
- **Error Devoluciones:**
    ```typescript
    // costing.ts L116
    layers.push({
        date: mov.date, // <--- ERROR: Usa fecha de devolución (hoy), no la original.
        quantity: qtyToReturn,
        ...
    })
    ```
    Esto rompe la antigüedad del inventario.

**3. Consumo de Ventas (`consumption breakdown`):**
- Sí se guarda en `BienesMovement.costLayersUsed`.
- **Excelente:** Tenemos la data para reconstruir la historia ("Esta venta consumió del Lote X").
- **No usado:** La UI actual no explota esta información para mostrar la trazabilidad.

---

## 5) Auditoría del UI/UX

**ProductLotsDrawer (`ProductLotsDrawer.tsx`):**
- **Flujo Falso:** Muestra una lista de lotes. Si un lote se consumió por completo, no aparece. El usuario no ve "historia", ve "saldo".
- **Barras de Progreso:** Muestra una barra llena al 100% para los lotes activos. No muestra el % consumido real porque desconoce la cantidad inicial del lote.
- **Tabla de Valuación:** Correcta, muestra valores históricos y homogéneos.
- **Z-Index/Overflow:** Los tooltips en `ProductValuationCard` pueden cortarse si están cerca de los bordes del contenedor con scroll.

**Recomendación UX:**
- Cambiar "Flujo de Lotes" a un timeline real.
- Mostrar lotes agotados en gris (no borrarlos).
- Barra de lote: `[============------]` (Consumido | Remanente).

---

## 6) Auditoría de KPIs

**Rango Temporal:**
- Hoy el Dashboard calcula todo basándose en `monthRange` (Mes actual).
- **Faltante:** El usuario necesita ver **"Acumulado Ejercicio"** para KPIs como:
    - Ventas acumuladas (YTD).
    - Rotación de inventario (necesita promedio de stock de un periodo más largo).

**KPIs a Incorporar:**
1.  **Ventas Netas (Ejercicio):** Suma de ventas YTD.
2.  **Margen Bruto (Ejercicio):** Fundamental para estrategia anual.
3.  **Sell-through:** % de inventario comprado que se vendió en el periodo.

---

## 7) Especificación Funcional: "Flujo de Lotes Real"

Para corregir la UI, necesitamos una nueva estructura de datos intermedia (no persistida, calculada al vuelo) para la vista de detalle:

```typescript
interface LotHistory {
  id: string; // ID artificial (basado en movementId de compra)
  originDate: string;
  initialQuantity: number;
  currentQuantity: number; // Remanente
  unitCostHist: number;
  events: LotEvent[];
}

interface LotEvent {
  date: string;
  type: 'CONSUMPTION' | 'RETURN' | 'ADJUSTMENT';
  quantity: number; // Negativo para consumo, Positivo para return
  referenceId: string; // ID de la venta/ajuste
}
```

**Lógica de Construcción:**
1.  En lugar de filtrar `quantity > 0` al final de `buildCostLayers`, mantener TODOS los lotes creados.
2.  Al procesar una venta, registrar el evento en el lote correspondiente.
3.  Al procesar una devolución, buscar el lote original (usando `sourceMovementId` o FIFO inverso) e incrementar su `currentQuantity` y registrar evento. **NO crear nuevo lote**.

---

## 8) Plan de Cambios (Checklist)

### Fase 1: Corrección Lógica (P0 - Crítico)
- [ ] **Modificar `src/core/inventario/costing.ts` (`buildCostLayers`):**
    - [ ] Detectar Devoluciones de Venta.
    - [ ] Buscar capas originales (`sourceMovementId` o matching de costos).
    - [ ] Si encuentra, sumar `quantity` a la capa existente y NO hacer push.
    - [ ] Si no encuentra (caso borde), hacer push pero forzando `date = originalDate` (si se conoce) o `mov.date` (fallback).

### Fase 2: Motor de Historial (P1)
- [ ] **Crear `src/core/inventario/layer-history.ts`:**
    - [ ] Implementar función `buildLayerHistory(product, movements)` que retorne `LotHistory[]`.
    - [ ] Debe ser similar a `buildCostLayers` pero registrando eventos y sin borrar capas vacías.
- [ ] **Actualizar `ProductLotsDrawer.tsx`:**
    - [ ] Usar `buildLayerHistory` para obtener los datos.
    - [ ] Renderizar lista completa (Activos + Agotados).
    - [ ] Dibujar barras de progreso reales (`current / initial`).

### Fase 3: KPIs y Mejoras UI (P2)
- [ ] **Actualizar `InventarioBienesPage.tsx`:**
    - [ ] Agregar toggle `[Mes Actual] | [Ejercicio Completo]`.
    - [ ] Recalcular KPIs según el toggle.
- [ ] **Mejorar Tooltips:**
    - [ ] Usar `ReactDOM.createPortal` o librería de popper para tooltips que escapen al overflow.

---

## 9) Plan de Pruebas

1.  **Test Unitario (Jest):**
    -   Crear test case "Lata de Tomate":
        -   Compra 100 @ 10 (Ene).
        -   Venta 50 (Feb).
        -   Devolución 10 (Mar).
    -   **Assert:** El sistema debe reportar 1 sola capa con fecha Ene y Qty = 60. (Hoy reporta: Capa Ene=50, Capa Mar=10).

2.  **Test de UI:**
    -   Verificar que un producto con stock 0 (pero con movimientos históricos) muestre sus lotes agotados en el Drawer.

3.  **Test RT6:**
    -   Verificar que la reexpresión homogénea de la mercadería devuelta use el coeficiente de la fecha de ORIGEN (Ene), no la de devolución (Mar). Esto es vital para no licuar el costo histórico.

---

## 10) Anexo: Hallazgos Técnicos

- **Dead Code:** En `ProductLotsDrawer.tsx`, la variable `isConsumed` (`lot.quantity <= 0`) casi nunca es true porque el input ya viene filtrado. Al implementar el historial real, esta lógica volverá a ser útil.
- **Tipos:** `BienesMovement` tiene campos `costUnitAssigned` y `costTotalAssigned` que se calculan al momento de guardar. Esto es bueno (snapshot), pero si se cambia el método de costeo (FIFO <-> PPP), hay una función `recalculateAllCosts` que actualiza todo. Asegurar que esta función también respete la nueva lógica de devoluciones.
