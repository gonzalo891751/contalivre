export default function CleanPrototype() {
    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-12">
            <header className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                    Clean Mode
                </p>
                <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
                    Prototype Playground
                </h1>
                <p className="max-w-2xl text-base leading-relaxed text-slate-850">
                    Esta vista usa Tailwind puro (sin cl-ui ni cl-prose) para verificar que los
                    tokens y utilidades coinciden 1:1 con los prototipos.
                </p>
            </header>

            <section className="flex flex-wrap items-center gap-4">
                <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-gradient-hover"
                >
                    Activar Demo
                </button>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-widest text-slate-500 shadow-glow">
                    Tailwind Tokens
                </span>
            </section>

            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Segmented Control</h2>
                <div className="inline-flex rounded-full bg-slate-100 p-1 shadow-soft">
                    <button
                        type="button"
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-soft"
                    >
                        Balance
                    </button>
                    <button
                        type="button"
                        className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
                    >
                        Flujo
                    </button>
                    <button
                        type="button"
                        className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
                    >
                        Rendimiento
                    </button>
                </div>
            </section>
        </div>
    )
}
