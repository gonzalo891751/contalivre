# Matriz de idempotencia de generadores automáticos — Fase 2C (§10)

Todos los generadores que crean asientos pasan por `createEntry`
(`src/storage/entries.ts`), que en la Fase 2C enruta por `postOperation`
cuando el asiento tiene origen completo (`sourceModule + sourceType +
sourceId`) y no trae clave propia. La clave es:

```
companyId | sourceModule | sourceType | sourceId | accountingEventType
```

`accountingEventType` = el valor explícito de `metadata.accountingEventType`
si el generador lo provee, o el **hash del contenido de las líneas**
(`contentDiscriminator`) en caso contrario. Esto garantiza:

- **mismo hecho repetido** → misma clave → no duplica;
- **hechos distintos de la misma operación** (mismo `sourceId`, líneas
  distintas) → claves distintas → no se fusionan;
- **reintento tras error** → mismo contenido → idempotente;
- **nueva versión** (edición) → reversión + sustituto (clave `#vN`), el
  anulado queda `REVERSED` y `findEntryByIdempotencyKey` lo ignora, por lo
  que el sustituto se contabiliza sin quedar atrapado por la clave vieja.

| Módulo (sourceModule) | Evento | sourceType | sourceId | accountingEventType | Estrategia de clave |
|---|---|---|---|---|---|
| inventory | Compra | purchase | id del movimiento | hash de líneas | derivada |
| inventory | Venta (ingreso) | sale | id del movimiento | hash de líneas (revenue) | derivada |
| inventory | Venta (CMV) | sale | id del movimiento | hash de líneas (cogs) | derivada |
| inventory | Devolución | return / purchase_return | id del movimiento | hash de líneas | derivada |
| inventory | Stock inicial | initial_stock | id del movimiento | hash de líneas | derivada |
| fx | Alta ME | compra/venta/... | id del movimiento fx | hash de líneas | derivada |
| fx | Deuda ME | toma_deuda / cuota | id de la deuda/cuota | hash de líneas | derivada |
| fx | Diferencia de cambio | dif_cambio | id del movimiento | hash de líneas | derivada |
| ops | Comprobante de gasto | vendor_invoice | id del comprobante | hash de líneas | derivada |
| ops | Pago | payment | id del pago | hash de líneas | derivada |
| loans (prestamos) | Alta / cuota / interés | loan_* | id del préstamo/cuota | hash de líneas | derivada |
| impuestos | Cierre / obligación | tax closure/type | uniqueKey del cierre | metadata explícita + hash | derivada |
| fixed-assets | Adquisición | acquisition | id del bien | hash de líneas | derivada |
| fixed-assets | Pago | payment | id del bien | hash de líneas | derivada |
| fixed-assets | Apertura | opening | id del bien | hash de líneas | derivada |
| fixed-assets | Evento (mejora/baja/revalúo) | event type | id del evento | hash de líneas | derivada |
| fixed-assets | Depreciación / RT6 | rt6 / depreciation | id del bien + ejercicio | hash de líneas | derivada |
| investments | Compra/venta/rendimiento | buy/sell/... | id del movimiento | hash de líneas | derivada |
| payroll | Devengamiento | accrual | id de la corrida | hash de líneas | derivada |
| payroll | Pago sueldos / cargas | salary_payment / social_security_payment | id del pago | hash de líneas | derivada |
| closing | Refundición ingresos | refundicion-ingresos | id del ejercicio | (borrador→post; idempotencia por sourceType único) | por servicio de cierre |
| closing | Refundición gastos | refundicion-gastos | id del ejercicio | idem | por servicio de cierre |
| closing | Transferencia resultado | transferencia-resultado | id del ejercicio | idem | por servicio de cierre |
| closing | Apertura | apertura | id del ejercicio cerrado | idem | por servicio de cierre |
| cierre-valuacion / inflation | Ajuste RT6 (borrador) | rt6-adjustment | cierre::voucherKey | hash de líneas | derivada (draft) |

**Notas:**
- Los asientos de `closing` (refundición/apertura) tienen su propia
  idempotencia en `closingService` (`postClosing`/`generateOpeningEntry`
  detectan si ya hay asientos de cierre contabilizados y no duplican).
- Los asientos manuales (sin `sourceModule`) no llevan clave: se numeran
  y no aplican idempotencia (dos asientos manuales idénticos son válidos).
- El ajuste por inflación se genera como **borrador**; su clave protege
  contra doble generación del mismo voucher.
