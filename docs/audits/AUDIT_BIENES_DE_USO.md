# Auditoría y Diagnóstico: Módulo Bienes de Uso (Fixed Assets)

## 1. Resumen Ejecutivo
El objetivo es implementar la gestión de **Bienes de Uso** integrando el prototipo existente al sistema contable real.
Actualmente, existe una página "Planilla de Amortizaciones" (`AmortizacionesPage.tsx`) que funciona como una calculadora aislada (tool) guardando su estado en un blob único (`amortizationState`).
La implementación real requiere migrar de este "estado de herramienta" a un modelo de datos relacional (`fixedAssets` table) integrado con el Plan de Cuentas, el Diario y el motor de ajuste RT6.

## 2. Mapa de Arquitectura

### A. Routing y Navegación
- **Definición de rutas:** `src/App.tsx`
  - Ruta propuesta: `/operaciones/bienes-uso`
- **Menú Lateral:** `src/ui/Layout/Sidebar.tsx`
  - Agregar item bajo el grupo "Operaciones", similar a "Inventario".

### B. Estado Global y Periodo
- **Manejo de Periodo:** `src/hooks/usePeriodYear.ts`
  - Persiste en localStorage (`contalivre_period_year`).
  - Expone `year`, `start`, `end`.
- **Impacto:** Los bienes existen a través de los periodos, pero las amortizaciones y revalúos son operaciones anuales vinculadas al `periodId` activo.

### C. Storage (Base de Datos)
- **Tecnología:** Dexie.js (IndexedDB wrapper).
- **Definición:** `src/storage/db.ts`
- **Estado Actual:**
  - Existe `amortizationState` (blob JSON único) usado por la herramienta actual.
  - **NO existe** tabla de `fixedAssets` o `bienesUso`.
  - Existe `bienesProducts` pero es exclusiva para "Bienes de Cambio" (Inventario).
- **Requerimiento:** Crear nueva tabla `fixedAssets` en `db.ts` (versión 10).

### D. Plan de Cuentas
- **Definición:** `src/storage/accounts.ts`
- **Creación de Cuentas:** Funciones `createAccount` y `generateNextCode` permiten autogenerar subcuentas.
- **Códigos Clave (Seed):**
  - **Rubro:** 1.2.01 (Bienes de uso)
  - **Rodados:** 1.2.01.04
  - **Amort. Acum. Rodados:** 1.2.01.94 (Contra-cuenta)
- **Estrategia:** Al crear un bien "Toyota Hilux", el sistema debe:
  1. Buscar el padre (ej. Rodados 1.2.01.04).
  2. Generar siguiente código libre (ej. 1.2.01.04.01).
  3. Crear la cuenta contable automáticamente.

### E. Motor de Asientos (Journal)
- **Definición:** `src/storage/entries.ts` y `src/core/models.ts`.
- **Generación:** Existe un patrón robusto en `src/storage/bienes.ts` (`buildJournalEntries...`) que debe replicarse.
- **Validación:** El sistema ya valida balance Debe/Haber.

### F. RT6 (Ajuste por Inflación)
- **Índices:** Se almacenan en `CierreValuacionState` dentro de `db.ts`.
- **Cálculo:** `src/core/cierre-valuacion/calc.ts` contiene la lógica `calculateCoef` y `getIndexForPeriod`.
- **Integración:** El switch "Moneda Homogénea" debe leer estos índices y aplicar `costo_origen * (indice_cierre / indice_origen)`.

### G. Planilla Existente
- **Ubicación:** `src/pages/Planillas/AmortizacionesPage.tsx`
- **Estado:** Es funcional pero aislada.
- **Reuso:** Se puede reutilizar la lógica de cálculo (`src/core/amortizaciones/calc.ts`) y la vista de "Anexo" para el reporte, pero el almacenamiento debe migrar a la nueva tabla.

## 3. Propuesta de Modelo de Datos (`FixedAsset`)

```typescript
interface FixedAsset {
  id: string;
  name: string;             // Nombre/Detalle (ej: Toyota Hilux)
  periodId: string;         // Periodo de alta (para filtros)
  
  // Clasificación
  category: string;         // "Rodados", "Muebles y Utiles" (Rubro)
  accountId: string;        // ID de la cuenta de Activo (autogenerada o seleccionada)
  contraAccountId: string;  // ID de la cuenta de Amort. Acumulada
  
  // Valores Históricos
  acquisitionDate: string;  // Fecha de alta/origen
  originalValue: number;    // Valor de origen
  
  // Amortización
  method: 'lineal-year' | 'lineal-month' | 'none';
  lifeYears: number;        // Vida útil en años
  residualValuePct: number; // % Valor residual (ej: 0%, 5%)
  
  // Estado
  status: 'active' | 'sold' | 'amortized';
  
  // RT6 / Revalúo
  rt6_enabled: boolean;     // Switch individual o global
  
  // Control
  createdAt: string;
  updatedAt: string;
  linkedJournalEntryId?: string; // ID del asiento de amortización del ejercicio actual
}
```

## 4. Plan de Implementación

### Fase 1: Core & Storage
1.  **Migración DB:** Actualizar `src/storage/db.ts` a versión 10 agregando tabla `fixedAssets`.
2.  **Store:** Crear `src/storage/fixedAssets.ts` con CRUD básico.
3.  **Accounts Helper:** Crear utilidad en `src/lib/assetAccounts.ts` para buscar/crear cuentas de Activo y Amort. Acum. automáticamente.

### Fase 2: UI & Integración
4.  **Página Principal:** Crear `src/pages/Operaciones/BienesUsoPage.tsx` (basada en el prototipo HTML existente).
5.  **Formulario de Alta:** Implementar modal de creación que:
    - Pida datos del bien.
    - Ofrezca "Autogenerar cuentas" (checkbox).
    - Guarde en `fixedAssets`.
6.  **Switch RT6:** Conectar el switch de la UI con `CierreValuacionState.indices` para mostrar valores reexpresados en tiempo real (solo visualización inicialmente).

### Fase 3: Lógica Contable
7.  **Cálculo Amortización:** Adaptar `src/core/amortizaciones/calc.ts` para usar el nuevo modelo `FixedAsset`.
8.  **Generación de Asientos:** Implementar `generateAmortizationEntry(asset, year)` que cree el asiento:
    - Debe: Amortización Bienes de Uso (Resultado Negativo)
    - Haber: Amort. Acum. [Bien] (Regularizadora de Activo)

## 5. Archivos Afectados (Lista de Candidatos)

- `src/storage/db.ts` (Schema update)
- `src/storage/fixedAssets.ts` (NEW)
- `src/pages/Operaciones/BienesUsoPage.tsx` (NEW)
- `src/App.tsx` (Route)
- `src/ui/Layout/Sidebar.tsx` (Menu)
- `src/core/amortizaciones/types.ts` (Update model)

## 6. Riesgos y Dependencias
- **Indices Faltantes:** Si el usuario no cargó índices en "Cierre de Valuación", el cálculo RT6 fallará o dará 1.0. Se debe manejar el caso `index=undefined`.
- **Cuentas Duplicadas:** La autogeneración debe verificar colisiones de nombre/código robustamente.
- **Migración:** Los datos cargados en la "Planilla de Amortizaciones" vieja (`AmortizacionesPage`) NO se migrarán automáticamente en este alcance (quedan como herramienta legado o se migran manualmente).

