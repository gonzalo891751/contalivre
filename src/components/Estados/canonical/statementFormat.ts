/**
 * Formato y estilos compartidos de los presentadores de estados (Fase 2D, §1).
 * Sin JSX: solo helpers puros y la hoja de estilos recuperada del diseño
 * anterior (prefijo `stmt-`). Vive aparte de los componentes para no romper el
 * fast-refresh y para que el CSS se comparta entre pestañas.
 */

export type StatementAccent = 'green' | 'red' | 'blue' | 'violet'

export const ACCENT_COLOR: Record<StatementAccent, string> = {
    green: '#10B981',
    red: '#ef4444',
    blue: '#3B82F6',
    violet: '#8b5cf6',
}

/** Formato monetario canónico (los importes ya son moneda del reporte) */
export function money(n: number | null | undefined): string {
    if (n == null) return '—'
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface Delta {
    text: string
    tone: 'positive' | 'negative' | 'neutral'
}

export function computeDelta(current: number, prev: number | null | undefined): Delta | null {
    if (prev == null) return null
    if (prev === 0) return current === 0 ? null : { text: '—', tone: 'neutral' }
    const diff = ((current - prev) / Math.abs(prev)) * 100
    if (!isFinite(diff)) return { text: '—', tone: 'neutral' }
    const sign = diff > 0 ? '+' : ''
    return {
        text: `${sign}${diff.toFixed(1)}%`,
        tone: diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral',
    }
}

// ─────────────────────────────────────────────────────────────
// Estilos (recuperados del diseño ESP V2, prefijo `stmt-`)
// ─────────────────────────────────────────────────────────────
export const statementStyles = `
.stmt-grid { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
@media (min-width: 1024px) { .stmt-grid.two-col { grid-template-columns: 1fr 1fr; } }

.stmt-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    border: 1px solid #e2e8f0;
    overflow: hidden;
    margin-bottom: 20px;
}
.stmt-card-header {
    padding: 18px 20px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    background: rgba(248,250,252,0.8);
}
.stmt-card-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}
.stmt-card-total-wrap { display: flex; flex-direction: column; align-items: flex-end; }
.stmt-card-total {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-weight: 700;
    font-size: 1.1rem;
    color: #0f172a;
    font-variant-numeric: tabular-nums;
}
.stmt-card-total-prev { font-size: 0.78rem; color: #94a3b8; font-variant-numeric: tabular-nums; }
.stmt-card-body { padding: 10px; }

.stmt-rows { display: flex; flex-direction: column; gap: 3px; }

.stmt-column-headers {
    display: none;
    padding: 6px 12px;
    border-bottom: 1px dashed #e2e8f0;
    margin-bottom: 4px;
}
@media (min-width: 1024px) {
    .stmt-column-headers { display: grid; grid-template-columns: 1fr 150px 150px 96px; gap: 12px; }
}
.stmt-column-headers > div {
    font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;
}
.stmt-col-right { text-align: right; }
.stmt-col-center { text-align: center; }

.stmt-rubro-row, .stmt-total-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 11px 12px; border-radius: 8px; border: 1px solid transparent;
    transition: background 0.15s ease, border-color 0.15s ease;
}
.stmt-rubro-row.has-detail { cursor: pointer; }
.stmt-rubro-row.has-detail:hover { background: #f8fafc; border-color: #f1f5f9; }
.stmt-rubro-row.has-detail:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }

.stmt-total-row {
    border-top: 2px solid #e2e8f0;
    border-radius: 0;
    margin-top: 4px;
    font-weight: 700;
}
.stmt-total-label { font-weight: 700; color: #0f172a; }

.stmt-rubro-label { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.stmt-caret { color: #3B82F6; opacity: 0; transition: opacity 0.15s ease, transform 0.15s ease; flex-shrink: 0; }
.stmt-rubro-row.has-detail:hover .stmt-caret { opacity: 1; }
.stmt-rubro-row.is-open .stmt-caret { opacity: 1; transform: rotate(90deg); }
.stmt-caret-spacer { display: inline-block; width: 14px; flex-shrink: 0; }
.stmt-trace { display: inline-block; width: 14px; text-align: center; color: #cbd5e1; font-size: 0.8rem; flex-shrink: 0; transition: color 0.15s ease; }
.stmt-rubro-row.has-detail:hover .stmt-trace { color: #3B82F6; }
.stmt-rubro-name {
    font-weight: 500; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    transition: color 0.15s ease;
}
.stmt-rubro-row.has-detail:hover .stmt-rubro-name { color: #3B82F6; }
.stmt-note-badge {
    font-size: 0.62rem; font-weight: 700; background: #f1f5f9; color: #64748b;
    padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0; flex-shrink: 0; margin-left: 6px;
}
.stmt-note-badge.is-link { cursor: pointer; color: #2563eb; background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.25); }
.stmt-note-badge.is-link:hover { background: rgba(59,130,246,0.16); }
.stmt-note-badge.is-link:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }

.stmt-amount {
    font-family: var(--font-mono, 'JetBrains Mono', ui-monospace, monospace);
    font-variant-numeric: tabular-nums; color: #0f172a; font-weight: 600; white-space: nowrap;
}
.stmt-amount-prev { color: #94a3b8; font-weight: 500; }
.stmt-rubro-single { flex-shrink: 0; }

.stmt-rubro-values { display: flex; flex-direction: column; gap: 2px; text-align: right; }
@media (min-width: 1024px) {
    .stmt-rubro-values { display: grid; grid-template-columns: 150px 150px 96px; gap: 12px; align-items: center; }
}
.stmt-value-cell { display: flex; flex-direction: column; text-align: right; }
@media (min-width: 1024px) { .stmt-value-cell { display: block; } }
.stmt-mobile-label { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; color: #94a3b8; }
@media (min-width: 1024px) { .stmt-mobile-label { display: none; } }
.stmt-delta-cell { text-align: center; }
@media (min-width: 1024px) { .stmt-delta-cell { display: flex; justify-content: center; } }

.stmt-delta-pill {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 9999px;
    font-variant-numeric: tabular-nums;
}
.stmt-delta-pill.positive { background: rgba(16,185,129,0.12); color: #059669; }
.stmt-delta-pill.negative { background: rgba(239,68,68,0.12); color: #dc2626; }
.stmt-delta-pill.neutral { background: #f1f5f9; color: #64748b; }

.stmt-account-list { padding: 2px 0 6px; display: flex; flex-direction: column; gap: 1px; }
.stmt-account-row {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 6px 12px 6px 30px; border-radius: 6px; font-size: 0.84rem;
}
.stmt-account-row.is-clickable { cursor: pointer; }
.stmt-account-row.is-clickable:hover { background: #f8fafc; }
.stmt-account-row.is-clickable:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; }
.stmt-account-name { color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stmt-account-values { display: grid; grid-template-columns: 150px 150px 96px; gap: 12px; text-align: right; }
@media (max-width: 1023px) {
    .stmt-account-values { display: flex; flex-direction: column; gap: 1px; grid-template-columns: none; }
}
.stmt-account-row .stmt-amount { font-weight: 500; font-size: 0.84rem; }
`
