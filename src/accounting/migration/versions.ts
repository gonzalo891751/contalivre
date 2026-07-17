/**
 * Versiones del núcleo contable — fuente única.
 *
 * CURRENT_SCHEMA_VERSION: versión vigente del schema Dexie. Los asientos
 * nuevos se estampan con este valor.
 */

export const CURRENT_SCHEMA_VERSION = 19

export const APP_VERSION: string =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_APP_VERSION) || '0.3.0'

/** Versión del motor contable (servicio + reporting engine) */
export const ACCOUNTING_ENGINE_VERSION = '2B.1'

/** Marco normativo declarado (ver capacidades y notas) */
export const NORMATIVE_BASELINE = 'RT 54 (texto ordenado por RT 59) — alcance educativo comercial/servicios'
