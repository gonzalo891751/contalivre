# Revisión formal de exportaciones — Fase 2F (§16)

Artefactos generados con el dataset **ContaLivre RC Acceptance** (2024 comparativo, 2025 actual),
extraídos y revisados con `pdfjs-dist` (texto real, no solo "se genera el archivo").

| Artefacto | Archivo | Páginas |
|---|---|---|
| Juego completo PDF (comparativo, EFE ambos) | [exports/juego-completo.pdf](exports/juego-completo.pdf) | 7 |
| EEPN matricial PDF (A4 apaisado) | [exports/eepn-matriz.pdf](exports/eepn-matriz.pdf) | 1 |
| EFE directo PDF | [exports/efe-directo.pdf](exports/efe-directo.pdf) | 1 |
| EFE indirecto PDF | [exports/efe-indirecto.pdf](exports/efe-indirecto.pdf) | 1 |
| Planilla completa XLSX | [exports/planilla-completa.xlsx](exports/planilla-completa.xlsx) | 14 hojas |

## Checklist de revisión manual (§16)

| Ítem | Resultado |
|---|---|
| Títulos y denominaciones normativas | ✓ ESP / ER / EEPN / EFE con denominación RT 54 |
| Orden de los estados | ✓ ESP → ER → EFE → EEPN (apaisado) → Notas → Anexos |
| Subtotales | ✓ Resultado bruto, operativo, antes de impuesto, continuadas, del ejercicio |
| Comparativo | ✓ dos columnas (actual / anterior) en ESP, ER, EEPN, notas |
| Referencias a notas | ✓ "(Nota N)" en las líneas del ESP; notas numeradas 1..21 |
| Saltos / páginas en blanco | ✓ sin páginas en blanco; EEPN fuerza apaisado y vuelve a vertical |
| Orientación | ✓ EEPN en A4 apaisado (841×595); resto vertical (595×841) |
| Encabezados repetidos | ✓ autotable repite cabecera al paginar |
| Columnas cortadas | ✓ EEPN matriz entra en el ancho apaisado |
| Signos | ✓ regularizadoras y pasivos con signo correcto (previsión −30.000) |
| Marca de borrador | ✓ marca "BORRADOR" cuando el reporte no es publicable o se pide |
| Numeración de página | ✓ "Página N de M" en el pie |
| Moneda / unidad / normativa | ✓ "Cifras en ARS (Pesos ($))", RT 54 T.O. RT 59 |
| Leyenda de notas | ✓ "Las notas 1 a 21 … forman parte integrante…" |
| Motor / versión en el pie | ✓ "Motor 2F.0 · schema v21 · reporte … · VALIDATED" |

## Defecto detectado y corregido por esta revisión

- **ESP duplicado en PDF y planilla**: el generador listaba `currentAssets`/`nonCurrentAssets`
  y además `totalAssets`, que los reexpande como hijos → el activo y el pasivo aparecían dos
  veces. Corregido: los totales se emiten como línea de total sin reexpandir sus componentes
  (`balanceSheetRows` en la planilla; `asTotal()` en el PDF). Verificado en el PDF regenerado:
  Activo corriente → Activo no corriente → Total del activo → Pasivo … (una sola vez).

## Comparación con los modelos oficiales FACPCE/CENCyA

**Coincidencias:**
- Estructura de los cuatro estados básicos y su orden.
- ESP con activo/pasivo corriente y no corriente, PN, y ecuación cerrada.
- ER con resultado bruto, operativo, antes del impuesto, operaciones que continúan y del ejercicio.
- EEPN como cuadro de doble entrada por componente del PN.
- EFE por método directo e indirecto con conciliación.
- Notas numeradas con leyenda de integración; anexos de gastos por función, CMV y bienes de uso.

**Diferencias deliberadas (alcance educativo, declaradas):**
- Leyenda explícita "modo laboratorio educativo local; no constituye estados formales" (Nota 1).
- Se muestran los códigos de cuenta junto a las denominaciones (didáctico); los modelos formales
  suelen omitirlos.
- El pie incluye motor/schema/versión de reporte (trazabilidad), ausente en un estado formal.

**Restricciones / campos pendientes (no se afirma "conforme FACPCE" por generar el archivo):**
- Falta el encabezado de firma del profesional y la fecha de emisión formal.
- El informe del auditor/revisión y la memoria no se generan (fuera de alcance).
- La carátula de identificación del ente es mínima (razón social, CUIT, jurisdicción, ejercicio).

## Nota sobre el dataset

En el ESP/Nota 14 aparece "3.3.01 Resultados no asignados 264.000,00" (cuenta del plan semilla):
el cierre 2024 del fixture toma la primera cuenta imputable con grupo RETAINED_EARNINGS para la
refundición, que resulta ser la del seed. Los totales reconcilian (PN 1.536.000). Es una
particularidad del fixture didáctico, no un defecto del motor ni de la exportación.
