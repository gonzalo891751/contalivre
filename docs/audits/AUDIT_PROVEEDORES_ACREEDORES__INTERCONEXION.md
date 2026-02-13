# AUDIT_PROVEEDORES_ACREEDORES__INTERCONEXION

Fecha: 2026-02-13
Repo validado: `D:\Git\ContaLivre`
Auditoria: solo inspeccion + plan (sin implementacion)

## Fase 0 - Inventario del sistema

### Comandos ejecutados (evidencia)

```bash
git status --short --branch
# ## NO-SE...origin/NO-SE

git rev-parse --abbrev-ref HEAD
# NO-SE

git log -n 5 --oneline
# 48687c1 aaaaaaaaa
# 1047104 a
# 051bb3d 3
# dec7075 65
# 5d41dcc 45

pwd / Get-Location
# D:\Git\ContaLivre

ls (raiz)
# .claude .git dist docs node_modules public scripts src tests
# .gitattributes .gitignore .prettierrc ... package.json vite.config.ts

ls src
# components core domain hooks layouts lib pages pdf services storage styles ui utils

ls functions
# functions/: NO_EXISTE

ls migrations
# migrations/: NO_EXISTE
```

### Stack esperado vs stack real

- Esperado (pedido): React/TS + Cloudflare Pages/Workers + D1 + API.
- Detectado (real): SPA React + TypeScript + Vite + Dexie/IndexedDB local.
- Evidencia:
- `package.json` (sin dependencias server ni Workers/D1).
- `src/storage/db.ts` (Dexie, IndexedDB, versiones 1..14).
- No existen carpetas `functions/` ni `migrations/` en la raiz.
- No se detectan `wrangler.*` ni endpoints API propios del repo.

### Prototipo fuente de verdad pedido

- Verificacion actual:
- `docs/prototypes/proveedores.html: EXISTE`
- Fuente de verdad utilizada: `docs/prototypes/proveedores.html`

Estructura extraida del prototipo:
- Toggle de modulo `Proveedores` / `Acreedores Varios`.
- Tabs: `Dashboard`, `Listado`, `Movimientos`, `Vencimientos`.
- CTA primario dinamico: `Registrar Compra` / `Registrar Gasto`.
- Accion `Pagar` en listado y en timeline de vencimientos.
- Modal `Registrar Compra / Gasto` con:
- alta inline de proveedor/acreedor,
- condicion de pago (`Contado`, `Cta. Cte.`, `Documentado`),
- campos de plazo/vencimiento,
- tipo de documento en documentado (`Pagare`, `Echeq`).
- Modal de pagos contextual: `Pagos - Bienes de Cambio`, con comprobantes pendientes + medios de pago.

## 1) Resumen Ejecutivo

El sistema contable actual ya esta interconectado entre Movimientos de Inventario (Bienes de Cambio), Libro Diario y Libro Mayor a traves de `bienesMovements -> entries -> ledger`.

Lo resuelto hoy:
- Registro de compra/venta/ajustes/pagos desde `MovementModalV3`.
- Generacion de asientos automaticos en `src/storage/bienes.ts`.
- Persistencia de asientos en `db.entries` y mayorizacion en `src/core/ledger.ts`.
- Cuentas control existentes en seed: `Proveedores (2.1.01.01)` y `Acreedores varios (2.1.06.01)`.

Lo no resuelto para objetivo Proveedores/Acreedores:
- No existe pagina/ruta `Proveedores/Acreedores`.
- No existe entidad maestra de tercero/proveedor; solo texto libre `counterparty` en movimientos.
- No existe alta automatica de subcuenta por proveedor/acreedor bajo cuenta control.
- No hay modelo de vencimientos/documentos para compras/pagos en Bienes de Cambio.
- El saldo pendiente por comprobante usa heuristica fragil (pago por `notes`, no por link formal).

Riesgos mayores:
- Alto: saldos por proveedor no auditables contablemente sin subcuentas por tercero.
- Alto: vencimientos/documentos (cheque/pagare/echeq) no tienen contrato persistente.
- Medio: helper de saldo por codigo (`getAccountBalanceByCode`) no agrega hijos (solo cuenta exacta).
- Medio: `proveedores.html` es prototipo con data mock JS, sin contrato persistente equivalente en Dexie.

## 2) Mapa del Sistema (Arquitectura)

### Diagrama ASCII (cableado real)

```text
[UI React]
  /operaciones/inventario (InventarioBienesPage)
      -> MovementModalV3 (Compra/Venta/Ajuste/Pagos)
      -> onSave(handleSaveMovement)
          -> createBienesMovement (storage/bienes.ts)
              -> buildJournalEntriesForMovement(...)
                  -> createEntry(...) -> db.entries (Libro Diario)
              -> db.bienesMovements (mov operativo)

[Mayor]
  useLedger() -> db.entries + db.accounts
      -> computeLedger() / rollupBalances
      -> /mayor (Libro Mayor)

[Otros calculos inventario]
  getAccountBalanceByCode(code, fechas) -> db.entries (suma por cuenta exacta)
```

### Tecnologias detectadas (paths reales)

- Front SPA: `src/App.tsx`, `src/pages/**`.
- Router: `react-router-dom` en `src/App.tsx`.
- Persistencia: Dexie/IndexedDB en `src/storage/db.ts`.
- Logica contable: `src/core/ledger.ts`, `src/core/ledger/computeBalances.ts`, `src/core/ledger/rollupBalances.ts`.
- Sin backend/API propio en repo (no `functions/`, no `migrations/`).

## 3) Rutas y Paginas Reales

| Pantalla | Ruta | Componente/Archivo | Fuente de datos |
|---|---|---|---|
| Dashboard | `/` | `src/pages/Dashboard.tsx` | queries Dexie (varios hooks) |
| Operaciones | `/operaciones` | `src/pages/OperacionesPage.tsx` | `db.bienes*`, `db.entries`, `db.accounts` |
| Bienes de Cambio | `/operaciones/inventario` | `src/pages/Planillas/InventarioBienesPage.tsx` | `bienes.ts`, `db.entries`, `db.accounts` |
| Plan de Cuentas | `/cuentas` | `src/pages/Cuentas.tsx` | `storage/accounts.ts` + `db.accounts` |
| Libro Diario | `/asientos` | `src/pages/AsientosDesktop.tsx` / `AsientosMobile.tsx` | `db.entries`, `storage/entries.ts` |
| Libro Mayor | `/mayor` | `src/pages/Mayor.tsx` | `useLedger()` => `db.entries` + `db.accounts` |
| Balance SyS | `/balance` | `src/pages/Balance.tsx` | libro/entries |
| Estados | `/estados` | `src/pages/Estados.tsx` | libro/entries + clasificacion |

Notas:
- No existe ruta actual para Proveedores/Acreedores.
- Sidebar tampoco expone ruta de Proveedores (`src/ui/Layout/Sidebar.tsx`, `src/ui/Layout/MobileDrawer.tsx`).

## 4) Modelos / Tablas / Contratos de Datos

### Tablas relevantes (Dexie)

En `src/storage/db.ts`:
- `accounts` (plan de cuentas jerarquico).
- `entries` (libro diario).
- `bienesProducts`.
- `bienesMovements`.
- `bienesSettings`.

No existen tablas especificas de:
- terceros/proveedores maestros,
- documentos comerciales por pagar/cobrar,
- vencimientos de compras,
- instrumentos de pago (cheque/pagare/echeq) para inventario.

### Contratos actuales

1. Tercero/Proveedor
- Estado actual: NO existe entidad maestra.
- Solo campo libre en movimiento: `counterparty?: string` (`src/core/inventario/types.ts`, `BienesMovement`).

2. Cuenta/Subcuenta
- `Account` con `id`, `code`, `parentId`, `level`, `isHeader` (`src/core/models.ts`).
- Alta de cuentas y generacion de codigo: `src/storage/accounts.ts`.
- Seed incluye cuentas control:
- `2.1.01.01 Proveedores`
- `2.1.06.01 Acreedores varios`
- (`src/storage/seed.ts`).

3. Asiento/Movimiento
- `JournalEntry` + `EntryLine` (`src/core/models.ts`).
- `BienesMovement` incluye `type`, `paymentDirection`, `paymentSplits`, `reference`, `sourceMovementId`, `linkedJournalEntryIds` (`src/core/inventario/types.ts`).

4. Documento/Vencimiento
- Inventario/Bienes: NO contrato dedicado.
- Se usa `reference` (texto) y calculo de pendiente heuristico.

5. Pago
- `BienesMovement.type = 'PAYMENT'`.
- Campos: `paymentDirection`, `paymentSplits[]`, `counterparty`, `reference`.
- Genera asiento en `buildJournalEntriesForMovement`.

### Hallazgos de contrato (riesgo)

| Gap | Donde | Severidad | Impacto |
|---|---|---|---|
| No entidad tercero/proveedor | `src/core/inventario/types.ts` | Alta | No hay ID estable para saldo por proveedor |
| No subcuenta automatica por tercero | `src/storage/bienes.ts` | Alta | Todo impacta en cuenta control generica |
| No vencimientos/documentos estructurados | `db.ts` + inventario | Alta | Dashboard/listado/vencimientos incompletos |
| Pendientes por heuristica `notes` | `src/ui/AccountSearchSelectWithBalance.tsx` | Alta | Riesgo de saldo pendiente incorrecto |
| Prototipo usa dataset mock en JS | `docs/prototypes/proveedores.html` | Media | No existe paridad 1:1 entre UI esperada y contratos reales |

## 5) Cableado End-to-End (Compra / Pago)

### A) Flujo Compra (Bienes de Cambio)

1. UI
- Modal en `src/pages/Planillas/components/MovementModalV3.tsx`.
- `mainTab='compra'` y submit en `handleSubmit`.
- Payload incluye fecha, item, importes, tercero (`counterparty`), referencia, splits, impuestos, `autoJournal`.

2. Persistencia operativa + asiento
- `onSave` de modal apunta a `handleSaveMovement` en `src/pages/Planillas/InventarioBienesPage.tsx`.
- `handleSaveMovement` llama `createBienesMovement(...)` (`src/storage/bienes.ts`).

3. Generacion contable
- `createBienesMovement` llama `buildJournalEntriesForMovement(...)`.
- Para compra normal:
- Debe: Compras/Mercaderias (+ IVA CF si aplica, + gastos, etc.).
- Haber: Proveedores / cuentas de contrapartida (`paymentSplits`).
- Guarda en `db.entries` via `createEntry(...)` y linkea IDs en `linkedJournalEntryIds`.

4. Impacto en Mayor
- `/mayor` usa `useLedger()` (`src/hooks/useLedger.ts`).
- `useLedger()` toma `db.entries` + `db.accounts` y ejecuta `computeLedger()` (`src/core/ledger.ts`).
- `Mayor.tsx` aplica `rollupBalances` para totales jerarquicos.

### B) Flujo Pagos (Bienes de Cambio)

1. UI
- En `MovementModalV3`, tab `pagos` (`mainTab='pagos'`).
- Selector Cobro/Pago, comprobante pendiente opcional, tercero y splits por cuenta.

2. Guardado
- En submit, crea `type: 'PAYMENT'`, `paymentDirection: 'PAGO'|'COBRO'`, `sourceMovementId` opcional.

3. Asiento
- En `buildJournalEntriesForMovement`:
- Cobro: Debe splits / Haber Deudores.
- Pago: Debe Proveedores / Haber splits.

4. Vinculo a comprobantes
- UI permite elegir comprobante pendiente (`usePendingDocuments`).
- Pero calculo de pendiente hoy usa heuristic match por `notes` del pago, no por `sourceMovementId`.
- Resultado: conciliacion de saldo pendiente no robusta.

### C) Calculo de saldos (Mayor)

- Saldo contable por cuenta:
- `computeLedger` + `calculateBalance` segun `normalSide`.
- Rollup jerarquico:
- `computeRollupTotals` agrega hijos/descendientes en Mayor.

- Saldo por codigo en inventario (cierre):
- `getAccountBalanceByCode(...)` en `src/storage/inventario.ts` suma `debit-credit` solo para cuenta exacta encontrada por codigo.
- No agrega subcuentas hijas automaticamente.

- Saldo por proveedor hoy:
- No existe dimension proveedor en mayor.
- Solo posible por cuenta (o por parsing de `counterparty`/memo), no por entidad contable formal.

### D) Requisitos de flujo segun `docs/prototypes/proveedores.html`

- Toggle funcional de modulo (`Proveedores` / `Acreedores Varios`) con cambio de copy y CTA.
- Tabs obligatorias: `Dashboard`, `Listado`, `Movimientos`, `Vencimientos`.
- `Registrar Compra / Gasto` debe incluir:
- selector/alta inline de tercero,
- condicion de pago (`Contado`, `Cta. Cte.`, `Documentado`),
- campos de plazo/vencimiento,
- tipo de documento documentado (`Pagare`, `Echeq`).
- Flujo `Pagar` debe abrir modal contextual de pagos con:
- comprobantes pendientes,
- seleccion de medios de pago,
- impacto en saldo de tercero.

## 6) Como enchufar Proveedores/Acreedores (Plan minimo)

### Punto de entrada

- Desde Operaciones: card Proveedores de `src/pages/OperacionesPage.tsx` debe navegar a nueva ruta.
- Router: agregar ruta en `src/App.tsx`.
- Navegacion lateral: `src/ui/Layout/Sidebar.tsx` y `src/ui/Layout/MobileDrawer.tsx`.

### Alineacion minima con `proveedores.html`

- Mantener toggle visible `Proveedores` / `Acreedores Varios` (header + contexto de modulo).
- Mantener tabs exactas del prototipo: `Dashboard`, `Listado`, `Movimientos`, `Vencimientos`.
- CTA principal dinamica:
- Proveedores => `Registrar Compra`.
- Acreedores => `Registrar Gasto`.
- En listado y vencimientos, boton `Pagar` debe abrir el flujo real de pagos de Bienes.
- Modal de compra/gasto debe soportar:
- alta inline de tercero,
- condiciones `Contado`, `Cta. Cte.`, `Documentado`,
- datos de plazo/vencimiento e instrumento (`Pagare`, `Echeq`) con persistencia real.

### Fuente de verdad de saldo

Opcion recomendada (minima y trazable):
- Saldo desde Mayor por subcuentas hijas de cuenta control:
- Proveedores control: `2.1.01.01`
- Acreedores varios control: `2.1.06.01`

Requisito tecnico para que funcione:
- Compras/Pagos deben postear a subcuenta del tercero (no solo cuenta control generica).

### Generacion automatica de subcuenta

- Reutilizar `createAccount` + `generateNextCode` (`src/storage/accounts.ts`).
- En `src/storage/bienes.ts`, antes de generar asiento de PURCHASE/PAYMENT:
- Resolver tercero por nombre.
- Buscar subcuenta hija existente bajo cuenta control segun modo (Proveedor/Acreedor).
- Si no existe, crearla.
- Usar esa subcuenta como cuenta corriente en asiento.

Nota: en UI de Plan de Cuentas hoy solo se permite elegir madre `isHeader` al alta manual (`src/pages/Cuentas.tsx`), por eso este alta automatica debe ser por servicio.

### Listados y vencimientos

- Listado de terceros: derivar de subcuentas hijas + saldo mayor.
- Movimientos: de `db.entries` filtrando accountId de subcuenta + `sourceModule='inventory'`.
- Vencimientos:
- Hoy NO existe contrato de `dueDate`/instrumento en Bienes.
- Minimo requerido futuro: agregar campos en `BienesMovement` para terminos y vencimiento; usar `sourceMovementId` para cancelaciones.

### Disparar pagos

- Desde pantalla Proveedores/Acreedores: boton `Pagar` debe abrir flujo real de Inventario (tab pagos).
- Integracion minima:
- navegar a `/operaciones/inventario` con estado/query para prefill (tercero + comprobante).
- Inventario debe leer ese prefill y abrir `MovementModalV3` en `mainTab='pagos'`.

## 7) Lista EXACTA de archivos a tocar (implementacion futura)

### Frontend

- `src/App.tsx` (nueva ruta Proveedores/Acreedores).
- `src/ui/Layout/Sidebar.tsx` (entrada navegacion desktop).
- `src/ui/Layout/MobileDrawer.tsx` (entrada navegacion mobile).
- `src/pages/OperacionesPage.tsx` (activar card Proveedores/Acreedores).
- `src/pages/Operaciones/ProveedoresAcreedoresPage.tsx` (nueva pantalla gemela con toggle + tabs).
- `src/pages/Planillas/InventarioBienesPage.tsx` (soporte deep-link/prefill a pagos).
- `src/pages/Planillas/components/MovementModalV3.tsx` (prefill pago/proveedor y campos faltantes de compra/pago).
- `src/ui/AccountSearchSelectWithBalance.tsx` (corregir logica de pendientes para usar link real, no notes).

### Backend / API

- No aplica en arquitectura actual (no backend en repo).
- Si se decide API futura: hoy no hay endpoints reutilizables.

### DB / Persistencia

- Esta auditoria no cambia DB.
- Si se implementa minimo de vencimientos/instrumentos, faltan contratos en `BienesMovement` (sin tabla dedicada hoy).
- Dexie permite campos extra no indexados sin migration inmediata; aun asi se recomienda definir contrato en `src/core/inventario/types.ts`.

### Servicio contable

- `src/storage/bienes.ts` (resolver/crear subcuenta por tercero y usarla en asientos PURCHASE/PAYMENT).
- `src/storage/accounts.ts` (opcional helper dedicado para "findOrCreate child account").

## 8) Criterios de aceptacion (implementacion futura)

- [ ] Crear proveedor desde compra/pago crea (o reutiliza) subcuenta hija bajo control correcto.
- [ ] Asiento de compra impacta en subcuenta del proveedor (no solo cuenta control generica).
- [ ] Saldo listado por proveedor coincide con saldo de su subcuenta en Mayor.
- [ ] Accion Pagar desde Proveedores abre flujo real de pagos en Inventario con prefill correcto.
- [ ] Pago reduce saldo pendiente del comprobante vinculado por relacion formal (no heuristica por notes).
- [ ] Toggle Proveedores/Acreedores cambia cuenta control y dataset sin mezclar saldos.
- [ ] Tabs Dashboard/Listado/Movimientos/Vencimientos funcionan con datos reales.
- [ ] Vencimientos muestran fecha y estado (vigente/vencido/cancelado) desde contrato persistente.
- [ ] `git diff --stat` de implementacion futura no contiene cambios fuera de archivos acordados.

## 9) PROMPT PARA CLAUDE (IMPLEMENTACION) - BORRADOR

```text
CONTEXTO
Repo: ContaLivre (SPA React+TS + Dexie). No backend/API.
Objetivo: Implementar pantalla Proveedores/Acreedores 100% interconectada con Bienes de Cambio, Libro Diario y Mayor.

GUARDRAILS
- No refactor masivo.
- No tocar modulos no relacionados.
- No migraciones destructivas.
- Mantener trazabilidad sourceModule/sourceId en entries.

FASE 1 - Ruta y pantalla
1) Agregar ruta nueva en src/App.tsx: /operaciones/proveedores
2) Crear src/pages/Operaciones/ProveedoresAcreedoresPage.tsx
3) Agregar acceso desde OperacionesPage + Sidebar + MobileDrawer
4) UI con toggle Proveedores/Acreedores + tabs: Dashboard, Listado, Movimientos, Vencimientos
5) Basar la UI en docs/prototypes/proveedores.html (source of truth)

FASE 2 - Subcuenta automatica por tercero
1) En src/storage/bienes.ts, para PURCHASE/PAYMENT:
   - Resolver cuenta control segun modo (2.1.01.01 o 2.1.06.01)
   - Buscar subcuenta hija por nombre normalizado de tercero
   - Si no existe, crear via createAccount/generateNextCode
   - Postear asiento contra esa subcuenta
2) Mantener fallback seguro a cuenta control si no hay tercero

FASE 3 - Pendientes y pagos
1) Reemplazar heuristic de usePendingDocuments (notes) por relacion formal:
   - usar sourceMovementId / referencia estructurada
2) Desde Proveedores/Acreedores, boton Pagar debe abrir Inventario en tab pagos con prefill
3) En Inventario/MovementModalV3, aceptar estado/query para prefill de tercero/comprobante

FASE 4 - Vencimientos minimos
1) Extender contrato BienesMovement con dueDate y metadatos de instrumento minimos
2) Renderizar tab Vencimientos por estado y proximidad
3) No crear API; todo local en Dexie

QA / VERIFICACION
- npm run build
- Prueba manual:
  a) Registrar compra a proveedor nuevo -> crea subcuenta
  b) Ver saldo en listado proveedor == mayor subcuenta
  c) Ejecutar pago parcial -> saldo pendiente baja correctamente
  d) Toggle a Acreedores -> usa cuenta control alternativa

ENTREGABLE
- Commits pequenos por fase.
- Resumen final con archivos tocados y evidencia de pruebas.
```

## Pendientes / Bloqueantes de auditoria

- No hay bloqueante de prototipo: `docs/prototypes/proveedores.html` ya esta disponible.
- Pendiente funcional real: mapear los contratos mock del prototipo (documentos/vencimientos/instrumentos) a contratos persistentes en `BienesMovement` y mayor.
