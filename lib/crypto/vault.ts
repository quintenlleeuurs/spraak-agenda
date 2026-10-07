// Setting up and checking the PIN (SEC-04, SEC-05, SEC-08).
//
// We never store the PIN or the key. Instead we store a "check value": a known
// text encrypted with the key. Unlocking = derive the key from the typed PIN
// and try to decrypt the check value. If that works, the PIN was right.

import { getDb } from "@/lib/db/db";
import { decryptJson, deriveKey, encryptJson, newSalt } from "./crypto";

const CHECK_VALUE = "spraak-agenda-ok";

export const MIN_PIN_LENGTH = 6;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${MIN_PIN_LENGTH},}$`).test(pin);
}

export async function hasVault(): Promise<boolean> {
  return (await getDb().vault.get("vault")) !== undefined;
}

/** First use: create the vault and return the key (kept in memory only). */
export async function createVault(pin: string): Promise<CryptoKey> {
  if (!isValidPin(pin)) throw new Error(`De pincode moet minstens ${MIN_PIN_LENGTH} cijfers hebben.`);
  if (await hasVault()) throw new Error("Er is al een pincode ingesteld.");
  // The salt is stored next to the check value, so they can never get separated.
  // A salt is not secret; it makes sure two people with the same PIN get different keys.
  const salt = newSalt();
  const key = await deriveKey(pin, salt);
  await getDb().vault.put({ id: "vault", salt, ...(await encryptJson(key, CHECK_VALUE)) });
  return key;
}

/** Returns the key for the right PIN, or null for a wrong PIN. */
export async function unlockVault(pin: string): Promise<CryptoKey | null> {
  const vault = await getDb().vault.get("vault");
  if (!vault) return null;
  const key = await deriveKey(pin, vault.salt);
  try {
    return (await decryptJson<string>(key, vault)) === CHECK_VALUE ? key : null;
  } catch {
    return null; // AES-GCM refuses to decrypt with the wrong key
  }
}
