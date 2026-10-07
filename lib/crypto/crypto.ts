// Encryption with the browser's built-in Web Crypto API (SEC-04).
// - The key is derived from the PIN with PBKDF2 (SHA-256, 600,000 iterations).
// - Data is encrypted with AES-GCM, which also detects tampering.
// - The key is "non-extractable": even our own code cannot read it out, and it
//   only lives in memory (SEC-05).

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // the standard size for AES-GCM

export type Encrypted = { iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function newSalt(): Uint8Array<ArrayBuffer> {
  return randomBytes(SALT_BYTES);
}

export async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
}

export async function encryptBytes(key: CryptoKey, data: BufferSource): Promise<Encrypted> {
  // A fresh random IV for every encryption: reusing one would weaken AES-GCM.
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv, ciphertext };
}

/** Throws when the key is wrong or the data was changed. */
export async function decryptBytes(key: CryptoKey, { iv, ciphertext }: Encrypted): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Encrypted> {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, encrypted: Encrypted): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(key, encrypted))) as T;
}

// Salts are stored in localStorage as base64 text (allowed by §10: a salt is not secret).
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
