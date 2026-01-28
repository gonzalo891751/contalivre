/**
 * Exchange Rates Service
 *
 * Fetches exchange rates from DolarAPI and manages caching.
 * https://dolarapi.com/v1/dolares
 */

import { db } from '../storage/db'
import type { ExchangeRate, ExchangeRatesCache, QuoteType } from '../core/monedaExtranjera/types'

const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const CACHE_ID = 'fx-rates-cache'

/**
 * Raw response from DolarAPI
 */
interface DolarAPIResponse {
    moneda: string
    casa: string
    nombre: string
    compra: number | null
    venta: number | null
    fechaActualizacion: string
}

/**
 * Map DolarAPI "casa" to our QuoteType
 */
function mapCasaToQuoteType(casa: string): QuoteType | null {
    const mapping: Record<string, QuoteType> = {
        oficial: 'Oficial',
        blue: 'Blue',
        bolsa: 'MEP',
        contadoconliqui: 'CCL',
        cripto: 'Cripto',
    }
    return mapping[casa] || null
}

/**
 * Map DolarAPI "casa" to source label
 */
function mapCasaToSource(casa: string): string {
    const mapping: Record<string, string> = {
        oficial: 'BNA',
        blue: 'Mercado',
        bolsa: 'Bolsa',
        contadoconliqui: 'Bolsa',
        cripto: 'Binance',
    }
    return mapping[casa] || casa
}

/**
 * Parse DolarAPI response to our ExchangeRate format
 */
function parseAPIResponse(data: DolarAPIResponse[]): ExchangeRate[] {
    const rates: ExchangeRate[] = []

    for (const item of data) {
        const type = mapCasaToQuoteType(item.casa)
        if (!type) continue

        // Skip if no valid prices
        if (item.compra === null && item.venta === null) continue

        rates.push({
            type,
            compra: item.compra ?? item.venta ?? 0,
            venta: item.venta ?? item.compra ?? 0,
            source: mapCasaToSource(item.casa),
            fechaActualizacion: item.fechaActualizacion,
        })
    }

    // Sort by type priority
    const priority: QuoteType[] = ['Oficial', 'Blue', 'MEP', 'CCL', 'Cripto']
    rates.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))

    return rates
}

/**
 * Load cached rates from IndexedDB
 */
async function loadCachedRates(): Promise<ExchangeRatesCache | null> {
    try {
        const cache = await db.fxRatesCache.get(CACHE_ID)
        return cache || null
    } catch {
        return null
    }
}

/**
 * Save rates to IndexedDB cache
 */
async function saveCachedRates(rates: ExchangeRate[]): Promise<void> {
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()

    const cache: ExchangeRatesCache = {
        id: CACHE_ID,
        rates,
        fetchedAt: now,
        expiresAt,
    }

    try {
        await db.fxRatesCache.put(cache)
    } catch (error) {
        console.warn('Failed to cache exchange rates:', error)
    }
}

/**
 * Check if cache is still valid
 */
function isCacheValid(cache: ExchangeRatesCache | null): boolean {
    if (!cache) return false
    return new Date(cache.expiresAt) > new Date()
}

/**
 * Fetch fresh rates from DolarAPI
 */
async function fetchFromAPI(): Promise<ExchangeRate[]> {
    const response = await fetch(DOLAR_API_URL)

    if (!response.ok) {
        throw new Error(`DolarAPI responded with ${response.status}`)
    }

    const data: DolarAPIResponse[] = await response.json()
    return parseAPIResponse(data)
}

/**
 * Get exchange rates (with cache)
 *
 * Returns cached rates if valid, otherwise fetches fresh rates.
 * If fetch fails, returns cached rates (even if expired) as fallback.
 */
export async function getExchangeRates(forceRefresh = false): Promise<{
    rates: ExchangeRate[]
    fromCache: boolean
    cacheExpired: boolean
    error?: string
}> {
    const cached = await loadCachedRates()

    // If cache is valid and not forcing refresh, return cached
    if (!forceRefresh && isCacheValid(cached)) {
        return {
            rates: cached!.rates,
            fromCache: true,
            cacheExpired: false,
        }
    }

    // Try to fetch fresh rates
    try {
        const rates = await fetchFromAPI()
        await saveCachedRates(rates)
        return {
            rates,
            fromCache: false,
            cacheExpired: false,
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
        console.warn('Failed to fetch exchange rates:', errorMessage)

        // Return cached rates as fallback (even if expired)
        if (cached && cached.rates.length > 0) {
            return {
                rates: cached.rates,
                fromCache: true,
                cacheExpired: true,
                error: `No se pudo actualizar. Usando datos de ${formatCacheDate(cached.fetchedAt)}`,
            }
        }

        // No cache available - return empty with error
        return {
            rates: [],
            fromCache: false,
            cacheExpired: false,
            error: `Error al obtener cotizaciones: ${errorMessage}`,
        }
    }
}

/**
 * Format cache date for display
 */
function formatCacheDate(isoDate: string): string {
    try {
        const date = new Date(isoDate)
        return date.toLocaleString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return 'fecha desconocida'
    }
}

/**
 * Get a specific quote type
 */
export function getQuote(rates: ExchangeRate[], type: QuoteType): ExchangeRate | undefined {
    return rates.find(r => r.type === type)
}

/**
 * Get the rate value based on asset/liability rule
 */
export function getRateValue(
    rate: ExchangeRate,
    rule: 'compra' | 'venta'
): number {
    return rule === 'compra' ? rate.compra : rate.venta
}

/**
 * Get display rate for a currency based on quote type and rule
 */
export function getDisplayRate(
    rates: ExchangeRate[],
    quoteType: QuoteType,
    rule: 'compra' | 'venta'
): number {
    const quote = getQuote(rates, quoteType)
    if (!quote) return 0
    return getRateValue(quote, rule)
}

/**
 * Clear rates cache (for testing)
 */
export async function clearRatesCache(): Promise<void> {
    try {
        await db.fxRatesCache.delete(CACHE_ID)
    } catch {
        // Ignore errors
    }
}

/**
 * Get the last update time from rates
 */
export function getLastUpdateTime(rates: ExchangeRate[]): string | null {
    if (rates.length === 0) return null

    // Find the most recent update
    const dates = rates
        .map(r => new Date(r.fechaActualizacion))
        .filter(d => !isNaN(d.getTime()))

    if (dates.length === 0) return null

    const mostRecent = new Date(Math.max(...dates.map(d => d.getTime())))

    return mostRecent.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}
