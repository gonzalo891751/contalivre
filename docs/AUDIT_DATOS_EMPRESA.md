# Auditoría Técnica: Datos de la Empresa (Company Profile)

## 1. Resumen Ejecutivo
El sistema actual **carece de una fuente de verdad persistente** para los datos de la empresa. La información clave (Razón Social, CUIT, Inicio de Ejercicio) está **hardcodeada** en componentes UI y funciones de reporte, o dispersa en constantes.

Para lograr el objetivo de "Datos de la Empresa" como puerta de entrada y fuente única para Estados Contables y PDFs, es necesario:
1.  Crear una tabla `companyProfile` en Dexie.
2.  Implementar un "Registro de Capital" (metadata de acciones) para permitir la composición automática del Patrimonio Neto sin inputs manuales.
3.  Refactorizar los puntos de anclaje (headers, PDFs) para leer de esta nueva fuente.

## 2. Fuente de Verdad y Requisitos
Aunque el prototipo `Datosiniciales.html` no se encuentra en el repositorio, el análisis del uso actual (`Estadosc.html`, `ESP2.html`) y los requisitos de negocio (PDFs oficiales) definen los siguientes campos necesarios:

### Campos Básicos (CompanyProfile)
-   **Razón Social / Entidad:** (e.g., "Mi Empresa S.A.") - *Crítico para encabezados.*
-   **CUIT:** (e.g., "30-12345678-9") - *Crítico para carátulas y reportes fiscales.*
-   **Dirección Legal:** Para el encabezado del balance.
-   **Inicio de Actividades:** Fecha (para contexto histórico).
-   **Cierre de Ejercicio (Mes/Día):** Define el ciclo contable (actualmente inferido o hardcodeado).

### Campos Avanzados (Registro de Capital)
Para automatizar la nota de "Composición del Capital" (hoy imposible solo con el Mayor):
-   **Capital Suscripto:** Monto total (validado contra saldo contable).
-   **Detalle de Acciones:**
    -   Clase (e.g., "Ordinarias Nominativas no Endosables").
    -   Votos por acción (e.g., "1 voto", "5 votos").
    -   Valor Nominal (VN).
    -   Cantidad de acciones.

## 3. Arquitectura Actual

### Storage (Persistencia)
-   **Tecnología:** Dexie.js (IndexedDB wrapper).
-   **Schema:** Definido en `src/storage/db.ts`.
-   **Estado:** Existen tablas para `settings`, `accounts`, `entries`, `inventory`, etc., pero **NO existe** tabla para la entidad/empresa.
-   **Configuración:** `settings` solo guarda `seedVersion` y `lastUpdated`.

### Dominio (Cálculos)
-   **Estados Contables:** `src/core/statements.ts` genera el Balance General sumando cuentas por `kind` ('ASSET', 'EQUITY', etc.).
-   **Patrimonio Neto:** Se calcula como `Sum(Cuentas EQUITY) + (Ingresos - Gastos)`. No hay distinción semántica entre "Capital Social" y "Ajuste de Capital" más allá del nombre de la cuenta.

### UI (Interfaz)
-   **Estados Contables:** Rutas bajo `/estados` (`src/pages/Estados.tsx`).
-   **Exportación:** `src/utils/exportPdf.ts` y `src/pdf/journalPdf.ts` manejan la generación de documentos.

## 4. Puntos de Anclaje (Current Usage)

La información de la empresa está dispersa y hardcodeada. Estos son los puntos exactos a refactorizar:

| Ubicación (Path) | Uso Actual (Snippet) | Solución Propuesta |
| :--- | :--- | :--- |
| `src/pages/Estados.tsx` | `const empresaName = 'Mi Empresa S.A.'` | `useCompanyProfile().legalName` |
| `src/components/Estados/EstadoSituacionPatrimonialGemini.tsx` | `<span>{entidad \|\| 'Mi Empresa S.A.'}</span>` | Leer prop o store |
| `src/utils/exportPdf.ts` | (Implícito en lógica de headers) | Inyectar objeto `company` al generador |
| `src/pdf/journalPdf.ts` | `doc.text('Libro Diario', ...)` (Header genérico) | Agregar Razón Social + CUIT + Período al header |
| `docs/prototypes/Estadosc.html` | `<span ...>Mi Empresa S.A.</span>` | Referencia para el diseño del componente |

## 5. Propuesta de Modelo de Datos

### Interface `CompanyProfile`
```typescript
export interface CompanyProfile {
    id: string; // Singleton 'default' o UUID
    legalName: string; // Razón Social
    cuit: string;
    fiscalYearEndMonth: number; // 1-12
    incorporationDate: string; // ISO Date
    legalAddress: string;
    
    // Metadata de Capital (simplificado para MVP)
    capitalStructure?: {
        shareType: string; // "Ordinarias..."
        shareValue: number; // VN
        totalShares: number;
        votesPerShare: number;
    };
    
    lastUpdated: string;
}
```

### Persistencia
-   **Tabla:** Agregar `companyProfile` al schema de Dexie en `src/storage/db.ts`.
-   **Estrategia:** Singleton. Siempre buscar registro con ID 'default' o el primero encontrado. Si no existe, mostrar wizard de "Datos Iniciales".

## 6. Integración con Estados Contables y PDFs

### UI
-   Crear un hook `useCompanyProfile()` que lea de Dexie.
-   En el Layout principal o Context, cargar este perfil para que esté disponible en el header global ("Chip de Empresa").

### PDF Oficial
-   Modificar las funciones en `src/utils/exportPdf.ts` para aceptar un argumento `company: CompanyProfile`.
-   **Encabezado Estándar:** Debe incluir Razón Social (Bold, Centrado), Cidentificación (CUIT), Denominación de Estados Contables y Fecha de Cierre.

## 7. Composición del Capital (Estrategia Automática)

### El Problema
El sistema contable (Mayor) sabe que la cuenta "3.1.01 Capital Social" tiene saldo $100,000. Pero **no sabe** si son 1,000 acciones de $100 o 100,000 acciones de $1.

### La Solución: "Capital Registry" Light
No necesitamos un módulo complejo de societario. Solo necesitamos guardar la **metadata estática** en el `CompanyProfile`.

**Algoritmo de Composición:**
1.  **Input (Metadata):** El usuario configura en "Datos de Empresa": "VN: $10", "Clase: Ordinarias".
2.  **Input (Contable):** El sistema lee el saldo de la cuenta "Capital Social" (mapping por código o tag) -> $100,000.
3.  **Cálculo Automático:** 
    -   `Cantidad Acciones` = `Saldo Capital` / `VN`.
    -   Si la división no es exacta, mostrar alerta de inconsistencia.
4.  **Output (Nota a los Estados):**
    -   "El capital se compone de [10,000] acciones de VN [$10], clase [Ordinarias]..."

## 8. Plan de Implementación Incremental

1.  **Fase 1: Persistencia (Backend Local)**
    -   Actualizar `src/storage/db.ts` (nueva versión de schema).
    -   Crear `src/storage/company.ts` (métodos get/save).
    -   Crear `useCompanyProfile` hook.

2.  **Fase 2: UI de Configuración (Modal/Page)**
    -   Implementar el formulario de "Datos de Empresa".
    -   Validar persistencia.

3.  **Fase 3: Conectar UI de Lectura**
    -   Reemplazar hardcodes en `Estados.tsx` y componentes hijos.
    -   Asegurar que si el perfil está vacío, muestre "Configurar Empresa" o un placeholder digno.

4.  **Fase 4: Reportes PDF**
    -   Refactorizar generadores de PDF para recibir datos de empresa.
    -   Implementar encabezado formal según normas (Nombre, CUIT, Fecha).

5.  **Fase 5: Lógica de Capital**
    -   Agregar campos de metadata de acciones al form de empresa.
    -   Implementar lógica de validación (Saldo / VN) en la vista de Estados Contables.

## 9. Checklist de Aceptación

- [ ] Existe tabla `companyProfile` en Dexie.
- [ ] El usuario puede guardar/editar su Razón Social y CUIT.
- [ ] El Dashboard muestra el nombre real de la empresa (no "Mi Empresa S.A.").
- [ ] Los PDFs exportados incluyen el encabezado con Razón Social y CUIT correctos.
- [ ] Se puede definir el VN de las acciones y el sistema calcula la cantidad teórica basada en el saldo contable.

## 10. Riesgos y Supuestos
-   **Supuesto:** Existe una cuenta contable claramente identificable como "Capital Social". Si el plan de cuentas es libre, el usuario deberá indicar cuál es esa cuenta (mapping).
-   **Riesgo:** Si el usuario cambia el saldo de Capital manualmente (asiento) pero no actualiza la metadata (o viceversa), la nota automatizada podría decir "10,000.5 acciones", lo cual es imposible. Se requiere validación de consistencia.
