/**
 * Smoke test — verifies the extension loads and the popup renders all 5 tabs.
 */
import { test, expect } from "./setup";

test("popup opens and renders 5 navigation tabs", async ({ context, popupUrl }) => {
  const page = await context.newPage();
  await page.goto(popupUrl);

  // All 5 nav tabs must be present
  const nav = page.getByRole("navigation", { name: "ShieldMe navigation" });
  await expect(nav).toBeVisible();

  const tabs = nav.getByRole("button");
  await expect(tabs).toHaveCount(5);
});

test("clicking a tab changes the active route", async ({ context, popupUrl }) => {
  const page = await context.newPage();
  await page.goto(popupUrl);

  // Click the Scan tab
  const scanTab = page.getByRole("button", { name: /scan/i });
  await scanTab.click();

  // Scan route content should appear
  await expect(page.getByRole("button", { name: /scan/i })).toHaveAttribute("aria-current", "page");
});
