/**
 * Playwright E2E helpers for ShieldMe extension testing.
 * Provides fixtures that launch Chrome with the built extension loaded.
 */
import { test as base, chromium, type BrowserContext } from "@playwright/test";
import path from "path";

const DIST_DIR = path.resolve(__dirname, "../../dist");

export type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
  popupUrl: string;
};

/**
 * Extended test fixture that launches a Chrome context with the ShieldMe extension loaded.
 * Exposes the extension ID and popup URL.
 */
export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
      channel: "chrome",
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    // Wait for service worker to register, then extract the extension ID
    let serviceWorkerUrl = "";
    for (let i = 0; i < 10; i++) {
      const workers = context.serviceWorkers();
      const sw = workers.find((w) => w.url().includes("chrome-extension://"));
      if (sw) {
        serviceWorkerUrl = sw.url();
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    const match = serviceWorkerUrl.match(/chrome-extension:\/\/([a-z]+)\//);
    const id = match?.[1] ?? "";
    await use(id);
  },

  popupUrl: async ({ extensionId }, use) => {
    await use(`chrome-extension://${extensionId}/src/popup/index.html`);
  },
});

export { expect } from "@playwright/test";
