import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DIST_DIR       = path.resolve(__dirname, "dist");
const GLOBAL_SETUP   = path.resolve(__dirname, "tests/acceptance/global-setup.ts");
const ACCEPTANCE_PORT = 4174;

export default defineConfig({
  globalSetup: GLOBAL_SETUP,
  testDir: "tests",
  timeout: 30_000,
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },

  // Serve the pre-built SPA for acceptance tests.
  // Run `pnpm build` before running acceptance tests.
  webServer: {
    command: `pnpm vite preview --port ${ACCEPTANCE_PORT} --strictPort`,
    url: `http://localhost:${ACCEPTANCE_PORT}`,
    reuseExistingServer: !process.env["CI"],
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  },

  projects: [
    // ── Legacy extension E2E (smoke + network-egress + a11y) ─────────────────
    // These run against the built dist/ as a Chrome extension.
    // Note: these tests are scheduled for replacement in M1 (post-pivot).
    {
      name: "extension",
      testMatch: "tests/e2e/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env["PLAYWRIGHT_CHROMIUM_CHANNEL"] === "beta" ? "chromium" : "chrome",
        launchOptions: {
          args: [
            `--disable-extensions-except=${DIST_DIR}`,
            `--load-extension=${DIST_DIR}`,
            "--no-sandbox",
          ],
        },
      },
    },

    // ── Web-app acceptance tests (M1 — T069–T073) ────────────────────────────
    // Run against the SPA served by vite preview.
    {
      name: "acceptance",
      testMatch: "tests/acceptance/**/*.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${ACCEPTANCE_PORT}`,
        // Fresh context per test (no cross-test storage bleed).
        storageState: undefined,
      },
    },
  ],
});
