# ADR — Modelo monetario definitivo de ContaLivre

| Dato | Valor |
|---|---|
| Estado | Aceptado (Fase 2B) |
| Fecha | 16-07-2026 |
| Decisores | Equipo Fase 2B |
| Reemplaza | Estrategia transitoria de la Fase 2A ("number + servicio monetario central") |

## Contexto

Los importes contables de ContaLivre se almacenan como `number` (double IEEE-754) en IndexedDB. La Fase 2A centralizó validación (NaN/Infinity bloqueados), redondeo (half-up con desplazamiento decimal exacto) e igualdad (al centavo), pero dejó pendiente la decisión definitiva. El sistema además maneja magnitudes de naturaleza distinta que hoy comparten tipo: importes contables, cantidades físicas, cotizaciones, tasas, porcentajes e índices.

## Opciones evaluadas

| Criterio | A. Enteros en centavos (number) | B. Decimal como string | C. BigInt | D. Biblioteca decimal (decimal.js/big.js) | E. **Double con integridad de centavos** (elegida) |
|---|---|---|---|---|---|
| Exactitud aritmética | Exacta hasta 2^53 | Exacta | Exacta ilimitada | Exacta | Exacta (toda la aritmética se hace en centavos enteros) |
| IndexedDB | OK | OK pero **rompe el orden de índices** ("9" > "10") | OK (structured clone) | Debe serializarse | OK, índices numéricos intactos |
| JSON / backup / restore | OK | OK | **JSON.stringify lanza TypeError** → rompe backup, PDF, XLSX | Debe convertirse en cada frontera | OK sin cambios |
| Riesgo de migración | **Crítico**: cambia la unidad de todos los importes; una lectura no migrada muestra valores ×100 | Crítico: cientos de call-sites aritméticos dejan de compilar/funcionar | Crítico + serialización | Alto: conversión en cada frontera, nueva dependencia | **Bajo**: el valor almacenado no cambia de unidad; se normaliza al centavo |
| PDF/XLSX | Conversión en cada salida | Conversión | No serializable | Conversión | Sin cambios |
| Monedas con otra escala | Escala fija implícita | Flexible | Escala externa | Flexible | Escala por tipo definida en `SCALES` (extensible) |
| Límite máximo | ±90,07 billones ARS | Ilimitado | Ilimitado | Configurable | ±90,07 billones ARS (`MAX_AMOUNT`), validado en la puerta |
| Rendimiento | Óptimo | Malo (parse constante) | Bueno | Medio | Óptimo |
| Auditoría | Buena | Buena | Difícil (tooling) | Media | Buena: el centavo entero es el valor canónico verificable |

## Decisión

**Opción E — "double con integridad de centavos" (decimal exacto de escala 2 sobre `number`):**

1. **Valor canónico**: todo importe contable es un **entero de centavos**. El `number` persistido es la representación double de `centavos / 100`. La conversión number ↔ centavos usa desplazamiento decimal por string (`toExponential`), que es exacta y determinista: dos importes son iguales si y solo si sus centavos son iguales.
2. **Invariante de integridad de centavos**: en la frontera de contabilización (servicio único) todo importe se redondea **una sola vez** (half-up) y se verifica `isCentExact`: el double debe ser exactamente la representación de sus centavos. Ningún importe con residuo sub-centavo, `NaN`, `±Infinity`, `-0` ni fuera de `±MAX_AMOUNT` (= 2^53/100 − margen) puede ingresar al Diario.
3. **Prohibición de aritmética contable en float**: sumas, comparaciones y agregaciones contables (validación, mayor del motor de reporting, EFE, RECPAM) operan en **centavos enteros** vía `src/accounting/domain/money.ts` (`sumMoney`, `addAmounts`, `subAmounts`, `toCents`). La multiplicación importe × tasa/coeficiente (`multiplyAmountByRate`) redondea exactamente una vez al producir el importe.
4. **Tipología de magnitudes** (`SCALES` en `money.ts`):
   - **Importe contable**: escala 2, redondeo único en la frontera.
   - **Cantidad** (unidades, ME, kg): escala 6, nunca se redondea a 2.
   - **Cotización / precio unitario**: escala 8.
   - **Tasa / porcentaje**: escala 8; se redondea únicamente al producir un importe.
   - **Índice**: se conserva **exactamente como lo publica la fuente** (sin redondeo propio; ver registro de índices versionado).
5. **Valores de origen**: cuando la migración o una conversión altera un valor legacy, el valor original se conserva en `metadata.legacyAmounts`.

### Por qué no A (enteros en centavos persistidos)

Cambiar la unidad de los importes almacenados exige migrar simultáneamente 35 tablas y cada lectura de la aplicación; cualquier lector no migrado interpreta $100,00 como $10.000,00. El beneficio de exactitud ya se obtiene con la opción E (la aritmética ES en centavos); el riesgo residual de A es desproporcionado para una base local con datos reales de usuarios.

### Por qué no BigInt

`JSON.stringify(BigInt)` lanza `TypeError`: rompe backup/restore, exportaciones y React sin una capa de serialización total, explícitamente desaconsejada por la letra de la fase.

## Migración (schema v18)

- Recorre todos los asientos; para cada línea calcula el canónico `roundMoney(x)`; si difiere del almacenado (residuo binario o >2 decimales) lo normaliza y **conserva el valor original** en `metadata.legacyAmounts`.
- Diferencias ≥ $0,005, importes fuera de rango o no finitos ⇒ **informe de excepciones** en `systemMeta.migrationExceptions` + `metadata.needsReview` (no se inventan redondeos silenciosos: la normalización de residuo sub-centavo es la única transformación automática, y queda registrada).
- Idempotente (`schemaVersion >= 18` se salta), transaccional (upgrade Dexie con rollback) y probada desde una base v17 con floats sucios.

## Consecuencias

- El Diario garantiza importes exactos al centavo, comparables por igualdad estricta, serializables en JSON/IndexedDB/XLSX sin conversión.
- Los motores nuevos (reporting, EFE, RECPAM) tienen prohibido acumular en float: consumen las primitivas de centavos.
- Deuda explícita: los módulos operativos legacy aún hacen cálculos intermedios en float; sus resultados se normalizan y validan en la frontera de contabilización, que es el único punto de entrada al Diario. La conversión de esos cálculos intermedios a las primitivas es incremental (no bloqueante: la frontera protege los libros).
