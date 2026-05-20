# Claude Code briefing — ShieldMe handoff from Cowork session, 2026-05-19

You are picking up ShieldMe from a Cowork session that fixed the GitHub Pages deploy, pushed an initial UI pass, and closed out task T064/T065 (Protection Rules UI + tests). The user has flagged that the live site at `https://vasilischatzip/github.io/ShieldMe/` still looks like a stretched-out Chrome extension popup rather than a real web app — that is your first and highest-priority task. After that, work the remaining task graph in the order below.

## Read these before doing anything

1. `CLAUDE.md` — project conventions, hard rules, model-selection guidance. Non-negotiable.
2. `.specify/memory/constitution.md` — every PR is checked against it.
3. `specs/001-shieldme-mvp/spec.md` — WHAT and WHY.
4. `specs/001-shieldme-mvp/plan.md` — HOW (tech stack, folder layout).
5. `specs/001-shieldme-mvp/tasks.md` — the task graph. As of HEAD `9b01958` (commit `feat: Mota-style modern UI; T064+T065 Protection Rules UI + tests`): 89 done, 4 partial (`[~]`), 125 pending.
6. `specs/001-shieldme-mvp/contracts/` — interface contracts you must satisfy.
7. `specs/001-shieldme-mvp/backlog.md` — confirm a task is in v1.0 before implementing.

## Repo state — what is real

Verified done (with evidence in tasks.md):
- Pivot conversion (TP2-TP12, TP14-TP17): web-app SPA on Vite, GitHub Pages deploy green, base-path routing works.
- Detection engine + 100+ detectors + 25 validators (T001-T047 mostly done; some marked `[~]` as drift).
- Protection Rules UI shipped today (T064, T065) — `src/app/routes/Rules.tsx` + sub-components in `src/app/routes/rules/`, 48 vitest cases in `tests/unit/app/routes/rules.spec.tsx`.
- DetectorRegistry tests (T002).
- Exposure Radar broker checklist + providers (T123, T124).

Verified pending / partial:
- **TP1 + TP9 — dead extension files still on disk.** `src/manifest.ts`, `src/background/`, `src/content/`, `src/offscreen/`, `src/popup/`, `src/options/`, `_locales/`, `src/app/App.legacy.tsx`, `src/app/main.legacy.tsx`, the kill-switch files, the old onboarding e2e tests — all ESLint-ignored, not imported anywhere, but never `git rm`'d. The Cowork sandbox could not unlink them; you can. Run the exact command in the TP1/TP9 notes in `tasks.md`, then prune the matching entries from `eslint.config.js` `ignores` list.
- **T018/T019 — tax-ID detectors `[~]` partial.** Validators present, but no dedicated per-country tax-ID detectors (US ITIN, UK UTR, FR INSEE, etc.) — currently overlap with national-ID + money.tax-beta.
- **T038/T039 — cloud-key detectors `[~]` partial.** Generic `api-key.ts` covers some vendors but per-vendor detectors (AWS S3, GitHub PAT, Stripe pub/secret/webhook, Twilio, SendGrid, Anthropic, OpenAI, Cloudflare, Vercel, Datadog, etc.) not split out. These vendors are the keys most users will paste — worth splitting.
- T066-T068 — security controls (Trusted Types, storage HMAC, etc.).
- T069-T074 — M1 acceptance tests + M1 phase gate.
- T075-T215 — M2 through M7 (identity, cloud audit, exposure radar UI, calendar, privacy toolkit, microsoft providers, billing, polish, submission).

## Priority order

### Priority 0 — Web-app UX redesign (do FIRST)

The current layout is an extension popup wearing a dark theme. Look at `src/app/Layout.tsx`, `src/app/styles.css`, `src/app/styles.modern.css`, `src/app/routes/Dashboard.tsx` and the Rules UI you just shipped (`src/app/routes/Rules.tsx`). They were built popup-sized: top nav with horizontal pills, single-column main, tiny gauges. At 1440px+ this looks anemic and amateurish.

Before writing code, do Phase 1 design thinking on the bench:
- Compare patterns from privacy/security web apps that get this right: 1Password 8, Bitwarden web vault, Cloudflare dashboard, Vercel dashboard, Linear, Notion. Pull screenshots if you can.
- Decide on information architecture: persistent left rail vs top nav? Single-page dashboard vs route-per-module? Side drawer for findings? Command palette (Cmd-K)?
- Decide on canvas: max-width 1280-1440, multi-column where appropriate, breathing room.

Propose 2-3 IA directions in writing (in a new `docs/design/web-app-ia-options.md`) before implementing. Get the user's pick, then execute. Estimate: 500-1500 lines of CSS/TSX changes across Layout, styles.modern.css, Dashboard, Rules.

**Reference the user gave:** https://mota-platform.webflow.io/ — that's the visual energy they want (dark, bold display type, gradient accents, layered cards, generous whitespace). But Mota is a marketing site; you need to translate that energy into an *app* layout, not a landing page.

### Priority 1 — TP1/TP9 cleanup + M1 close-out

Order:
1. **TP1 + TP9** — `git rm` the dead extension files (see exact command in tasks.md). Prune ESLint ignores. Run `pnpm verify`. Mark `[x]`.
2. **TP18** is already done (web-app shell CSS). After your Priority-0 redesign, add a TP19 for "web-app UX rearchitecture" or fold into existing entries.
3. **T066-T068** — security controls (Trusted Types policy, storage HMAC seals, no-secret-logging linter is already in place — verify it works).
4. **T069-T073** — M1 acceptance tests. These are Playwright tests, so dev server needs to run. Spec paths assume extension; adapt to web-app (`playwright.config.ts` should already point at the SPA).
5. **T074** — M1 phase gate. Run `pnpm verify`. Document anything that regressed.

### Priority 2 — Detector gap-fills (the `[~]` partials)

Cheap, high-value:
1. **T018/T019** — write per-country tax-ID detectors. Each one is ~50 lines + corpus.
2. **T038/T039** — split out per-vendor cloud-key detectors (~20 vendors). Each one is ~30 lines + corpus. These are the keys users actually leak; the generic detector is too noisy.

### Priority 3 — M2 through M7

Work the task graph in order: T075-T215. M2 is identity + multi-account + email guardian outbound. Read each task's `Depends on:` and respect the order.

## Model selection (from CLAUDE.md)

- **Sonnet 4.6** (default): most implementation tasks, detector work, copy linter changes, PR reviews.
- **Opus 4.6**: contract design, cross-module refactor, security-controls changes, constitution amendments, `/speckit.analyze` reviews. Use sparingly — once per concern.
- **Haiku 4.5**: find-replace, formatting, boilerplate scaffolding, mirroring existing test patterns, locale edits.

**Cost-aware default:** Start Haiku, escalate to Sonnet on first failure, escalate to Opus only if Sonnet repeatedly fails on the same task.

## Process discipline

- One task at a time. After each task, run its specific verification command (in the task entry), then `pnpm verify`. Mark `[x]` only if both pass.
- When you discover a task is already done in code (drift), mark `[x]` with `**Done YYYY-MM-DD:** <one-line evidence>`. Same pattern Cowork used for the audit pass.
- When implementation diverges from spec (filename, layout, scope), prefer `[~]` partial with a follow-up note rather than `[x]`.
- **Never invent specs.** If you find a feature request without a spec entry, push back to the planning layer.

## Known traps

- **`pnpm/action-setup@v4` rejects `version:`** when `package.json` has `packageManager`. Fixed in `.github/workflows/{ci,deploy}.yml` — do not re-introduce.
- **GitHub Pages base path** = `/ShieldMe/`. The SPA uses `src/app/base.ts` (`link`, `routePath`, `stripBase` helpers) — every new route + nav entry must go through them.
- **preact-iso normalizes trailing slashes** off `location.pathname` before matching. Use `routePath()` for `<Route path>`, never raw strings.
- **CSP forbids CDN**. Fonts (Manrope, Inter) currently fall back to system sans-serif because nothing's bundled. If you want the real fonts, drop `.woff2` files in `public/fonts/` and add `@font-face` rules — do NOT add a CDN link.
- **Constitution §XVI**: no `chrome.*` anywhere in `src/**` or `tests/**`. ESLint enforces.

## First action

Don't start coding. Read CLAUDE.md, constitution.md, spec.md, plan.md, tasks.md in that order. Then survey the current `src/app/` tree and `src/app/styles.modern.css`. Then write `docs/design/web-app-ia-options.md` proposing 2-3 IA directions for the Priority-0 redesign. Stop and ask the user to pick. Only after they pick: build.

The user values brutally honest assessment, prose over bullets, attacking ideas before implementing them. Don't softpedal. If something in this brief is wrong or stale, say so.
