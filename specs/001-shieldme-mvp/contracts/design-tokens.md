# Contract — Design Tokens

**Status:** binding · **Updated:** 2026-05-09 · **Constitution:** §XIV Design System Discipline

The single source of truth for color, typography, spacing, radii, motion, and elevation. Every component CSS file consumes these via CSS custom properties; raw hex literals and pixel values are forbidden in component CSS (enforced by the ESLint rule `no-raw-color-tokens` and the stylelint rule `no-magic-pixels`).

The aesthetic reference is the [MOTA platform](https://mota-platform.webflow.io/) — geometric, restrained, stability-oriented — adapted for a privacy/trust product. **The hex codes in §3 are inferred from MOTA's described aesthetic; replace with the actual MOTA values once extracted from its compiled CSS, or override with ShieldMe-specific decisions.**

---

## 1. Token taxonomy

We use a two-tier token system:

- **Reference tokens** (raw values): `--color-slate-900`, `--font-display-700`. Defined once in `src/ui/tokens/`.
- **Semantic tokens** (purpose-named): `--surface-base`, `--text-primary`, `--severity-critical`. Components consume *only* semantic tokens; reference tokens never appear in component CSS.

Why two tiers: theming (light/dark) swaps semantic mappings without touching reference values; components don't change when we change palette.

## 2. File layout

```
src/ui/tokens/
├── reference/
│   ├── colors.css         # raw palette
│   ├── typography.css     # raw type scale + font-family declarations
│   ├── space.css          # raw spacing scale
│   └── motion.css         # raw timing + easings
├── semantic/
│   ├── light.css          # semantic ↔ reference for light theme
│   ├── dark.css           # semantic ↔ reference for dark theme
│   └── shared.css         # tokens that don't change between themes
├── reset.css              # opinionated reset (CSS Modules-friendly)
└── index.css              # imports the rest
```

`index.css` is the only file the popup, options, and content-script entry CSS imports.

## 3. Color — reference (light)

> **Inferred from MOTA aesthetic. Confirm with actual MOTA palette or override.**

Palette is restrained: 1 brand hue (deep teal — "trust + security"), 1 accent (warm amber — "find / discover"), 1 neutral scale (slate), 4 semantic states.

```css
/* src/ui/tokens/reference/colors.css */
:root {
  /* Brand */
  --color-brand-50:  #ECF6F4;
  --color-brand-100: #D4ECE6;
  --color-brand-300: #6FBDB1;
  --color-brand-500: #1F8C7C;   /* primary brand teal */
  --color-brand-700: #0F5F55;
  --color-brand-900: #053E37;

  /* Accent (used sparingly — CTAs, "find" badges) */
  --color-accent-300: #F5C97D;
  --color-accent-500: #E5A43B;
  --color-accent-700: #B07720;

  /* Neutrals (slate) — 9 stops, used for text + surfaces */
  --color-slate-25:  #FBFCFD;
  --color-slate-50:  #F4F6F8;
  --color-slate-100: #E6EAEE;
  --color-slate-200: #C9D2DA;
  --color-slate-300: #9DAAB6;
  --color-slate-500: #5C6873;
  --color-slate-700: #2E3640;
  --color-slate-800: #1B2129;
  --color-slate-900: #0E1217;

  /* Severity (consumer-friendly names — never "regex", never regulation) */
  --color-critical-500: #C8362F;
  --color-critical-700: #8A1F1A;
  --color-warning-500:  #D4862C;
  --color-warning-700:  #94591A;
  --color-info-500:     #1F8C7C;   /* shares brand teal */
  --color-success-500:  #2E8F4D;
}
```

## 4. Color — semantic mapping

```css
/* src/ui/tokens/semantic/light.css */
:root[data-theme="light"], :root:not([data-theme]) {
  /* Surfaces */
  --surface-canvas:   var(--color-slate-25);   /* page background */
  --surface-base:     #FFFFFF;                 /* card background */
  --surface-raised:   #FFFFFF;                 /* elevated card */
  --surface-sunken:   var(--color-slate-50);   /* input background */

  /* Text */
  --text-primary:     var(--color-slate-900);
  --text-secondary:   var(--color-slate-700);
  --text-muted:       var(--color-slate-500);
  --text-on-brand:    #FFFFFF;
  --text-link:        var(--color-brand-700);

  /* Borders */
  --border-subtle:    var(--color-slate-100);
  --border-default:   var(--color-slate-200);
  --border-strong:    var(--color-slate-300);

  /* Brand surfaces */
  --brand-surface:    var(--color-brand-500);
  --brand-surface-hover: var(--color-brand-700);
  --brand-tint:       var(--color-brand-50);
  --brand-text:       var(--color-brand-700);

  /* Severity surfaces (used in finding cards, banners) */
  --severity-critical-bg:    #FBE9E7;
  --severity-critical-fg:    var(--color-critical-700);
  --severity-warning-bg:     #FCF1E0;
  --severity-warning-fg:     var(--color-warning-700);
  --severity-info-bg:        var(--color-brand-50);
  --severity-info-fg:        var(--color-brand-700);
  --severity-success-bg:     #E8F4EC;
  --severity-success-fg:     #1E6A36;

  /* Focus ring */
  --focus-ring:       0 0 0 3px color-mix(in oklch, var(--color-brand-500) 40%, transparent);
}
```

```css
/* src/ui/tokens/semantic/dark.css */
:root[data-theme="dark"] {
  --surface-canvas:   var(--color-slate-900);
  --surface-base:     var(--color-slate-800);
  --surface-raised:   #232A33;
  --surface-sunken:   #131820;

  --text-primary:     var(--color-slate-50);
  --text-secondary:   var(--color-slate-200);
  --text-muted:       var(--color-slate-300);
  --text-on-brand:    #FFFFFF;
  --text-link:        var(--color-brand-300);

  --border-subtle:    #1F262E;
  --border-default:   #2A323C;
  --border-strong:    var(--color-slate-700);

  --brand-surface:    var(--color-brand-500);
  --brand-surface-hover: var(--color-brand-300);
  --brand-tint:       #0A1F1C;
  --brand-text:       var(--color-brand-300);

  --severity-critical-bg:    #2C1714;
  --severity-critical-fg:    #F2A09A;
  --severity-warning-bg:     #2B1F0F;
  --severity-warning-fg:     #F0BE7A;
  --severity-info-bg:        var(--color-brand-900);
  --severity-info-fg:        var(--color-brand-300);
  --severity-success-bg:     #0F2616;
  --severity-success-fg:     #7BC68F;

  --focus-ring:       0 0 0 3px color-mix(in oklch, var(--color-brand-300) 60%, transparent);
}
```

System preference is followed by default; user override in Settings → Theme persists in `Prefs.theme`.

## 5. Typography

**Display (headings, CTAs, score numerals):** **Manrope** (variable), weights 500 / 600 / 700 / 800.
**Body (everything else):** **Inter** (variable), weights 400 / 500 / 600.

**Why Manrope:** geometric, gently rounded terminals (closest free analogue to MOTA's THICCCBOI without licensing tax), full Greek glyph coverage (required for `el` locale per NFR-I1), variable font (single WOFF2 file covers all weights ~80 KB subset). License: SIL Open Font License 1.1 — commercial use unrestricted.

**Why Inter:** the de-facto modern UI grotesque, full Greek, variable, excellent at 13–16px which is where 80% of ShieldMe's body copy lives. License: SIL Open Font License 1.1.

```css
/* src/ui/tokens/reference/typography.css */
:root {
  --font-display: "Manrope Variable", "Manrope", system-ui, sans-serif;
  --font-body:    "Inter Variable", "Inter", system-ui, -apple-system, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;

  /* Type scale — modular, ratio 1.2 */
  --fs-xs:   12px;
  --fs-sm:   13px;
  --fs-md:   14px;   /* body default */
  --fs-lg:   16px;
  --fs-xl:   18px;
  --fs-2xl:  22px;
  --fs-3xl:  28px;
  --fs-4xl:  36px;   /* exposure score numeral */

  --lh-tight: 1.15;
  --lh-snug:  1.3;
  --lh-base:  1.5;
  --lh-loose: 1.65;

  --tracking-tight: -0.01em;
  --tracking-base:  0;
  --tracking-wide:  0.02em;
}
```

**Font loading:** both families are bundled (subset to Latin + Greek + numerals + a small punctuation set per `_locales/` requirements). No `@import` from CDN. Loaded via `@font-face` with `font-display: swap`.

## 6. Spacing

```css
/* src/ui/tokens/reference/space.css */
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
}
```

Components use `--space-*` exclusively. Raw `4px`, `8px`, etc. in component CSS fail the stylelint check.

## 7. Radii

```css
:root {
  --radius-1: 4px;
  --radius-2: 8px;
  --radius-3: 12px;
  --radius-pill: 999px;
}
```

## 8. Elevation

Three steps; flat by default (the MOTA aesthetic is geometric, not heavily shadowed).

```css
:root {
  --elevation-0: none;
  --elevation-1: 0 1px 2px rgba(14,18,23,0.06), 0 1px 1px rgba(14,18,23,0.04);
  --elevation-2: 0 4px 12px rgba(14,18,23,0.08), 0 2px 4px rgba(14,18,23,0.04);
  --elevation-3: 0 12px 32px rgba(14,18,23,0.12), 0 4px 8px rgba(14,18,23,0.06);
}
```

Dark theme overrides shadow rgba to white for inverse depth.

## 9. Motion

```css
:root {
  --duration-1: 80ms;
  --duration-2: 160ms;
  --duration-3: 240ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --easing-emphasized: cubic-bezier(0.3, 0, 0.05, 1);
}
```

Respect `prefers-reduced-motion` — every animation guarded.

## 10. Component conventions

- One CSS Module per component, co-located with the `.tsx`.
- Module imports tokens via the global stylesheet (`src/ui/tokens/index.css`); no per-component `@import` of token files.
- Class names: `.{component}__{element}--{modifier}` BEM-ish.
- No inline styles for color, spacing, type. Inline allowed only for dynamic geometry (transform, opacity).
- Severity color usage maps: `critical` → only for confirmed PII Critical findings; `warning` → confidence 0.5–0.7 findings; `info` → tooltips, helper text; `success` → "no findings" + applied-preset confirmations.

## 11. Accessibility

- Body text contrast ≥4.5:1 against `--surface-base` in both themes. Asserted in CI by an axe-core check.
- Focus ring is always visible; never removed. `--focus-ring` is the only focus style.
- All interactive elements ≥44 × 44 px hit target on mobile sizes (popup is desktop-targeted but options page is responsive).
- Severity is never communicated by color alone; pair every severity color with an icon and a textual label.

## 12. Enforcement

- ESLint rule `no-raw-color-tokens`: bans hex literals + named CSS colors in `*.module.css`.
- Stylelint rule `no-magic-pixels`: bans pixel literals other than `0`, `1px` (border), and `100%`.
- CI step `pnpm lint:tokens` runs both.
- Visual regression test (Playwright + image diff) on the popup root scene captures unintended palette drift.

## 13. What this replaces

The `src/ui/tokens/` placeholder created during M0 bootstrap (Claude Code Prompt B) is replaced by this contract's structure. The placeholder was three CSS variables; this is the production system.

## 14. Open items

- Replace inferred hex values in §3 with actual MOTA palette extracted from its compiled CSS once Bill provides screenshots / a CSS dump, **or** confirm the inferred values are acceptable.
- Decide whether to commission an exclusive ShieldMe wordmark/logo (Outcrowd-style work, ~€800–€1500) or use a typographic mark in Manrope 800 — current default is the typographic mark to ship clean at v1.0.
