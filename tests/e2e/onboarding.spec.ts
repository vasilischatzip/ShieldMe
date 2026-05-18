/**
 * T030ba — Onboarding first-run Playwright tests.
 *
 * Verifies:
 *   1. Popup shows the welcome step on fresh install (onboarded key absent).
 *   2. Navigating to step 2 renders the preset picker.
 *   3. Picking Greece + "I have children" and clicking Apply results in
 *      both presets active in chrome.storage.local.
 *   4. "Skip — use recommended defaults" applies preset.default.global.
 */
import { test, expect } from "./setup";

/**
 * Clear the chrome.storage.local from within the extension page context
 * so each test starts with a fresh-install state.
 */
async function clearStorage(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        chrome.storage.local.clear(() => resolve()),
      ),
  );
}

/**
 * Read a key from chrome.storage.local from within the extension page context.
 */
async function getStorage<T>(
  page: import("@playwright/test").Page,
  key: string,
): Promise<T | undefined> {
  return page.evaluate(
    (k: string) =>
      new Promise<T | undefined>((resolve) =>
        chrome.storage.local.get(k, (items) => resolve(items[k] as T | undefined)),
      ),
    key,
  );
}

/* ════════════════════════════════════════════════════════════════ */

test("fresh install shows welcome step", async ({ context, popupUrl }) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  // Welcome heading should be visible
  await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible({
    timeout: 5000,
  });

  // Navigation tabs must NOT be shown during onboarding
  const nav = page.locator('[aria-label="ShieldMe navigation"]');
  await expect(nav).not.toBeVisible();
});

test("clicking Get started advances to preset picker", async ({ context, popupUrl }) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  await page.getByRole("button", { name: /get started/i }).click();

  // Country dropdown must appear
  await expect(
    page.getByRole("combobox", { name: /where do you live/i }),
  ).toBeVisible({ timeout: 3000 });

  // All 7 situation checkboxes must be rendered
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(7);
});

test("Apply with Greece + I have children activates both presets", async ({
  context,
  popupUrl,
}) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  // Step 1 → 2
  await page.getByRole("button", { name: /get started/i }).click();

  // Pick Greece
  await page.getByRole("combobox").selectOption("preset.residency.gr");

  // Check "I have children"
  await page.getByLabel(/I have children/i).check();

  // Apply
  await page.getByRole("button", { name: /use my picks/i }).click();

  // Wait for onboarding to complete (nav tabs appear)
  await expect(
    page.locator('[aria-label="ShieldMe navigation"]'),
  ).toBeVisible({ timeout: 5000 });

  // Verify rules in storage
  const rules = await getStorage<{ activePresets?: string[] }>(
    page,
    "rules.categories",
  );
  expect(rules?.activePresets).toContain("preset.residency.gr");
  expect(rules?.activePresets).toContain("preset.life.parent");
});

test("Skip applies preset.default.global and shows dashboard", async ({
  context,
  popupUrl,
}) => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  await clearStorage(page);
  await page.reload();

  // Step 1 → 2
  await page.getByRole("button", { name: /get started/i }).click();

  // Skip without selecting anything
  await page.getByRole("button", { name: /skip/i }).click();

  // Dashboard should render
  await expect(
    page.locator('[aria-label="ShieldMe navigation"]'),
  ).toBeVisible({ timeout: 5000 });

  // Default preset should be active
  const rules = await getStorage<{ activePresets?: string[] }>(
    page,
    "rules.categories",
  );
  expect(rules?.activePresets).toContain("preset.default.global");
});

test("second launch skips onboarding and shows nav tabs", async ({
  context,
  popupUrl,
}) => {
  const page = await context.newPage();
  await page.goto(popupUrl);

  // Simulate "already onboarded" by setting the flag
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        chrome.storage.local.set({ onboarded: true }, () => resolve()),
      ),
  );
  await page.reload();

  // Nav must appear immediately (no onboarding)
  await expect(
    page.locator('[aria-label="ShieldMe navigation"]'),
  ).toBeVisible({ timeout: 5000 });

  // Welcome heading must NOT appear
  await expect(page.getByRole("heading", { name: /welcome/i })).not.toBeVisible();
});
