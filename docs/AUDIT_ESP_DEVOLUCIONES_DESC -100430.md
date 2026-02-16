# Auditoría Forense ESP - Devoluciones Bienes de Cambio (FASE 0, sin fix)

Fecha: 2026-02-16  
Scope: `MovementModalV3` -> `bienes.ts` -> `ledger/balance/statements` -> `/estados`

## 1) Baseline & Scope

Comandos ejecutados:

```bash
git status --short
git diff --stat
npm run build
npm test
```

Resultado:
- `build`: OK
- `test`: OK (14 archivos, 77 tests)
- Working tree con cambios locales previos (no tocados en esta auditoría).

Archivos clave auditados:
- `src/pages/Planillas/components/MovementModalV3.tsx`
- `src/storage/bienes.ts`
- `src/storage/accounts.ts`
- `src/core/ledger.ts`
- `src/core/balance.ts`
- `src/core/statements.ts`
- `src/pages/Estados.tsx`
- `src/pages/estados/adapters/balanceSheetViewModel.ts`

## 2) Reproducción y trazabilidad (datos reales IndexedDB)

Se leyó IndexedDB real `EntrenadorContable` del origen `http://localhost:5173` (sin modificar datos).

Snapshot:
- `accounts`: 201
- `entries`: 8
- `bienesMovements`: 6

Caso detectado en datos:
- Hay `purchase_return` generado por devolución (`journalRole: 'purchase_return'`).
- Asiento detectado:
  - Memo: `Devolucion compra - Cargador USB-C 20W`
  - Línea crítica: **Debe 396.800** a cuenta `2.1.01.01 Proveedores` (cuenta madre/header).

Síntoma en pipeline `/estados` con estos datos:
- `totalActivo = 12.171.512,50`
- `totalPasivo+PN = 12.568.312,50`
- **Diferencia ESP = -396.800,00**

Nota: en este entorno el gap actual observado es `-396.800` (no `-100.430`). El mecanismo causal es el mismo y escala al monto del asiento afectado.

## 3) Hallazgos con evidencia

| Hallazgo | Evidencia (archivo:línea) | Impacto |
|---|---|---|
| El modal de devoluciones en modo `NOTA_CREDITO` defaultea a cuentas madre (`2.1.01.01` / `1.1.02.01`) | `src/pages/Planillas/components/MovementModalV3.tsx:81`, `src/pages/Planillas/components/MovementModalV3.tsx:1056`, `src/pages/Planillas/components/MovementModalV3.tsx:1059`, `src/pages/Planillas/components/MovementModalV3.tsx:1062` | Si esa cuenta ya es `isHeader=true`, queda riesgo de imputación a header. |
| En devoluciones, `bienes.ts` usa `paymentSplits` directo sin normalizar a subcuenta por tercero | `src/storage/bienes.ts:661`, `src/storage/bienes.ts:664`, `src/storage/bienes.ts:790`, `src/storage/bienes.ts:793` | Permite guardar líneas a cuenta madre/header. |
| En compra/venta normal sí existe normalización a subcuenta por tercero (`findOrCreateChildAccountByName`) | `src/storage/bienes.ts:745`, `src/storage/bienes.ts:815` | Inconsistencia específica de devoluciones. |
| `findOrCreateChildAccountByName` convierte al padre en `isHeader=true` y el hijo hereda metadatos contables del padre | `src/storage/accounts.ts:415`, `src/storage/accounts.ts:438`, `src/storage/accounts.ts:463`, `src/storage/accounts.ts:464`, `src/storage/accounts.ts:466` | Correcta herencia para subcuentas; problema no es falta de `statementGroup`, sino imputación a header. |
| Trial Balance excluye siempre cuentas header | `src/core/balance.ts:36`, `src/core/balance.ts:114` | Toda línea contable imputada a header queda fuera de TB/ESP. |
| `/estados` usa TB rollup para ESP y TB raw para integridad | `src/pages/Estados.tsx:310`, `src/pages/Estados.tsx:312`, `src/pages/Estados.tsx:314`, `src/pages/Estados.tsx:315` | El gap aparece en ambos (porque ambos omiten header). |
| Detección de unmapped también ignora headers | `src/pages/estados/adapters/balanceSheetViewModel.ts:203` | La línea perdida no aparece en `unmappedAccounts`. |

## 4) Conciliación numérica exacta del gap

### 4.1 Conciliación A vs B

A) TB contable desde `entries + accounts` (sin filtrar raro, solo regla actual de TB que excluye headers):
- El mayor por asiento está balanceado (debe = haber por asiento).
- Existe 1 línea en header (`2.1.01.01`) por `396.800` debit.

B) ESP (`/estados`) vía pipeline real:
- Excluye asientos de cierre (`excludeClosingEntries`) y luego arma TB/ESP.
- Como TB excluye header, la línea de `396.800` no participa en Activo/Pasivo/PN.

### 4.2 Cuenta exacta faltante

Línea omitida por diseño actual:
- Asiento `purchase_return` (devolución compra)
- Cuenta: `2.1.01.01 Proveedores` (`isHeader=true`)
- Importe: Debe `396.800,00`

Efecto algebraico en ESP:
- Falta un **debe en pasivo** (disminución de pasivo) de `396.800`.
- Al omitirse, `Pasivo+PN` queda **396.800 más alto**.
- Resultado:
  - `Activo - (Pasivo+PN) = -396.800,00` (exacto al centavo).

Tolerancia:
- `abs(diff_observado - 396800) = 0.00` (cumple tolerancia 0.01).

## 5) Madre vs subcuenta (chequeo solicitado)

- Mayor/roll-up:
  - Sí hay mecanismo de roll-up jerárquico (`computeRollupTrialBalance`) para consolidar hijos a cuenta de presentación.
  - Pero ese mecanismo parte de TB que descarta headers.
- Punto crítico:
  - Si imputás a cuenta madre que ya es header, esa línea queda fuera antes del roll-up.
  - No es un problema de `statementGroup/type` en hijos (hijos heredan bien); es un problema de **posteo a cuenta no postable**.

## 6) Plan de fix mínimo propuesto (NO implementado)

Objetivo del fix: impedir que devoluciones posteen a headers y mantener auxiliares por tercero.

1. `src/storage/bienes.ts`
- En bloques `purchase_return` y `sale_return` (`hasSplits`):
  - Reutilizar la misma normalización de compra/venta normal:
    - si `movement.counterparty` existe y split apunta a cuenta control/madre (`Proveedores/Deudores`) o a cuenta `isHeader`, resolver a subcuenta con `findOrCreateChildAccountByName`.
  - Guardrail: rechazar generación si algún `split.accountId` termina en `isHeader=true` (error explícito).

2. `src/pages/Planillas/components/MovementModalV3.tsx`
- En `NOTA_CREDITO` de devoluciones:
  - si hay `counterparty`, preseleccionar subcuenta del tercero (no cuenta madre).
  - evitar que UI deje persistir split en cuenta header.

3. Validación defensiva transversal
- Antes de persistir asiento inventario, validar que no existan líneas con cuenta header (`isHeader`).
- Mensaje de error orientado al usuario: “la contrapartida debe imputarse a subcuenta postable”.

## 7) Checklist QA (post-fix, aún no aplicado)

1. Crear compra a proveedor nuevo (genera subcuenta).
2. Registrar devolución compra (`NOTA_CREDITO`) del mismo tercero.
3. Verificar en diario:
- asiento balanceado,
- línea de contrapartida en subcuenta (no en `2.1.01.01` header).
4. Verificar mayor:
- saldo en subcuenta del proveedor,
- roll-up correcto al control.
5. Verificar `/estados`:
- `Diferencia = 0,00`.
6. Repetir para venta + devolución venta con `1.1.02.01`.
7. Comandos:
- `npm test`
- `npm run build`

## 8) Estado de la FASE 0

- Causa raíz identificada y cuantificada con evidencia.
- No se implementaron fixes en código productivo.
- Listo para FASE 1 con fix mínimo cuando des OK.

