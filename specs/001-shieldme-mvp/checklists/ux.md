# UX Review Checklist — ShieldMe MVP

**Scope:** PR-level UX review gate. Every PR that touches a user-facing string, onboarding flow, tier gate, error state, scan-state indicator, severity presentation, or progressive-disclosure control must evaluate every applicable item before merge.
**Version:** 1.0 · **Updated:** 2026-05-16
**Authorities:** Constitution §IV/V/VI/IX/XIV · `spec.md` FR-R6, FR-R7.2, FR-R7.6, FR-D7, FR-E5, FR-C5 · `docs/PRD.md` §3–8 · `contracts/ui-components.md` §2, §4

---

## How to use this checklist

1. Scan your diff. Identify which **sections** (U1–U6) your change touches.
2. For each applicable item, mark one of:
   - `[x]` — confirmed green
   - `[-]` — not applicable (add a one-line reason in the PR comment)
   - `[!]` — violation found — **blocks merge**
3. Paste the relevant section(s) into your PR description.
4. Items marked *(M6+)* or *(v1.5+)* apply only from that phase onward.

---

## U1 — First-Run Flow (≤5 Clicks to Dashboard)

> Spec FR-R6: "First-run onboarding completes in ≤5 clicks from install → dashboard."
> Constitution §V: "First-run: 3 clicks from install → first scan result. Defaults work for a non-technical user with zero configuration."
> PRD §3.4: Install → Welcome → Preset picker → "You're protected" summary → dashboard.

- [ ] **U1-1.** The complete first-run path — Install → Welcome screen → Preset picker (select residency preset) → Apply → "You're protected" summary → Dashboard — is achievable in **≤5 user interactions** (clicks, keyboard presses, or form submissions). Each distinct user action counts as one interaction; reading text or waiting for animations do not.
  - *Spec:* FR-R6
  - *Constitution:* §V — "First-run: 3 clicks from install → first scan result"
  - *Verification:* Playwright acceptance test `tests/acceptance/onboarding.spec.ts` counts interactions from extension install to dashboard render. Assert `interactionCount <= 5`. `pnpm test:e2e`.

- [ ] **U1-2.** "Skip" on the preset picker is a single click that applies the Global Default preset (My Money, My Identity, My Digital Life enabled) immediately and advances to the dashboard. No secondary confirmation is required after clicking Skip.
  - *Spec:* FR-R6; PRD §3.4 — "Skipping the picker applies the Global Default preset"
  - *Verification:* E2E test: click Skip on the preset picker → assert the dashboard renders with 3 categories active and the interaction count does not increase beyond 1 for this step.

- [ ] **U1-3.** The onboarding flow has a visible step indicator (e.g., "Step 2 of 3") so the user always knows how far they are from the dashboard. Progress never goes backward without an explicit [Back] action.
  - *Constitution:* §IX — fail loud (user must always know where they are)
  - *Verification:* UI review. Each onboarding screen renders a step indicator. Playwright snapshot test asserts the indicator is present and reflects the correct step number.

- [ ] **U1-4.** The first-run flow does not require email address entry, account creation, or payment details before the user reaches the dashboard and can use Document Check. Google OAuth (Drive Audit) is never requested during onboarding.
  - *Constitution:* §III — permissions on-demand; §XIII — no password
  - *Spec:* FR-Acc4 — OAuth via `launchWebAuthFlow` only when Drive is enabled
  - *Verification:* E2E test: complete first-run flow without granting any optional permission; assert the dashboard renders with Document Check usable (file picker visible and functional).

- [ ] **U1-5.** The preset picker diff-preview ("Turns on 18 protections, turns off 0") renders before the user confirms a preset. The preview uses only consumer labels (category and detector names in plain language); no detector IDs, no regulation names, no jargon appear in the preview text.
  - *Spec:* FR-R7.2 — "preview panel renders the preset's effect using consumer labels only — no detector IDs or regulation names"
  - *Spec:* AC-R6 — "Preset preview shows zero regulation names / DLP jargon (scanned via copy linter at CI time)"
  - *Verification:* `node scripts/lint-copy.mjs` runs against preset i18n strings. E2E test opens the preset picker, asserts the preview text contains no string from the banned-term list (U2-2).

- [ ] **U1-6.** The "You're protected" confirmation screen is shown after preset application and before the dashboard. It lists the active preset names (in consumer language) and a summary count of active protections. It does not block the user — it has a clear [Go to dashboard] action.
  - *PRD:* §3.4 — "'You're protected' summary with active preset badges"
  - *Verification:* E2E test: after applying a preset, assert the confirmation screen renders with at least one preset badge and a [Go to dashboard] button, and that clicking it reaches the dashboard in ≤1 additional interaction.

- [ ] **U1-7.** Returning to the onboarding flow from Settings (e.g., to change the preset) does not reset protection rules already customized by the user. Re-running onboarding is additive, not destructive.
  - *Spec:* FR-R7.1 — preset apply is additive; FR-R7.3 — unapplying is explicit
  - *Verification:* Unit test: simulate adding a custom rule, then navigate back through onboarding, then assert the custom rule is still present in `rules.customRules` after completing onboarding again.

---

## U2 — Consumer Language

> Constitution §IV: "UI strings contain zero security jargon: no 'DLP,' 'regex,' 'PII,' 'classifier,' 'entropy,' 'OAuth scope.' Copy is reviewed against a banned-terms linter."
> Spec FR-R7.6: "Consumer-copy linter bans regulation names (HIPAA, GDPR, PCI, PIPEDA, APPI, PIPA, POPIA, LGPD) and jargon (DLP, SIT, regex, policy template) from user-facing preset strings."

- [ ] **U2-1.** `node scripts/lint-copy.mjs` passes in CI without errors. The linter runs against both `_locales/en/messages.json` and `_locales/el/messages.json`, all hardcoded `aria-label` strings extracted from built HTML, and all Toast and error message strings registered in `src/`.
  - *Constitution:* §IV; §X — copy linter is a CI gate
  - *Verification:* `node scripts/lint-copy.mjs` — CI gate. Blocks merge on any match.

- [ ] **U2-2.** The following terms are permanently forbidden in all user-visible strings (UI labels, error messages, Toast text, `aria-label`, `title`, `placeholder`, upsell card copy, onboarding text, and preset preview text). No exception without an explicit constitutional amendment:

  | Forbidden term | Consumer alternative |
  |---|---|
  | DLP, Data Loss Prevention | "protection," "watch for" |
  | PII | "personal data," "sensitive information" |
  | regex, regular expression | "pattern," "custom rule" |
  | classifier, classification | "scan," "detection," "check" |
  | entropy | *(never surface this concept to users)* |
  | OAuth scope | "access to your [Google Drive / Gmail]" |
  | HIPAA, GDPR, PCI, PIPEDA, APPI, PIPA, POPIA, LGPD | *(never appear in UI; reference by plain purpose: "health information," "financial data")* |
  | SIT, Sensitive Information Type | "protection," "detector" |
  | policy template | "preset," "protection bundle" |
  | detector ID (e.g., `credit-card-us-v2`) | The detector's consumer label |

  - *Constitution:* §IV
  - *Spec:* FR-R7.6
  - *Verification:* `node scripts/lint-copy.mjs` — banned-terms list is the single source of truth. CI gate.

- [ ] **U2-3.** Confidence scores (e.g., "0.87 confidence") are internal implementation details and must never appear in any user-facing string. The only severity vocabulary exposed to users is "Critical" and "Warning."
  - *PRD:* §4.3 — "critical findings (red), warnings (yellow)" — two levels only
  - *Constitution:* §IV — consumer language; §VII — FPR target is internal discipline
  - *Verification:* Code review: grep `src/popup/**` and `src/content/**` for any reference to a `confidence`, `score`, or probability floating-point value being passed to a user-visible render path.

- [ ] **U2-4.** Module consumer names are used consistently everywhere the module is referenced in UI strings. Internal code names (`scanEngine`, `documentCheck`) may differ; UI strings must use the PRD-specified names:

  | Internal name | User-facing name |
  |---|---|
  | Rules module | My Protection Rules |
  | Document Check module | Document Check |
  | Email Guardian module | Email Guardian |
  | Drive Audit / Cloud Audit module | Drive Audit |
  | Exposure Radar module | Exposure Radar |
  | Calendar Audit module | Calendar Audit |
  | Privacy Toolkit module | Privacy Toolkit |

  - *PRD:* §2 Feature Map
  - *Verification:* `node scripts/lint-copy.mjs` includes a module-name consistency check. Code review: search for internal code names ("cloudAudit", "driveAudit") in JSX string positions.

- [ ] **U2-5.** Drive permissions are explained in user-facing language, never as raw OAuth scope names. The connection flow describes what access ShieldMe uses in plain terms:
  - `drive.metadata.readonly` → "See the names and sharing settings of your files"
  - `drive.readonly` → "Read the content of files to check for exposed personal data"
  - `drive` (write, fix actions) → "Change sharing settings on your files"
  - *Constitution:* §IV — no "OAuth scope" in UI
  - *PRD:* §6 Drive Audit framing — "See who can access your Google Drive files"
  - *Verification:* UI review of the Drive connect flow. Playwright snapshot test asserts no OAuth scope string (`drive.metadata.readonly`, `drive.readonly`, `drive`) appears in any visible text node.

- [ ] **U2-6.** Tier names use the binding positioning copy from `spec.md §5` verbatim in all marketing-adjacent UI strings (upsell cards, Settings → Subscription):
  - **Free:** "Try ShieldMe — see what's exposed."
  - **Basic:** "Protect your personal account — full module access, single life."
  - **Pro:** "Protect every account that's you — work, personal, side projects."
  - Informal paraphrases (e.g., "unlock more scans") are acceptable in contextual upsell copy but must not contradict the tier positioning.
  - *Spec:* §5 — "Tier positioning (binding for marketing copy)"
  - *Verification:* Code review. The Settings → Subscription screen and all UpsellCard "Learn more" destinations must include the tier positioning sentence for the relevant tier.

---

## U3 — Progressive Disclosure

> Constitution §V: "Defaults work for a non-technical user with zero configuration. Advanced controls (per-detector toggles, custom rules, API keys) are behind an 'Advanced' fold."

- [ ] **U3-1.** The My Protection Rules dashboard default view shows only the **six category toggles** (My Money, My Identity, My Health, My Family, My Digital Life, My Location) with their ON/OFF state. Per-detector toggles are hidden inside an "Advanced" accordian fold on each category. The fold is collapsed by default.
  - *Constitution:* §V — "per-detector toggles… behind 'Advanced' fold"
  - *Spec:* FR-R2 — "Each category expands to individual detector toggles (Advanced fold)"
  - *Verification:* E2E test: open the Rules tab; assert no individual detector toggle is visible in the DOM. Click "Advanced" on one category; assert detector toggles appear. `pnpm test:e2e`.

- [ ] **U3-2.** Custom Rules (keyword, pattern, combination) are accessible from a secondary-level entry point within the Rules tab, not from the main category grid. The main view never renders the custom-rule form inline.
  - *Constitution:* §V — "Custom rules… behind 'Advanced' fold"
  - *Spec:* FR-R3 — "Custom Rules supports keyword, pattern, combination modes (§3.2)"
  - *PRD:* §3.2 — custom rules under "Advanced"
  - *Verification:* E2E test: open Rules tab; assert the custom-rule form is not rendered. Click the Custom Rules entry point; assert the form appears.

- [ ] **U3-3.** HIBP API key entry is located inside the Exposure Radar module settings, reachable only after the user actively navigates to that module. It is never surfaced on the dashboard, in onboarding, or on the first-run screen.
  - *Constitution:* §V; §III — optional permissions on-demand
  - *Spec:* FR-X2 — "Breach Check email mode requires user's own HIBP key; key entry persists in encrypted storage"
  - *Verification:* E2E test: complete first-run and inspect the dashboard and Rules tabs — assert no HIBP key field is present. Navigate to Exposure Radar → Breach Check → Email; assert the key entry appears.

- [ ] **U3-4.** The "Include detectors for other countries (Beta)" master switch is inside the Advanced panel, hidden by default. Beta-tier detector toggles do not render in the DOM when this switch is OFF.
  - *Spec:* FR-R2 — "Beta-tier detectors are rendered behind a single 'Include detectors for other countries' switch, off by default"
  - *Spec:* AC-R7 — "OFF → Beta-tier detector toggles are not present in the DOM"
  - *Verification:* `tests/acceptance/rules.spec.ts` AC-R7 — assert Beta-tier detector DOM nodes are absent with the switch OFF, present with the switch ON. `pnpm test:e2e`.

- [ ] **U3-5.** Drive fix actions (restrict access, remove external collaborators) are shown only after the user has viewed the audit results and explicitly requested to fix a specific finding. The fix-action UI does not appear on the main Drive Audit dashboard or on first audit load.
  - *Constitution:* §V; §III — write scope requested only when user initiates a fix
  - *Spec:* FR-A3 — "Fix actions require Premium + one-time `drive` (write) scope upgrade"
  - *Verification:* E2E test: run Drive Audit on Free tier; assert no fix-action buttons are visible without clicking into a specific finding.

- [ ] **U3-6.** The Analytics opt-in preference is located in Settings → Privacy, not surfaced during the core onboarding flow or on the dashboard. Users may opt in at any time; they are never required to decide before using the product.
  - *Constitution:* §V — "Analytics opt-in is behind a fold, not a onboarding gate"
  - *Spec:* FR-C4 — "Telemetry is opt-in only, disabled by default"
  - *Verification:* E2E test: complete first-run flow without encountering an analytics prompt. Navigate to Settings → Privacy; assert the analytics toggle is present and unchecked.

- [ ] **U3-7.** Tier entitlement differences are surfaced **contextually** via `UpsellCard` when a capacity limit is hit, not as a persistent comparison table on the dashboard or in a persistent banner. The dashboard never shows a "Upgrade to Pro" banner to a user who has not yet hit a limit.
  - *Constitution:* §VI — "Paid tiers add scale, automation, multi-account — not unlock-to-see features"
  - *Spec:* FR-C5 — "Free-tier limits block with an upsell card; no silent truncation"
  - *UI components:* §2 — `UpsellCard` "rendered when a `check()` returns `allowed: false`"
  - *Verification:* E2E test: fresh Free-tier install; inspect the dashboard DOM — assert no `UpsellCard` component is rendered when no limit has been reached.

---

## U4 — Fail-Loud Messaging & Scan Visibility

> Constitution §IX: "When the Gmail DOM observer can't find compose nodes, when Drive rate-limits, when OCR times out — show the user a named failure mode… with a Report button. Never silently skip a scan the user believes ran."
> Spec FR-D7: "Scan state is visible at all times: Idle → Reading (bytes) → Scanning (rules count) → Done. No silent phases."

- [ ] **U4-1.** When Email Guardian compose-DOM detection fails (the `validateComposeSurface()` canary fails any of its four assertions), a banner renders **inside the compose window** within 1 second: *"Email Guardian temporarily unavailable — Gmail may have updated. [Report this]."* The extension does **not** consume the Send click; the email sends normally. The user is never left believing the scan ran when it did not.
  - *Constitution:* §IX
  - *Spec:* FR-E5 — "Emails are never silently skipped"; AC-E3 — "banner renders within 1 s and the extension does NOT consume the Send click"
  - *PRD:* §5.1 — canary failure handling
  - *Verification:* `tests/acceptance/email.spec.ts` AC-E3: simulate canary failure, assert banner renders within 1 s and `sendClick` propagates normally. `pnpm test:e2e`.

- [ ] **U4-2.** When a Drive API call is rate-limited (403 `userRateLimitExceeded` or 429), the Drive Audit UI immediately replaces the spinner with a named message: *"Drive is temporarily busy — retrying in [N] seconds."* The countdown updates visibly. The user is never left on a blank or indefinitely-spinning screen.
  - *Constitution:* §IX
  - *Spec:* §8 Risks — "Drive API quotas" mitigated; engineering-qa Q4 — exponential backoff with jitter
  - *Verification:* Unit test: stub `files.list` to return 403; assert the retry-countdown message renders within 200 ms and the countdown value decrements.

- [ ] **U4-3.** When OCR times out (30 s), the UI shows a specific, named timeout message with two actions: *[Keep waiting]* and *[Cancel].* The timeout message is not auto-dismissed. If the user clicks Cancel, the scan state resets to Idle and the file can be re-selected.
  - *Constitution:* §IX — named failure mode, not a generic spinner that freezes
  - *Engineering-QA:* Q3 — "Timeout at 30 s → show 'This image is taking longer than usual. [Keep waiting] [Cancel].'"
  - *Verification:* Unit test: inject a clock that jumps to 31 s; assert the timeout message renders with both actions. Assert clicking Cancel resets state to Idle.

- [ ] **U4-4.** When a document parse fails (corrupted file, password-protected file, unsupported format), the error message identifies the **specific** failure reason in plain language. Generic messages ("Something went wrong") are forbidden. Required examples:
  - Corrupted PDF → *"Couldn't read this PDF — the file may be damaged."*
  - Password-protected XLSX → *"This file is password-protected — remove the password and try again."*
  - Unsupported format (e.g., `.psd`) → *"ShieldMe can't read this file type. Supported: PDF, Word, Excel, CSV, and text files."*
  - *Constitution:* §IX — "show the user a named failure mode"
  - *Spec:* `ScanFlowError.kind` discriminated union — `"parse-failed"`, `"unsupported-format"`, `"too-large"` each has distinct copy
  - *Verification:* Unit tests in `tests/unit/popup/routes/document-check.spec.tsx` assert each error kind returns `ok: false` with a `reason.kind` that maps to distinct UI copy. Code review: each `reason.kind` case in the render path must have distinct, specific user-facing text.

- [ ] **U4-5.** The Document Check scan state indicator is visible **at all times** during a scan. The four states map to specific user-facing labels and must transition in order (never skip from Idle to Done):
  - `Idle` → *"Drop a file or click to choose"*
  - `Reading` → *"Reading [filename] ([bytes read] / [total bytes])…"*
  - `Scanning` → *"Scanning — checking [N] protections…"*
  - `Done` → Exposure Report rendered
  No state is silent or anonymous. Rendering the file name in the `Reading` and `Scanning` states is required so users can verify the correct file is being processed.
  - *Constitution:* §IX
  - *Spec:* FR-D7 — "Scan state is visible at all times: Idle → Reading (bytes) → Scanning (rules count) → Done. No silent phases."
  - *Verification:* Unit test: mock `parseFile` to delay 200 ms; assert the "Reading" label renders before the mock resolves. Mock `scanText` to delay 200 ms; assert the "Scanning" label renders before the mock resolves. `pnpm test`.

- [ ] **U4-6.** When Email Guardian's 3-second scan budget is exhausted before all rules complete, the warning modal (if findings exist in the partial scan) or a scan-result notice (if no findings) **explicitly states** "Scanned X of Y protections." The user is never told "All clear" when only a partial scan ran.
  - *Constitution:* §IX — never silently skip a scan the user believes ran
  - *Spec:* FR-E2 — "Max 3 s total or auto-passes with a notice ('scanned partially — X/Y rules')"
  - *Verification:* E2E test: stub `scanText` to take 4 s; assert the result notice contains "of [total]" phrasing. Assert no "All clear" or "No findings" message appears when the scan was partial.

- [ ] **U4-7.** When a TierGate check blocks an action, the block is always **immediately visible** to the user via a `UpsellCard` or a modal. No action silently fails, silently truncates, or silently degrades. The `UpsellCard` must render synchronously with the block — not after a delay.
  - *Constitution:* §IX; §VI — "no silent truncation"
  - *Spec:* FR-C5 — "Free-tier limits block with an upsell card; no silent truncation"
  - *UI components:* §2 — `UpsellCard` is the standard component for all tier-gate blocks
  - *Verification:* Unit test: configure a `TierGate` returning `{ allowed: false }` for `"scan:monthly-limit"`; render the Document Check route; assert `UpsellCard` is in the DOM without any timeout. `pnpm test`.

- [ ] **U4-8.** The privacy guarantee *"🔒 This file stays on your device. Nothing is uploaded."* is visible within the Document Check UI at all times — in the Idle state (drop zone area) and in the Scanning state. It must not be hidden when a scan is in progress.
  - *PRD:* §4.4 — "'🔒 This file stays on your device. Nothing is uploaded.' visible in UI"
  - *Constitution:* §I; §IX — transparency about what the product does and does not do
  - *Verification:* E2E snapshot test: capture the Document Check UI in both Idle and Scanning states; assert the privacy guarantee text is visible in both screenshots.

---

## U5 — Tier Upsell Copy

> Constitution §VI: "Free tier is **capacity-limited, never capability-crippled**. All seven modules ship on Day 1 of v1.0… Paid tiers add scale, automation, multi-account, and family — not unlock-to-see features."
> `ui-components.md §2`: `UpsellCard` — "Contextual upgrade prompt rendered when a `check()` returns `allowed: false`."

- [ ] **U5-1.** Every `UpsellCard` pairs the specific limit hit with a concrete benefit of the next tier **in the same card**, in adjacent sentences. Both parts are required; a benefit without a limit, or a limit without a benefit, is a violation. Required pattern:
  - *"You've used [N] of your [limit] free scans this month."* ← specific limit
  - *"[Basic plan: 25 scans/month for €2.99.]"* ← concrete benefit with price
  - *Constitution:* §VI — the upgrade path must be clear and honest
  - *Spec:* FR-C5 — upsell card triggered by TierGate; FR-D3 — scan-limit upsell
  - *Verification:* Code review of `UpsellCard` render logic. Assert the card always receives both a `limitMessage` prop and a `benefitMessage` prop, and that both are non-empty strings. Unit test: render `UpsellCard` without `benefitMessage` — assert it throws a prop-type error.

- [ ] **U5-2.** Upsell copy never uses guilt, manufactured urgency, or FOMO language. The following patterns are **permanently forbidden** in all `UpsellCard` and tier-gate modal strings:
  - Guilt: *"You're leaving yourself unprotected"*, *"Don't be the person who gets hacked"*
  - Urgency: *"Limited time offer!"*, *"Hurry before it expires"*, *"Only available today"*
  - FOMO: *"You're missing out on protection"*, *"Others are upgrading now"*
  - Implied inadequacy of Free: *"Your protection is incomplete"*, *"Basic users get real protection"*
  - *Constitution:* §IV (consumer language); §VI (free tier is not crippled)
  - *Verification:* `node scripts/lint-copy.mjs` includes a hostile-upsell pattern check. Code review: any new `UpsellCard` copy must be reviewed against this list before merge.

- [ ] **U5-3.** Every `UpsellCard` includes a **clear dismissal path** — a [Maybe later] button or a [×] close icon — that the user can activate without engaging with the upgrade offer. Dismissal must not require a secondary confirmation.
  - *Constitution:* §II — user sovereignty; §V — no dark patterns
  - *Verification:* Component unit test: render `UpsellCard`; assert a dismiss affordance is present with `aria-label="Dismiss"` or `aria-label="Maybe later"`. Assert clicking dismiss unmounts the card.

- [ ] **U5-4.** Upsell copy correctly identifies **which tier** unlocks the gated feature. Features available from Basic onward say "Basic plan (€2.99/mo)"; features requiring Pro say "Pro plan (€9.90/mo)". No card says "Premium" (retired tier name), "Paid plan" (too vague), or "Upgrade" without specifying which tier and price.
  - *Spec:* §5 — three tiers: Free, Basic, Pro. "Premium" is retired.
  - *Verification:* `node scripts/lint-copy.mjs` includes a check for the retired term "Premium" in UpsellCard strings. Code review: each `UpsellCard` instance must reference the specific tier name and monthly price.

- [ ] **U5-5.** Free-tier limitations are framed as **capacity**, never as capability. Forbidden framings that imply the user is less protected:
  - ❌ *"Upgrade for real protection"*
  - ❌ *"Your account isn't fully protected"*
  - ❌ *"Basic users only get limited protection"*
  - Required framings that frame as capacity:
  - ✓ *"You've reached your 5 free scans for this month"*
  - ✓ *"Drive Audit covers your top 100 exposed files on Free — Basic covers 500"*
  - *Constitution:* §VI — "capacity-limited, never capability-crippled"
  - *Verification:* Copy review for every `UpsellCard` string in `_locales/en/messages.json`. `node scripts/lint-copy.mjs` — capability-framing patterns are in the banned-terms list.

- [ ] **U5-6.** Every `UpsellCard` includes a **[Learn more]** link that routes to a documentation page describing what the next tier adds, not directly to a payment page. Users should understand what they are buying before they commit. The payment flow is accessed via a secondary [Upgrade] CTA, not as the primary action.
  - *Constitution:* §II — user sovereignty; no dark patterns
  - *Verification:* Code review: `UpsellCard` component must accept a `learnMoreUrl` prop that renders a visible link. Any `UpsellCard` without `learnMoreUrl` fails the component prop-type check.

- [ ] **U5-7.** Features available at the next tier are described by **what they enable**, not by what Free lacks. The description of a Pro feature in an upsell card does not use the word "unlimited" as the primary selling point when a specific number is more meaningful (e.g., "25 scans/month" is more concrete than "unlimited scans").
  - *Constitution:* §VI; §IV — consumer language (specific > vague)
  - *Verification:* Copy review. "Unlimited" may be used for genuinely unlimited features (Pro Drive Audit, Pro custom rules) but must not be the only benefit stated.

---

## U6 — Severity Presentation

> Constitution §XIV: "Severity colors (critical/warning/info) are part of the token system, not ad-hoc."
> Design-tokens.md §11: "Severity is never communicated by color alone; pair every severity color with an icon and a textual label."
> UI-components.md §8: "Severity never communicated by color alone; always icon + text."

- [ ] **U6-1.** Every `FindingCard` in every module (Document Check, Email Guardian, Drive Audit, Calendar Audit) renders all three severity elements — **icon + text label + background/foreground color** — in the card header. Removing any one of the three is a violation, including in space-constrained layouts.

  | Severity level | Required icon | Required text label | Token pair |
  |---|---|---|---|
  | Critical | `AlertOctagon` (Lucide, 20 × 20) | "Critical" | `--severity-critical-bg` / `--severity-critical-fg` |
  | Warning | `AlertTriangle` (Lucide, 20 × 20) | "Warning" | `--severity-warning-bg` / `--severity-warning-fg` |

  - *Constitution:* §XIV
  - *UI components:* §6 — severity icon map is binding; §8 — "Severity never communicated by color alone"
  - *Design tokens:* §10 — severity color usage map
  - *Verification:* Component unit test for `FindingCard`: render with `severity="critical"` → assert `AlertOctagon` SVG and text "Critical" are in DOM. Render with `severity="warning"` → assert `AlertTriangle` SVG and text "Warning" are in DOM. `pnpm test`.

- [ ] **U6-2.** The Exposure Score numeral on the dashboard uses both the numerical value **and** a plain-language severity band label. The label must be visible (not `aria-hidden`) and uses the severity token colors:

  | Score | Badge color | Required text label |
  |---|---|---|
  | 90–100 | `--severity-success-*` | "Low exposure" |
  | 70–89 | `--severity-warning-*` | "Some exposure" |
  | 50–69 | `--severity-warning-*` elevated | "Moderate exposure" |
  | 0–49 | `--severity-critical-*` | "High exposure" |

  - *PRD:* §8 — "90–100 green · 70–89 yellow · 50–69 orange · 0–49 red"
  - *UI components:* §2 — `ExposureScore` specialized component
  - *Verification:* Unit test: render `ExposureScore` with score 85 → assert "Some exposure" text is in DOM and not `aria-hidden`. Render with score 40 → assert "High exposure" text. `pnpm test`.

- [ ] **U6-3.** The Email Guardian warning modal uses the **highest-severity finding** to set the modal's headline icon and label. If any Critical finding exists, the modal header shows `AlertOctagon` + "Critical"; if only Warnings exist, it shows `AlertTriangle` + "Warning." The modal header never shows only a color.
  - *PRD:* §5.1 — warning modal shown when findings exist
  - *Spec:* FR-E3 — "show warning modal per PRD §Warning Modal Design"
  - *Verification:* E2E test: send an email with one Critical and one Warning finding; assert the modal header shows `AlertOctagon` and "Critical". E2E test: send an email with only Warning findings; assert the modal header shows `AlertTriangle` and "Warning".

- [ ] **U6-4.** A "no findings" result from any module is never blank or silent. It must render a **success state** using `CheckCircle2` icon + "No sensitive data found" text + `--severity-success-*` color tokens. This applies to: Document Check (Exposure Report), Drive Audit (audit results), Email Guardian (scan passes without findings).
  - *Constitution:* §IX — fail loud, but also succeed loud: a clean result is information the user needs
  - *UI components:* §6 — "CheckCircle2 for success"
  - *Verification:* Unit tests for each module's result rendering: mock `scanText` returning `{ findings: [] }`; assert the "No sensitive data found" success state renders with the `CheckCircle2` icon.

- [ ] **U6-5.** Severity labels are **identical** across all modules. The same finding severity in Document Check, Drive Audit, Email Guardian, and Calendar Audit uses the same text, the same Lucide icon, and the same token color. No module uses an alternative label for the same severity level (e.g., "High" instead of "Critical", "Medium" instead of "Warning").
  - *Constitution:* §XIV — design system discipline; consistent token usage
  - *Verification:* Code review: grep `src/popup/routes/**` and `src/content/**` for severity label strings — all occurrences of `severity="critical"` must render "Critical", all `severity="warning"` must render "Warning". No other severity text strings exist.

- [ ] **U6-6.** The Drive Audit permission-severity indicators (public link, external users with edit, externals with view, stale shares) each have a severity level (Critical or Warning) with the matching icon and text. The severity level is chosen by the cross-reference rule: *"file contains PII AND is public → Critical; file has external collaborators but no PII detected → Warning."*
  - *PRD:* §6.3 — "This file contains your IBAN AND is shared with anyone who has the link" — the differentiator
  - *Spec:* AC-A4 — "A file containing an IBAN and shared 'Anyone with link' surfaces as Critical with both reasons"
  - *Verification:* `tests/acceptance/drive.spec.ts` AC-A4: assert a file with an IBAN + public-link permission renders as Critical with both the `AlertOctagon` icon and the text "Critical" in its `FindingCard`.

- [ ] **U6-7.** The share-score PNG generated by Document Check and any share-score export contains **no severity color interpretation** that could be misread without the icon or label (since the PNG is a static image). The PNG must include both a textual score band label ("Low exposure" / "Some exposure" / etc.) and the numerical score. It must not rely on color alone to communicate the result.
  - *Constitution:* §XIV — severity color discipline extends to exported assets
  - *Spec:* FR-D6 — "generates a branded PNG with zero PII"
  - *Spec:* AC-D4 — "Share Score PNG contains no detector matches (regression-scanned by test)"
  - *Verification:* Unit test: render the share-score canvas; assert the canvas `toDataURL()` produces an image that, when OCR-scanned by `scanText`, finds the score band label text present and finds no PII matches.

---

## UX Sign-off (Reviewer table)

> Apply to every PR that modifies: an onboarding screen, a user-visible string, a tier-gate interaction, an error or failure state, a scan-state indicator, a severity label, or a UpsellCard.

| Area | Checklist items | Reviewer signs off |
|---|---|---|
| First-run ≤5 clicks (happy path) | U1-1, U1-2 | |
| Preset preview — no jargon | U1-5 | |
| No banned terms in any UI string | U2-1, U2-2 | |
| Module names consistent | U2-4 | |
| Advanced controls hidden by default | U3-1, U3-2, U3-4 | |
| No persistent upsell on clean dashboard | U3-7 | |
| Fail-loud: named errors, no silent skips | U4-1, U4-4, U4-5, U4-7 | |
| Partial scan disclosed explicitly | U4-6 | |
| Privacy guarantee visible during scan | U4-8 | |
| Upsell pairs limit + benefit | U5-1 | |
| Upsell has dismiss path | U5-3 | |
| No hostile upsell language | U5-2, U5-5 | |
| Severity: icon + text + color (all three) | U6-1 | |
| No-findings success state present | U6-4 | |
| Severity labels consistent across modules | U6-5 | |

---

*This checklist is normative. Items marked `[!]` block merge. Items marked `[-]` require a one-line justification in the PR comment.*
