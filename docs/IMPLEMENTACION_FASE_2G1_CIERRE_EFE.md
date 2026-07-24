# Implementación — Fase 2G.1: cierre funcional, contable y de QA del EFE

> **Estado:** COMPLETA. Los seis objetivos críticos están en código, UI,
> exportaciones y pruebas verdes. Rama `refactor/fase-2g1-cierre-efe` (base
> `1a6b22f`), 10 commits atómicos, sin merge, `main` intacto.

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
| Lint | `eslint .` | 0 errores / 53 warnings (preexistentes) |
| Build | `vite build` | (registrado en HITO 9) |

La diferencia baseline 2G ↔ resultado 2G.1 se documenta íntegra en el HITO 9.

## 3. Objetivos y estado

| # | Objetivo | Hito | Estado |
|---|---|---|---|
| 1 | Preparación matricial en moneda de cierre (por contribución) | 2 | ✅ |
| 2 | Disposiciones a crédito, cobro parcial y mixtas | 3 | ✅ |
| 3 | Edición completa y auditable de políticas EFE | 4 | ✅ |
| 4 | E2E Firefox + exportaciones del papel de trabajo | 6–7 | ✅ |
| 5 | Carga del caso Purmamarca para QA manual | 5 | ✅ |
| 6 | Etiquetas/estados honestos (sin controles engañosos) | 8 | ✅ |
| 7 | Documentación y evidencias | 0, 9 | ✅ |

### Commits (uno por hito)

| Hito | Commit | Título |
|---|---|---|
| 0 | `b370d6c` | docs: especificar cierre funcional de la fase 2G |
| 1 | `120b6a3` | test: fijar deudas pendientes del EFE 2G |
| 2 | `69eceb2` | feat: reexpresar modelo de preparación EFE |
| 3 | `36baac3` | feat: soportar disposiciones a crédito y cobros parciales |
| 5 | `9189f6b` | feat: incorporar caso Purmamarca para QA manual |
| 6 | `b32656b` | test: completar exports EFE y papel de trabajo |
| 4 | `b960de7` | feat: completar edición de políticas EFE |
| 7 | `c25e319` | test: cerrar aceptación E2E Chromium y Firefox |
| 8 | `c6f2f15` | fix: ajustar etiquetas gates y compatibilidad histórica |
| 9 | (este) | docs: cerrar fase 2G.1 |

> Nota de orden: los hitos 4/5/6 se materializaron en un orden distinto al del
> plan (5→6→4) por dependencias prácticas; cada commit es atómico, deja sus
> pruebas en verde y no hubo squash. Los títulos coinciden con los del plan.

### Validación final (Node 22.23.1 / npm 10.9.8)

| Medición | Baseline 2G (`1a6b22f`) | Final 2G.1 |
|---|---|---|
| Suite completa | 74 archivos / 466 tests | **80 archivos / 494 tests**, verde |
| EFE focalizadas | 41 tests | 41 + 27 nuevas (restated-preparation, disposals-credit, purmamarca-seed, working-paper, policy-editor, honest-gates) |
| TypeScript | exit 0 | exit 0 |
| Lint | 0 errores / 53 warnings | **0 errores / 53 warnings** (sin nuevos) |
| Build | exit 0 (warning de chunks) | exit 0 (mismo warning preexistente) |
| E2E | chromium-desktop + chromium-mobile | + **firefox-desktop** sobre preparación (nominal y cierre) y exports; 6/6 preparación en Chromium y Firefox |

No se elevó el esquema: sigue en **22** (ver §8). Motor `2G.0`; algoritmo de
preparación `2G.1`.

## 4. Preparación matricial en moneda de cierre (✅ HITO 2)

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

Implementado en `buildCashFlowPreparationRestated`
([`cashFlowPreparation.ts`](../src/reporting/preparation/cashFlowPreparation.ts)),
emitido por `loadReportingBundle` como `bundle.preparationRestated`, consumido por
`PreparacionEfe` (selector Nominal/Cierre, banner honesto, REI en el puente, detalle
de celda con índice/coeficiente por contribución, estado bloqueado) y por
`exportWorkingPaper` (hoja "Reexpresión", opción nominal/cierre/ambas). Falta de
índices ⇒ cobertura `PARTIAL`/`MISSING` y bloqueo (no coef 1).

## 5. Disposiciones a crédito, cobros parciales y mixtas (✅ HITO 3)

El motor consume `CashFlowPolicy` y resuelve estos casos:
- **Detección** `UNRESOLVED_DISPOSAL` (`isCreditOrMixedDisposal` + control
  `efe-disposicion`): firma estrecha (baja de activo no operativo + resultado +
  crédito por cobrar) no plegable ⇒ bloquea; no confunde con depreciaciones/compras.
- **Resolución** por override transaccional (`disposalOverrideForEntry`,
  target ENTRY/OPERATION → inversión/financiación): pliega el asiento, elimina el
  resultado del operativo, excluye el crédito del capital de trabajo. Venta sin
  efectivo ⇒ revela pendiente; cobro total/parcial ⇒ sólo el efectivo real como
  inversión; mixta ⇒ separa efectivo y crédito. Control `assignedCents ≤ efectivo`.

## 6. Panel de políticas EFE (✅ HITO 4)

Panel FUNCIONAL de edición
([`EfePoliticasPanel.tsx`](../src/components/Configuracion/panels/EfePoliticasPanel.tsx)):
roles editables por cuenta con atributos, intereses/dividendos/IG/sobregiros,
overrides (listado + revocación), guardado **versionado** (version+1) con advertencia
de impacto y confirmación, validación visual honesta (completa/requiere revisión/
advertencias). Persiste con `savePolicy` (campos JSON de `cashFlowPolicies`).

## 7. Purmamarca QA (✅ HITO 5)

Seed reproducible por servicios normales
([`purmamarcaDemo.ts`](../src/accounting/fixtures/purmamarcaDemo.ts)), botón de
desarrollo en el panel de fixtures y `npm run seed:purmamarca`. Reproduce EXACTO:
inicial 10.000; cierre 49.000; variación 39.000; operación 4.000; inversión 30.000;
financiación 5.000; cobros 32.000; pagos 28.000; controles 0. Idempotente; reset
acotado; guardia de base limpia.

> **Conflicto arquitectónico documentado (no improvisado):** ContaLivre es
> monoempresa (`DEFAULT_COMPANY_ID`); el pipeline de reporting no conmuta de
> compañía. La "empresa separada" que pide la especificación no es representable sin
> un refactor de multiempresa (riesgo alto, fuera del alcance correctivo de 2G.1).
> **Alternativa adoptada:** el aislamiento probado del fixture RC (guardia de base
> limpia + scoping por `sourceModule` + reset acotado + razón social del caso). No
> contamina datos reales. **Alternativa descartada:** multiempresa real (gran
> superficie de cambio, contradice "no rehacer la arquitectura de 2G").

## 8. Esquema, snapshots, exports, performance y compatibilidad

- **Esquema (§5.J): NO se elevó** (sigue en 22). Los campos que 2G.1 necesitaba ya
  existían: la política EFE (`cashFlowPolicies` v22) es un documento JSON; los
  campos nuevos del override (`assignedCents`, `collectionEntryIds`, `evidence`) son
  propiedades del objeto serializado, no columnas indexadas ⇒ no requieren migración.
  El motor consume la política ya persistida. Backup/restore y reset siguen iterando
  `db.tables`, sin cambios.
- **Snapshots (§10):** un snapshot 2G sin `preparationRestated` sigue siendo legible;
  si se pide moneda de cierre sin modelo reexpresado, la UI muestra "Preparación en
  moneda de cierre no disponible en esta versión histórica" y la nominal, sin rotular
  como cierre. No se reconstruye evidencia inexistente.
- **Exports:** el papel de trabajo admite nominal/cierre/ambas y agrega la hoja
  "Reexpresión"; el export FORMAL nunca incluye la matriz (test de contrato, incluso
  en moneda de cierre).
- **Performance (§11):** la preparación reexpresada **agrega por cuenta** (una fila/
  imputación por cuenta) y retiene las contribuciones sólo para el detalle diferido
  de celda y la hoja "Reexpresión"; no vuelca todas las contribuciones al DOM. Reusa
  el recorrido existente de `flowEntries`; el costo adicional es una pasada lineal por
  líneas con una multiplicación/redondeo por contribución. No degrada los límites del
  motor 10k/100k (mismos recorridos); `performance2f` permanece verde. El detalle por
  contribución se materializa sólo al abrir una celda o exportar el papel de trabajo.
- **Compatibilidad:** cambios aditivos (campos opcionales en tipos existentes); las
  466 pruebas de 2G siguen verdes junto a las 28 nuevas.

## 9. Limitaciones restantes (honestas)

- **Empresa separada real:** no implementada (monoempresa; ver §7). Mitigada con
  aislamiento por guardia + scoping; documentada, no oculta.
- **Reexpresión del comparativo (párr. 197):** el comparativo del EFE existe en
  nominal; su reexpresión en moneda de cierre no se agregó en 2G.1.
- **Overrides de disposición desde la UI:** se listan/revocan en el panel; el ALTA de
  un override de disposición se hace hoy por política/servicio (o seed), no por un
  formulario dedicado en la UI. La resolución contable y el control ya funcionan.
- **Evidencia visual de exports (PDF/XLSX cierre):** verificada por pruebas
  estructurales (más robustas); la inspección visual queda como paso de QA manual.
- **Vista móvil de la preparación en cierre:** reutiliza el layout responsive validado
  en 2G; no se regeneró captura móvil nueva.
