import type { ReactNode } from 'react'

interface CleanLayoutProps {
    children: ReactNode
    withShell?: boolean
}

export default function CleanLayout({ children, withShell = false }: CleanLayoutProps) {
    const rootClassName = withShell
        ? 'cl-shell min-h-screen text-slate-900 font-body'
        : 'min-h-screen bg-slate-50 text-slate-900 font-body'

    return <div className={rootClassName}>{children}</div>
}
