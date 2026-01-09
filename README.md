# Entrenador Contable - MVP 0.2

Aplicación web educativa (PWA) para practicar contabilidad con plan de cuentas jerárquico estilo Argentina.

![Estado: MVP 0.2](https://img.shields.io/badge/Estado-MVP%200.2-blue)
![Stack: React + TypeScript](https://img.shields.io/badge/Stack-React%20%2B%20TypeScript-61DAFB)
![Tests: 29 passing](https://img.shields.io/badge/Tests-29%20passing-green)

## 🚀 Inicio rápido

```bash
npm install
npm run dev    # Servidor de desarrollo en http://localhost:5173
npm test       # Ejecutar tests (29 tests)
npm run build  # Build de producción
```

## 📁 Estructura

```
src/
├── core/           # Lógica contable pura (sin dependencias React)
│   ├── models.ts   # Tipos: Account, JournalEntry, StatementSection, etc.
│   ├── validation.ts
│   ├── ledger.ts
│   ├── balance.ts
│   └── statements.ts
├── storage/        # Persistencia IndexedDB (Dexie)
│   ├── db.ts       # Schema v2 con unique code constraint
│   ├── seed.ts     # Plan de cuentas Argentina (~85 cuentas)
│   └── accounts.ts # CRUD con generación automática de código
├── pages/          # 7 páginas React
└── styles/         # Sistema de diseño CSS
```

## 🆕 Novedades MVP 0.2

### Plan de Cuentas Jerárquico

- **Vista árbol**: Expandible/colapsable
- **Generación automática de código**: Basado en cuenta padre
- **Clasificación completa**: `kind`, `section`, `group`, `statementGroup`
- **Contra-cuentas**: Para amortización acumulada, previsiones, etc.
- **Cuentas rubro (header)**: No imputables, solo agrupan

### Modelo Account Expandido

```typescript
interface Account {
  id: string
  code: string              // "1.1.01.02" - único, jerárquico
  name: string
  kind: AccountKind         // ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
  section: AccountSection   // CURRENT | NON_CURRENT | ADMIN | SELLING | etc.
  group: string             // "Caja y Bancos", "Bienes de uso"
  statementGroup: StatementGroup | null  // Para mapeo a estados
  parentId: string | null   // Jerarquía
  level: number             // Profundidad (0 = raíz)
  normalSide: NormalSide    // DEBIT | CREDIT
  isContra: boolean         // Regularizadora (ej: amort. acumulada)
  isHeader: boolean         // Rubro, no imputable
}
```

### Generación Automática de Código

```
Usuario elige padre "1.2.01 Bienes de uso"
→ Sistema sugiere "1.2.01.06" (siguiente disponible)
→ Toggle "Modo avanzado" para editar manualmente
```

### Estados Contables Mejorados

**Estado de Resultados:**
```
Ventas netas
(-) Costo de ventas
= RESULTADO BRUTO
(-) Gastos de administración
(-) Gastos de comercialización
= RESULTADO OPERATIVO
(+/-) Resultados financieros
(+/-) Otros resultados
= RESULTADO DEL EJERCICIO
```

**Contra-cuentas:**
- Se muestran en cursiva con signo negativo
- Netean automáticamente en su grupo
- Ej: Muebles $5000 - Amort.Acum ($500) = PPE neto $4500

## 🏗 Seed Argentina Típico

~85 cuentas organizadas:

| Código | Rubro |
|--------|-------|
| 1.1 | Activo Corriente |
| 1.2 | Activo No Corriente |
| 2.1 | Pasivo Corriente |
| 2.2 | Pasivo No Corriente |
| 3 | Patrimonio Neto |
| 4 | Ingresos |
| 5 | Costos |
| 6 | Gastos (Admin/Comerc) |
| 7 | Resultados Financieros y Otros |

Incluye contra-cuentas para:
- Amortización acumulada (BU, Intangibles)
- Previsión para incobrables

## 🧪 Tests

29 tests cubriendo:
- Validación de asientos
- Cálculo de ledger con normalSide
- Balance de sumas y saldos (excluye headers)
- Estados contables con neteo de contra-cuentas

## 📄 Licencia

MIT
