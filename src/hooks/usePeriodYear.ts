import { useCallback, useMemo, useSyncExternalStore } from 'react'

const LS_KEY = 'contalivre_period_year'
const DEFAULT_YEAR = 2026

interface PeriodState {
  year: number
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD
}

// ── Shared external store ──────────────────────────────

let currentState: PeriodState = readFromLS()
const listeners = new Set<() => void>()

function getDefaultDates(year: number) {
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`
  }
}

function readFromLS(): PeriodState {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      // Try parsing as JSON first (new format)
      if (stored.startsWith('{')) {
        const parsed = JSON.parse(stored)
        if (parsed.year && parsed.start && parsed.end) {
          return parsed as PeriodState
        }
      }

      // Fallback: legacy format (just a number string)
      const parsedYear = parseInt(stored, 10)
      if (!isNaN(parsedYear)) {
        return {
          year: parsedYear,
          ...getDefaultDates(parsedYear)
        }
      }
    }
  } catch (e) {
    console.error('Failed to parse period from LS', e)
  }

  return {
    year: DEFAULT_YEAR,
    ...getDefaultDates(DEFAULT_YEAR)
  }
}

function getSnapshot(): PeriodState {
  return currentState
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

// ── Hook ───────────────────────────────────────────────

interface UsePeriodYearReturn extends PeriodState {
  /**
   * Update full period details
   */
  setPeriod: (year: number, start: string, end: string) => void
  /**
   * Convenience wrapper to set year and reset dates to Jan 1 - Dec 31
   */
  setYear: (year: number) => void
  availableYears: number[]
  /**
   * Returns YYYY-MM string for the end of the period (useful for closing index lookup)
   */
  periodEndMonth: string
}

export function usePeriodYear(): UsePeriodYearReturn {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setPeriod = useCallback((year: number, start: string, end: string) => {
    const newState: PeriodState = { year, start, end }
    currentState = newState
    localStorage.setItem(LS_KEY, JSON.stringify(newState))
    emitChange()
  }, [])

  const setYear = useCallback((year: number) => {
    // Setting year resets range to full calendar year
    const defaults = getDefaultDates(year)
    setPeriod(year, defaults.start, defaults.end)
  }, [setPeriod])

  const availableYears = useMemo(() => [2027, 2026, 2025, 2024, 2023], [])

  const periodEndMonth = useMemo(() => {
    return state.end.slice(0, 7) // YYYY-MM
  }, [state.end])

  return {
    ...state,
    setPeriod,
    setYear,
    availableYears,
    periodEndMonth
  }
}
