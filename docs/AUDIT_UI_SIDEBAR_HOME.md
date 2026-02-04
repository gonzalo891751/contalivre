# Auditoría Técnica: UI Sidebar & Home

## 1. Resumen Ejecutivo
*   **Estado Actual:** El layout presenta conflictos de superposición (stacking) entre el Header y el Sidebar, causando que el Sidebar colapsado se oculte parcialmente o se visualice incorrectamente. Los estilos de hover en el menú provocan problemas de contraste (texto invisible).
*   **Prototipo (`menues.html`):** Propone un modelo estricto donde el Sidebar comienza *debajo* del Header (`top: var(--header-height)`), eliminando la necesidad de `padding-top` compensatorio y resolviendo el overlap.
*   **Solución Propuesta:** Refactorizar CSS global (`index.css`) para alinear el layout al modelo del prototipo y limpiar los estados de interacción (hover/active) de los links del menú.
*   **Nueva Feature:** Se identificó la ubicación exacta en `Dashboard.tsx` para insertar la sección de "Accesos Rápidos" solicitada.

## 2. Evidencia y Hallazgos

| Elemento | Archivo | Línea/Snippet | Observación |
| :--- | :--- | :--- | :--- |
| **Sidebar Layout** | `src/styles/index.css` | `.sidebar { top: 0; padding-top: calc(...); }` | El sidebar ocupa toda la altura (`top: 0`), confiando en z-index y padding para "bajar" el contenido. Esto causa conflictos de scroll y click-through con el header. |
| **Header Layout** | `src/styles/index.css` | `.top-header { position: fixed; z-index: 50; }` | Correcto z-index (50), pero al estar el sidebar en z-index 40 y top 0, compiten en el espacio visual superior. |
| **Hover Issue** | `src/styles/index.css` | `.sidebar-link:hover { color: white; }` | Al hacer hover, el texto se fuerza a blanco. Si el fondo del ítem o del sidebar no tiene el contraste suficiente en ese estado (o si hay estilos inline conflictivos), el contenido "desaparece". |
| **Dashboard** | `src/pages/Dashboard.tsx` | `<main className="dashboard-main">` | Estructura clara. Falta la sección de "Accesos Rápidos" entre el Header y los Indicadores. |

## 3. Diagnóstico Bug #1: Solapamiento Sidebar/Header

*   **Root Cause:** El Sidebar tiene `top: 0`. Esto hace que físicamente el elemento HTML del sidebar esté "detrás" del header en los primeros 70px-80px. Aunque el padding interno baja el contenido, la barra de scroll del sidebar y el área de clicks pueden quedar obstruidas por el header.
*   **Confirmación:** Inspeccionar el elemento `<aside class="sidebar">` y ver que su caja empieza en `y=0`.
*   **Fix Recomendado (Opción B del prompt):**
    *   Cambiar `.sidebar` a `top: var(--header-height)`.
    *   Cambiar `.sidebar` a `height: calc(100vh - var(--header-height))`.
    *   Eliminar el `padding-top` calculado (usar padding interno normal).
    *   Esto garantiza que el sidebar *empiece* donde termina el header, eliminando cualquier posibilidad de superposición.

## 4. Diagnóstico Bug #2: Invisibilidad en Hover

*   **Causa:** Reglas CSS en `src/styles/index.css` para `.sidebar-link:hover` fuerzan `color: white`.
*   **Conflicto:** Si el estado activo o el tema (light/dark) tiene un fondo claro o similar al blanco en hover, el contraste se pierde. Además, los íconos (SVG) pueden no estar heredando `currentColor` correctamente si tienen rellenos hardcoded.
*   **Solución:**
    *   Asegurar un `background-color` oscuro/contrastante en el estado `:hover` del link (ej: `rgba(255, 255, 255, 0.1)` sobre fondo oscuro).
    *   Verificar que `Sidebar.tsx` use clases consistentes (`sidebar-link`, `active`) y no estilos inline que pisen el CSS.

## 5. Plan de Implementación (Mínimo)

### Archivos a modificar
*   `src/styles/index.css`:
    *   Refactorizar variables CSS: asegurar `--header-height` consistente.
    *   Actualizar `.sidebar`: ajustar `top`, `height`, `padding-top`.
    *   Actualizar `.sidebar-link`: corregir estados `:hover` y `.active` para garantizar contraste AA+.
    *   Ajustar `z-index` si es necesario (Header 50, Sidebar 40).
*   `src/ui/Layout/Sidebar.tsx`:
    *   Revisar estructura de clases para asegurar que coincidan con el nuevo CSS.
    *   Verificar implementación de Tooltips (para estado colapsado) y Popovers (submenús).

### Componentes a crear
*   `src/components/dashboard/QuickActionsGrid.tsx`:
    *   Componente aislado para los "Accesos Rápidos".
    *   Grid responsive (grid-cols-2 md:grid-cols-3 lg:grid-cols-6).
    *   Cards simples con Ícono + Label + Link.

### Archivos a integrar
*   `src/pages/Dashboard.tsx`:
    *   Importar `QuickActionsGrid`.
    *   Insertar `<QuickActionsGrid />` justo después de `<header className="dashboard-header">` y antes de la sección de onboarding/indicadores.

## 6. Dashboard: Accesos Rápidos

**Ubicación:** `src/pages/Dashboard.tsx`
**Estructura:**
```tsx
// Pseudocódigo
<div className="quick-actions-grid">
  <Card to="/operaciones/inventario" icon="Package" label="Inventario" />
  <Card to="/operaciones/bienes-uso" icon="Armchair" label="Bienes Uso" />
  <Card to="/operaciones/impuestos" icon="Receipt" label="Impuestos" />
  <Card to="/asientos" icon="Notebook" label="Libro Diario" />
  <Card to="/mayor" icon="BookBookmark" label="Libro Mayor" />
  <Card to="/estados" icon="ChartLineUp" label="Estados" />
</div>
```

## 7. Criterios de Aceptación (QA)

- [ ] **Layout:** El Sidebar comienza visualmente *debajo* del Header. No hay solapamiento de la barra de scroll.
- [ ] **Colapsado:** Al colapsar, el sidebar mantiene su posición correcta (top ajustado).
- [ ] **Hover:** Al pasar el mouse por los ítems del menú, el texto e íconos son claramente legibles (blanco sobre fondo semitransparente oscuro).
- [ ] **Accesos Rápidos:** Se visualizan 6 tarjetas en el Dashboard, arriba de los indicadores. Todos los links funcionan.
- [ ] **Responsive:** En móvil, el comportamiento del Drawer (que reemplaza al sidebar) no se ve afectado negativamente.

## 8. Validación y Comandos

1.  **Ejecución:**
    ```bash
    npm run dev
    ```
2.  **QA Manual:**
    *   Navegar a `/`.
    *   Verificar posición del Sidebar respecto al Header.
    *   Hacer hover en menú lateral.
    *   Probar click en tarjetas de "Accesos Rápidos".
    *   Colapsar/Expandir menú lateral.
3.  **Build Check:**
    ```bash
    npm run build
    ```

## 9. Supuestos y Riesgos
*   **Supuesto:** `src/styles/index.css` es la única fuente de verdad para el layout (sin estilos pisados por Tailwind arbitrario en componentes).
*   **Riesgo:** El componente `MobileDrawer` podría compartir clases con `Sidebar` y romperse al cambiar el posicionamiento global. Se debe verificar con `isMobile` flag o media queries.
