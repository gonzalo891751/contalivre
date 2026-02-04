# Auditoría Técnica: UI Sidebar & Home

**Fecha:** 2026-02-03
**Auditor:** Claude Opus 4.5
**Prototipo de referencia:** `docs/prototypes/menues.html`

---

## 1. Resumen Ejecutivo

| Item | Estado | Severidad |
|------|--------|-----------|
| Solapamiento Sidebar/Header | ⚠️ Bug activo | Alta |
| Hover/Contraste en menú | ✅ Correcto en CSS, posible issue en iconos | Media |
| Accesos Rápidos en Dashboard | 📋 Pendiente de implementar | Feature |

**Diagnóstico principal:** El sidebar usa `top: 0` con `padding-top` compensatorio, en lugar del modelo del prototipo que define `top: var(--header-height)`. Esto causa que la caja del sidebar comience en `y=0`, quedando físicamente "detrás" del header en los primeros ~84px, lo cual afecta scroll y áreas de click.

**Solución recomendada:** Migrar el sidebar al modelo del prototipo (`top: var(--header-height)` + `height: calc(100vh - var(--header-height))`).

---

## 2. Evidencia y Hallazgos

### 2.1 Tokens del Prototipo (`docs/prototypes/menues.html`)

| Token | Valor | Uso |
|-------|-------|-----|
| `--header-height` | `70px` | Altura fija del header |
| `--sidebar-width-open` | `260px` | Ancho sidebar expandido |
| `--sidebar-width-closed` | `72px` | Ancho sidebar colapsado |
| `--nav-bg` | `#0F172A` | Fondo sidebar (Slate 900) |
| `--nav-hover` | `rgba(255, 255, 255, 0.1)` | Fondo hover |
| `--nav-text` | `#94A3B8` | Texto inactivo (Slate 400) |
| `--nav-text-active` | `#F8FAFC` | Texto hover/activo |

**Modelo de layout del prototipo (líneas 89-103):**
```css
.app-sidebar {
    position: fixed;
    top: var(--header-height); /* ← Empieza DEBAJO del header */
    left: 0;
    height: calc(100vh - var(--header-height)); /* ← Altura descontando header */
    width: var(--sidebar-current-width);
    z-index: 40;
    overflow-y: visible; /* Permite popovers */
}
```

### 2.2 Código Real vs Prototipo

| Elemento | Archivo | Línea | Código Real | Prototipo | Observación |
|----------|---------|-------|-------------|-----------|-------------|
| Header height | `src/styles/index.css` | 139 | `--header-height: 84px` | `70px` | Diferencia menor, OK |
| Sidebar top | `src/styles/index.css` | 856 | `top: 0` | `top: var(--header-height)` | **ROOT CAUSE BUG #1** |
| Sidebar height | `src/styles/index.css` | 857 | `bottom: 0` | `height: calc(100vh - var(--header-height))` | Usa bottom:0 en lugar de height calculada |
| Sidebar padding-top | `src/styles/index.css` | 852 | `padding-top: calc(var(--header-height) + var(--space-lg))` | padding interno normal | Compensación que no resuelve overlap |
| Header z-index | `src/styles/index.css` | 175 | `z-index: 50` | `z-index: 50` | ✅ Correcto |
| Sidebar z-index | `src/styles/index.css` | 859 | `z-index: 40` | `z-index: 40` | ✅ Correcto |
| Hover background | `src/styles/index.css` | 967 | `rgba(255, 255, 255, 0.08)` | `rgba(255, 255, 255, 0.1)` | Similar, OK |
| Hover color | `src/styles/index.css` | 969 | `color: white` | `color: white` | ✅ Correcto |

### 2.3 Snippets de Código Relevantes

**Sidebar actual (`src/styles/index.css:846-866`):**
```css
:where(.cl-ui) .sidebar {
  width: var(--sidebar-width);
  background: #0F172A;
  color: rgba(255, 255, 255, 0.92);
  padding: var(--space-lg);
  padding-top: calc(var(--header-height) + var(--space-lg)); /* ← Compensación */
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;        /* ← PROBLEMA: debería ser var(--header-height) */
  left: 0;
  bottom: 0;     /* ← PROBLEMA: debería ser height: calc(100vh - var(--header-height)) */
  z-index: 40;
  overflow-y: auto;
  overflow-x: hidden;
  ...
}
```

**Hover states (`src/styles/index.css:966-971, 1107-1121`):**
```css
:where(.cl-ui) .sidebar-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
  text-decoration: none;
}

:where(.cl-ui) .sidebar:not(.collapsed) .sidebar-link:hover {
  background: var(--sidebar-hover-bg);
  color: var(--sidebar-text-strong);
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

**Tooltip (`src/styles/index.css:1340-1370`):**
```css
.nav-tooltip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: #1E293B;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.875rem;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: 60;
}

body.sidebar-is-collapsed :where(.cl-ui) .sidebar-link:hover .nav-tooltip {
  opacity: 1;
  transform: translateY(-50%) translateX(12px);
}
```

---

## 3. Diagnóstico Bug #1: Solapamiento Sidebar/Header

### Root Cause
El sidebar tiene `top: 0` y `bottom: 0`, ocupando toda la altura del viewport. Se usa `padding-top: calc(var(--header-height) + var(--space-lg))` para "bajar" el contenido interno, pero la **caja del elemento** sigue empezando en `y=0`.

**Consecuencias:**
1. Los primeros ~84px del sidebar están físicamente detrás del header
2. La barra de scroll del sidebar queda parcialmente oculta bajo el header
3. El área de click de ítems cercanos al top puede quedar obstruida
4. En modo colapsado, el contenedor puede interferir con elementos del header

### Evidencia Visual
```
┌─────────────────────────────────────────────────────┐
│  HEADER (z-index: 50, height: 84px)                 │
├───────┬─────────────────────────────────────────────┤
│░░░░░░░│  MAIN CONTENT                               │
│░SIDE░░│  (margen izquierdo respeta sidebar)         │
│░░BAR░░│                                             │
│░░░░░░░│                                             │
│(z:40) │                                             │
│top:0  │                                             │
│       │                                             │
└───────┴─────────────────────────────────────────────┘

Área sombreada (░): El sidebar empieza en y=0, pero el header
lo tapa. El padding-top empuja el contenido pero no la caja.
```

### Fix Recomendado (Opción A - Alineado al prototipo)

**Archivo:** `src/styles/index.css`
**Cambios en `.sidebar` (líneas 846-866):**

```css
:where(.cl-ui) .sidebar {
  width: var(--sidebar-width);
  background: #0F172A;
  color: rgba(255, 255, 255, 0.92);
  padding: var(--space-lg);
  /* padding-top: calc(var(--header-height) + var(--space-lg)); ← ELIMINAR */
  display: flex;
  flex-direction: column;
  position: fixed;
  top: var(--header-height);  /* ← CAMBIAR de 0 */
  left: 0;
  height: calc(100vh - var(--header-height));  /* ← CAMBIAR de bottom:0 */
  /* bottom: 0; ← ELIMINAR */
  z-index: 40;
  overflow-y: auto;
  overflow-x: hidden;
  ...
}
```

**Pros:**
- Modelo idéntico al prototipo aprobado
- Elimina el hack de padding-top compensatorio
- La caja del sidebar empieza exactamente donde termina el header
- Scroll y clicks funcionan correctamente

**Contras:**
- Requiere verificar que no haya estilos inline en `Sidebar.tsx` que dependan del modelo actual
- Puede requerir ajuste en media queries para mobile drawer

---

## 4. Diagnóstico Bug #2: Hover/Contraste

### Análisis

El CSS base para hover parece **correcto**:
- `background: rgba(255, 255, 255, 0.08)` sobre fondo `#0F172A` ✅
- `color: white` para texto ✅
- Variables de tema definidas correctamente (líneas 1012-1033) ✅

### Posibles Causas de Issues Visuales

1. **Iconos SVG no heredan color:**
   - Los iconos Phosphor en `Sidebar.tsx` usan `className="sidebar-icon"`
   - El CSS define transición de color (línea 1103): `transition: color 0.2s`
   - Pero si el ícono tiene `fill` o `stroke` hardcoded, no respetará `currentColor`

2. **Estado `.active` puede conflictuar con hover:**
   - `.active` usa `color: #60A5FA` (azul claro)
   - Hover podría estar pisando este color en algunos estados

3. **Body class `sidebar-is-collapsed`:**
   - El código usa dos patrones: `.sidebar.collapsed` y `body.sidebar-is-collapsed`
   - Si hay inconsistencia entre ambos, los estilos pueden no aplicarse

### Verificación en `Sidebar.tsx`

**Línea 115:** Clase dinámica correcta
```tsx
<aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
```

**Línea 142-145:** Íconos usando className
```tsx
<IconComponent
    size={20}
    className="sidebar-icon"
/>
```

**Observación:** Los íconos Phosphor deberían heredar `currentColor` por defecto, pero conviene verificar que no haya estilos inline en el componente.

### Fix Recomendado

1. **Asegurar herencia de color en íconos:**
```css
:where(.cl-ui) .sidebar-link:hover .sidebar-icon {
  color: inherit; /* O white explícito */
}
```

2. **Verificar consistencia de clases:**
   - Unificar uso de `.sidebar.collapsed` vs `body.sidebar-is-collapsed`
   - Preferir `.layout.collapsed .sidebar` como en el CSS actual

---

## 5. Dashboard: Ubicación para "Accesos Rápidos"

### Archivo: `src/pages/Dashboard.tsx`

**Estructura actual:**
```
línea 121: <div className="dashboard">
línea 124:   <header className="dashboard-header">...</header>  (líneas 124-165)
línea 167:   <main className="dashboard-main">
línea 168-246:     {showOnboarding && <section>...</section>}
línea 248-251:     <section><IndicatorsDashboard /></section>
línea 253-544:     <section className="dashboard-patrimonio">...</section>
línea 546-582:     <section className="dashboard-activity">...</section>
línea 583:   </main>
```

### Punto de Inserción Recomendado

**Opción A (Preferida):** Después del header, antes de onboarding
- **Línea 167** (después de `</header>`, antes de `<main>`)
- O **Línea 168** (dentro de `<main>`, como primera sección)

**Opción B:** Después de onboarding, antes de indicadores
- **Línea 247** (después del cierre de onboarding)

### Componente Sugerido

**Archivo a crear:** `src/components/dashboard/QuickActionsGrid.tsx`

**Estructura basada en prototipo (líneas 584-636 de `menues.html`):**
```tsx
// Pseudocódigo - NO IMPLEMENTAR AÚN
const quickActions = [
  { to: '/operaciones', label: 'Operaciones', icon: Cube, desc: 'Inventario y activos fijos' },
  { to: '/asientos', label: 'Libro Diario', icon: Notebook, desc: 'Carga de asientos' },
  { to: '/mayor', label: 'Libro Mayor', icon: BookBookmark, desc: 'Saldos por cuenta' },
  { to: '/estados', label: 'Estados Contables', icon: ChartLineUp, desc: 'Balance y reportes' },
  { to: '/cuentas', label: 'Plan de Cuentas', icon: TreeStructure, desc: 'Editar jerarquía' },
  { to: '/planillas', label: 'Planillas', icon: Table, desc: 'Cálculos auxiliares' },
];

export function QuickActionsGrid() {
  return (
    <section className="quick-actions">
      <h3 className="section-title">
        <Lightning weight="duotone" /> Accesos Rápidos
      </h3>
      <div className="quick-grid">
        {quickActions.map(action => (
          <Link to={action.to} className="quick-card">
            <div className="quick-icon"><action.icon /></div>
            <div className="quick-label">{action.label}</div>
            <div className="quick-desc">{action.desc}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

---

## 6. Plan de Implementación (Mínimo)

### Archivos a Modificar

| Archivo | Cambio | Líneas Afectadas |
|---------|--------|------------------|
| `src/styles/index.css` | Fix sidebar position | ~846-866 |
| `src/styles/index.css` | (Opcional) Verificar hover íconos | ~966-1000, 1100-1150 |
| `src/ui/Layout/MainLayout.tsx` | (Si aplica) Verificar clase body | — |

### Archivos a Crear

| Archivo | Propósito |
|---------|-----------|
| `src/components/dashboard/QuickActionsGrid.tsx` | Componente accesos rápidos |

### Archivos a Integrar

| Archivo | Cambio |
|---------|--------|
| `src/pages/Dashboard.tsx` | Importar e insertar `<QuickActionsGrid />` |

---

## 7. Criterios de Aceptación (QA)

### Bug #1: Solapamiento
- [ ] El sidebar comienza visualmente debajo del header (inspeccionar: `top` debe ser `84px` o `var(--header-height)`)
- [ ] La barra de scroll del sidebar no queda oculta bajo el header
- [ ] Al colapsar/expandir, el sidebar mantiene su posición correcta
- [ ] No hay salto visual al hacer scroll

### Bug #2: Hover/Contraste
- [ ] Al hacer hover sobre cualquier ítem del menú, texto e ícono son legibles (blanco sobre fondo semi-transparente)
- [ ] El estado activo (`.active`) muestra el color azul (#60A5FA) correctamente
- [ ] Los íconos cambian de color junto con el texto en hover
- [ ] Tooltips en modo colapsado aparecen con fondo oscuro y texto blanco

### Feature: Accesos Rápidos
- [ ] Se visualizan 6 tarjetas en grid responsive (2 cols mobile, 3 cols tablet, 6 cols desktop)
- [ ] Cada tarjeta tiene ícono, label y descripción
- [ ] Los links navegan correctamente a las rutas correspondientes
- [ ] Hover en tarjetas muestra efecto visual (elevación/borde)

---

## 8. Validación y Comandos

### Comandos de Desarrollo
```bash
# Iniciar servidor de desarrollo
npm run dev

# Verificar tipos TypeScript
npx tsc --noEmit

# Lint
npm run lint

# Build de producción
npm run build
```

### Pruebas Manuales

1. **Layout Sidebar/Header:**
   - Navegar a `/`
   - Inspeccionar elemento `.sidebar` en DevTools
   - Verificar que `top` sea `84px` (o `var(--header-height)`)
   - Verificar que `height` sea `calc(100vh - 84px)`

2. **Colapsar/Expandir:**
   - Click en botón de colapso (flecha en footer del sidebar)
   - Verificar que el sidebar no "salta" verticalmente
   - Verificar que el header no se mueve

3. **Hover Menú:**
   - Pasar mouse sobre cada ítem del menú
   - Verificar fondo semi-transparente visible
   - Verificar texto e ícono en blanco
   - Verificar que íconos Phosphor cambien de color

4. **Submenú Operaciones:**
   - Click en "Operaciones"
   - Verificar que el submenú se expande sin tapar header
   - En modo colapsado: hover sobre Operaciones
   - Verificar que el flyout aparece a la derecha, no debajo del header

5. **Responsive (DevTools):**
   - Simular viewport móvil (375px)
   - Verificar que el sidebar se oculta
   - Verificar que el botón hamburguesa aparece en header
   - Click en hamburguesa: verificar drawer desde la izquierda

---

## 9. Supuestos y Riesgos

### Supuestos
1. `src/styles/index.css` es la fuente de verdad para estilos del layout (no hay CSS-in-JS ni Tailwind inline que lo pise)
2. El prototipo `menues.html` está aprobado y es el target de diseño
3. Los íconos Phosphor heredan `currentColor` por defecto

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Mobile drawer usa mismas clases que sidebar desktop | Media | Alto | Verificar media query `@media (max-width: 768px)` antes de cambiar |
| Estilos inline en Sidebar.tsx pisan CSS | Baja | Medio | Buscar `style=` en componente |
| Componentes usan `body.sidebar-is-collapsed` | Media | Medio | Buscar en codebase y unificar con `.layout.collapsed` |
| Cambio de height afecta scroll interno | Baja | Bajo | Verificar `overflow-y: auto` sigue funcionando |

### Búsqueda de Dependencias
```bash
# Verificar uso de clases de sidebar en otros archivos
rg -n "sidebar-is-collapsed|\.sidebar\.collapsed|layout\.collapsed" src/
```

---

## 10. Referencias

- **Prototipo UI:** `docs/prototypes/menues.html`
- **CSS Global:** `src/styles/index.css`
- **Componente Sidebar:** `src/ui/Layout/Sidebar.tsx`
- **Componente Header:** `src/ui/Layout/TopHeader/TopHeader.tsx`
- **Dashboard:** `src/pages/Dashboard.tsx`
- **Layout Principal:** `src/ui/Layout/MainLayout.tsx`

---

*Documento generado automáticamente. Última actualización: 2026-02-03*
