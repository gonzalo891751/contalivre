# Evidencia — Fase 2G (EFE matricial auditable)

Rama `refactor/fase-2g-efe-matricial-auditable`. Node 22.23.1 / npm 10.9.8.

## Capturas (`screenshots/`)

| Archivo | Qué muestra | Cómo se generó |
|---|---|---|
| `exposicion-efe.png` | Vista de Exposición del EFE (dataset RC) | `npx playwright test preparacion-efe --project=chromium-desktop` |
| `preparacion-matriz-controles.png` | Matriz de preparación + panel de controles | idem |
| `preparacion-celda-formula.png` | Modal de detalle de celda con fórmula y lineage | idem |
| `configuracion-politicas-efe.png` | Panel "Políticas del Estado de Flujo de Efectivo" | idem |
| `preparacion-movil-390.png` | Preparación en 390×844 (tarjetas, sin recorte) | `npx playwright test mobile --project=chromium-mobile` |

Las capturas se regeneran ejecutando los specs E2E anteriores (arrancan el dev server de Vite y
cargan el dataset RC de forma idempotente).

## Resultado de gates (Node 22.23.1)

- **Suite unitaria/integración/contrato:** 74 archivos / 466 tests — verde.
- **tsc `--noEmit`:** exit 0.
- **lint:** 0 errores, 53 warnings (preexistentes, sin aumento).
- **build:** exit 0 (sólo warning preexistente de tamaño de chunks).
- **E2E:** `preparacion-efe` (chromium-desktop, 2 tests) y `mobile` (chromium-mobile, 1 test,
  con aserción geométrica `scrollWidth<=clientWidth`) — verde.

## Purmamarca (fixture permanente de tests)

Efectivo 10.000 → 49.000, variación 39.000. Directo=Indirecto. Controles de la matriz por
fila/columna/total en **cero**. Puentes: 35.000−3.000=32.000 · 20.000+10.000−0=30.000 ·
30.000−2.000=28.000. Exposición por actividad 4.000/30.000/5.000.

## Hashes de artefactos clave (SHA-256, prefijo)

| Archivo | SHA-256 (16) |
|---|---|
| `src/reporting/preparation/cashFlowPreparation.ts` | `02c20037012ca1c8` |
| `src/reporting/engine/publicationGate.ts` | `b145b9a23e202cda` |
| `src/reporting/policy/cashFlowPolicy.ts` | `a61aca87124c83d7` |
| `src/lib/exportWorkingPaper.ts` | `1d8d18dcfd5160bd` |

(Regenerar con `sha256sum <archivo>`. El hash de contenido del snapshot es determinista y
cambia ante cualquier cambio material — ver `snapshotService.materialHashInput`.)
