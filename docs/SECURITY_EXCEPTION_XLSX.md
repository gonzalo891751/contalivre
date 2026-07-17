# Excepción de seguridad aceptada — dependencia `xlsx` (SheetJS)

| Dato | Valor |
|---|---|
| Estado | **Excepción temporal aceptada y documentada** (Fase 2B, §15.5) |
| Fecha de aceptación | 16-07-2026 |
| Dependencia | `xlsx@^0.18.5` (SheetJS Community Edition) |
| Advisories | GHSA-4r6h-8v6p-xvw6 (Prototype Pollution, high) · GHSA-5pgg-2g8v-p4x9 (ReDoS, high) |
| Fix disponible en npm | **No** (la CE de npm está discontinuada; las versiones parcheadas se distribuyen solo desde el CDN propio de SheetJS) |

## Alternativas evaluadas

1. **Reemplazo por `exceljs`**: biblioteca mantenida, pero implica reescribir todos los importadores/exportadores (asientos, cuentas, bancos, índices, comparativos) y revalidar cada flujo. Es la salida definitiva; excede el alcance seguro de esta fase con el resto de los hitos contables comprometidos.
2. **Parseo en Worker**: aísla el hilo principal pero no elimina las vulnerabilidades (prototype pollution afecta al objeto resultante; ReDoS también bloquea el worker).
3. **Mantener con mitigaciones y excepción documentada** ← **elegida**.

## Superficie real y mitigaciones vigentes

- ContaLivre es una aplicación **local sin backend**: el único archivo procesado es el que el propio usuario elige desde su disco. No hay procesamiento de archivos de terceros no confiables por diseño.
- Límites de importación activos (`src/accounting/importLimits.ts`, aplicados en el importador de asientos): extensión permitida, tamaño ≤ 5 MB, ≤ 10.000 filas, ≤ 60 columnas.
- Los datos importados atraviesan la **puerta única de contabilización** (validación completa de cuentas, importes finitos con integridad de centavos, partida doble, período abierto): un objeto contaminado no puede llegar al Diario sin pasar esas verificaciones tipadas.
- La exportación XLSX solo serializa datos propios (sin parseo).

## Riesgo residual aceptado

- ReDoS al parsear un archivo malicioso elegido por el propio usuario: cuelga la pestaña del navegador; sin impacto en datos (IndexedDB no se toca hasta la confirmación).
- Prototype pollution sobre el objeto parseado: mitigado por los límites y por la validación tipada previa a persistir.

## Condición de salida (Fase 2C)

Migrar los importadores a `exceljs` (o parser CSV puro + plantillas) y retirar `xlsx`. **SEC-002 NO se marca como resuelto**: queda en estado *aceptado con excepción documentada* hasta ejecutar esa migración.
