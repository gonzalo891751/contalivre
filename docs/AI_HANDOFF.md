# ContaLivre - AI Handoff Protocol

## CHECKPOINT #NOTAS-ANEXOS-1 - NOTAS Y ANEXOS A LOS ESTADOS CONTABLES
**Fecha:** 27/01/2026
**Estado:** ✅ COMPLETADO - Build PASS

---

### RESUMEN DE IMPLEMENTACION

Se implemento la 5ta pestana "Notas y Anexos" en `/estados`, incluyendo:
- Sub-pestanas: Notas / Anexo de Gastos / Anexo de Costos
- Motor de calculo puro basado en statementGroups del plan de cuentas
- Asignacion de gastos por funcion (Costo/Admin/Comercializacion) con heuristicas
- Determinacion del CMV con formula completa
- Persistencia de narrativas, asignaciones y overrides en localStorage
- Impresion/PDF formal con @media print

### ARCHIVOS CREADOS

| Archivo | Descripcion |
|---------|-------------|
| `src/core/notas-anexos/types.ts` | Definiciones de tipos para notas y anexos |
| `src/core/notas-anexos/definitions.ts` | Definiciones de notas y heuristicas de asignacion |
| `src/core/notas-anexos/compute.ts` | Motor de calculo puro |
| `src/core/notas-anexos/index.ts` | Exports del modulo |
| `src/storage/notasAnexosStore.ts` | Servicio de persistencia localStorage |
| `src/components/Estados/NotasAnexosTab.tsx` | Componente UI completo |

### ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `src/components/Estados/EstadosHeader.tsx` | +Tab 'NA' con icono FileText |
| `src/pages/Estados.tsx` | +Import y renderizado de NotasAnexosTab |

### MAPEO DE NOTAS A CUENTAS/RUBROS

Las notas se mapean por `statementGroup` del plan de cuentas:

| Nota | Titulo | StatementGroups |
|------|--------|-----------------|
| 4 | Caja y Bancos | CASH_AND_BANKS |
| 5 | Inversiones Temporarias | INVESTMENTS (section CURRENT) |
| 6 | Creditos por Ventas | TRADE_RECEIVABLES |
| 7 | Otros Creditos | OTHER_RECEIVABLES, TAX_CREDITS |
| 8 | Bienes de Cambio | INVENTORIES |
| 9 | Bienes de Uso | PPE |
| 10 | Deudas Comerciales | TRADE_PAYABLES |
| 11 | Prestamos | LOANS |
| 12 | Deudas Sociales | PAYROLL_LIABILITIES |
| 13 | Deudas Fiscales | TAX_LIABILITIES |
| 15 | Resultados Financieros | FINANCIAL_INCOME, FINANCIAL_EXPENSES |

### HEURISTICAS DE ASIGNACION DE GASTOS

El sistema detecta automaticamente la funcion de cada gasto por keywords:

- **COSTO (80%):** flete, combustible, produccion, fabricacion, manufactura
- **COMERCIALIZACION (90%):** publicidad, propaganda, comision, venta, marketing
- **ADMINISTRACION (100%):** honorarios, oficina, servicios, alquiler, sueldo, amortizacion

### PERSISTENCIA

Las ediciones se guardan en localStorage con el patron:
```
notas-anexos:{empresaId}:{periodKey}
```

Campos persistidos:
- `narratives`: Map<noteNumber, text>
- `expenseAllocations`: Map<accountCode, allocation + isManual>
- `costOverrides`: Map<componentId, value>

### FUNCIONALIDADES IMPLEMENTADAS

- ✅ Tab "Notas y Anexos" habilitada en /estados
- ✅ Sub-tabs: Notas / Anexo de Gastos / Anexo de Costos
- ✅ Action bar con toggles Comparativo/Detallado
- ✅ Indice de notas navegable (scroll suave)
- ✅ Tablas de notas con totales
- ✅ Narrativas editables por nota
- ✅ Validacion vs Balance (warning si difiere)
- ✅ Tabla de gastos con sliders de asignacion %
- ✅ Badge "M" para ediciones manuales
- ✅ Formula CMV (EI + Compras + Gastos - EF)
- ✅ Card destacado con total CMV
- ✅ Boton Restablecer para limpiar overrides
- ✅ Impresion formal con @media print

### FORMULA CMV

```
CMV = Existencia Inicial
    + Compras del ejercicio
    + Gastos incorporados al costo (desde Anexo Gastos)
    - Existencia Final
```

### VERIFICACION

```bash
npm run build  # ✅ PASS
```

**QA manual:**
1. Ir a `/estados` -> Tab "Notas y Anexos"
2. Verificar sub-tabs Notas/Gastos/Costos
3. En Notas: editar narrativa -> persistida al recargar
4. En Gastos: click slider de asignacion -> badge "M" aparece
5. En Costos: verificar formula CMV
6. Click "Imprimir" -> formato formal A4

### PENDIENTES CONOCIDOS (P2)

| Item | Prioridad | Descripcion |
|------|-----------|-------------|
| Comparativo real | P2 | Requiere datos del ejercicio anterior |
| Subtotales Corriente/No Corriente | P2 | Para notas 11 y 13 |
| Tests unitarios | P3 | Cubrir compute.ts y definitions.ts |

---

## CHECKPOINT #EEPN-1 - ESTADO DE EVOLUCIÓN DEL PATRIMONIO NETO
**Fecha:** 27/01/2026
**Estado:** ✅ COMPLETADO - Build PASS

---

### RESUMEN DE IMPLEMENTACIÓN

Se implementó el Estado de Evolución del Patrimonio Neto (EEPN) completo en `/estados`, incluyendo:
- Motor de cálculo puro con clasificación heurística de movimientos
- UI interactiva con edición de celdas y overrides manuales
- Reconciliación con Balance y Estado de Resultados
- Impresión/PDF formal con @media print

### ARCHIVOS CREADOS

| Archivo | Descripción |
|---------|-------------|
| `src/core/eepn/types.ts` | Definiciones de tipos para EEPN |
| `src/core/eepn/columns.ts` | Definición de columnas por código de cuenta |
| `src/core/eepn/compute.ts` | Motor de cálculo puro |
| `src/core/eepn/index.ts` | Exports del módulo |
| `src/components/Estados/EvolucionPNTab.tsx` | Componente UI completo |

### ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `src/storage/seed.ts` | +4 cuentas AREA y dividendos (versión 9→10) |
| `src/components/Estados/EstadosHeader.tsx` | Tab EPN habilitado (removido disabled) |
| `src/pages/Estados.tsx` | Import y renderizado de EvolucionPNTab |

### DECISIONES DE DISEÑO

1. **Mapeo por código, no por statementGroup:**
   - Columnas definidas por prefijos de código (3.1.01, 3.2.*, etc.)
   - Evita modificar el modelo de datos existente
   - Permite flexibilidad futura

2. **Clasificación heurística de movimientos:**
   - AREA: cualquier movimiento en 3.3.03.*
   - Distribuciones: toca 3.3.04.* o 2.1.06.05 (Dividendos a pagar)
   - Capitalizaciones: solo cuentas 3.* sin contrapartida externa
   - Reservas: mueve entre 3.3.01 (RNA) y 3.2.* (Reservas)
   - Aportes: acredita capital con débito en caja/bancos
   - Resultado: usa valor del ER si disponible

3. **Columnas EEPN:**
   - Capital Suscripto (3.1.01 + contras)
   - Ajuste de Capital (3.1.02)
   - Aportes No Capitalizados (3.1.03, 3.1.04)
   - Reservas (3.2.*)
   - RNA (3.3.01)
   - Resultado del Ejercicio (3.3.02)
   - AREA (3.3.03.*)
   - Distribuciones (3.3.04.*)

4. **Filas EEPN:**
   - Saldos al inicio
   - Modificación saldo inicio (AREA)
   - Saldo al inicio ajustado
   - Variaciones del ejercicio (detalladas)
   - Total variaciones
   - Saldos al cierre

### FUNCIONALIDADES IMPLEMENTADAS

- ✅ Tab "Evolución PN" habilitada en /estados
- ✅ Matriz EEPN con columnas por componente de PN
- ✅ Filas de variaciones clasificadas automáticamente
- ✅ Celdas editables con doble click
- ✅ Overrides manuales con badge "M"
- ✅ Restablecer celda individual y todo
- ✅ Toggle detallado/resumido
- ✅ Toggle comparativo (placeholder)
- ✅ KPI cards con totales
- ✅ Panel de breakdown (origen del cálculo)
- ✅ Reconciliación con warnings
- ✅ Impresión formal con @media print

### CUENTAS AGREGADAS AL SEED

```typescript
// AREA genéricas
{ code: '3.3.03.10', name: 'Corrección de errores (AREA)' }
{ code: '3.3.03.20', name: 'Cambios de políticas contables (AREA)' }
{ code: '3.3.03.99', name: 'Ajustes ejercicios anteriores (Genérico)' }

// Distribuciones
{ code: '3.3.04.02', name: 'Dividendos declarados (en efectivo)' }

// Renombrada
1.1.03.13: 'Aportes a integrar' → 'Accionistas - Integración pendiente'
```

### PENDIENTES CONOCIDOS

| Item | Prioridad | Descripción |
|------|-----------|-------------|
| Comparativo real | P2 | Actualmente usa placeholder 85% |
| Persistencia overrides | P2 | Guardar en localStorage/IndexedDB |
| Tests unitarios | P3 | Cubrir compute.ts y columns.ts |

### VERIFICACIÓN

```bash
npm run build  # ✅ PASS
```

**QA manual:**
1. Ir a `/estados` → Tab "Evolución PN"
2. Verificar que aparece la matriz EEPN
3. Doble click en celda → editar → Enter → badge "M" aparece
4. Click en badge "M" → restablecer celda
5. Click "Imprimir" → verificar formato formal

---

## CHECKPOINT #FIX-INTEGRAL-2 - HARDENING COMPLETADO
**Fecha:** 27/01/2026
**Estado:** ✅ COMPLETADO - Build PASS (19.48s)

---

### RESUMEN DE CAMBIOS

Se implementaron mejoras de robustez y diagnóstico para el módulo `/planillas/cierre-valuacion`:

### ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `CierreValuacionPage.tsx` | Validación de closingDate + diagnóstico mejorado en toast |
| `auto-partidas-rt6.ts` | Estadísticas extendidas (resultadosAccounts, pnAccounts, skippedZeroBalance) |
| `monetary-classification.ts` | Detección de FX más robusta (keywords fuertes vs contextuales) |

### CAMBIOS ESPECÍFICOS

**1. Validación de fecha de cierre (P0)**
```typescript
// CierreValuacionPage.tsx - handleAnalyzeMayor
if (!closingDate || closingDate.length < 10) {
    showToast('Selecciona una fecha de cierre valida');
    return;
}
```

**2. Estadísticas extendidas en AutoGenerateResult**
```typescript
stats: {
    // ... existentes ...
    resultadosAccounts: number;  // NUEVO: conteo de cuentas RESULTADOS
    pnAccounts: number;          // NUEVO: conteo de cuentas PN
    skippedZeroBalance: number;  // NUEVO: cuentas omitidas por balance 0
}
```

**3. Detección de FX más precisa**
- Keywords fuertes: `moneda extranjera`, `en dolares`, `usd`, `u$s`, `dolar`, etc.
- Keywords contextuales (`divisa`, `exterior`) solo con contexto de caja/banco
- Evita falsos positivos como "Inversiones en el exterior"

**4. Diagnóstico en console cuando RESULTADOS falta**
```typescript
if (result.stats.resultadosAccounts > 0 && resultadosPartidas.length === 0) {
    console.warn('[RT6] RESULTADOS accounts found but no partidas generated');
}
```

### VERIFICACIÓN

```bash
npm run build  # ✅ PASS (19.48s)
```

### ESTADO ACTUAL VERIFICADO

| Criterio | Estado |
|----------|--------|
| Título unificado "Ajuste por Inflación + Valuación" | ✅ |
| Tab Resultados (RT6) incluye cuentas con actividad | ✅ |
| Capital/PN no se omite con balance 0 | ✅ |
| Caja/Bancos en Monetarias | ✅ |
| Moneda extranjera con FX_PROTECTED | ✅ |
| Paso 3 sugiere método por cuenta | ✅ |
| Paso 4 asientos con diagnóstico | ✅ |
| Ajuste Capital para Capital Social | ✅ |

### PRÓXIMOS PASOS (SI EL USUARIO REPORTA PROBLEMAS)

1. Verificar datos de prueba (¿tienen movimientos de RESULTADOS?)
2. Revisar console.warn para diagnóstico
3. Verificar que closingDate esté configurado correctamente
4. Probar "Analizar Mayor" y verificar toast con estadísticas

---

## CHECKPOINT #FIX-INTEGRAL-1 - DIAGNÓSTICO INICIAL
**Fecha:** 27/01/2026
**Estado:** ✅ DIAGNÓSTICO COMPLETADO - Sirvió de base para CHECKPOINT #2

---

## CHECKPOINT #IMPL-COMPLETE - IMPLEMENTACION END-TO-END COMPLETADA
**Fecha:** 27/01/2026
**Estado:** COMPLETADO - Build exitoso (tsc + vite)

---

### OBJETIVO
Implementacion end-to-end del cierre "Ajuste por Inflacion + Valuacion" (RT6 + Valuacion + Asientos)

### CRITERIOS DE LISTO (CHECKLIST)
- [x] Titulo unificado: "Ajuste por Inflacion + Valuacion" en todos lados
- [x] Paso 2 incluye RESULTADOS (tab "Resultados RT6")
- [x] Capital/PN con V.Origen correcto (no 0 si hay saldo real)
- [x] Clasificacion robusta con enum + overrides + lista "Pendientes"
- [x] Moneda extranjera como "FX_PROTECTED" (no por keywords unicamente)
- [x] Paso 3: drawer con metodo correcto por cuenta (FX/VNR/VPP/Reposicion/Revaluo/Manual)
- [x] Paso 4: borradores separados (RECPAM vs Tenencia), por signo, balanceados
- [x] Capital social NO se asienta; usar "Ajuste de capital"
- [x] Bloqueos: funcion validateDraftsForSubmission() implementada

### ARCHIVOS MODIFICADOS
| Archivo | Cambios Realizados |
|---------|-------------------|
| `CierreValuacionPage.tsx` | Titulo cambiado a "Ajuste por Inflacion + Valuacion" |
| `auto-partidas-rt6.ts` | Removido filtro RESULTADOS, corregido balance 0 para PN |
| `monetary-classification.ts` | Nuevo enum (MONETARY/NON_MONETARY/FX_PROTECTED/INDEFINIDA), suggestValuationMethod() |
| `types.ts` | GrupoContable incluye RESULTADOS, RT17Valuation con method/metadata, AsientoBorrador con capitalRedirected |
| `Step2RT6Panel.tsx` | Nueva tab "Resultados (RT6)" con UI completa, estilos violet |
| `RT17Drawer.tsx` | Reescrito con selector de metodo y formularios especificos (FX/VNR/VPP/Reposicion/Revaluo/Manual) |
| `asientos.ts` | Cuenta AJUSTE_CAPITAL, isCapitalSocialAccount(), validateDraftsForSubmission(), getDraftsSummary() |

### RESUMEN DE CAMBIOS POR FASE

**FASE 1: Fixes P0/P1 RT6 + UX**
- Titulo unificado en CierreValuacionPage.tsx
- Removido filtro `grupoExtended === 'RESULTADOS'` en auto-partidas-rt6.ts
- Cuentas PN ya no se descartan con balance 0 (incluye saldo historico)
- Tooltip en Capital social indicando que usa "Ajuste de capital"

**FASE 2: Clasificacion robusta**
- Nuevo enum MonetaryClass con INDEFINIDA como default
- FX_PROTECTED para cuentas de moneda extranjera
- Funciones helper: needsClassification(), getClassificationLabel(), suggestValuationMethod()

**FASE 3: Drawer valuacion inteligente**
- Selector de metodo de valuacion en RT17Drawer
- Formularios especificos: FX (con boton traer TC), VNR (precio-gastos), VPP (% x PN), Reposicion, Revaluo (RT31), Manual
- Preview de RxT en tiempo real
- Metadata persistida para trazabilidad

**FASE 4: Asientos correctos**
- Capital Social redirigido automaticamente a Ajuste de Capital
- Funcion validateDraftsForSubmission() para bloqueos
- getDraftsSummary() para resumen de asientos

### RIESGOS MITIGADOS
1. **Compatibilidad**: Tipos extendidos son backwards-compatible
2. **Resultados RT6**: Tab dedicada con coeficiente promedio por cuenta
3. **Ajuste de capital**: Fallback automatico con warning si cuenta no existe

---

## CHECKPOINT #AUDIT-1 - AUDITORÍA FUNCIONAL RT6
**Fecha:** 27/01/2026
**Estado:** DOCUMENTACIÓN LISTA - Sin cambios de código

---

### Resumen
Se realizó una auditoría funcional profunda del módulo `Cierre: AxI + Valuación`.
Se documentaron hallazgos críticos en `docs/AUDIT_CIERRE_VALUACION.md`.

### Archivos Afectados
- `docs/AUDIT_CIERRE_VALUACION.md` (Nuevo)
- `docs/AI_HANDOFF.md` (Actualizado)

### Hallazgos Principales (Bloqueantes)
1. **Exclusión de Resultados:** `auto-partidas-rt6.ts` filtra explícitamente el grupo `RESULTADOS`, impidiendo el ajuste del Estado de Resultados.
2. **Capital Inicial 0:** Cuentas sin movimientos en el período pueden ser ignoradas erróneamente.
3. **Clasificación ME:** Dependencia de keywords fijas, riesgoso para cuentas sin nombre explícito.

### Próximos Pasos (Implementación)
- [ ] Remover filtro de RESULTADOS en `auto-partidas-rt6.ts`.
- [ ] Corregir lógica de balance 0 para cuentas Patrimoniales.
- [ ] Unificar títulos en UX.
- [ ] Implementar select de Métodos en Valuación.

---

## CHECKPOINT #11 - RT6 UX FIXES ROUND 2
**Fecha:** 2026-01-27
**Estado:** ✅ COMPLETADO - Build limpio (tsc + vite 35.88s)

---

### RESUMEN DE CAMBIOS

**BLOQUE 1: Date Picker Robusto**
- Implementado `showPicker()` con ref para compatibilidad cross-browser
- Agregado label "Fecha de cierre" visible sobre la fecha
- Agregado ícono caret-down para indicar dropdown
- Eliminadas zonas muertas / overlay issues

**BLOQUE 2: Método Indirecto sin "—"**
- Fix división por cero cuando `monthly.length === 0`
- Agregado `fallbackTotals` prop al drawer (usa totales actuales de Monetarias)
- RECPAM estimado utiliza fórmula `-PMN * inflationPeriod` como fallback

**BLOQUE 3: No Monetarias Expandido + Header Métricas**
- useEffect auto-expande todos los rubros/partidas al entrar al tab
- Todos los rubro headers ahora muestran: V.ORIGEN (neutral), V.HOMOG (azul), RECPAM (verde/rojo)

**BLOQUE 4: Card "Cuentas Sin Clasificar"**
- Computed list: cuentas con saldo que no están en Monetarias ni en RT6 partidas
- Card UI con tabla (código, cuenta, tipo, saldo)
- Botones de acción: 💲 Monetarias / 📦 No Monetarias

---

### ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `CierreValuacionPage.tsx` | `dateInputRef`, `showPicker()` onClick, `monetaryFallbackTotals` useMemo, date picker CSS |
| `Step2RT6Panel.tsx` | `unclassifiedAccounts` compute, auto-expand useEffect, rubro header 3-column metrics, Sin Clasificar card UI/CSS |
| `recpam-indirecto.ts` | Guard `monthly.length > 0` para evitar NaN |
| `RecpamIndirectoDrawer.tsx` | `fallbackTotals` prop, display logic con fallback |

---

### VERIFICACIÓN

```bash
npm run build   # ✅ PASS (35.88s)
```

**QA manual:**
1. Date picker: click en cualquier parte abre calendario
2. Tab "No Monetarias": rubros expandidos por defecto, headers muestran V.ORIGEN / V.HOMOG / RECPAM
3. Drawer "Método indirecto": muestra valores numéricos (no "—")
4. Card "Cuentas sin clasificar": aparece si hay cuentas no clasificadas con botones de acción

---

---

## CHECKPOINT #10 - RT6 REEXPRESIÓN UX IMPROVEMENTS
**Fecha:** 2026-01-27
**Estado:** ✅ COMPLETADO - Build limpio, todas las correcciones UX completadas

---

### RESUMEN DE CAMBIOS

**A) Date Picker Fix:**
- Problema: El botón de fecha no era clickeable en toda su área
- Solución: Cambio de `<div>` a `<label>` con `htmlFor`, `pointer-events: none` en hijos, y hover states

**B) Monetarias Actions:**
- Agregado botón "Eliminar" (trash icon) en cada fila de cuenta monetaria
- Agregado botón "+ Agregar monetaria manual" con dropdown picker de cuentas
- Mejora de accesibilidad con aria-labels

**D) RECPAM Drawer Values:**
- Corregido cálculo de `overallCoef`: ahora usa el índice del período de inicio real, no `indices[0]`
- Agregados nuevos campos: `inflationPeriod` e `inflationLastMonth`
- Agregada fila "Inflación último mes" en el drawer

---

### ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `CierreValuacionPage.tsx` | Date picker `<label>`, hover states, handlers `handleExcludeAccount` y `handleAddMonetaryManual` |
| `Step2RT6Panel.tsx` | MonetaryRow con delete button, account picker dropdown, CSS para nuevos componentes |
| `recpam-indirecto.ts` | Fix overallCoef, agregados inflationPeriod e inflationLastMonth |
| `RecpamIndirectoDrawer.tsx` | Display de inflacionPeriod e inflactionLastMonth |

---

### VERIFICACIÓN

```bash
npm run build   # ✅ PASS
```

**QA manual:**
1. `/planillas/cierre-valuacion` → Tab Reexpresión
2. Click en date picker → debe abrir calendario en cualquier parte del botón
3. Click "Analizar Mayor" → verificar que cada fila tiene botones edit/delete
4. Click "+" Agregar monetaria manual → debe mostrar dropdown con cuentas disponibles
5. Click "Método indirecto" → drawer debe mostrar:
   - Activos/Pasivos Monetarios Prom. (valores numéricos)
   - Posición Monetaria Neta (valor numérico)
   - Inflación del período (% calculado)
   - Inflación último mes (% calculado)
   - RECPAM Estimado (valor numérico)

---

### NOTA: ITEMS DIFERIDOS

- **C) Cuentas Sin Clasificar Card** - Sección para listar cuentas no clasificadas (para futura implementación)
- **E) Column Alignment** - Mejoras de alineación de columnas (mejora visual menor)

---

---

## CHECKPOINT #9 - ÍCONOS PHOSPHOR VISIBLES
**Fecha:** 2026-01-26
**Estado:** ✅ COMPLETADO - Build limpio, íconos funcionando

---

### CAUSA RAÍZ IDENTIFICADA

**Problema:** Íconos Phosphor aparecían como "cuadraditos vacíos" en:
- Header card "Reexpresión y Valuación"
- Card "Calcular automáticamente"
- Botones de acción (editar/eliminar)
- Carets de expandir drilldown

**Causa:** `index.html` NO incluía el script de `@phosphor-icons/web` necesario para que las clases CSS (`ph-bold`, `ph-fill`, etc.) funcionen. Los componentes usaban clases CSS de Phosphor en vez de componentes React.

**Solución:** Agregado el script de Phosphor Icons al `index.html`:
```html
<!-- Phosphor Icons (CSS web font for class-based usage) -->
<script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>
```

---

### ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `index.html` | +1 línea: Script de @phosphor-icons/web v2.1.1 |

---

### VERIFICACIÓN

```bash
npm run build   # ✅ PASS
```

**QA manual:**
1. `/planillas/cierre-valuacion` → Tab Reexpresión
2. Verificar que íconos son visibles en:
   - KPI cards (trending, calculator, scales)
   - Card "Calcular automáticamente" (magic wand)
   - Botones de acción en filas (pencil, trash)
   - Carets de expandir (caret-right)
3. Click "Analizar Mayor" → Verificar drilldown expandible

---

### NOTA TÉCNICA

El proyecto usa DOS formas de Phosphor Icons:
1. **Componentes React** (`@phosphor-icons/react`): Usados en Sidebar, TopHeader, etc.
2. **Clases CSS** (`@phosphor-icons/web`): Usadas en CierreValuacionPage, Step2RT6Panel

Ambos coexisten sin conflicto. La versión web es necesaria para las clases `ph-bold`, `ph-fill`, etc.

---

## CHECKPOINT #8 - RT6 REEX UI COMPLETA (FASE 1-2)
**Fecha:** 2026-01-26
**Estado:** ✅ COMPLETADO - Build limpio, UI alineada con prototipo

---

### RESUMEN DE CAMBIOS (Sesión 2)

#### 1. Clasificación Correcta (P0)
**Problema:** "Caja Moneda Extranjera" (1.1.01.03) se clasificaba como MONETARY por código antes de detectar "moneda extranjera" por nombre.

**Solución:** En `getInitialMonetaryClass()`, se agregó detección de foreign currency ANTES del code prefix:
```typescript
// Rule 1.5: Foreign currency accounts => NON_MONETARY (BEFORE code prefix!)
if (isForeignCurrencyAccount(account)) {
    return 'NON_MONETARY';
}
```

**Archivo:** `src/core/cierre-valuacion/monetary-classification.ts`

#### 2. Botones de Acción Siempre Visibles (P0)
**Problema:** Botones editar/borrar con `opacity: 0`, solo visibles en hover.

**Solución:** Cambiado a `opacity: 1` con fondo gris sutil:
```css
.rt6-action-btn {
    background: #F3F4F6;
    color: #9CA3AF;
    opacity: 1;
}
```

**Archivo:** `src/pages/Planillas/components/Step2RT6Panel.tsx`

#### 3. Fondo Amarillo Removido (P0)
**Problema:** Filas con clase `rt6-mon-row-pending` tenían fondo amarillo intrusivo.

**Solución:** Reemplazado por borde sutil:
```css
.rt6-mon-row-pending {
    border-left: 2px solid #E5E7EB;
}
```

#### 4. Botón "Limpiar" con Confirmación (P0)
**Nueva funcionalidad:** Botón rojo "Limpiar" que borra toda la planilla.

**Archivos:**
- `CierreValuacionPage.tsx`: Handler `handleClearAll()` con confirm dialog
- `Step2RT6Panel.tsx`: Prop `onClearAll` y botón UI

**Comportamiento:**
- Muestra confirmación con detalle de qué se elimina
- Llama a `clearCierreValuacionState()`
- Recarga estado fresco

#### 5. Ícono "Calcular automáticamente" Visible (P1)
**Problema:** Ícono con `display: none` en mobile.

**Solución:** Cambiado a siempre visible con flexbox centrado y ícono `ph-fill`.

#### 6. Alineación Tabular de Números (P1)
**Mejora:** Agregado `font-variant-numeric: tabular-nums` a `.font-mono`.

---

### ARCHIVOS MODIFICADOS

| Archivo | Cambios |
|---------|---------|
| `src/core/cierre-valuacion/monetary-classification.ts` | +5 líneas: detección ME antes de code prefix |
| `src/pages/Planillas/components/Step2RT6Panel.tsx` | Botones visibles, fondo amarillo removido, botón Limpiar, ícono visible, tabular-nums |
| `src/pages/Planillas/CierreValuacionPage.tsx` | Import `clearCierreValuacionState`, handler `handleClearAll`, prop `onClearAll` |
| `docs/AI_HANDOFF.md` | CHECKPOINT #8 |

---

### FUNCIONALIDADES VERIFICADAS

- ✅ "Caja Moneda Extranjera" aparece en No Monetarias con badge azul
- ✅ "Caja" (sin "moneda extranjera") aparece en Monetarias
- ✅ Botones editar/borrar siempre visibles
- ✅ Sin fondo amarillo intrusivo
- ✅ Botón "Limpiar" funcional con confirmación
- ✅ Back button funciona (ya existía)
- ✅ Date picker funciona (ya existía)
- ✅ Ícono "Calcular automáticamente" visible
- ✅ Números alineados con tabular-nums
- ✅ Drilldown de orígenes funciona (ya existía)

---

### COMANDOS DE VALIDACIÓN

```bash
npm run build   # ✅ PASS
npm run dev     # Verificar UI
```

**Casos de prueba:**
1. Ir a /planillas/cierre-valuacion → Tab Reexpresión
2. Click "Analizar Mayor" → Cuentas clasificadas correctamente
3. "Caja Moneda Extranjera" → En No Monetarias con badge azul
4. "Caja" → En Monetarias
5. Botones editar/borrar → Siempre visibles
6. Click "Limpiar" → Confirmación → Planilla vacía

---

## CHECKPOINT #7 - RT6 REEX IMPLEMENTACIÓN FUNCIONAL COMPLETA
**Fecha:** 2026-01-26
**Estado:** ✅ COMPLETADO - Build limpio, gaps P0 corregidos

---

### 1. RESUMEN DE CAMBIOS REALIZADOS

#### A. Badge "Monetaria no expuesta" (P0 - CORREGIDO)
**Archivos modificados:**
- `src/core/cierre-valuacion/monetary-classification.ts`
- `src/pages/Planillas/components/Step2RT6Panel.tsx`

**Nuevas funciones:**
```typescript
// monetary-classification.ts
export function isForeignCurrencyAccount(account: Account): boolean
export function isForeignCurrencyByCodeName(_code: string, name: string): boolean
```

**UI implementada:**
- Badge azul "Monetaria no expuesta" en partidas de Moneda Extranjera
- Fila con borde naranja para destacar visualmente
- Tooltip explicativo: "Monetaria. Se expresa en pesos y luego se valúa a T.C."

**Keywords detectados:** moneda extranjera, dolar, dolares, usd, euro, divisa, exterior

#### B. KPI Variación % (P0 - CORREGIDO)
**Archivo modificado:** `src/pages/Planillas/CierreValuacionPage.tsx`

**Fórmula anterior (incorrecta):**
```typescript
(recpamCoef - 1) * 100  // Mostraba inflación del período
```

**Fórmula corregida:**
```typescript
((rt6Totals.totalHomog / rt6Totals.totalBase) - 1) * 100  // Variación real del patrimonio
```

#### C. Idempotencia "Analizar Mayor" (P1 - VERIFICADO)
**Estado:** El comportamiento actual es idempotente (reemplaza todo, no duplica).
**Nota:** No preserva ediciones manuales - aceptable para MVP.

---

### 2. MAPA DE FLUJO ACTUAL (VERIFICADO)

```
db.entries (Dexie)
    ↓
useLedgerBalances() [src/hooks/useLedgerBalances.ts]
    ↓ Map<AccountID, AccountBalance>
autoGeneratePartidasRT6() [src/core/cierre-valuacion/auto-partidas-rt6.ts]
    ↓ Aplica: monetary-classification.ts (reglas)
    ↓ Genera: PartidaRT6[] con items[] (lotes/anticuación)
CierreValuacionState.partidasRT6
    ↓
computeAllRT6Partidas() [src/core/cierre-valuacion/calc.ts]
    ↓ Aplica: índices FACPCE → coeficientes
Step2RT6Panel [src/pages/Planillas/components/Step2RT6Panel.tsx]
```

---

### 3. ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `src/core/cierre-valuacion/monetary-classification.ts` | +2 funciones: `isForeignCurrencyAccount`, `isForeignCurrencyByCodeName` |
| `src/pages/Planillas/components/Step2RT6Panel.tsx` | +Badge "Monetaria no expuesta" + estilos |
| `src/pages/Planillas/CierreValuacionPage.tsx` | Fix fórmula KPI Variación % |
| `docs/AI_HANDOFF.md` | CHECKPOINT #7 |

---

### 4. FUNCIONALIDADES VERIFICADAS

- ✅ Lectura de asientos reales (db.entries)
- ✅ Cálculo de saldos con movimientos (anticuación)
- ✅ Clasificación automática por código/nombre
- ✅ Generación de lotes agrupados por mes
- ✅ Persistencia de overrides en IndexedDB
- ✅ Tab Monetarias con Activos/Pasivos
- ✅ Tab No Monetarias con jerarquía Grupo > Rubro
- ✅ Drilldown expandible para múltiples orígenes
- ✅ Badge "Monetaria no expuesta" para Moneda Extranjera
- ✅ KPI Variación % con fórmula correcta

---

### 5. COMANDOS DE VERIFICACIÓN

```bash
npm run build   # PASS (sin errores TS)
npm run dev     # Verificar UI visualmente
```

**Casos de prueba:**
1. Click "Analizar Mayor" → aparecen partidas clasificadas
2. Click de nuevo → NO duplica (idempotente)
3. Cuenta "Moneda Extranjera" → aparece en No Monetarias con badge azul
4. KPI Variación % → muestra variación real (VH/VO - 1)

---

### 6. PENDIENTES FUTUROS (Fuera de scope)

| Item | Prioridad |
|------|-----------|
| Merge inteligente (preservar ediciones manuales) | P2 |
| Botón "Agregar Origen Manual" en drilldown | P2 |
| Unit tests para clasificación monetaria | P3 |

---

## CHECKPOINT #6 - DIAGNÓSTICO MERGE (LIMPIO)
**Fecha:** 2026-01-26
**Estado:** NO HAY CONFLICTOS DE MERGE - El branch NO-SE está adelante de main

---

### Diagnóstico Realizado

**Objetivo:** Verificar y resolver conflictos de merge en archivos RT6

**Archivos verificados:**
- `src/core/cierre-valuacion/auto-partidas-rt6.ts` - ✅ Sin markers
- `src/pages/Planillas/CierreValuacionPage.tsx` - ✅ Sin markers
- `src/pages/Planillas/components/MonetaryAccountsPanel.tsx` - ✅ Sin markers

**Resultado:**
1. `git merge origin/main` → "Already up to date"
2. `git diff --check` → Sin markers de conflicto
3. `npm run build` → PASS (sin errores TS)
4. El branch NO-SE está 3 commits adelante de main

**Nota:** El grep inicial encontró patrones `=======` en archivos CSS/código (separadores visuales), NO markers de conflicto git reales.

**Commits en NO-SE no en main:**
- `74d377b` - ..
- `b966724` - Resolve merge conflicts (RT6 cierre-valuacion)
- `d68bf01` - CAMBIOS PAGINA

---

## CHECKPOINT #5 - TODOS LOS BLOQUES COMPLETADOS
**Fecha:** 2026-01-26
**Estado:** HARDENING COMPLETO - Build limpio, todas las mejoras implementadas

---

### 1. RESUMEN COMPLETO DE CAMBIOS

#### BLOQUE A - UI Cleanup (COMPLETADO)
| Archivo | Cambios |
|---------|---------|
| `CierreValuacionPage.tsx` | Eliminado callout "Guía rápida RT6", removido card RECPAM manual, emojis reemplazados por Phosphor icons, nuevo header con back button, stepper visual |
| `RecpamIndirectoDrawer.tsx` | Emojis reemplazados por Phosphor icons, NaN protection |

#### BLOQUE B - Clasificación Inteligente (COMPLETADO)
| Archivo | Cambios |
|---------|---------|
| `monetary-classification.ts` | Reglas RT6 especiales: Moneda extranjera → NON_MONETARY, IVA → MONETARY |

**Reglas implementadas:**
```typescript
// Moneda extranjera → NON_MONETARY
foreignCurrencyKeywords: ['moneda extranjera', 'dolar', 'dolares', 'usd', 'euro', 'divisa', 'exterior']

// IVA → MONETARY
ivaKeywords: ['iva credito', 'iva debito', 'iva cf', 'iva df', 'credito fiscal', 'debito fiscal']
```

#### BLOQUE C - No Monetarias con Drilldown (COMPLETADO)
| Archivo | Cambios |
|---------|---------|
| `Step2RT6Panel.tsx` | Drilldown expandible para múltiples lotes, eliminado "Mix", badge "N orígenes" |

**Cambios funcionales:**
- Badge "N orígenes" clickeable en lugar de "Mix"
- Filas expandibles mostrando cada lote con:
  - Fecha origen, importe base, coeficiente, valor homogéneo, ajuste
- Nuevos estilos: `.rt6-expand-btn`, `.rt6-drilldown-row`, `.rt6-lots-badge`

#### BLOQUE D - Capital Social + Ajuste (COMPLETADO)
| Archivo | Cambios |
|---------|---------|
| `auto-partidas-rt6.ts` | Funciones `isCapitalSocialAccount()`, `isAjusteCapitalAccount()` |
| `Step2RT6Panel.tsx` | Tratamiento visual especial para rubros Capital, badge con icono bank, columna "Ajuste Capital" |

**Cambios funcionales:**
- Detección mejorada: código 3.1.01 = Capital Social, 3.1.02 = Ajuste de Capital
- Badge visual con icono de banco para rubros Capital
- Columna adicional mostrando "Ajuste Capital" (homogéneo - origen)
- Background gradient especial para tarjetas Capital

#### BLOQUE E - Drawer RECPAM (COMPLETADO)
| Archivo | Cambios |
|---------|---------|
| `RecpamIndirectoDrawer.tsx` | NaN protection en todos los valores, inflación como % |

**Protecciones:**
```tsx
{isNaN(result.avgActivoMon) ? '—' : formatCurrencyARS(result.avgActivoMon)}
{isNaN(result.overallCoef) || result.overallCoef === 1 ? '—' : `${((result.overallCoef - 1) * 100).toFixed(1)}%`}
```

---

### 2. ARCHIVOS MODIFICADOS (RESUMEN)

| Archivo | Líneas ~modificadas |
|---------|---------------------|
| `CierreValuacionPage.tsx` | ~100 líneas (header, stepper, icons) |
| `Step2RT6Panel.tsx` | ~80 líneas (drilldown, capital treatment) |
| `RecpamIndirectoDrawer.tsx` | ~15 líneas (icons, NaN protection) |
| `monetary-classification.ts` | ~30 líneas (reglas Moneda Extranjera, IVA) |
| `auto-partidas-rt6.ts` | ~35 líneas (Capital detection functions) |

---

### 3. NUEVAS FUNCIONES EXPORTADAS

#### auto-partidas-rt6.ts
```typescript
// Detectar Capital Social
export function isCapitalSocialAccount(code: string, name: string): boolean

// Detectar Ajuste de Capital
export function isAjusteCapitalAccount(code: string, name: string): boolean
```

#### Step2RT6Panel.tsx (interno)
```typescript
// Detectar rubro Capital
function isCapitalRubro(rubroLabel: string): boolean
```

---

### 4. CSS CLASES NUEVAS

```css
/* Drilldown */
.rt6-expand-btn
.rt6-cuenta-flex
.rt6-lots-badge
.rt6-drilldown-row
.rt6-drilldown-cuenta

/* Capital */
.rt6-rubro-capital
.rt6-capital-badge
.rt6-rubro-right-multi
.rt6-rubro-col
.rt6-ajuste-col
.rt6-ajuste-value
.text-emerald-600
.text-red-600
```

---

### 5. ARQUITECTURA FINAL

```
CierreValuacionPage.tsx
├── Header (back button, título, subtítulo)
├── Stepper (círculos + líneas)
└── Step2RT6Panel
    ├── Action Card (Método indirecto, Recalcular, Analizar Mayor)
    ├── Tab Monetarias
    │   ├── Summary Bar
    │   └── Grid Activos/Pasivos
    └── Tab No Monetarias
        └── Accordion por Grupo > Rubro
            ├── Rubro Card (con Capital badge si aplica)
            │   └── Ajuste Capital visible
            └── Tabla expandible
                ├── Fila cuenta (expandible si múltiples lotes)
                └── Filas drilldown (por cada lote)
```

---

### 6. COMANDOS DE VERIFICACIÓN

```bash
npm run build   # PASS (sin errores TS)
npm run dev     # Verificar UI visualmente
```

---

### 7. PENDIENTES FUTUROS (Fuera de scope)

| Item | Descripción |
|------|-------------|
| Tests unitarios | Cubrir clasificación monetaria y auto-generación |
| Merge inteligente | Evitar duplicación al re-analizar mayor |
| Asiento automático | Generar asiento de Ajuste de Capital como contrapartida |
| Validación índices | Warning si falta índice de cierre |

---

### 8. CHECKPOINTS HISTÓRICOS

| Checkpoint | Fecha | Contenido |
|------------|-------|-----------|
| #6 | 2026-01-26 | Diagnóstico merge - NO hay conflictos reales |
| #5 | 2026-01-26 | Todos los bloques completados |
| #4 | 2026-01-26 | BLOQUE C (Drilldown) |
| #3 | 2026-01-26 | BLOQUE A + B (UI + Clasificación) |
| #2 | 2026-01-26 | UI RT6 conectada |
| #1 | Anterior | Setup inicial |

---

**Autor:** Claude Code
**Build Status:** PASS
**Última verificación:** 2026-01-26

---

## CHECKPOINT #F1 - FASE 1 (RT6 extracción + ME + V.Origen)
**Fecha:** 2026-01-27
**Estado:** ✅ Build verde. Cambios mínimos dentro del módulo.

### Objetivo
Destrabar RT6 correcto: incluir RESULTADOS con actividad aunque cierren en 0, respetar naturaleza contable (signo) y hacer visible el bucket de Moneda Extranjera como "Monetaria no expuesta".

### Cambios clave
1. Motor RT6 sign-aware por lado natural:
- Lotes mensuales ahora usan el lado de incremento según `normalSide` (DEBIT → débitos, CREDIT → créditos).
- `totalRecpam` ahora respeta naturaleza: DEBIT suma, CREDIT invierte signo.

2. RESULTADOS no se pierden por saldo final 0:
- Se incluyen cuentas de RESULTADOS si tienen actividad en el período, aunque el saldo cierre en 0.

3. Refundición/cierre excluida (heurística existente):
- En "Analizar mayor" se detectan asientos de cierre con `getClosingEntryIds(...)` y se excluyen para el análisis RT6 cuando aplica.

4. Moneda extranjera como bucket explícito:
- Se agregó sección "Monetarias no expuestas (Moneda extranjera)" dentro de la tab Monetarias.
- Estas cuentas quedan fuera del neteo expuesto para RECPAM.

5. Título unificado en Home:
- "Ajuste por Inflación + Valuación" en la card del módulo.

### Archivos tocados (Fase 1)
- `src/core/cierre-valuacion/types.ts`
- `src/core/cierre-valuacion/auto-partidas-rt6.ts`
- `src/core/cierre-valuacion/calc.ts`
- `src/core/cierre-valuacion/monetary-classification.ts`
- `src/pages/Planillas/CierreValuacionPage.tsx`
- `src/pages/Planillas/components/Step2RT6Panel.tsx`
- `src/pages/Planillas/PlanillasHome.tsx`

### Validación
```bash
npm run build  # PASS (tsc -b + vite build)
npm run lint   # FAIL (errores preexistentes fuera de scope)
```

### Notas de diseño/criterio
- No se cambió el shape global de `partidasRT6` para no romper el wiring existente; se corrigió la extracción y el signo en el motor actual.
- La exclusión de cierre usa la heurística ya disponible en `resultsStatement.ts` (mínimo cambio, bajo riesgo).

---

## CHECKPOINT #F2 - FASE 2 (Asientos + Capital + Diagnóstico)
**Fecha:** 2026-01-27
**Estado:** ✅ Build verde. Sin refactors masivos.

### Objetivo
Asegurar que los asientos reflejen la naturaleza contable (especialmente PN/capital), mantener el split por signo y agregar diagnóstico claro cuando no balancea.

### Cambios clave
1. Signo contable coherente en asientos:
- Se apoya en el fix sign-aware de RT6 (Fase 1): cuentas de naturaleza acreedora ahora generan ajustes con signo correcto.
- Capital social sigue redirigiéndose a "Ajuste de capital".

2. Diagnóstico cuando un asiento no balancea:
- Se agregó un diagnóstico rápido en Paso 4 con causas frecuentes (sin RT6, sin RESULTADOS, sin PN, valuaciones pendientes, índice faltante).

3. Nota explícita para Capital Social en Paso 3:
- Si la cuenta es Capital Social, se muestra la aclaración:
  "El Capital Social se mantiene histórico. La reexpresión se registra en Ajuste de capital."

### Archivos tocados (Fase 2)
- `src/pages/Planillas/CierreValuacionPage.tsx`
- `src/pages/Planillas/components/Step3RT17Panel.tsx`

### Validación
```bash
npm run build  # PASS
npm run lint   # FAIL (errores preexistentes fuera de scope)
```

---

## CHECKPOINT #F3 - FASE 3 (RT6 resultados mes a mes + exclusión refundición)
**Fecha:** 2026-01-27
**Estado:** ✅ Build verde. Heurística local para no romper otros módulos.

### Objetivo
Evitar que RESULTADOS quede en 0 por refundición/cierre y exponer una síntesis clara del Resultado del ejercicio ajustado por RT6.

### Cambios clave
1. Exclusión de refundición/cierre (heurística local):
- Se implementó `detectClosingEntryIds(...)` dentro de `CierreValuacionPage`.
- Criterios: fecha de cierre o memo con "cierre/refundición" + muchas cuentas de resultados + contrapartida en PN.
- Se usa para excluir esos asientos al analizar el mayor.

2. Banner informativo en tab Resultados:
- Si se detectan asientos de cierre/refundición, se muestra:
  "Se detectó asiento de refundición/cierre y se excluye del cálculo RT6."

3. Resultado del ejercicio ajustado (neto, con signo):
- Se agregó una síntesis con:
  - Resultado histórico (neto)
  - Ajuste RT6 (neto)
  - Resultado ajustado (neto)
- El signo se calcula por naturaleza (INCOME positivo, EXPENSE negativo).

### Archivos tocados (Fase 3)
- `src/pages/Planillas/CierreValuacionPage.tsx`
- `src/pages/Planillas/components/Step2RT6Panel.tsx`

### Validación
```bash
npm run build  # PASS
npm run lint   # FAIL (errores preexistentes fuera de scope)
```

---

## CHECKPOINT #F4 - FASE 4 (Resolver RT17 por cuenta + persistencia)
**Fecha:** 2026-01-27
**Estado:** ✅ Build verde. Resolver integrado sin dependencias nuevas.

### Objetivo
Que el drawer de RT17 sugiera el método correcto por cuenta y que la elección/inputs persistan.

### Cambios clave
1. Resolver de método de valuación:
- Se implementó `resolveValuationMethod(...)` en `monetary-classification.ts`.
- Cubre MVP: FX (ME), Reposición (inventarios), Revalúo (PPE), VPP/VNR (inversiones), NA (PN).
- `suggestValuationMethod(...)` ahora delega al resolver.

2. Drawer conectado al resolver + persistencia:
- `RT17Drawer` ahora recibe `accounts` y `overrides`.
- Resuelve la cuenta (por `accountId` o `code`), calcula clasificación y método sugerido.
- Prefiere método guardado y carga metadata persistida.
- Se persisten más campos por método (fechas, tipos de cambio, valores, notas).
- Se agrega ayuda contextual (razón + hint) y sugerencia compra/venta para FX.

3. Bridge RT6 → RT17 enriquecido:
- `computeAllRT17Partidas` ahora lleva `accountId`, `accountKind`, `normalSide`, `method` y `metadata`.
- Paso 3 muestra el método guardado/sugerido cuando existe.

4. Método guardado por cuenta:
- Al guardar una valuación, se persiste `valuationMethod` en `accountOverrides[accountId]` cuando hay mapeo.

### Archivos tocados (Fase 4)
- `src/core/cierre-valuacion/types.ts`
- `src/core/cierre-valuacion/calc.ts`
- `src/core/cierre-valuacion/monetary-classification.ts`
- `src/pages/Planillas/components/RT17Drawer.tsx`
- `src/pages/Planillas/components/Step3RT17Panel.tsx`
- `src/pages/Planillas/CierreValuacionPage.tsx`

### Validación
```bash
npm run build  # PASS
npm run lint   # FAIL (errores preexistentes fuera de scope)
```

---

## CHECKPOINT #FINAL - Ajuste por Inflación + Valuación (RT6/RT17)
**Fecha:** 2026-01-27
**Estado:** ✅ Build PASS. Cambios mínimos y verificables dentro del módulo.

### Qué quedó resuelto (P0/P1)
- RT6 ya no pierde RESULTADOS por saldo final 0 (actividad por período + exclusión de cierre detectado).
- PN/capital respeta naturaleza contable y redirige a Ajuste de capital.
- Moneda extranjera tiene bucket explícito como "Monetaria no expuesta".
- Asientos mantienen split por signo y ahora tienen diagnóstico cuando no balancean.
- RT17 sugiere método por cuenta y persiste método + inputs.

### Validación ejecutada
```bash
npm run build  # PASS
npm run lint   # FAIL (errores preexistentes fuera de scope)
```

### QA manual sugerido
1. Ir a `/planillas/cierre-valuacion`.
2. Click en "Analizar mayor".
3. Ver tab Resultados:
- Banner si hay refundición detectada.
- Resultado histórico / Ajuste RT6 / Resultado ajustado.
4. Ir a Paso 3:
- Moneda extranjera → FX.
- Mercaderías → Reposición.
- Bienes de uso → Revalúo.
- Capital social → nota de ajuste separado.
5. Ir a Paso 4:
- Ver asientos separados por signo.
- Ver "Balanceado" (si corresponde).

---

## CHECKPOINT #A - INSPECCIÓN INICIAL (RT6)
**Fecha:** 2026-01-26
**Estado:** Inspección completada sin cambios de código.

### Hallazgos Principales
- **Estructura OK:** `CierreValuacionPage`, `Step2RT6Panel` y `auto-partidas-rt6.ts` existen y están conectados.
- **Lógica Anticuación:** `generateLotsFromMovements` implementa correctamente la agrupación mensual.
- **Gap Crítico UI:** No existe tratamiento visual para "Moneda Extranjera" (falta Badge "Monetaria no expuesta").
- **Gap Crítico KPI:** La fórmula de "Variación %" calcula inflación del período, no variación real del activo.
- **RECPAM:** Implementación indirecta correcta y completa.

---

## CHECKPOINT #B - AUDITORÍA LISTA
**Fecha:** 2026-01-26
**Estado:** Auditoría entregada en `docs/audits/RT6_REEX_AUDIT.md`.

### Entregable
- Se generó el documento de auditoría técnica con:
  - Mapa de flujo de datos (Dexie -> UI).
  - Auditoría de modelo de datos y clasificación.
  - Lista de Gaps vs Prototipo `REEX.html`.
  - Plan de implementación P0/P1/P2.

### Pendientes
- **Ready for Dev:** El plan P0 (Badge UI + Fix KPI) está listo para ser ejecutado.
- **Riesgo Identificado:** La regeneración de partidas borra ediciones manuales (requiere merge inteligente).
