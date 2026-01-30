# Auditoría Técnica: Circuito RT6 e Inventario

## A) Mapa de Archivos Responsables

El circuito de Reexpresión (RT6) y su conexión con Inventario atraviesa los siguientes archivos clave:

### 1. Generación de Partidas RT6
*   **`src/core/cierre-valuacion/auto-partidas-rt6.ts`**:
    *   **Función**: `autoGeneratePartidasRT6`
    *   **Responsabilidad**: Analiza el Libro Mayor, identifica cuentas imputables, agrupa movimientos por mes (Lotes) y calcula el `importeBase` (neto de devoluciones).
    *   **Lógica Clave**: Diferencia "Bienes de Cambio" de otras cuentas. Detecta cuentas de orden inverso (ej. Bonif s/Compras) correctamente como `ACTIVO` pero con saldo negativo (si se procesan correctamente los débitos/créditos).

### 2. Generación de Asientos Contables
*   **`src/core/cierre-valuacion/asientos.ts`** (o similar en `entry-generation.ts`):
    *   **Función**: `generateCierreDrafts` / `buildVoucher`
    *   **Responsabilidad**: Transforma las partidas calculadas (V. Homogéneo - V. Origen = RECPAM) en asientos borradores.
    *   **Hallazgo Crítico**: **Lógica de signos incorrecta**. Actualmente asume que un RECPAM positivo siempre implica un DÉBITO en la cuenta (Aumento de Activo). Esto es incorrecto para Pasivos, Patrimonio Neto y Resultados Positivos, donde un RECPAM positivo (aumento nominal por inflación) debería ser un CRÉDITO.

### 3. Módulo de Inventario
*   **`src/pages/Planillas/InventarioBienesPage.tsx`**: UI principal. Maneja la solapa "Conciliaciones" (`reconciliation`).
*   **`src/core/inventario/types.ts`**: Definiciones de `BienesMovement`, `InventoryMovement`.
*   **`src/core/inventario/costing.ts`**: Motor de costos (FIFO/LIFO/PPP).
    *   **Hallazgo Crítico**: El motor de costos **ignora movimientos con cantidad 0**. No existe soporte nativo para "Ajustes de Valor puros" (Revalúo por inflación sin cambio de stock físico).

---

## B) Diagnóstico de Brechas (Gaps)

### 1. Inversión de Signos en Asientos RT6 (Pasivos/PN)
**Severidad**: Alta (Error Contable).
**Descripción**: El generador de asientos (`buildVoucher`) utiliza el valor absoluto del RECPAM y decide DÉBITO/CRÉDITO basándose únicamente en si el resultado es positivo o negativo, asumiendo comportamiento de Activo.
*   **Ejemplo Fallido**: Un Ajuste de Capital (Patrimonio Neto) con saldo acreedor de $1.000 y coef 2.0 genera un RECPAM de +$1.000. El sistema actual genera un **DÉBITO** en Ajuste de Capital (disminuyéndolo) y CRÉDITO en RECPAM (Ganancia), cuando debería ser al revés (CRÉDITO en Ajuste de Capital, DÉBITO en RECPAM).
*   **Impacto**: Estados contables distorsionados.

### 2. Desconexión entre RT6 e Inventario
**Severidad**: Media (Falta de Funcionalidad).
**Descripción**:
*   Los asientos generados por RT6 tienen `source: 'cierre'` y no contienen metadatos específicos (`inventoryRole`, `period`) que faciliten su identificación unívoca por el módulo de Inventario.
*   En la conciliación, estos asientos aparecen como "Asientos sin movimiento" o requieren conciliación manual ad-hoc.
*   No hay mecanismo automático para reflejar este mayor valor en las "Capas de Costo" del inventario.

### 3. Motor de Costos no soporta Revalúo (Value-Only Adjustment)
**Severidad**: Media/Alta.
**Descripción**:
*   `costing.ts` filtra explícitamente movimientos con `quantity <= 0` (salvo ventas/salidas).
*   Para reflejar el RECPAM en el costo de mercadería vendida (CMV) futuro (FIFO), es necesario incrementar el costo unitario de las capas existentes o agregar una capa de valor, pero el sistema actual no lo permite sin alterar el stock.

---

## C) Modelos de Datos (Actuales vs Necesarios)

**Actual (`BienesMovement`)**:
```typescript
interface BienesMovement {
    type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT';
    quantity: number; // Siempre afecta stock físico
    unitCost?: number;
    total: number; // Vinculado a quantity * unitCost
}
```

**Necesario (Propuesta)**:
Incorporar `VALUE_ADJUSTMENT`:
```typescript
type BienesMovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'VALUE_ADJUSTMENT';

// Permitir en costing.ts que quantity sea 0 si type es VALUE_ADJUSTMENT
// El 'total' representaría el monto del ajuste (RECPAM).
```

---

## D) Propuesta de Implementación Mínima

### Paso 1: Corregir Generación de Asientos (Backend Logic)
Modificar `src/core/cierre-valuacion/asientos.ts`:
1.  **Bucketización Inteligente**: Al separar partidas en "RT6 Positivo/Negativo", calcular el **Impacto en Resultado** (Ganancia/Pérdida) considerando el `normalSide` de la cuenta.
    *   Activo (Debito) + RECPAM Positivo = Ganancia (RECPAM Haber).
    *   Pasivo (Credito) + RECPAM Positivo = Pérdida (RECPAM Debe).
2.  **Build Voucher**: Usar el `normalSide` para determinar el lado de la cuenta principal.
    *   Si `normalSide === 'CREDIT'` y el ajuste es positivo -> Imputar al HABER.

### Paso 2: Metadatos para Conciliación
En `generateCierreDrafts`, al crear el asiento (o su metadata), inyectar:
```json
metadata: {
  "sourceModule": "rt6_inventory", // O algún flag identificable
  "inventoryAccountCode": "...",
  "period": "YYYY-MM"
}
```
Esto permitirá que `InventarioBienesPage` detecte estos asientos automáticamente.

### Paso 3: Soporte de "Ajuste de Valor" en Inventario
1.  **Extender Tipos**: Agregar `VALUE_ADJUSTMENT` a `BienesMovementType`.
2.  **Actualizar Costing**:
    *   Modificar `calculateProductValuation` y `calculateWeightedAverageCost`.
    *   Si `type === 'VALUE_ADJUSTMENT'`, sumar el importe al `totalValue` (numerador) sin modificar `currentStock` (denominador).
    *   Esto aumentará automáticamente el `averageCost` (PPP).
    *   *Nota*: Para FIFO exacto es más complejo (habría que prorratear en capas), pero para una implementación mínima, imputarlo como un costo general del periodo o prorratearlo en el stock total es aceptable como primera aproximación.

### Paso 4: UX de Conciliación
En la tabla de Conciliación (`InventarioBienesPage`), cuando se detecte un asiento con metadata RT6 no conciliado:
*   Mostrar acción sugerida: "**Crear Ajuste de Valuación (RT6)**".
*   Al hacer click, crear un `BienesMovement` tipo `VALUE_ADJUSTMENT` por el monto del asiento, con cantidad 0, y vincularlos automáticamente.

---

## E) Checklist de QA

1.  **Prueba de Signos (Pasivos/PN)**:
    *   [ ] Crear una cuenta de Capital (PN, Acreedora) con saldo inicial $100.
    *   [ ] Ejecutar RT6 (Coef 2.0). RECPAM esperado: $100.
    *   [ ] Verificar borrador de asiento: Debe decir **CRÉDITO a Capital $100** y **DÉBITO a RECPAM $100**. (Fix del Paso 1).

2.  **Prueba de Signos (Activo con Devolución)**:
    *   [ ] Crear Activo con Compra $1000 y Devolución $100 (Saldo $900).
    *   [ ] Verificar partida RT6: Importe Base $900.
    *   [ ] Asiento: DÉBITO Activo (o ajuste) y CRÉDITO RECPAM.

3.  **Flujo Inventario**:
    *   [ ] Generar los asientos de RT6.
    *   [ ] Ir a Inventario -> Conciliación.
    *   [ ] Verificar que aparezca el asiento de ajuste.
    *   [ ] Usar la acción (si se implementa) o verificar manual.
    *   [ ] Confirmar que la Valuación del Stock ($) aumentó pero la Cantidad (Q) se mantuvo igual.
