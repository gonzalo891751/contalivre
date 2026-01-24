# Diagnóstico Técnico: Funcionalidad RT6 Automática (ContaLivre)

**Fecha:** 24/01/2026
**Objetivo:** Volver funcional el rediseño del Paso 2 (RT6) con cálculo automático e integración al Mayor.

## 1. Resumen Ejecutivo
El módulo actual de `CierreValuacion` es operativamente **manual**. Si bien la lógica matemática de reexpresión (RT6) y valuación (RT17) es correcta, carece de conexión con los datos contables reales (Libro Mayor).
*   **Gap Crítico:** No existe una capa de servicio que transforme "Asientos" en "Saldos por Cuenta" para el cierre.
*   **Clasificación:** La lógica actual (`classification.ts`) solo infiere Rubros y Grupos (Activo/Pasivo), pero no distingue partidas Monetarias de No Monetarias.
*   **Persistencia:** El estado se guarda en un objeto monolítico `CierreValuacionState`, lo cual es adecuado para el alcance actual pero necesitará adaptadores para guardar overrides de usuario.

## 2. Mapa de Archivos y Componentes

| Componente / Archivo | Ubicación | Responsabilidad Actual | Cambio Requerido |
| :--- | :--- | :--- | :--- |
| **Page Principal** | `src/pages/Planillas/CierreValuacionPage.tsx` | Orquestador, State Owner. Carga `db.entries` crudo. | Delegar la carga de datos a un hook `useLedgerBalances`. |
| **Panel RT6** | `src/pages/Planillas/components/Step2RT6Panel.tsx` | Renderiza partidas manuales `PartidaRT6`. | Aceptar partidas "Sugeridas" con flag de revisión. |
| **Lógica Core** | `src/core/cierre-valuacion/calc.ts` | Matemáticas de ajuste y coeficientes. | Sin cambios mayores. |
| **Clasificación** | `src/core/cierre-valuacion/classification.ts` | Infiere `ACTIVO`/`PASIVO` por código. | **Nuevo:** Lógica `isMonetary(account)`. |
| **Store** | `src/storage/db.ts` | Base de datos IndexedDB. | **Nuevo:** Store para `AccountSettings` (overrides). |

## 3. Fuente de Verdad Contable (Data Flow)

**Estado Actual:**
1.  `useLiveQuery` en `CierreValuacionPage` trae **todos** los asientos (`db.entries.toArray()`).
2.  No hay puntero a "Mayor" (saldos acumulados).

**Propuesta (Arquitectura):**
Implementar un hook `useLedgerBalances(closingDate)`:
1.  **Input:** `allEntries` (ya disponible).
2.  **Proceso:**
    *   Filtrar líneas por `date <= closingDate`.
    *   Agrupar por `accountId`.
    *   Calcular `balance` final.
    *   Retornar Map: `AccountId -> { balance, movements[], lastMovementDate }`.
3.  **Output:** Fuente para alimentar tanto el paso de RT6 (No monetarias) como el de RECPAM (Monetarias).

## 4. Plan de Cuentas y Clasificación

La entidad `Account` (`src/core/models.ts`) tiene el campo `kind` ('ASSET', 'LIABILITY', 'EQUITY', etc.).

**Estrategia de Clasificación (Monetaria vs No Monetaria):**
No existe un campo explícito `isMonetary`. Se debe inferir y permitir override.

1.  **Reglas por Defecto (Hardcoded/Heurística):**
    *   **Monetarias:** `account.kind` Assets con códigos típicos de "Caja y Bancos" (1.1.01), "Créditos" (salvo previsiones), Deudas en moneda nacional.
    *   **No Monetarias:** "Bienes de Uso", "Inversiones" (acciones), "Patrimonio Neto", "Resultados".

2.  **Implementación Sugerida:**
    Crear `src/core/cierre-valuacion/monetary-classification.ts`:
    ```typescript
    export function getInitialClassification(account: Account): 'MONETARY' | 'NON_MONETARY' {
        // Lógica de inferencia basada en Rubros conocidos
        if (account.code.startsWith('1.1.01')) return 'MONETARY'; // Disponibilidades
        if (account.group === 'Bienes de Uso') return 'NON_MONETARY';
        // ...Fallback:
        return 'MONETARY'; // Ante la duda, es más seguro asumir monetario (revisión humana necesaria)
    }
    ```

## 5. RECPAM: Método Indirecto

El cálculo actual es manual (`recpamInputs`).
Para automatizar el **Método Indirecto** (comprobación del RECPAM global):

**Fórmula:**
`RECPAM = (Posición Monetaria Neta Promedio) * (Tasa Inflación)`

**Requerimiento de Datos:**
Necesitamos `useLedgerBalances` pero con granularidad mensual (saldos al cierre de cada mes del ejercicio).
*   **Posición Monetaria Neta (PMN):** Suma de saldos de todas las cuentas clasificadas como `MONETARY`.
*   **Cálculo:** Iterar por cada mes `i` del ejercicio:
    *   `PMNk = Σ SaldosMonetarios(mes_k)`
    *   `RECPAM_k = PMNk * (Coef_k - 1)`
    *   `RECPAM_Total = Σ RECPAM_k`

## 6. Fecha de Origen (Partidas No Monetarias)

Para automatizar la creación de `PartidaRT6`:

**Desafío:** Una cuenta (ej: "Muebles y Útiles") tiene saldo $100.000, compuesto por múltiples altas.
**Estrategias:**
1.  **Opción A (Simple - MVP):** Tomar fecha de **último movimiento significativo** o fecha de **apertura de ejercicio** (si viene de arrastre).
2.  **Opción B (Antiguación):** Analizar los movimientos del período (DEBE).
    *   Si saldo inicial = 0, y hay 1 compra: Fecha origen = Fecha compra.
    *   Si hay múltiples movimientos: Crear múltiples "Lotes" dentro de la `PartidaRT6` (ya soportado por `items: LotRT6[]`).

**Recomendación MVP:**
Implementar **Opción B** automática.
*   Si la cuenta tiene saldo inicial > 0 -> Lote 1: "Saldo Inicio" (Fecha: Inicio Ejercicio).
*   Movimientos DEBE del período -> Lotes adicionales (Fecha: Fecha movimiento).

## 7. Persistencia de Overrides

El usuario debe poder corregir:
1.  Si una cuenta es Monetaria o No Monetaria.
2.  La fecha de origen sugerida.

**Modelo de Datos (Guardar en `CierreValuacionState.overrides`):**
```typescript
interface AccountOverrides {
    [accountId: string]: {
        classification?: 'MONETARY' | 'NON_MONETARY';
        manualOriginDate?: string; // Si el usuario clava una fecha única
        exclude?: boolean; // Ignorar cuenta
    }
}
```

## 8. Checklist de Implementación

### Fase 1: Data Fetching & Classification
- [ ] Implementar `src/hooks/useLedger.ts` (Agrupación de movimientos por cuenta).
- [ ] Crear `src/core/cierre-valuacion/auto-classification.ts` (Lógica de inferencia).
- [ ] Actualizar `CierreValuacionState` para incluir `accountOverrides`.

### Fase 2: Integración UI (Step 2)
- [ ] Agregar botón "🪄 Calcular Automáticamente" en `Step2RT6Panel`.
- [ ] Al hacer click:
    1.  Traer saldos.
    2.  Filtrar Non-Monetary.
    3.  Generar `PartidaRT6` por cada cuenta con saldo.
    4.  Generar `items` (lotes) basados en movimientos.
    5.  Calcular ajuste.
    6.  Reemplazar/Mezclar con `state.partidasRT6`.

### Fase 3: RECPAM Automático
- [ ] Implementar cálculo de PMN mensual en `calc.ts`.
- [ ] Mostrar comparativa en UI: "RECPAM Estimado (Manual)" vs "RECPAM Calculado (Ledger)".

## 9. Criterios de Aceptación (QA)

1.  **Importación:** Al entrar, si la tabla está vacía, debe sugerir importar datos del Mayor.
2.  **Clasificación:** Las cuentas de "Bienes de Uso" deben aparecer automáticamente en Step 2. Las de "Caja" NO deben aparecer.
3.  **Fechas:** Una compra de Bien de Uso en Marzo debe tener fecha origen Marzo y coeficiente correspondiente.
4.  **Persistencia:** Si cambio una cuenta a "No Monetaria", debe recordarlo para el próximo cierre (o al menos recálculo).
