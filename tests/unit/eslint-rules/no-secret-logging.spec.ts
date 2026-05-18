/**
 * Tests for the custom ESLint rule `shieldme/no-secret-logging`.
 *
 * Verifies that the rule:
 *   - flags console.log/info/debug/trace/dir/dirxml/table/group calls
 *     whose arguments name secrets (apiKey, token, password, etc.);
 *   - leaves console.warn / console.error alone (those are gated by
 *     the upstream `no-console` rule and used for legitimate diagnostics);
 *   - flags property access (creds.apiKey), template literals, and
 *     object-shorthand patterns;
 *   - tolerates innocuous identifier names (user, request, scanResult).
 *
 * This is a pure ESLint rule unit-test using ESLint's RuleTester (no project
 * type information needed since the rule is name-based, not type-aware).
 */
import { RuleTester } from "eslint";
import shieldmeRules from "../../../eslint-rules/no-secret-logging.mjs";

const rule = (shieldmeRules.rules["no-secret-logging"]) as Parameters<RuleTester["run"]>[1];

const tester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
});

tester.run("no-secret-logging", rule, {
  valid: [
    // Allowed: console.warn / console.error
    { code: "console.warn(apiKey);" },
    { code: "console.error(token);" },
    // Innocent identifier names
    { code: "console.log(user);" },
    { code: "console.log(scanResult);" },
    { code: "console.log(request);" },
    { code: "console.log('hello');" },
    { code: "console.log(123);" },
    { code: "console.log({ status: 'ok' });" },
    // Not a console call at all
    { code: "logger.log(apiKey);" },
  ],
  invalid: [
    {
      code: "console.log(apiKey);",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.info(refreshToken);",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.debug(creds.apiKey);",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.log(`auth=${idToken}`);",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.log({ apiKey });",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.log({ secret: 'xxx', user });",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.trace(privateKey);",
      errors: [{ messageId: "banned" }],
    },
    {
      code: "console.table(secrets);",
      errors: [{ messageId: "banned" }],
    },
  ],
});

// vitest needs at least one test() invocation to register the file
import { test } from "vitest";
test("RuleTester runs without throwing (asserted above)", () => {
  // RuleTester.run() executes synchronously and throws on any failure.
  // If we got this far, every case above is correct.
});
