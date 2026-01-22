import { useState, useEffect } from 'react'

interface UseScrollCompactReturn {
  isCompact: boolean
}

export function useScrollCompact(threshold: number = 30): UseScrollCompactReturn {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    let ticking = false

    const updateCompactState = () => {
      const shouldBeCompact = window.scrollY > threshold

      if (shouldBeCompact !== isCompact) {
        setIsCompact(shouldBeCompact)

        // Update body class for CSS variable changes
        if (shouldBeCompact) {
          document.body.classList.add('header-compact')
        } else {
          document.body.classList.remove('header-compact')
        }
      }

      ticking = false
    }

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateCompactState)
        ticking = true
      }
    }

    // Check initial state
    updateCompactState()

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      document.body.classList.remove('header-compact')
    }
  }, [threshold, isCompact])

  return { isCompact }
}
