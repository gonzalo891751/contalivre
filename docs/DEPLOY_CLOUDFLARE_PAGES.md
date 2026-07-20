# Despliegue reproducible — Cloudflare Pages

> ContaLivre es una PWA estática (Vite + React) sin backend. Se sirve como
> archivos estáticos con fallback SPA. Este documento define el procedimiento;
> **no** se publica automáticamente a producción.

## 1. Entorno de build

| Ítem | Valor |
|---|---|
| Node | **22 LTS "Jod"** (pineado en `.nvmrc`/`.node-version` = 22.23.1; `engines: >=22 <23`). Node 20 quedó EOL en abril de 2026. |
| npm | 10+ (`packageManager: npm@11.12.1`) |
| Comando build | `npm ci && npm run build` |
| Directorio de salida | `dist/` |
| rollup | pineado a 4.44.0 (`overrides` en package.json) por compatibilidad con la generación del service worker de workbox |
| Versión de app | fuente única `package.json` (`0.4.0-rc.1`); Vite la inyecta como `VITE_APP_VERSION` y el runtime la importa como fallback — no hay números duplicados |

> En Cloudflare Pages fijar la variable de entorno `NODE_VERSION=22.23.1`
> (o respetar `.node-version`, que Pages lee automáticamente).

## 2. Configuración de Cloudflare Pages

Build settings del proyecto:

- **Framework preset**: None (Vite).
- **Build command**: `npm ci && npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/`
- **Environment variables** (públicas, inyectadas en build):
  - `VITE_COMMIT_SHA` = `$CF_PAGES_COMMIT_SHA` (commit exacto publicado)
  - `VITE_BUILD_DATE` = fecha ISO del build
  - `VITE_APP_VERSION` = versión de `package.json`

> `vite.config.ts` ya deriva `VITE_COMMIT_SHA`/`VITE_BUILD_DATE` desde git en
> build local; en Cloudflare, mapear la variable `CF_PAGES_COMMIT_SHA`.

## 3. Fallback SPA y headers

Archivos versionados en el repo:

- `public/_redirects`:
  ```
  /*    /index.html   200
  ```
  (fallback SPA para rutas directas como `/estados`, `/mapeos`, `/practica`).

- `public/_headers` (cache y seguridad):
  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /sw.js
    Cache-Control: no-cache
  /*
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
  ```

## 4. Procedimiento de staging (obligatorio antes de producción)

1. `npm ci`
2. `npm test` — la suite completa debe pasar (incluye el gate 2A+2B).
3. `npm run lint` — exit 0.
4. `npm audit --omit=dev` — sin vulnerabilidades high/critical (moderadas documentadas).
5. `npm run build` — genera `dist/` + service worker.
6. Deploy a un **Preview** de Cloudflare Pages (rama no productiva).
7. Smoke E2E manual sobre el preview (ver §20 del informe de fase).
8. Verificar en `/acerca` que el commit y la fecha de build coinciden con lo esperado.
9. **Autorización manual** de una persona.
10. Promoción del preview a producción.

## 5. Rollback

- Cloudflare Pages conserva los deploys anteriores: **Rollback** = re-promover el deploy previo desde el panel (sin rebuild).
- El banner de `/acerca` (commit + schema + motor + build) permite verificar qué versión está viva y diagnosticar service workers cacheados.
- Ante un service worker viejo pegado: forzar actualización recargando (la PWA usa `registerType: autoUpdate`).

## 6. Provenance

Cada build queda trazable: el commit publicado se muestra en `/acerca`
(`VITE_COMMIT_SHA`), junto con la fecha de build, el schema Dexie, la versión
del motor contable y la norma declarada. No se despliega sin este vínculo.
