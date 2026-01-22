import { useState, useEffect, useCallback, useRef } from 'react'

export type DropdownId = 'period' | 'notif' | 'user' | null

interface UseDropdownManagerReturn {
  openDropdownId: DropdownId
  isOpen: (id: DropdownId) => boolean
  toggle: (id: DropdownId) => void
  close: () => void
  registerRef: (id: DropdownId, ref: HTMLElement | null) => void
}

export function useDropdownManager(): UseDropdownManagerReturn {
  const [openDropdownId, setOpenDropdownId] = useState<DropdownId>(null)
  const dropdownRefs = useRef<Map<DropdownId, HTMLElement | null>>(new Map())

  const isOpen = useCallback((id: DropdownId) => openDropdownId === id, [openDropdownId])

  const toggle = useCallback((id: DropdownId) => {
    setOpenDropdownId(prev => (prev === id ? null : id))
  }, [])

  const close = useCallback(() => {
    setOpenDropdownId(null)
  }, [])

  const registerRef = useCallback((id: DropdownId, ref: HTMLElement | null) => {
    dropdownRefs.current.set(id, ref)
  }, [])

  // Close on click outside
  useEffect(() => {
    if (!openDropdownId) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const currentRef = dropdownRefs.current.get(openDropdownId)

      // Check if click is inside the dropdown or its trigger
      if (currentRef && currentRef.contains(target)) {
        return
      }

      close()
    }

    // Use setTimeout to avoid immediate close when opening
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [openDropdownId, close])

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close])

  return {
    openDropdownId,
    isOpen,
    toggle,
    close,
    registerRef,
  }
}
