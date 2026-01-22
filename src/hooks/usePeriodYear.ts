import { useState, useCallback, useMemo } from 'react'

const LS_KEY = 'contalivre_period_year'
const DEFAULT_YEAR = 2026

interface UsePeriodYearReturn {
  year: number
  setYear: (year: number) => void
  availableYears: number[]
}

export function usePeriodYear(): UsePeriodYearReturn {
  const [year, setYearState] = useState<number>(() => {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed)) {
        return parsed
      }
    }
    return DEFAULT_YEAR
  })

  const setYear = useCallback((newYear: number) => {
    setYearState(newYear)
    localStorage.setItem(LS_KEY, String(newYear))
  }, [])

  const availableYears = useMemo(() => [2027, 2026, 2025, 2024, 2023], [])

  return {
    year,
    setYear,
    availableYears,
  }
}
