import { useRef, useCallback } from 'react'
import { CalendarBlank, CaretDown } from '@phosphor-icons/react'
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
  const { year, setYear, availableYears } = usePeriodYear()
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Register ref on mount
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (wrapperRef.current !== node) {
        registerRef('period', node)
      }
      ;(wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [registerRef]
  )

  const handleSelectYear = (selectedYear: number) => {
    setYear(selectedYear)
    onClose()
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
          <span className="period-picker-label">
            Periodo <span className="period-picker-year">{year}</span>
          </span>
        </div>
        <CaretDown size={12} weight="bold" className="period-picker-caret" />
      </button>

      <DropdownMenu
        id="period-dropdown"
        isOpen={isOpen}
        onClose={onClose}
        align="right"
        className="period-dropdown"
      >
        <div className="period-dropdown-header">
          <span>Seleccionar Ano</span>
        </div>
        <div className="period-dropdown-list">
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
      </DropdownMenu>
    </div>
  )
}
