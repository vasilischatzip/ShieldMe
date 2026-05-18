/**
 * i18n.spec.ts — tests for the JSON-loader i18n module.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  t,
  // loadLocale, setActiveLocale, initI18n, detectLocale, getActiveLocale removed in post-pivot 2026-05-17 (web-app i18n) — tests TBD
} from "~/core/i18n";

const EN_MOCK: Record<string, string> = {
  nav_dashboard: "Dashboard",
  nav_scan:      "Scan a file",
  drive_auditedOf: "Audited {1} of {2} exposed files.",
};

const EL_MOCK: Record<string, string> = {
  nav_dashboard: "Πίνακας",
  nav_scan:      "Σάρωση αρχείου",
};

function mockFetch(locale: string, data: Record<string, string>) {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes(`${locale}.json`)) {
      return new Response(JSON.stringify(data), {
        status:  200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  });
}

describe("i18n — loadLocale + t", () => {
  beforeEach(() => {
    // Reset module state between tests
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("t returns the key when no locale loaded", () => {
    // Nothing loaded yet — should return the key
    expect(t("nav_dashboard")).toBe("nav_dashboard");
  });

  it("t returns translated string after loadLocale", async () => {
    vi.stubGlobal("fetch", mockFetch("en", EN_MOCK));
    const { loadLocale: load, t: translate } = await import("~/core/i18n");
    await load("en");
    expect(translate("nav_dashboard")).toBe("Dashboard");
  });

  it("t supports {1} {2} substitutions", async () => {
    vi.stubGlobal("fetch", mockFetch("en", EN_MOCK));
    const { loadLocale: load, t: translate } = await import("~/core/i18n");
    await load("en");
    expect(translate("drive_auditedOf", "3", "10")).toBe("Audited 3 of 10 exposed files.");
  });

  it("t falls back to EN when key missing from active locale", async () => {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    let _callCount = 0;
    /* eslint-enable */
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      _callCount++;
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("el.json")) {
        return new Response(JSON.stringify(EL_MOCK), { status: 200 });
      }
      if (urlStr.includes("en.json")) {
        return new Response(JSON.stringify(EN_MOCK), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }));

    const { initI18n: init, t: translate } = await import("~/core/i18n");
    await init("el");
    // "drive_auditedOf" exists only in EN
    expect(translate("drive_auditedOf", "5", "20")).toBe("Audited 5 of 20 exposed files.");
    // "nav_dashboard" exists in EL
    expect(translate("nav_dashboard")).toBe("Πίνακας");
  });

  it("t returns the key for completely missing keys", async () => {
    vi.stubGlobal("fetch", mockFetch("en", EN_MOCK));
    const { loadLocale: load, t: translate } = await import("~/core/i18n");
    await load("en");
    expect(translate("missing_key")).toBe("missing_key");
  });

  it("setActiveLocale changes active locale", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("el.json")) return new Response(JSON.stringify(EL_MOCK), { status: 200 });
      if (urlStr.includes("en.json")) return new Response(JSON.stringify(EN_MOCK), { status: 200 });
      return new Response("Not found", { status: 404 });
    }));

    const { loadLocale: load, setActiveLocale: setLocale, t: translate, getActiveLocale: getLocale } = await import("~/core/i18n");
    await load("en");
    await setLocale("el");
    expect(getLocale()).toBe("el");
    expect(translate("nav_dashboard")).toBe("Πίνακας");
  });
});
