# ShieldMe — Project Overview (Assistant Brief)

> Loaded at the start of every assistant turn. Keep tight. Don't restate what's in `docs/PRD.md` — link to it.

## What it is

Chrome MV3 extension. Five modules — Rules, Document Check, Email Guardian, Drive Audit, Exposure Radar. Consumer (not enterprise). All scanning client-side. Free tier capacity-limited, never crippled. Premium adds scale + automation, not unlocked features.

## Where the source of truth lives

| Concern | File |
|---|---|
| Product intent (consumer-facing) | `docs/PRD.md` |
| Engineering Q&A / free-tier limits | `docs/engineering-qa.md` |
| Detector inventory (Purview-derived) | `docs/detector-catalog.md` |
| Preset bundles (Purview DLP-derived) | `docs/protection-presets.md` |
| Test fixtures plan | `docs/testing-fixtures.md` |
| Non-negotiable principles | `.specify/memory/constitution.md` |
| WHAT/WHY (binding) | `specs/001-shieldme-mvp/spec.md` |
| HOW (stack, layout) | `specs/001-shieldme-mvp/plan.md` |
| Decisions + alternatives | `specs/001-shieldme-mvp/research.md` |
| Storage entities | `specs/001-shieldme-mvp/data-model.md` |
| Detection engine contract | `specs/001-shieldme-mvp/contracts/detection-engine.md` |
| Storage/crypto contract | `specs/001-shieldme-mvp/contracts/storage-schema.md` |
| External APIs + egress allowlist | `specs/001-shieldme-mvp/contracts/integration-apis.md` |
| Dev setup | `specs/001-shieldme-mvp/quickstart.md` |
| Tasks (TDD-ordered) | `specs/001-shieldme-mvp/tasks.md` — **MISSING as of session start** |

## Architectural seams (don't break these)

- **`TierGate`** — single source of free/paid decisions. Flipping a feature is a resolver swap, not a refactor.
- **`BrokerRemovalProvider`** — interface; `ManualProvider` ships, `DeleteMeProvider` is stubbed for Premium.
- **Egress allowlist** — enforced at build (`scripts/check-egress-allowlist.mjs`) and runtime (CSP + fetch wrapper). Adding a host requires updating both.
- **Offscreen documents** — all heavy parsing (pdf.js, mammoth, SheetJS, Tesseract). MV3 service worker stays lean.
- **Detector registry** — pure-function detectors register at module load. `register()` rejects `shipTier === "planned"`.

## Stack

Preact 10 + Signals · TypeScript 5 strict · Vite 5 + `@crxjs/vite-plugin` · Vitest + Playwright · pnpm 9 · `chrome.storage.local` + IndexedDB (`idb`) · Web Crypto AES-GCM 256 · Chrome native `_locales/`.

## Constitution principles (one-liners)

1. Privacy-first (client-side; egress allowlist).
2. User sovereignty (BYOK, encrypted, deletable in 2 clicks).
3. Least privilege (optional perms on demand).
4. Consumer language (banned-terms linter).
5. Progressive disclosure (3 clicks to first scan).
6. Tier-agnostic core (capacity-limited, never crippled).
7. Fundamental correctness (validators + context + corpus, FPR ≤2%).
8. Zero runtime external deps.
9. Fail loud, not silent.
10. Automated QA as release gate.
11. Token-efficient implementation (tasks reference paths, never paste content).

## Repo state at session start (2026-05-09)

- `node_modules/` populated by pnpm but **no root `package.json`** committed. Setup is half-done.
- No `.claude/`, no `CLAUDE.md`, no `.specify/templates/`.
- `tasks.md` referenced everywhere; **does not exist**.
- No `src/manifest.ts`, no `vite.config.ts`, no `eslint.config.js`, no `.github/workflows/ci.yml`.
- Spec-kit artifacts (constitution, spec, plan, research, data-model, contracts, quickstart) are written and high-quality.
