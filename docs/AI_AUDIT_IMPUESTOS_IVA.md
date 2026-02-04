# Auditoría Técnica: Módulo Impuestos (IVA + Pagos)

**Fecha:** 2026-02-03
**Auditor:** AI Staff Engineer
**Estado:** COMPLETADO - GAPS Identificados

---

## 1. Resumen Ejecutivo

La auditoría del módulo de Impuestos ha revelado una **falta crítica de continuidad en el saldo de IVA** (arrastre de saldo a favor) y un **error bloqueante en el flujo de Pagos** relacionado con la configuración de cuentas.

*   **Integridad Contable (IVA):** 🔴 **FALLA**. El sistema calcula la posición mensual aislada, ignorando por completo el saldo a favor del mes anterior. Esto genera asientos incorrectos (duplica saldo a favor o exige pago indebido).
*   **Pagos (Ret/Per):** 🟠 **ERROR**. El flujo de "Registrar Pago" falla controladamente (devuelve error) cuando faltan cuentas contables específicas (Retenciones a depositar), pero esto bloquea al usuario sin una vía clara de corrección en la UI.
*   **Configuración:** Faltan mappings explícitos en la configuración de usuario para cuentas críticas de pasivo fiscal.

---

## 2. Mapa del Flujo Actual

### A. Determinación de IVA (RI)
1.  **Trigger:** `useTaxClosure` detecta cambio de mes.
2.  **Cálculo:** Llama a `calculateIVAFromEntries(month)`.
    *   Lee asientos del mes actual.
    *   Suma Débito Fiscal (2.1.03.01) y Crédito Fiscal (1.1.03.01).
    *   Suma Retenciones/Percepciones sufridas del mes.
    *   **GAP:** No consulta el cierre del mes anterior ni el saldo de la cuenta `1.1.03.06` (IVA a Favor).
3.  **Resultado:** `saldo = DF - CF - PagosACuenta`.
4.  **Asiento:** `generateIVAEntry` crea un asiento que cancela DF/CF y genera `IVA a Pagar` o `IVA a Favor` nuevo.

### B. Pagos y Obligaciones
1.  **Obligaciones:** `listTaxObligationsWithPayments` lista deudas.
2.  **Agentes:** `syncAgentDepositObligations` detecta retenciones practicadas y crea obligación `RET_DEPOSITAR`.
3.  **Pago:** El usuario clickea "Registrar Pago".
4.  **Resolución de Cuentas:** Se intenta resolver la cuenta del pasivo (`resolveTaxLiabilityAccountId`).
    *   Si la cuenta "Retenciones a depositar" no existe o no está mapeada, retorna `null`.
5.  **Falla:** `buildTaxSettlementEntry` retorna error: `"Falta cuenta del pasivo (Retenciones a depositar)"`.

---

## 3. Matriz de Requisitos vs Estado

| Requisito | Estado | Observación |
|:---|:---:|:---|
| (i) Asiento determinación IVA (DF/CF) | ✅ OK | Cancela cuentas transitorias correctamente. |
| (ii) Genera IVA a pagar vs IVA a favor | ✅ OK | Lógica correcta basada en el mes actual. |
| **(iii) Arrastre IVA a favor mes anterior** | 🔴 **MISSING** | **CRÍTICO.** El cálculo ignora el saldo previo. |
| (iv) Pagos a cuenta (Sufridas) | ✅ OK | Se descuentan del impuesto determinado. |
| (v) Ret/Per Practicadas (A depositar) | ✅ OK | Se clasifican como pasivo. |
| (vi) Asiento pago IVA | ✅ OK | Funciona si la cuenta existe. |
| (vii) Asientos depósito retenciones | 🟠 **FAIL** | Falla si falta cuenta `2.1.03.03` o `2.1.03.06`. |
| (viii) Vencimientos/Notificaciones | ✅ OK | Genera alertas correctamente. |
| (ix) Bug Pagos reproducido | ✅ OK | Reproducido en test. Causa: Falta cuenta/mapping. |

---

## 4. Análisis del Bug de Pagos

**Síntoma:** El usuario reporta "tira error" al intentar pagar retenciones/percepciones.
**Causa Raíz:**
El sistema busca las cuentas:
*   `retencionPracticada` (Default: `2.1.03.03` - Retenciones a depositar)
*   `percepcionIVAPracticada` (Default: `2.1.03.06` - Percepciones IVA a terceros)

Si el usuario tiene un Plan de Cuentas antiguo o personalizado donde estas cuentas no existen con esos códigos exactos, y no ha configurado el mapping manual, la resolución falla.

**Evidencia (Test `tests/repro_pagos.test.ts`):**
La función `buildTaxSettlementEntryPreview` retorna un objeto `{ error: 'Falta cuenta del pasivo...' }`. Si la UI no maneja este estado informando al usuario *cómo arreglarlo* (ir a Configuración), se percibe como un error del sistema.

---

## 5. Plan de Corrección (GAPS Priorizados)

### P0 - Implementar Arrastre de Saldo a Favor (IVA)
**Objetivo:** Que la determinación de IVA tome el saldo a favor del cierre anterior.

**Cambios requeridos:**
1.  **`src/storage/impuestos.ts`**:
    *   Modificar `calculateIVAFromEntries` o crear `calculateIVAMonthlyPosition`.
    *   Leer `getTaxClosure(prevMonth)`.
    *   Si `prevClosure.status === 'CLOSED'` y tenía saldo a favor, sumarlo (como crédito) al cálculo actual.
    *   Alternativa contable: Leer saldo de la cuenta `1.1.03.06` al inicio del período.
2.  **`src/core/impuestos/iva.ts`**:
    *   Actualizar `IVATotals` para incluir campo `saldoTecnicoAnterior` o `saldoAFavorAnterior`.
    *   Actualizar fórmula: `saldo = DF - CF - PagosCuenta - SaldoAnterior`.
3.  **`src/storage/impuestos.ts` (Asiento)**:
    *   En `buildIVAEntryData`, si hay `saldoAnterior`, acreditar la cuenta `1.1.03.06` (IVA a Favor) por ese monto para cancelarlo y usarlo en la determinación.

### P1 - Fix Bug Pagos (Robustez de Cuentas)
**Objetivo:** Evitar el error en Pagos y facilitar la configuración.

**Cambios requeridos:**
1.  **`src/storage/seed.ts`**: Asegurar que `repairDefaultFxAccounts` o una nueva función `repairTaxAccounts` cree las cuentas `2.1.03.03` y `2.1.03.06` si no existen.
2.  **`src/pages/Operaciones/ImpuestosPage.tsx`**:
    *   Mejorar el manejo de error en `TaxSettlementModal`. Si el error es "Falta cuenta...", mostrar botón "Configurar Cuentas".
3.  **`src/storage/impuestos.ts`**:
    *   Agregar logs detallados cuando `resolveTaxLiabilityAccountId` retorna null.

### P2 - Configuración de Mappings
**Objetivo:** Permitir al usuario mapear estas cuentas manualmente si usa un plan custom.
1.  Agregar los keys `retencionPracticada` y `percepcionIVAPracticada` al modal de configuración de cuentas (si no están ya accesibles).

---

## 6. Comandos Ejecutados y Validación

*   `git status`: Verificación de contexto.
*   `rg`: Búsqueda de uso de `ivaAFavor` (confirmado que solo se usa para el asiento final, no para lectura de saldo inicial).
*   `npm test -- tests/repro_impuestos.test.ts`: **PASS**. Confirmó que el cálculo ignora el saldo del mes 1.
*   `npm test -- tests/repro_pagos.test.ts`: **PASS**. Confirmó que la falta de cuenta devuelve error controlado.

## 7. Archivos Inspeccionados
*   `src/hooks/useTaxClosure.ts`
*   `src/core/impuestos/iva.ts`
*   `src/storage/impuestos.ts`
*   `src/core/impuestos/settlements.ts`
*   `src/pages/Operaciones/ImpuestosPage.tsx`
*   `src/storage/bienes.ts` (resolución de cuentas)
*   `src/storage/seed.ts` (plan de cuentas)
