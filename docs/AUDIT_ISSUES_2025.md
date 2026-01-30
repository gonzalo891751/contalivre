# Audit Report: Issues 2025

### Resumen Ejecutivo
Se han inspeccionado 3 issues críticos en el flujo contable.
(1) **Fechas**: Causa confirmada por uso de `new Date(ISOString)` y UTC-3, provocando "día anterior" al guardar asientos.
(2) **Estado de Resultados**: La fórmula de Ventas Netas es correcta en código, pero la clasificación de "Descuentos Obtenidos" (que debe ir a Financieros) depende de un mapeo de cuentas que debe reforzarse.
(3) **RT6**: La lógica actual solo iteraba movimientos de la cuenta principal (Mercaderías, saldo 0), omitiendo cuentas de movimiento (Compras) necesarias para la reexpresión por actividad.

---

## Issue 1 — Fecha -1 Inventario → Asiento

### Evidencia
- `src/storage/entries.ts` (helper `getTodayISO`, `createEntry`).
- `src/core/inventario/closing.ts` (campo `updatedAt` usando `new Date().toISOString()`).
- `src/ui/MobileAsientosGrid.tsx` (componente visual de asientos, parseo local).
- `src/storage/fx.ts` (patrón recurrente `new Date().toISOString().split('T')[0]`).

### Causa Probable
El sistema usa `new Date().toISOString()` que genera una fecha en **UTC**.
Al consumirse en Argentina (GMT-3):
- Una fecha `2025-07-30` (string) convertida a Date asume `00:00 UTC`.
- Al mostrarse/guardarse ajustada a zona horaria local (-3h), pasa a `2025-07-29 21:00`.
- El formato final `YYYY-MM-DD` toma el día 29.

### Fix Mínimo Propuesto
- [ ] En `createEntry` (o su llamada desde Inventario), usar una función `getLocalDateISO()` que respete la zona horaria del usuario en lugar de UTC directo.
- [ ] Reemplazar `new Date().toISOString().split('T')[0]` por una utilidad que use `toLocaleDateString('sv-SE')` (ISO like) o Librería de fechas (Dayjs) configurada en UTC-3.
- [ ] Asegurar que el input de fecha manual en `Inventario` se pase como string "YYYY-MM-DD" puro sin conversión a Date Object intermedio.

---

## Issue 2 — Estado Resultados (Ventas netas + Descuentos obtenidos)

### Dónde se arma hoy
- `src/domain/reports/estadoResultados.ts`: Función `buildEstadoResultados`.
- `src/core/inventario/closing.ts`: Función `generatePeriodicClosingEntries` y `calculateVentasNetas`.

### Qué está mal
- El reporte `estadoResultados.ts` clasifica correctamente `Descuentos obtenidos` en `resultadosFinancieros` (si el nombre coincide con el fuzzy match), pero el usuario reporta que aparecen en Ventas Netas.
- Probable causa: El plan de cuentas tiene rubros `Descuentos obtenidos` asignados incorrectamente al grupo `4.1 Ventas` en lugar de `4.6 Financieros` en la base de datos (`statementGroup`).
- Riesgo de que `generatePeriodicClosingEntries` en `closing.ts` esté inyectando el asiento de cierre neto usando una cuenta equivocada.

### Regla Correcta Requerida
$$ \text{Ventas Netas} = \text{Ventas} - \text{Devoluciones s/ventas} - \text{Bonificaciones s/ventas} $$
- **Descuentos obtenidos** (Compras) $\to$ **Resultados Financieros y Tenencia** (o Costo Financiero).

### Fix Mínimo Propuesto
- [ ] En `src/domain/reports/estadoResultados.ts`, forzar explícitamente que cualquier cuenta con código `4.6.*` vaya a `Resultados Financieros`, con prioridad sobre el `statementGroup`.
- [ ] Revisar `src/storage/seed.ts` y asegurar que la cuenta `Descuentos obtenidos` tenga `statementGroup: 'FINANCIAL_INCOME'`.
- [ ] En `src/core/inventario/closing.ts`, verificar que `accounts.bonifVentasId` NO esté apuntando a la cuenta de "Descuentos obtenidos".
- [ ] Validación UI: Alertar si el usuario intenta mapear una cuenta de tipo "Ingreso Financiero" dentro de los conceptos de "Ventas Netas".

---

## Issue 3 — RT6 Bienes de cambio: incluir movimientos

### Dónde se sugiere hoy
- `src/core/cierre-valuacion/auto-partidas-rt6.ts`: Función `autoGeneratePartidasRT6`.
- `src/core/cierre-valuacion/auto-partidas-rt6.ts`: Función `generateLotsFromMovements`.

### Por qué faltan
- La lógica actual itera las cuentas y mira `balance.movements` de **esa misma cuenta**.
- Mercaderías (Cuenta Patrimonial) en inventario periódico no tiene movimientos mensuales (solo EI y EF/Ajuste).
- Las cuentas de "Compras", "Gastos s/Compras" (Resultados) tienen la actividad mensual, pero:
  - Son cuentas de Resultados.
  - A veces quedan con saldo 0 por refundición.
  - El sistema las clasifica en la pestaña "Resultados" (o las omite si saldo=0 y lógica estricta), no junto a "Bienes de Cambio".

### Modelo Mínimo de “lotes por mes”
(Pseudo-TS para estructura de datos propuesta)
```typescript
interface LotSource {
  accountId: string; // ID de Compras/Gastos
  period: string;    // "2025-07"
  amount: number;    // Suma de débitos del mes
}

// En autoGeneratePartidasRT6:
// 1. Detectar cuentas "Vinculadas a Inventario" (Compras, Gastos, etc).
// 2. Agrupar sus movimientos por mes usando generateLotsFromMovements.
// 3. Inyectar estos lotes DENTRO de la PartidaRT6 de "Mercaderías".
```

### Fix Mínimo Propuesto
- [ ] En `src/core/cierre-valuacion/imports.ts` o config, definir array de `inventoryInputAccounts` (Compras, Gastos, Bonif compra).
- [ ] Modificar `autoGeneratePartidasRT6` para que, al procesar la cuenta "Mercaderías" (`1.2.01`), busque las cuentas vinculadas.
- [ ] Extraer los movimientos de esas cuentas vinculadas (incluso si su saldo final es 0).
- [ ] Agregar esos movimientos como `items` (Lotes) dentro de la partida de Mercaderías, con su fecha de origen mensual y valor original.

---

## Checklist de Aceptación
- [ ] Al crear asiento desde Inventario el 30/07, la fecha en el Diario es 30/07.
- [ ] Estado de Resultados muestra "Ventas Netas" limpia de Descuentos Financieros.
- [ ] "Descuentos Obtenidos" aparece bajo "Resultados Financieros y Tenencia".
- [ ] En RT6 > Paso 2 > No Monetarias > Bienes de Cambio: Aparecen lotes mensuales correspondientes a las Compras del ejercicio.

## Archivos a Tocar Luego
- `src/storage/entries.ts`
- `src/core/inventario/closing.ts`
- `src/domain/reports/estadoResultados.ts`
- `src/core/cierre-valuacion/auto-partidas-rt6.ts`
- `src/core/cierre-valuacion/monetary-classification.ts`
