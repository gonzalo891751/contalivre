# 🔍 Auditoría Técnica V2: Datos de la Empresa (Company Profile)

**Fecha:** 2026-02-04  
**Versión:** 2.1  
**Auditor:** AI Staff Engineer  
**Estado:** ✅ Auditoría completada — Listo para implementación

---

## 1. Resumen Ejecutivo

- **NO existe tabla `companyProfile`** en Dexie. El único registro de configuración es `settings` (con `seedVersion` y `lastUpdated`).
- **El nombre de empresa está hardcodeado** en `src/pages/Estados.tsx` línea 190: `const empresaName = 'Mi Empresa S.A.'`
- **CUIT aparece en placeholders** en varios archivos (`journalPdf.ts`, prototipos HTML, Conciliaciones).
- **Dexie está en versión 13** con patrón de migración incremental limpio.
- **Capital Social identificado** como código `3.1.01` en el seed del Plan de Cuentas.
- **Prototipo `Datosiniciales.html` analizado** — contiene UI completa con toggle Básico/Avanzado.

---

## 2. Análisis del Prototipo (Datosiniciales.html)

> **Path:** `docs/prototypes/Datosiniciales.html` (1133 líneas, 64KB)

### 2.1 Estructura General

| Componente | Descripción |
|:-----------|:------------|
| **Dashboard Widget** | Card "Datos de la Empresa" con dos estados: `empty-state` (CTA configurar) y `filled-state` (resumen + PDF) |
| **Modal de Configuración** | Panel de 2 columnas: formulario izq + preview PDF derecha |
| **Toggle Básico/Avanzado** | Switch que muestra/oculta secciones adicionales |
| **Preview PDF en vivo** | Actualización real-time de header oficial mientras tipeas |
| **Print Template** | HTML oculto con formato oficial RT9/16 para `window.print()` |

### 2.2 Campos del Formulario (Mapping a Interface)

| **Campo UI** | **Input ID** | **Sección** | **Requerido** | **Prop sugerida** |
|:-------------|:-------------|:------------|:--------------|:------------------|
| Denominación de la Entidad | `inp-name` | Básico | ✅ | `legalName` |
| CUIT | `inp-cuit` | Básico | ✅ | `cuit` |
| Tipo Societario | `<select>` | Básico | | `legalForm` |
| Actividad Principal | `inp-activity` | Básico | ✅ | `mainActivity` |
| Domicilio Legal | `inp-address` | Básico | ✅ | `legalAddress` |
| Fecha Inicio Ejercicio | `inp-start` | Básico | | `fiscalYearStart` |
| Fecha Cierre Ejercicio | `inp-end` | Básico | | `fiscalYearEnd` |
| Nombre para Bienvenida | `inp-user` | Básico | | `userName` |
| Duración de la Sociedad | `inp-duration` | Avanzado | | `companyDuration` |
| Unidad de medida | `inp-measure` | Avanzado | | `measureUnit` |
| Estados contables al | `inp-states-at` | Avanzado | | `statementsAsOf` |
| Ejercicio Económico N° | `inp-year-num` | Avanzado | | `fiscalYearNumber` |
| Inscrip. Estatuto | `inp-reg-statute` | Avanzado | | `registrationStatuteDate` |
| Inscrip. Modificación | `inp-reg-mod` | Avanzado | | `registrationModificationDate` |
| Identificación Registro | `inp-reg-id` | Avanzado | | `registrationId` |
| Controladora - Denominación | `inp-parent-name` | Avanzado | | `controllingEntity.name` |
| Controladora - CUIT | `inp-parent-cuit` | Avanzado | | `controllingEntity.cuit` |
| Controladora - Actividad | `inp-parent-activity` | Avanzado | | `controllingEntity.activity` |
| Controladora - Domicilio | `inp-parent-address` | Avanzado | | `controllingEntity.address` |

### 2.3 Composición del Capital (Automática)

El prototipo define una tabla de **sólo lectura** calculada desde el sistema:

```javascript
// Estructura en localStorage (CAPITAL_KEY)
{
  circulation: { qty, class, nominal, subscribed, registered, integrated },
  portfolio: { qty, class, nominal, subscribed, registered, integrated }
}
```

| Columna | Significado |
|:--------|:------------|
| Estado | "En circulación" / "En cartera" |
| Cant. | Cantidad de acciones |
| Clase | "Ordinarias Nom." / etc. |
| VN ($) | Valor Nominal |
| Suscripto | Capital suscripto |
| Integrado | Capital integrado |

> ⚠️ Esta tabla se puebla desde saldos contables + metadata configurada (VN, clase).

### 2.4 Persistencia Propuesta (localStorage → Dexie)

| Key Prototipo | Migrar a | Notas |
|:--------------|:---------|:------|
| `contalivre_company_profile_v1` | `companyProfile` table | Singleton id='default' |
| `contalivre_capital_composition_v1` | Calculado runtime | No persistir — deriva de ledger |

### 2.5 Estados UI Identificados

1. **Empty State** — Sin datos configurados
   - Card naranja con warning icon
   - CTA "Configurar ficha ahora"
   
2. **Filled State** — Datos cargados
   - Header con nombre + CUIT + icono Buildings
   - Grid 3-col con Actividad, Domicilio, Ejercicio
   - Botones "PDF Oficial" y "Editar"

3. **Estados Contables Badge** — En header de `/estados`
   - Pill clickeable que abre modal
   - Dot verde si configurado, gris si no
   - Label truncado a 150px

---

## 3. Puntos de Anclaje Confirmados

| **Path** | **Uso Actual** | **Impacto** | **Cómo conectar** |
|:---------|:---------------|:------------|:------------------|
| `src/pages/Estados.tsx` L190 | `const empresaName = 'Mi Empresa S.A.'` | **CRÍTICO** — Header de todos los estados contables | Reemplazar por `useCompanyProfile().legalName` |
| `src/pages/Estados.tsx` L189 | `const empresaId = 'default'` | Singleton ID para ESP comparative | Ya correcto — usar mismo ID para companyProfile |
| `src/pages/Dashboard.tsx` L128 | `<h1>¡Bienvenido!</h1>` | Saludo genérico | Agregar: `¡Bienvenido, {userName}!` o `¡Bienvenido a {legalName}!` |
| `src/components/Estados/EstadosHeader.tsx` L51 | `<span>{empresaName}</span>` | Chip empresa en header | Ya recibe prop — solo cambiar origen en padre |
| `src/components/Estados/EstadoSituacionPatrimonialGemini.tsx` L282 | `{entidad \|\| 'Mi Empresa S.A.'}` | Fallback hardcodeado | Eliminar fallback, usar prop obligatorio |
| `src/components/Estados/EvolucionPNTab.tsx` L254 | `<strong>Razón Social:</strong> {empresaName}` | Nota formal | Ya recibe prop desde Estados.tsx |
| `src/components/Estados/NotasAnexosTab.tsx` L230 | `{empresaName.toUpperCase()}` | Header print | Ya recibe prop desde Estados.tsx |
| `src/pdf/journalPdf.ts` L78-89 | `meta.entityName \|\| '______'`, `meta.cuit \|\| '______'` | Header Libro Diario con placeholders | Pasar `company` desde AsientosDesktop |
| `src/pages/AsientosDesktop.tsx` L130 | `cuit: ''` | PdfMeta vacío | Leer de `companyProfile` y pasar valores reales |
| `src/utils/exportPdf.ts` | Usa `html2canvas` sin company data | Screenshot PDF | No requiere cambios — depende del DOM renderizado |
| `src/pages/Planillas/Conciliaciones/ConciliacionesPage.tsx` L78 | `cuit: "30-12345678-9"` hardcodeado | Reporte PDF | Inyectar desde `companyProfile` |
| `src/pages/Planillas/AmortizacionesPage.tsx` L1308,1601 | `<strong>CUIT:</strong> -` placeholder | Cuadro impresión | Inyectar desde `companyProfile` |

---

## 3. Storage & Dexie — Estado Actual

### 3.1 Versión y Patrón de Migración

| Parámetro | Valor |
|:----------|:------|
| **Archivo** | `src/storage/db.ts` |
| **Versión Actual** | 13 |
| **Nombre DB** | `'EntrenadorContable'` |
| **Patrón migración** | Incremental con `this.version(N).stores({...}).upgrade(tx => {...})` |
| **Tablas actuales** | 27 tablas (accounts, entries, settings, inventory*, bienes*, fx*, tax*, fixedAssets*, inv*) |

### 3.2 Tabla `settings` Actual

```typescript
// src/storage/db.ts L37-41
export interface Settings {
    id: string          // 'main'
    seedVersion: number // 11 (SEED_VERSION)
    lastUpdated: string // ISO date
}
```

**Solo guarda versión del seed** — NO tiene datos de empresa.

### 3.3 Migración Propuesta (Versión 14)

```typescript
// Nueva tabla: companyProfile singleton
this.version(14).stores({
    // ... todas las tablas anteriores ...
    companyProfile: 'id',  // Singleton con id='default'
})
```

**Riesgo:** BAJO. Es additive-only, no modifica tablas existentes.

---

## 4. Propuesta de Modelo `CompanyProfile`

Basado en campos típicos de Estados Contables según RT 9/16 y requerimientos del prototipo (toggle Básico/Más datos):

```typescript
export interface CompanyProfile {
    id: string                // 'default' (singleton)
    
    // ═══════════════════════════════════════════
    // DATOS BÁSICOS (siempre visibles)
    // ═══════════════════════════════════════════
    legalName: string         // Razón Social: "Mi Empresa S.A."
    cuit: string              // CUIT: "30-12345678-9"
    legalAddress: string      // Domicilio legal
    mainActivity: string      // Actividad principal
    fiscalYearStartMonth: number  // Mes inicio ejercicio (1-12)
    fiscalYearStartDay: number    // Día inicio ejercicio (1-31)
    fiscalYearEndMonth: number    // Mes cierre ejercicio
    fiscalYearEndDay: number      // Día cierre ejercicio
    userName?: string         // Nombre usuario para saludo Dashboard
    
    // ═══════════════════════════════════════════
    // DATOS AVANZADOS (toggle "Más datos")
    // ═══════════════════════════════════════════
    incorporationDate?: string    // Fecha de constitución (ISO)
    companyDuration?: string      // Duración prevista ("99 años", "indeterminada")
    measureUnit?: string          // Unidad de medida ("Pesos argentinos")
    regulatoryBody?: string       // Organismo de control ("IGJ", "CNV", etc.)
    controllingEntity?: string    // Controlante (si aplica)
    
    // ═══════════════════════════════════════════
    // METADATA DE CAPITAL (para cálculo automático)
    // ═══════════════════════════════════════════
    capitalMeta?: {
        shareClass: string        // "Ordinarias nominativas no endosables"
        nominalValue: number      // VN por acción (ej: 10)
        votesPerShare: number     // Votos por acción (ej: 1)
        capitalAccountCode?: string // Override: código cuenta capital ("3.1.01")
    }
    
    // ═══════════════════════════════════════════
    // SISTEMA
    // ═══════════════════════════════════════════
    createdAt: string
    updatedAt: string
}
```

---

## 5. Cálculo Automático del Capital — Plan A vs Plan B

### 5.1 Diagnóstico de Factibilidad

El sistema **SÍ puede calcular saldos de cuentas** mediante:

1. **Ledger:** `src/core/ledger.ts` → `computeLedger(entries, accounts)` 
2. **Trial Balance:** `src/core/balance.ts` → `computeTrialBalance(ledger, accounts)`
3. **Statements:** `src/core/statements.ts` → `computeStatements(trialBalance, accounts)`

El saldo de "Capital Social" se obtiene filtrando `trialBalance` por account `code === '3.1.01'`.

### 5.2 Plan A: Por Código Fijo (Recomendado)

**Condición:** El plan de cuentas usa el seed estándar con `3.1.01 Capital social`.

```typescript
// Pseudocódigo
const capitalAccount = accounts.find(a => a.code === '3.1.01')
const capitalBalance = trialBalance.find(r => r.account.id === capitalAccount.id)?.balance ?? 0
const shareCount = capitalBalance / companyProfile.capitalMeta.nominalValue
```

**Ubicación en seed:**
```typescript
// src/storage/seed.ts L201
{ code: '3.1.01', name: 'Capital social', kind: 'EQUITY', statementGroup: 'CAPITAL', ... }
```

**Cuentas relacionadas a EXCLUIR del cálculo de cantidad de acciones:**
- `3.1.02` Ajuste de capital (NO representa acciones)
- `3.1.03` Aportes irrevocables (NO representa acciones)
- `3.1.04` Prima de emisión (NO representa acciones)
- `3.1.05` Descuento de emisión (contra)
- `3.1.06` Capital a integrar (contra — reduce Capital emitido)

### 5.3 Plan B: Mapping Manual (Si plan libre)

Si el usuario tiene un plan de cuentas personalizado sin código `3.1.01`:

1. **En UI Datos Empresa:** Campo `capitalMeta.capitalAccountCode` permite indicar la cuenta.
2. **Fallback:** Mostrar selector de cuentas `kind='EQUITY'` + `statementGroup='CAPITAL'`.
3. **Persistencia:** Guardar mapping en `companyProfile.capitalMeta.capitalAccountCode`.

### 5.4 Algoritmo de Composición del Capital

```typescript
function computeCapitalComposition(
    trialBalance: TrialBalance,
    accounts: Account[],
    meta: CompanyProfile['capitalMeta']
): CapitalComposition {
    // 1. Identificar cuenta Capital Social
    const capitalCode = meta?.capitalAccountCode ?? '3.1.01'
    const capitalAccount = accounts.find(a => a.code === capitalCode)
    
    if (!capitalAccount) {
        return { error: 'CUENTA_NO_ENCONTRADA' }
    }
    
    // 2. Obtener saldo
    const row = trialBalance.rows.find(r => r.account.id === capitalAccount.id)
    const saldoCapital = row?.balance ?? 0
    
    // 3. Calcular cantidad de acciones
    const vn = meta?.nominalValue ?? 0
    if (vn <= 0) {
        return { error: 'VN_NO_CONFIGURADO' }
    }
    
    const cantidadAcciones = saldoCapital / vn
    const esExacto = Number.isInteger(cantidadAcciones)
    
    return {
        saldoCapital,
        nominalValue: vn,
        shareClass: meta?.shareClass ?? 'Ordinarias',
        votesPerShare: meta?.votesPerShare ?? 1,
        shareCount: esExacto ? cantidadAcciones : Math.floor(cantidadAcciones),
        isExact: esExacto,
        warning: esExacto ? undefined : 'División no exacta — revisar consistencia VN vs saldo'
    }
}
```

---

## 6. PDFs y Reportes — Inventario de Funciones

| **Archivo** | **Función/Uso** | **Recibe Company** | **Cambio Requerido** |
|:------------|:----------------|:-------------------|:---------------------|
| `src/pdf/journalPdf.ts` | `downloadJournalPdf()` | ✅ Sí (PdfMeta) | Caller debe pasar datos reales |
| `src/utils/exportPdf.ts` | `exportElementToPdf()` | ❌ No (html2canvas) | No requiere — usa DOM |
| `src/pages/Planillas/Conciliaciones/ConciliacionesPage.tsx` | jsPDF directo | ❌ Hardcoded | Inyectar desde store |
| `src/pages/Planillas/AmortizacionesPage.tsx` | `window.print()` | ❌ Placeholders | Inyectar en JSX desde store |
| `src/pages/estados/components/BalanceSheetPrintView.tsx` | Print styles | ⚠️ Parcial (`meta.empresa`) | Ya recibe — verificar origen |
| `src/components/Estados/EstadoResultados/EstadoResultadosDocument.tsx` | Print mode | ❌ No integrado | Agregar header formal |

### Funciones a parametrizar en implementación:

1. **`downloadJournalPdf`** — Ya lista, solo asegurar que caller pase `meta` correcto.
2. **`ConciliacionesPage`** — Crear helper `getCompanyForPdf()` y usarlo.
3. **`AmortizacionesPage`** — Mismo patrón.
4. **Estados Contables print** — Ya recibe `empresaName` como prop.

---

## 7. Riesgos y Mitigaciones

| **Riesgo** | **Probabilidad** | **Impacto** | **Mitigación** |
|:-----------|:-----------------|:------------|:---------------|
| Prototipo `Datosiniciales.html` inexistente | CONFIRMADO | ALTO | Solicitar al usuario o diseñar basado en patrones existentes |
| División capital/VN no exacta | MEDIO | BAJO | Mostrar warning, redondear hacia abajo |
| Usuario con plan libre sin 3.1.01 | BAJO | MEDIO | Implementar Plan B con mapping |
| Migración Dexie v14 falla | MUY BAJO | ALTO | Additive-only, no modifica datos existentes |
| Performance al cargar companyProfile | MUY BAJO | BAJO | Es singleton, se carga una vez y se cachea |

---

## 8. Checklist de Aceptación (Implementación Futura)

### 8.1 Storage & Modelo
- [ ] Dexie migrado a versión 14 con tabla `companyProfile`
- [ ] Interface `CompanyProfile` definida en `src/core/models.ts`
- [ ] CRUD en `src/storage/company.ts`: `getCompanyProfile()`, `saveCompanyProfile()`
- [ ] Hook `useCompanyProfile()` creado y funcional

### 8.2 UI — Datos de la Empresa
- [ ] Modal/Page de configuración implementada siguiendo prototipo
- [ ] Toggle Básico/Más datos funcional
- [ ] Campos capital (VN, clase, votos) editables
- [ ] Persistencia verificada en IndexedDB

### 8.3 Conexión UI Consumidores
- [ ] `Estados.tsx` usa `useCompanyProfile().legalName`
- [ ] `Dashboard.tsx` muestra saludo personalizado
- [ ] `EstadosHeader.tsx` muestra chip con razón social real
- [ ] Sin hardcodes "Mi Empresa S.A." en el repo (`rg` retorna 0)

### 8.4 PDFs y Reportes
- [ ] `AsientosDesktop.tsx` pasa company data a `downloadJournalPdf`
- [ ] `ConciliacionesPage.tsx` usa company data real
- [ ] `AmortizacionesPage.tsx` muestra CUIT real en print
- [ ] Libro Diario PDF incluye Razón Social + CUIT + Período

### 8.5 Capital Automático
- [ ] Nota de Composición del Capital calcula cantidad de acciones
- [ ] Warning si división no es exacta
- [ ] Plan B funcional (selector de cuenta si plan libre)

### 8.6 QA
- [ ] `npm run build` pasa sin errores
- [ ] `npm run lint` pasa sin warnings nuevos
- [ ] Tests existentes no se rompen
- [ ] E2E: crear perfil → ver en Estados → exportar PDF → verificar datos

---

## 9. Comandos Ejecutados + Resultados (Resumen)

```powershell
# Git status
git status
# → On branch NO-SE, untracked: docs/AUDIT_DATOS_EMPRESA.md

# Búsqueda de hardcodes empresa/CUIT
rg -n "Mi Empresa S\.A\.|empresaName|legalName|CUIT|cuit" src docs
# → Estados.tsx:190 const empresaName = 'Mi Empresa S.A.'
# → journalPdf.ts:88-89 CUIT placeholder
# → ~15 ocurrencias más (ver tabla arriba)

# Búsqueda de PDFs
rg -n "exportPdf|journalPdf|pdf|jsPDF|print" src
# → journalPdf.ts, exportPdf.ts, Conciliaciones, Amort, Estados

# Búsqueda Estados/ESP
rg -n "/estados|Estados\.tsx|SituacionPatrimonial" src
# → App.tsx:54 route /estados
# → Múltiples componentes confirmados

# Dexie storage
rg -n "new Dexie|version\(|db\.version|stores\(" src/storage
# → db.ts:93-359 versiones 1-13

# Bienvenido (Dashboard)
rg -n "Bienvenido|¡Bienvenido" src
# → Dashboard.tsx:128

# Capital Social
rg -n "3\.1\.01|Capital Social" src
# → seed.ts:201 Capital social
```

---

## 10. Siguiente Paso Recomendado

> [!IMPORTANT]
> **Antes de implementar, se requiere:**
> 1. **Obtener prototipo `Datosiniciales.html`** del usuario o diseñar UI basada en patrones existentes.
> 2. Confirmar si el toggle "Básico / Más datos" es crítico para MVP o puede ser v1.1.

**Orden de implementación sugerido:**
1. Modelo + Storage (Dexie v14)
2. Hook `useCompanyProfile()`
3. UI de configuración (modal simple primero)
4. Conectar a `Estados.tsx` y `Dashboard.tsx`
5. Conectar a PDFs
6. Lógica de capital automático
