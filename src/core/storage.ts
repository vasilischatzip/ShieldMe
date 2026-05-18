/**
 * LocalStore — typed abstraction over localStorage (small keys) + IndexedDB (large keys).
 *
 * Keys with <2KB budget (prefs, tier, usage, meta) go to localStorage.
 * Everything else (rules, presetSnapshot, keys, brokers, score, driveMeta, gmailSelectors)
 * goes to IndexedDB via the idb module.
 *
 * The onChange callback for localStorage keys uses the `storage` window event filtered by key.
 * The onChange callback for IDB keys uses a custom EventTarget dispatched on each write.
 */

import { openDB, type IDBPDatabase } from "idb";

export type StorageChangeListener<T> = (newValue: T | undefined, oldValue: T | undefined) => void;

export interface LocalStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  patch<T extends object>(key: string, partial: Partial<T>): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  onChange<T>(key: string, listener: StorageChangeListener<T>): () => void;
}

/* ── Small-key set (localStorage) ──────────────────────────── */

const LS_KEYS = new Set(["prefs", "tier", "usage", "meta"]);

function isLsKey(key: string): boolean {
  // Any key that starts with one of the LS_KEYS prefixes (e.g. "meta.wrappingKey")
  return LS_KEYS.has(key) || [...LS_KEYS].some(k => key === k || key.startsWith(k + "."));
}

/* ── IDB singleton ──────────────────────────────────────────── */

const DB_NAME    = "shieldme";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let _db: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
  return _db;
}

/* ── IDB change bus ─────────────────────────────────────────── */

/**
 * Simple in-process event bus for IDB write notifications.
 * Emits `CustomEvent<{ key, newValue, oldValue }>` on each set/remove/clear.
 */
const idbChangeBus = new EventTarget();

type IdbChangeDetail<T = unknown> = { key: string; newValue: T | undefined; oldValue: T | undefined };

function emitIdbChange<T>(key: string, newValue: T | undefined, oldValue: T | undefined): void {
  idbChangeBus.dispatchEvent(
    new CustomEvent<IdbChangeDetail<T>>("change", { detail: { key, newValue, oldValue } }),
  );
}

/* ── WebLocalStore implementation ──────────────────────────── */

class WebLocalStore implements LocalStore {
  // ── localStorage path ──────────────────────────────────────

  private lsGet<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private lsSet<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  private lsRemove(key: string): void {
    localStorage.removeItem(key);
  }

  // ── Public API ─────────────────────────────────────────────

  async get<T>(key: string): Promise<T | undefined> {
    if (isLsKey(key)) {
      return Promise.resolve(this.lsGet<T>(key));
    }
    const db = await getDb();
    return (db.get(STORE_NAME, key) as Promise<T | undefined>);
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (isLsKey(key)) {
      const old = this.lsGet<T>(key);
      this.lsSet(key, value);
      // Dispatch a synthetic storage event so same-tab onChange fires.
      // (Native `storage` events only fire in OTHER tabs.)
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          oldValue: old !== undefined ? JSON.stringify(old) : null,
          newValue: JSON.stringify(value),
          storageArea: localStorage,
        }),
      );
      return;
    }
    const db = await getDb();
    const old = (await db.get(STORE_NAME, key)) as T | undefined;
    await db.put(STORE_NAME, value, key);
    emitIdbChange(key, value, old);
  }

  async patch<T extends object>(key: string, partial: Partial<T>): Promise<void> {
    const existing = (await this.get<T>(key)) ?? ({} as T);
    await this.set(key, { ...existing, ...partial });
  }

  async remove(key: string): Promise<void> {
    if (isLsKey(key)) {
      const old = this.lsGet(key);
      this.lsRemove(key);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          oldValue: old !== undefined ? JSON.stringify(old) : null,
          newValue: null,
          storageArea: localStorage,
        }),
      );
      return;
    }
    const db = await getDb();
    const old = await db.get(STORE_NAME, key);
    await db.delete(STORE_NAME, key);
    emitIdbChange(key, undefined, old as unknown | undefined);
  }

  async clear(): Promise<void> {
    // localStorage: remove all known SM keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) keysToRemove.push(k);
    }
    for (const k of keysToRemove) {
      this.lsRemove(k);
    }
    // IDB: clear the entire kv store
    const db = await getDb();
    await db.clear(STORE_NAME);
    emitIdbChange("*", undefined, undefined);
  }

  onChange<T>(key: string, listener: StorageChangeListener<T>): () => void {
    if (isLsKey(key)) {
      const handler = (e: Event): void => {
        const se = e as StorageEvent;
        if (se.storageArea !== localStorage) return;
        if (se.key !== key) return;
        const newVal = se.newValue !== null ? (JSON.parse(se.newValue) as T) : undefined;
        const oldVal = se.oldValue !== null ? (JSON.parse(se.oldValue) as T) : undefined;
        listener(newVal, oldVal);
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    }

    // IDB path
    const handler = (e: Event): void => {
      const ce = e as CustomEvent<IdbChangeDetail<T>>;
      if (ce.detail.key !== key && ce.detail.key !== "*") return;
      listener(ce.detail.newValue, ce.detail.oldValue);
    };
    idbChangeBus.addEventListener("change", handler);
    return () => idbChangeBus.removeEventListener("change", handler);
  }
}

/** Singleton — import and use directly. Tests swap via dependency injection. */
export const localStore: LocalStore = new WebLocalStore();
