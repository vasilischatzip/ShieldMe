import { defineConfig, devices } from "@playwright/test";
import path from "path";

const DIST_DIR = path.resolve(__dirname, "dist");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    // Extension-specific launch args are provided per-test via ExtensionFixture
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-stable",
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
  ],
});
