# Auditoría Técnica: Estados Contables (ESP) y Notas RT9

**Fecha:** 3 de Febrero de 2026
**Auditor:** AI Staff Engineer
**Objetivo:** Verificar alineación con RT9, integridad contable y mecanismo de notas.

## 1. Resumen Ejecutivo

La arquitectura actual del Estado de Situación Patrimonial (ESP) es **robusta y flexible**, basada en un mapeo de `statementGroup` y `section` en cada cuenta contable.

*   **Alineación RT9:** Alta (90%). Los rubros principales están modelados correctamente. Faltan rubros específicos como "Previsiones" (Pasivo) y "Otros Activos".
*   **Mecanismo de Notas:** Funciona por agrupación dinámica de `statementGroups`. Es automático y consistente con el Balance.
*   **Integridad:** El manejo de signos y cuentas regularizadoras (`isContra`) es correcto en la presentación.
*   **Riesgo Principal:** Cuentas con saldo pero sin `statementGroup` asignado **desaparecen** del Balance (silenciosas).
*   **Comparativo:** Actualmente es **simulado/manual** (requiere importar un JSON del año anterior), no lo calcula automáticamente del Libro Diario del ejercicio pasado.

---

## 2. Arquitectura y Flujo de Datos

### Flujo
1.  **Storage (`Dexie`):** Cuentas (`src/core/models.ts`) y Asientos (`entries`).
    *   Campos clave en Cuenta: `section` ('CURRENT'/'NON_CURRENT'), `statementGroup` (ej: 'CASH_AND_BANKS'), `isContra`.
2.  **Core Compute (`src/core/balance.ts`):** Calcula el Balance de Sumas y Saldos (Trial Balance).
3.  **Statement Compute (`src/core/statements.ts`):**
    *   Agrupa las filas del Trial Balance por `statementGroup`.
    *   Separa por `section` (Corriente/No Corriente).
    *   Calcula subtotales y netea cuentas regularizadoras.
    *   Inyecta el Resultado del Ejercicio en el Patrimonio Neto.
4.  **UI (`EstadoSituacionPatrimonialGemini.tsx`):** Renderiza la estructura jerárquica ya calculada.

### Entidades Clave
*   **`StatementGroup`:** Enum que define los rubros RT9 (Caja y Bancos, Inversiones, Créditos, etc.).
*   **`AccountSection`:** Define la clasificación temporal (Corriente / No Corriente).

---

## 3. Hallazgos y Gaps (vs RT9)

### Tabla de Mapeo Actual

| Rubro RT9 (Activo) | StatementGroup | Sección | Nota Asociada | Estado |
|---|---|---|---|---|
| Caja y Bancos | `CASH_AND_BANKS` | CURRENT | Nota 4 | ✅ OK |
| Inversiones Temporarias | `INVESTMENTS` | CURRENT | Nota 5 | ✅ OK |
| Créditos por Ventas | `TRADE_RECEIVABLES` | CURRENT | Nota 6 | ✅ OK |
| Otros Créditos | `OTHER_RECEIVABLES`, `TAX_CREDITS` | CURRENT | Nota 7 | ✅ OK |
| Bienes de Cambio | `INVENTORIES` | CURRENT | Nota 8 | ✅ OK |
| Otros Activos | - | NON_CURRENT | - | ⚠️ FALTANTE |
| Bienes de Uso | `PPE` | NON_CURRENT | Nota 9 | ✅ OK |
| Activos Intangibles | `INTANGIBLES` | NON_CURRENT | - | ✅ Mapeado |
| Inversiones Permanentes | `INVESTMENTS` | NON_CURRENT | - | ✅ Reusa Group |

| Rubro RT9 (Pasivo) | StatementGroup | Sección | Nota Asociada | Estado |
|---|---|---|---|---|
| Deudas Comerciales | `TRADE_PAYABLES` | CURRENT | Nota 10 | ✅ OK |
| Préstamos | `LOANS` | CUR/NON_CUR | Nota 11 | ✅ OK |
| Remuneraciones y Cargas Soc. | `PAYROLL_LIABILITIES` | CURRENT | Nota 12 | ✅ OK |
| Cargas Fiscales | `TAX_LIABILITIES` | CURRENT | Nota 13 | ✅ OK |
| Anticipos de Clientes | `DEFERRED_INCOME` | CURRENT | - | ✅ OK |
| Dividendos a Pagar | `OTHER_PAYABLES` | CURRENT | - | ✅ OK |
| Previsiones | - | CUR/NON_CUR | - | ⚠️ FALTANTE |

### Hallazgos

#### 🔴 BLOQUEANTE: Cuentas Huérfanas (Silencioso)
En `src/core/statements.ts`, la función `groupByStatementGroup` ignora cuentas sin grupo:
```typescript
if (!row.account.statementGroup) continue
```
Si una cuenta tiene saldo pero no tiene `statementGroup`, **el Balance no cuadrará** y el usuario no sabrá por qué (la cuenta simplemente no se muestra).

#### 🟡 MEDIO: Comparativo Manual
El comparativo depende de `loadESPComparative` (`src/storage/espComparativeStore.ts`). Si el usuario ya tiene la contabilidad del año anterior en el sistema, debería poder usarla automáticamente sin tener que "auto-importarse".

#### 🟡 MEDIO: Falta Rubro "Previsiones" (Pasivo)
No existe `StatementGroup` para Previsiones (distinto de regularizadoras de activo). Las previsiones de pasivo (ej: Juicios) hoy tendrían que ir a `OTHER_PAYABLES` u otro, perdiendo distinción RT9.

---

## 4. Check Contable

1.  **Signos:** El sistema normaliza los saldos a positivo (`rawBalance`) y usa `isContra` para restar.
    *   *Evidencia:* `src/core/statements.ts:40`: `if (account.isContra) { return -rawBalance }`
    *   *Veredicto:* **Correcto**.
2.  **Resultado del Ejercicio:** Se calcula dinámicamente en el Estado de Resultados y se inyecta en el PN (`equity`) como una cuenta virtual `__current_result__`.
    *   *Veredicto:* **Correcto y robusto**.
3.  **Subtotales:** Se calculan correctamente sumando `subtotal` de cada sección.
    *   *Veredicto:* **Correcto**.

---

## 5. Plan de Acción Recomendado

### P0 - Seguridad de Datos (Integridad)
- **Validación de Huérfanas:** Crear una función que verifique si existen cuentas con `balance !== 0` y `statementGroup === null`. Mostrar alerta visible en la UI de Estados Contables ("Hay cuentas con saldo sin asignar a rubro").

### P1 - Completitud RT9
- **Agregar Rubros Faltantes:**
    - Agregar `PROVISIONS` a `StatementGroup` en `src/core/models.ts`.
    - Agregar `OTHER_ASSETS` a `StatementGroup`.
    - Actualizar `computeBalanceSheet` en `src/core/statements.ts` para incluir estos nuevos grupos en las secciones correspondientes.

### P2 - Automatización Comparativa
- **Auto-Carga:** Modificar `src/pages/Estados.tsx` para que, si no hay datos manuales importados, intente calcular el Balance del ejercicio anterior (`year - 1`) usando el mismo motor `computeStatements` sobre los asientos de ese rango de fechas.

### P3 - Notas Dinámicas
- Permitir que el usuario edite la narrativa de las notas y que esta persistencia esté ligada al ejercicio (ya parece estar implementado en `src/storage/notasAnexosStore.ts`, verificar en QA).

---

## 6. Supuestos y Plan B
*   **Supuesto:** El plan de cuentas "Seed" cubre la mayoría de los casos.
*   **Plan B:** Si el seed es insuficiente, el usuario puede editar la cuenta y asignar el `statementGroup` manualmente (la UI lo permite en `Cuentas.tsx`).
