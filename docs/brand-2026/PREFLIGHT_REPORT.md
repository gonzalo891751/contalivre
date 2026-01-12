# Preflight Audit Report: 2026 Brand System Migration

**Date:** 2026-01-12
**Target System:** ContaLivre (Vite + React + TS)
**Objective:** Migrate UI to 2026 Brand System without altering business logic.

---

## 1. Technical Configuration Audit

### A. React Entrypoint & Global CSS
- **Entrypoint:** `src/main.tsx`
- **Import Line:** Line 5: `import './styles/index.css'`
- **Status:** ✅ Correctly identified. No other global CSS files found in `src`.

### B. Tailwind CSS Configuration
- **Config File:** `d:\Git\ContaLivre\tailwind.config.js`
- **Content Globs:** `["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]` (✅ Covers all source files)
- **Plugins:** `tailwindcss-animate` (✅ Present)
- **Preflight:** `corePlugins: { preflight: false }` (✅ Explicitly disabled as required)
- **PostCSS:** `d:\Git\ContaLivre\postcss.config.js` uses `@tailwindcss/postcss` and `autoprefixer` (✅ Correctly wired)

### C. Style Source (`src/styles/index.css`)
- **Tailwind Import:** Line 4: `@import "tailwindcss";` (✅ Present)
- **Custom Reset:** Lines 109-132 (✅ Handles basic reset since preflight is false)

---

## 2. Style Architecture & Layers (Current `src/styles/index.css`)

The current stylesheet is a monolithic entry containing all layers.

1.  **Tokens / Variables** (`:root`): Colors (Brand, Semantic, Account Types), Typescale, Spacing, Radius, Shadows.
2.  **Reset**: Box-sizing, body defaults.
3.  **Typography**: Heading levels (`h1`-`h6`), Links.
4.  **Layout**: Sidebar, collapsed states, main content area, page headers.
5.  **Components**:
    - **Cards**: `.card`, `.card-header`
    - **Forms**: `.form-group`, `.form-input` (and variants)
    - **Buttons**: `.btn` (primary, secondary, success, danger)
    - **Tables**: `.table`, `.table-container`
    - **Badges**: `.badge` (semantic variants)
    - **Alerts**: `.alert` (semantic variants)
    - **Stats Cards**: `.stat-card`
    - **Entry Editor**: Specific complex component styles.

---

## 3. Risks & Gotchas

1.  **Preflight Disabled:**
    - **Risk:** Removing manual resets in `index.css` could break layout defaults (margins, box-sizing) since Tailwind's preflight is off.
    - **Mitigation:** Ensure the new Token/Global phase specifically reimplements the necessary resets currently in lines 109-132.
2.  **Hardcoded Values:**
    - Many components use CSS variables, but some might have hardcoded overrides inline or in specific class definitions.
3.  **Monolithic CSS:**
    - `index.css` is large (~4000+ lines implied by scroll bar/size). Migrating piece-by-piece requires careful "surgery" to replace sections without breaking dependent styles lower down. Use `/* @layer base */` or similar comments to structure future CSS if keeping it in one file.

---

## 4. Migration Plan

**Strategy:** Incremental "In-Place" Migration.
**Order:** Bottom-up (Tokens -> Base -> Components -> Layout).

### Phase 1: 2026 Tokens & Bridge Mapping
**Goal:** Update color palette and typography tokens to 2026 values.
**Files:** `src/styles/index.css`
**Actions:**
- Replace `:root` variables with 2026 values.
- Create "Bridge Variables" if 2026 names differ (e.g., map `--new-primary` to `--color-primary`) to keep existing components working.
- **Verification:** App should look different (colors/fonts) but layout must remain broken.

### Phase 2: Typography & Base
**Goal:** Implement 2026 Typescale.
**Files:** `src/styles/index.css`
**Actions:**
- Update `body`, `h1-h6` styles.
- Ensure font families (Inter/Outfit/JetBrains Mono) are imported/declared.
- **Verification:** Headers and text alignment match 2026 spec.

### Phase 3: Core Components
**Goal:** Update Buttons, Inputs, Cards, Badges.
**Files:** `src/styles/index.css`
**Actions:**
- **Refactor:** `.btn`, `.form-input`, `.card`, `.badge`.
- **Focus Rings:** Implement unified focus ring strategy.
- **Verification:** Check visual regression on common UI elements.

### Phase 4: Data Tables
**Goal:** Polish tabular data presentation.
**Files:** `src/styles/index.css`
**Actions:**
- Update `.table` styles (headers, row spacing, hover states).
- specific formatting for accounting numbers.

### Phase 5: Shell & Layout
**Goal:** Update Sidebar and Mobile Shell.
**Files:** `src/styles/index.css`, (Optional: `Sidebar.tsx` if class changes needed).
**Actions:**
- Update `.sidebar`, `.layout`, `.mobile-nav`.
- **Verification:** Responsive behavior check.

### Phase 6: Cleanup
**Goal:** Remove legacy variables and dead code.
**Actions:**
- Remove mappings created in Phase 1.
- Consolidate duplicate styles.

---

## 5. Acceptance Checks (Quick UI Verification)

1.  **Build Check:** `npm run build` passes.
2.  **Visual Check:**
    - Home/Dashboard: Check Background gradient and Sidebar colors.
    - Components: Hover over a "Primary Button" -> check hover state.
    - Typography: Check `H1` font family (should usually change from Nunito to Inter/Outfit).

---

## 6. Proposed Phase 1 Prompt

```text
Subject: Execute Phase 1 - Tokens & Bridge Mapping

Context:
We are migrating to the 2026 Brand System. Current CSS is in src/styles/index.css.

Task:
1. Update the :root CSS variables in src/styles/index.css to match the 2026 Brand System (Colors, Spacing, Typography constants).
2. Maintain backward compatibility:
   - If a variable name changes (e.g. --brand-blue -> --primary-500), keep the OLD variable definition but set its value to var(--primary-500).
3. Do NOT change component class definitions yet.

Deliverable:
- Updated src/styles/index.css with new :root block.
- Confirmation that no class logic was touched.
```
