# Auditoria Forense - Devoluciones, Subcuentas y Estado de Resultados (FASE 0)

Fecha: 2026-02-16  
Alcance: devoluciones (`sale_return` / `purchase_return`) desde Bienes de Cambio + pipeline TB/ER/ESP.

## 1) Baseline y estado del repo

Comandos ejecutados:

```bash
git status --short
git diff --stat
npm test
npm run build
```

Resultado:
- `npm test`: PASS (15 files, 80 tests).
- `npm run build`: PASS.
- Hay ruido previo en el working tree (cambios de fases anteriores); no se revirtio ni se mezclo.

## 2) Reproduccion del bug ER (devolucion venta no resta en Ventas Netas)

### 2.1 Evidencia sobre datos locales disponibles

Se intento extraer IndexedDB real (`EntrenadorContable`) desde perfiles locales de Chrome/Edge para localizar el asiento del **2025-01-18**:
- En los perfiles accesibles para `localhost`/`contalivre.pages.dev`, la DB encontrada tiene cuentas pero `entries = 0`.
- Con esos datos no fue posible obtener `entryId` real del usuario para el 18/01 en esta maquina.

### 2.2 Reproduccion controlada (mismo patron contable)

Se corro una reproduccion controlada (entrada de devolucion en fecha `2025-01-18`) para validar el punto de perdida del ER:

Caso A (clasificacion correcta de `4.8.06`):
- `4.8.06` con `statementGroup='SALES'`.
- Resultado: `ventasBrutas=1000`, `deducciones=-200`, `ventasNetas=800`.

Caso B (clasificacion legacy):
- `4.8.06` con `statementGroup='COGS'`.
- Resultado: `ventasBrutas=1000`, `deducciones=0`, `ventasNetas=1000`, `costoVentas=-200`.

Conclusion: si `4.8.06` queda legado como `COGS`, la devolucion no aparece restando en "Ventas netas"; se reclasifica en costo.

## 3) Hallazgos (evidencia -> impacto -> fix minimo)

| Hallazgo | Evidencia (archivo:linea) | Impacto | Fix minimo propuesto |
|---|---|---|---|
| El ER clasifica por `statementGroup`; si la cuenta entra como `COGS`, no va a deducciones de ventas | `src/domain/reports/estadoResultados.ts:337`, `src/domain/reports/estadoResultados.ts:347` | Devolucion venta puede salir de "Ventas netas" y caer en costo | Forzar override por codigo `4.8.05/4.8.06` a bloque de deducciones en ER |
| La deteccion de deducciones depende del nombre ("devolucion"/"bonificacion" + "venta") | `src/domain/reports/estadoResultados.ts:153`, `src/domain/reports/estadoResultados.ts:157`, `src/domain/reports/estadoResultados.ts:318` | Si nombre legacy/abreviado cambia, puede fallar el ruteo por nombre | Priorizar codigo de cuenta sobre nombre para `4.8.05/4.8.06` |
| Seed actual define bien `4.8.05/4.8.06` como `SALES`, pero DB existente no se corrige automaticamente | `src/storage/seed.ts:305`, `src/storage/seed.ts:306`, `src/storage/seed.ts:341`, `src/storage/seed.ts:348`, `src/storage/db.ts:118`, `src/storage/db.ts:147` | Cuentas legacy pueden conservar metadata vieja y romper ER | Agregar repair/migracion DEV para corregir metadata de cuentas 4.8.05/4.8.06 existentes |
| El TB excluye cuentas header | `src/core/balance.ts:36`, `src/core/balance.ts:114` | Cualquier linea historica imputada a header queda fuera de TB/ER/ESP | Mantener guardrail de no-posteo a header y repair para historico |
| En devoluciones nuevas ya hay normalizacion a subcuenta y guardrail anti-header | `src/storage/bienes.ts:195`, `src/storage/bienes.ts:286`, `src/storage/bienes.ts:779`, `src/storage/bienes.ts:915`, `src/storage/bienes.ts:1222` | Mitiga nuevos casos, pero no arregla asientos legacy ni clasificacion legacy en ER | Mantener fix actual y sumar repair de datos + hardening ER |
| Persisten alias legacy para devol/bonif ventas (`4.1.04`, `4.1.03`) en resolucion de cuentas | `src/storage/bienes.ts:70`, `src/storage/bienes.ts:71`, `src/storage/bienes.ts:128` | Puede enlazar cuentas antiguas no alineadas con presentacion actual | En Fase 1: validar mapping final contra `4.8.05/4.8.06` en settings/cuentas reales |

## 4) Tabla obligatoria (movimiento -> posting real -> aparece en TB/ER/ESP)

| Movimiento | Cuenta contable (posting real) | Aparece en TB/ER/ESP |
|---|---|---|
| `sale_return` (nuevo flujo) | Contrapartida normalizada a subcuenta cliente (leaf) + linea resultado en `4.8.06` | TB: si (leaf + no header). ER: si, **solo si** `4.8.06` esta clasificada en ventas; si queda legacy `COGS`, no resta en Ventas Netas. ESP: si |
| `purchase_return` (nuevo flujo) | Contrapartida normalizada a subcuenta proveedor (leaf) + `4.8.04` | TB: si. ER: impacta costo (esperado). ESP: si |
| Historico con contrapartida en header (`1.1.02.01`/`2.1.01.01`) | Linea en cuenta `isHeader=true` | TB: no (excluida). ER/ESP: no o incompleto, segun cuenta afectada |

## 5) Hipotesis priorizadas

1. **Alta**: `4.8.06` del entorno afectado tiene metadata legacy (`statementGroup='COGS'` o equivalente) y por eso no resta en Ventas Netas.
2. **Media**: existe cuenta legacy alternativa (ej. `4.1.04`) usada por mapping/fallback y cae fuera de la presentacion esperada.
3. **Media**: hay asientos historicos en headers que distorsionan TB/ER/ESP (ya corregido para nuevos asientos, no para historico).
4. **Baja**: filtro de fechas/ejercicio excluye la devolucion del 18/01.

## 6) Plan de fix minimo propuesto (FASE 1)

1. `src/domain/reports/estadoResultados.ts`
- Hardcodear override por codigo para `4.8.05` y `4.8.06` en bloque de deducciones de ventas (independiente de `statementGroup`/nombre legacy).

2. Repair de datos legacy (DEV-only)
- Reasignar metadata de cuentas `4.8.05`/`4.8.06` a:
  - `kind='INCOME'`
  - `statementGroup='SALES'`
  - `section='OPERATING'`
  - `isContra=true`, `normalSide='DEBIT'`
- Loggear cambios aplicados.

3. Mantener y validar guardrails anti-header (ya presentes)
- Confirmar que no entren nuevas lineas a `isHeader=true`.

4. Tests de regresion (fase 1)
- `sale_return` resta en Ventas Netas aun con metadata legacy en cuenta (override por codigo).
- `purchase_return` no permite posting final en header.
- Input con header se normaliza a leaf o falla con error claro.

## 7) Checklist de reproduccion (pasos + comandos)

Comandos:

```bash
npm test
npm run build
```

Repro funcional sugerida:
1. Crear venta y luego devolucion de venta (fecha 2025-01-18).
2. Verificar asiento `sale_return` y cuenta de resultado usada (`4.8.06`).
3. Revisar metadata de cuenta `4.8.06` (kind/statementGroup) en DB.
4. Abrir ER y validar que el importe reste en "Ventas netas".
5. Repetir con devolucion de compra y verificar contrapartida en subcuenta (no header).

## 8) Estado FASE 0

- Diagnostico completo de pipeline y causa estructural documentada.
- No se implementaron fixes productivos en esta fase.
- Listo para ejecutar FASE 1 con cambios minimos cuando des OK.

---

## 9) FASE 1 - Fix minimo aplicado (2026-02-16)

### Cambios implementados

1. ER: override por codigo para contra-ventas
- Archivo: `src/domain/reports/estadoResultados.ts`
- Cambio: se prioriza `4.8.05` y `4.8.06` como deducciones de ventas por codigo, antes del ruteo por `statementGroup`.
- Evidencia: introduccion de `SALES_DEDUCTION_CODES` y bloque de override previo a clasificacion por grupo.

2. Test regresion ER
- Archivo: `tests/estadoResultados.devoluciones.test.ts`
- Cobertura:
  - Caso legacy (`4.8.06` con `statementGroup='COGS'`) sigue restando en "Ventas netas".
  - Verifica `ventasNetas=800` para venta 1000 y devolucion 200.

3. Test regresion headers sin tercero
- Archivo: `tests/bienes.devoluciones-header.test.ts`
- Cobertura nueva:
  - Si split llega a header y no hay tercero, se rechaza con error claro (no permite persistir cuenta madre).

### Validacion de comandos

```bash
npm test -- tests/estadoResultados.devoluciones.test.ts tests/bienes.devoluciones-header.test.ts
npm test
npm run build
```

Resultado:
- Tests focalizados: PASS.
- Suite completa: PASS (16 files, 82 tests).
- Build: PASS.

### Estado final de criterios funcionales

1. No posteo nuevo a headers: cubierto por guardrails de storage ya activos + tests.
2. Devoluciones con tercero a subcuenta: cubierto por normalizacion existente + tests.
3. ER incluye devoluciones/bonificaciones de ventas en Ventas Netas: cubierto por override por codigo + test nuevo.
4. Build/Test: PASS.
