# Auditoría y Plan de Implementación: Bienes de Uso V2

**Fecha:** 3 de Febrero 2026
**Objetivo:** Auditar el estado actual del módulo de Bienes de Uso y diseñar la solución técnica para los gaps detectados: Asiento de Apertura, Eventos (Mejoras/Bajas), Integración con Planilla y RT6 Real.

## 1. Resumen Ejecutivo

El módulo actual (`/operaciones/bienes-uso`) permite el CRUD básico y el cálculo de amortizaciones del ejercicio, pero opera como una "isla". No se conecta con el Libro Diario al inicio (falta asiento de apertura), no maneja eventos de vida útil (mejoras/bajas) contablemente, y la planilla oficial (`/planillas/amortizaciones`) usa una base de datos separada (legacy). La funcionalidad RT6 es meramente visual y no impacta en la contabilidad.

El plan propone unificar todo bajo la entidad `FixedAsset` como única fuente de verdad, implementar un modelo de eventos robusto, y generar asientos automáticos para cada fase del ciclo de vida del bien.

## 2. Hallazgos y Estado Actual

| Componente | Estado | Ubicación | Problema / Hallazgo |
| :--- | :--- | :--- | :--- |
| **Storage Core** | ✅ Funcional | `src/storage/fixedAssets.ts` | CRUD y `calculateFixedAssetDepreciation` funcionan bien. Falta lógica de apertura y eventos. |
| **Planilla Oficial** | ⚠️ Legacy | `src/pages/Planillas/AmortizacionesPage.tsx` | Lee de `db.amortizationState` (blob separado). No ve los bienes cargados en Operaciones. |
| **Asiento Apertura** | ❌ Faltante | - | Bienes preexistentes no figuran en el Diario/Balance. Falta lógica `syncOpeningEntry`. |
| **Eventos** | ❌ Placeholder | `src/pages/Operaciones/BienesUsoPage.tsx` | Tab "Eventos" dice "Próximamente". No hay modelo de datos. |
| **RT6** | ⚠️ Mock/Visual | `src/pages/Operaciones/BienesUsoPage.tsx` | Solo aplica un multiplicador visual (`calculateRT6Value`). No genera asientos ni usa la lógica central de `cierre-valuacion`. |

## 3. GAP A: Asiento de Apertura

Para que los bienes dados de alta aparezcan en el Balance Inicial del ejercicio, se requiere un asiento de apertura automático si la fecha de alta es anterior al inicio del ejercicio actual.

### Diseño Técnico
1.  **Función**: `syncFixedAssetOpeningEntry(asset: FixedAsset, fiscalYear: number)` en `src/storage/fixedAssets.ts`.
2.  **Lógica**:
    *   Si `asset.acquisitionDate` < `fiscalYearStart`:
        *   Calcular `amortAcumulada` al inicio del ejercicio (usando `calculateFixedAssetDepreciation` con `fiscalYear - 1`).
        *   Generar asiento:
            *   **Debe**: Cuenta del Activo (Valor Origen).
            *   **Haber**: Cuenta Amort. Acumulada (Valor calculado).
            *   **Haber**: Cuenta "Apertura / Saldos Iniciales" (Diferencia = Valor Residual al inicio).
3.  **Idempotencia**:
    *   Agregar campo `openingJournalEntryId` a `FixedAsset`.
    *   Si ya existe, actualizar el asiento.
4.  **Cuentas**:
    *   Activo/AmortAcum: Tomar de `asset.accountId` / `asset.contraAccountId`.
    *   Apertura: Buscar cuenta tipo `EQUITY` con tag `opening_balance` o usar cuenta puente configurada (ej: `3.2.01`).

## 4. GAP B: Eventos (Mejoras, Revalúo, Bajas)

Se necesita un historial de cambios que afecten la valuación y generen asientos.

### Modelo de Datos (`db.ts`)
Crear tabla `fixedAssetEvents`:
```typescript
interface FixedAssetEvent {
  id: string
  assetId: string
  date: string
  type: 'IMPROVEMENT' | 'REVALUATION' | 'DISPOSAL' | 'DAMAGE'
  amount: number // Costo de la mejora, o valor de venta, o nuevo valor
  contraAccountId?: string // Caja/Banco (Mejora/Venta) o Reserva (Revalúo)
  notes?: string
  linkedJournalEntryId?: string // Asiento generado
}
```

### Lógica Contable
*   **Mejora (`IMPROVEMENT`)**:
    *   Impacto: Aumenta `originalValue` del bien (o se maneja como "sub-componente").
    *   Asiento: Debe Activo / Haber Caja/Proveedores.
    *   *Nota*: Recalcular amortización desde fecha evento.
*   **Baja/Venta (`DISPOSAL`)**:
    *   Impacto: `status` = 'sold'/'scrapped'. `disposalDate` = event.date.
    *   Asiento:
        *   Debe: Caja/Deudores (Precio Venta).
        *   Debe: Amort. Acumulada (Saldo al momento).
        *   Haber: Activo (Valor Origen).
        *   Diferencia: Resultado Venta de Bienes de Uso.
*   **Revalúo (`REVALUATION`)**:
    *   Impacto: Ajusta Valor Origen sin flujo de fondos.
    *   Asiento: Debe Activo / Haber Saldo Revalúo (PN).

## 5. GAP C: Unificación de Planilla

Eliminar el "doble comando". La planilla `/planillas/amortizaciones` debe ser una **vista** de `db.fixedAssets`.

### Plan de Migración
1.  **Refactor**: Modificar `AmortizacionesPage.tsx`.
2.  **Source**: Reemplazar `useLiveQuery(() => db.amortizationState...)` por `useLiveQuery(() => getAllFixedAssets(period))`.
3.  **Mapping**:
    *   Adaptar `calculateAllRows` para aceptar `FixedAsset[]`.
    *   Mapear campos: `rubro` -> `category`, `vidaUtil` -> `lifeYears`.
4.  **Anexo**: Mantener la lógica de agrupación por Rubro (Inmuebles, Rodados, etc.) que ya tiene la página, es muy valiosa.
5.  **Legacy**: Agregar botón "Importar Legacy" que lea el blob viejo y cree los `FixedAsset` reales si el usuario lo desea (one-off migration).

## 6. GAP D: RT6 Real

Integración real con el módulo de Ajuste por Inflación.

### Estrategia
1.  **Reutilizar Indices**: Leer `db.cierreValuacionState` para obtener índices FACPCE.
2.  **Cálculo**:
    *   Implementar `calculateRT6Adjustment(asset, period)` en `storage/fixedAssets.ts`.
    *   Lógica: `ValorOrigen * (IndiceCierre / IndiceOrigen)`.
3.  **Asientos (RECPAM)**:
    *   Generar asiento de ajuste al cierre (similar a Inventory).
    *   **Debe**: Cuenta Activo (Aumento por inflación).
    *   **Haber**: RECPAM (Resultado).
    *   *Importante*: El asiento de amortización anual debe calcularse sobre el valor ajustado.
4.  **UX**:
    *   Toggle "Generar Ajuste RT6" en el detalle del bien.
    *   Mostrar preview del asiento antes de guardar.

## 7. Plan de Implementación

### Fase 1: Hardening Contable (Gap A)
*   [ ] Modificar `src/core/fixedAssets/types.ts`: agregar `openingJournalEntryId`.
*   [ ] Modificar `src/storage/fixedAssets.ts`: implementar `syncFixedAssetOpeningEntry`.
*   [ ] UI: Agregar botón "Regenerar Asiento Apertura" en detalle del bien (o automático al guardar).

### Fase 2: Planilla Unificada (Gap C)
*   [ ] Refactorizar `AmortizacionesPage.tsx` para leer de `fixedAssets`.
*   [ ] Adaptar cálculos de anexo.
*   [ ] Verificar que los totales coincidan.

### Fase 3: Eventos (Gap B)
*   [ ] Agregar tabla `fixedAssetEvents` en `db.ts`.
*   [ ] Crear UI de "Nuevo Evento" en tab Eventos.
*   [ ] Implementar generadores de asientos para Mejora y Venta.

### Fase 4: RT6 (Gap D)
*   [ ] Conectar con `cierre-valuacion` store.
*   [ ] Implementar `buildRT6JournalEntries` para Bienes de Uso.

## 8. Archivos Clave a Tocar

*   `src/storage/fixedAssets.ts` (Core logic)
*   `src/core/fixedAssets/types.ts` (Models)
*   `src/storage/db.ts` (Schema update)
*   `src/pages/Operaciones/BienesUsoPage.tsx` (UI Eventos & RT6)
*   `src/pages/Planillas/AmortizacionesPage.tsx` (Refactor total)
*   `src/core/amortizaciones/calc.ts` (Adaptar a nuevos tipos)
