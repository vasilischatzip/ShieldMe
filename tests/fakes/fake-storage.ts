/**
 * In-memory LocalStore fake — used in all unit tests.
 * Implements the full LocalStore interface without chrome.* dependencies.
 */
import type { LocalStore, StorageChangeListener } from "~/core/storage";

export class FakeLocalStore implements LocalStore {
  private data = new Map<string, unknown>();
  private listeners = new Map<string, Set<StorageChangeListener<unknown>>>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const old = this.data.get(key) as T | undefined;
    this.data.set(key, value);
    this.notify(key, value, old);
  }

  async patch<T extends object>(key: string, partial: Partial<T>): Promise<void> {
    const existing = (await this.get<T>(key)) ?? ({} as T);
    await this.set(key, { ...existing, ...partial });
  }

  async remove(key: string): Promise<void> {
    const old = this.data.get(key);
    this.data.delete(key);
    this.notify(key, undefined, old);
  }

  async clear(): Promise<void> {
    const keys = [...this.data.keys()];
    for (const k of keys) await this.remove(k);
  }

  onChange<T>(key: string, listener: StorageChangeListener<T>): () => void {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener as StorageChangeListener<unknown>);
    return () => this.listeners.get(key)?.delete(listener as StorageChangeListener<unknown>);
  }

  private notify<T>(key: string, newValue: T | undefined, oldValue: T | undefined): void {
    for (const l of this.listeners.get(key) ?? []) {
      l(newValue, oldValue);
    }
  }

  /** Test helper — read internal state synchronously */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }
}
