/**
 * Crypto — AES-GCM-256 envelope for encrypting API keys at rest.
 * Uses Web Crypto API only. No third-party crypto libraries.
 * All plaintext is erased from memory after use (strings are GC'd — we keep them short-lived).
 *
 * Key hierarchy:
 *   wrappingKey  (random 32 bytes, base64, stored in chrome.storage.local `meta.wrappingKey`)
 *     └─ used as raw AES-GCM-256 key material to encrypt provider secrets
 *
 * The wrapping key itself is stored unencrypted but is device-local and never egresses.
 */

export interface EncryptedEnvelope {
  iv: string;         // base64, 12 bytes
  ciphertext: string; // base64
}

const ALG = { name: "AES-GCM", length: 256 } as const;
const IV_BYTES = 12;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

function bytesToB64(bytes: Uint8Array<ArrayBuffer>): string {
  return btoa(String.fromCharCode(...bytes));
}

async function importKey(rawB64: string): Promise<CryptoKey> {
  const raw = b64ToBytes(rawB64);
  return crypto.subtle.importKey("raw", raw, ALG, false, ["encrypt", "decrypt"]);
}

export async function generateWrappingKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(ALG, true, ["encrypt", "decrypt"]);
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToB64(new Uint8Array(raw) as Uint8Array<ArrayBuffer>);
}

export async function encryptString(
  plaintext: string,
  wrappingKeyB64: string,
): Promise<EncryptedEnvelope> {
  const key = await importKey(wrappingKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES) as Uint8Array<ArrayBuffer>);
  const enc = new TextEncoder();
  const encoded = enc.encode(plaintext) as Uint8Array<ArrayBuffer>;
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(cipherBuffer) as Uint8Array<ArrayBuffer>),
  };
}

export async function decryptString(
  envelope: EncryptedEnvelope,
  wrappingKeyB64: string,
): Promise<string> {
  const key = await importKey(wrappingKeyB64);
  const iv = b64ToBytes(envelope.iv);
  const cipherBytes = b64ToBytes(envelope.ciphertext);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> }, key, cipherBytes);
  return new TextDecoder().decode(plainBuffer);
}

/**
 * Rotate the wrapping key — re-encrypts all supplied envelopes with the new key.
 * Caller is responsible for persisting the new key and all rotated envelopes atomically.
 */
export async function rotateWrappingKey(
  oldKeyB64: string,
  envelopes: EncryptedEnvelope[],
): Promise<{ newKeyB64: string; rotatedEnvelopes: EncryptedEnvelope[] }> {
  const newKeyB64 = await generateWrappingKey();
  const rotatedEnvelopes: EncryptedEnvelope[] = [];
  for (const env of envelopes) {
    const plaintext = await decryptString(env, oldKeyB64);
    rotatedEnvelopes.push(await encryptString(plaintext, newKeyB64));
  }
  return { newKeyB64, rotatedEnvelopes };
}
