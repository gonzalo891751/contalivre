# Auditoría Técnica UI/Layout: Estado de Situación Patrimonial V2

**Fecha:** 3 de Febrero de 2026
**Auditor:** Senior Frontend Engineer (Gemini CLI)
**Componente:** `EstadoSituacionPatrimonialV2` (ESP V2)
**Ruta:** `/estados`

---

## 1. Resumen Ejecutivo

Se han identificado las causas raíz de los dos problemas visuales reportados en el módulo de Estado de Situación Patrimonial V2.
1.  **Título en 3 líneas:** Se debe a la falta de espacio horizontal en el contenedor `flex` del header cuando la barra de herramientas (Toolbar) ocupa mucho ancho (aprox. 670px) y el contenedor principal se reduce (ej. 1366px con sidebar), forzando al título a comprimirse y saltar de línea.
2.  **Drawer "encajonado":** El componente `BalanceSheetDrawer` usa `position: fixed`, pero su ancestro `div.animate-slide-up` tiene una propiedad `transform` activa (por animación CSS). Esto altera el "containing block", haciendo que el drawer se posicione relativo al `div` de contenido en lugar del `viewport` (ventana del navegador).

---

## 2. Cómo Reproducir

### Problema 1: Título Wrap
1.  Abrir la aplicación en un viewport de ancho medio (ej. 1280px - 1440px).
2.  Navegar a `/estados` (pestaña "Situación Patrimonial").
3.  Observar el header. Si el sidebar está abierto o el ancho es reducido, el espacio restante para el título es menor a ~550px.
4.  El texto "Estado de Situación Patrimonial" se rompe en líneas (ej. "Estado de" / "Situación" / "Patrimonial").

### Problema 2: Drawer Encajonado
1.  En la misma pantalla, hacer click en cualquier rubro (ej. "Caja y Bancos").
2.  Observar que el panel lateral (Drawer) y su fondo oscuro (Backdrop) aparecen limitados al rectángulo central del contenido (la "hoja"), dejando los bordes de la pantalla y el menú lateral sin cubrir.

---

## 3. Hallazgos y Evidencia

### A) Problema del Título (Wrapping)

**Archivo:** `src/pages/estados/components/EstadoSituacionPatrimonialV2.tsx`

El contenedor del header usa `flex-direction: row` en desktop sin permitir wrap (`flex-wrap` por defecto es `nowrap`).
El bloque de información (`.esp2-header-info`) tiene `flex: 1` (que equivale a `flex-grow: 1; flex-shrink: 1; flex-basis: 0%`).
La toolbar (`.esp2-toolbar`) tiene ancho implícito basado en contenido (~600-700px).

**Código Actual (CSS in JS):**
```css
/* Línea ~1264 */
@media (min-width: 1024px) {
    .esp2-header {
        flex-direction: row; /* Default nowrap */
        justify-content: space-between;
        align-items: flex-end;
    }
}
/* ... */
.esp2-header-info {
    flex: 1; /* Se comprime agresivamente si falta espacio */
}
```

Al reducirse el espacio (Sidebar + Toolbar grande), `flex: 1` comprime el título. Al no tener `white-space: nowrap`, el texto fluye hacia abajo.

### B) Problema del Drawer (Stacking Context)

**Archivo:** `src/pages/Estados.tsx` (Ancestro)
**Archivo:** `src/pages/estados/components/BalanceSheetDrawer.tsx` (Componente)

El componente `Estados.tsx` envuelve la vista en un div con animación de entrada.

**Código Ancestro (`Estados.tsx`):**
```tsx
/* Línea 445 */
{viewMode === 'ESP' && (
    <div className="animate-slide-up"> {/* CULPABLE */}
        {USE_ESP_V2 && espViewModel ? (
             <EstadoSituacionPatrimonialV2 ... />
```

**Estilo Ancestro:**
```css
/* Línea ~720 */
.animate-slide-up {
    animation: slideUp 0.4s ease-out forwards;
}
@keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); } /* transform activo */
}
```

La especificación CSS establece que cualquier elemento con `transform` distinto de `none` se convierte en el "containing block" para sus descendientes con `position: fixed`. Por ello, `inset: 0` en el Drawer se pega a los bordes de `.animate-slide-up` (el contenido) y no a la ventana.

---

## 4. Opciones de Solución

### Para Problema 1: Título

| Opción | Descripción | Pros | Contras | Recomendada |
| :--- | :--- | :--- | :--- | :--- |
| **1. Wrap + Nowrap** | Agregar `flex-wrap: wrap` al contenedor `.esp2-header` y `white-space: nowrap` al `h1`. | Solución robusta. Si no entran, la toolbar baja y el título queda entero. | Cambia el layout ligeramente en pantallas medianas (toolbar abajo). | **SÍ** |
| **2. Truncate** | Agregar `truncate` (ellipsis) al título. | Mantiene el layout rígido de una línea. | Se pierde información del título ("Estado de Situ..."). UX pobre. | No |
| **3. Shrink Toolbar** | Forzar a la toolbar a comprimirse. | Mantiene todo en una línea. | Complejo de implementar (ocultar botones en menú?), botones importantes pueden desaparecer. | No |

### Para Problema 2: Drawer

| Opción | Descripción | Pros | Contras | Recomendada |
| :--- | :--- | :--- | :--- | :--- |
| **1. React Portal** | Usar `createPortal` para renderizar el Drawer en `document.body`. | Solución definitiva "best practice". Ignora contextos de apilamiento ancestros. | Requiere modificar el código del componente para usar `ReactDOM.createPortal`. | **SÍ** |
| **2. Mover Drawer** | Mover `<BalanceSheetDrawer />` fuera del `div.animate-slide-up` en `Estados.tsx`. | Solución simple de estructura. | Rompe la encapsulación (el drawer es parte lógica de ESP V2). Ensucia el componente padre. | No |
| **3. Quitar Animación** | Eliminar la clase `.animate-slide-up`. | Solución inmediata (borrar 1 línea). | Se pierde la transición visual de entrada (UX downgrade). | No |

---

## 5. Recomendación Final

### Fix Título
En `src/pages/estados/components/EstadoSituacionPatrimonialV2.tsx`:
1.  Modificar `.esp2-header` (desktop media query) agregando `flex-wrap: wrap`.
2.  Modificar `.esp2-main-title` agregando `white-space: nowrap`.

### Fix Drawer
En `src/pages/estados/components/BalanceSheetDrawer.tsx`:
1.  Implementar `createPortal` (de `react-dom`).
2.  Renderizar el contenido del return dentro del portal apuntando a `document.body`.

---

## 6. Checklist de Aceptación

Una vez aplicados los fixes, verificar:

- [ ] **Título Desktop:** En resolución 1366x768 (con sidebar visible), el título "Estado de Situación Patrimonial" se ve en una sola línea. La toolbar puede haber bajado si no hay espacio.
- [ ] **Título Mobile:** Se mantiene el comportamiento stacked (columna) correcto.
- [ ] **Drawer Posición:** Al abrir un rubro, el backdrop cubre **toda** la pantalla (incluyendo el sidebar y nav superior).
- [ ] **Drawer Scroll:** El scroll del body se bloquea correctamente (ya implementado, verificar que siga funcionando con Portal).
- [ ] **Interacción:** El drawer cierra con ESC y click en backdrop.

---

## 7. Comandos Usados
- `rg -n "Estados"`
- `read_file src/pages/Estados.tsx`
- `read_file src/pages/estados/components/EstadoSituacionPatrimonialV2.tsx`
- `read_file src/pages/estados/components/BalanceSheetDrawer.tsx`
