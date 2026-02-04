import { useLayoutEffect, type RefObject } from 'react'

export default function useHeaderHeightCssVar(
  ref: RefObject<HTMLElement>,
  cssVarName: string = '--app-header-h'
) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || typeof window === 'undefined') return

    const rootStyle = document.documentElement.style

    const setHeight = () => {
      const next = Math.round(element.getBoundingClientRect().height)
      rootStyle.setProperty(cssVarName, `${next}px`)
    }

    setHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', setHeight)
      return () => window.removeEventListener('resize', setHeight)
    }

    const observer = new ResizeObserver(() => setHeight())
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref, cssVarName])
}
