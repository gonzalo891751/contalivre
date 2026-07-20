# Evidencia visual — Fase 2F (Release Candidate)

Generada con Playwright (Chromium headless 149) contra la app real (`vite dev`),
dataset determinista **ContaLivre RC Acceptance** (ejercicios fijos 2024/2025).
Sin datos privados reales. Regenerable con `npm run e2e:visual` y `npm run e2e:exports`.

## Capturas — escritorio 1920×1080

| Pantalla | Archivo | Verificado |
|---|---|---|
| ESP validado | [esp-1920](screenshots/esp-1920.png) | totales, chip conciliado |
| ESP comparativo | [esp-comparativo-1920](screenshots/esp-comparativo-1920.png) | columnas Actual/Anterior/Δ |
| Detalle de invariantes | [validaciones-detalle-1920](screenshots/validaciones-detalle-1920.png) | tabla de checks desplegada |
| ER completo | [er-completo-1920](screenshots/er-completo-1920.png) | antes de impuesto 62.000 · IG 30.000 · neto 32.000 |
| Drilldown linaje | [drilldown-linaje-1920](screenshots/drilldown-linaje-1920.png) | modal cuenta→asientos |
| EEPN matriz | [eepn-matriz-1920](screenshots/eepn-matriz-1920.png) | grupos, transferencias en 0, cierre 1.536.000 |
| EEPN estructura completa | [eepn-matriz-completa-1920](screenshots/eepn-matriz-completa-1920.png) | filas con guiones |
| EEPN resumido | [eepn-resumen-1920](screenshots/eepn-resumen-1920.png) | toggle |
| EFE directo detalle | [efe-directo-detalle-1920](screenshots/efe-directo-detalle-1920.png) | ecuación + subcategorías |
| EFE directo resumen | [efe-directo-resumen-1920](screenshots/efe-directo-resumen-1920.png) | modo resumen |
| EFE indirecto detalle | [efe-indirecto-detalle-1920](screenshots/efe-indirecto-detalle-1920.png) | explicaciones de ajustes |
| Notas | [notas-1920](screenshots/notas-1920.png) | numeradas, reconciliadas |
| Nota créditos + previsión | [notas-creditos-prevision-1920](screenshots/notas-creditos-prevision-1920.png) | regularizadora en negativo |
| Gastos por función | [gastos-por-funcion-1920](screenshots/gastos-por-funcion-1920.png) | regla 60/40 aplicada |
| Puente CMV | [cmv-puente-1920](screenshots/cmv-puente-1920.png) | EI+C−EF=CMV conciliado |
| Bienes de uso | [bienes-de-uso-1920](screenshots/bienes-de-uso-1920.png) | clase Rodados, residual |
| Moneda extranjera | [moneda-extranjera-1920](screenshots/moneda-extranjera-1920.png) | USD 150.000, insuficiencia declarada |
| Estado bloqueado | [estado-bloqueado-1920](screenshots/estado-bloqueado-1920.png) | banner rojo, botón deshabilitado |
| Estado revalidado | [estado-revalidado-1920](screenshots/estado-revalidado-1920.png) | tras revertir variante |
| Versión validada | [version-validada-1920](screenshots/version-validada-1920.png) | snapshot guardado |
| Impresión (media print) | [esp-print-1920](screenshots/esp-print-1920.png) | sin cortes |

## Capturas — resoluciones

| Resolución | ESP | EEPN |
|---|---|---|
| 1440×900 | [esp](screenshots/esp-1440x900.png) | [eepn](screenshots/eepn-1440x900.png) |
| 1366×768 | [esp](screenshots/esp-1366x768.png) | [eepn](screenshots/eepn-1366x768.png) |
| 1024×768 | [esp](screenshots/esp-1024x768.png) | [eepn](screenshots/eepn-1024x768.png) |
| Tablet 768×1024 | [esp](screenshots/esp-tablet-768x1024.png) | [eepn](screenshots/eepn-tablet-768x1024.png) |

## Capturas — móvil 390×844

| Pantalla | Archivo |
|---|---|
| ESP | [esp-movil-390](screenshots/esp-movil-390.png) |
| ER | [er-movil-390](screenshots/er-movil-390.png) |
| EEPN por movimiento (aportes) | [eepn-movil-aportes-390](screenshots/eepn-movil-aportes-390.png) |
| EEPN por movimiento (cierre) | [eepn-movil-cierre-390](screenshots/eepn-movil-cierre-390.png) |
| EFE | [efe-movil-390](screenshots/efe-movil-390.png) |
| Notas | [notas-movil-390](screenshots/notas-movil-390.png) |
| CMV | [cmv-movil-390](screenshots/cmv-movil-390.png) |

## Exportables reales (dataset RC)

| Artefacto | Archivo |
|---|---|
| Juego completo PDF (comparativo, EFE ambos) | [juego-completo.pdf](exports/juego-completo.pdf) |
| EEPN matricial PDF (A4 apaisado) | [eepn-matriz.pdf](exports/eepn-matriz.pdf) |
| EFE directo PDF | [efe-directo.pdf](exports/efe-directo.pdf) |
| EFE indirecto PDF | [efe-indirecto.pdf](exports/efe-indirecto.pdf) |
| Planilla completa XLSX | [planilla-completa.xlsx](exports/planilla-completa.xlsx) |

## Incidencias detectadas por esta validación (y su estado)

1. **Versión hardcodeada "v1.0.4"** en Sidebar y MobileDrawer → corregida a
   `APP_VERSION` (fuente única). Detectada en la primera captura del EEPN.
2. **Encabezado de columna truncado** ("Resultados de ejercicios an…") en la
   matriz del EEPN → corregida la especificidad CSS (white-space normal).
3. **Encabezados de columna repetidos** en el ER comparativo (tres bloques de
   filas) → `hideColumnHeaders` en los bloques encadenados.
4. La clasificación estructural muestra la AREA en "Distribuciones" y la
   reexpresión del capital en "Aportes" → se corrige con
   `equityMovementType` persistido (hito §9 de la fase), no con parches visuales.
5. En las capturas fullPage del móvil, la barra de navegación inferior fija
   aparece a mitad de página: artefacto del screenshot de página completa, no
   un defecto de la UI (el flujo interactivo pasó con el viewport real).
