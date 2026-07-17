# ADR — Exportación e importación de planillas (salida de `xlsx`)

| Dato | Valor |
|---|---|
| Estado | Aceptado (Fase 2C) |
| Fecha | 17-07-2026 |
| Reemplaza | `xlsx` (SheetJS Community, `docs/SECURITY_EXCEPTION_XLSX.md`) |

## Contexto

La Fase 2B dejó `xlsx@0.18.5` con dos advisories **high** sin fix disponible en npm (Prototype Pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9). La condición de salida documentada era migrar a una biblioteca mantenida y cerrar SEC-002. En el código, `xlsx` se usaba **solo para lectura** de XLSX en 6 importadores (asientos, plan de cuentas, extractos bancarios, índices, comparativos ESP/ER). No había escritura de XLSX (las exportaciones tabulares no existían aún como feature).

## Opciones evaluadas

| Criterio | A. `exceljs` 4.4.0 (elegida) | B. `write-excel-file` 4.1.1 | C. `@e965/xlsx` (fork SheetJS) | D. CSV puro (papaparse) |
|---|---|---|---|---|
| Lee XLSX | ✅ | ❌ (solo escribe) | ✅ | ❌ |
| Escribe XLSX | ✅ | ✅ | ✅ | ❌ (solo CSV) |
| Mantenimiento | Activo, comunidad amplia | Activo | Fork del código vulnerable | N/A (ya presente) |
| Advisories high/critical | Ninguno vigente | Ninguno | **Hereda los de SheetJS** | Ninguno |
| Navegador | ✅ (Blob/ArrayBuffer) | ✅ | ✅ | ✅ |
| Preserva tipos | ✅ (celdas tipadas, fechas) | ✅ | ✅ | Parcial (todo texto) |
| Límites de filas/columnas | Configurable en el consumidor | — | — | En el consumidor |
| Bundle | ~600 KB (lazy) | ~40 KB | ~800 KB | 0 (ya está) |

## Decisión

**`exceljs` para leer y escribir XLSX; `papaparse` (ya presente) para CSV.**

- No se elige `@e965/xlsx` porque es el mismo código de SheetJS: arrastra las vulnerabilidades, no las cierra.
- `write-excel-file` no sirve: no lee, y los importadores necesitan lectura.
- `exceljs` se **carga bajo demanda** (`await import('exceljs')`) dentro de cada importador/exportador para no penalizar el bundle inicial.
- Los **límites de importación** existentes (`src/accounting/importLimits.ts`: extensión, tamaño ≤ 5 MB, ≤ 10.000 filas, ≤ 60 columnas) se mantienen y se aplican antes de parsear.

## Implementación

- Helper único de lectura: `src/lib/spreadsheet.ts` → `readSpreadsheet(file)` devuelve `{ headers, rows }` (filas como objetos `Record<string, unknown>`), con exceljs para XLSX y papaparse para CSV, aplicando los límites.
- Helper único de escritura: `src/lib/spreadsheet.ts` → `writeWorkbook(sheets)` genera un `.xlsx` con exceljs desde estructuras `{ name, rows }`.
- Los 6 importadores migran a `readSpreadsheet`; ninguno importa `xlsx`.
- Exportación de estados: `src/lib/exportReportBundle.ts` usa `writeWorkbook` desde el `ReportingBundle` (una sola fuente de cifras).

## Consecuencias

- `xlsx` se elimina de `package.json`, lockfile e imports.
- `npm audit --omit=dev` deja de reportar las advisories de `xlsx`. **SEC-002 se cierra** salvo que aparezca otra vulnerabilidad high/critical (en cuyo caso se documenta, no se oculta).
- Los archivos XLSX de importación se leen con una biblioteca mantenida; la lectura sigue acotada por los límites de tamaño/filas y validada por la puerta única de contabilización.
