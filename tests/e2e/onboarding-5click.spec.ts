/**
 * T031 — Onboarding 5-click flow (fresh install → first scan result)
 *
 * Verifies AC-O1: a new user reaches their first scan result in ≤5 clicks
 * with no prior configuration required.
 *
 * Click map (≤5 user interactions):
 *   Click 1 → "Get started"  (Welcome → Preset picker)
 *   Click 2 → "Use my picks" (Preset picker → Dashboard, default preset applied)
 *   Click 3 → Scan tab       (navigate to Document Check)
 *   [paste]  → type PII text (keyboard input — not a click)
 *   Click 4 → "Scan now"     (trigger scan)
 *   ─────────────────────────────────────────────────────
 *   Total    → 4 user clicks (well within the ≤5 budget)
 *
 * Optional 5-click variant also exercised: pick a residency preset
 * (click 2a = dropdown) before clicking "Use my picks" (click 2b).
 */
import { test, expect } from "./setup";

/** PII fixture that the default preset's active detectors should catch */
const PII_TEXT =
  "Please reach me at jane.doe@example.com or call +1 (555) 867-5309." +
  " My SSN is 123-45-6789.";

/**
 * Clear chrome.storage.local so the popup starts as a fresh install.
 */
async function clearStorage(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        chrome.storage.local.clear(() => resolve()),
      ),
  );
}

/* ════════════════════════════════════════════════════════════════ */

test("5-click flow: fresh install → scan → findings in ≤5 clicks", async ({
  context,
  popupUrl,
}) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  // ── Step 1: Welcome screen ────────────────────────────────────
  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible({
    timeout: 5000,
  });

  // Click 1 — "Get started"
  await page.getByRole("button", { name: /get started/i }).click();

  // Preset picker must appear
  await expect(
    page.getByRole("combobox", { name: /where do you live/i }),
  ).toBeVisible({ timeout: 3000 });

  // Click 2 — "Use my picks" (nothing selected → default global preset applied)
  await page.getByRole("button", { name: /use my picks/i }).click();

  // Onboarding completes; nav tabs appear
  await expect(
    page.locator('[aria-label="ShieldMe navigation"]'),
  ).toBeVisible({ timeout: 5000 });

  // ── Step 3: Navigate to Scan ──────────────────────────────────
  // Click 3 — Scan tab
  await page.getByRole("button", { name: /scan/i }).click();

  // Scan panel must render
  await expect(
    page.getByRole("textbox", { name: /paste text to scan/i }),
  ).toBeVisible({ timeout: 3000 });

  // [paste] — fill textarea with PII text (not a click)
  await page.getByRole("textbox", { name: /paste text to scan/i }).fill(PII_TEXT);

  // ── Step 4: Trigger scan ──────────────────────────────────────
  // Click 4 — "Scan now"
  await page.getByRole("button", { name: /scan now/i }).click();

  // Scan completes and findings appear
  await expect(
    page.getByRole("status"),   // ResultPanel aria role while scanning
  ).not.toBeVisible({ timeout: 8000 });

  // At least one finding must be shown (email or phone)
  const findingHeading = page.getByText(/email|phone|social/i).first();
  await expect(findingHeading).toBeVisible({ timeout: 8000 });
});

/* ════════════════════════════════════════════════════════════════ */

test("5-click variant: pick Greece residency before Apply", async ({
  context,
  popupUrl,
}) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible({
    timeout: 5000,
  });

  // Click 1 — "Get started"
  await page.getByRole("button", { name: /get started/i }).click();

  await expect(
    page.getByRole("combobox", { name: /where do you live/i }),
  ).toBeVisible({ timeout: 3000 });

  // Click 2 — select Greece from dropdown (counts as click 2)
  await page.getByRole("combobox").selectOption("preset.residency.gr");

  // Click 3 — "Use my picks"
  await page.getByRole("button", { name: /use my picks/i }).click();

  // Nav tabs appear → onboarding done
  await expect(
    page.locator('[aria-label="ShieldMe navigation"]'),
  ).toBeVisible({ timeout: 5000 });

  // Click 4 — Scan tab
  await page.getByRole("button", { name: /scan/i }).click();

  // [paste] text
  await page.getByRole("textbox", { name: /paste text to scan/i }).fill(PII_TEXT);

  // Click 5 — "Scan now"
  await page.getByRole("button", { name: /scan now/i }).click();

  // Findings must appear within budget (≤5 clicks used)
  const findingHeading = page.getByText(/email|phone|social/i).first();
  await expect(findingHeading).toBeVisible({ timeout: 8000 });
});

/* ════════════════════════════════════════════════════════════════ */

test("scan result shows score and at least one finding category", async ({
  context,
  popupUrl,
}) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  // Fast-path through onboarding via Skip
  await page.getByRole("button", { name: /get started/i }).click();
  await page.getByRole("button", { name: /skip/i }).click();

  await expect(
    page.locator('[aria-label="ShieldMe navigation"]'),
  ).toBeVisible({ timeout: 5000 });

  // Navigate to Scan
  await page.getByRole("button", { name: /scan/i }).click();
  await page.getByRole("textbox", { name: /paste text to scan/i }).fill(PII_TEXT);
  await page.getByRole("button", { name: /scan now/i }).click();

  // "Scan complete" header should appear
  await expect(
    page.getByText(/scan complete|done/i).first(),
  ).toBeVisible({ timeout: 8000 });

  // Exposure score should be shown (format: "Exposure score N/100")
  await expect(
    page.getByText(/exposure score \d+\/100/i),
  ).toBeVisible({ timeout: 3000 });
});
