/**
 * Auditoría E2E — el año del período lo define el rango aplicado (DEF-A03).
 *
 * Reproducción del defecto: con el selector en 2026 se aplicaba el rango
 * 01/01/2025 – 31/12/2025 y el encabezado quedaba "Ejercicio 2026" con fechas
 * de 2025. Todo lo que se indexa por año (Estados contables, Dashboard,
 * indicadores) apuntaba a un ejercicio distinto del que mostraba el rango.
 */

import { describe, it, expect } from 'vitest'
import { yearFromRange } from '../../src/hooks/usePeriodYear'

describe('año derivado del rango del ejercicio', () => {
    it('toma el año de la fecha de inicio', () => {
        expect(yearFromRange('2025-01-01')).toBe(2025)
        expect(yearFromRange('2025-12-31')).toBe(2025)
        expect(yearFromRange('2024-07-01')).toBe(2024)
    })

    it('usa el año de inicio también en ejercicios irregulares', () => {
        // Ejercicio de 01/07/2025 a 30/06/2026: se identifica por su apertura,
        // igual que `buildAnnualExercise` en el contexto contable persistido.
        expect(yearFromRange('2025-07-01')).toBe(2025)
    })

    it('cae al año corriente si la fecha es ilegible', () => {
        expect(yearFromRange('')).toBe(new Date().getFullYear())
        expect(yearFromRange('sin-fecha')).toBe(new Date().getFullYear())
    })
})
