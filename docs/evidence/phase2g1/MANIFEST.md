# Evidencia — Fase 2G.1 (cierre funcional del EFE)

Rama `refactor/fase-2g1-cierre-efe` · base `1a6b22f` · validación con Node 22.23.1.

## Capturas (E2E real, Chromium/Firefox 1440×900)

| Archivo | Bytes | SHA-256 |
|---|---:|---|
| `screenshots/preparacion-moneda-cierre.png` | 426868 | `24e72cc48f38ef2abae4e95d746a8f29294f681330b0e810fa98d1f59f108b96` |
| `screenshots/preparacion-cierre-coeficiente.png` | 222747 | `d3a075422b202190adcddda4080d32dcec0410f2439e0fded81e21297abbdc7f` |
| `screenshots/politicas-efe-edicion.png` | 496090 | `8682820fd86af8275e11d8ccfe9503fc07155f29f62f42a43ea853fbb4cd0273` |

- **preparacion-moneda-cierre**: vista Preparación + Moneda de cierre, con el banner
  honesto "Importes expresados en moneda de cierre", la ayuda de reexpresión y el
  REI en el puente del efectivo.
- **preparacion-cierre-coeficiente**: detalle de celda con la tabla "Reexpresión por
  contribución" (importe nominal, índice origen/cierre, coeficiente, reexpresado,
  redondeo).
- **politicas-efe-edicion**: panel de políticas EFE en modo edición (roles editables,
  intereses/dividendos/IG/sobregiros, overrides, guardado versionado).

## Evidencia por prueba determinista (Vitest, más fiable que una captura)

Estos casos se congelan como pruebas (regresión permanente); su "evidencia" es el
test verde reproducible, no una imagen:

| Concepto | Prueba |
|---|---|
| Preparación cierre + REI + coef por contribución | `tests/reporting/efe2g1-restated-preparation.test.ts` |
| Falta de índices → bloqueo (no coef 1) | `tests/reporting/efe2g1-restated-preparation.test.ts` |
| Venta a crédito (detección/bloqueo y resolución) | `tests/reporting/efe2g1-disposals-credit.test.ts` |
| Cobro parcial (sólo efectivo real) | `tests/reporting/efe2g1-disposals-credit.test.ts` |
| Operación mixta (efectivo vs crédito) | `tests/reporting/efe2g1-disposals-credit.test.ts` |
| Override (control importe asignado ≤ efectivo) | `tests/reporting/efe2g1-disposals-credit.test.ts` |
| Blocker / gate honesto | `tests/reporting/efe2g1-honest-gates.test.ts` |
| Panel de políticas (edición/persistencia/vigencia) | `tests/reporting/efe2g1-policy-editor.test.ts` |
| Purmamarca cargado (importes exactos) | `tests/reporting/efe2g1-purmamarca-seed.test.ts` |
| Papel de trabajo cierre (hoja Reexpresión) | `tests/reporting/efe2g1-working-paper.test.ts` |
| Firefox / Chromium E2E | `e2e/preparacion-efe.spec.ts` (6/6) |

## Notas de honestidad

- No se incluyen capturas de PDF cierre / XLSX cierre porque su corrección se verifica
  estructuralmente en las pruebas de export (contenido de hojas y reconciliación),
  más robusto que una inspección visual. La inspección visual de exports queda como
  paso de QA manual documentado en el informe de la fase.
- La vista móvil de la preparación en moneda de cierre reutiliza el layout responsive
  ya validado en la Fase 2G (tarjetas, sin recorte); no se regeneró una captura nueva
  para no duplicar evidencia equivalente.
