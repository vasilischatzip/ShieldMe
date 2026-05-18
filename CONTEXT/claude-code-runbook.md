# Claude Code Runbook — ShieldMe v1.0

> Every prompt you paste into Claude Code, in order, with the model to set first. Bookmark this file. The assistant in Cowork mode maintains it; if a prompt changes, this file changes first.

---

## How to switch model in Claude Code

In an interactive Claude Code session, type:

```
/model claude-haiku-4-5-20251001
/model claude-sonnet-4-6
/model claude-opus-4-6
```

Or set permanently in `.claude/settings.json`:

```json
{
  "model": "claude-sonnet-4-6"
}
```

The default for the project is **Sonnet 4.6**. Switch up or down per prompt below.

---

## Sequence overview

| # | Prompt | Model | Wall-clock | Output |
|---|---|---|---|---|
| 1 | Install spec-kit | Haiku 4.5 | ~5 min | `.specify/templates/`, `.claude/commands/speckit.*.md`, scripts |
| 2 | Bootstrap M0 | Sonnet 4.6 | ~15–30 min | `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `src/`, `tests/`, `.github/workflows/ci.yml`; `pnpm verify` green |
| 3 | Cross-doc analyze | Opus 4.6 | ~3 min | drift report you paste back to me |
| 4 | Generate tasks.md | Opus 4.6 | ~10 min | `specs/001-shieldme-mvp/tasks.md` (~180–250 tasks) |
| 5a–5e | Five checklists | Sonnet 4.6 (each) | ~5 min each | `specs/001-shieldme-mvp/checklists/{security,privacy,accessibility,ux,store-submission}.md` |
| 6 | Per-task implementation | Sonnet 4.6 default; Haiku for `[H]`-marked tasks; Opus for `[O]`-marked | varies | source code under `src/`, tests under `tests/` |

Between every step, send me the output. I review, fix drift in SDD markdown, write the next prompt or batch.

---

## Prompt 1 — Install spec-kit

**Set model first:** `/model claude-haiku-4-5-20251001`

```claude-code-prompt
Read first:
- C:\Users\iaBox\Downloads\ShieldMe\CLAUDE.md
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md
- https://github.com/github/spec-kit (the project's README and the structure of an installed repo)

Goal: Install GitHub spec-kit's tooling layer (templates, scripts, slash commands) into this repo WITHOUT regenerating or overwriting any existing artifact in `.specify/memory/`, `docs/`, or `specs/001-shieldme-mvp/`. We are in "Frame C" — keep our hand-rolled artifacts, add the missing tooling so slash commands work.

Constraints (NON-NEGOTIABLE):
- Do NOT modify `.specify/memory/constitution.md` (already authored).
- Do NOT modify any file under `specs/001-shieldme-mvp/` (already authored: spec.md, plan.md, research.md, data-model.md, threat-model.md, security-controls.md, backlog.md, contracts/*, quickstart.md).
- Do NOT modify any file under `docs/` (already authored).
- Do NOT modify `CLAUDE.md` or anything in `CONTEXT/`.
- Do NOT run `/speckit.constitution`, `/speckit.specify`, `/speckit.plan`, or any slash command that would overwrite existing content.
- DO install only NEW files: `.specify/templates/**`, `.specify/scripts/**`, `.claude/commands/speckit.*.md`, and `.claude/settings.local.json` if needed.

Steps:
1. Use `uvx specify init --here` (or the equivalent supported install command). If `uvx` isn't available, fall back to cloning github.com/github/spec-kit, copying only the tooling directories listed above, and discarding any sample content that would conflict.
2. Verify the install: `.specify/templates/spec-template.md`, `.specify/templates/plan-template.md`, `.specify/templates/tasks-template.md`, `.specify/templates/checklist-template.md`, `.specify/scripts/create-new-feature.sh` (or `.ps1`), `.specify/scripts/setup-plan.sh`, `.specify/scripts/update-agent-context.sh`, and `.claude/commands/speckit.constitution.md`, `speckit.specify.md`, `speckit.clarify.md`, `speckit.plan.md`, `speckit.tasks.md`, `speckit.implement.md`, `speckit.checklist.md`, `speckit.analyze.md` should all exist.
3. Diff-check: produce a list of every file you created or moved. If any overlap with the protected paths above, abort and report.
4. Do NOT add anything to `.gitignore` that spec-kit's docs don't explicitly require.
5. Do NOT run `update-agent-context.sh claude` — `CLAUDE.md` is hand-authored.

Success criteria:
- All eight `speckit.*.md` slash commands exist under `.claude/commands/`.
- All four template files exist under `.specify/templates/`.
- The three scripts exist under `.specify/scripts/` (or their `.ps1` equivalents on Windows).
- `git status` shows ONLY new files (none of the protected paths modified).
- Final summary lists every file created and confirms no protected file was touched.

Do NOT proceed beyond install. Don't run `/speckit.tasks` or `/speckit.checklist` in this session.
```

After: paste the file list it reports. I confirm or flag.

---

## Prompt 2 — Bootstrap M0 (the green baseline)

**Set model first:** `/model claude-sonnet-4-6`

```claude-code-prompt
Read first (in this order):
- C:\Users\iaBox\Downloads\ShieldMe\CLAUDE.md
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md (especially §X QA gate, §XII supply chain, §XIV design system)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\plan.md (especially §1 Tech Stack, §2 Folder Layout, §3 Build & Bundle, §6 QA Automation)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\quickstart.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\integration-apis.md (§1 — egress allowlist is the SOURCE OF TRUTH for `scripts/check-egress-allowlist.mjs`)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\design-tokens.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\ui-components.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\security-controls.md

Goal: Bootstrap Phase M0 from `plan.md` — an empty MV3 extension that loads, builds, typechecks, lints, and passes a placeholder unit + e2e test. No business logic. No detectors. No real popup UI beyond a "Hello ShieldMe" placeholder using the production design tokens. Green baseline that future tasks build on.

Constraints (NON-NEGOTIABLE):
- Do NOT touch any file under `.specify/memory/`, `specs/`, `docs/`, `CONTEXT/`, `CLAUDE.md`. Read-only references.
- Do NOT introduce any dependency outside what `plan.md` §1 and `contracts/ui-components.md` §1 list (Preact 10, @preact/signals, @crxjs/vite-plugin, Vite 5, Vitest, happy-dom, Playwright, eslint, eslint-plugin-security, prettier, idb, @floating-ui/dom, lucide-preact, motion, date-fns, fuse.js, valibot, sinon-chrome for tests, @noble/ed25519 for signature verification, @noble/hashes for HMAC). If a transitive dep needs to be added, justify in a comment.
- Do NOT add Tailwind, CSS-in-JS, or any React-only component library.
- Egress allowlist constant in `src/security/egress-allowlist.ts` MUST be derived from `contracts/integration-apis.md` §1 at build time — write `scripts/extract-egress-allowlist.mjs` that parses the contract's table and emits a TS module. Never hand-duplicate the list.

Pre-flight cleanup:
1. Delete any existing `node_modules/` directory at the repo root (orphan from prior setup).
2. Delete any `.pnpm-store` cache directories at the repo root.

Files to create:
- `package.json` (Node 20 engines, pnpm 9 packageManager, all `pnpm verify` sub-scripts)
- `pnpm-lock.yaml` (generated by `pnpm install`)
- `.npmrc` (`engine-strict=true`, `auto-install-peers=true`)
- `vite.config.ts` (CRXJS plugin, manualChunks per parser per plan §3, source-map output)
- `tsconfig.json` (strict, path aliases for `@core/`, `@detectors/`, `@parsers/`, `@cloud/`, `@email/`, `@radar/`, `@calendar/`, `@toolkit/`, `@security/`, `@ui/`)
- `tsconfig.node.json` for Vite config
- `eslint.config.js` (flat config; @typescript-eslint, eslint-plugin-security, no-eval ban, custom rule scaffolding for no-secret-logging and no-raw-color-tokens placeholders)
- `.gitignore` (extend to include dist/, coverage/, .vite/, *.local, .env, .env.test, tests/e2e/.auth/, node_modules/)
- `.env.example` (OAUTH_CLIENT_ID=, PLAUSIBLE_HOST=, SELECTORS_HOST=, SENDER_REP_HOST=, ENTITLEMENT_HOST=, STRIPE_PUBLISHABLE_KEY=, HIBP_API_KEY_DEV=)
- `src/manifest.ts` (typed manifest with: name "ShieldMe", version "0.1.0", required permissions activeTab + storage, optional host_permissions for mail.google.com, haveibeenpwned.com, googleapis.com — DECLARED but not granted at install per Constitution §III)
- `src/popup/index.html`, `src/popup/main.tsx`, `src/popup/App.tsx` (placeholder "ShieldMe — install successful" using Manrope display + Inter body via `src/ui/tokens/index.css`)
- `src/popup/main.module.css`
- `src/options/index.html`, `src/options/main.tsx` (placeholder)
- `src/background/service-worker.ts` (skeleton install handler)
- `src/offscreen/parser.html` (empty placeholder)
- `src/content/gmail/index.ts` (skeleton guarded by feature flag default OFF)
- `src/core/tier-gate.ts` (preview resolver — everyone gets `tier: "preview"` per plan §4)
- `src/core/storage.ts` (LocalStore interface + chrome.storage.local impl per contracts/storage-schema.md §1, with HMAC seal stub per security-controls C-SEAL-1)
- `src/core/crypto.ts` (Web Crypto AES-GCM wrapper stub)
- `src/core/i18n.ts` (Chrome `_locales/` accessor)
- `src/security/egress-allowlist.ts` (AUTO-GENERATED — do not edit by hand)
- `src/security/csp.ts` (exports the production CSP string per security-controls L2)
- `src/security/trusted-types.ts` (the `shieldme` policy stub per security-controls C-CS-1)
- `src/security/kill-switch-keys.ts` (Ed25519 public key constant stub with TODO comment)
- `src/ui/tokens/reference/colors.css`, `typography.css`, `space.css`, `motion.css`, `radii.css` (per contracts/design-tokens.md §3-9 — production palette inferred MOTA values)
- `src/ui/tokens/semantic/light.css`, `dark.css`, `shared.css` (per contracts/design-tokens.md §4)
- `src/ui/tokens/reset.css`, `index.css` (entry)
- `src/ui/fonts/` (subset WOFF2 files for Manrope variable + Inter variable, Latin + Greek subsets; if licensing requires building these from upstream, write `scripts/build-fonts.mjs` to fetch from the official OFL sources via npm packs and subset with `glyphhanger` or `subfont`)
- `_locales/en/messages.json`, `_locales/el/messages.json` (placeholder keys with one welcome string each)
- `scripts/check-bundle-budget.mjs`, `check-egress-allowlist.mjs`, `verify-csp.mjs`, `lint-copy.mjs`, `extract-egress-allowlist.mjs`, `check-licenses.mjs`, `check-reproducible.mjs` (per security-controls C-SUP-*)
- `tests/unit/core/tier-gate.spec.ts` (one passing test: `TierGate.check('document-scan')` returns `{ allowed: true }` in preview mode)
- `tests/unit/security/egress-allowlist.spec.ts` (asserts generated module matches contract)
- `tests/unit/security/storage-seal.spec.ts` (asserts HMAC seal verification mutates-to-recovery on tamper per C-SEAL-1)
- `playwright.config.ts` (loads dist/ as unpacked extension)
- `tests/e2e/install.spec.ts` (extension loads, popup opens, "ShieldMe" text visible, design tokens applied to root)
- `.github/workflows/ci.yml` (Node 20, pnpm cache, runs `pnpm verify` — all checks per Constitution §X)
- `CHANGELOG.security.md` (empty initial file per security-controls §5)
- `docs/deps-rationale.md` (one entry per direct dep ≥5,000 LoC, per security-controls C-SUP-7)

After creating files:
1. Run `pnpm install` (creates pnpm-lock.yaml).
2. Run `pnpm verify`. Must pass. This means: typecheck, lint, unit tests, e2e (Playwright launches Chromium with --load-extension=dist/), bundle budget, egress allowlist, CSP, copy linter, license audit, lockfile integrity, `pnpm audit --prod --audit-level=high`, a11y all green.
3. If any check fails, fix it WITHOUT expanding scope. Do not add features to make a check pass — fix the test or the placeholder.

Success criteria:
- `pnpm install` clean.
- `pnpm verify` exits 0.
- Loading `dist/` as unpacked extension at chrome://extensions shows the popup with "ShieldMe — install successful" rendered in Manrope (heading) + Inter (body) with the production palette applied.
- `git status` shows new files only — none of `.specify/memory/`, `specs/`, `docs/`, `CONTEXT/`, `CLAUDE.md` modified.
- Total bundle size < 5 MB (we're nowhere near the 25 MB budget yet).

Report at the end: list of files created, output of `pnpm verify`, bundle size summary, and any item you stubbed/skipped with the reason.
```

After: paste the `pnpm verify` output and bundle summary. I confirm or flag.

---

## Prompt 3 — Cross-doc consistency analyze

**Set model first:** `/model claude-opus-4-6`

```claude-code-prompt
This is the project's cross-doc consistency check. Equivalent in spirit to `/speckit.analyze` but explicitly includes ALL hand-rolled artifacts beyond the spec-kit defaults.

Read every file below. Look for: contradictions between docs, references to entities that don't exist, terminology drift, version mismatches, broken cross-doc links, ACs that don't have matching FRs, FRs that don't have matching ACs, contract types referenced in spec but not declared in contracts, detector IDs in spec/presets that don't exist in `docs/detector-catalog.md`, egress hosts in spec not in `contracts/integration-apis.md` §1, tier matrix mismatches across spec/data-model/integration-apis/research.

Files:
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md (v1.3.0)
- C:\Users\iaBox\Downloads\ShieldMe\CLAUDE.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\PRD.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\engineering-qa.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\detector-catalog.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\protection-presets.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\testing-fixtures.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\spec.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\plan.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\research.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\data-model.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\quickstart.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\threat-model.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\security-controls.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\backlog.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\detection-engine.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\storage-schema.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\integration-apis.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\identity-providers.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\storage-providers.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\email-providers.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\calendar-providers.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\design-tokens.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\ui-components.md

Output (Markdown):
1. CRITICAL — anything that would block implementation (missing definitions, contradictory hard rules).
2. HIGH — terminology drift, broken links, version mismatches.
3. MEDIUM — clarity gaps, undocumented assumptions, ACs missing corresponding tests references.
4. LOW — formatting, ordering suggestions.
5. SUMMARY — count per severity, top 5 things to fix first.

For each finding: cite the exact file paths and line numbers where the drift appears. Do NOT propose fixes — just identify drift. Fixes are owned by the Cowork-mode planning assistant; you do the diagnosis.

Do NOT modify any file. Report only.
```

After: paste the report. I patch drift in SDD markdown.

---

## Prompt 4 — Generate tasks.md

**Set model first:** `/model claude-opus-4-6` (after analyze drift is patched)

```claude-code-prompt
Generate `specs/001-shieldme-mvp/tasks.md` — the full ordered task graph for v1.0 implementation. Use `.specify/templates/tasks-template.md` as the structural template if it exists; otherwise use the layout described in `plan.md` §5.

Read first:
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\spec.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\plan.md (especially §5 phased delivery — M0 already done by Prompt 2, start tasks at M1)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\research.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\data-model.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\security-controls.md
- All files in C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\
- C:\Users\iaBox\Downloads\ShieldMe\docs\detector-catalog.md (for the M1 detector subset)
- C:\Users\iaBox\Downloads\ShieldMe\docs\protection-presets.md

Task ID convention:
- `T001` … `Tnnn` ordered.
- `[P]` marker if the task can run in parallel with adjacent tasks (no shared files).
- `[H]` model marker if the task is mechanical (Haiku 4.5 sufficient).
- `[O]` model marker if the task requires deep reasoning (Opus 4.6 — cross-module design only).
- Tasks without `[H]` or `[O]` default to Sonnet 4.6.

Per task, required fields:
- `Id:` task id (TNNN)
- `Title:` short imperative
- `Phase:` M1 | M2 | M3 | M4 | M5 | M6 | M7
- `Module:` Rules | Document Check | Email Guardian | Cloud Audit | Exposure Radar | Calendar Audit | Privacy Toolkit | Identity | Cross-cutting
- `Spec refs:` AC- / FR- / NFR- / R- IDs satisfied
- `Files:` list of file paths the task creates or modifies (relative to repo root)
- `Depends on:` list of task IDs that must complete first
- `Verification:` shell commands (typically `pnpm test:unit src/<module>/**` and `pnpm verify` at phase boundaries)
- `Notes:` security-controls references, constitution-principle references, edge cases

Discipline:
- TDD: every implementation task has a paired test task that comes first (e.g., T042 = "Write failing tests for IBAN detector"; T043 = "Implement IBAN detector to make T042 pass").
- Detector tasks are grouped by category (My Money, My Identity, …), then by detector ID within category, then by tier-1 country.
- Identity + multi-account tasks (M2) come before any per-account namespacing tasks in modules.
- Security-controls tasks are seeded throughout, not lumped at the end. Examples: HMAC seal verification (C-SEAL-1) is part of M1 storage tasks; Trusted Types policy (C-CS-1) lands in M2 content-script tasks; per-account derived keys (C-KEY-1) in M2.
- Each new contract gets a "fake" task before any real implementation (e.g., T015 = "Write FakeIdentityProvider for tests"; T016 = "Implement GoogleIdentityProvider against contract").
- Backlog items are NOT included. `backlog.md` items wait for graduation.

Output:
- Single file at `specs/001-shieldme-mvp/tasks.md`.
- Front matter: title, status, updated date, total task count, count per phase.
- Section per phase (M1 — M7) with task entries.
- Final section: parallelism summary — list of P-marked clusters.
- Do NOT generate code. Tasks are the contract; implementation comes later.

Expected output size: 180–250 tasks. Don't pad to hit that; don't compress past it.
```

After: paste tasks.md back to me. I review for ordering, dependency gaps, model markers, missing test pairs, constitutional violations.

---

## Prompts 5a–5e — Quality checklists

**Set model first for each:** `/model claude-sonnet-4-6`

These can run in parallel sessions. Each produces one checklist file.

### 5a — Security

```claude-code-prompt
Generate `specs/001-shieldme-mvp/checklists/security.md` — a verification checklist that maps Constitution §I/II/III/VIII/IX/XII/XV, the threat-model risks, and the security-controls.md controls into reviewable items.

Read:
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\threat-model.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\security-controls.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\integration-apis.md (§1 egress)

Checklist format:
- One section per layer (L1–L7 from security-controls §1).
- Each item: `[ ]` checkbox, plain-language statement, citation to constitution principle / threat-model risk / security-controls control ID.
- "Verification" bullet per item with the test / CI gate that confirms it.

Don't propose fixes. The list is for PR review.
```

### 5b — Privacy

```claude-code-prompt
Generate `specs/001-shieldme-mvp/checklists/privacy.md`. Coverage:
- GDPR Article 5–13, 15, 17, 25 (data minimization, lawful basis, transparency, access, erasure, privacy by design).
- CCPA notice + opt-out applicability.
- Google OAuth Limited Use compliance.
- Telemetry schema bound (no PII in `feature_used`, `scan_completed`, etc.).

Read:
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\spec.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\data-model.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\threat-model.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\engineering-qa.md (Q6 store review)

Same format as 5a.
```

### 5c — Accessibility (WCAG 2.1 AA)

```claude-code-prompt
Generate `specs/001-shieldme-mvp/checklists/accessibility.md`. Coverage:
- WCAG 2.1 AA (Perceivable / Operable / Understandable / Robust).
- Severity-not-by-color-alone discipline.
- Focus management.
- Reduced-motion compliance.
- Localization (EN + EL at launch).

Read:
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\spec.md (NFR-A1, NFR-I1)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\design-tokens.md (§11)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\ui-components.md (§8)

Same format. Each item references the axe-core rule or NFR that verifies it.
```

### 5d — UX

```claude-code-prompt
Generate `specs/001-shieldme-mvp/checklists/ux.md`. Coverage:
- First-run flow ≤5 clicks to dashboard (FR-R6).
- Consumer language (Constitution §IV — copy linter terms).
- Progressive disclosure (§V — advanced controls behind fold).
- Fail-loud user messaging (§IX — no silent failures).
- Tier-upsell modal copy never hostile; always pairs limit with concrete benefit.
- Severity color + icon + text always together.

Read:
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\spec.md
- C:\Users\iaBox\Downloads\ShieldMe\docs\PRD.md (UI conventions)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\contracts\ui-components.md

Same format.
```

### 5e — Chrome Web Store submission

```claude-code-prompt
Generate `specs/001-shieldme-mvp/checklists/store-submission.md`. Coverage:
- MV3 manifest compliance.
- Permission justifications (one per declared permission).
- Single Purpose Policy alignment.
- Limited Use Disclosure for Google scopes (OAuth verification prep).
- Privacy policy URL ready.
- Promotional assets (icon, screenshots, 90-sec video) listed with dimensions and content guidelines.
- "Remotely hosted code: No" confirmation.

Read:
- C:\Users\iaBox\Downloads\ShieldMe\docs\engineering-qa.md (Q6)
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\spec.md (FR-* and AC-*)
- C:\Users\iaBox\Downloads\ShieldMe\.specify\memory\constitution.md (§III permissions, §VIII zero runtime external deps)

Same format. Items grouped by Web Store dashboard section.
```

After: paste each checklist back to me. I review for coverage gaps.

---

## Prompt 6 — Per-task implementation (template)

After tasks.md exists and you start `/speckit.implement T001`, the implement command reads the task and runs it. For the first ~10 tasks I'll write guided prompts to enforce TDD discipline. The template:

**Set model:** `/model claude-sonnet-4-6` (default; `/model claude-haiku-4-5-20251001` if task has `[H]`; `/model claude-opus-4-6` only if task has `[O]`)

```claude-code-prompt
Execute task TNNN per `specs/001-shieldme-mvp/tasks.md`.

Read first (only what the task references):
- C:\Users\iaBox\Downloads\ShieldMe\CLAUDE.md
- C:\Users\iaBox\Downloads\ShieldMe\specs\001-shieldme-mvp\tasks.md (this task entry only; do NOT load others)
- The files listed under the task's `Files:` field
- The files listed under the task's `Spec refs:` field (their relevant sections only)

Discipline:
- TDD. Write or update tests FIRST; run them; confirm they fail with the expected message; then implement to make them pass.
- Constitution check before writing code: confirm the change doesn't violate any principle. If it does, STOP and report.
- No scope expansion. Don't add features the task doesn't list.
- No file outside the `Files:` list. If you need to touch one, STOP and report.

Verification before concluding:
- Run the task's `Verification:` commands.
- Run `pnpm verify` at every phase boundary as marked in tasks.md.
- Report: files changed, test counts (added / passing / failing), `pnpm verify` exit code, bundle size delta.

If anything is unclear, STOP and ask. Do not invent intent.
```

I will replace `TNNN` with the actual task ID and add task-specific notes for the first ~10. After that we move to mechanical mode.

---

## What to never run

- `/speckit.constitution` — would regenerate `.specify/memory/constitution.md` from template.
- `/speckit.specify` — would regenerate `spec.md`.
- `/speckit.plan` — would regenerate `plan.md`.
- `/speckit.clarify` — would regenerate `clarifications.md` (we use `docs/engineering-qa.md` instead, see its header note).

If any of those slash commands is suggested by Claude Code or by the spec-kit templates, refuse. Patches to those files come from me via direct edit.

---

## What I do between your steps

- After Prompt 1: I review the file list, flag anything that overlaps protected paths.
- After Prompt 2: I review `pnpm verify` output, advise on any failure.
- After Prompt 3: I patch drift in SDD markdown.
- After Prompt 4: I review tasks.md, mark up dependency gaps, fix model-tier markers, surface any missing test pairs.
- After Prompts 5a–5e: I fold checklist gaps into spec amendments or new backlog entries.
- After every batch of T-tasks: I either confirm the green build or write the fix prompt.

---

## Confirmed decisions (no longer open)

- Tier prices: Free / €2.99 Basic / €9.90 Pro (annual €24.99 / €99.00). Confirmed 2026-05-13.
- MOTA palette: keep the inferred hexes in `contracts/design-tokens.md` §3 as production. Confirmed 2026-05-13.
- MOTA video: skipped. Motion vocabulary in `contracts/ui-components.md` §4 is final.
- Fonts: Manrope (display) + Inter (body), both OFL.
- Pro Family: permanently removed from v1.0 scope; tracked in `backlog.md` as `BL-tier-family`.

---

## File anchor

This runbook is the source of truth for sequence and prompts. If a turn changes a prompt, this file changes too. Bookmark it.
