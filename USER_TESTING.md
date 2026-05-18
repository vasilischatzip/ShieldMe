# ShieldMe — End-to-End User Testing

A 10-minute self-test you (the user) can run before publishing the extension to the Chrome Web Store. Nothing here requires reading source code.

> **Privacy guarantee:** Every step below runs **entirely on your machine**. ShieldMe makes no network calls during a scan. You can verify this in Step 5.

---

## Prerequisites

- Node 20+ and pnpm 9+ (already used by the project)
- Google Chrome (stable channel) or any Chromium-based browser
- A clean Chrome profile is recommended (use a separate profile to avoid noise from your real extensions)

---

## Step 0 — Build the extension

```sh
cd ShieldMe
pnpm install   # if you haven't already
pnpm build
```

You should see:

```
✓ built in ~250 ms
[budget] OK:   dist/ total ~120 KB ≤ 25 MB
[budget] OK:   popup initial JS ≤ 500 KB
[egress] OK — all URLs in dist/ are in the allowlist.
[csp] OK — CSP passes all checks.
```

The `dist/` folder is the loadable extension.

---

## Step 1 — Load the extension into Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right) ON
3. Click **Load unpacked**
4. Select the `dist/` folder you just built
5. The ShieldMe icon (a green shield placeholder) appears in your toolbar. Pin it for easy access.

**✅ Pass criteria:**
- No error banner under the extension card
- The extension card shows _"ShieldMe · 0.1.0"_
- The "Service worker" link is clickable (means the background script registered cleanly)

---

## Step 2 — Open the popup and verify the shell

Click the ShieldMe icon. The popup should open at ~380×480.

**✅ Pass criteria:**
- 5 tabs visible: Dashboard, Scan, Audit, Radar, Settings
- Dashboard hero shows _"Exposure Score: —"_ (no scan yet)
- No console errors (right-click the popup → Inspect → Console)

---

## Step 3 — Run your first scan (paste text)

1. Click the **Scan** tab.
2. Paste this **synthetic, non-real** test data into the textarea:

   ```
   Hi team,

   Please process the refund to credit card 4111-1111-1111-1111.
   The customer's email is jane.doe@example.com and her social
   security number is 123-45-6789. Wire the rest via IBAN
   GB82WEST12345698765432.

   Charge AWS access key id AKIAIOSFODNN7EXAMPLE if needed.

   Thanks!
   ```

3. Click **Scan now**.

**✅ Pass criteria:**
- Within ~50 ms a "Scan complete" header appears with _"X items"_
- At least 3 categories show findings: My Money (credit card + IBAN), My Identity (SSN), My Digital Life (AWS key)
- Each finding shows:
  - A coloured severity tag (red = critical)
  - The detector's friendly name (e.g. "Credit and debit cards")
  - A `•••` redacted snippet — **the raw 16-digit number must NOT be visible**
  - A confidence percentage
- Exposure Score in the result card drops below 70

> **Privacy invariant — verify visually:** The 16-digit card, the SSN, and the AWS key never appear on screen except inside `•••`. If you ever see a raw value, that's a bug.

---

## Step 4 — Run a scan from a file

1. Save the test text from Step 3 into `~/Desktop/test.txt`.
2. In the Scan tab, drag the file onto the dropzone — or click the dropzone.
3. The browse dialog opens. Pick `test.txt`.

**✅ Pass criteria:**
- Findings list refreshes with the file name shown as the source
- "Source: test.txt" appears in the result header
- Score is identical to Step 3 (deterministic)

Try also:
- A `.csv` with `name,email,ssn` columns and 5 fake rows — the SSN column should fire
- A `.json` snippet containing `{"apiKey": "ghp_<36 chars>"}` — the GitHub PAT detector should fire
- A binary file (e.g. a PNG): the UI should say _"PNG isn't supported yet — paste the text directly for now."_ — **not** crash silently

---

## Step 5 — Verify nothing leaves your machine

1. Open the popup again. Right-click → **Inspect** → **Network** tab.
2. Click **Clear**. Make sure the network log is empty.
3. Run another scan (paste anything).

**✅ Pass criteria:**
- The Network tab stays **empty**. No outbound requests of any kind.
- (If you also open Chrome DevTools for the **service worker** via `chrome://extensions` → ShieldMe → "Service worker", the same property holds: zero network activity during a scan.)

This is the cornerstone of ShieldMe's privacy promise — your text is scanned with regex + validators in your browser. There's no server.

---

## Step 6 — Adjust which categories are watched

1. Open the **Settings** tab.
2. Under **What I want protected**, you'll see 6 toggles.
3. Per the constitution (FR-R1), the defaults are:
   - **ON:** My Money · My Identity · My Digital Life
   - **OFF:** My Health · My Family · My Location
4. Toggle **My Money** off. Re-scan the Step 3 text.

**✅ Pass criteria:**
- Credit card + IBAN findings disappear (they belong to My Money)
- SSN + AWS key findings remain
- Toggle My Money back on; close + reopen the popup; verify the toggle persisted

5. Click **Advanced — individual detectors** to expand the per-detector controls. Disable just **Credit and debit cards** while keeping My Money on. Re-scan.

**✅ Pass criteria:**
- Credit card finding disappears, IBAN finding remains

---

## Step 7 — Dashboard hero updates

1. Switch back to **Dashboard**.
2. The hero now shows your most recent score in colour:
   - **85+** green / "good"
   - **60–84** yellow / "ok"
   - **30–59** orange / "risk"
   - **<30** red / "danger"

**✅ Pass criteria:**
- Score matches the result panel from Step 3
- Caption says "X items detected · Y critical, Z warning"
- _"Last scan"_ card lists the source label and runtime

---

## Step 8 — Quick Scan keyboard shortcut

The manifest declares **`Ctrl+Shift+Y`** (Windows/Linux) or **`⌘+Shift+Y`** (macOS) for "Open ShieldMe".

1. Press the shortcut anywhere in Chrome.

**✅ Pass criteria (best-effort):**
- The popup opens. If your browser blocks `chrome.action.openPopup` (older Chrome builds), the worker logs a warning to its console — the shortcut is still registered, you just need to click the icon.
- You can rebind the shortcut at `chrome://extensions/shortcuts`.

---

## Step 9 — Save a HIBP API key (optional, only if you want to test the key vault)

1. Settings → **Connected services** → "Have I Been Pwned" card.
2. Paste any string longer than 20 chars — it doesn't have to be a real key (we're testing the vault, not the API).
3. Click **Save key**.

**✅ Pass criteria:**
- Card flips to "Connected · Disconnect"
- Open `chrome://extensions` → ShieldMe → Service worker → Application tab → IndexedDB. The key is stored **encrypted** (AES-GCM envelope). You should not see your raw key value anywhere.
- Click **Disconnect**. Refresh DevTools — the entry is gone.

---

## Step 10 — Delete-all-my-data

1. Settings → scroll to **⚠️ Delete all my data**.
2. Type `DELETE` in the confirmation field.
3. Click the red button.

**✅ Pass criteria:**
- Settings repaint with all toggles back to defaults
- Dashboard shows "Exposure Score: —" again (last-scan summary cleared)
- HIBP card shows _"Connect"_ again
- This took **2 clicks** (open Settings, click button) per Constitution §II.

---

## Step 11 — Re-run automated checks

```sh
pnpm verify
```

This runs typecheck → lint → 544 unit tests → bundle build → bundle budget → egress allowlist → CSP verifier → preset verifier. All steps must exit 0.

---

## What is *intentionally* not covered yet (deferred to later milestones)

These are documented in `specs/001-shieldme-mvp/tasks.md` with the `⏳` marker:

| Area                      | Tasks            | Why deferred                                                     |
| ------------------------- | ---------------- | ---------------------------------------------------------------- |
| PDF / DOCX / XLSX parsing | T024 full        | Pulls in pdf.js / mammoth / SheetJS — separate bundle work       |
| Preset picker (residency) | T029b/c, T030b   | Needs preset JSON authoring + resolver + onboarding              |
| Gmail Email Guardian      | T032–T036        | M2 milestone                                                     |
| Drive Audit + OAuth       | T037–T042        | M3 milestone (requires Google verification)                      |
| Exposure Radar (HIBP)     | T043–T048        | M4 milestone                                                     |
| WCAG 2.1 AA pass          | T050             | Final polish before submission                                   |
| Web Store submission kit  | T053             | Final polish before submission                                   |

For each, the existing task in `tasks.md` lists `Files`, `Tests first`, and `Depends`. They are individually executable.

---

## If something fails

1. **Popup is blank or shows a red overlay.** Open DevTools on the popup; check the Console. Almost always a missing i18n key or a CSP violation. Re-run `pnpm verify` first.
2. **Background service worker errored on install.** Open `chrome://extensions` → ShieldMe → "Inspect views: service worker" → Console. The first 200 ms of logs usually identify the cause.
3. **A scan returns no findings on text you expected to fire.** The detector probably needs explicit context keywords (e.g. an SSN without "social security" or "ssn" nearby will be suppressed by the context scorer). This is **by design** to hold FPR ≤2% per the constitution. Add the keyword and re-scan.
4. **`pnpm verify` failed.** The error tells you which step. Lint → fix the file. Tests → run `pnpm test --reporter=verbose` for detail. CSP / egress / budget → the script prints the offending value.

If you want to file an internal bug, copy the relevant DevTools panel screenshot + the failed `verify` output. Never paste real secrets, customer data, or credentials into reports.
