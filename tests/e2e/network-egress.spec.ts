/**
 * T052 — Network-egress acceptance test (AC-C2).
 *
 * Verifies that during a normal Document Check scan, the extension makes
 * ZERO outbound network requests.  All PII processing must be local.
 *
 * Implementation:
 *   • Intercept every request on the popup page via `page.route("**\/*")`.
 *   • Allow requests to `chrome-extension://` (loading the extension's own
 *     assets — not egress).
 *   • Fail the test immediately if any other host is contacted.
 *   • Run a full scan with PII-laden test text.
 *   • Assert the violations list is still empty at the end.
 *
 * This is the machine-checkable form of the privacy promise:
 *   "ShieldMe makes no network calls during a scan."
 */
import { test, expect } from "./setup";

/** Hosts that are allowed to be contacted during a scan.
 *  In practice the only expected host is the extension's own
 *  chrome-extension:// origin (for loading JS chunks lazily). */
const ALLOWED_HOST_PATTERNS: RegExp[] = [
  /^chrome-extension:\/\//,
  // Chromium internal protocols
  /^devtools:\/\//,
  /^data:/,
  /^blob:/,
];

const PII_TEST_TEXT = `
Hi team,

Please refund card 4111-1111-1111-1111.
Email: jane.doe@example.com
SSN: 123-45-6789
IBAN: GB82WEST12345698765432
AWS key: AKIAIOSFODNN7EXAMPLE
`;

test.describe("AC-C2: Zero network egress during scan", () => {
  test("no outbound requests during a paste-text scan", async ({ context, popupUrl }) => {
    const page = await context.newPage();

    const egressViolations: string[] = [];

    // Intercept ALL requests and flag any that leave the extension origin
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      const allowed = ALLOWED_HOST_PATTERNS.some((re) => re.test(url));
      if (!allowed) {
        egressViolations.push(url);
        // Still fulfil the request so the page doesn't hang, but record it.
        await route.continue();
      } else {
        await route.continue();
      }
    });

    await page.goto(popupUrl);

    // Navigate to the Scan tab
    const scanTab = page.getByRole("button", { name: /scan/i }).first();
    await scanTab.click();

    // Paste the PII-laden text
    const textarea = page.getByRole("textbox", { name: /paste text to scan/i });
    await textarea.fill(PII_TEST_TEXT);

    // Click Scan now
    const scanBtn = page.getByRole("button", { name: /scan now/i });
    await scanBtn.click();

    // Wait for scan to complete (result header appears)
    await expect(page.getByText(/scan complete|items detected|Nothing sensitive/i)).toBeVisible({
      timeout: 10_000,
    });

    // Allow any lazy-loaded chunks to finish
    await page.waitForTimeout(500);

    // Assert: zero external network calls
    expect(
      egressViolations,
      `Outbound requests detected during scan:\n${egressViolations.join("\n")}`,
    ).toHaveLength(0);
  });

  test("no outbound requests when the popup first opens", async ({ context, popupUrl }) => {
    const page = await context.newPage();
    const egressViolations: string[] = [];

    await page.route("**/*", async (route) => {
      const url = route.request().url();
      const allowed = ALLOWED_HOST_PATTERNS.some((re) => re.test(url));
      if (!allowed) egressViolations.push(url);
      await route.continue();
    });

    await page.goto(popupUrl);

    // Wait for the popup to be fully rendered
    await expect(page.getByRole("navigation", { name: /shieldme navigation/i })).toBeVisible({
      timeout: 8_000,
    });

    await page.waitForTimeout(500);

    expect(
      egressViolations,
      `Outbound requests on popup load:\n${egressViolations.join("\n")}`,
    ).toHaveLength(0);
  });
});
