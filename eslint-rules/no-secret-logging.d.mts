// Type declarations for the JS-authored custom rule.
// See `no-secret-logging.mjs` for implementation.
import type { Rule } from "eslint";

declare const plugin: {
  rules: {
    "no-secret-logging": Rule.RuleModule;
  };
};

export default plugin;
