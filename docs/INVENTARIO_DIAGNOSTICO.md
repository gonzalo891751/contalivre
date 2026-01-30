# INVENTARIO Y CONTABILIDAD: DIAGNÓSTICO INTEGRAL

## 1. Resumen Ejecutivo
**Estado General:** El módulo de Inventario ("Operaciones > Bienes de Cambio") posee una base sólida para un sistema de **Inventario Permanente** (métodos FIFO, LIFO, PPP implementados y funcionales). La persistencia (Dexie/IndexedDB) y la lógica de costeo son robustas.

**Principales Hallazgos:**
*   **Crítico:** El alta de producto con "Inventario Inicial" **NO genera asiento contable**. Se guarda el dato en el producto pero no crea un movimiento ni impacta el Libro Diario.
*   **Arquitectura:** El sistema está diseñado exclusivamente para "Inventario Permanente" (contabilización inmediata de CMV y Compras a Mercaderías). No existe lógica para "Diferencia de Inventario" (Periódico).
*   **RT6:** La distorsión en el AxI de cuentas de movimiento (Compras) se debe a que son tratadas como cuentas de Resultado (Pérdida) estándar, sin mecanismo de refundición al costo.

## 2. Mapa del Módulo Inventario

### 2.1 Archivos Principales
| Componente | Archivo / Path | Responsabilidad |
|------------|---------------|-----------------|
| **Página Principal** | `src/pages/Planillas/InventarioBienesPage.tsx` | Dashboard, Tabs (Productos, Movimientos), Lógica UI. |
| **Modal Producto** | `src/pages/Planillas/components/ProductModal.tsx` | ABM Productos. **Foco del bug de stock inicial.** |
| **Modal Movimiento** | `src/pages/Planillas/components/MovementModal.tsx` | Registro de Compras/Ventas manuales. Toggle de asiento. |
| **Storage / Service** | `src/storage/bienes.ts` | **Core Logic.** CRUD, generación de asientos, cálculo de costos. |
| **Tipos** | `src/core/inventario/types.ts` | Interfaces (`BienesProduct`, `BienesMovement`, `BienesSettings`). |
| **Costeo** | `src/core/inventario/costing.ts` | Motor de cálculo FIFO, LIFO, PPP (PMP). |
| **Lógica Cierre** | `src/core/inventario/closing.ts` | Fórmulas de CMV periódico y asientos de ajuste de cierre. |

### 2.2 Modelo de Datos
*   **Persistencia:** Dexie (IndexedDB). Tablas `bienesProducts`, `bienesMovements`.
*   **Identificación:**
    *   `periodId` (string, ej: "2024"): Filtro global por año.
    *   Relación: `Movement` -> `Product` (via `productId`).
    *   Link Contable: `linkedJournalEntryIds` (array de strings) en `BienesMovement`.

### 2.3 Métodos de Costeo
Confirmados en `src/core/inventario/costing.ts`:
1.  **PPP** (`calculateWeightedAverageCost`) - *Promedio Ponderado*.
2.  **FIFO** / PEPS (Consumo por capas - layers).
3.  **LIFO** / UEPS.

---

## 3. Generación de Asientos Contables

### 3.1 Flujo Actual (Inventario Permanente)
La lógica reside en `src/storage/bienes.ts`, función `buildJournalEntriesForMovement`.
*   **Compras:** Se imputan a `Mercaderias` (Activo) vs Proveedores/Caja.
    *   *Bloqueante para modo Periódico:* No permite imputar a cuenta de movimiento "Compras".
*   **Ventas:** Genera 2 asientos:
    1.  Venta + IVA (Resultado + Pasivo).
    2.  CMV vs Mercaderías (Resultado + Activo) - *Calculado según método de costeo elegido.*

### 3.2 Diagnóstico del Bug: Alta de Producto con Stock Inicial
**Causa Raíz:**
En `src/storage/bienes.ts`, la función `createBienesProduct`:
1.  Recibe `openingQty` y `openingUnitCost`.
2.  Guarda estos datos en el objeto `Product`.
3.  **NO invoca** `createBienesMovement` ni `createEntry`.
4.  El motor de costeo (`costing.ts`) lee `openingQty` y crea una capa virtual de costo, pero el módulo contable ignora esta existencia inicial.

**Solución Técnica:**
Refactorizar `createBienesProduct` para que, si `openingQty > 0`:
1.  Cree el producto.
2.  Invoque internamente `createBienesMovement` con tipo `ADJUSTMENT` (o uno nuevo `INITIAL_STOCK`) y `autoJournal: true`.

---

## 4. Cierre de Inventario y RT6

### 4.1 Estado del Tab "Cierre"
*   Usa `src/core/inventario/closing.ts`.
*   Calcula CMV por diferencia: $CMV = EI + Compras - EF$.
*   Genera un asiento de ajuste de "Variación de Existencias" para igualar stock teórico vs físico.
*   **Faltante:** No realiza refundición de cuentas de movimiento "Compras" (porque hoy se asume que todo va al Activo).

### 4.2 Integración con RT6
**Problema:** Cuenta "Compras" apareciendo como pérdida.
*   Archivo: `src/core/cierre-valuacion/monetary-classification.ts`.
*   Clasificación: "Compras" es detectada como `NON_MONETARY` (correcto para reexpresión).
*   **Falla:** El sistema la trata como una cuenta de Resultado final.
*   **Solución para Modo Diferencias:**
    *   Las cuentas del rubro "Movimiento de Mercaderías" (Compras, Bonif, Devol) deben reexpresarse, pero **no exponerse** en el Estado de Resultados final.
    *   Deben refundirse en el asiento de costo de ventas al cierre.

---

## 5. Recomendación de Diseño: Soporte Híbrido

Para soportar **"INVENTARIO_PERMANENTE"** (actual default) y **"DIFERENCIAS_DE_INVENTARIO"** (nuevo requerimiento), recomiendo:

### 5.1 Nuevo Setting Global
En `BienesSettings` (`src/core/inventario/types.ts`):
```typescript
type InventoryMode = 'PERMANENT' | 'PERIODIC'; // "Diferencia"
interface BienesSettings {
    mode: InventoryMode; 
    // ...existentes
}
```

### 5.2 Adaptación de Flujos (Tabla Comparativa)

| Acción | Modo Permanente (Actual) | Modo Periódico (Nuevo) |
|--------|--------------------------|------------------------|
| **Compra** | Debe: `Mercaderías` | Debe: `Compras` (Cuenta de Movimiento gpo 5) |
| **Venta** | Asiento Venta + **Asiento CMV** | Asiento Venta (**SIN asiento CMV**) |
| **Cierre** | Ajuste diferencias Stock (Físico vs Teórico) | Asiento de Refundición de Costo: <br> Debe: `CMV` <br> Debe: `Mercaderías` (EF) <br> Haber: `Mercaderías` (EI) <br> Haber: `Compras` (Saldo reexpresado) |

### 5.3 Mapeo de Cuentas
No se requiere hardcoding. Usar el sistema actual de `ACCOUNT_FALLBACKS` en `src/storage/bienes.ts` agregando:
*   `compras` (Resultados de Movimiento)
*   `mercaderias` (Activo)

---

## 6. Inventario de Archivos a Tocar (Impacto)

1.  `src/core/inventario/types.ts`
    *   Agregar `mode: 'PERMANENT' | 'PERIODIC'` a `BienesSettings`.
2.  `src/storage/bienes.ts`
    *   **Fix Bug:** Modificar `createBienesProduct` para generar movimiento inicial.
    *   Modificar `buildJournalEntriesForMovement`:
        *   Si `mode === 'PERIODIC'` y es Compra -> Usar cuenta Compras.
        *   Si `mode === 'PERIODIC'` y es Venta -> **Omitir** asiento de CMV.
3.  `src/pages/Planillas/components/ProductModal.tsx`
    *   Agregar feedback visual de que se generará un asiento por el stock inicial.
4.  `src/storage/seed.ts` (o similar donde se definan defaults)
    *   Inicializar settings con modo default.
5.  `src/core/inventario/closing.ts`
    *   Agregar lógica para generar asiento de refundición (Costo por diferencia) si el modo es Periódico.

---

## 7. Plan de Pruebas y Aceptación

### Casos de Prueba Manual
1.  **Bug Fix Alta:** Crear Producto con stock 10 a $100.
    *   *Verificación:* Ir a Libro Diario. Debe existir asiento: `Mercaderías 1000 a Capital/Apertura 1000` (o contrapartida definida).
2.  **Modo Diferencias - Compra:**
    *   Activar `DIFERENCIAS_DE_INVENTARIO`.
    *   Registrar Compra.
    *   *Verificación:* Asiento DEBE imputar a cuenta "Compras", NO a "Mercaderías".
3.  **Modo Diferencias - Venta:**
    *   Registrar Venta.
    *   *Verificación:* Solo genera asiento de Venta (Ingreso). NO genera asiento de Costo.
4.  **Cierre RT6:**
    *   Ejecutar cierre con movimientos de Compras.
    *   *Verificación:* RT6 reexpresa las compras mes a mes. El asiento de costo final absorbe el saldo de la cuenta "Compras". La cuenta "Compras" queda saldada (saldo 0) tras el cierre.

---

## 8. Resumen de Hallazgos (Checklist Final)

*   [x] Bug stock inicial confirmado: `createBienesProduct` no invoca capa contable.
*   [x] Motor de costeo actual soporta FIFO/LIFO/PPP correctamente.
*   [x] Arquitectura actual fuertemente acoplada a "Inventario Permanente".
*   [x] "Compras" en RT6 se distorsiona por falta de refundición.
*   [x] Falta setting global `mode` en `BienesSettings`.
*   [x] Falta lógica de asiento "Compra" vs "Mercadería" según modo.
*   [x] Falta lógica para omitir CMV en ventas (Modo Periódico).
*   [x] Persistencia en Dexie es adecuada y extensible.
*   [x] Tipos contables en `monetary-classification` correctos, el problema es el flujo.
*   [ ] (A futuro) Evaluar migraciones de datos si se cambia de modo con saldo existente.
