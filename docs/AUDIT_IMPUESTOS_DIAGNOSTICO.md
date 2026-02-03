# AUDITORÍA / DIAGNÓSTICO MÓDULO IMPUESTOS (ContaLivre)

## 1. Resumen Ejecutivo
*   **Estado General:** El módulo es funcional para un caso base (cuentas default), pero **crítico** para usuarios que personalizaron su Plan de Cuentas o configuración de Inventario.
*   **Hallazgo Principal:** El cálculo de impuestos (`src/storage/impuestos.ts`) utiliza **cuentas hardcodeadas** (fallbacks) y **ignora** completamente el mapeo de cuentas configurado en el módulo de Inventario (`BienesSettings`). Esto causa que el IVA DF/CF y percepciones den 0 o sean incorrectos si el usuario cambió las cuentas.
*   **Sincronización:** La detección de cambios funciona vía `useLiveQuery`, pero la lógica de limpieza de asientos borrados (`refreshCalculations`) depende de que `bulkGet` devuelva valores nulos, lo cual es correcto pero frágil si no se manejan bien los tiempos de la transacción.
*   **Percepciones:** Clasificación débil basada en cuentas default. Si el usuario usa cuentas propias para percepciones, el sistema no las detecta.
*   **Vencimientos:** Generación de notificaciones propensa a duplicados por `uniqueKey` dependiente de textos variables (títulos) en lugar de IDs estables.

## 2. Arquitectura y Fuentes de Datos

### Flujo de Datos
1.  **Movimientos (Origen):** `db.bienesMovements` (Ventas/Compras).
2.  **Contabilidad (Intermedio):** `db.entries` (Asientos generados por `bienes.ts`).
3.  **Cálculo (Agregador):** `src/storage/impuestos.ts` lee `db.entries` para IVA y `db.bienesMovements` para Percepciones/Alicuotas.
4.  **Estado (Persistencia):** `db.taxClosures` guarda la "foto" del cierre (totales, pasos, IDs de asientos generados).
5.  **UI:** `ImpuestosPage` consume datos vía `useTaxClosure`.

### Rutas Clave
*   **Cálculo Core:** `src/storage/impuestos.ts` (`calculateIVAFromEntries`, `getRetencionesPercepciones`).
*   **Hook de Estado:** `src/hooks/useTaxClosure.ts`.
*   **Tipos:** `src/core/impuestos/types.ts`.
*   **Generación de Asientos (Inventario):** `src/storage/bienes.ts` (`buildJournalEntriesForMovement`).

## 3. Reglas de Cálculo Actuales

*   **IVA Posición Mensual:**
    *   Se suman los saldos de las cuentas de IVA DF (`2.1.03.01`) y IVA CF (`1.1.03.01`).
    *   Fórmula: `Saldo = (Haber DF - Debe DF) - (Debe CF - Haber CF) - Pagos a Cuenta`.
    *   *Problema:* Solo busca por esos códigos o nombres exactos.

*   **Pagos a Cuenta (Retenciones/Percepciones):**
    *   Se escanean `bienesMovements` buscando líneas de impuestos (`kind: 'PERCEPCION' | 'RETENCION'`).
    *   Se intenta determinar si es "Sufrida" o "Practicada" basado en el tipo de movimiento (Purchase vs Sale).
    *   También escanea `paymentSplits` buscando coincidencias con cuentas de retención hardcodeadas.

*   **IIBB:**
    *   Base Sugerida: Suma de `subtotal` de ventas del mes en `bienesMovements`.
    *   Impuesto: Cálculo manual en UI (Base * Alícuota).
    *   Deducciones: Suma de percepciones IIBB detectadas.

*   **Vencimientos:**
    *   Se generan/actualizan al cargar el hook `useTaxClosure`.
    *   Se guardan en `db.taxDueNotifications`.

## 4. Hallazgos y Bugs Detectados

### A) IVA DF no descuenta devoluciones (CRÍTICO)
*   **Evidencia:** `src/core/impuestos/iva.ts` usa la lógica `(line.credit - line.debit)` para IVA DF. Matemáticamente es correcto (si hay devolución, hay débito, el saldo neto baja).
*   **Causa Raíz:** El problema no es la fórmula, sino **qué cuenta se está leyendo**. Si `bienes.ts` genera el asiento de devolución usando la cuenta configurada en settings (ej: `2.1.03.99`), pero `impuestos.ts` solo lee la default (`2.1.03.01`), el débito de la devolución **se ignora**. El sistema ve el DF bruto (de las ventas normales) pero no resta las devoluciones porque están en una cuenta "invisible" para el módulo de impuestos.

### B) Sincronización al borrar asientos (Stale Cache)
*   **Evidencia:** `useTaxClosure` recalcula todo cuando cambia `entriesVersion`.
*   **Causa Raíz:** Aunque el recálculo se dispara, la lógica de `getGeneratedEntriesForClosure` depende de encontrar asientos con `sourceId` específico. Si el asiento se borra físicamente, desaparece de la lista. El problema es visual: si la UI de `AsientosTab` no maneja arrays vacíos reactivamente o si el `closure.journalEntryIds` queda sucio apuntando a un ID inexistente, el usuario ve un estado inconsistente hasta que se refresca manualmente.

### C) Percepciones mal clasificadas
*   **Evidencia:** `getRetencionesPercepciones` en `src/storage/impuestos.ts`.
*   **Causa Raíz:** Dependencia excesiva de `resolveFallbackAccountId`. Si el usuario crea una cuenta "Percepción IIBB Misiones" y la usa en una compra, el sistema no la reconoce como "Percepción IIBB" porque solo busca la cuenta default `1.1.03.02` (Anticipos de impuestos).
*   **Impacto:** El usuario carga las percepciones en la factura pero no aparecen en la liquidación de IIBB.

### D) Vencimientos duplicados
*   **Evidencia:** `createDefaultNotification` genera `uniqueKey` usando el título.
*   **Causa Raíz:** Si el título cambia (ej: de "Pago IVA" a "Pago IVA Enero"), se genera una nueva notificación en lugar de actualizar la existente.
*   **Solución:** La `uniqueKey` debe ser determinística: `OBLIGACION:PERIODO:ACCION` (ej: `IVA:2026-02:PAGO`).

### E) Jurisdicciones IIBB
*   **Estado:** La lista incluye CORRIENTES.
*   **Observación:** Probablemente el mecanismo de detección de la provincia por defecto (desde Company Settings) falla por normalización de strings o diferencias de formato (ej: "Corrientes" vs "Provincia de Corrientes").

## 5. Plan de Corrección

### Paso 1: Centralizar Resolución de Cuentas (Shared Logic)
Crear `src/core/accounts/resolver.ts` que unifique la lógica de `bienes.ts` e `impuestos.ts`.
*   Debe aceptar `BienesSettings` como input opcional.
*   Debe priorizar: Mapping Configurado > Match por Código > Match por Nombre > Fallback.

### Paso 2: Refactorizar `src/storage/impuestos.ts`
*   Inyectar `loadBienesSettings` en todas las funciones de cálculo.
*   Reemplazar `resolveFallbackAccountId` por la nueva lógica centralizada.
*   Esto arreglará automágicamente el Bug A (IVA DF) y C (Percepciones) al leer las cuentas correctas.

### Paso 3: Hardening de Vencimientos
*   Modificar `createDefaultNotification` para forzar una `uniqueKey` estricta sin textos variables.
*   Limpiar notificaciones duplicadas existentes (migración on-the-fly).

### Paso 4: Sincronización de Asientos
*   Reforzar `refreshCalculations` en `useTaxClosure`. Asegurar que si un ID en `closure.journalEntryIds` no existe en `db.entries`, se elimine del objeto `closure` inmediatamente y se persista el cambio.

## 6. Plan de Pruebas

| Caso de Prueba | Datos de Entrada | Resultado Esperado |
| :--- | :--- | :--- |
| **IVA Custom** | Configurar cuenta IVA DF = `2.1.03.99`. Generar venta. | Impuestos debe leer saldo de `2.1.03.99`. |
| **Devolución** | Venta $100 + IVA $21. Devolución $50 + IVA $10.5. | IVA DF Neto = $10.5 (21 - 10.5). |
| **Percepción IIBB** | Compra con Percepción IIBB en cuenta custom. | Aparece en Tab IIBB como deducción. |
| **Borrar Asiento** | Generar asiento IVA. Borrarlo desde Libro Diario. | Tab Asientos queda vacío y estado "Borrador". |
| **Vencimientos** | Entrar al módulo varias veces. | No se duplican las cards de vencimiento. |

## 7. Archivos a Modificar

1.  `src/core/impuestos/types.ts` (Fix uniqueKey logic)
2.  `src/storage/impuestos.ts` (Implementar settings loading & account resolution)
3.  `src/hooks/useTaxClosure.ts` (Mejorar cleanup de asientos borrados)
4.  `src/core/impuestos/iva.ts` (Solo verificación, la lógica parece robusta si recibe los IDs correctos)
