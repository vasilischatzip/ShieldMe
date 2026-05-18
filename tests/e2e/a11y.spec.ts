/**
 * T050 — WCAG 2.1 AA accessibility pass.
 *
 * Runs @axe-core/playwright over every popup tab.
 * Zero violations are acceptable; the test fails the build if any are found.
 *
 * Constitution §X: "Accessibility (axe-core) passes; WCAG 2.1 AA on popup + options"
 */
import { AxeBuilder } from "@axe-core/playwright";
import { test, expect } from "./setup";

const POPUP_TABS = [
  { label: "Dashboard", selector: null }, // default route
  { label: "Scan",      selector: /scan/i },
  { label: "Audit",     selector: /audit/i },
  { label: "Radar",     selector: /radar/i },
  { label: "Pro",       selector: /pro/i },
  { label: "Settings",  selector: /settings/i },
];

for (const tab of POPUP_TABS) {
  test(`WCAG 2.1 AA — popup tab: ${tab.label}`, async ({ context, popupUrl }) => {
    const page = await context.newPage();
    await page.goto(popupUrl);

    // Navigate to the correct tab if not the default
    if (tab.selector) {
      const nav = page.getByRole("navigation", { name: "ShieldMe navigation" });
      await nav.getByRole("button", { name: tab.selector }).click();
      // Wait for route transition (Motion One 160 ms snap)
      await page.waitForTimeout(200);
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      // Exclude chrome-extension:// origin warnings that are not actionable
      .exclude("[aria-hidden='true']")
      .analyze();

    // Report violations with helpful context before failing
    if (results.violations.length > 0) {
      const summary = results.violations.map((v) => {
        const nodes = v.nodes
          .map((n) => `  • ${n.target.join(", ")}: ${n.failureSummary ?? ""}`)
          .join("\n");
        return `[${v.impact}] ${v.id}: ${v.description}\n${nodes}`;
      }).join("\n\n");

      console.error(`\nA11y violations on "${tab.label}" tab:\n${summary}`);
    }

    expect(results.violations, `${tab.label} tab: ${results.violations.length} axe violations`).toEqual([]);
  });
}
