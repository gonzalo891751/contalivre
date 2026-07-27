/**
 * Auditoría E2E — registro canónico de índices (DEF-A01).
 *
 * La única tabla de índices que consume el motor de estados contables es
 * `inflationIndexSets`. Antes de esta auditoría no existía forma de escribirla
 * desde la interfaz: la planilla de Cierre (AxI) guarda su propio papel de
 * trabajo, así que "Moneda de cierre" nunca podía habilitarse.
 *
 * Estas pruebas fijan el lector de series que alimenta el panel nuevo y el
 * viaje completo serie → registro → set utilizable por el motor.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers'
import {
    missingMonths,
    normalizePeriod,
    parseIndexSeries,
    parseIndexValue,
} from '../../src/accounting/inflation/parseIndexSeries'
import { indexSetToMap, listIndexSets, saveIndexSet } from '../../src/accounting/inflation/indexRegistry'

/** Serie oficial INDEC — IPC Nacional Nivel General, base dic-2016 = 100 */
const IPC_2025 = `periodo,valor
2024-12,7694.0075
2025-01,7864.1257
2025-02,8052.9927
2025-03,8353.3158
2025-04,8585.6078
2025-05,8714.4871
2025-06,8855.5681
2025-07,9023.9730
2025-08,9193.2441
2025-09,9384.0922
2025-10,9603.8623
2025-11,9841.3581
2025-12,10121.3715`

describe('lectura de una serie de índices', () => {
    it('normaliza los formatos de período usados por las fuentes locales', () => {
        expect(normalizePeriod('2025-01')).toBe('2025-01')
        expect(normalizePeriod('2025-1')).toBe('2025-01')
        expect(normalizePeriod('2025/03')).toBe('2025-03')
        expect(normalizePeriod('01/2025')).toBe('2025-01')
        expect(normalizePeriod('dic-2024')).toBe('2024-12')
        expect(normalizePeriod('Ene 2025')).toBe('2025-01')
    })

    it('rechaza períodos imposibles', () => {
        expect(normalizePeriod('2025-13')).toBeNull()
        expect(normalizePeriod('2025-00')).toBeNull()
        expect(normalizePeriod('sin fecha')).toBeNull()
    })

    it('lee el valor sin redondearlo, en formato local o inglés', () => {
        expect(parseIndexValue('10121.3715')).toBe(10121.3715)
        expect(parseIndexValue('10.121,3715')).toBe(10121.3715)
        expect(parseIndexValue('10121,3715')).toBe(10121.3715)
        expect(parseIndexValue('7694')).toBe(7694)
    })

    it('rechaza valores no positivos o no numéricos', () => {
        expect(parseIndexValue('0')).toBeNull()
        expect(parseIndexValue('-3')).toBeNull()
        expect(parseIndexValue('n/d')).toBeNull()
    })

    it('lee la serie completa conservando los cuatro decimales de la fuente', () => {
        const { values, rejected } = parseIndexSeries(IPC_2025)
        expect(rejected).toHaveLength(0)
        expect(values).toHaveLength(13)
        expect(values[0]).toEqual({ period: '2024-12', value: 7694.0075 })
        expect(values[12]).toEqual({ period: '2025-12', value: 10121.3715 })
    })

    it('informa las filas ilegibles en lugar de descartarlas en silencio', () => {
        const { values, rejected } = parseIndexSeries('periodo,valor\n2025-01,100\nbasura\n2025-02,n/d')
        expect(values).toHaveLength(1)
        expect(rejected).toHaveLength(2)
        expect(rejected[1].reason).toContain('no numérico')
    })

    it('detecta huecos en la serie (nunca los interpola)', () => {
        const { values } = parseIndexSeries('2025-01,100\n2025-02,110\n2025-05,130')
        expect(missingMonths(values)).toEqual(['2025-03', '2025-04'])
        const { values: completa } = parseIndexSeries(IPC_2025)
        expect(missingMonths(completa)).toEqual([])
    })
})

describe('registro canónico de índices', () => {
    beforeEach(async () => { await resetDb() })

    it('registra la serie oficial y la deja disponible para el motor', async () => {
        const { values } = parseIndexSeries(IPC_2025)
        const set = await saveIndexSet({
            name: 'IPC Nacional Nivel General 2025',
            status: 'OFFICIAL',
            source: 'INDEC — IPC Nacional, base dic-2016=100',
            sourceUrl: 'https://apis.datos.gob.ar/series/api/series/?ids=145.3_INGNACNAL_DICI_M_15',
            values,
        })

        expect(set.status).toBe('OFFICIAL')
        expect(set.values).toHaveLength(13)
        expect(await listIndexSets()).toHaveLength(1)

        const map = indexSetToMap(set)
        expect(map.get('2025-12')).toBe(10121.3715)
        expect(map.get('2024-12')).toBe(7694.0075)

        // El coeficiente de reexpresión anual sale de la serie sin redondeos
        const coef = map.get('2025-12')! / map.get('2024-12')!
        expect(coef).toBeCloseTo(1.3155, 4)
    })

    it('no admite una serie con períodos o valores inválidos', async () => {
        await expect(saveIndexSet({
            name: 'rota', status: 'MANUAL', source: 'x',
            values: [{ period: '2025-13', value: 100 }],
        })).rejects.toThrow(/Índices inválidos/)

        await expect(saveIndexSet({
            name: 'rota', status: 'MANUAL', source: 'x',
            values: [{ period: '2025-01', value: 0 }],
        })).rejects.toThrow(/Índices inválidos/)
    })

    it('detecta la alteración posterior de un set registrado', async () => {
        const { values } = parseIndexSeries(IPC_2025)
        const set = await saveIndexSet({ name: 'IPC', status: 'OFFICIAL', source: 'INDEC', values })
        const alterado = { ...set, values: set.values.map((v, i) => (i === 0 ? { ...v, value: 1 } : v)) }
        expect(() => indexSetToMap(alterado)).toThrow(/hash no coincide/)
    })
})
