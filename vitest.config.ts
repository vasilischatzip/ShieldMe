import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/unit/**/*.spec.ts", "tests/unit/**/*.spec.tsx"],
    exclude: [
      "tests/unit/offscreen/**",
      "tests/unit/content/**",
      "tests/unit/security/kill-switch.spec.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["src/core/**", "src/detectors/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "src"),
    },
  },
});
