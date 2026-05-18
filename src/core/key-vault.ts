/**
 * KeyVault — stores third-party API keys encrypted at rest.
 *
 * Constitution §II: API keys encrypted with per-install AES-GCM-256 key stored in
 * chrome.storage.local `meta.wrappingKey`. Keys never transmitted; vault wipes on
 * "Delete all my data".
 *
 * Usage:
 *   await keyVault.set("hibp", "<user-key>");
 *   const key = await keyVault.get("hibp");  // decrypted string or undefined
 *   await keyVault.remove("hibp");
 *   await keyVault.list();                   // returns name[] (no values)
 *   await keyVault.clear();                  // called from "Delete all my data"
 */
import { localStore } from "./storage";
import { encryptString, decryptString } from "./crypto";
import type { EncryptedEnvelope } from "./crypto";
import type { MetaRecord } from "./migrations";

const VAULT_KEY = "keyVault";

type VaultRecord = Record<string, EncryptedEnvelope>; // name → encrypted envelope

async function getWrappingKey(): Promise<string> {
  const meta = await localStore.get<MetaRecord>("meta");
  if (!meta?.wrappingKey) {
    throw new Error(
      "[KeyVault] wrappingKey not found in meta — did migrations run?",
    );
  }
  return meta.wrappingKey;
}

async function loadVault(): Promise<VaultRecord> {
  return (await localStore.get<VaultRecord>(VAULT_KEY)) ?? {};
}

async function saveVault(vault: VaultRecord): Promise<void> {
  await localStore.set(VAULT_KEY, vault);
}

export interface KeyVault {
  /** Encrypt and store a key under `name`. Overwrites any existing entry. */
  set(name: string, value: string): Promise<void>;
  /** Decrypt and return a stored key, or `undefined` if not set. */
  get(name: string): Promise<string | undefined>;
  /** Remove a specific key from the vault. */
  remove(name: string): Promise<void>;
  /** List stored key names. Values are never returned. */
  list(): Promise<string[]>;
  /** Wipe all stored keys. Called by "Delete all my data". */
  clear(): Promise<void>;
  /** Return true if a key entry exists (without decrypting). */
  has(name: string): Promise<boolean>;
}

class AesGcmKeyVault implements KeyVault {
  async set(name: string, value: string): Promise<void> {
    if (!name) throw new Error("[KeyVault] name must not be empty");
    const wrappingKey = await getWrappingKey();
    const envelope = await encryptString(value, wrappingKey);
    const vault = await loadVault();
    vault[name] = envelope;
    await saveVault(vault);
  }

  async get(name: string): Promise<string | undefined> {
    const vault = await loadVault();
    const envelope = vault[name];
    if (!envelope) return undefined;
    try {
      const wrappingKey = await getWrappingKey();
      return await decryptString(envelope, wrappingKey);
    } catch {
      // Envelope is corrupt or key was rotated without re-encrypting.
      return undefined;
    }
  }

  async remove(name: string): Promise<void> {
    const vault = await loadVault();
    if (!(name in vault)) return;
    delete vault[name];
    await saveVault(vault);
  }

  async list(): Promise<string[]> {
    const vault = await loadVault();
    return Object.keys(vault);
  }

  async clear(): Promise<void> {
    await saveVault({});
  }

  async has(name: string): Promise<boolean> {
    const vault = await loadVault();
    return name in vault;
  }
}

/** Singleton — import and use directly. Tests inject a fake store via the store param. */
export const keyVault: KeyVault = new AesGcmKeyVault();

/** Known vault slot names — avoids magic strings across the codebase. */
export const VAULT_SLOTS = {
  /** Have I Been Pwned API key — used for email breach check. */
  hibp: "hibp",
  /** DeleteMe API key — Premium scaffold only; not used in Free tier. */
  deleteMe: "deleteMe",
} as const;

export type VaultSlot = (typeof VAULT_SLOTS)[keyof typeof VAULT_SLOTS];
