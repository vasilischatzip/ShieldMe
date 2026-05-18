# ShieldMe — Build & Test Guide

How to build the extension, load it in Chrome, and test it end-to-end.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | ≥ 18 | `node -v` |
| pnpm | ≥ 9 | `pnpm -v` |
| Chrome | ≥ 120 | `chrome://version` |

Install dependencies (first time only):

```bash
pnpm install
```

---

## 1. Build the extension

```bash
pnpm build
```

This produces a production-ready `dist/` folder containing the MV3 extension
(manifest.json, service worker, popup, content scripts, WASM bundles).

**Verify it's healthy:**

```bash
pnpm verify
```

This runs typecheck → lint → tests → build → budget/egress/CSP checks all in
one command. Everything should show "OK" or "passed".

---

## 2. Load in Chrome (developer mode)

1. Open **chrome://extensions** in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist/` folder inside the ShieldMe project directory.
5. The ShieldMe icon (🛡️) appears in your toolbar.

> **Tip:** Pin the extension for easy access — click the puzzle-piece icon in
> the toolbar, then the pin next to ShieldMe.

---

## 3. Manual testing

### 3a. Paste-text scan (quickest test)

1. Click the ShieldMe icon → the popup opens on the **Scan** tab.
2. Paste the content of the test file into the textarea:
   ```
   tests/fixtures/samples/test-dummy-pii.txt
   ```
   (Open that file in any text editor, Ctrl+A → Ctrl+C, then paste into ShieldMe.)
3. Click **Scan now**.
4. You should see findings across many categories: SSN, credit card, IBAN,
   email, phone, health data, location, etc.
5. The exposure score badge updates on the toolbar icon.

### 3b. File upload scan

1. In the Scan tab, click the drop zone at the top ("📄 Drop a file…").
2. Pick `tests/fixtures/samples/test-dummy-pii.txt`.
3. The scan runs automatically; results appear below.

You can also test with other formats:
- **PDF** — any PDF with text content
- **DOCX** — any Word document
- **XLSX** — any Excel spreadsheet
- **Images** (PNG/JPG) — scans via OCR (first use downloads ~4 MB WASM)

### 3c. Export report

After a scan with findings:
1. Scroll to the bottom of the results.
2. Click **Export PDF report** — downloads a PDF summary.
3. Click **Share card** — generates a shareable image.

### 3d. Settings tab

1. Navigate to the **Settings** tab.
2. Toggle detector categories on/off (e.g., disable "My Money").
3. Re-scan — disabled categories should produce no findings.

### 3e. Gmail integration (if you use Gmail)

1. Open Gmail in Chrome → compose a new email.
2. In the email body, type some dummy PII:
   ```
   My SSN is 078-05-1120 and my credit card is 4532015123456789.
   ```
3. Click **Send**.
4. ShieldMe intercepts the click, scans the email, and shows a warning modal
   listing the findings.
5. Choose **Go back** to edit, or **Send anyway** to proceed.

---

## 4. Development workflow

### Watch mode (auto-rebuild on save)

```bash
pnpm dev
```

Vite watches for file changes and rebuilds `dist/` incrementally.
After each rebuild, go to chrome://extensions and click the **reload** button
(🔄) on the ShieldMe card, then reopen the popup to see changes.

### Run unit tests

```bash
pnpm test          # single run (1087 tests)
pnpm test:watch    # watch mode — re-runs on save
```

### Run only typecheck or lint

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
```

---

## 5. What the test document covers

The file `tests/fixtures/samples/test-dummy-pii.txt` is packed with fake PII
across all detector categories:

| Section | Category | Example detectors triggered |
|---------|----------|-----------------------------|
| 1 — Identity | SSN, passport, driver's license, name+address | `ssn`, `passport`, `drivers-license`, `identity.name-address.combo` |
| 2 — National IDs | 18 countries | `identity.nat.*` (Aadhaar, PESEL, CPR, HETU, etc.) |
| 3 — Tax & VAT | 9 tax IDs | `money.tax.*` (PAN, GSTIN, CPF, CNPJ, VAT numbers) |
| 4 — Financial | Cards, IBAN, SWIFT, crypto | `credit-card`, `iban`, `swift`, `crypto-wallet` |
| 5 — Digital life | API keys, private keys, passwords, emails, phones | `api-key`, `private-key`, `password`, `email`, `phone-intl` |
| 6 — Health | NHS, Medicare, diagnosis, MRN | `health-id`, `diagnosis`, `medical-record` |
| 7 — Family | Child name, school, minor info | `minor-name`, `school-info` |
| 8 — Location | Address, GPS, itinerary | `home-address`, `gps-coords`, `itinerary` |
| 9 — False-positive stress | Order numbers, serial numbers, IPs | Should produce *fewer* or *no* findings |

---

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| Popup is blank | Check chrome://extensions for errors. Click "Errors" on the ShieldMe card. |
| "Service worker inactive" | Click the reload button on chrome://extensions. |
| Build fails | Run `pnpm install` then `pnpm build` again. |
| Tests fail | Run `pnpm verify` for the full diagnostic pipeline. |
| Gmail interceptor not activating | Make sure the content script is loaded — check the console in Gmail's tab (F12). Look for `[ShieldMe] Email Guardian initialised`. |
| OCR takes long on first image | Normal — Tesseract WASM (~4 MB) downloads on first use. Subsequent scans are faster. |
