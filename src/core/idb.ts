/**
 * IDB — typed wrapper over IndexedDB for large datasets (scan history, Drive cache, etc.)
 * Uses a simple open/transaction pattern; no third-party library.
 */

export const DB_NAME = "shieldme";
export const DB_VERSION = 1;

export type StoreNames =
  | "scanHistory"
  | "driveCache"
  | "breachResults"
  | "telemetryQueue";

export interface IdbStore {
  open(): Promise<IDBDatabase>;
  getAll<T>(store: StoreNames): Promise<T[]>;
  get<T>(store: StoreNames, key: IDBValidKey): Promise<T | undefined>;
  put<T>(store: StoreNames, value: T): Promise<void>;
  delete(store: StoreNames, key: IDBValidKey): Promise<void>;
  clearStore(store: StoreNames): Promise<void>;
  clearAll(): Promise<void>;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("scanHistory")) {
        db.createObjectStore("scanHistory", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("driveCache")) {
        const ds = db.createObjectStore("driveCache", { keyPath: "fileId" });
        ds.createIndex("modifiedTime", "modifiedTime");
      }
      if (!db.objectStoreNames.contains("breachResults")) {
        db.createObjectStore("breachResults", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("telemetryQueue")) {
        db.createObjectStore("telemetryQueue", { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IdbStoreImpl implements IdbStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  open(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDB();
    return this.dbPromise;
  }

  private async tx<T>(
    store: StoreNames,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  getAll<T>(store: StoreNames): Promise<T[]> {
    return this.tx<T[]>(store, "readonly", (s) => s.getAll());
  }

  get<T>(store: StoreNames, key: IDBValidKey): Promise<T | undefined> {
    return this.tx<T | undefined>(store, "readonly", (s) => s.get(key));
  }

  put<T>(store: StoreNames, value: T): Promise<void> {
    return this.tx<IDBValidKey>(store, "readwrite", (s) => s.put(value)).then(() => undefined);
  }

  delete(store: StoreNames, key: IDBValidKey): Promise<void> {
    return this.tx<undefined>(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
  }

  async clearStore(store: StoreNames): Promise<void> {
    await this.tx<undefined>(store, "readwrite", (s) => s.clear());
  }

  async clearAll(): Promise<void> {
    const stores: StoreNames[] = ["scanHistory", "driveCache", "breachResults", "telemetryQueue"];
    for (const s of stores) {
      await this.clearStore(s);
    }
  }
}

export const idb: IdbStore = new IdbStoreImpl();
