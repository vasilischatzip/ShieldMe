# Contract — UI Components

**Status:** binding · **Updated:** 2026-05-12 · **Constitution:** §XIV Design System Discipline

Defines the hand-built component library, the libraries it composes, the motion vocabulary, and the per-component API surface. Companion to [`design-tokens.md`](./design-tokens.md). Every asset declared here is **free for commercial use** under SIL-OFL, MIT, ISC, BSD-2/3, or Apache-2.0.

---

## 1. Library stack (binding)

| Concern | Library | License | Why |
|---|---|---|---|
| Positioning (popovers, menus, tooltips) | **Floating UI / DOM** v1+ | MIT | Framework-agnostic, ~6 KB, the only popover-positioning library Preact-compatible without React shims |
| Icons | **Lucide** | ISC | 1400+ icons, tree-shakeable to ~15 KB total in our use, the closest free analogue to Heroicons |
| Animation | **Motion One** | MIT | ~3 KB, Web Animations API native, no React dep, spring physics included |
| Date formatting | **date-fns** | MIT | Tree-shakeable to ~5 KB for our use; per-locale imports |
| Fuzzy matching (rule search) | **fuse.js** | Apache-2.0 | ~5 KB, fast enough for the rules/detector catalog |
| Z-index management | **inline constants** in tokens | n/a | No library; a 5-tier z-index scale in `--z-*` |
| Form validation | **valibot** | MIT | Schema-first, ~3 KB, smaller than zod |
| Toast / notification | **hand-built** on Motion One | — | One file, ~80 LoC; no library justifies adding |
| Tabs / accordions / dialogs | **hand-built** on Floating UI + WAI-ARIA spec | — | Preact-native, ~50 LoC each |

**Explicitly rejected:** Headless UI (React-only), Radix UI (React-only), shadcn/ui (React-only), Material UI (bundle weight), Mantine (React-only), Bootstrap (jQuery-era), Tailwind (R23), DaisyUI (Tailwind-dep), Heroicons (license OK but Lucide has wider coverage).

## 2. Component inventory

15 components ship with v1.0. Each lives in `src/ui/components/<ComponentName>/` with `index.tsx`, `<ComponentName>.module.css`, `<ComponentName>.spec.tsx`, `<ComponentName>.stories.tsx` (Storybook).

| # | Component | Purpose |
|---|---|---|
| 1 | `Button` | Primary, secondary, ghost, destructive, link variants. Loading + disabled states. |
| 2 | `IconButton` | Square button with one Lucide icon; aria-label required. |
| 3 | `TextField` | Single-line text input with label, hint, error, prefix/suffix slot. |
| 4 | `Textarea` | Multi-line text input. |
| 5 | `Select` | Floating UI dropdown; keyboard-navigable; supports search for >10 items. |
| 6 | `Toggle` | iOS-style switch; aria-checked. |
| 7 | `Checkbox` | Tri-state (off / on / indeterminate). |
| 8 | `Radio` & `RadioGroup` | Standard form pattern. |
| 9 | `Card` | Surface container with optional header, footer, and severity tint variant (uses `--severity-*-bg`/`-fg` tokens). |
| 10 | `Badge` | Severity badge or count badge; small / medium sizes. |
| 11 | `Dialog` | Modal with focus trap, escape-to-close, backdrop click; built on `<dialog>` element + Floating UI for positioning of dialog-nested popovers. |
| 12 | `Tooltip` | Floating UI tooltip with 300 ms delay; touch-friendly long-press alternative. |
| 13 | `Tabs` | WAI-ARIA tabs pattern; horizontal + vertical. |
| 14 | `Toast` | Bottom-right stack, auto-dismiss 4 s, manual dismiss; max 3 visible. |
| 15 | `Progress` | Linear bar + circular variant; indeterminate state. |

**Specialized (module-scoped, not in the shared library):**

| Component | Module | Purpose |
|---|---|---|
| `ExposureScore` | dashboard | The 0–100 score numeral with severity color + breakdown drawer. |
| `FindingCard` | document-check, email-guardian, cloud-audit, calendar-audit | The atomic "we found X" presentation. |
| `AccountSwitcher` | header | Multi-account dropdown for Pro tier. |
| `UpsellCard` | TierGate-driven | Contextual upgrade prompt rendered when a `check()` returns `allowed: false`. |
| `BrokerSiteRow` | exposure-radar | One row in the data broker checklist. |
| `PresetPickerCard` | onboarding | Per-preset selectable card with diff preview. |

## 3. Component API conventions

- All components are functional Preact components with TypeScript prop types.
- Props use the suffix `-` rather than `is` for boolean states (`disabled`, not `isDisabled`).
- Event handlers are `on{Event}` and receive the event object as second arg when relevant.
- Slots are children-as-functions only when necessary; default to render-prop `Headline` / `Body` / `Footer` named children.
- Every interactive component accepts `ref` forwarded to the focusable element.
- Every component exposes `aria-*` props pass-through.

## 4. Motion vocabulary

> The MOTA aesthetic is geometric + stable; movement should reinforce *certainty*, not delight. Snappy, never bouncy. Subtle, never showy.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--motion-instant` | 80 ms | `--easing-standard` | Hover, focus ring expand |
| `--motion-snap` | 160 ms | `--easing-standard` | Buttons, toggles, tab switches |
| `--motion-flow` | 240 ms | `--easing-emphasized` | Cards entering, dialogs opening, banner reveals |
| `--motion-considered` | 360 ms | `--easing-emphasized` | Onboarding step transitions, score-change spring |

**Vocabulary primitives** (Motion One pre-baked):

- `fadeIn(el, {duration: 240})` — opacity 0 → 1.
- `slideInUp(el, {distance: 8, duration: 240})` — opacity 0 → 1 + translateY 8 → 0.
- `scaleIn(el, {from: 0.96, duration: 160})` — for buttons on press.
- `scoreSpring(el, {from: oldScore, to: newScore})` — Motion One spring with stiffness 200, damping 25.
- `shake(el)` — horizontal 6-cycle ±4 px wobble, for input validation errors only.

**`prefers-reduced-motion: reduce` is honored everywhere.** Animations degrade to instant state changes.

## 5. Layout primitives

Two layout components only; otherwise CSS Grid + Flex inline.

- `Stack` — vertical or horizontal flex container with token-driven gap. `<Stack gap="space-3" direction="row">`. Replaces 90% of one-off flex boilerplate.
- `Grid` — CSS Grid wrapper with token-driven column count and gap.

## 6. Iconography rules

- Lucide icons only; one consistent stroke weight (default 1.5 px); 20 × 20 default.
- Severity icons map: `AlertOctagon` for critical, `AlertTriangle` for warning, `Info` for info, `CheckCircle2` for success.
- Module icons (used in nav): `ShieldCheck` for Rules, `FileSearch` for Document Check, `Mail` for Email Guardian, `Cloud` for Cloud Audit, `Radar` for Exposure Radar, `CalendarCheck` for Calendar Audit, `Wrench` for Privacy Toolkit.
- Never embed an icon font; always inline SVG via Lucide's tree-shaken imports.

## 7. Theming

- Default theme follows OS preference (`prefers-color-scheme`).
- User override in Settings → Theme persists in `Prefs.theme`.
- Theme switch uses `data-theme="light"` / `data-theme="dark"` on `<html>`. Tokens cascade.
- No flash-of-unstyled-content: the popup HTML reads `chrome.storage.local` synchronously via the service-worker handshake to apply the right theme before paint.

## 8. Accessibility (WCAG 2.1 AA)

- Every interactive element keyboard-navigable.
- Focus ring always visible (`--focus-ring`).
- Color contrast ≥4.5:1 body, ≥3:1 large text.
- Severity never communicated by color alone; always icon + text.
- Screen-reader-only utility class `.sr-only` for labels.
- All form fields have explicit `<label>` or `aria-label`.
- Modals trap focus and restore on close.
- Animations honor `prefers-reduced-motion`.

## 9. Storybook + visual regression

- Storybook 8+ for component documentation; build artifact published to a private URL during development.
- Playwright + image diff snapshot per component story in CI; threshold 0.1% pixel difference fails the build (catches token drift early).

## 10. Bundle budget breakdown

| Concern | Budget |
|---|---|
| Preact + Signals | ~15 KB |
| Floating UI | ~6 KB |
| Lucide (tree-shaken) | ~15 KB |
| Motion One | ~3 KB |
| date-fns (subset) | ~5 KB |
| fuse.js | ~5 KB |
| valibot | ~3 KB |
| Manrope + Inter WOFF2 (subset Latin + Greek + digits) | ~120 KB |
| Component library CSS Modules | ~25 KB |
| Component library JS | ~40 KB |
| **Popup initial bundle target** | **≤500 KB** (Constitution §X, NFR-B1) |

## 11. Test contract

- One Vitest file per component covering rendered output + interaction (`@testing-library/preact`).
- Storybook stories double as visual fixtures.
- Axe-core a11y check runs on each story in CI.
- Tokens-discipline check: ESLint rule `no-raw-color-tokens` + stylelint `no-magic-pixels` pass on every component CSS Module.

## 12. Out of scope

- Drag-and-drop primitives beyond the Document Check drop zone (built bespoke).
- Rich text editing (we don't compose anything inline).
- Date picker (use native `<input type="date">`).
- Data grid (Findings render as a vertical list of `FindingCard`, never a table).
