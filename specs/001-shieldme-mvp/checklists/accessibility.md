# Accessibility Review Checklist — ShieldMe MVP

**Scope:** PR-level accessibility review gate. Every PR that touches a UI component, layout, color token, animation, motion, i18n string, or ARIA annotation must evaluate every applicable item before merge.
**Version:** 1.0 · **Updated:** 2026-05-16
**Authorities:** NFR-A1 · NFR-I1 · WCAG 2.1 AA (W3C) · `contracts/design-tokens.md §11` · `contracts/ui-components.md §8, §11` · `contracts/ui-components.md §4` (motion vocabulary)

---

## How to use this checklist

1. Scan your diff. Identify which **sections** (A1–A8) your change touches.
2. For each applicable item, mark one of:
   - `[x]` — confirmed green
   - `[-]` — not applicable (add a one-line reason in the PR comment)
   - `[!]` — violation found — **blocks merge**
3. Paste the relevant section(s) into your PR description.
4. The **axe-core rule** cited under each item is the automated gate; pass-by-CI is necessary but not sufficient — code review of the ARIA annotation and focus behaviour is also required.

Items marked *(v1.5+)* apply only from that phase onward.

---

## A1 — Perceivable

> WCAG SC 1.1 (Non-text content) · 1.3 (Adaptable) · 1.4 (Distinguishable).
> Users must be able to perceive all information regardless of sensory channel.

- [ ] **A1-1.** Every `<img>` and inline SVG icon that conveys meaning has an `alt` attribute or `aria-label`. Purely decorative images use `alt=""` and `aria-hidden="true"`.
  - *Spec:* NFR-A1 — "`aria-label`s on all icon buttons"
  - *UI components:* §6 — "Never embed an icon font; always inline SVG via Lucide's tree-shaken imports"; every Lucide SVG must carry `aria-hidden="true"` when its containing `IconButton` supplies the accessible name
  - *axe-core rule:* `image-alt`
  - *Verification:* `pnpm test:a11y` (axe-core run in Storybook CI per `ui-components.md §11`). Manual: inspect every icon-only button in the popup with a screen reader and confirm it announces a meaningful label.

- [ ] **A1-2.** All body text meets a contrast ratio of **≥4.5:1** against its background in both light and dark themes. Large text (≥18 pt or ≥14 pt bold) meets **≥3:1**.
  - *Spec:* NFR-A1 — "color contrast ≥4.5:1"
  - *Design tokens:* §11 — "Body text contrast ≥4.5:1 against `--surface-base` in both themes. Asserted in CI by an axe-core check."
  - *UI components:* §8 — "Color contrast ≥4.5:1 body, ≥3:1 large text"
  - *axe-core rule:* `color-contrast`
  - *Verification:* `pnpm test:a11y`. Additional manual spot-check: paste `--text-muted` (#5C6873) on `--surface-base` (#FFFFFF) into the WebAIM contrast checker — must return ≥4.5:1. Dark theme: `--text-muted` (--color-slate-300 / #9DAAB6) on `--surface-base` (--color-slate-800 / #1B2129) — must return ≥4.5:1.

- [ ] **A1-3.** UI component boundaries (input borders, toggle tracks, button outlines) that must be perceived to understand the interface meet **≥3:1** non-text contrast against adjacent surfaces.
  - *WCAG:* SC 1.4.11 Non-text Contrast (AA)
  - *Design tokens:* `--border-default` (--color-slate-200) on `--surface-base` (#FFFFFF) — verify ≥3:1.
  - *axe-core rule:* `color-contrast` (also catches UI component contrast in axe 4.6+)
  - *Verification:* `pnpm test:a11y`. Spot-check Toggle track and TextField border in both themes.

- [ ] **A1-4.** No information, instruction, or status is conveyed **by color alone**. Every use of a severity color (`--severity-critical-*`, `--severity-warning-*`) is accompanied by a Lucide icon from the severity map **and** a visible text label.
  - *Design tokens:* §10 — "Severity color usage maps: `critical` → confirmed PII Critical findings; …"; §11 — "Severity is never communicated by color alone; pair every severity color with an icon and a textual label."
  - *UI components:* §6 — "Severity icons map: `AlertOctagon` for critical, `AlertTriangle` for warning, `Info` for info, `CheckCircle2` for success"; §8 — "Severity never communicated by color alone; always icon + text"
  - *WCAG:* SC 1.3.3 Sensory Characteristics; SC 1.4.1 Use of Color
  - *axe-core rule:* *(no single axe rule; covered by A5 section — reviewed in code review)*
  - *Verification:* Code review: grep `src/` for `severity-critical-bg` or `severity-warning-bg` applied without a co-located severity icon and text label. See A5 for the detailed discipline.

- [ ] **A1-5.** Text can be resized up to 200% in browser zoom without loss of content or functionality (no horizontal scrollbar in the popup at 2× zoom within the 400 px popup width).
  - *WCAG:* SC 1.4.4 Resize Text (AA)
  - *Design tokens:* Type scale uses `px` units; all sizes must be expressed via `--fs-*` tokens. Components must not use `overflow: hidden` in a way that clips text at 200% zoom.
  - *Verification:* Manual: set Chrome browser zoom to 200%, open popup, scroll through all tabs. No text must be clipped or overflow its container horizontally.

- [ ] **A1-6.** Tooltip and popover content that appears on hover or focus remains visible while the pointer is over the trigger or the tooltip itself, and is dismissible with `Escape` without moving the pointer.
  - *WCAG:* SC 1.4.13 Content on Hover or Focus (AA)
  - *UI components:* §2 — `Tooltip` uses Floating UI with 300 ms delay; touch-friendly long-press alternative
  - *axe-core rule:* *(no direct rule — manual)*
  - *Verification:* Manual: hover a `Tooltip` trigger, move the pointer into the tooltip area — tooltip must remain. Press Escape — tooltip must dismiss.

---

## A2 — Operable

> WCAG SC 2.1 (Keyboard accessible) · 2.4 (Navigable) · 2.5 (Input modalities).
> Every function must be reachable and operable by keyboard alone.

- [ ] **A2-1.** Every interactive element (Button, IconButton, Toggle, Checkbox, Radio, Select, TextField, Textarea, Tabs, Dialog close) is reachable by `Tab` key and activatable by `Enter` or `Space`. No interactive function requires mouse-only interaction.
  - *Spec:* NFR-A1 — "keyboard-only navigation"
  - *UI components:* §8 — "Every interactive element keyboard-navigable"
  - *axe-core rule:* `focusable-not-tabbable` (elements in the focus order that are not tabbable); manual keyboard walkthrough
  - *Verification:* Manual: navigate the popup from top to bottom using Tab only. Every interactive control must receive focus and respond to keyboard activation. `pnpm test:a11y`.

- [ ] **A2-2.** No keyboard trap exists outside of intentional modal focus traps. Pressing `Tab` and `Shift+Tab` always moves focus through the interactive sequence; pressing `Escape` closes any overlay or dismisses any expanded control and returns focus to the trigger.
  - *WCAG:* SC 2.1.2 No Keyboard Trap (A); SC 2.4.3 Focus Order (AA)
  - *UI components:* §2 — `Dialog`: focus trap, escape-to-close; `Select`: keyboard-navigable
  - *axe-core rule:* `scrollable-region-focusable`
  - *Verification:* Manual: Tab into a `Dialog`, verify focus is trapped inside; press Escape, verify focus returns to the trigger element. Tab into a `Select`, press Escape, verify Select closes and focus returns to the Select trigger.

- [ ] **A2-3.** Focus order follows the logical reading order of the page. Elements that appear visually first (top-left) receive focus first. No CSS `order`, `position: absolute`, or `z-index` trick creates a mismatch between visual order and DOM (tab) order.
  - *WCAG:* SC 2.4.3 Focus Order (AA)
  - *axe-core rule:* *(no direct rule — code review)*
  - *Verification:* Code review: any use of CSS `order` in flexbox layouts or `tabindex > 0` requires an explicit justification comment in the PR.

- [ ] **A2-4.** Focus is visible at all times. The `--focus-ring` token (`0 0 0 3px color-mix(...)`) is applied to every focused element. No component removes the native focus outline without replacing it with `--focus-ring`.
  - *Spec:* NFR-A1 — "keyboard-only navigation" (implied visible focus)
  - *Design tokens:* §11 — "Focus ring is always visible; never removed. `--focus-ring` is the only focus style."
  - *UI components:* §8 — "Focus ring always visible (`--focus-ring`)"
  - *WCAG:* SC 2.4.7 Focus Visible (AA)
  - *axe-core rule:* `focus-visible` (axe 4.7+); manual
  - *Verification:* ESLint/stylelint: `outline: none` or `outline: 0` in any component CSS Module without a paired `box-shadow: var(--focus-ring)` blocks CI (`pnpm lint`). Manual: Tab through every interactive element and confirm the focus ring renders in both light and dark themes.

- [ ] **A2-5.** All touch / click targets that can be activated by pointer are **≥44 × 44 px** hit area, even if the visual element is smaller. Use padding to expand the hit area without changing the visual size.
  - *Design tokens:* §11 — "All interactive elements ≥44 × 44 px hit target on mobile sizes"
  - *WCAG:* SC 2.5.5 Target Size (informative in 2.1; normative in WCAG 2.2 AA at ≥24 × 24 px; ShieldMe targets the stricter 44 × 44 px per design-tokens.md)
  - *axe-core rule:* *(no axe rule — visual review)*
  - *Verification:* Chrome DevTools: inspect `IconButton` with a rendered Lucide 20 × 20 icon — the computed `min-height` and `min-width` (including padding) must be ≥44 px. `pnpm test:a11y` Storybook visual regression.

- [ ] **A2-6.** The popup includes a skip-navigation link (or the tab order begins with the primary content region) so keyboard users are not forced to tab through the five module navigation tabs on every page.
  - *WCAG:* SC 2.4.1 Bypass Blocks (A)
  - *axe-core rule:* `bypass`
  - *Verification:* `pnpm test:a11y`. Manual: Tab from the popup chrome into the content area without traversing the entire nav bar.

- [ ] **A2-7.** Timed interactions (the 3-second Email Guardian scan timeout per FR-E2; the 30-second OCR timeout per engineering-qa Q3) surface visible progress and a user-controllable cancel action. The timeout is not the only mechanism to complete the task.
  - *Spec:* FR-E2 — "Max 3 s total or auto-passes with a notice"; engineering-qa Q3 — cancel button
  - *WCAG:* SC 2.2.1 Timing Adjustable (A)
  - *UI components:* §2 — `Progress` component; cancel via `worker.terminate()`
  - *Verification:* Code review: every timed operation renders a `Progress` component and a visible Cancel affordance before the timeout fires.

---

## A3 — Understandable

> WCAG SC 3.1 (Readable) · 3.2 (Predictable) · 3.3 (Input assistance).
> Users must be able to understand the content and operate the interface.

- [ ] **A3-1.** The `<html>` element has a `lang` attribute that matches the active locale (`lang="en"` for English, `lang="el"` for Greek). The attribute is updated when `Prefs.locale` changes.
  - *Spec:* NFR-I1 — "i18n: strings externalized to `_locales/{en,el}/messages.json`"
  - *WCAG:* SC 3.1.1 Language of Page (A)
  - *axe-core rule:* `html-has-lang`; `valid-lang`
  - *Verification:* `pnpm test:a11y`. Unit test: rendering the popup with `Prefs.locale = "el"` asserts `document.documentElement.lang === "el"`.

- [ ] **A3-2.** Every `<input>`, `<textarea>`, and `<select>` has an explicit `<label>` element associated via `for`/`id`, or an `aria-label` / `aria-labelledby` attribute. The `placeholder` attribute is never the sole accessible name.
  - *UI components:* §8 — "All form fields have explicit `<label>` or `aria-label`"; §2 — `TextField` has label, hint, error slots
  - *WCAG:* SC 3.3.2 Labels or Instructions (A)
  - *axe-core rule:* `label`; `label-content-name-mismatch`
  - *Verification:* `pnpm test:a11y`. Code review: any `<input>` without a sibling `<label>` or `aria-label` prop blocks merge.

- [ ] **A3-3.** Form validation errors are identified in text: the error message names the field and describes what is wrong. No error is communicated only via border color change or an icon without text.
  - *WCAG:* SC 3.3.1 Error Identification (A)
  - *UI components:* §2 — `TextField` has an `error` slot for visible error text
  - *UI components:* §4 — `shake(el)` animation used only for input validation errors; the animation supplements, never replaces, the text error message
  - *axe-core rule:* `aria-required-attr`; `label`
  - *Verification:* Code review: `TextField` `error` prop must render a text node alongside any icon, never icon-only. Manual: submit the custom-rule form with an empty name — the error message must be readable by a screen reader (`role="alert"` or `aria-live="assertive"` on the error container).

- [ ] **A3-4.** Upsell cards, tier-gate modals, and scan-limit banners use plain consumer language. No jargon (`DLP`, `regex`, `PII`, `classifier`, `OAuth scope`, `HIPAA`, `GDPR`, `PCI`) appears in any user-visible string, including error messages and `aria-label` values.
  - *Spec:* FR-R7.6 — consumer-copy linter; CLAUDE.md hard rule §7
  - *WCAG:* SC 3.1.5 Reading Level (AAA, informative context only — ShieldMe targets AA, but plain-language discipline is a product requirement)
  - *Verification:* `node scripts/lint-copy.mjs` — CI gate. Also runs on `aria-label` strings extracted from the built popup HTML.

- [ ] **A3-5.** Navigation and interactive patterns are consistent across the popup: the same Lucide icon always represents the same module; the five module tabs always appear in the same order; confirmation dialogs always present destructive actions on the right.
  - *WCAG:* SC 3.2.3 Consistent Navigation (AA); SC 3.2.4 Consistent Identification (AA)
  - *UI components:* §6 — module icon map is binding; §2 — `Dialog` layout convention
  - *Verification:* Code review. Any deviation from the module icon map or dialog button order requires an explicit design decision recorded in the PR description.

---

## A4 — Robust

> WCAG SC 4.1 (Compatible).
> Content must be interpreted reliably by assistive technologies including screen readers.

- [ ] **A4-1.** Every custom interactive widget (Toggle, Select dropdown, Tabs, Dialog, custom `CheckboxGroup`) implements the correct WAI-ARIA design pattern: correct `role`, required `aria-*` properties, and correct state attributes (`aria-checked`, `aria-selected`, `aria-expanded`, `aria-disabled`, `aria-controls`, `aria-haspopup`).
  - *UI components:* §2 — "Tabs / accordions / dialogs: hand-built on Floating UI + WAI-ARIA spec"; §8 — `aria-*` props pass-through on all components
  - *WCAG:* SC 4.1.2 Name, Role, Value (A)
  - *axe-core rule:* `aria-required-attr`; `aria-valid-attr-value`; `aria-roles`; `aria-toggle-field-name`
  - *Verification:* `pnpm test:a11y`. Manual: inspect the Toggle with VoiceOver/NVDA — it must announce "on" or "off" on state change.

- [ ] **A4-2.** Status messages (scan-complete toast, "Email Guardian temporarily unavailable" banner, tier-limit upsell) are announced to screen readers without receiving keyboard focus. They use `role="status"` (polite) or `role="alert"` (assertive) as appropriate.
  - *WCAG:* SC 4.1.3 Status Messages (AA)
  - *UI components:* §2 — `Toast` component; FR-E5 — unavailability banner; FR-D7 — scan state changes
  - *axe-core rule:* `aria-live-region-info`
  - *Verification:* `pnpm test:a11y`. Unit test: render a `Toast` and assert the container has `role="status"` or `aria-live="polite"`. Render the Email Guardian unavailability banner and assert `role="alert"`.

- [ ] **A4-3.** All `Dialog` components use the HTML `<dialog>` element (or have `role="dialog"`) and carry an accessible name via `aria-label` or `aria-labelledby` pointing to the visible dialog heading.
  - *UI components:* §2 — "`Dialog`: Modal with focus trap, escape-to-close, backdrop click; built on `<dialog>` element"
  - *WCAG:* SC 4.1.2 Name, Role, Value
  - *axe-core rule:* `dialog-name`
  - *Verification:* `pnpm test:a11y`. Code review: every `<Dialog>` usage must pass either `aria-label` or a `Headline` child that the dialog references via `aria-labelledby`.

- [ ] **A4-4.** HTML markup is valid: no duplicate IDs, no invalid nesting (e.g., `<button>` inside `<button>`, `<div>` inside `<p>`), no obsolete attributes.
  - *WCAG:* SC 4.1.1 Parsing (A — deprecated in WCAG 2.2, but still a strong engineering quality signal)
  - *axe-core rule:* `duplicate-id`; `duplicate-id-aria`
  - *Verification:* `pnpm test:a11y`. ULID-based component instance IDs must not collide — test renders two instances of the same form component simultaneously.

- [ ] **A4-5.** The popup and options page establish landmark regions: at minimum one `<main>` landmark, a `<nav>` for the module tab bar, and optionally `<header>` for the toolbar. All content is contained within a landmark.
  - *WCAG:* SC 1.3.1 Info and Relationships (A) — landmark structure expresses hierarchy
  - *axe-core rule:* `landmark-one-main`; `region`
  - *Verification:* `pnpm test:a11y`. Inspect popup DOM and assert `<main>` and `<nav>` elements are present.

---

## A5 — Severity Not by Color Alone

> WCAG SC 1.3.3 Sensory Characteristics · SC 1.4.1 Use of Color.
> This section enforces the "never color alone" discipline across every severity surface in ShieldMe.

- [ ] **A5-1.** `FindingCard` always renders: (a) the appropriate Lucide severity icon (`AlertOctagon` for critical, `AlertTriangle` for warning), (b) a visible text label ("Critical" / "Warning"), and (c) the severity background+foreground color token pair. Removing either (a) or (b) while keeping (c) is a violation.
  - *UI components:* §6 — severity icon map is binding; §8 — "Severity never communicated by color alone; always icon + text"
  - *Design tokens:* §10 — severity color usage map
  - *axe-core rule:* *(code review — no single axe rule covers icon+label pairing)*
  - *Verification:* Component unit test: render `FindingCard` with `severity="critical"` and assert both the `AlertOctagon` icon and the text "Critical" are in the DOM. Run `pnpm test`.

- [ ] **A5-2.** `Badge` (severity variant) always renders the severity icon and a text label or at minimum a `title` attribute on the icon SVG when used in space-constrained contexts. A color-only badge with no icon or text label is a violation.
  - *UI components:* §2 — `Badge` has severity badge and count badge variants; severity variant must include icon
  - *Verification:* Component unit test: render `Badge` with each severity level and assert the severity icon is present. Count-only badges (`Badge` count variant) are exempt as they convey quantity, not severity.

- [ ] **A5-3.** The Exposure Score numeral on the dashboard uses both the numerical value and the severity token color. The `ExposureScore` component must additionally render a text description of the score range ("High exposure", "Low exposure", etc.) that is visible and not hidden with `aria-hidden`.
  - *UI components:* §2 — `ExposureScore` specialized component
  - *Spec:* FR-C1 — "Badge color mapped per PRD. Updated reactively on any change."
  - *axe-core rule:* `color-contrast` (tests score numeral contrast ratio)
  - *Verification:* Component unit test: render `ExposureScore` with score 85 (high) and assert both the numeral "85" and a text string such as "High exposure" are in the DOM and not `aria-hidden`.

- [ ] **A5-4.** The email-guardian warning modal conveys the finding severity (critical / warning) using the icon, a coloured severity chip, and a textual severity label — not the border color alone.
  - *Spec:* FR-E3 — "show warning modal per PRD §Warning Modal Design"
  - *UI components:* §2 — `Dialog` + `FindingCard` inside modal
  - *Verification:* E2E test `tests/acceptance/email.spec.ts` (AC-E1): assert the modal contains at least one element with text "Critical" or "Warning" for a planted critical finding.

- [ ] **A5-5.** `Toast` notifications that carry a status (success / error / warning) include both the status icon and a text status label. Color alone must not be the differentiator between a success toast and an error toast.
  - *UI components:* §2 — `Toast` component
  - *Verification:* Component unit test: render two Toasts (success + error) and assert each contains its respective icon and a text label in addition to the color token.

---

## A6 — Focus Management

> WCAG SC 2.4.3 Focus Order · SC 2.1.2 No Keyboard Trap.
> Focus must be deterministic, predictable, and always returned to a logical position after an overlay closes.

- [ ] **A6-1.** When a `Dialog` opens, focus is moved to the first focusable element inside the dialog (typically the dialog heading or the first action button). When the dialog closes (Escape, backdrop click, or explicit close button), focus returns to the element that triggered the dialog.
  - *UI components:* §2 — "`Dialog`: focus trap, escape-to-close"
  - *Spec:* AC-E1 — "dismissing [the email guardian modal] returns focus to compose"
  - *axe-core rule:* *(manual — axe does not test focus destination)*
  - *Verification:* Unit test: mount `Dialog`, open it, assert `document.activeElement` is inside the dialog. Close it, assert `document.activeElement` is the trigger element. E2E AC-E1.

- [ ] **A6-2.** When the email-guardian warning modal is dismissed ("Go Back"), focus is returned to the Gmail compose Send button (or the nearest focusable compose element), not to an arbitrary position in the extension popup.
  - *Spec:* AC-E1
  - *Verification:* Playwright E2E test `tests/acceptance/email.spec.ts`: after modal dismissal, `page.evaluate(() => document.activeElement.ariaLabel)` must return the Send button label or equivalent compose element label.

- [ ] **A6-3.** When a popup route changes (tab switch, back navigation), focus is placed on the heading (`<h1>` or `<h2>`) of the new view, not left on a now-invisible element.
  - *WCAG:* SC 2.4.3 Focus Order
  - *Verification:* Unit test: simulate a tab switch from Document Check to Email Guardian; assert `document.activeElement` is the Email Guardian route heading. `pnpm test`.

- [ ] **A6-4.** The `Select` dropdown (Floating UI) traps focus within the open listbox while it is expanded. `Escape` closes the listbox and returns focus to the `Select` trigger button. `ArrowDown` / `ArrowUp` navigate options; `Enter` or `Space` selects.
  - *UI components:* §2 — `Select`: Floating UI dropdown; keyboard-navigable
  - *axe-core rule:* `aria-required-children` (listbox must have option children)
  - *Verification:* Component unit test: keyboard-navigate the Select component; assert focus stays inside the listbox while open.

- [ ] **A6-5.** After the "Delete all my data" flow completes and the extension resets to first-run state, focus is placed on the first focusable element of the onboarding screen (the preset picker heading or the first PresetPickerCard), not left floating.
  - *Spec:* FR-C3; AC-C1
  - *Verification:* Playwright acceptance test `tests/acceptance/erasure.spec.ts`: after deletion, assert `document.activeElement` is within the onboarding view.

- [ ] **A6-6.** Infinite scroll, virtual lists, or paginated finding lists (if introduced) update `aria-live` regions and move focus only when the user explicitly requests more content (e.g., "Load more" button), never on automatic scroll.
  - *WCAG:* SC 2.4.3 Focus Order; SC 3.2.2 On Input
  - *Verification:* Code review. Any new paginated list must use an explicit user-triggered "Load more" rather than intersection-observer auto-append that silently moves focus.

---

## A7 — Reduced Motion

> WCAG SC 2.3.3 Animation from Interactions (AAA informative; ShieldMe honors it as a product requirement per `design-tokens.md §9` and `ui-components.md §4`).
> Every Motion One animation degrades to an instant state change under `prefers-reduced-motion: reduce`.

- [ ] **A7-1.** Every Motion One `animate()` call in `src/` is wrapped in a reduced-motion guard. When `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true, the animation is skipped and the element is set directly to its final state.
  - *Design tokens:* §9 — "Respect `prefers-reduced-motion` — every animation guarded."
  - *UI components:* §4 — "`prefers-reduced-motion: reduce` is honored everywhere. Animations degrade to instant state changes."
  - *Verification:* Code review: grep `src/` for `animate(` — every call site must have a `prefers-reduced-motion` check before the call. `pnpm lint` if a custom ESLint rule `require-reduced-motion-guard` is added.

- [ ] **A7-2.** Every CSS `@keyframes` animation and CSS `transition` in `*.module.css` is suppressed under `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
  This rule must appear in `src/ui/tokens/reset.css` and must not be overridden by any component CSS Module.
  - *Design tokens:* §9 motion tokens; §2 — `reset.css` is part of the token file layout
  - *Verification:* `pnpm lint:tokens` (stylelint checks for the presence of the `@media prefers-reduced-motion` block in reset.css). Visual regression Playwright test: run with `--force-prefers-reduced-motion` flag and assert no `animation` or `transition` with duration > 1 ms in computed styles.

- [ ] **A7-3.** The `scoreSpring` animation (Motion One spring, score 0→N change) degrades gracefully: under reduced motion, the score numeral updates instantly without the spring animation.
  - *UI components:* §4 — "`scoreSpring(el, {from, to})` — Motion One spring with stiffness 200, damping 25"
  - *Verification:* Unit test: render `ExposureScore` with `prefers-reduced-motion` mocked to `reduce`, trigger a score change, assert the numeral updates in ≤2 frames (no `requestAnimationFrame` delay beyond the microtask queue).

- [ ] **A7-4.** The `shake(el)` validation-error animation (used on `TextField` after a failed submission) is suppressed under reduced motion. The error state is still communicated via the text error message and the `aria-invalid="true"` attribute.
  - *UI components:* §4 — "`shake(el)` — for input validation errors only"
  - *Verification:* Unit test: render `TextField`, mock reduced motion, trigger validation failure, assert `aria-invalid="true"` and the error text are present, and assert no `transform` animation fires.

- [ ] **A7-5.** The `slideInUp` and `fadeIn` entrance animations used for `Card`, `Toast`, and `Dialog` elements degrade to instant visibility under reduced motion. The elements must be visible immediately (not hidden waiting for animation) when reduced motion is active.
  - *UI components:* §4 — `slideInUp`, `fadeIn` Motion One primitives
  - *Verification:* Playwright visual regression test with `--force-prefers-reduced-motion`: open a `Dialog` and capture a screenshot — the dialog must be fully opaque in frame 1.

---

## A8 — Localisation (EN + EL)

> NFR-I1 · US-10 — "non-English speaker (Greek) uses the extension in my language".
> All user-visible strings are externalised; both locales are complete at launch.

- [ ] **A8-1.** No hardcoded UI string appears in any `.tsx` or `.ts` source file under `src/`. All user-visible copy (labels, placeholders, `aria-label`, `aria-describedby` values, Toast messages, error messages, `title` attributes) is retrieved via `chrome.i18n.getMessage("key")` or the `i18n()` wrapper in `src/core/i18n.ts`.
  - *Spec:* NFR-I1 — "No hardcoded UI strings in components"
  - *Verification:* `node scripts/lint-copy.mjs` — the linter must also check for string literals in JSX that are not wrapped in `i18n()`. CI gate. Manual: grep `src/**/*.tsx` for straight quote string literals in JSX position (excluding comment lines and test fixtures).

- [ ] **A8-2.** Every key present in `_locales/en/messages.json` also exists in `_locales/el/messages.json` and vice versa. No key is missing in either locale. No key maps to an empty string.
  - *Spec:* NFR-I1; US-10
  - *Verification:* `node scripts/lint-copy.mjs` includes a key-symmetry check: it loads both locale files and asserts `Object.keys(en).sort()` deep-equals `Object.keys(el).sort()`, and that no value is `""`. CI gate.

- [ ] **A8-3.** Greek locale strings use correct polytonic characters where needed and avoid Latin-character approximations. All Greek body copy renders correctly in Manrope (display) and Inter (body), both of which have full Greek glyph coverage per `design-tokens.md §5`.
  - *Design tokens:* §5 — "full Greek glyph coverage (required for `el` locale per NFR-I1), variable font"
  - *Verification:* Visual regression Playwright test with `Prefs.locale = "el"`: screenshot of the popup — assert no `tofu` (□) characters appear. Automated: `node -e "require('./_locales/el/messages.json')"` must parse without error; optional: pipe values through a Unicode-range validator to check for Latin fallback characters in Greek strings.

- [ ] **A8-4.** The `lang` attribute on `<html>` is set to `"el"` when `Prefs.locale === "el"` and to `"en"` otherwise. This is set before first paint to prevent screen readers from mis-pronouncing the content language.
  - *WCAG:* SC 3.1.1 Language of Page (A)
  - *axe-core rule:* `html-has-lang`; `valid-lang`
  - *Verification:* Unit test: mount the popup App with `Prefs.locale = "el"`, assert `document.documentElement.getAttribute("lang") === "el"`. `pnpm test`.

- [ ] **A8-5.** Copy linter (`scripts/lint-copy.mjs`) runs against both locale files. It enforces the consumer-language rule: no regulation jargon (`HIPAA`, `GDPR`, `PCI`, `DLP`, `SIT`, `regex`, `PII`, `classifier`, `OAuth scope`, `entropy`) appears in any `message` value in either locale file.
  - *Spec:* FR-R7.6; CLAUDE.md hard rule §7
  - *Verification:* `node scripts/lint-copy.mjs` — CI gate. The linter must scan all `message` values in both `_locales/en/messages.json` and `_locales/el/messages.json`.

- [ ] **A8-6.** Locale-sensitive number and date formatting (exposure score breakdown dates, scan history timestamps, file-size display) uses `Intl.NumberFormat` and `Intl.DateTimeFormat` with the active locale, not hardcoded formats. Greek locale uses `dd/MM/yyyy`; English uses `MMM d, yyyy`.
  - *Spec:* NFR-I1; US-10
  - *Verification:* Unit test: render a scan history entry timestamp with `Prefs.locale = "el"` and assert the rendered string is formatted `dd/MM/yyyy`. With `Prefs.locale = "en"` assert `MMM d, yyyy` format. `pnpm test`.

- [ ] **A8-7.** Bidirectional (RTL) layout is **not required** at v1.0 (EN + EL are both LTR). If a future locale introduces RTL support, the token system must be updated before that locale ships. Mark this item `[-]` for v1.0 with note "EN + EL are LTR; RTL deferred."
  - *Spec:* NFR-I1 — EN + EL only at launch
  - *Verification:* `[-]` EN + EL are LTR — no RTL CSS required. Revisit before any RTL locale (Arabic, Hebrew) is added.

---

## Axe-core Rule Reference

Quick lookup: which axe rule covers which checklist item.

| axe-core rule | Items |
|---|---|
| `color-contrast` | A1-2, A1-3, A5-3 |
| `image-alt` | A1-1 |
| `button-name` | A1-1 (icon buttons) |
| `focus-visible` | A2-4 |
| `focusable-not-tabbable` | A2-1 |
| `scrollable-region-focusable` | A2-2 |
| `bypass` | A2-6 |
| `html-has-lang` | A3-1, A8-4 |
| `valid-lang` | A3-1, A8-4 |
| `label` | A3-2 |
| `label-content-name-mismatch` | A3-2 |
| `aria-required-attr` | A3-3, A4-1 |
| `aria-valid-attr-value` | A4-1 |
| `aria-roles` | A4-1 |
| `aria-toggle-field-name` | A4-1 |
| `aria-live-region-info` | A4-2 |
| `dialog-name` | A4-3 |
| `duplicate-id` | A4-4 |
| `duplicate-id-aria` | A4-4 |
| `landmark-one-main` | A4-5 |
| `region` | A4-5 |
| `aria-required-children` | A6-4 |

All axe-core rules are run in CI via: `pnpm test:a11y` (axe-core on each Storybook story per `ui-components.md §11`).

---

## Accessibility Sign-off (Reviewer table)

> Apply to every PR that modifies: a UI component, a color token, an animation, an ARIA attribute, an i18n string, or a focus flow.

| Area | Checklist items | Reviewer signs off |
|---|---|---|
| Color contrast (body + large text) | A1-2, A1-3 | |
| Severity not by color alone | A1-4, A5-1 through A5-5 | |
| Keyboard navigation complete | A2-1, A2-2, A2-4 | |
| Focus trap and restore (Dialog) | A6-1, A6-2 | |
| Reduced-motion guard (all animations) | A7-1, A7-2 | |
| ARIA roles + state (custom widgets) | A4-1, A4-2, A4-3 | |
| i18n key symmetry (EN = EL) | A8-2 | |
| No hardcoded strings in TSX | A8-1 | |
| lang attribute matches locale | A3-1, A8-4 | |

---

*This checklist is normative. Items marked `[!]` block merge. Items marked `[-]` require a one-line justification in the PR comment. A8-7 is pre-marked `[-]` for v1.0; re-evaluate before any RTL locale is added.*
