# Implementación — Fase 2G.1: cierre funcional, contable y de QA del EFE

> **Estado:** en ejecución. Este documento nace como **especificación** (HITO 0)
> y se completa como **registro de implementación** en el HITO 9. Las secciones
> marcadas con ⏳ describen trabajo previsto; las marcadas con ✅ ya están en código,
> UI, exportaciones y pruebas verdes.

## 1. Encuadre

Fase **correctiva y de cierre** sobre la Fase 2G ya terminada. **No rehace** la
arquitectura vigente (alternativa B: evidencia/preparación → estado formal →
presentación; `CashFlowPreparationModel` generado en el motor; sin lógica contable
en React). Resuelve exclusivamente las limitaciones pendientes documentadas en
[`IMPLEMENTACION_FASE_2G_EFE_MATRICIAL_AUDITABLE.md`](IMPLEMENTACION_FASE_2G_EFE_MATRICIAL_AUDITABLE.md) §14,
[`ADR_EFE_PREPARATION_MODEL.md`](ADR_EFE_PREPARATION_MODEL.md) y
[`AUDITORIA_EFE_ESTADO_ACTUAL.md`](AUDITORIA_EFE_ESTADO_ACTUAL.md).

- **Rama:** `refactor/fase-2g1-cierre-efe` (base `1a6b22f`, sin merge, `main` intacto).
- **Motor de partida:** `2G.0` · **Esquema:** `22` · **Versión:** `0.5.0-rc.1`.

### Divergencia de entorno registrada

El HEAD de partida coincide **exactamente** con `1a6b22f` en la rama
`refactor/fase-2g-efe-matricial-auditable`, árbol limpio. La única divergencia es
el **Node por defecto del entorno**: `node` en PATH resuelve a `v25.9.0`
(fuera del rango `>=22 <23`). Toda la validación de esta fase se ejecuta con el
toolchain **Node 22.23.1 / npm 10.9.8** presente en
`C:\Tools\node-v22.23.1-win-x64`, anteponiéndolo al PATH. No se usa Node 25 para
la validación final.

## 2. Baseline (Fase 2G, HEAD `1a6b22f`, Node 22.23.1)

| Medición | Comando | Resultado |
|---|---|---|
| EFE focalizadas | `vitest run tests/reporting/efe2g-*.test.ts` | 10 archivos / 41 tests, verde (~26 s) |
| TypeScript | `tsc --noEmit` | exit 0 |
| Suite completa | `vitest run` | 74 archivos / **466 tests** verde (57 s) |
| Lint | `eslint .` | (registrado en HITO 9) |
| Build | `vite build` | (registrado en HITO 9) |

La diferencia baseline 2G ↔ resultado 2G.1 se documenta íntegra en el HITO 9.

## 3. Objetivos y estado

| # | Objetivo | Hito | Estado |
|---|---|---|---|
| 1 | Preparación matricial en moneda de cierre (por contribución) | 2 | ⏳ |
| 2 | Disposiciones a crédito, cobro parcial y mixtas | 3 | ⏳ |
| 3 | Edición completa y auditable de políticas EFE | 4 | ⏳ |
| 4 | E2E Firefox + exportaciones del papel de trabajo | 6–7 | ⏳ |
| 5 | Carga del caso Purmamarca para QA manual | 5 | ⏳ |
| 6 | Etiquetas/estados honestos (sin controles engañosos) | 8 | ⏳ |
| 7 | Documentación y evidencias | 0, 9 | ⏳ |

## 4. Preparación matricial en moneda de cierre (⏳ HITO 2)

**Problema:** `CashFlowPreparationModel` se emite sólo en moneda **nominal**
(`identity.expression = 'NOMINAL'`, `indexSetHash = null`). La exposición formal y
la reexpresión de flujos (`reexpressCashFlow`) sí concilian en moneda de cierre y
calculan el REI, pero **la matriz/papel de trabajo no conserva evidencia por
contribución reexpresada**.

**Decisión:** el motor emite **dos** modelos hermanos, sin que una única matriz
cambie en silencio según un selector:

- `bundle.preparation` — modelo NOMINAL (existente).
- `bundle.preparationRestated` — modelo CLOSING_CURRENCY (nuevo), presente sólo
  cuando se solicitó un set de índices. Cada **contribución** conserva: importe
  nominal, fecha/período de origen, índice de origen, índice de cierre, coeficiente
  aplicado, importe reexpresado antes de redondeo, importe reexpresado en centavos,
  diferencia de redondeo, asiento, línea, cuenta, clasificación, actividad, fórmula
  y control. Identidad explícita: `NOMINAL | CLOSING_CURRENCY`, set/hash de índices,
  fecha de cierre, versión del algoritmo, cobertura y blockers.

Detalle técnico del indirecto reexpresado, puente del efectivo, controles y UI:
ver [`ADR_EFE_PREPARATION_MODEL_2G1.md`](ADR_EFE_PREPARATION_MODEL_2G1.md).

## 5. Disposiciones a crédito, cobros parciales y mixtas (⏳ HITO 3)

Estrategia de vínculo auditable venta↔crédito↔cobro, override de disposición y
controles (`efectivo asignado ≤ efectivo real`): ver ADR 2G.1.

## 6. Panel de políticas EFE (⏳ HITO 4)

El tipo `CashFlowPolicy` ya soporta clasificación por rol con atributos,
intereses/dividendos/IG/sobregiros, overrides con vigencia y versión. El panel se
convierte de "revisión" a **edición fina**; se evalúa si los campos existentes
alcanzan (sin elevar esquema) o si se requiere v22→v23 (migración idempotente).

## 7. Purmamarca QA (⏳ HITO 5)

Seed reproducible por servicios normales (empresa separada "Purmamarca S.A. —
Caso demostrativo"), idempotente, con reset acotado. Importes esperados: inicial
10.000; cierre 49.000; variación 39.000; operación 4.000; inversión 30.000;
financiación 5.000; cobros 32.000; pagos 28.000; controles 0.

## 8. Snapshots, exports, performance, compatibilidad y limitaciones restantes

Se completan en el HITO 9 con métricas antes/después y el manifiesto de evidencia
(`docs/evidence/phase2g1/`).
