# Auditoría Técnica/Funcional: Reexpresión RT6 + Analizar Mayor

**Fecha:** 26/01/2026
**Versión:** 1.0
**Autor:** Antigravity (Assistant)
**Scope:** Reexpresión RT6 (CierreValuacionPage -> Step2RT6Panel)

---

## A. Resumen Ejecutivo

El módulo de **Reexpresión RT6** se encuentra en un estado de **Esqueleto Funcional Avanzado**. La arquitectura base (Store, Page, Panel) está implementada y alineada en un 80% con la estructura del prototipo. Existen implementaciones reales de lectura del Mayor (`useLedgerBalances`) y autogeneración de partidas (`auto-partidas-rt6.ts`), incluyendo lógica compleja de anticuación mensual.

**Lo que funciona hoy:**
- Clasificación automática basada en reglas de palabras clave y códigos.
- "Analizar Mayor" lee movimientos reales y genera lotes agrupados por mes (anticuación real).
- Cálculo de RECPAM Indirecto completamente implementado con desglose mensual.
- UI principal (Tabs, Acordeones) alineada visualmente.

**Principales Gaps (Top 3):**
1.  **UX Moneda Extranjera:** La regla clasifica bien (No Monetaria), pero falta el tratamiento visual específico (Badge "Monetaria no expuesta") exigido por el prototipo.
2.  **KPI Variación %:** La fórmula actual muestra la inflación del período, no la variación del patrimonio/activo expuesto como pide el prototipo.
3.  **Visualización Drilldown:** Aunque la lógica de backend genera múltiples orígenes, la UI del panel necesita ajuste fino para mostrar la tabla de orígenes exactamente como el prototipo (con encabezados claros).

**Riesgo Principal:** Idempotencia de "Analizar Mayor". Actualmente reemplaza todas las partidas automáticas, lo que podría borrar ediciones manuales si no se refina la estrategia de merge.

---

## B. Mapa del Flujo Actual (Data Flow)

De la base de datos (Dexie) a la UI:

```mermaid
graph TD
    DB[(Dexie entries)] --> Hook[useLedgerBalances]
    Hook --> |Map<AccountID, Balance>| Memoria
    User --> |Click "Analizar Mayor"| Handler[handleAnalyzeMayor]
    Memoria --> AutoGen[autoGeneratePartidasRT6]
    Rules[monetary-classification.ts] --> AutoGen
    AutoGen --> |PartidaRT6[]| State[CierreValuacionState]
    Indices[Indices FACPCE] --> Computed[computeAllRT6Partidas]
    State --> Computed
    Computed --> |ComputedPartidaRT6[]| UI[Step2RT6Panel]
```

### Componentes Clave

| Componente/Función | Archivo | Responsabilidad | Estado |
|-------------------|---------|-----------------|--------|
| `Step2RT6Panel` | `src/pages/Planillas/components/Step2RT6Panel.tsx` | Renderizado UI, acordeones y tablas | ⚠️ Falta Badge ME |
| `autoGeneratePartidasRT6` | `src/core/cierre-valuacion/auto-partidas-rt6.ts` | Core de lógica: saldos -> partidas | ✅ Implementado |
| `calculateRecpamIndirecto` | `src/core/cierre-valuacion/recpam-indirecto.ts` | Cálculo RECPAM por posición mensual | ✅ Implementado |
| `monetary-classification` | `src/core/cierre-valuacion/monetary-classification.ts` | Reglas de negocio (IVA, Moneda Ext.) | ✅ Implementado |
| `CierreValuacionPage` | `src/pages/Planillas/CierreValuacionPage.tsx` | Orquestador y estado global | ✅ Implementado |

**Detalle "Analizar Mayor":**
1. Filtra cuentas imputables.
2. Aplica reglas de exclusión y overrides.
3. Si es `NON_MONETARY`: obtiene movimientos del período.
4. `generateLotsFromMovements`: agrupa movimientos por mes (si `groupByMonth: true`).
5. Genera `PartidaRT6` con N items (lotes).
6. **Destructivo:** Reemplaza el array `partidasRT6` en el state (riesgo de pérdida de datos manuales).

---

## C. Modelo de Datos Actual (y Gaps)

**Interfaz Actual (`PartidaRT6`):**
```typescript
interface PartidaRT6 {
    id: string;
    rubro: RubroType; // Enum legacy
    items: LotRT6[]; // Soporta múltiples orígenes
    cuentaCodigo: string;
    // ...
}
```

**Gaps en Modelo:**
- **Falta Metadata de Clasificación en `PartidaRT6`:** No sabemos *por qué* es No Monetaria (¿por rubro? ¿por moneda extranjera?). Necesario para el Badge.
- **Merge Strategy:** Falta campo `source` ('AUTO' | 'MANUAL') para proteger items manuales al regenerar.

**Data Model Target (Propuesta JSON):**
```json
{
  "id": "uuid",
  "items": [{ "fechaOrigen": "2024-01", "importeBase": 1000 }],
  "specialType": "FOREIGN_CURRENCY", // Nuevo campo sugerido
  "source": "AUTO"
}
```

---

## D. Auditoría de Clasificación

El archivo `monetary-classification.ts` contiene reglas robustas.

**Matriz de Reglas Detectada:**

| Cuenta Tipo | Regla Actual | Clasificación | Observación |
|-------------|--------------|---------------|-------------|
| Caja / Bancos | Prefijo `1.1.01` | MONETARY | Correcto |
| **Moneda Extranjera** | Keyword "dolar", "usd", etc. | **NON_MONETARY** | **Lógica OK, falta reflejo en UI** |
| IVA / Fiscal | Keyword "iva", "credito fiscal" | MONETARY | Correcto (Excepción a norma gral pasivos) |
| Bienes de Cambio | Prefijo `1.2.01` | NON_MONETARY | Correcto |
| Capital Social | Prefijo `3.1.01` | NON_MONETARY | Correcto |
| Resultados | Grupo 4 y 5 | NON_MONETARY | Correcto |

**Hallazgo:** La lógica es correcta ("Moneda extranjera" se reexpresa), pero la UI actual la trata como una partida no monetaria común.
**Requerimiento Prototipo:** Debe aparecer en sección No Monetarias pero con Badge "Monetaria no expuesta".

---

## E. Auditoría de Reexpresión (Anticuación)

**Algoritmo Actual (`auto-partidas-rt6.ts`):**
1. Separa saldo inicial (antes del inicio del ejercicio).
2. Agrupa movimientos del período por mes.
3. Suma DEBITOS para activos (ignorando créditos que son bajas).
4. **Resultado:** Genera múltiples lotes (N items dentro de la partida).

**Estado:** ✅ **Excelente.** El soporte para múltiples orígenes ya existe en el core.
**Gap UI:** `Step2RT6Panel.tsx` tiene lógica básica para mostrar "N orígenes" y expandir, pero visualmente puede no coincidir 100% con la tabla interna del prototipo (encabezados, alineación).

---

## F. Auditoría RECPAM

**Método:** Indirecto.
**Implementación:** `recpam-indirecto.ts`.
**Lógica:**
- Itera mes a mes.
- Calcula PMN (Posición Monetaria Neta) promedio.
- `RECPAM = PMN * (Coef - 1) * -1`.
- Suma mensuales.
**Visualización:** `RecpamIndirectoDrawer.tsx` muestra la tabla mensual.
**Estado:** ✅ **Completo y Correcto.** Validar únicamente manejo de NaN si faltan índices (parece tener guards).

---

## G. Auditoría de KPIs

**Ubicación:** `CierreValuacionPage.tsx`.

| KPI | Fórmula Actual (Code) | Fórmula Target (Prototipo/Negocio) | Status |
|-----|-----------------------|------------------------------------|--------|
| Activo Histórico | `rt6Totals.totalBase` | `Sum(Base)` | ✅ OK |
| Ajustado al Cierre | `rt6Totals.totalHomog` | `Sum(Homogeneo)` | ✅ OK |
| **Variación %** | `(recpamCoef - 1) * 100` | `((Ajustado / Histórico) - 1) * 100` | ❌ **ERROR** |
| Impacto RECPAM | `rt6Totals.totalRecpam + estimado` | `Total RECPAM` | ⚠️ Revisar consistencia con método indirecto |

**Corrección P0:** Cambiar la fórmula de Variación. Actualmente muestra la inflación acumulada, no el crecimiento real de las partidas.

---

## H. Paridad contra Prototipo REEX (Gap List)

| UI Element (Prototipo) | Implementación Actual | Acción Requerida | Prioridad |
|------------------------|-----------------------|------------------|-----------|
| **Badge "Monetaria no expuesta"** | Inexistente | Detectar en render y mostrar badge azul | **P0** |
| Tabla Drilldown (Orígenes) | Genérica | Ajustar estilos y columnas exactas (Mes, V.O, Coef, V.H, Ajuste) | P1 |
| KPI Variación | Fórmula Incorrecta | Corregir cálculo | **P0** |
| Botón "Agregar Origen Manual" | No visible en drilldown | Agregar botón en footer de tabla expandida | P2 |
| Acciones (Edit/Del) hover | Implementado parcialmente | Verificar visibilidad y UX | P2 |

---

## J. Plan de Implementación Recomendado

### P0: Corrección UX Crítica y KPIs (Inmediato)
1.  **KPI Variación:** Corregir fórmula en `CierreValuacionPage.tsx`.
2.  **Badge Moneda Extranjera:**
    -   Modificar `auto-partidas-rt6.ts` o el helper de UI para detectar cuentas de moneda extranjera (ya tenemos la lógica `isForeignCurrency` en `monetary-classification`, falta exponerla).
    -   En `Step2RT6Panel.tsx`: Agregar condicional para renderizar `<span className="badge-monetary-ne">...</span>`.

### P1: Refinamiento de "Analizar Mayor"
1.  **Merge Inteligente:** Modificar `mergeAutoPartidas` para no pisar ciegamente. Identificar partidas por ID de cuenta.
2.  **Estilos Drilldown:** Pulir la tabla interna de orígenes para que sea idéntica al HTML (class `bg-slate-50`, columnas alineadas).

### P2: Hardening & Manual
1.  **Edición Manual:** Asegurar que los botones de lápiz abran el Drawer correctamente y permitan editar los lotes generados.
2.  **Tests:** Unit tests para `auto-partidas-rt6` con casos de borde (saldo 0, saldo negativo).

---

## K. Validación
- **Check Visual:** Icono de Moneda Extranjera visible.
- **Check Matemático:** Variación % coincide con cálculo manual (VH/VO - 1).
- **Check Flujo:** Click "Analizar Mayor" -> Data aparece -> Click otra vez -> Data no se duplica/corrompe.
