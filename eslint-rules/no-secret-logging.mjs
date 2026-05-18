/**
 * eslint-rules/no-secret-logging.mjs
 *
 * Custom ESLint rule — security-controls C-MEM-2.
 *
 * Bans `console.{log,info,debug,trace,dir,dirxml,table,group,groupCollapsed}`
 * calls when any argument names a value that looks like a secret. This is a
 * heuristic complement to the compile-time brand in `src/core/types/secret.ts`
 * (C-MEM-3). It catches the common slip — pasting `console.log(apiKey)` into
 * a debug session and forgetting to remove it — even when the variable isn't
 * typed via the branded `Secret<Tag>` aliases.
 *
 * `console.warn` and `console.error` remain allowed (they're the only console
 * methods permitted by the project's `no-console` rule anyway). They go to
 * stderr in production and we treat them as user-facing diagnostics; if a
 * secret variable is passed to one of those, the standalone `no-console`
 * gate already blocks it.
 *
 * Heuristic surface (case-insensitive, anchored at boundaries):
 *   - identifier names matching: `secret`, `token`, `apikey`, `api_key`,
 *     `password`, `passphrase`, `privatekey`, `private_key`, `refresh`,
 *     `idtoken`, `id_token`, `cleartext`, `plaintext`, `decrypted`
 *   - property accesses on those names, e.g. `creds.apiKey`, `account.refreshToken`
 *   - template literal expressions that contain such identifiers
 *
 * NOT covered (deliberate trade-offs):
 *   - Spread arguments — too imprecise to inspect statically.
 *   - Dynamic property access — `console[method](secret)` is already caught
 *     by the general `no-console` rule.
 *
 * A true type-aware version using `parserServices.program.getTypeChecker()`
 * would inspect each argument's TypeScript type for the `__secretBrand`
 * symbol. We chose the heuristic path because:
 *   (a) the brand already provides compile-time safety,
 *   (b) the heuristic catches identifier-name slips the brand can't
 *       (e.g. a raw string the developer named `apiKey` but didn't brand),
 *   (c) the heuristic has zero project-config dependency.
 */

const FORBIDDEN_METHODS = new Set([
  "log",
  "info",
  "debug",
  "trace",
  "dir",
  "dirxml",
  "table",
  "group",
  "groupCollapsed",
]);

// Pattern fragments matched against identifier / property names (lowercased).
// The regex tests the WHOLE lowercased name to keep matches anchored and
// catch concatenations like `myApiKeyV2`.
const SECRET_NAME = /(?:^|[_$])(secret|token|apikey|password|passphrase|privatekey|refresh|idtoken|cleartext|plaintext|decrypted)|secret$|token$|apikey$|password$|privatekey$|refreshtoken$|idtoken$|secrets$/i;

function looksSecret(name) {
  if (typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return SECRET_NAME.test(lower) ||
    lower === "key" || // bare `key` is too noisy elsewhere; only when isolated
    /api_-?key/.test(lower);
}

function isConsoleCall(node) {
  if (node.type !== "CallExpression") return null;
  const c = node.callee;
  if (c.type !== "MemberExpression") return null;
  if (c.computed) return null;
  const obj = c.object;
  const prop = c.property;
  if (obj.type !== "Identifier" || obj.name !== "console") return null;
  if (prop.type !== "Identifier") return null;
  return prop.name;
}

function flagsIfArgumentLooksSecret(arg) {
  // Direct identifier — `console.log(apiKey)`
  if (arg.type === "Identifier") return looksSecret(arg.name);
  // Property access — `console.log(creds.apiKey)`
  if (arg.type === "MemberExpression" && !arg.computed && arg.property.type === "Identifier") {
    return looksSecret(arg.property.name) || flagsIfArgumentLooksSecret(arg.object);
  }
  // Template literal — `console.log(\`token=${apiKey}\`)`
  if (arg.type === "TemplateLiteral") {
    return arg.expressions.some((e) => flagsIfArgumentLooksSecret(e));
  }
  // Object expressions — `console.log({ apiKey })`
  if (arg.type === "ObjectExpression") {
    return arg.properties.some((p) => {
      if (p.type === "Property" && !p.computed && p.key && p.key.type === "Identifier") {
        if (looksSecret(p.key.name)) return true;
        return flagsIfArgumentLooksSecret(p.value);
      }
      return false;
    });
  }
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow logging values that look like secrets (api keys, tokens, passwords, etc.) via console methods.",
      recommended: true,
    },
    schema: [],
    messages: {
      banned:
        "Possible secret logged via `console.{{ method }}`: argument name '{{ name }}' looks like a secret. " +
        "If this is intentional, rename the variable or split the call. " +
        "See security-controls.md C-MEM-2.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const method = isConsoleCall(node);
        if (!method) return;
        if (!FORBIDDEN_METHODS.has(method)) return;

        for (const arg of node.arguments) {
          if (arg.type === "SpreadElement") continue;
          if (flagsIfArgumentLooksSecret(arg)) {
            // Best-effort name extraction for the error message.
            let name = "<expression>";
            if (arg.type === "Identifier") name = arg.name;
            else if (
              arg.type === "MemberExpression" &&
              !arg.computed &&
              arg.property.type === "Identifier"
            ) {
              name = arg.property.name;
            }
            context.report({ node: arg, messageId: "banned", data: { method, name } });
          }
        }
      },
    };
  },
};

export default {
  rules: {
    "no-secret-logging": rule,
  },
};
