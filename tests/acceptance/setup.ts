/**
 * Acceptance test helpers for the ShieldMe web SPA.
 *
 * Wraps `@playwright/test` with convenience fixtures:
 *   - `rulesPage`  — navigates to /rules and waits for the toggle grid to load
 *   - `scanPage`   — navigates to /scan and waits for the drop zone
 *
 * Each test gets a brand-new browser context (no localStorage bleed between
 * tests) because playwright.config.ts sets `storageState: undefined` for the
 * acceptance project.
 */
import { test as base, expect, type Page } from "@playwright/test";

export { expect };

export type AcceptanceFixtures = {
  /** Page navigated to /rules, ready for interaction. */
  rulesPage: Page;
  /** Page navigated to /scan, ready for interaction. */
  scanPage: Page;
};

export const test = base.extend<AcceptanceFixtures>({
  rulesPage: async ({ page }, use) => {
    await page.goto("/rules");
    // Wait for the category toggle section to render (FR-R1)
    await page.waitForSelector('[aria-label="Primary navigation"]', { timeout: 10_000 });
    await use(page);
  },

  scanPage: async ({ page }, use) => {
    await page.goto("/scan");
    await page.waitForSelector('[aria-label="Primary navigation"]', { timeout: 10_000 });
    await use(page);
  },
});

/* ── Helpers ──────────────────────────────────────────────────────── */

/**
 * Navigate to the Rules page and wait for categories to finish loading.
 * The Rules component shows "Loading…" until rules are hydrated from storage,
 * then renders the category toggles. We wait for the toggles themselves.
 */
export async function waitForRulesLoaded(page: Page): Promise<void> {
  // Wait for the first category switch to appear in the DOM — this confirms
  // both that rules loaded from storage and that the CATEGORIES rendered.
  await page.waitForSelector('[role="switch"][aria-label^="Toggle my"]', { timeout: 10_000 });
}

/**
 * Returns the checked state of a toggle button whose visible label matches
 * the given text (case-insensitive prefix match).
 */
export async function getCategoryToggleState(
  page: Page,
  labelText: string,
): Promise<boolean> {
  // Category toggles are rendered as `<button role="switch">` inside a card
  const toggle = page.locator(`[role="switch"]`).filter({
    has: page.locator(`text=/${labelText}/i`),
  });
  const state = await toggle.getAttribute("aria-checked");
  return state === "true";
}
