import { useRef, useEffect, type ReactNode } from 'react'

interface DropdownMenuProps {
  id: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}

export default function DropdownMenu({
  id,
  isOpen,
  children,
  align = 'right',
  className = '',
}: DropdownMenuProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Focus management for accessibility
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const firstFocusable = dropdownRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      firstFocusable?.focus()
    }
  }, [isOpen])

  const alignClass = `align-${align}`

  return (
    <div
      ref={dropdownRef}
      id={id}
      className={`dropdown-menu ${alignClass} ${isOpen ? 'open' : ''} ${className}`}
      role="menu"
      aria-hidden={!isOpen}
    >
      {children}
    </div>
  )
}
