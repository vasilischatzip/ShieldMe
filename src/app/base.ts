/**
 * Base path helper — single source of truth for SPA routing under a
 * subdirectory (e.g. GitHub Pages project page at /ShieldMe/).
 *
 * Vite injects `import.meta.env.BASE_URL` from the `base` config in
 * vite.config.ts (driven by SHIELDME_BASE_PATH env var). In dev it's "/",
 * in the Pages build it's "/ShieldMe/".
 *
 * Use `link(path)` whenever building href values or programmatic navigation
 * targets. Use `BASE` for Router scope / Route path prefixes.
 */

/** Trailing-slash form, e.g. "/" or "/ShieldMe/". */
export const BASE_WITH_SLASH: string = import.meta.env.BASE_URL ?? "/";

/** No-trailing-slash form, e.g. "" or "/ShieldMe". Suitable for `scope`. */
export const BASE: string = BASE_WITH_SLASH.replace(/\/$/, "");

/**
 * Build an in-app href. `link("/toolkit")` → "/toolkit" in dev,
 * "/ShieldMe/toolkit" in the Pages build. Always returns an absolute path
 * from origin root so the browser navigates correctly regardless of the
 * current route depth.
 */
export function link(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`[base.link] path must start with "/" — got: ${path}`);
  }
  // Special case: "/" should map to the base itself, with a trailing slash
  // so GitHub Pages serves index.html rather than 301-redirecting.
  if (path === "/") return BASE_WITH_SLASH;
  return BASE + path;
}
