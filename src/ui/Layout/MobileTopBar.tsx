import { useState } from 'react'

interface MobileTopBarProps {
    title: string
    onMenuClick: () => void
    rightAction?: React.ReactNode
    showBrandHeader?: boolean
}

type LogoState = 'svg' | 'png' | 'emoji'

export default function MobileTopBar({
    title,
    onMenuClick,
    rightAction,
    showBrandHeader = true
}: MobileTopBarProps) {
    const [logoState, setLogoState] = useState<LogoState>('svg')

    const handleLogoError = () => {
        if (logoState === 'svg') {
            setLogoState('png')
        } else if (logoState === 'png') {
            setLogoState('emoji')
        }
    }

    const logoSrc = logoState === 'svg'
        ? '/brand/ContaLivresf.svg'
        : '/brand/contalivre-logo.png'

    return (
        <>
            <header className="mobile-top-bar">
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

                <h1 className="mobile-top-bar-title">{title}</h1>

                <div className="mobile-top-bar-right">
                    {rightAction || <span style={{ width: 40 }} />}
                </div>
            </header>

            {/* Brand Header - Logo visible in mobile */}
            {showBrandHeader && (
                <div className="mobile-brand-header">
                    <div className="mobile-brand-header-content">
                        {logoState !== 'emoji' ? (
                            <img
                                src={logoSrc}
                                alt="ContaLivre"
                                className="mobile-brand-logo"
                                onError={handleLogoError}
                            />
                        ) : (
                            <span className="mobile-brand-emoji">📚</span>
                        )}
                        <div className="mobile-brand-text">
                            <span className="mobile-brand-name">ContaLivre</span>
                            <span className="mobile-brand-tagline">Tu asistente contable</span>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
