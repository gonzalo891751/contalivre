import { useRef, useCallback, useState, useEffect } from 'react'
import { CalendarBlank, CaretDown, Warning } from '@phosphor-icons/react'
import { usePeriodYear } from '../../../hooks/usePeriodYear'
import { type DropdownId } from '../../../hooks/useDropdownManager'
import DropdownMenu from './DropdownMenu'

interface PeriodPickerProps {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  registerRef: (id: DropdownId, ref: HTMLElement | null) => void
}

export default function PeriodPicker({
  isOpen,
  onToggle,
  onClose,
  registerRef,
}: PeriodPickerProps) {
  const { year, start, end, setYear, setPeriod, availableYears } = usePeriodYear()
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Local state for custom range
  const [localStart, setLocalStart] = useState(start)
  const [localEnd, setLocalEnd] = useState(end)

  // Sync with global state when opening
  useEffect(() => {
    if (isOpen) {
      setLocalStart(start)
      setLocalEnd(end)
    }
  }, [isOpen, start, end])

  // Register ref on mount
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (wrapperRef.current !== node) {
        registerRef('period', node)
      }
      ; (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [registerRef]
  )

  const handleSelectYear = (selectedYear: number) => {
    setYear(selectedYear)
    onClose()
  }

  const handleApplyRange = () => {
    if (localStart > localEnd) return
    setPeriod(year, localStart, localEnd)
    onClose()
  }

  const isValid = localStart <= localEnd

  const formatDate = (iso: string) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div ref={setRef} className="period-picker-wrapper">
      <button
        type="button"
        className="period-picker-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="period-dropdown"
      >
        <div className="period-picker-content">
          <CalendarBlank size={18} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: '1.2' }}>
            <span className="period-picker-label">
              Ejercicio <span className="period-picker-year">{year}</span>
            </span>
            <span style={{ fontSize: '0.75em', opacity: 0.7, fontWeight: 400 }}>
              {formatDate(start)} - {formatDate(end)}
            </span>
          </div>
        </div>
        <CaretDown size={12} weight="bold" className="period-picker-caret" />
      </button>

      <DropdownMenu
        id="period-dropdown"
        isOpen={isOpen}
        onClose={onClose}
        align="right"
        className="period-dropdown w-[320px] sm:w-[360px]"
      >
        <div className="period-dropdown-header">
          <span>Seleccionar Año</span>
        </div>
        <div className="period-dropdown-list max-h-[240px] overflow-y-auto">
          {availableYears.map((y) => (
            <button
              key={y}
              type="button"
              className={`period-year-btn ${y === year ? 'selected' : ''}`}
              onClick={() => handleSelectYear(y)}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Custom Range Section */}
        <div className="p-3 border-t border-gray-200 mt-1">
          <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Rango del Ejercicio
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className="text-[10px] block mb-1 text-gray-600 font-medium">Inicio</label>
              <input
                type="date"
                value={localStart}
                onChange={e => setLocalStart(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5"
              />
            </div>
            <div>
              <label className="text-[10px] block mb-1 text-gray-600 font-medium">Cierre</label>
              <input
                type="date"
                value={localEnd}
                onChange={e => setLocalEnd(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/5"
              />
            </div>
          </div>

          {!isValid && (
            <div className="text-red-500 text-xs mb-2 flex items-center gap-1 font-medium bg-red-50 p-1.5 rounded">
              <Warning size={14} /> <span>Inicio mayor a cierre</span>
            </div>
          )}

          <button
            type="button"
            disabled={!isValid}
            onClick={handleApplyRange}
            className={`w-full py-2 text-xs rounded font-medium mt-1 transition-colors ${isValid
              ? 'bg-gray-900 text-white hover:bg-black'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
          >
            Aplicar Rango
          </button>
        </div>
      </DropdownMenu>
    </div>
  )
}
