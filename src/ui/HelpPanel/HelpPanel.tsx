import { useState, type ReactNode } from 'react'

interface Props {
    title?: string
    children: ReactNode
    defaultOpen?: boolean
}

export default function HelpPanel({
    title = '¿Qué significa esto?',
    children,
    defaultOpen = false,
}: Props) {
    const [isOpen, setIsOpen] = useState(defaultOpen)

    return (
        <div className="help-panel">
            <div
                className="help-panel-header"
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)}
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
            >
                <span>💡 {title}</span>
                <span>{isOpen ? '▼' : '▶'}</span>
            </div>
            {isOpen && <div className="help-panel-content">{children}</div>}
        </div>
    )
}
