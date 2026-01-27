# Auditoría Funcional: Cierre (Ajuste por Inflación + Valuación)

> **Fecha:** 27/01/2026
> **Scope:** Módulo `/planillas/cierre-valuacion` (RT6, Valuación, Asientos)
> **Objetivo:** Documentar estado actual, data-flow y hallazgos para corrección en próxima iteración.
> **Estado:** 🛑 REQUIERE CORRECCIONES CRÍTICAS ANTES DE PRODUCCIÓN.

## 0. Resumen Ejecutivo

El módulo actual tiene una base sólida de UI y estructura de datos, pero presenta **bloqueantes contables severos** que impiden su uso correcto para un cierre real según RT6/RT17.
- **Lo bueno:** La UI es coherente, el motor de anticuación de partidas funciona OK y la clasificación monetaria tiene una buena base.
- **Lo crítico:** Exclusión total de Cuentas de Resultado (ER) del ajuste RT6, clasificación de Moneda Extranjera frágil (hardcoded), y falta de integración automática del "Resultado del Ejercicio".
- **Impacto:** Los asientos generados hoy son incompletos y el "Resultado por Tenencia" calculado es insuficiente.

## 1. Mapa de Archivos Relevantes

| Archivo | Rol / Responsabilidad | Hallazgos Clave |
|:---|:---|:---|
| `src/pages/Planillas/PlanillasHome.tsx` | Entrypoint / Menu | Define título UX correcto: "Cierre: AxI + Valuación". |
| `src/pages/Planillas/CierreValuacionPage.tsx` | Orquestador Página Principal | Maneja estado global (wizard 4 pasos). Título interno difiere ("Reexpresión y Valuación"). |
| `src/core/cierre-valuacion/auto-partidas-rt6.ts` | **Motor de Extracción Ledger** | ⚠️ Filtra `RESULTADOS` (L172). ⚠️ Filtra saldos 0 (L100). |
| `src/core/cierre-valuacion/monetary-classification.ts` | **Lógica de Clasificación** | Detecta ME por keywords fijas. Asume `MONETARY` por defecto (arriesgado). |
| `src/core/cierre-valuacion/asientos.ts` | **Generador de Asientos** | Separa bien RT6/RT17 y Debe/Haber. Falta integración de "Resultado del Ejercicio". |
| `src/pages/Planillas/components/RT17Drawer.tsx` | UI Edición Valuación | Falta soporte real para "Métodos" (solo Manual/Stock/FX básico). |

## 2. Flujo de Datos Actual

```mermaid
graph TD
    A[Dexie DB (JournalEntries)] -->|useLedgerBalances| B(Saldos + Movimientos)
    B -->|autoGeneratePartidasRT6| C{Filtros Críticos}
    C -->|Excluye RESULTADOS| D[Partidas RT6 (Solo Patrimoniales)]
    D -->|Step 2 UI| E[Usuario Revisa/Edita]
    E -->|Step 3 Valuación| F[Input Manual Valuación Corriente]
    F -->|RT17 Logic| G[Cálculo RxT]
    D & G -->|generateCierreDrafts| H[Borrador Asientos]
    H -->|Sincronizar| I[Libro Diario]
```

## 3. Hallazgos Priorizados (Evidencia y Corrección)

### [P0] Exclusión de Cuentas de Resultado (RT6 Incompleto)
- **Problemática:** La RT6 requiere reexpresar el Estado de Resultados mes a mes para hallar el resultado real en moneda de cierre. El código actual las filtra explícitamente.
- **Evidencia:** `auto-partidas-rt6.ts`, línea 172:
  ```typescript
  if (grupoExtended === 'RESULTADOS') { return null; }
  ```
- **Impacto Contable:** El RECPAM generado es parcial. El "Resultado del Ejercicio" contable histórico no coincidirá con el ajustado.
- **Recomendación:** Eliminar el filtro. Permitir que `RESULTADOS` fluyan a "No Monetarias" automáticamente.

### [P0] Capital Social con V.Origen = 0
- **Problemática:** Si la cuenta Capital no tiene movimientos en el período y el saldo inicial no se computa correctamente por `useLedgerBalances` (dependiendo de fechas), llega como 0.
- **Evidencia:** `auto-partidas-rt6.ts`, línea 100: `if (!balance || balance.balance === 0) continue;`.
- **Causa Raíz:** Cuentas con "Saldo Inicio" solamente que no tengan movimiento en el año pueden ser ignoradas si el hook de saldos filtra estrictamente por fecha de inicio.
- **Recomendación:** Asegurar que `autoGeneratePartidas` reciba saldo al inicio INCLUSO si no hubo movimientos, o permitir forzar inclusión de cuentas Patrimoniales.

### [P0] Clasificación de Moneda Extranjera Frágil
- **Problemática:** Se depende de keywords (`dolar`, `usd`, `exterior`) para clasificar como "No Monetaria" (Valuación a TC). Cuentas como "Caja Ahorro Especial" quedan como Monetarias (RECPAM) erróneamente.
- **Evidencia:** `monetary-classification.ts`, `isForeignCurrencyAccount` (lista hardcoded).
- **Recomendación:** Agregar selector manual de "Tipo de Cuenta" en la UI (Moneda Local / Moneda Extranjera) en vez de confiar solo en el nombre.

### [P1] Títulos Inconsistentes
- **Observación:** `PlanillasHome` dice "Cierre: AxI + Valuación". `CierreValuacionPage` dice "Reexpresión y Valuación".
- **Recomendación:** Unificar a "Ajuste por Inflación + Valuación".

### [P1] Generación de Asiento "Resultado del Ejercicio"
- **Observación:** El sistema genera RECPAM y RxT, pero no genera el asiento de refundición de resultados ni calcula el "Resultado del Ejercicio" ajustado para balancear el PN.
- **Recomendación:** En el Paso 4, agregar lógica para detectar si falta refundición y proponerla, o al menos mostrar el check de `Activo - Pasivo - PN_Ajustado = 0`.

### [P1] Valuación (Métodos Limitados)
- **Observación:** `RT17Drawer.tsx` solo soporta lógica básica.
- **Recomendación:** Implementar select de Método en el drawer: "VNR", "Costo de Reposición", "VPP", "Valuación Técnica", "Ultima Compra Indexada".

## 4. Cobertura de Cuentas

| Grupo | Estado Actual | Estado Deseado | Acción |
|:---|:---|:---|:---|
| Activo Caja/Bancos | ✅ Detectado (Monetario) | ✅ | - |
| Activo ME | ⚠️ Detectado por Name | ✅ Configurable | Agregar flag manual |
| Bs de Uso | ✅ Detectado (No Mon) | ✅ | - |
| Pasivos | ✅ Detectado (Monetario) | ✅ | - |
| Patrimonio Neto | ⚠️ Capital a veces 0 | ✅ Siempre visible | Forzar inclusión PN |
| **Resultados (Ing/Egr)** | ❌ **EXCLUIDO** | ✅ **INCLUIDO** | **Remover filtro L172** |
| RECPAM/RxT | ✅ Generado auto | ✅ | - |

## 5. Plan de Corrección (Implementación Future)

1.  **Core Logic Fix (P0):** Eliminar filtro de `RESULTADOS` en `auto-partidas-rt6.ts`.
2.  **Core Logic Fix (P0):** Revisar lógica de Saldo Inicial 0. Permitir `PartidaRT6` con importe 0 si es PN (para permitir edición manual posterior).
3.  **UI Fix (P1):** Unificar Títulos.
4.  **UI/Logic (P1):** En Drawer de Valuación, agregar Combo "Método de Valuación" que guarde en metadata.
5.  **Integration (P2):** Agregar validación de "Asiento Balanceado" en Paso 4 que considere el Resultado del Ejercicio implícito.

## 6. Checklist de QA Manual (Propuesto para Dev)

- [ ] **1. Carga Inicial:** Ir a /planillas/cierre-valuacion.
- [ ] **2. Reexpresión:** Verificar que aparezcan cuentas de VENTAS, COSTOS, GASTOS en la pestaña "No Monetarias". (HOY FALLA).
- [ ] **3. Capital:** Verificar que Capital Social aparezca con su saldo histórico correcto.
- [ ] **4. Clasificación:** Crear cuenta "Caja Especial" sin decir "Dólares", verificar que cae en Monetarias. Usar botón "Agregar a No Monetarias" (si existe) o cambiar clasificación manual.
- [ ] **5. Asientos:** Generar borrador. Verificar que SUM(Debe) = SUM(Haber).

## 7. Validación Técnica

Comandos para verificar estado actual:
```bash
# Verificar existencia de archivos clave
ls src/core/cierre-valuacion/auto-partidas-rt6.ts

# Buscar el filtro culpable
grep -n "RESULTADOS" src/core/cierre-valuacion/auto-partidas-rt6.ts
```
