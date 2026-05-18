# Open Asks & Progress — Session 2026-05-09

Eight asks Bill raised. Order is sequential (one ask per turn). Update status as work proceeds.

| # | Ask | Status | Output location |
|---|---|---|---|
| 1 | Validate spec-kit is full at maximum (gap audit + fill plan) | audit done; awaiting Bill to run Prompts A + B then `/speckit.tasks`, `/speckit.checklist`, `/speckit.analyze`, `/speckit.clarify` | 2026-05-09 |
| 2 | Tech stack is the best possible for the scope | done — R24 CRXJS fallback, R25 OCR deferred to v1.5, R26 state mgmt; spec & plan updated | 2026-05-09 |
| 3 | Risk assessment — fully secure (data, vulns, APIs, secrets) | done — `specs/001-shieldme-mvp/threat-model.md` written; Constitution §XII added | 2026-05-09 |
| 4 | Add Google login (OpenID), multi-account, auth outside Google | done — `contracts/identity-providers.md` written; data-model §12a-c added; spec FR-Acc1..8 + AC-Acc1..4 + US-13..15; Constitution §XIII; R27 | 2026-05-09 |
| 5 | Other personal drives + email providers | done — `contracts/storage-providers.md` + `contracts/email-providers.md` written; spec out-of-scope rewritten; R28 | 2026-05-09 |
| 6 | Modern UI with **single coherent palette + font** (MOTA) | done — `contracts/design-tokens.md` written with inferred palette + THICCCBOI+Inter; Constitution §XIV; R29. **Open:** THICCCBOI commercial license; replace inferred hexes with actual MOTA values | 2026-05-09 |
| 7 | Microsoft Purview SIT + DLP framework parity | done — detection-engine contract gains `DetectorThresholds` + Purview alignment notes; detector-catalog §10 (2026 SIT additions) + §11 (parity scorecard); R30 + R32 (Trainable Classifier deferred) | 2026-05-09 |
| 8 | New features + Pro/Basic + final-product scope | done — initial pass 2026-05-09; revised 2026-05-12 to drop Pro Family per Bill's directive; Free/Basic/Pro three-tier matrix; multi-account is the Pro differentiator | 2026-05-12 |
| 9 | Exceptionally good free-only UI + all security layers + features into spec OR backlog, spec-kit specify approach, model recommendations | done — Manrope+Inter (OFL) replaces THICCCBOI; `contracts/ui-components.md` written (Floating UI + Lucide + Motion One); `security-controls.md` written with 7-layer defense + risk-to-control map; `backlog.md` written with 20+ structured entries; Constitution v1.3.0; R29+R31+R33 updated; CLAUDE.md models table refined | 2026-05-12 |

## Decisions made in this session

- 2026-05-09: Direct edits to SDD markdown artifacts allowed; code via Claude Code prompts only. (Per `working-agreement.md`.)
- 2026-05-09: One ask per turn. Bill prefers depth.
- 2026-05-09: MOTA design tokens to be extracted from https://mota-platform.webflow.io/ when ask 6 is reached.
- 2026-05-09: No surfaced TODO list this session.
- 2026-05-09: **Frame C** for spec-kit gaps — install tooling, keep hand-rolled artifacts, generate the missing ones (`tasks.md`, checklists, analysis, formal clarifications) via slash commands.
- 2026-05-09: Wipe orphan `node_modules/` and bootstrap fresh via Claude Code Prompt B.
- 2026-05-09: `tasks.md` to be generated AFTER spec-kit install + bootstrap, via `/speckit.tasks`.
- 2026-05-09: AC-C2 fixed to point at `contracts/integration-apis.md` §1 as the single source of truth for the egress allowlist.
- 2026-05-09: plan.md §8 open items resolved — happy-dom over jsdom (R22), CSS Modules + tokens over Tailwind (R23).
- 2026-05-09: `docs/engineering-qa.md` declared as the project's `/speckit.clarify` artifact.

## Pending Bill actions (current state 2026-05-12)

1. Paste **Claude Code Prompt A** (spec-kit install — from Ask 1 turn).
2. Paste **Claude Code Prompt B** (M0 bootstrap — from Ask 1 turn). NOTE: when you paste this, the design-tokens placeholder it creates will be superseded immediately by the production tokens system defined in `contracts/design-tokens.md` §3 + `contracts/ui-components.md`; that work happens at the start of M1.
3. Run `/speckit.clarify` (appends to `docs/engineering-qa.md`).
4. Run `/speckit.tasks` to generate `specs/001-shieldme-mvp/tasks.md`. I review before any T-task executes. With Modules 6 + 7 + security-controls + ui-components + backlog graduation paths, expect ~180–250 tasks.
5. Run `/speckit.checklist security`, `/speckit.checklist privacy`, `/speckit.checklist accessibility`, `/speckit.checklist ux`, `/speckit.checklist store-submission`.
6. Run `/speckit.analyze` and share output.
7. ~~Confirm or replace MOTA palette~~ **Confirmed 2026-05-13: keep inferred MOTA palette as-is.** Hexes in `contracts/design-tokens.md` §3 are the production palette.
8. ~~Confirm tier prices~~ **Confirmed 2026-05-13: Free / €2.99 Basic / €9.90 Pro** (annual €24.99 / €99.00). Stripe SKUs at M6.
9. ~~MOTA video screenshots~~ **Decided 2026-05-13: skip the video.** Motion vocabulary in `contracts/ui-components.md` §4 is final.

## What's now ready for Phase 4

After Bill runs steps 1–6, `tasks.md` exists with the full task graph for the seven-module v1.0 scope plus security-controls + ui-components + identity + multi-provider scaffolding. I review for ordering, dependency markers, constitutional violations, parallelism opportunities. Then we execute tasks one at a time through Claude Code using the model recommendations in `CLAUDE.md`.

## Watch list (raised but deferred)

- `node_modules/` exists with no root `package.json` — repo is mid-bootstrap. Either Claude Code partial-ran setup or files were deleted. Reconcile before any implementation prompt.
- `tasks.md` is referenced from README, quickstart, and contributing docs; does not exist. Phase 4 of SDD is unwritten.
