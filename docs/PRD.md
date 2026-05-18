# ShieldMe — Personal Data Protection Suite (PRD)

**Version:** 1.1 (structured from `ShieldMe - PRD.pdf` v1.0) · **Status:** Ready for engineering

> Source of truth for *intent*. The source PDF lives at `ShieldMe - PRD.pdf`. Engineering-bound transformations (free-tier limits, open-question answers, tier gating) live in `specs/001-shieldme-mvp/`.

---

## 1. Product Identity

| Field | Value |
|---|---|
| **Name** | ShieldMe (working title) |
| **One-liner** | "Know what's exposed. Stop it before it leaves." |
| **What it is** | A Chrome extension (Manifest V3) that helps everyday people find, understand, and control their personal data exposure — across documents, emails, Google Drive, and the open web. |
| **What it is NOT** | Enterprise DLP. Corporate compliance. Antivirus. VPN. |
| **Architecture principle** | All document/email scanning runs client-side in the browser. User data never leaves the device. External API calls transmit only hashed or anonymized identifiers. |

## 2. Feature Map

| # | Module | Consumer Name | External API? |
|---|---|---|---|
| 1 | Rules | My Protection Rules | No |
| 2 | Docs | Document Check | No |
| 3 | Email | Email Guardian | No |
| 4 | Drive | Drive Audit | Google OAuth only |
| 5 | Radar | Exposure Radar | Yes (BYOK) |

## 3. Module 1 — My Protection Rules

**Framing:** *"Choose what matters to you. We'll watch for it everywhere."*

### 3.1 Categories (Toggle Groups)

Six consumer categories group what the extension watches. Defaults optimize for "useful out of the box without false-alarm fatigue."

| Category | Default | Summary |
|---|---|---|
| My Money | ON | Cards, bank accounts, tax IDs, crypto wallets, financial context. |
| My Identity | ON | National IDs, passports, driver's licenses, DOB in context, name + address combos. |
| My Health | OFF (opt-in) | Medical IDs, diagnoses, medications, lab/procedure terms. Redacted by default. |
| My Family | OFF (opt-in) | Minor name + school/age, spouse/child cross-refs, emergency contact blocks. |
| My Digital Life | ON | Passwords, API keys, cloud credentials, PEM/SSH/PGP, phone numbers, email addresses. |
| My Location | OFF (opt-in) | Home addresses, GPS coords / plus-codes, EXIF geotags. |

The **authoritative list of detectors per category** (~212 catalogued from Microsoft Purview SITs + ShieldMe originals, split GA / Beta / Planned) lives in [detector-catalog.md](./detector-catalog.md). The PRD stays stable; the catalog versions independently when we add countries.

### 3.1.1 Protection Presets (one-click bundles)

Instead of toggling detectors one by one, users pick a **situation**: *"I live in Greece"*, *"I handle payment cards at work"*, *"I work in healthcare"*. Each preset is a curated bundle of detectors (derived from Microsoft's DLP templates, re-expressed in plain consumer language — no "HIPAA / GDPR / PCI" jargon in the UI).

First-run onboarding asks for one residency preset + optional multi-select situations, then applies the union. Presets stack, diff-preview before apply, and never hide the Advanced panel.

Full catalog + schema + UI mockup: [protection-presets.md](./protection-presets.md).

### 3.2 Custom Rules (Advanced)
- **Keyword match** — "Find documents containing [term]"
- **Pattern match** — user supplies a sample, system generates detector
- **Combination match** — "[keyword] near [pattern]"

### 3.3 Community Rule Requests
"Request a protection" → public roadmap (Trello/Notion) with upvotes; top requests shipped monthly.

### 3.4 First-Run Flow
Install → Welcome → **Preset picker** (residency + optional situations, §3.1.1) → "You're protected" summary with active preset badges → dashboard. Skipping the picker applies the Global Default preset (Money + Identity + Digital Life enabled).

## 4. Module 2 — Document Check

**Framing:** *"Drop any file. See what's exposed in seconds."*

### 4.1 Supported File Types
PDF (pdf.js), DOCX (mammoth.js), XLSX/CSV (SheetJS), TXT/RTF (native), PNG/JPG/TIFF (Tesseract.js OCR).

### 4.2 Scan Process
1. User drags file into popup or picks via `<input type="file">`.
2. Read in-browser via FileReader.
3. Extract text per type.
4. Active protection rules evaluate extracted text.
5. Render exposure report.

### 4.3 Exposure Report
Title, filename, **Exposure Score (0–100)**, critical findings (red), warnings (yellow), actionable "What to do," actions: [Scan Another] [Export Report] [Share Score].

### 4.4 Guarantees
- "🔒 This file stays on your device. Nothing is uploaded." visible in UI.
- Export Report → local PDF via jsPDF.
- Share Score → branded PNG with **zero PII** (score + counts + link only).

## 5. Module 3 — Email Guardian

**Framing:** *"A safety net before you hit Send."*

### 5.1 Mechanism
- Content script on `mail.google.com`.
- MutationObserver on compose DOM.
- Intercept Send click → scan body + attachments + subject + recipients.
- If findings: show warning modal → [Go Back & Review] / [Send Anyway] + "Don't warn for this recipient again" checkbox.

### 5.2 What Gets Scanned
1. Body text → all active rules.
2. Attachments → Document Check engine.
3. Recipients → external-domain flag.
4. Subject → sensitive keywords.

### 5.3 Integration Constraints
- `activeTab` + content script for `mail.google.com` only.
- No `gmail.readonly` scope. Pure DOM.
- Gmail-web only (not Outlook, not desktop clients).
- **Known risk:** Gmail DOM changes → see `docs/engineering-qa.md` §1 for strategy.

### 5.4 Whitelisting
Per-recipient, per-domain. Stored in `chrome.storage.local`.

## 6. Module 4 — Drive Audit

**Framing:** *"See who can access your Google Drive files — and what's in them."*

### 6.1 Mechanism
- Chrome Identity API + Drive API, OAuth 2.0.
- Read-only scopes: `drive.metadata.readonly` + `drive.readonly`.
- On-demand scan (user clicks "Run Audit").
- Results cached locally.

### 6.2 Checks
| Check | User-facing meaning |
|---|---|
| "Anyone with the link" | "These files are public" |
| External specific users | "Shared with people outside your contacts" |
| Externals with edit | "These people can change your files" |
| Shared ≥6 months ago | "Shared a long time ago — do they still need access?" |
| Files in shared folders | "Everything in this folder is visible to [X] people" |

### 6.3 Cross-Reference
Drive permissions × Protection Rules engine: *"This file contains your IBAN AND is shared with anyone who has the link."* This is the product's differentiator.

### 6.4 Fix Actions
One-time scope upgrade to `drive` (write) when the user chooses to remediate:
- Restrict access · Remove external access · Downgrade to view-only · Bulk fix.

## 7. Module 5 — Exposure Radar (Bridge Model)

**Framing:** *"Find out if your personal data is already out there."*

Unlike modules 1–4, Radar bridges to external services. User brings their own accounts/keys. ShieldMe orchestrates.

### 7.1 Sub-feature 5A — Breach Check
- **Service:** HaveIBeenPwned (HIBP).
- **Email check:** requires user's HIBP API key (purchased by user from HIBP).
- **Password check:** free via Pwned Passwords k-anonymity (SHA-1 first 5 chars).
- **Abuse prevention:** email check limited to addresses on the Chrome profile or verified via code.

### 7.2 Sub-feature 5B — Data Broker Exposure
- **Option A (MVP, free):** Curated checklist of 20+ data-broker sites with direct opt-out links. Manual, user tracks progress.
- **Option B (paid tier):** DeleteMe (or equivalent) automated removal — user connects their DeleteMe account, status shown inline.

### 7.3 Sub-feature 5C — Dark Web Monitoring (post-MVP)
Placeholder only in v1: "Coming soon — get notified if your data appears on the dark web." Captures intent.

## 8. Exposure Score

**0–100**, badge color: 90–100 green · 70–89 yellow · 50–69 orange · 0–49 red.

```
Base 100
  − 8 per critical finding
  − 3 per warning
  −10 per public Drive file with sensitive data
  − 5 per breached email
  − 1 per unchecked data-broker site
  + 5 all categories enabled
  + 5 Email Guardian active
  + 5 Drive Audit in last 30 days
  + 5 all broker sites checked
Clamp [0,100]
```

**Share card:** branded PNG, score + counts + link only. **No PII.**

## 9. Permissions Model (Manifest V3)

### Required
- `activeTab` — inject Email Guardian
- `storage` — preferences, rules, keys

### Optional (on-demand)
- Content script for `mail.google.com` — Email Guardian
- `identity` — Drive OAuth
- `https://haveibeenpwned.com/api/*` — breach check

### Never Requested
`tabs`, `history`, `bookmarks`, `<all_urls>`.

## 10. Free vs Paid Matrix

See `specs/001-shieldme-mvp/spec.md` §5 for the binding free-tier limits (file counts, sizes, Drive file cap). The PDF shows launch intent; those limits are the engineering contract.

| Feature | Free | Premium |
|---|---|---|
| Protection rules (all categories) | ✅ | ✅ |
| Document Check | 5 scans/month, ≤10MB/file | Unlimited, ≤50MB/file |
| Email Guardian | ✅ | ✅ |
| Drive Audit | Top-5 critical, first 100 files | Full audit, fix actions, bulk fix |
| Exposure Score | ✅ | ✅ |
| Data broker checklist (manual) | ✅ | ✅ |
| Breach check (own HIBP key) | ✅ | ✅ |
| Continuous monitoring alerts | ❌ | ✅ |
| Family profiles | ❌ | ✅ |
| Priority community rule requests | ❌ | ✅ |
| Export full reports as PDF | Summary only | Full |
| DeleteMe automated removal | ❌ | ✅ |

**Pricing target:** €3.99/month or €29.99/year. **Payments:** Stripe Checkout (EU VAT).

## 11. Tech Stack

| Component | Library | License |
|---|---|---|
| PDF text | pdf.js (Mozilla) | Apache 2.0 |
| DOCX | mammoth.js | BSD-2 |
| XLSX/CSV | SheetJS community | Apache 2.0 |
| OCR | Tesseract.js | Apache 2.0 |
| PDF report | jsPDF | MIT |
| Encryption | Web Crypto API | Native |
| UI | Preact | MIT |

All libraries bundled. No CDN. No remote code.

## 12. Open Questions (Engineering)

Answered in [engineering-qa.md](./engineering-qa.md). Summary:

1. Gmail DOM stability strategy
2. Extension size / lazy-loading
3. OCR performance limits
4. Drive API quota handling
5. Regex accuracy per country
6. Chrome Web Store review prep

## 13. Out of Scope (v1)

- Outlook web / desktop clients
- Dark web monitoring (UI placeholder only)
- Server-side anything
- Mobile (Chrome mobile doesn't support extensions)
- Enterprise admin console, SSO, audit logs
