/**
 * Estilos de la vista de Preparación del EFE (Fase 2G §12, §23). Sobrios,
 * espaciosos y legibles; matriz con scroll horizontal intencional en escritorio
 * y tarjetas en móvil. Adaptado a claro/oscuro con currentColor y variables.
 */

export const preparacionStyles = `
.prep-root { --prep-line: rgba(120,130,150,.22); --prep-bg-soft: rgba(120,130,150,.06); --prep-ok: #17845a; --prep-bad: #c0392b; --prep-accent: #2d6cdf; color: inherit; }
.prep-header { margin-bottom: 14px; }
.prep-h3 { font-size: 1.05rem; font-weight: 700; margin: 0 0 2px; }
.prep-lead { margin: 0 0 12px; opacity: .75; font-size: .86rem; max-width: 60ch; }
.prep-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.prep-step { display: flex; gap: 10px; align-items: flex-start; background: var(--prep-bg-soft); border: 1px solid var(--prep-line); border-radius: 10px; padding: 10px 12px; }
.prep-step-n { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 50%; background: var(--prep-accent); color: #fff; display: grid; place-items: center; font-weight: 700; font-size: .8rem; }
.prep-step-body { display: flex; flex-direction: column; gap: 2px; font-size: .82rem; }
.prep-step-body strong { font-size: .84rem; }
.prep-step-body span { opacity: .72; }

.prep-bridge { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.prep-bridge-item { display: flex; flex-direction: column; gap: 2px; padding: 8px 14px; border: 1px solid var(--prep-line); border-radius: 10px; min-width: 120px; }
.prep-bridge-item span { font-size: .72rem; opacity: .7; }
.prep-bridge-item strong { font-variant-numeric: tabular-nums; }
.prep-bridge-item.is-var { background: var(--prep-bg-soft); }
.prep-bridge-item.is-adj { border-style: dashed; }

.prep-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.prep-control-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; font-size: .78rem; border: 1px solid var(--prep-line); }
.prep-control-chip.is-ok { color: var(--prep-ok); border-color: color-mix(in srgb, var(--prep-ok) 40%, transparent); }
.prep-control-chip.is-bad { color: var(--prep-bad); border-color: color-mix(in srgb, var(--prep-bad) 45%, transparent); font-weight: 600; }
.prep-control-icon { font-weight: 700; }
.prep-control-value { font-variant-numeric: tabular-nums; opacity: .8; }

.prep-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 8px 0; }
.prep-search, .prep-select { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--prep-line); background: transparent; color: inherit; font-size: .82rem; }
.prep-check { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; opacity: .85; }
.prep-legend { font-size: .76rem; opacity: .75; margin: 4px 0 10px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.prep-badge { font-size: .68rem; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--prep-line); }
.prep-badge.is-origin { color: var(--prep-ok); border-color: color-mix(in srgb, var(--prep-ok) 40%, transparent); }
.prep-badge.is-app { color: var(--prep-bad); border-color: color-mix(in srgb, var(--prep-bad) 40%, transparent); }

.prep-table-wrap { overflow-x: auto; border: 1px solid var(--prep-line); border-radius: 12px; box-shadow: inset -10px 0 8px -10px rgba(0,0,0,.25); }
.prep-table { border-collapse: collapse; width: 100%; min-width: 720px; font-size: .82rem; }
.prep-table th, .prep-table td { padding: 8px 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--prep-line); }
.prep-table thead th { position: sticky; top: 0; background: var(--prep-bg-soft); font-weight: 600; font-size: .74rem; text-transform: uppercase; letter-spacing: .02em; z-index: 2; }
.prep-sticky-col { position: sticky; left: 0; text-align: left !important; background: var(--prep-bg-soft); z-index: 1; }
.prep-table thead .prep-sticky-col { z-index: 3; }
.prep-num { font-variant-numeric: tabular-nums; }
.prep-oa { text-align: center; font-size: .74rem; opacity: .8; }
.prep-imp { color: var(--prep-accent); }
.prep-table td.is-ok, .prep-control-value.is-ok { color: var(--prep-ok); }
.prep-table td.is-bad { color: var(--prep-bad); font-weight: 700; }
.prep-table tbody tr.is-blocked { background: color-mix(in srgb, var(--prep-bad) 8%, transparent); }
.prep-table tfoot th, .prep-table tfoot td { font-weight: 700; border-top: 2px solid var(--prep-line); background: var(--prep-bg-soft); }
.prep-cell-btn { background: none; border: none; color: inherit; font: inherit; cursor: pointer; padding: 0; text-align: inherit; text-decoration: underline dotted transparent; }
.prep-cell-btn:hover, .prep-cell-btn:focus-visible { text-decoration-color: currentColor; outline: 2px solid transparent; }
.prep-cell-btn:focus-visible { outline: 2px solid var(--prep-accent); outline-offset: 2px; border-radius: 3px; }

.prep-cards { display: none; }
.prep-card { display: block; width: 100%; text-align: left; border: 1px solid var(--prep-line); border-radius: 12px; padding: 12px; margin-bottom: 10px; background: transparent; color: inherit; cursor: pointer; }
.prep-card.is-blocked { border-color: color-mix(in srgb, var(--prep-bad) 45%, transparent); }
.prep-card-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 8px; }
.prep-card-name { font-weight: 600; font-size: .86rem; }
.prep-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin: 0; }
.prep-card-grid div { display: flex; justify-content: space-between; gap: 8px; }
.prep-card-grid dt { opacity: .65; font-size: .76rem; }
.prep-card-grid dd { margin: 0; font-variant-numeric: tabular-nums; font-size: .82rem; }
.prep-card-grid dd.is-ok { color: var(--prep-ok); }
.prep-card-grid dd.is-bad { color: var(--prep-bad); font-weight: 700; }

.prep-bridges { margin-top: 16px; }
.prep-h4 { font-size: .9rem; font-weight: 700; margin: 0 0 8px; }
.prep-bridge-row { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid var(--prep-line); }
.prep-bridge-row.is-bad { color: var(--prep-bad); }
.prep-bridge-label { font-size: .82rem; font-weight: 600; min-width: 220px; }
.prep-bridge-residual { color: var(--prep-bad); font-size: .76rem; }
.prep-mono { font-family: ui-monospace, "Cascadia Code", Menlo, Consolas, monospace; font-size: .8rem; font-variant-numeric: tabular-nums; }

.prep-detail-backdrop { position: fixed; inset: 0; background: rgba(10,15,25,.5); display: grid; place-items: center; z-index: 60; padding: 16px; }
.prep-detail { background: var(--card, #fff); color: inherit; border: 1px solid var(--prep-line); border-radius: 14px; max-width: 480px; width: 100%; max-height: 90vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
@media (prefers-color-scheme: dark) { .prep-detail { background: #1b2130; } }
:root[data-theme="dark"] .prep-detail { background: #1b2130; }
:root[data-theme="light"] .prep-detail { background: #fff; }
.prep-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--prep-line); }
.prep-detail-title { font-weight: 700; }
.prep-detail-sub { font-size: .78rem; opacity: .7; margin-top: 2px; }
.prep-detail-close { background: none; border: 1px solid var(--prep-line); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; color: inherit; }
.prep-detail-grid { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px 14px; margin: 0; padding: 16px; }
.prep-detail-grid dt { opacity: .65; font-size: .78rem; }
.prep-detail-grid dd { margin: 0; font-size: .84rem; }

@media (max-width: 640px) {
  .prep-table-wrap { display: none; }
  .prep-cards { display: block; }
  .prep-steps { grid-template-columns: 1fr; }
}
`
