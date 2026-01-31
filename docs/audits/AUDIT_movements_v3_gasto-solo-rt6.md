# Auditoría: Movimientos "Solo Gasto" identificados erróneamente como RT6 y sin asiento

**Fecha:** 31/01/2026  
**Auditor:** Gemini CLI Agent  
**Archivo:** `docs/audits/AUDIT_movements_v3_gasto-solo-rt6.md`

## 1. Resumen Ejecutivo
La funcionalidad de "Solo Gasto" (gastos accesorios sin stock físico) en el modal de movimientos (V3) está fallando críticamente. Al seleccionar "Capitalizar (Stock)", el sistema clasifica el movimiento como `VALUE_ADJUSTMENT`. Este tipo está reservado/hardcodeado en la lógica actual para "Ajustes RT6" (Inflación), lo que provoca dos efectos adversos:
1.  **Visual:** En el Kardex se etiqueta incorrectamente como "AJUSTE RT6", confundiendo al usuario.
2.  **Contable:** El generador de asientos ignora explícitamente los movimientos `VALUE_ADJUSTMENT` (asumiendo que provienen de un asiento manual previo), por lo que **no se genera el asiento contable** de la compra/gasto.
**Severidad:** ALTA (Pérdida de integridad contable y confusión en reportes).

## 2. Expected vs Actual

| Característica | Comportamiento Esperado ("Solo Gasto" Capitalizable) | Comportamiento Actual (Bug) |
| :--- | :--- | :--- |
| **Tipo interno** | `PURCHASE` (o un subtipo específico como `EXPENSE_CAP`) | `VALUE_ADJUSTMENT` |
| **Cantidad** | 0 | 0 |
| **Value Delta** | Monto del gasto (o N/A si es Purchase) | Monto del gasto |
| **Etiqueta UI** | "GASTO S/COMPRA" o "COMPRA (SOLO GASTO)" | **"AJUSTE RT6"** |
| **Asiento** | **GENERADO** (Debe Mercaderías / Haber Proveedores) | **NO GENERADO** (Silenciosamente ignorado) |
| **Impacto Stock** | Suma valor, mantiene unidades | Suma valor, mantiene unidades |

## 3. Trazabilidad End-to-End

1.  **UI (Input):** Usuario confirma modal en `MovementModalV3.tsx`.
    *   *Input:* `isSoloGasto = true`, `capitalizar = true`.
2.  **Construcción Payload (`MovementModalV3.tsx`):**
    *   Lógica condicional evalúa `gastosCapitalizables > 0`.
    *   **Fallo:** Asigna `type: 'VALUE_ADJUSTMENT'`.
3.  **Persistencia (`src/storage/bienes.ts` -> `createBienesMovement`):**
    *   Recibe el objeto con `type: 'VALUE_ADJUSTMENT'`.
    *   Verifica flag `autoJournal: true`.
    *   Llama a `buildJournalEntriesForMovement`.
4.  **Generación Asiento (`src/storage/bienes.ts` -> `buildJournalEntriesForMovement`):**
    *   **Fallo:** Bloque `if (movement.type === 'VALUE_ADJUSTMENT')` retorna `{ entries: [] }` inmediatamente.
    *   *Motivo:* Asume que todo `VALUE_ADJUSTMENT` es un ajuste por inflación que ya tiene asiento origen.
5.  **Resultado Final:**
    *   Movimiento se guarda en DB sin `linkedJournalEntryIds`.
    *   Kardex (`InventarioBienesPage.tsx`) lee `type: 'VALUE_ADJUSTMENT'` y renderiza etiqueta hardcodeada "AJUSTE RT6".

## 4. Auditoría de tipos y reglas de enrutamiento

El tipo de movimiento se decide en `src/pages/Planillas/components/MovementModalV3.tsx` (Línea ~660):

```typescript
// Lógica actual causante del bug
const movementType: BienesMovementType = formData.isSoloGasto
    ? (gastosCapitalizables > 0 ? 'VALUE_ADJUSTMENT' : 'PURCHASE') // <--- AQUÍ EL ERROR
    : (mainTab === 'compra' ? 'PURCHASE' : 'SALE')
```

*   **Criterio actual:** Si es solo gasto y capitaliza -> `VALUE_ADJUSTMENT`.
*   **Conflicto:** `VALUE_ADJUSTMENT` está sobrecargado. Se usa para:
    1.  Ajuste por Inflación (RT6) -> Origen: Asiento manual -> No genera asiento nuevo.
    2.  Gasto Capitalizable (Nuevo V3) -> Origen: Modal -> **DEBE** generar asiento.

## 5. Auditoría del "asiento no generado"

Ubicación: `src/storage/bienes.ts`, función `buildJournalEntriesForMovement`.

```typescript
// buildJournalEntriesForMovement
// ...
// VALUE_ADJUSTMENT: no journal entry (the RT6 asiento already exists)
if (movement.type === 'VALUE_ADJUSTMENT') {
    return { entries: [] } // <--- CORTOCIRCUITO FATAL PARA GASTOS
}
// ...
```

Este bloque asume incorrectamente que *ningún* `VALUE_ADJUSTMENT` requiere generación automática de asientos.

## 6. Evidencia

**Archivo:** `src/pages/Planillas/components/MovementModalV3.tsx`
*Asignación del tipo incorrecto*
```typescript
const movementType: BienesMovementType = formData.isSoloGasto
    ? (gastosCapitalizables > 0 ? 'VALUE_ADJUSTMENT' : 'PURCHASE')
    : (mainTab === 'compra' ? 'PURCHASE' : 'SALE')
```

**Archivo:** `src/storage/bienes.ts`
*Bloqueo de generación de asiento*
```typescript
const buildJournalEntriesForMovement = async (...) => {
    // ...
    // VALUE_ADJUSTMENT: no journal entry (the RT6 asiento already exists)
    if (movement.type === 'VALUE_ADJUSTMENT') {
        return { entries: [] }
    }
    // ...
}
```

**Archivo:** `src/pages/Planillas/InventarioBienesPage.tsx` (Inferido por búsqueda)
*Etiquetado visual erróneo*
```typescript
// Mapeo probable en constante de configuración de UI
VALUE_ADJUSTMENT: { label: 'Ajuste RT6', color: 'bg-violet-50 text-violet-700' }
```

## 7. Matriz de escenarios

| ID | Escenario | Input (Type/Qty/Cap) | Type Resultante | Asiento Gen.? | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A | Compra normal | PURCHASE / >0 / N/A | PURCHASE | SI | OK |
| B | Compra c/Bonif | PURCHASE / >0 / N/A | PURCHASE | SI | OK |
| C | Compra c/Desc Fin | PURCHASE / >0 / N/A | PURCHASE | SI | OK |
| D | Compra + Gastos Cap | PURCHASE / >0 / ON | PURCHASE | SI | OK |
| E | Solo Gasto (No Cap) | PURCHASE / 0 / OFF | PURCHASE | SI | OK |
| **F** | **Solo Gasto (Cap)** | **PURCHASE / 0 / ON** | **VALUE_ADJUSTMENT** | **NO** | **FAIL** |
| G | Venta normal | SALE / >0 / N/A | SALE | SI | OK |
| H | Ajuste Stock (Físico) | ADJUSTMENT / +/- / N/A | ADJUSTMENT | SI | OK |
| I | Ajuste RT6 (Manual) | VALUE_ADJUSTMENT / 0 / N/A | VALUE_ADJUSTMENT | NO (Correcto) | OK |

## 8. Hipótesis de causa raíz

1.  **Reutilización Semántica Incorrecta (Top 1):** Se reutilizó el tipo `VALUE_ADJUSTMENT` para "Gasto Capitalizable" pensando en que ambos son "cambios de valor sin cambio de cantidad", sin considerar que `VALUE_ADJUSTMENT` ya tenía lógica de negocio acoplada (ignorar asientos, etiqueta RT6).
2.  **Falta de Distinción de Origen:** El sistema de almacenamiento (`storage/bienes.ts`) no distingue si un `VALUE_ADJUSTMENT` viene de una carga manual (Gasto) o de un proceso de cierre (RT6).
3.  **Hardcoding en UI:** La etiqueta "AJUSTE RT6" está pegada directamente al enum `VALUE_ADJUSTMENT` en el frontend, sin verificar subtipos o notas.

## 9. Recomendación de fix (Draft)

**Opción P0 (Mínima Invasión - Recomendada):**
Cambiar el tipo de movimiento que genera el modal para "Solo Gasto Capitalizable".

1.  En `MovementModalV3.tsx`, forzar que "Solo Gasto" sea siempre `PURCHASE`, incluso si capitaliza.
2.  Asegurar que el backend (`createBienesMovement`) sepa manejar `PURCHASE` con `quantity: 0` y `subtotal > 0` correctamente (esto ya parece estar soportado parcialmente o requiere ajuste mínimo en validaciones).
    *   *Si `PURCHASE` con qty 0 rompe validaciones:* Crear un nuevo tipo `CAPITALIZATION` o usar `ADJUSTMENT` con metadata específica.
    *   *Pero lo más limpio:* Si es una compra de servicios/fletes activables, conceptualmente es `PURCHASE`.

**Opción P1 (Mejora Estructural):**
Si se decide mantener `VALUE_ADJUSTMENT` para gastos capitalizables:
1.  Agregar campo `subType` o `origin` al movimiento (`'RT6'` vs `'EXPENSE'`).
2.  En `storage/bienes.ts`: Permitir generar asiento si `type === 'VALUE_ADJUSTMENT' && origin === 'EXPENSE'`.
3.  En UI: Cambiar label según `origin`.
