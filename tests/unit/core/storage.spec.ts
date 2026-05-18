/**
 * storage.spec.ts — tests for WebLocalStore (localStorage + IDB).
 *
 * Uses happy-dom's built-in localStorage shim and fake-indexeddb.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

// Reset IDB between tests by patching globalThis.indexedDB with a fresh factory
beforeEach(() => {
  // Replace globalThis.indexedDB with a fresh instance for isolation
  Object.defineProperty(globalThis, "indexedDB", {
    value: new IDBFactory(),
    writable: true,
    configurable: true,
  });
  // Reset the module so the DB singleton is cleared
  vi.resetModules();
  localStorage.clear();
});

async function makeStore() {
  // Dynamic import after module reset so we get a fresh singleton
  const { localStore } = await import("~/core/storage");
  return localStore;
}

describe("WebLocalStore — localStorage path (small keys: prefs, tier)", () => {
  it("returns undefined for unknown key", async () => {
    const store = await makeStore();
    expect(await store.get("prefs")).toBeUndefined();
  });

  it("set + get round-trips a value", async () => {
    const store = await makeStore();
    await store.set("prefs", { locale: "en" });
    expect(await store.get("prefs")).toEqual({ locale: "en" });
  });

  it("patch merges into existing object", async () => {
    const store = await makeStore();
    await store.set("prefs", { locale: "en", theme: "dark" });
    await store.patch("prefs", { locale: "el" });
    expect(await store.get("prefs")).toEqual({ locale: "el", theme: "dark" });
  });

  it("patch on missing key seeds from empty object", async () => {
    const store = await makeStore();
    await store.patch<{ locale: string }>("prefs", { locale: "en" });
    expect(await store.get("prefs")).toEqual({ locale: "en" });
  });

  it("remove deletes the key", async () => {
    const store = await makeStore();
    await store.set("prefs", { locale: "en" });
    await store.remove("prefs");
    expect(await store.get("prefs")).toBeUndefined();
  });

  it("clear wipes all keys", async () => {
    const store = await makeStore();
    await store.set("prefs", { locale: "en" });
    await store.set("tier", "free");
    await store.clear();
    expect(await store.get("prefs")).toBeUndefined();
    expect(await store.get("tier")).toBeUndefined();
  });

  it("onChange fires when value is set", async () => {
    const store = await makeStore();
    const calls: Array<[unknown, unknown]> = [];
    store.onChange("prefs", (n, o) => calls.push([n, o]));
    await store.set("prefs", { locale: "en" });
    await store.set("prefs", { locale: "el" });
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it("onChange unsubscribe stops notifications", async () => {
    const store = await makeStore();
    const calls: unknown[] = [];
    const unsub = store.onChange("prefs", (n) => calls.push(n));
    await store.set("prefs", { locale: "en" });
    unsub();
    await store.set("prefs", { locale: "el" });
    expect(calls).toHaveLength(1);
  });

  it("onChange does not fire for a different key", async () => {
    const store = await makeStore();
    const calls: unknown[] = [];
    store.onChange("prefs", (n) => calls.push(n));
    await store.set("tier", "free");
    expect(calls).toHaveLength(0);
  });
});

describe("WebLocalStore — IDB path (large keys: rules, brokers)", () => {
  it("returns undefined for unknown IDB key", async () => {
    const store = await makeStore();
    expect(await store.get("rules")).toBeUndefined();
  });

  it("set + get round-trips via IDB", async () => {
    const store = await makeStore();
    await store.set("rules", { categories: ["money"] });
    expect(await store.get("rules")).toEqual({ categories: ["money"] });
  });

  it("patch merges into existing IDB object", async () => {
    const store = await makeStore();
    await store.set<Record<string, unknown>>("rules", { categories: ["money"], version: 1 });
    await store.patch<Record<string, unknown>>("rules", { version: 2 });
    expect(await store.get("rules")).toEqual({ categories: ["money"], version: 2 });
  });

  it("remove deletes the IDB key", async () => {
    const store = await makeStore();
    await store.set("brokers", [{ id: "spokeo" }]);
    await store.remove("brokers");
    expect(await store.get("brokers")).toBeUndefined();
  });

  it("clear wipes IDB keys", async () => {
    const store = await makeStore();
    await store.set("rules", { x: 1 });
    await store.set("score", 42);
    await store.clear();
    expect(await store.get("rules")).toBeUndefined();
    expect(await store.get("score")).toBeUndefined();
  });

  it("onChange fires on IDB set", async () => {
    const store = await makeStore();
    const calls: Array<[unknown, unknown]> = [];
    store.onChange("score", (n, o) => calls.push([n, o]));
    await store.set("score", 80);
    await store.set("score", 90);
    expect(calls).toEqual([[80, undefined], [90, 80]]);
  });

  it("onChange unsubscribe stops IDB notifications", async () => {
    const store = await makeStore();
    const calls: unknown[] = [];
    const unsub = store.onChange("score", (n) => calls.push(n));
    await store.set("score", 1);
    unsub();
    await store.set("score", 2);
    expect(calls).toEqual([1]);
  });

  it("onChange does not fire for different IDB key", async () => {
    const store = await makeStore();
    const calls: unknown[] = [];
    store.onChange("rules", (n) => calls.push(n));
    await store.set("score", 99);
    expect(calls).toHaveLength(0);
  });
});
