import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

interface MobileTopBarProps {
    onMenuClick: () => void
    rightAction?: React.ReactNode
}

export default function MobileTopBar({
    onMenuClick,
    rightAction,
}: MobileTopBarProps) {
    const [isVisible, setIsVisible] = useState(true)
    const lastScrollY = useRef(0)

    // Hide on scroll logic
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY

            // Show if scrolling up or at the top
            if (currentScrollY < lastScrollY.current || currentScrollY < 50) {
                setIsVisible(true)
            }
            // Hide if scrolling down and not at the top
            else if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
                setIsVisible(false)
            }

            lastScrollY.current = currentScrollY
        }

        // Throttle scroll event slightly for performance
        let ticking = false
        const onScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    handleScroll()
                    ticking = false
                })
                ticking = true
            }
        }

        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])



    return (
        <header className={`mobile-top-bar ${!isVisible ? 'hidden' : ''}`}>
            <button
                type="button"
                className="mobile-top-bar-btn"
                onClick={onMenuClick}
                aria-label="Abrir menú"
            >
                <span className="mobile-hamburger" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                </span>
            </button>

            <Link to="/" className="mobile-top-bar-logo-link" aria-label="Ir a Inicio">
                <img
                    src="/brand/contalivre-logo-v2.png"
                    alt="ContaLivre"
                    className="mobile-top-bar-logo"
                />
            </Link>

            <div className="mobile-top-bar-right">
                {rightAction || <span style={{ width: 44 }} />}
            </div>
        </header>
    )
}
