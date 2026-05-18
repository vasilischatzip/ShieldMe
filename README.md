# ShieldMe

> **Know what's exposed. Before you share it.**
> A client-side privacy audit web app — paste a document or connect Google Drive, see what personal information is in it, and decide what to do.

**Live demo:** https://pmcrafts.github.io/ShieldMe/

[![CI](https://github.com/pmcrafts/ShieldMe/actions/workflows/ci.yml/badge.svg)](https://github.com/pmcrafts/ShieldMe/actions/workflows/ci.yml)
[![Deploy](https://github.com/pmcrafts/ShieldMe/actions/workflows/deploy.yml/badge.svg)](https://github.com/pmcrafts/ShieldMe/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why this exists

Everyday people accidentally share documents, emails, and Drive files containing their passport number, IBAN, tax IDs, API keys, medical info, and child schedules. ShieldMe scans content *on the user's device* — nothing ever leaves the browser — and surfaces what would be exposed if the user hit "send" or "share."

This is a portfolio project I built end-to-end: detection engine, design system, OAuth flow, hosted deploy. The code is open and the scans are auditable. Use the live demo, read the spec, fork the repo.

## What's in the box

Six modules, all client-side:

1. **My Protection Rules** — categories (Money, Identity, Health, Family, Digital Life, Location) with 200+ detectors derived from Microsoft Purview's Sensitive Information Types, calibrated for consumer use.
2. **Document Check** — drag a PDF / DOCX / XLSX / CSV / TXT / RTF, see findings with page numbers and an exposure score.
3. **Email Scanner** — paste an email or upload an `.eml`. Phishing heuristics on inbound mail (link mismatch, homoglyph, attachment masquerade).
4. **Cloud Audit** — connect Google Drive via OAuth (PKCE, read-only by default), cross-reference file permissions with content findings, surface "public file with your IBAN inside" as Critical.
5. **Exposure Radar** — password breach check via HIBP k-anonymity (no email ever sent), email breach check with the user's own HIBP API key, 20+ data-broker opt-out checklist.
6. **Privacy Toolkit** — data-export-request generator (GDPR / CCPA-flavored letter, opens `mailto:`), browser-extension audit, Google Takeout review, subscription audit, travel mode.

## Architecture at a glance

| Layer | Choice | Why |
|---|---|---|
| Runtime | Browser (SPA) | Hosted on GitHub Pages, no server, no backend, no per-user data store |
| Framework | Preact 10 + `@preact/signals` + `preact-iso` router | ~18 KB total runtime; the popup-shell budget that an extension would face still applies |
| Build | Vite 5 | Standard SPA, hashed assets, source maps shipped |
| Detection | Pure-TS regex + checksum (Luhn, IBAN mod-97, AFM, NIF, Codice Fiscale, SSN blacklist) + context window scoring + Purview-aligned confidence thresholds | Auditable, no ML black box |
| Parsers | pdf.js, mammoth.js, SheetJS community, jsPDF | Bundled, lazy-loaded per file type |
| Storage | `localStorage` for small flags + IndexedDB for blobs, both AES-GCM 256 encrypted at rest where sensitive | Web Crypto API, non-extractable keys, per-account HKDF-derived keys |
| Auth | OAuth 2.0 PKCE redirect flow (Google) | No third-party JS, no token proxy server |
| Security | Trusted Types policy, storage HMAC seals, no-secret-logging ESLint rule, banned-jargon copy linter, source-map shipping, license allowlist | All controls mapped to a [threat model](specs/001-shieldme-mvp/threat-model.md) and [security-controls register](specs/001-shieldme-mvp/security-controls.md) |
| Hosting | GitHub Pages via Actions | Free, public, reproducible builds |

## What's *not* in the box

This is a privacy-audit tool, not always-on protection. The previous iteration was a Chrome extension that intercepted Gmail's Send button and Drive's share dialog; that variant is parked in the [backlog](specs/001-shieldme-mvp/backlog.md) under `BL-platform-chrome-extension` for a future return.

## Documentation

The repository is spec-driven. Everything is documented before it's built:

- [`docs/PRD.md`](docs/PRD.md) — product intent and feature map
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — non-negotiable principles
- [`specs/001-shieldme-mvp/spec.md`](specs/001-shieldme-mvp/spec.md) — functional + non-functional requirements
- [`specs/001-shieldme-mvp/plan.md`](specs/001-shieldme-mvp/plan.md) — implementation plan
- [`specs/001-shieldme-mvp/contracts/`](specs/001-shieldme-mvp/contracts/) — interface contracts (detection engine, storage, identity, providers, UI tokens, components)
- [`specs/001-shieldme-mvp/threat-model.md`](specs/001-shieldme-mvp/threat-model.md) — adversaries, assets, risks
- [`specs/001-shieldme-mvp/security-controls.md`](specs/001-shieldme-mvp/security-controls.md) — risk-to-control map
- [`specs/001-shieldme-mvp/tasks.md`](specs/001-shieldme-mvp/tasks.md) — ordered task graph
- [`specs/001-shieldme-mvp/backlog.md`](specs/001-shieldme-mvp/backlog.md) — features parked for v1.1+

## Running locally

```bash
pnpm install
pnpm dev               # http://localhost:5173
pnpm verify            # typecheck + lint + 1300+ unit tests + build + gates
```

## Tech notes worth highlighting

- **1300+ unit tests** for detectors, validators, scan engine, parsers, presets, crypto, storage, and identity flow.
- **Detector corpus:** every detector has paired positive + negative test fixtures with a CI gate at FPR ≤2% and recall ≥95%.
- **Egress allowlist** is derived from a contract markdown table at build time — adding a host requires editing one file.
- **Consumer-language linter** — UI strings can't contain `DLP`, `regex`, `PII`, `classifier`, `entropy`, regulation names. Marketing-grade copy in the code.
- **MOTA-inspired** color palette and **Manrope + Inter** (both SIL-OFL) typography.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

This is a personal portfolio project. I'm open to issues that surface bugs or detection false-positives (with sanitized examples). PRs are case-by-case.

— Bill ([@pmcrafts](https://github.com/pmcrafts))
