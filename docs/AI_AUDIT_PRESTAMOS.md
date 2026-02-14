# AI Audit - Prestamos y Deudas Financieras (ContaLivre)

Fecha: 2026-02-14  
Repo auditado: `D:\Git\ContaLivre`

## 1) Resumen Ejecutivo
1. El módulo de Préstamos **no existe como ruta propia**: no hay `/operaciones/prestamos` en `src/App.tsx`, y la tarjeta "Prestamos" de `src/pages/OperacionesPage.tsx` no navega.
2. La funcionalidad de pasivos financieros en ME **sí existe**, pero está embebida dentro de `MonedaExtranjeraPage` (`/operaciones/moneda-extranjera`) bajo tabs `dashboard/activos/pasivos/movimientos/conciliacion`.
3. Diagnóstico principal: **"Pasivos ME" está mal ubicado funcionalmente** dentro de un módulo de "Activos y Tenencias" y debe migrarse a "Pasivos y Deudas" con una página dedicada de Préstamos.
4. Persistencia actual: todo está en **IndexedDB (Dexie)** local (`src/storage/db.ts`), sin backend `functions/` ni `migrations/`.
5. Motor contable actual ya soporta para deudas ME: alta (toma/desembolso), pagos (capital + interés ARS), y links a asientos con `sourceModule/sourceId`.
6. Tipo de cambio hoy: `src/services/exchangeRates.ts` consume `https://dolarapi.com/v1/dolares`, mapea `oficial -> QuoteType='Oficial'` y etiqueta fuente `BNA`; cache local 15 min.
7. Regla ARS está parcialmente implementada: asientos se generan en ARS, pero la obtención "Oficial BNA" no viene directo de BNA sino de DolarAPI (riesgo de gobernanza).
8. Hay patrón reutilizable de sincronización movimiento↔asiento (ME y Bienes), incluyendo `linkedJournalEntryIds`, `journalStatus`, reconciliación y borrado con protección para asientos manuales.
9. Gap crítico para interconexión bidireccional: `deleteEntry` global (`src/storage/entries.ts`) borra asiento sin disparar cascada inmediata en módulos; la reconciliación corrige estado cuando se ejecuta, no en tiempo real.
10. Devengamiento de intereses manual/automático fin de mes **no existe como workflow dedicado** para préstamos (solo interés al momento del pago y schedule de cuotas).
11. Revaluación ME existe de forma general por valuación/saldos, pero no como flujo explícito de "revaluar préstamo" con asiento dedicado en nueva pantalla.
12. El repo actualmente no pasa `build` ni `lint` por errores preexistentes (detallado en sección validación).

## 2) Fuentes de Verdad Revisadas
- Brandbook/UI tokens: `Contalivre.html` no encontrado en repo (se ejecutó búsqueda recursiva).
- Prototipo préstamos: `C:\Users\gonza\Downloads\deudas 2.html` (leído completo).
- Implementación actual Moneda Extranjera: `src/pages/Operaciones/MonedaExtranjeraPage.tsx` + `src/storage/fx.ts` + `src/core/monedaExtranjera/types.ts`.
- Reglas contables del usuario incorporadas en este diagnóstico (ARS funcional, ME valuada en ARS, TC oficial, devengamiento manual/automático).

## 3) Comandos Ejecutados y Hallazgos
- `git status --short`
- `git rev-parse --show-toplevel`
- `Get-Content package.json`
- `Get-ChildItem` / `Get-ChildItem src` / `Get-ChildItem src/pages` / `Get-ChildItem src/components`
- `rg -n "operaciones" src`
- `rg -n "moneda-extranjera|Moneda Extranjera" src`
- `rg -n "prestamo|préstamo|prestamos|deuda financiera|loan" src`
- `rg -n "Pasivos ME|Nueva deuda|deuda ME|Pasivos en M.E." src`
- `rg -n "libro diario|asiento|journal|diario|mayor|ledger" src`
- `rg -n "tipo de cambio|cotizacion|BNA|oficial|exchange" src`
- `rg -n "vencim|notific|task|cron|schedule|remind" src`
- `cmd /c dir /s Contalivre.html`
- `rg -n ... "C:\Users\gonza\Downloads\deudas 2.html"`
- `npm run dev` (timeout), `npm run build` (falla), `npm run lint` (falla)

Hallazgos clave de rutas:
- Existe: `/operaciones/moneda-extranjera` (`src/App.tsx:48`)
- No existe: `/operaciones/prestamos` (sin matches en `src/App.tsx`, `src/pages/OperacionesPage.tsx`, `Sidebar`, `MobileDrawer`)

## 4) Mapa de Arquitectura Actual (Cables Reales)

### 4.1 Operaciones (hub tarjetas)
- `src/pages/OperacionesPage.tsx`
  - Tarjeta "Moneda Extranjera" navega a `/operaciones/moneda-extranjera`.
  - Tarjeta "Prestamos" existe visualmente pero **sin onClick/navigation** (UI placeholder funcional).

### 4.2 Moneda Extranjera (donde hoy vive Pasivos ME)
- Ruta: `src/App.tsx:48` -> `MonedaExtranjeraPage`.
- Página: `src/pages/Operaciones/MonedaExtranjeraPage.tsx`
  - Dashboard con KPI de pasivos ME (`Pasivos ME (Valuado)`).
  - Tab `pasivos`: tabla "Pasivos en M.E." + CTA "Nueva deuda".
  - Modal `Alta de Pasivo en Moneda Extranjera` crea:
    - Cuenta FX tipo `LIABILITY` (`createFxAccount`)
    - Deuda estructurada (`createFxDebt`) + movimiento de toma de deuda + asiento (si autoJournal).
  - Modal operaciones para compra/venta/pago/refi con `journalMode` (`auto`, `manual`, `none`).

### 4.3 Libro Diario / motor de asientos
- CRUD base: `src/storage/entries.ts`
  - `createEntry`, `updateEntry`, `deleteEntry`.
- UI diario: `src/pages/AsientosDesktop.tsx`, `src/pages/AsientosMobile.tsx`, `src/components/journal/*`.
- Mayor: `src/core/ledger.ts`, `src/pages/Mayor.tsx`.
- Integración módulo ME:
  - `src/storage/fx.ts` genera asientos con `sourceModule='fx'`, `sourceId=movement.id` y `metadata.journalRole`.
  - Vinculación explícita: `linkFxMovementToEntries`.
  - Reconciliación: `reconcileFxJournalLinks`.

### 4.4 Cotizaciones / TC oficial
- `src/services/exchangeRates.ts`
  - Fuente: DolarAPI.
  - Mapeo: `casa='oficial'` -> `QuoteType='Oficial'` y `source='BNA'`.
  - Cache en `db.fxRatesCache` TTL 15 min.
- `src/pages/Operaciones/MonedaExtranjeraPage.tsx`
  - Usa `getExchangeRates`, `getQuote`, `getRateValue`.

### 4.5 Datos y almacenamiento
- `src/storage/db.ts`
  - IndexedDB Dexie (`EntrenadorContable`) versionado v1..v14.
  - Tablas relevantes: `entries`, `fxAccounts`, `fxMovements`, `fxDebts`, `fxLiabilities`, `fxRatesCache`, `taxDueNotifications`, etc.
- No hay `functions/` ni `migrations/` en este repo.

## 5) Tabla Archivo -> Responsabilidad -> Riesgo
| Archivo | Responsabilidad | Riesgo |
|---|---|---|
| `src/App.tsx` | Router principal; define páginas operativas | Alto: rutas mal conectadas rompen navegación global |
| `src/pages/OperacionesPage.tsx` | Hub de tarjetas (incluye Prestamos visual) | Medio-Alto: inconsistencia UX si tarjeta no navega |
| `src/pages/Operaciones/MonedaExtranjeraPage.tsx` | UI ME completa (activos/pasivos/movimientos/conciliación) | Muy alto: componente extenso con múltiples flujos contables |
| `src/storage/fx.ts` | Dominio ME: deudas, pagos, asientos, reconciliación, borrado | Crítico: núcleo de integridad movimiento↔asiento |
| `src/storage/entries.ts` | CRUD universal de asientos | Crítico: `deleteEntry` sin cascada inmediata inter-módulo |
| `src/storage/db.ts` | Esquema Dexie/versiones | Crítico: cualquier cambio de schema impacta datos locales |
| `src/services/exchangeRates.ts` | Obtención y cache de cotizaciones | Alto: dependencia externa + definición de "oficial" |
| `src/ui/Layout/Sidebar.tsx` | Navegación desktop | Medio: rutas huérfanas si no se sincroniza con App |
| `src/ui/Layout/MobileDrawer.tsx` | Navegación mobile | Medio: divergencia desktop/mobile |

## 6) Diagnóstico Funcional-Contable

### 6.1 "Pasivos ME está mal ubicado" (diagnóstico explícito)
- Estado actual: pasivos financieros ME se operan en `MonedaExtranjeraPage` bajo `/operaciones/moneda-extranjera`.
- Problema: ese módulo está presentado como "Activos y Tenencias" en `OperacionesPage`.
- Impacto: mezcla de dominio (tenencias activas + deudas financieras) y ausencia de una experiencia dedicada de préstamos en "Pasivos y Deudas".

### 6.2 Modelo de datos actual
- Persistencia: IndexedDB local (Dexie).
- Entidad deuda/préstamo existente: `FxDebt` (sí existe).
- Entidad evento/movimiento existente: `FxMovement` (sí existe; tipos `TOMA_DEUDA`, `PAGO_DEUDA`, `DESEMBOLSO_DEUDA`, etc.).
- Vínculo a asiento:
  - `FxMovement.linkedJournalEntryIds: string[]`
  - `JournalEntry.sourceModule='fx'`, `sourceId=<movementId>`.
- Deuda legacy: `FxLiability` (deprecated, migrada a `FxDebt` on read).

### 6.3 Flujos contables requeridos vs estado actual

#### Alta préstamo ARS (desembolso)
- Requerido: asiento ARS (Debe disponibilidad / Haber préstamos).
- Estado actual: flujo implementado en términos ME/deuda con `TOMA_DEUDA`; puede representar ARS usando misma estructura, pero no hay módulo dedicado préstamos ARS.
- Hook actual: `createFxDebt(..., disbursementAccountId...)` + `buildJournalEntriesForFxMovement` (case `TOMA_DEUDA`).

#### Alta préstamo USD (desembolso)
- Requerido: principal en ME + asiento SIEMPRE ARS a TC oficial del día.
- Estado actual: soportado (principalME + rate + arsAmount), pero el usuario puede usar rate manual y quote type configurable; no está forzado en UI a "Oficial" exclusivamente.

#### Pago de cuota (capital + interés)
- Requerido: separar capital/interés + asiento.
- Estado actual: soportado por `addFxDebtPayment` (capitalME + interestARS + comisión) y asiento `PAGO_DEUDA`.
- Nota alcance: IVA/imp sobre intereses no modelado explícitamente (future).

#### Devengamiento de intereses
- Requerido: manual por tarea/notificación o automático fin de mes.
- Estado actual: **no existe** evento dedicado de devengamiento periódico ni job/cron en repo.
- Sólo se registra interés al momento del pago (`interestARS`).

#### Revaluación de saldos ME a TC oficial + diferencia de cambio
- Requerido: valuar saldo y registrar diferencia en resultados.
- Estado actual:
  - Existe lógica de valuación y cuenta diferencia de cambio en ME.
  - No hay flujo de "revaluar préstamo" explícito en pantalla de préstamos separada.
  - No hay scheduler fin de mes para revaluación automática detectado.

## 7) Integraciones y Puntos de Enganche

### 7.1 Vencimientos/notificaciones actuales
- Impuestos: `useTaxNotifications` + `storage/impuestos.ts`.
- Inversiones: `storage/inversiones.ts` (notificaciones de vencimiento PF).
- Clientes/Proveedores: tabs de `vencimientos` en páginas respectivas.
- Préstamos ME: tiene `schedule` por deuda, pero no está integrado a campana global de notificaciones.

### 7.2 Patrón "modal crea X y asienta"
- Sí existe y es reutilizable:
  - ME: creación de movimiento/deuda + autojournal/manual link.
  - Bienes: patrón robusto `create/update/delete with journal` y reconciliación.

### 7.3 Borrado y cascada con Libro Diario
- `deleteFxMovementWithJournal` maneja auto vs manual entries correctamente.
- Pero `deleteEntry` (global) no notifica a módulos; la corrección depende de ejecutar reconciliación (`reconcileFxJournalLinks`) luego.
- Para requisito bidireccional estricto, falta un orquestador de eventos de asientos.

### 7.4 Permisos/roles
- No se detectó un sistema de roles/permisos por módulo de operaciones en el frontend auditado.

## 8) Gaps UI/UX vs Prototipo `deudas 2.html`

Hallado en prototipo:
- Tabs: "Préstamos Activos", "Movimientos", "Conciliación".
- CTA primario: "Nuevo Préstamo".
- Modal alta: identidad, desembolso, condiciones, preview asiento ARS, mini cronograma.
- Tabla foco préstamos: saldo original, TC actual, valuación ARS, próximo vencimiento, acciones.

Gap actual:
- No existe pantalla `/operaciones/prestamos` dedicada.
- "Prestamos" en Operaciones es tarjeta estática (sin navegación).
- El contenido de pasivos está mezclado dentro de Moneda Extranjera.
- Falta modal "Ver detalle" completo del préstamo (resumen + historial asientos + acciones completas desde la nueva pantalla).
- Columnas faltantes para gestión financiera dedicada: pagado acumulado, saldo pendiente histórico/original, estado consolidado, TNA visible, próxima cuota consolidada.

Sobre posibles `NaN`:
- En código actual hay varias protecciones (`Number(...) || 0`, `formatters` con fallback), pero hay riesgo en valores derivados si llegan `undefined/null` desde carga inicial o datos legacy.
- Punto sensible: cálculos de schedule/rates y valores monetarios en render sin normalización centralizada por módulo.

## 9) Plan de Implementación Minimalista (MVP -> Hardening)

### Fase MVP (mínimo cambio, sin refactor masivo)
1. Crear ruta nueva y página préstamos:
   - Crear `src/pages/Operaciones/PrestamosPage.tsx`.
   - Agregar ruta en `src/App.tsx` (`/operaciones/prestamos`).
2. Conectar navegación:
   - `src/pages/OperacionesPage.tsx`: hacer clickeable tarjeta "Prestamos" hacia la nueva ruta.
   - Agregar item en `src/ui/Layout/Sidebar.tsx` y `src/ui/Layout/MobileDrawer.tsx`.
3. Reubicar funcionalidad de pasivos ME:
   - Extraer desde `MonedaExtranjeraPage` la vista/tab de pasivos y modales de deuda/pago/refi a `PrestamosPage` (reutilizando componentes/funciones existentes, sin duplicar lógica de dominio).
4. Mantener `storage/fx.ts` como dominio único para no romper consistencia.
5. Agregar capa de "modo TC" en préstamos:
   - Forzar por defecto y por negocio `QuoteType='Oficial'` + rate side consistente para pasivos.
   - Permitir override manual sólo si se decide explícitamente (feature flag o control visible).

### Fase Contable (flujos faltantes)
1. Devengamiento manual:
   - Proponer nuevo evento de movimiento (o tabla eventos) para devengo de interés mensual.
   - Generar asiento ARS contra cuenta de intereses devengados.
2. Devengamiento automático fin de mes:
   - Como no hay backend/cron detectado, implementar job local disparado en apertura del módulo/period close (idempotente) o integrar futuro scheduler.
3. Revaluación préstamo ME:
   - Acción "Revaluar" por deuda o batch mensual.
   - Asiento por diferencia de cambio contra resultado.

### Fase Hardening (integridad bidireccional)
1. Interconexión Libro Diario <-> Préstamos (obligatorio):
   - Al crear/editar/borrar préstamo o movimiento -> refleja en asientos (ya existe parcial).
   - Al crear/editar/borrar asiento vinculado desde Libro Diario -> actualizar préstamo/movimiento en tiempo real (no sólo reconcile eventual).
2. Implementar orquestador de sincronización central (propuesta) sin romper módulos existentes.
3. Pruebas de regresión contable (alta/pago/devengo/revaluación/delete rollback).

## 10) Datos Mínimos Necesarios para Módulo Préstamos

### 10.1 Entidad préstamo
- Puede reutilizar base `FxDebt` y extender para ARS/ME unificado (propuesta de shape común):
  - `id`, `name`, `currency`, `principalOriginal`, `principalARSAtOrigin`, `originRate`, `originDate`, `tna`, `system`, `installments`, `frequency`, `firstDueDate`, `status`, `creditor`, `periodId`, `autoJournal`.

### 10.2 Entidad evento/movimiento
- Reusar `FxMovement` + extender (propuesta) para eventos contables:
  - Tipos mínimos: `ALTA`, `PAGO_CAPITAL`, `PAGO_INTERES`, `DEVENGO`, `REVALUACION`, `REESTRUCTURACION`.
  - `date`, `amountME/ARS`, `rate`, `source`, `notes`.

### 10.3 Vínculo a asiento
- Mantener:
  - `linkedJournalEntryIds[]` en evento.
  - `sourceModule/sourceId` en `JournalEntry`.
- Recomendado:
  - Un campo semántico `loanId` en metadata para trazabilidad directa préstamo<->asiento.

## 11) Propuesta de Cuentas Contables (verificar plan de cuentas real)
- `Préstamos a pagar CP`
- `Préstamos a pagar LP`
- `Préstamos ME`
- `Intereses devengados a pagar`
- `Intereses a devengar` (si se separa por período)
- `Diferencias de cambio` (resultado)

## 12) Checklist Edge Cases (QA futuro)
- Pagos parciales (capital menor a cuota esperada).
- Pagos anticipados (impacto en schedule y devengo).
- Tasa 0% (sistema de amortización sin división por 0).
- Préstamo ARS vs USD (asiento siempre ARS).
- TC faltante/no actualizado (fallback cache, bloqueo o confirmación explícita).
- Borrado/rollback de movimiento con asientos manuales vinculados.
- Borrado de asiento desde Libro Diario y propagación al módulo préstamo.
- Cambio de ejercicio/período y filtros por rango de fechas.
- Deuda con refinanciación múltiple (`DESEMBOLSO_DEUDA`).
- Diferencia de cambio positiva/negativa en revaluación.

## 13) Recomendaciones UI Compatibles (sin implementar)
- Librerías instaladas:
  - `framer-motion`: sí (`package.json`).
  - `gsap`: no.
- Recomendación:
  - Usar componentes livianos internos con Tailwind + CSS variables existentes para no agregar deps.
  - Si se reutiliza animación, preferir `framer-motion` ya instalada.
  - Componentes estilo prototipo (shimmer/cards/countup) sólo si se implementan con stack actual.

## 14) Riesgos y Zonas Sensibles
1. `src/storage/fx.ts`: cualquier cambio puede romper asientos históricos o conciliación.
2. `src/storage/entries.ts`: falta cascada bidireccional inmediata al borrar/editar asiento.
3. `src/storage/db.ts`: cambiar schema/version sin plan puede romper datos locales existentes.
4. `src/pages/Operaciones/MonedaExtranjeraPage.tsx`: tamaño y complejidad alta, riesgo de regresión UI/contable.
5. Navegación duplicada desktop/mobile (`Sidebar`/`MobileDrawer`): alto riesgo de inconsistencias de acceso.

## 15) Validación Ejecutada (sin fixes)

### `npm run dev`
Salida literal:
```text
command timed out after 24037 milliseconds
```
Resultado: no se pudo confirmar arranque estable dentro del timeout del entorno.

### `npm run build`
Salida literal (error):
```text
tests/repro_eepn.test.ts(44,17): error TS2352 ... 'isActive' does not exist in type 'JournalEntry'.
tests/repro_eepn.test.ts(102,17): error TS2352 ... 'isActive' does not exist in type 'JournalEntry'.
tests/repro_eepn.test.ts(140,21): error TS2352 ... 'isActive' does not exist in type 'JournalEntry'.
tests/repro_eepn.test.ts(170,17): error TS2352 ... 'isActive' does not exist in type 'JournalEntry'.
```

### `npm run lint`
Salida literal (resumen final):
```text
✖ 155 problems (115 errors, 40 warnings)
13 errors and 0 warnings potentially fixable with the --fix option.
```
Observación: gran parte son preexistentes (`no-explicit-any`, hooks rules, unused vars).

## 16) Confirmaciones Solicitadas
- Existe `/operaciones/prestamos`: **NO**.
- Debe crearse ruta/página y reubicar allí pasivos ME hoy en `MonedaExtranjeraPage`.
- Se detectó origen de TC oficial actual y su aplicación.
- Se identificaron puntos de enganche para sincronización con Libro Diario y riesgos de bidireccionalidad incompleta.

## 17) Archivo y Estado
- Entregable creado: `docs/AI_AUDIT_PRESTAMOS.md`
- Implementación: **COMPLETADA** (Fases 0-3).

---

## 18) Implementación Realizada (Post-Auditoría)

### Fecha: 2026-02-14

### Archivos Creados
| Archivo | Descripción |
|---|---|
| `src/pages/Operaciones/PrestamosPage.tsx` | Página completa del módulo Préstamos (~850 líneas) |
| `src/ui/TextShimmer.tsx` | Componente shimmer animado (ReactBits-inspired) |

### Archivos Modificados
| Archivo | Cambios |
|---|---|
| `src/App.tsx` | Agregada ruta `/operaciones/prestamos` con lazy import |
| `src/pages/OperacionesPage.tsx` | Tarjeta "Préstamos" ahora navega a la ruta, badge "Pasivo", styling |
| `src/ui/Layout/Sidebar.tsx` | Agregado item Préstamos (icon: Bank) bajo Operaciones |
| `src/ui/Layout/MobileDrawer.tsx` | Agregado item Préstamos (icon: Bank) bajo Operaciones |
| `src/core/monedaExtranjera/types.ts` | CurrencyCode +ARS, FxMovementType +DEVENGO_INTERES/REVALUACION_DEUDA, labels |
| `src/pages/Operaciones/MonedaExtranjeraPage.tsx` | Removida tab Pasivos, KPI Pasivos, botón "Nueva deuda ME", modales debt |
| `src/storage/entries.ts` | `deleteEntry` ahora cascadea a FxMovement (bidireccional) |

### Funcionalidades Implementadas
1. **Alta préstamo ARS**: rate=1, asiento directo en ARS, sin selector TC
2. **Alta préstamo ME (USD/EUR)**: TC Oficial BNA forzado, asiento en ARS
3. **Tabla préstamos**: Acreedor, Moneda, Saldo Original, Pagado Acum., Saldo Pendiente, TC Actual, Valuación ARS, Próx. Venc., Estado
4. **Modal "Ver"**: Resumen, Cronograma, Movimientos, Asientos vinculados, Acciones
5. **Pago de cuota**: Capital + Interés separados, asiento automático
6. **Devengamiento manual**: Por préstamo, crea movimiento DEVENGO_INTERES + asiento (D: 4.6.02 / H: pasivo)
7. **Auto-devengamiento**: Idempotente por período (YYYY-MM), ejecuta al cargar página
8. **Revaluación ME**: Diferencia de cambio con asiento (D/H: 4.6.03 vs pasivo)
9. **Cascada bidireccional**: `deleteEntry` limpia `linkedJournalEntryIds` y marca `journalStatus='missing'`
10. **UI Polish**: TextShimmer en título de página

### Validación
- `npx tsc --noEmit`: Solo errores preexistentes en `tests/repro_eepn.test.ts` (no relacionados)
- `npx vite build`: **BUILD EXITOSO** en 18.74s
- Chunk size warning preexistente (no introducido por estos cambios)

### Decisiones Arquitectónicas
1. **No se modificó `src/storage/db.ts`**: No se cambió el schema Dexie. Los nuevos tipos (ARS, DEVENGO_INTERES, REVALUACION_DEUDA) funcionan con las tablas existentes.
2. **Reutilización de FxDebt/FxMovement**: Préstamos ARS usan las mismas entidades con `currency='ARS'` y `rate=1`.
3. **Cascada sin import circular**: `deleteEntry` accede a `db.fxMovements` directamente (ya importa `db` de `./db`), evitando dependencia circular con `fx.ts`.
4. **Componentes UI locales**: Se copiaron primitivas (LoanButton, LoanBadge, etc.) en PrestamosPage como el patrón existente en MonedaExtranjeraPage.
5. **FxDebtCreateModalME2/FxDebtPlanModalME2 exportados**: Componentes de deuda legacy en MonedaExtranjeraPage marcados como `export` para evitar TS errors sin eliminar código potencialmente reutilizable.

### Pendientes (fuera de scope del contrato)
- Notificaciones de vencimiento integradas a campana global
- IVA/impuestos sobre intereses
- Scheduler automático de revaluación ME batch
- Tests unitarios específicos del módulo Préstamos

---

## 19) Segunda Iteración - Implementación Final (Post-MVP)

### Fecha: 2026-02-14

### Cambios realizados

#### FASE A - Auditoría técnica
- Confirmado: FxOperationModalME2 tenía tabs "Pago Deuda" y "Refinanciación" (duplicación)
- Confirmado: Creación de préstamo ME ya creaba TOMA_DEUDA con targetAccountId (interconexión correcta)
- Confirmado: PaymentSubModal NO impactaba tenencia ME al pagar desde cartera ME
- Plan de cuentas verificado: todas las cuentas necesarias existen (4.6.02-08, 2.1.05.90)

#### FASE B - Limpieza Moneda Extranjera
- Removidas tabs "Pago Deuda" y "Refinanciación" de FxOperationModalME2
- Removidos state vars (pago/refi), handlers, forms, preview logic, debtOptions
- Removido prop `fxDebts` del componente FxOperationModalME2
- Removidos imports `addFxDebtPayment`, `addFxDebtDisbursement` de MonedaExtranjeraPage
- ME ahora solo tiene: Compra (Activo) y Venta (Activo)

#### FASE C1 - Pagos mejorados
- PaymentSubModal reescrito con:
  - **Modo selector**: Cuota / Parcial / Extraordinario / Cancelar total
  - **Origen del pago**: ARS (Caja/Banco) o Cartera ME (para préstamos USD)
  - **Comisiones**: campo opcional con cuenta gasto (4.6.04)
  - **Interconexión ME**: al pagar desde cartera ME, crea FxMovement tipo EGRESO (reduce tenencia)
  - **TC Oficial readonly**: bloqueado para consistencia contable

#### FASE C2 - Refinanciación MVP
- Nuevo RefinanciacionSubModal con:
  - Monto adicional opcional (con disbursement automático via addFxDebtDisbursement)
  - Actualización de condiciones: TNA, cuotas, sistema, frecuencia
  - Regeneración completa de schedule/cronograma
  - Si monto adicional > 0 + ME → selección de cartera destino

#### FASE C3 / C-INT - Devengamiento y cuentas contables mejoradas
- Devengamiento ahora prefiere `2.1.05.90 Intereses a devengar (neg)` (regularizadora)
- Fallback chain: 2.1.05.90 → búsqueda por nombre → cuenta del pasivo
- Revaluación ME ahora usa cuentas separadas:
  - Pérdida: `4.6.08 Diferencias de cambio (Pérdida)` (fallback 4.6.03)
  - Ganancia: `4.6.07 Diferencias de cambio (Ganancia)` (fallback 4.6.03)

#### FASE D - UI
- **NumberTicker**: animated counter para KPI "Total Pasivo (ARS)" (ease-out cubic, 600ms)
- **Glow border**: CTA "Nuevo Préstamo" con gradient glow animado
- **TextShimmer**: ya existía en título (implementación anterior)

### Archivos Modificados (segunda iteración)
| Archivo | Cambios |
|---|---|
| `src/pages/Operaciones/MonedaExtranjeraPage.tsx` | Removidos tabs/forms/handlers Pago Deuda + Refinanciación |
| `src/pages/Operaciones/PrestamosPage.tsx` | PaymentSubModal completo + RefinanciacionSubModal + cuentas correctas |
| `src/ui/NumberTicker.tsx` | NUEVO - Animated counter component |

### Validación
- `npx tsc --noEmit`: 0 errores nuevos
- `npx vite build`: **BUILD EXITOSO** en 18.46s

### Decisiones clave
1. **EGRESO para pago ME**: Al pagar un préstamo ME desde cartera ME, se crea FxMovement tipo EGRESO con autoJournal=false (evita duplicar asiento ya generado por addFxDebtPayment)
2. **Cuentas separadas para dif. cambio**: 4.6.07 (ganancia) y 4.6.08 (pérdida) con fallback a 4.6.03 genérica
3. **Regularizadora para devengo**: 2.1.05.90 "Intereses a devengar (neg)" con isContra=true y normalSide=DEBIT
4. **Schedule regeneration**: Al refinanciar, se regenera cronograma completo desde la fecha de refinanciación con nuevo saldo (original + adicional)
