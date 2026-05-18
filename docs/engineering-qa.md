# Engineering Q&A — Answers to PRD Open Questions

Authoritative answers to the six engineering-phase open questions raised in `ShieldMe - PRD.pdf` §22. Normative; violations require an amendment.

> **Spec-kit role:** This file serves as the project's `/speckit.clarify` artifact — the binding clarification record for the `001-shieldme-mvp` feature. Linked from [`specs/001-shieldme-mvp/spec.md`](../specs/001-shieldme-mvp/spec.md) §6 (out-of-scope) and §8 (risks). When spec-kit is installed, `/speckit.clarify` should append to this file rather than create a sibling, to keep a single clarification record.

---

## Q1. Gmail DOM Stability — How do we survive Gmail's DOM churn?

**Answer — Multi-layered resilience, fail loud:**

1. **Resilient selector cascade.** Every compose-related node is located by a *cascade* of selectors in priority order, with each layer more brittle than the last:
   - Stable ARIA roles first (`[role="dialog"][aria-label*="compose" i]`, `[role="textbox"][aria-label*="body" i]`).
   - Stable data attributes second (`[data-tooltip*="Send" i]`, `g_` jsaction patterns).
   - Structural last (classname patterns — known-volatile, used only as backstop).
   - First matching layer wins; failures are logged with which layer succeeded.
2. **Canary assertion at injection time.** On every compose-window open, a `validateComposeSurface()` runs 4 assertions: body-editable found, send button found, attachment list iterable, recipient chips readable. Any failure → disable Email Guardian for this compose, render visible banner *"Email Guardian temporarily unavailable — Gmail updated their layout"* + Report button. **Never fail silently.**
3. **Remote kill-switch for selectors only** (not code). A small JSON file of selector overrides is fetched from a ShieldMe-controlled URL **only when a canary fails**, with a hard 24h cache and signature verification. This lets us push selector fixes without a full Web Store release. The kill-switch carries *data*, never executable code (CSP `script-src 'self'`).
4. **Internal canary job.** A GitHub Action runs a Playwright test against a real Gmail account daily; failure posts to a #gmail-canary Slack channel.
5. **Community prior art.** Reference implementations we study: Gmelius, Simplify Gmail, Mailtrack — all open on GitHub — for selector patterns.

**Expected maintenance burden:** ~2–4 selector fixes per year based on community extension history; usually <1 day to ship via the kill-switch, no Web Store round-trip needed.

---

## Q2. Extension Size — Can we fit pdf.js + Tesseract + mammoth + SheetJS into a reasonable bundle?

**Answer — Target ≤25 MB total unpacked, ≤500 KB initial popup. Achieved via code-splitting + lazy-loading.**

| Library | Baseline | Strategy | After |
|---|---|---|---|
| pdf.js | ~2.5 MB | Bundle, load worker on first PDF scan | ~2.5 MB (deferred) |
| Tesseract.js | ~8 MB code + ~10 MB eng traineddata | Ship English only at install; other langs fetched on demand **from user-chosen source** (cached local indefinitely). Use `tesseract.js` v5 WASM SIMD build. | ~4 MB WASM + 10 MB eng.traineddata (deferred) |
| mammoth.js | ~400 KB | Bundle, lazy | ~400 KB (deferred) |
| SheetJS community | ~1.2 MB | Import only xlsx + csv + full dist, no legacy | ~800 KB (deferred) |
| jsPDF | ~400 KB | Lazy on export | ~400 KB (deferred) |
| Preact + runtime | ~15 KB | Eager | ~15 KB |
| **Popup initial load** | — | Preact + TierGate + dashboard only | **≤500 KB** |
| **Total unpacked** | — | — | **~18 MB** |

**Mechanisms:**
- Vite + `@crxjs/vite-plugin` with `manualChunks` per parser.
- Dynamic `import()` at parser dispatch time (`parseByExt()`).
- MV3 offscreen documents for heavy parsing (keeps the service worker lean and side-steps SW import restrictions).
- Chrome Web Store accepts extensions up to 2 GB in the zip; 18 MB is fine. No known review friction at this size.

**Budget enforced in CI:** `scripts/check-bundle-budget.mjs` fails the build if `dist/` > 25 MB or `dist/popup.bundle.js` > 500 KB.

---

## Q3. OCR Performance — Tesseract.js can be 5–15 s on large images. How do we make it feel fast?

**Answer — Hard size limits + Web Worker + visible progress + downscale-before-OCR.**

**Free tier:**
- Max image size **5 MB** per image, max **2048 × 2048 px**. Larger → rejected with "Image too large — upgrade for large images or crop first."
- One image at a time. No batch.

**Paid tier:**
- Max **25 MB** / 6000 × 6000 px. Batch up to 10.

**Both tiers:**
1. Run Tesseract in a dedicated Web Worker (Tesseract.js v5 does this by default; we pin worker URL to bundled file, not CDN).
2. Before OCR, downscale any image whose longer edge > 2000 px to 2000 px (canvas `drawImage`), improving speed ~3× with no accuracy loss on typed text.
3. Progress bar bound to Tesseract `logger` callback. User sees percent + "Reading page 2 of 4..."
4. Cancel button that calls `worker.terminate()`.
5. Use `oem: LSTM_ONLY` (fastest) and `psm: AUTO`. Document mode tuning lives in `src/ocr/tesseract-config.ts`.
6. Timeout at 30 s → show "This image is taking longer than usual. [Keep waiting] [Cancel]."

**Why not server-side?** Violates Constitution §I.

---

## Q4. Drive API Quotas — How do we scan thousands of files without hitting limits?

**Answer — Batched paginated listing, incremental re-audit via `changes.list`, token-bucket throttling.**

**Quotas (as of Apr 2026):** Drive API per-user 1,000 queries per 100 s; `files.list` returns ≤1,000 per page. Practical ceiling ~10 QPS sustained.

**Strategy:**
1. **First audit — listing phase.** Single `files.list` with `fields=files(id,name,mimeType,modifiedTime,owners,sharedWithMeTime,permissions,parents,webViewLink),nextPageToken`, `pageSize=1000`. One request fetches 1,000 files; loop with token.
2. **Content scanning phase** — bounded parallel. Token bucket: 5 concurrent `files.get?alt=media`, 8 req/s refill. Only scan content for files whose *permissions* flag already suggests exposure (public, external share, externals with edit); skip fully private files at content-scan phase. This cuts the scan ×5–10 for typical users.
3. **Free tier cap:** first **100 files with exposing permissions**, sorted by severity; banner says *"Showing top 100 exposed files. Upgrade for full audit."* Listing still enumerates all files (cheap).
4. **Incremental re-audit.** Store `startPageToken` after first audit. Subsequent runs use `changes.list?pageToken=...` — returns only modified files. Typical delta 1–10 files.
5. **Rate-limit handling.** On 403 `userRateLimitExceeded` → exponential backoff (1 s, 2 s, 4 s, 8 s, max 60 s) with jitter. On 429 → honor `Retry-After`.
6. **Cache.** Per-file results cached in IndexedDB keyed by `fileId + modifiedTime`. Unchanged files skip rescan.

**Progress UX:** Listing phase "Found 2,847 files in your Drive," content phase "Scanning 312 files flagged as shared (12 / 312)..." with cancel.

---

## Q5. Regex Pattern Accuracy — How do we keep false positives low across countries?

**Answer — Validation, context, and a golden corpus enforced in CI.**

**Four-layer correctness model:**

1. **Regex** — structural match (loose, high recall).
2. **Checksum / validator** — Luhn (cards), mod-97 (IBAN), AFM checksum (Greek Tax ID), NIF checksum (Portugal/Spain), Codice Fiscale checksum (Italy), SSN area-number blacklist (US). Detectors without a validator (e.g., passport numbers) use stricter regex + context.
3. **Context window** — ±60 chars around match. Presence of category keywords ("IBAN", "account", "Αριθμός Λογαριασμού") raises confidence; presence of negating keywords ("example", "test", "XXXX") lowers it.
4. **Confidence score** — combined into 0–1. Only confidence ≥0.7 is reported as "Critical"; 0.5–0.7 is "Warning"; <0.5 dropped.

**Golden corpus in CI:**
- Layout: `tests/fixtures/corpus/<country>/<detector>/{positive,negative}.txt`
- ≥20 positives + ≥20 negatives per detector before marking it GA.
- `vitest run corpus` computes precision, recall, FPR per detector.
- CI fails if any detector regresses below: **FPR ≤ 2%, recall ≥ 95%**.

**Per-country rollout:** A detector ships only when its country corpus is green. Country status tracked in `docs/detector-status.md`. MVP ships: US, UK, DE, FR, GR, IT, ES, PT. Others behind a "Beta" pill.

**Community feedback loop:** Each finding has an inline "Was this correct?" thumb; anonymized counts (detector ID + ✓/✗, never the matched text) are batched and *only uploaded if the user opted into usage analytics*. Informs future corpus adds.

---

## Q6. Chrome Web Store Review — Will we get approved?

**Answer — Yes, with deliberate prep. Follow the MV3 + Limited Use checklist below.**

**Risk areas & mitigations:**

| Risk | Mitigation |
|---|---|
| `identity` for Drive OAuth | Request **on-demand**, not at install. Options page explains why. Privacy policy names Drive scopes explicitly. |
| Content script for `mail.google.com` | **Optional host permission**, requested when user enables Email Guardian. Privacy policy explains DOM-only approach (no Gmail API scope). |
| HIBP host | Optional host permission, requested when user saves HIBP key. |
| "Remotely hosted code" field | **No.** Kill-switch (Q1) fetches *data only*, enforced by CSP. |
| "Single purpose" policy | Single purpose statement: *"Scan the user's own documents, emails, and Drive files to detect exposure of their own personal data."* All five modules are expressions of this single purpose. |
| Limited Use disclosure | Mandatory for Drive scopes. Published at `docs/legal/limited-use.md`, linked from options page and Web Store listing. |

**Submission artifacts (pre-built before submission):**
- `docs/legal/privacy-policy.md` — public URL, names every permission and why.
- `docs/legal/limited-use.md` — Google OAuth Limited Use disclosure.
- `docs/store-listing/` — screenshots, 90-second walkthrough video, promo tiles.
- `docs/store-listing/justifications.md` — one paragraph per permission explaining necessity, non-alternatives, and minimal scope.
- Google OAuth app **verification** (required for Drive scopes): CASA assessment, homepage, privacy URL, demo video. Budget 2–4 weeks.

**Review time expectation:** 3–10 business days for extension review; OAuth verification runs in parallel but can take 4–6 weeks. **Plan OAuth verification start at Month 3, not Month 5.**

---

## Cross-cutting Decision: Free-Tier Limits (engineering-binding)

| Limit | Free | Paid |
|---|---|---|
| Document Check scans / calendar month | **5** | Unlimited |
| Document Check max file size | **10 MB** | 50 MB |
| OCR image max size | 5 MB / 2048 px | 25 MB / 6000 px |
| Drive Audit file cap | **100 exposed files**, report shows top 5 critical with action buttons | Unlimited + fix actions |
| Fix actions (Drive write) | ❌ | ✅ |
| Custom rules | 3 | Unlimited |
| Whitelisted recipients | 10 | Unlimited |
| Export full PDF report | Summary (1 page) | Full |
| Continuous monitoring (background periodic Drive re-audit) | ❌ | Daily |
| Family profiles | ❌ | 5 profiles |
| DeleteMe bridge | ❌ | ✅ |

**Enforcement:** Single `TierGate` abstraction (`src/core/tier-gate.ts`) exposes `TierGate.check(feature, context)`. Returns `{ allowed: bool, reason?: string, upsell?: UpsellCTA }`. Every module calls this before capacity-bounded actions. Gate returns `{allowed: true}` for every feature today (everyone is on `premium-preview` until billing goes live). Flipping to real gating = changing one `currentTier` resolver.
