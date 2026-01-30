import { useCallback, useMemo, useSyncExternalStore } from 'react'

const LS_KEY = 'contalivre_period_year'
const DEFAULT_YEAR = 2026

// ── Shared external store ──────────────────────────────
// All components calling usePeriodYear() subscribe to the same value.
// When any component calls setYear(), every subscriber re-renders.

let currentYear: number = readFromLS()
const listeners = new Set<() => void>()

function readFromLS(): number {
  const stored = localStorage.getItem(LS_KEY)
  if (stored) {
    const parsed = parseInt(stored, 10)
    if (!isNaN(parsed)) return parsed
  }
  return DEFAULT_YEAR
}

function getSnapshot(): number {
  return currentYear
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

interface UsePeriodYearReturn {
  year: number
  setYear: (year: number) => void
  availableYears: number[]
}

export function usePeriodYear(): UsePeriodYearReturn {
  const year = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setYear = useCallback((newYear: number) => {
    currentYear = newYear
    localStorage.setItem(LS_KEY, String(newYear))
    emitChange()
  }, [])

  const availableYears = useMemo(() => [2027, 2026, 2025, 2024, 2023], [])

  return { year, setYear, availableYears }
}
