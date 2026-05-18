import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import shieldmeRules from "./eslint-rules/no-secret-logging.mjs";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "src/manifest.ts",
      "src/background/**",
      "src/content/**",
      "src/offscreen/**",
      "src/security/kill-switch.ts",
      "src/security/kill-switch-keys.ts",
      "src/app/App.legacy.tsx",
      "src/app/main.legacy.tsx",
      "tests/unit/content/**",
      "tests/unit/offscreen/**",
      "tests/unit/security/kill-switch.spec.ts",
      "tests/e2e/onboarding.spec.ts",
      "tests/e2e/onboarding-5click.spec.ts",
    ],
  },
  {
    files: ["scripts/**/*.mjs", "eslint-rules/**/*.mjs"],
    languageOptions: {
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      "no-restricted-globals": "off",
      "no-console": "off",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      shieldme: shieldmeRules,
    },
    rules: {
      ...tsPlugin.configs["recommended"].rules,
      "no-restricted-globals": [
        "error",
        {
          name: "chrome",
          message:
            "This is a web app, not a Chrome extension. `chrome.*` is forbidden (constitution §XVI).",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "shieldme/no-secret-logging": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["tests/e2e/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
      "no-console": "off",
    },
  },
];
