import { type CSSProperties, type ReactNode } from 'react'

interface TextShimmerProps {
    children: ReactNode
    as?: keyof JSX.IntrinsicElements
    className?: string
    duration?: number
    spread?: number
}

/**
 * Animated shimmer text effect (ReactBits-inspired, local copy).
 * Uses CSS background-clip: text + gradient animation.
 */
export default function TextShimmer({
    children,
    as: Tag = 'span',
    className = '',
    duration = 2,
    spread = 2,
}: TextShimmerProps) {
    const style: CSSProperties = {
        '--shimmer-spread': spread,
        '--shimmer-duration': `${duration}s`,
        backgroundImage:
            'linear-gradient(90deg, currentColor 40%, rgba(99,102,241,0.7) 50%, currentColor 60%)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        animation: `textShimmer var(--shimmer-duration) ease-in-out infinite`,
    } as CSSProperties

    return (
        <>
            <style>{`
                @keyframes textShimmer {
                    0% { background-position: 100% 50%; }
                    100% { background-position: -100% 50%; }
                }
            `}</style>
            <Tag className={className} style={style}>
                {children}
            </Tag>
        </>
    )
}
