import "fake-indexeddb/auto"; // an in-memory IndexedDB for tests
import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/db";
import { decryptJson, deriveKey, encryptJson, fromBase64, newSalt, toBase64 } from "./crypto";
import { createVault, hasVault, isValidPin, unlockVault } from "./vault";

describe("encryption (SEC-04)", () => {
  it("decrypts what it encrypted", async () => {
    const key = await deriveKey("123456", newSalt());
    const encrypted = await encryptJson(key, { title: "Tandartscontrole" });
    expect(await decryptJson(key, encrypted)).toEqual({ title: "Tandartscontrole" });
  });

  it("does not contain the text in readable form", async () => {
    const key = await deriveKey("123456", newSalt());
    const encrypted = await encryptJson(key, "Tandartscontrole");
    expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain("Tandarts");
  });

  it("refuses to decrypt with a wrong PIN", async () => {
    const salt = newSalt();
    const encrypted = await encryptJson(await deriveKey("123456", salt), "geheim");
    await expect(decryptJson(await deriveKey("654321", salt), encrypted)).rejects.toThrow();
  });

  it("uses a new random IV every time", async () => {
    const key = await deriveKey("123456", newSalt());
    const a = await encryptJson(key, "zelfde tekst");
    const b = await encryptJson(key, "zelfde tekst");
    expect(toBase64(a.iv)).not.toBe(toBase64(b.iv));
  });

  it("converts bytes to base64 and back", () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

describe("PIN vault", () => {
  it("requires at least 6 digits", () => {
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
    expect(isValidPin("123456")).toBe(true);
  });

  it("unlocks with the right PIN and not with a wrong one", async () => {
    await getDb().vault.clear();
    expect(await hasVault()).toBe(false);
    await createVault("246810");
    expect(await hasVault()).toBe(true);
    expect(await unlockVault("246810")).not.toBeNull();
    expect(await unlockVault("111111")).toBeNull();
  });

  it("never stores the PIN", async () => {
    await getDb().vault.clear();
    await createVault("975310");
    const stored = JSON.stringify(await getDb().vault.toArray(), (_, value) =>
      value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? toBase64(new Uint8Array(value as ArrayBuffer)) : value,
    );
    expect(stored).not.toContain("975310");
  });
});
