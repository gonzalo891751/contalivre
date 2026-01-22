## 1) Resumen Ejecutivo
- Tailwind usa `corePlugins.preflight: false`, por lo que no hay reset de Tailwind; el reset real vive en `src/styles/index.css` y ahora esta en `@layer base`.
- Entry real: `src/main.tsx` importa `src/styles/index.css`; dentro del CSS, `@import "tailwindcss"` va primero y el custom CSS esta separado por capas.
- Orden de carga efectivo: `@import "tailwindcss"` inyecta base/components/utilities; el custom CSS se agrega por capas y las utilities de Tailwind quedan al final.
- Al estar el custom CSS en capas, las utilities de Tailwind quedan al final; si un elemento usa utility y clase custom con misma especificidad, gana la utility.
- CSS global sigue siendo el mayor riesgo de colision: reset global y clases genericas (.btn, .card, .table, .modal, .sidebar, .layout).
- Hipotesis principal: choques por selectores globales + clases genericas en el CSS global, no por falta de Tailwind.

## 2) Archivos reales detectados
- Tailwind config: `tailwind.config.js`
- Entry principal: `src/main.tsx`
- CSS global importado: `src/styles/index.css`
- NO ENCONTRADO: `tailwind.config.ts`, `src/main.ts`, `src/index.css`

## 3) Orden real de imports
### src/main.tsx (orden de imports relevante)
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
```

### src/styles/index.css (inicio del archivo)
```css
/* ===========================================
   CONTALIVRE - Design System
   =========================================== */
@import "tailwindcss";

@layer base {
/* ---- CSS Variables ---- */
:root {
  /* =========================
     ContaLivre 2026 Tokens
     ========================= */
  --brand-primary: #3B82F6;
  --brand-secondary: #10B981;
  --brand-gradient: linear-gradient(135deg, #2563EB 0%, #10B981 100%);

  --surface-1: #FFFFFF;
  --surface-2: #F8FAFC;
  --surface-3: #EEF2F7;
  --surface-glass: rgba(255, 255, 255, 0.70);

  --text-strong: #0F172A;
```

## 4) Mapa de imports de CSS
### rg "import .*\\.css" src -n
```text
src\main.tsx:5:import './styles/index.css'
src\components\Indicators\IndicatorsDashboard.tsx:10:import styles from './IndicatorsDashboard.module.css';
```

### rg "@import" src -n
```text
src\styles\index.css:4:@import "tailwindcss";
```

## 5) Selectores globales peligrosos (y por que pueden chocar)
- `*`, `html`, `body`: aplican a todo el DOM, pueden redefinir box-model, tipografia y backgrounds en cualquier componente.
```css
/* ===========================================
   SECTION: RESET
   =========================================== */
/* ---- Reset ---- */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-body);
  font-size: var(--fs-base);
  font-weight: var(--font-weight-regular);
  color: var(--color-text);
  background: linear-gradient(135deg, var(--bg) 0%, var(--accent-pastel) 50%, var(--bg) 100%);
  background-attachment: fixed;
  line-height: var(--lh-normal);
  min-height: 100vh;
}

/* ---- Shell QA Polish (Phase 5.1) ---- */

/* 1. Horizontal Scroll Safety */
html,
body {
  overflow-x: hidden;
  /* Prevent full-page horizontal scroll */
  max-width: 100vw;
}

/* Ensure form controls inherit font families */
button,
input,
select,
textarea {
  font-family: inherit;
}


/* ---- Typography ---- */
h1,
```

- `h1`-`h6`, `a`, `button`, `input`, `select`, `textarea`: fuerzan tipografia/estilos base y pueden pisar estilos de componentes o librerias UI.
```css
}


/* ---- Typography ---- */
h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: var(--font-display);
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
  line-height: var(--lh-tight);
  margin-bottom: var(--space-md);
}

h1 {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-extrabold);
}

h2 {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
}

h3 {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
}

h4 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

p {
  margin-bottom: var(--space-md);
}

a {
  color: var(--color-primary);
  text-decoration: none;
  transition: color var(--transition-fast);
```

- Clases genericas globales: `\.btn`, `\.card`, `\.table`, `\.modal`, `\.dropdown-menu`, `\.sidebar`, `\.layout` afectan multiples features y pueden colisionar con clases nuevas.
```css
}

/* Disabled amount input */
.input-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--surface-2) !important;
  color: var(--text-muted);
}

.form-error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
  margin-top: var(--space-xs);
}

/* ---- Buttons ---- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  font-family: inherit;
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, filter 150ms ease, background 150ms ease;
  text-decoration: none;
}

.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.btn-primary {
  background: var(--brand-gradient);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.03) saturate(1.05);
  box-shadow: var(--shadow-md);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0px);
  filter: brightness(0.98);
}

.btn-secondary {
  background: var(--surface-1);
  color: var(--text);
```

## 6) Archivos clave (contenido)
### tailwind.config.js
```js
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [animate],
  corePlugins: { preflight: false },
};
```

### postcss.config.js
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
```

### vite.config.ts
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: [
                'favicon.svg',
                'favicon.ico',
                'favicon-16.png',
                'favicon-32.png',
                'apple-touch-icon.png',
                'android-chrome-192.png',
                'android-chrome-512.png',
                'icons/*.png',
                'brand/*.png'
            ],
            manifest: {
                name: 'ContaLivre',
                short_name: 'ContaLivre',
                description: 'Tu asistente contable',
                theme_color: '#0F172A',
                background_color: '#0F172A',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                icons: [
                    {
                        src: '/android-chrome-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/android-chrome-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            }
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@core': path.resolve(__dirname, './src/core'),
            '@storage': path.resolve(__dirname, './src/storage'),
            '@ui': path.resolve(__dirname, './src/ui'),
            '@pages': path.resolve(__dirname, './src/pages')
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts'
    }
})
```

### src/main.tsx
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>
)
```

### src/App.tsx
```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './ui/Layout/MainLayout'
import Dashboard from './pages/Dashboard'
import Cuentas from './pages/Cuentas'
import Asientos from './pages/Asientos'
import Mayor from './pages/Mayor'
import Balance from './pages/Balance'
import Estados from './pages/Estados'
import AmortizacionesPage from './pages/Planillas/AmortizacionesPage'
import InventarioPage from './pages/Planillas/InventarioPage'
import ConciliacionesPage from './pages/Planillas/Conciliaciones/ConciliacionesPage'
import CierreValuacionPage from './pages/Planillas/CierreValuacionPage'
import PlanillasLayout from './pages/Planillas/PlanillasLayout'
import PlanillasHome from './pages/Planillas/PlanillasHome'

function App() {
    return (
        <MainLayout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cuentas" element={<Cuentas />} />
                <Route path="/asientos" element={<Asientos />} />
                <Route path="/mayor" element={<Mayor />} />
                <Route path="/balance" element={<Balance />} />
                <Route path="/estados" element={<Estados />} />
                <Route path="/practica" element={<Navigate to="/" replace />} />
                <Route path="/planillas" element={<PlanillasLayout />}>
                    <Route index element={<PlanillasHome />} />
                    <Route path="inventario" element={<InventarioPage />} />
                    <Route path="conciliaciones" element={<ConciliacionesPage />} />
                    <Route path="amortizaciones" element={<AmortizacionesPage />} />
                    <Route path="cierre-valuacion" element={<CierreValuacionPage />} />
                </Route>
            </Routes>
        </MainLayout>
    )
}

export default App

```

## 7) Lista de CSS existentes
```text
src\styles\index.css
src\components\Indicators\IndicatorsDashboard.module.css
```

