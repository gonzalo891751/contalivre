# AUDIT_CIERRE_INVENTARIO.md

## Resumen ejecutivo
El módulo de Cierre de Inventario en modo "Diferencias" (Periódico) calcula el Costo de Mercaderías Vendidas (CMV) utilizando la fórmula algebraica básica ($EI + Compras - EF_{fisica}$), lo que provoca que **toda diferencia de inventario (faltante/sobrante) sea absorbida automáticamente por el CMV**, sin segregarse en una cuenta de resultado específica. No existe un paso de cálculo de "Existencia Final Teórica" dentro de la generación de asientos periódicos, impidiendo la determinación contable de diferencias de stock y distorsionando el margen bruto real.

## Alcance y supuestos
*   **Alcance:** Módulo de Bienes de Cambio, específicamente el tab "Cierre" y la lógica de generación de asientos en modo `PERIODIC`.
*   **Supuestos:** El sistema debe comportarse como un sistema periódico estándar donde $CMV = EI + Compras - EF_{teorica}$ y la diferencia se ajusta contra $EF_{fisica}$.
*   **Estado actual:** El sistema asume que $EF_{fisica}$ es el único valor de cierre válido para la ecuación de costo.

## Mapa de archivos y responsabilidades

| Archivo | Ruta Relativa | Responsabilidad |
| :--- | :--- | :--- |
| **UI Principal** | `src/pages/Planillas/InventarioBienesPage.tsx` | Orquestador del tab Cierre. Captura $EF_{fisica}$, calcula `cmvPorDiferencia` para la UI y llama al generador de asientos. |
| **Lógica de Cierre** | `src/core/inventario/closing.ts` | Contiene `calculateCMV` y `generatePeriodicClosingEntries`. Genera los 3 asientos contables del modelo periódico. |
| **Definiciones** | `src/core/inventario/types.ts` | Define `DEFAULT_ACCOUNT_CODES` y estructuras de datos. |
| **Configuración** | `src/pages/Planillas/InventarioBienesPage.tsx` | Define `BIENES_ACCOUNT_RULES` para la clasificación (buckets) de cuentas. |

## Flujo actual de cálculo

1.  **Carga de Datos (UI):**
    *   Calcula `EI` (Saldo contable al inicio o fallback).
    *   Calcula `ComprasNetas` (Suma de saldos de cuentas de movimiento: Compras + Gastos - Bonif - Devol).
    *   Calcula `EF_Teorica` (KPI `stockValue` basado en movimientos).
    *   Usuario ingresa `EF_Fisica` (input manual `closingPhysicalValue`).

2.  **Cálculo Previo (UI):**
    *   Si hay input físico: `EF_Efectivo = EF_Fisica`.
    *   Fórmula UI: `cmvPorDiferencia = EI + ComprasNetas - EF_Efectivo`.

3.  **Generación de Asientos (`closing.ts`):**
    *   Recibe `EI`, `ComprasNetas`, `EF_Fisica`.
    *   **Paso 1:** Refundición de subcuentas (Gastos/Bonif) contra cuenta `Compras`.
    *   **Paso 2:** Transferencia `Compras` (netas) a `Mercaderías`.
        *   Saldo `Mercaderías` pasa a ser $EI + ComprasNetas$.
    *   **Paso 3:** Determinación CMV.
        *   Calcula $CMV = EI + ComprasNetas - EF_{fisica}$.
        *   Asiento: `Debe CMV / Haber Mercaderías` por ese monto.
        *   **Resultado implícito:** Saldo final `Mercaderías` forzado a $EF_{fisica}$.

## Fuentes de datos

| Concepto | Fuente de Datos | Tipo |
| :--- | :--- | :--- |
| **Existencia Inicial (EI)** | Ledger (`getAccountBalanceByCode`) al `periodStart` | Contable (Saldo) |
| **Compras** | Ledger (Suma de movimientos en `yearRange`) | Contable (Flujo) |
| **Gastos s/Compras** | Ledger (Suma de movimientos) | Contable (Flujo) |
| **Bonif/Devol s/Compras** | Ledger (Suma de movimientos) | Contable (Flujo) |
| **Existencia Final (EF)** | Input de usuario (`closingPhysicalValue`) | Manual (Físico) |
| **EF Teórica** | `kpis.stockValue` (suma de valuación actual de productos) | Extracontable (Motor Stock) |

## Clasificación de cuentas (buckets)

Definido en `BIENES_ACCOUNT_RULES` (`InventarioBienesPage.tsx`):

*   **Mercaderías:** `1.1.04.01`, keywords: 'mercader', 'stock'.
*   **Compras:** `4.8.01`, `5.1.03`, keywords: 'compra'.
*   **CMV:** `4.3.01`, `5.1.01`, keywords: 'cmv', 'costo mercader'.
*   **Gastos s/Compras:** `4.8.02`, `5.1.04`, keywords: 'gasto', 'flete' (Opcional).
*   **Bonif s/Compras:** `4.8.03`, `5.1.05` (Contra-cuenta).
*   **Devol s/Compras:** `4.8.04`, `5.1.06` (Contra-cuenta).

*Riesgo:* La clasificación depende fuertemente de `settings.accountMappings`. Si una cuenta no está mapeada ni cae en la heurística, sus saldos **no entran en la fórmula de Compras Netas**, distorsionando el CMV.

## Auditoría de signos

*   El sistema usa valores absolutos (`Math.abs`) para obtener los saldos de las cuentas de movimiento (`gastosCompras`, `bonifCompras`, etc.) en `InventarioBienesPage.tsx`.
*   Luego aplica la lógica de signos en la fórmula:
    *   `ComprasNetas = Compras + Gastos - Bonif - Devol`.
*   Esto es correcto asumiendo que las cuentas tienen su saldo natural ("normal side").
*   **Riesgo:** Si una cuenta de Bonificaciones tiene saldo deudor (error de carga), el `Math.abs` la tratará como saldo normal acreedor y la restará igual, ocultando el error contable.

## Sección específica del bug: "Diferencia de inventario se incorpora al CMV"

El problema reside en que **no existe lógica de diferencia** en el modo periódico.

En `src/core/inventario/closing.ts`:

```typescript
// L249: La fórmula usa directamente la EF recibida (Física)
const cmv = existenciaInicial + comprasNetas - existenciaFinal

// L316: Genera el asiento por el total calculado
entries.push({
    memo: `Cierre periodico ${periodLabel} - Determinacion CMV`,
    lines: [
        { accountId: cmvId, debit: cmv, credit: 0, description: 'CMV...' },
        { accountId: mercaderiasId, debit: 0, credit: cmv, description: 'Mercaderias...' },
    ],
})
```

Al usar la `existenciaFinal` (Física) para despejar el CMV, cualquier diferencia de inventario se convierte matemáticamente en costo.
*   Si falta mercadería ($EF_{fisica} < EF_{teorica}$), el CMV calculado aumenta.
*   Si sobra mercadería ($EF_{fisica} > EF_{teorica}$), el CMV calculado disminuye.

No se utiliza en ningún momento la `EF_teorica` para calcular un "CMV Teórico" y segregar la variación.

## Validación con caso numérico

**Datos de prueba:**
*   EI: $0
*   Compras Netas: $4.000.000
*   EF Teórica (según sistema): $1.680.000
*   EF Física (reconto): $1.650.000
*   Diferencia Real: -$30.000 (Pérdida/Faltante)

**Cálculo Esperado (Correcto):**
1.  $CMV_{teorico} = 0 + 4.000.000 - 1.680.000 = \mathbf{2.320.000}$
2.  $Dif_{inv} = 1.650.000 - 1.680.000 = \mathbf{-30.000}$
3.  Asiento CMV: Debe CMV 2.320.000 / Haber Mercaderías 2.320.000
4.  Asiento Dif: Debe Dif.Inv 30.000 / Haber Mercaderías 30.000
5.  Saldo Final Mercaderías: $4.000.000 - 2.320.000 - 30.000 = 1.650.000$ (Coincide con Físico)

**Cálculo Actual del Sistema (Incorrecto):**
1.  Fórmula: $CMV = 0 + 4.000.000 - 1.650.000 (Fisica)$
2.  Resultado CMV: **2.350.000**
3.  Asiento único: Debe CMV 2.350.000 / Haber Mercaderías 2.350.000
4.  Saldo Final Mercaderías: $4.000.000 - 2.350.000 = 1.650.000$

**Conclusión:** El sistema reporta $2.350.000 de costo. Escondió los $30.000 de pérdida por robo/rotura dentro del costo de la mercadería vendida.

## Checklist de riesgos

*   [x] **Mezcla de conceptos:** Pérdidas operativas (robos) se reportan como costo de ventas, afectando el margen bruto y decisiones de precios.
*   [x] **Modo Permanente vs Periódico:** El modo Permanente (`InventarioBienesPage.tsx` L1420) **SÍ** calcula diferencia. La inconsistencia de lógica entre modos es alta.
*   [ ] **Doble impacto:** No hay doble impacto contable (el balance cierra), pero la exposición es errónea.
*   [x] **Filtros de fechas:** El cálculo de Compras depende de `getAccountBalanceByCode` en un rango. Si hay movimientos fuera de fecha (backdated) después de un cierre, alterarán el saldo de Compras para el próximo cierre si no se controlan los cierres definitivos.

## Conclusión y recomendaciones

**Qué está bien:**
*   La refundición de cuentas de movimiento (Compras, Gastos, etc.) es correcta y sigue el estándar argentino.
*   La identificación de cuentas mediante configuración y heurística es robusta.

**Qué está mal:**
*   La fórmula de CMV en `closing.ts` es demasiado simplista para un cierre con inventario físico.
*   Falta la entrada de datos de "EF Teórica" en la función generadora de asientos.

**Recomendaciones (Cambios propuestos):**

**Prioridad P0 (Crítico):**
1.  Modificar la firma de `generatePeriodicClosingEntries` en `closing.ts` para aceptar `existenciaFinalTeorica` además de la física.
2.  Actualizar la fórmula interna:
    *   $CMV = EI + ComprasNetas - EF_{teorica}$
    *   $Diferencia = EF_{fisica} - EF_{teorica}$
3.  Agregar un 4to paso en la generación de asientos:
    *   Si $Diferencia \neq 0$: Generar asiento contra cuenta "Diferencia de Inventario" (o resultado por tenencia/variación).
4.  Actualizar `InventarioBienesPage.tsx` para pasar el valor de `kpis.stockValue` como `existenciaFinalTeorica` a la función de cierre.

**Prioridad P1:**
*   Agregar validación de cuenta "Diferencia de Inventario" en la configuración (actualmente existe en types pero no se valida en cierre periódico).

---

## Apéndice: Fragmentos de código

`src/core/inventario/closing.ts`:
```typescript
// L249: Cálculo que absorbe la diferencia
const cmv = existenciaInicial + comprasNetas - existenciaFinal

// ...
// L316: Asiento único de CMV
if (Math.abs(cmv) > 0.01) {
    entries.push({
        memo: `Cierre periodico ${periodLabel} - Determinacion CMV`,
        lines: [
            { accountId: cmvId, debit: cmv, credit: 0, description: 'CMV...' },
            { accountId: mercaderiasId, debit: 0, credit: cmv, description: 'Mercaderias...' },
        ],
    })
}
```

