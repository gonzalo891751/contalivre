# Auditoría y Diagnóstico: Estado de Evolución del Patrimonio Neto (EEPN)

## 1. Resumen Ejecutivo

El módulo de EEPN presenta una **diferencia crítica de conciliación** respecto al Balance General (Estado de Situación Patrimonial) y una **pérdida de integridad de datos** en escenarios específicos de movimientos de resultados.

**Causa Raíz Principal:**
La lógica de cálculo del EEPN anula silenciosamente movimientos legítimos en la cuenta "Resultado del Ejercicio" (3.3.02) al sobrescribir el valor de la fila con el Resultado Neto obtenido del Estado de Resultados. Esto provoca que ajustes manuales, pagos de honorarios directos o distribuciones mal clasificadas desaparezcan del estado.

**Causa Raíz Secundaria (Conciliación):**
El cálculo del "Saldo al Cierre" del EEPN utiliza los saldos del Libro Mayor (cuentas 3.*) sin considerar el Resultado del Ejercicio corriente (cuentas 4.*) si aún no se ha realizado el asiento de refundición (cierre). Esto genera que el EEPN muestre un Patrimonio Neto menor al real durante el ejercicio, causando discrepancias con el Balance.

---

## 2. Hallazgos Detallados

### 2.1. "Swallowed Entry" (Movimientos Ocultos)
**Severidad:** Crítica (Integridad de Datos)
**Ubicación:** `src/core/eepn/compute.ts` -> `classifyMovements` / `createResultadoRow`

Cuando un asiento contable debita la cuenta `3.3.02` (Resultado del Ejercicio) contra una cuenta de Pasivo (ej. Honorarios) o Caja, y no cumple con reglas específicas (AREA/Dividendos), el sistema lo clasifica genéricamente como `RESULTADO_EJERCICIO`.
Posteriormente, la función `createResultadoRow` **sobrescribe** incondicionalmente el valor calculado de esta fila con el `netIncomeFromER` (Resultado del Estado de Resultados).

**Consecuencia:** El movimiento de débito (resta al PN) es ignorado. El EEPN muestra un saldo final mayor al real.

### 2.2. Cálculo de Saldo al Cierre Desconectado
**Severidad:** Alta (Conciliación)
**Ubicación:** `src/core/eepn/compute.ts` -> `createBalanceRow` / `computePNBalances`

La fila final "Saldo al Cierre" se construye sumando los saldos de las cuentas patrimoniales (`3.*`) al final del período.
En un escenario "Pre-Cierre" (durante el ejercicio, sin asiento de refundición):
*   El Balance General incluye el resultado del ejercicio (suma de cuentas `4.*`).
*   El EEPN "Cierre" solo ve las cuentas `3.*`. La cuenta `3.3.02` está vacía o tiene saldo anterior.
*   El EEPN **no suma** el resultado del ejercicio a esta fila final, a pesar de que sí lo mostró en la fila de variación "Resultado del Ejercicio".

**Consecuencia:** El total del EEPN (KPI y Fila Final) no coincide con el Balance General ni con la suma vertical de (Inicio + Variaciones).

---

## 3. Plan de Corrección Propuesto

### Fase 1: Corrección Lógica (P0 - Inmediato)
Objetivo: Garantizar integridad y conciliación básica.

1.  **Refinar Clasificación (`classifyEntry`):**
    *   Modificar la regla que captura movimientos de `3.3.02`.
    *   Si el movimiento es una *aplicación* de resultados (Débito) contra Pasivo/Caja, clasificarlo como `DISTRIBUCIONES` u `OTROS_MOVIMIENTOS`, nunca como `RESULTADO_EJERCICIO`.
    *   Reservar la clasificación `RESULTADO_EJERCICIO` exclusivamente para el asiento de refundición (Cierre) o dejarla vacía de movimientos si se va a inyectar el valor externo.

2.  **Corregir Sobrescritura (`createResultadoRow`):**
    *   Cambiar la lógica de inyección de `netIncomeFromER`.
    *   En lugar de reemplazar (`=`), debe sumar/consolidar o asegurar que lo que se reemplaza es *solamente* la generación del resultado, no sus aplicaciones.
    *   *Mejor enfoque:* Si `classifyMovements` ya separa correctamente las aplicaciones, la fila `RESULTADO_EJERCICIO` debería venir vacía de movimientos (o solo con el cierre), por lo que la sobrescritura sería segura.

3.  **Unificar Saldo al Cierre:**
    *   Modificar `createBalanceRow` para "Saldo al Cierre" (o la lógica de totales `computeEEPN`).
    *   El `pnCierre` debe calcularse como `pnInicio + Variaciones` (Suma vertical).
    *   No confiar en `closingBalances` del Mayor si difiere de la suma vertical, o inyectar el Resultado del Ejercicio en `closingBalances` virtualmente antes de renderizar la fila.

### Fase 2: Robustez (P1)
1.  **Manejo de Asientos de Cierre:** Asegurat que `computePNBalances` (Inicio) detecte correctamente si el año anterior fue cerrado o no, para no duplicar o perder saldos de inicio.
2.  **Tests de Regresión:** Implementar el test case `repro_eepn.test.ts` (creado durante el diagnóstico) como parte de la suite permanente `tests/core/eepn.test.ts`.

---

## 4. Evidencia de Reproducción

Se creó un script de prueba (`tests/repro_eepn.test.ts`) que simuló:
1.  Saldo Inicio: 1000.
2.  Pago Honorarios (Débito 3.3.02): 500.
3.  Resultado Ejercicio (ER): 2000.

**Resultado Actual (Bug):**
*   EEPN Cierre calculado: 500 (Del Mayor, ignorando ER).
*   Suma Vertical (con bug de swallow): 1000 (Inicio) + 2000 (ResEj) = 3000. (El pago de 500 desapareció).
*   Balance Esperado: 1000 - 500 + 2000 = 2500.

**Diferencia:** 2000.
