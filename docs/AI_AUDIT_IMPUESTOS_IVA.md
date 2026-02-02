# Auditoría Técnica: Impuestos, IVA y Percepciones en ContaLivre

**Fecha:** 31 de Enero 2026
**Auditor:** AI Staff Engineer / Senior Accountant
**Módulo:** Operaciones / Inventario (Bienes de Cambio)

---

## 1. Resumen Ejecutivo

El sistema actual cuenta con una base sólida para el manejo de IVA estándar (21%, 10.5%, 0%) en compras y ventas de inventario, incluyendo la generación automática de asientos contables que imputan correctamente al Debe/Haber de las cuentas de IVA Crédito/Débito Fiscal.

Sin embargo, el sistema **carece completamente de soporte para Regímenes de Recaudación (Percepciones y Retenciones)** y presenta limitaciones estructurales para escenarios complejos (ej. facturas "A" recibidas por Monotributistas donde el IVA es costo, o discriminación de alícuotas múltiples en un mismo comprobante).

**Estado Actual:**
*   ✅ **IVA Básico:** Funcional (Cálculo, UI simple, Asiento automático).
*   ⚠️ **Pagos/Cobros:** Implementación "Mixta" flexible, pero sin concepto de "Retenciones" explícito.
*   ❌ **Percepciones:** No existen en el modelo de datos, UI ni asientos.
*   ❌ **IVA como Costo:** No soportado (siempre se segrega a cuenta de impuesto).

---

## 2. Mapa del Código

| Archivo | Responsabilidad | Estado Impuestos |
| :--- | :--- | :--- |
| `src/core/inventario/types.ts` | Definición de `BienesMovement` y `IVARate` | Solo campo `ivaRate` y `ivaAmount`. Falta soporte para impuestos extra. |
| `src/pages/Planillas/components/MovementModalV3.tsx` | UI de carga (Compra/Venta/Ajuste) | Select de Alícuota (21/10.5/0). Checkbox "Gravado" en gastos. Sin campos para percepciones. |
| `src/storage/bienes.ts` | **Motor Contable** (`buildJournalEntries...`) | Genera asientos. Resuelve cuentas `ivaCF` y `ivaDF`. Lógica rígida: `Neto + IVA = Total`. |
| `src/storage/seed.ts` | Plan de Cuentas Base | Contiene cuentas para Percepciones/Retenciones (`1.1.03.xx`, `2.1.03.xx`), pero no se usan. |
| `src/core/inventario/closing.ts` | Cierre de Inventario | Calcula IVA Saldo (`ivaDF - ivaCF`) informativo. |

---

## 3. Flujos Actuales (Evidencia)

### A. Registro de Compra (MovementModalV3)
*   **UI:** El usuario ingresa `Costo Unitario` (Neto) y selecciona `Alícuota IVA` (por defecto 21%).
*   **Cálculo:**
    *   `Subtotal` = Cantidad * Costo
    *   `Bonificación` = % sobre Subtotal
    *   `Base Imponible` = Subtotal - Bonif + Gastos Netos
    *   `IVA` = Base Imponible * Tasa
    *   `Total` = Base + IVA + Gastos IVA - Descuento Fin.
*   **Gap:** No hay dónde ingresar "Percepción IIBB" o "Percepción IVA" que suelen venir en la factura.

### B. Asiento Contable (bienes.ts)
La función `buildJournalEntriesForMovement` genera:
```typescript
// Pseudocódigo lógica actual
Debit:  Mercaderías (Base Imponible)
Debit:  IVA Crédito Fiscal (Monto IVA)
Credit: Proveedores / Caja (Total)
```
*   **Gap:** Si hubiera una percepción de $1.000, el asiento debería debitar `1.1.03.08 - Percep. IVA` por $1.000 y acreditar Proveedores por $1.000 extra. Esto hoy es imposible sin "hackear" el sistema (ej. cargándolo como un "Gasto" no capitalizable, lo cual es conceptualmente erróneo).

---

## 4. GAPS vs Requerimientos

| Requerimiento | Estado | Detalle del GAP |
| :--- | :--- | :--- |
| **IVA Tasa Variable** | ✅ OK | Soporta 21%, 10.5% y 0% (Exento). |
| **IVA como Costo** | ❌ CRÍTICO | Si soy Monotributista y compro con Factura A, el sistema separa el IVA a `1.1.03.01`. Debería sumarse al costo de `Mercaderías`. |
| **Percepciones (Sufridas)** | ❌ CRÍTICO | Frecuentes en compras (IIBB, IVA). No hay campos ni lógica contable. |
| **Retenciones (Sufridas/Pract.)** | ⚠️ PARCIAL | Se pueden "simular" usando el split de pagos y seleccionando manualmente la cuenta de Retención, pero no es intuitivo ni valida montos. |
| **Neto vs Final** | ⚠️ UX | La carga es "Neto-céntrica". No hay un modo "Tengo el total, desglosame el IVA". |

---

## 5. Plan Mínimo de Cambios (MVP Seguro)

Para soportar la operatoria argentina real sin romper la arquitectura actual:

### Paso 1: Modelo de Datos (`types.ts`)
Extender `BienesMovement` para alojar impuestos adicionales sin alterar la estructura base.
```typescript
interface TaxLine {
  id: string;
  kind: 'PERCEPCION' | 'RETENCION' | 'IMPUESTO_INTERNO';
  taxType: 'IVA' | 'IIBB' | 'GANANCIAS' | 'SUSS';
  amount: number;
  accountId?: string; // Opcional, para override
}

// En BienesMovement:
taxes?: TaxLine[];
```

### Paso 2: UI MovementModalV3
1.  **Sección Impuestos Adicionales:** Debajo de los totales, agregar un repetidor simple para agregar "Percepciones/Impuestos".
    *   Campos: Tipo (Selector), Monto ($).
    *   Impacto: Suma al `Total` a pagar.
2.  **Toggle "Discriminar IVA":**
    *   Si está ON (default RI): Comportamiento actual (IVA va a Crédito Fiscal).
    *   Si está OFF (Monotributo/Exento): El monto de IVA se calcula visualmente pero **se suma al Costo Unitario** (o se imputa a Gasto) y NO genera línea de IVA CF en el asiento.

### Paso 3: Motor Contable (`bienes.ts`)
Actualizar `buildJournalEntriesForMovement`:
1.  Leer el array `taxes`.
2.  Para cada tax, resolver la cuenta contable (usando `resolveMappedAccountId` con nuevos keys o hardcodes seguros del seed como `1.1.03.08`).
3.  Agregar líneas al asiento:
    *   Percepción Compra: **Debit** Cuenta Activo (Crédito Fiscal) / **Credit** Proveedores.
    *   Retención Venta (sufrida): **Debit** Cuenta Activo (Pago a cuenta) / **Credit** Deudores (implícito en el cobro neto).

### Paso 4: Retenciones en Pagos
Aprovechar la funcionalidad existente de **Payment Splits**.
*   En la sección "Pago / Contrapartidas", agregar un "Quick Add" para Retenciones.
*   Al seleccionar "Agregar Retención", pre-llenar con cuentas de pasivo (ej. `2.1.03.03 - Retenciones a depositar`) para compras.

---

## 6. Matriz de Pruebas Recomendada

| ID | Escenario | Resultado Esperado |
| :--- | :--- | :--- |
| **T01** | Compra RI Típica (Neto + IVA 21%) | Asiento: D Mercaderías / D IVA CF / H Proveedores. |
| **T02** | Compra con Percepción IIBB | Asiento incluye: D Percep. IIBB / H Proveedores (monto total mayor). |
| **T03** | Compra Monotributista (IVA al Costo) | Asiento: D Mercaderías (Neto + IVA) / H Proveedores. Sin línea de IVA CF. |
| **T04** | Venta con Retención Sufrida (IIBB) | En cobro mixto: Línea 1 Caja ($90), Línea 2 Retención IIBB ($10). |
| **T05** | Compra con Gasto No Gravado | Gasto se suma al debe (Gasto/Mercadería) sin generar IVA proporcional. |
| **T06** | Ajuste RT6 (Inflación) | No debe disparar cálculos de impuestos (IVA 0, Percep 0). |

---

## 7. Supuestos y Preguntas Abiertas

*   **Supuesto:** El usuario sabe qué cuenta contable usar para las percepciones si el sistema no la detecta automáticamente.
*   **Supuesto:** Las retenciones sufridas en ventas se manejan como "una forma de cobro" (el cliente me da un papel de retención en lugar de billetes).
*   **Pregunta:** ¿Necesitamos validar consistencia con AFIP (validar alícuotas)? *R: No para el MVP, confiamos en la carga manual.*
*   **Pregunta:** ¿Cómo impacta esto en el Costo PPP? *R: Si el IVA se trata como costo (Monotributo), debe entrar al numerador del PPP. Si es Crédito Fiscal, se excluye (como hoy).*

---
**Checkpoint:** Auditoría finalizada. El sistema es robusto pero incompleto para la fiscalidad argentina real. La implementación de Percepciones es el próximo paso crítico.
