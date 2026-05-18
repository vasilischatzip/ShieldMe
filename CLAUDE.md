# CLAUDE.md — Claude Code Memory for ShieldMe

> Read on every Claude Code session. Project conventions live here so prompts stay short.

## What this project is

ShieldMe — **client-side privacy audit web app** for personal data exposure. Hosted SPA at `/` (Vercel/Cloudflare/Pages). **Six modules** (v1.0 launch scope, post-pivot 2026-05-17): Rules, Document Check, Email Scanner (paste-or-upload-.eml — replaces extension's Gmail intercept), Cloud Audit (Drive + Calendar via OAuth), Exposure Radar, Privacy Toolkit. All scanning client-side; the only network traffic is HIBP k-anonymity, the user's own Google OAuth flow, and optional opt-in telemetry. **Free and open-source** — MIT-licensed, hosted on GitHub Pages, no pricing tiers. Chrome extension variant parked in `backlog.md` as `BL-platform-chrome-extension`.

## Read order before any task

1. `.specify/memory/constitution.md` — non-negotiable principles. Every PR is checked against it.
2. `specs/001-shieldme-mvp/spec.md` — WHAT and WHY (binding).
3. `specs/001-shieldme-mvp/plan.md` — HOW (tech stack, folder layout).
4. `specs/001-shieldme-mvp/contracts/` — interface contracts you must satisfy.
5. `specs/001-shieldme-mvp/threat-model.md` + `security-controls.md` — every security-touching task must pass through these.
6. `specs/001-shieldme-mvp/backlog.md` — confirms a feature is in v1.0 or backlogged. Refuse to implement backlog items in a Claude Code session without an explicit graduation PR.
7. The specific task entry in `specs/001-shieldme-mvp/tasks.md` and the files it lists under `Files:`.

Never load full file contents speculatively. Read only what the task references.

## Stack

**Core:** Preact 10 + `@preact/signals` + `preact-iso` (SPA router) · TypeScript 5 strict · Vite 5 (standard SPA) · Vitest + happy-dom + Playwright · pnpm 9 · `localStorage` + IndexedDB via `idb` · Web Crypto AES-GCM 256 · JSON locale files served from `/locales/{en,el}.json`.

**UI:** CSS Modules + tokens in `src/ui/tokens/`. Manrope (OFL) display + Inter (OFL) body. Lucide icons (ISC). Floating UI (MIT) for positioning. Motion One (MIT) for animation. No Tailwind, no CSS-in-JS, no React-only component library. Full UI stack defined in `contracts/ui-components.md`.

**Security:** Trusted Types, per-account derived keys (HKDF), storage HMAC seals, Ed25519-signed kill-switch, Sigstore-signed releases (M2+), reproducible builds. Full map in `security-controls.md`.

## Hard rules

1. **Egress allowlist.** Single source of truth: `contracts/integration-apis.md` §1. Adding a host requires a constitutional amendment OR a feature whose spec already lists it. Never edit `scripts/check-egress-allowlist.mjs`'s allow-list directly — it loads from the contract.
2. **No CDN.** All libraries bundled and served same-origin. CSP `script-src 'self' 'wasm-unsafe-eval'`. No `eval`, no `new Function`.
3. **Client-side only.** No server-side scanning. External API calls send hashed/anonymized identifiers OR the user's own OAuth/API key against their own account.
4. **TierGate is the only place tier checks happen.** Don't sprinkle `if (tier === 'free')` anywhere. Call `TierGate.check(feature, ctx)`.
5. **Detector purity.** Detectors are pure functions of `DetectorContext`. No I/O, no `Date.now()` outside `ctx.clock`. (`chrome.*` is permanently forbidden in this web-app codebase — ESLint enforces.)
6. **Source maps shipped.** No obfuscation in security-sensitive paths (detection engine, storage, crypto).
7. **Consumer language.** UI strings forbid: DLP, regex, PII, classifier, entropy, OAuth scope, HIPAA, GDPR, PCI. The copy linter (`scripts/lint-copy.mjs`) enforces this.
8. **No `chrome.*` API references.** This is a web app, not an extension. ESLint rule `no-restricted-globals` forbids `chrome` globally with no carve-outs.

## Code conventions

- All async I/O takes its dependencies via constructor / props (LocalStore, Idb, Crypto, TierGate, Clock, Telemetry). No global singletons.
- Errors are typed unions, never thrown raw `Error`.
- Pure functions go in `src/core/**` and `src/detectors/**`. Side-effecting code goes in `src/{background,content,popup,options,offscreen,radar,drive,email}/**`.
- Tests mirror `src/` paths under `tests/unit/`. Acceptance tests under `tests/acceptance/<module>.spec.ts` map 1:1 to AC-* IDs in `spec.md`.

## Verification before concluding any task

```bash
pnpm verify
```

This runs typecheck, unit tests, corpus regression, e2e, bundle budget, egress allowlist, copy linter, CSP validator, a11y. CI runs the same. If any check fails, the task is not done.

## Token-efficient prompting

When invoking a sub-agent or asking the user to invoke Claude Code, reference file paths, never paste content. Each task in `tasks.md` is self-contained with its `Files:` list — that's all the agent needs.

## Models — pick the cheapest model that gets the work done

| Work | Model | Why |
|---|---|---|
| Most implementation tasks (single module, well-scoped, contract exists) | **Claude Sonnet 4.6** | Best quality-per-token for typical TDD work. Default. |
| Detector implementation + corpus tuning | **Claude Sonnet 4.6** | Pattern-heavy work that benefits from solid reasoning. |
| New contract design, cross-module refactor, security-controls changes, constitution amendments, `/speckit.analyze` cross-doc reviews | **Claude Opus 4.6** | Reasoning depth matters; cost justified once per concern. |
| `/speckit.tasks` generation, `/speckit.checklist` first drafts | **Claude Opus 4.6** | One-shot, high-stakes; the output gates everything downstream. |
| Find-replace, formatting, boilerplate scaffolding, adding tests that mirror an existing pattern, doc edits | **Claude Haiku 4.5** | Mechanical work, fast, cheap. |
| Reviewing a PR for constitution violations | **Claude Sonnet 4.6** | Needs to understand the constitution; Haiku misses nuance. |
| Editing `_locales/*.json` for new strings | **Claude Haiku 4.5** | Pure translation. |

**Cost-aware default:** start with Haiku, escalate to Sonnet on first failure, escalate to Opus only if Sonnet repeatedly underperforms on the same task. Never use Opus for mechanical work; never use Haiku for cross-module design.

## Repo state (2026-05-17, post-pivot)

The project pivoted from Chrome MV3 extension to client-side web app on 2026-05-17. Previous extension scaffolding (`src/manifest.ts`, `src/background/`, `src/content/`, `src/offscreen/`, `_locales/`, MV3-specific tests) is being removed. Conversion in progress; consult `tasks.md` for current state. Items moved to `backlog.md`: `BL-platform-chrome-extension`, `BL-email-gmail-content-script`, `BL-kill-switch-system`.

## When the user asks for a feature

Refuse if it lacks a spec entry. Push back to the planning layer (the assistant in Cowork mode). Do not invent specs in Claude Code.
