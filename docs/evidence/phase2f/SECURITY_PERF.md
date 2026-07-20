# Performance y seguridad — Fase 2F (§17/§18)

## Performance del motor canónico (§17)

Medido con `tests/reporting/performance2f.test.ts` (construcción del bundle
completo: TB normalizado + ESP/ER/EEPN matriz + gastos por función + CMV +
bienes de uso + moneda extranjera + EFE directo/indirecto). Runner: vitest en
Node 22.

| Caso | 2C (aprox.) | 2F | Budget | Escala |
|---|---|---|---|---|
| 10.000 asientos → bundle | no medido | **169 ms** | < 1.500 ms | — |
| 100.000 asientos → bundle | no medido | **1.328 ms** | < 12.000 ms | ~lineal (≈8× el de 10k) |

Conclusión: el motor es lineal en el número de asientos; las matrices (EEPN,
gastos, bienes de uso) se computan en un solo pase. No se requiere
virtualización a nivel de motor para estos tamaños. Las tablas de UI (EEPN,
gastos, bienes de uso) tienen scroll interno con encabezados sticky; para
datasets de 100k **filas de detalle** en una sola tabla se recomienda
virtualización de UI como deuda futura (no aplica al RC: el detalle por cuenta
es acotado por el plan de cuentas, no por la cantidad de asientos).

Budgets definidos: bundle < 1.500 ms @ 10k, < 12.000 ms @ 100k. La suite falla
si se superan (detección de regresiones de orden de magnitud).

## Warnings de lint (§18.1)

`npm run lint` → **0 errores, 53 warnings** (baseline).

- Se corrigió **1 error** introducido en 2F: `no-control-regex` en
  `sanitizeContent` (notas manuales) — reescrito sin regex de control-chars.
- Los **53 warnings son preexistentes** y NINGUNO está en el código de las
  Fases 2E/2F. Distribución por módulo: `pages/Planillas` (6), `pages/Operaciones`
  (5), `ui/Layout`, `AccountSearchSelectWithBalance`, `AsientosMobile`,
  `useTaxClosure`, `components/mapping`, `ImportAsientosUX` (1 c/u) y el resto en
  módulos FX/inflación/inventario.
- Categorías: `react-hooks/exhaustive-deps` (dependencias faltantes) y
  "logical expression could make deps change" del patrón `useLiveQuery(...) ?? []`.
- Decisión (conservadora para el RC): NO se tocan ~50 puntos en UI legacy no
  relacionada (churn riesgoso fuera del alcance de la fase). No se desactivan
  reglas globalmente. Condición de salida: refactor de los hooks FX/planillas a
  `useMemo` de la expresión lógica, en una fase de mantenimiento de UI.

## Vulnerabilidades (§18.2)

### Producción (`npm audit --omit=dev`): 2 moderate, ninguna alta/crítica

- `brace-expansion <1.1.13` (ReDoS/hang): **resuelto** con `npm audit fix`
  (no-breaking).
- `uuid <11.1.1` vía `exceljs` (GHSA-w5hq-g745-h8pq, "Missing buffer bounds
  check in v3/v5/v6 when buf is provided"): **2 moderate restantes**.
  - **Superficie**: `exceljs` (lectura/escritura de planillas, lazy-loaded).
  - **Explotabilidad**: NULA en este uso. El advisory solo afecta a
    `uuid.v3/v5/v6` cuando se pasa un buffer `buf` como argumento; `exceljs`
    genera ids sin pasar `buf`, por lo que la ruta vulnerable no se ejecuta.
  - **Mitigación**: el `--force` degradaría a `exceljs@3.4.0` (breaking, y 3.x
    arrastra otros problemas). Se mantiene exceljs ≥3.5.0.
  - **Condición de salida**: actualizar cuando `exceljs` publique una versión
    con `uuid@≥11.1.1`, o migrar a otra biblioteca mantenida.

### Solo desarrollo (no se despliega)

- `esbuild <=0.24.2` (GHSA-67mh-4wv8-2f99, dev-server request smuggling) vía
  `vite-node`/`vitest`, y transitivas de `@playwright/test`. **No shipean**: son
  herramientas de test/build que corren solo local/CI. El fix requiere
  `vitest@4` (breaking); se difiere. El servidor de desarrollo no se expone a
  Internet, por lo que el vector (una web maliciosa consultando el dev server)
  no aplica en el flujo de trabajo.

Import/export: los límites de importación (extensión, tamaño ≤ 5 MB, ≤ 10.000
filas, ≤ 60 columnas) siguen vigentes; el backup incluye todas las tablas y el
restore rechaza un schema más nuevo (probado).
