/**
 * i18n helper — JSON-file based locale loader for the SPA.
 *
 * On boot: detects locale from navigator.language (falls back to 'en').
 * User override: reads prefs.locale from LocalStore.
 *
 * loadLocale(locale): fetches /locales/{locale}.json, caches in memory.
 * t(key, ...substitutions): returns the cached string for the given key.
 *   Supports {1}, {2} ... placeholder syntax.
 */

export type Locale = "en" | "el";

const SUPPORTED_LOCALES: Locale[] = ["en", "el"];
const DEFAULT_LOCALE: Locale = "en";

/* ── In-memory cache ─────────────────────────────────────────── */

const cache: Map<Locale, Record<string, string>> = new Map();

/* ── Locale detection ────────────────────────────────────────── */

export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith("el")) return "el";
  return "en";
}

/* ── Locale loader ───────────────────────────────────────────── */

/**
 * Fetches /locales/{locale}.json from the app's base path.
 * Caches the result in memory; returns the cache on subsequent calls.
 */
export async function loadLocale(locale: Locale): Promise<void> {
  if (cache.has(locale)) return;

  const base = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL as string | undefined) ?? "/";
  const url  = `${base}locales/${locale}.json`.replace(/\/\//g, "/");

  let data: Record<string, string>;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    data = (await resp.json()) as Record<string, string>;
  } catch {
    // Fallback: if the requested locale fails to load, try EN
    if (locale !== DEFAULT_LOCALE) {
      await loadLocale(DEFAULT_LOCALE);
      return;
    }
    data = {};
  }

  cache.set(locale, data);
}

/* ── Active locale ────────────────────────────────────────────── */

let _activeLocale: Locale = DEFAULT_LOCALE;

export function getActiveLocale(): Locale {
  return _activeLocale;
}

export async function setActiveLocale(locale: Locale): Promise<void> {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  await loadLocale(locale);
  _activeLocale = locale;
}

/** Convenience: boot i18n from navigator.language (call once at app start). */
export async function initI18n(override?: Locale): Promise<void> {
  const locale = override ?? detectLocale();
  await loadLocale(locale);
  // Always ensure English is loaded as fallback
  if (locale !== "en") await loadLocale("en");
  _activeLocale = locale;
}

/* ── Translation function ────────────────────────────────────── */

/**
 * Look up key in the active locale, fall back to EN, then the key itself.
 * Substitution: {1}, {2}, … are replaced with positional args.
 */
export function t(key: string, ...substitutions: string[]): string {
  let msg: string | undefined =
    cache.get(_activeLocale)?.[key] ??
    cache.get("en")?.[key];

  if (!msg) {
    return substitutions.length > 0 ? `${key}(${substitutions.join(",")})` : key;
  }

  substitutions.forEach((sub, i) => {
    msg = (msg as string).replace(`{${i + 1}}`, sub);
  });

  return msg;
}

/** Legacy compat: getCurrentLocale → getActiveLocale alias */
export function getCurrentLocale(): Locale {
  return _activeLocale;
}
