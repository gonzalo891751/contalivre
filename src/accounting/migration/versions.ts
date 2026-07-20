/**
 * Versiones del núcleo contable — fuente única.
 *
 * CURRENT_SCHEMA_VERSION: versión vigente del schema Dexie. Los asientos
 * nuevos se estampan con este valor.
 *
 * APP_VERSION (Fase 2F, §4.1): la fuente única es package.json. Vite la
 * inyecta como VITE_APP_VERSION en build (vite.config define) y Cloudflare
 * puede sobreescribirla con el mismo valor; el fallback importa package.json
 * directamente (vitest/node), de modo que NUNCA hay dos números distintos.
 */

import pkg from '../../../package.json'

export const CURRENT_SCHEMA_VERSION = 21

export const APP_VERSION: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION)
    || pkg.version

/** Versión del motor contable (servicio + reporting engine) */
export const ACCOUNTING_ENGINE_VERSION = '2F.0'

/** Marco normativo declarado (ver capacidades y notas) */
export const NORMATIVE_BASELINE = 'RT 54 (texto ordenado por RT 59) — alcance educativo comercial/servicios'
