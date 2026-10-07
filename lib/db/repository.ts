// Save and load items and audio. Everything passes through encryption here,
// so the rest of the app only ever sees decrypted data in memory.

import { decryptBytes, decryptJson, encryptBytes, encryptJson } from "@/lib/crypto/crypto";
import { getDb } from "./db";
import type { Audio, Item } from "./types";

// --- Items ------------------------------------------------------------------

export async function loadItems(key: CryptoKey): Promise<Item[]> {
  const rows = await getDb().items.toArray();
  return Promise.all(rows.map((row) => decryptJson<Item>(key, row)));
}

export async function saveItem(key: CryptoKey, item: Item): Promise<void> {
  await getDb().items.put({ id: item.id, ...(await encryptJson(key, item)) });
}

/**
 * Deletes an item, and its audio once no other card uses it (SEC-13).
 * Split cards share one recording, so the audio stays while one is left.
 */
export async function deleteItem(key: CryptoKey, item: Item): Promise<void> {
  await getDb().items.delete(item.id);
  if (!item.audioId) return;
  const audio = await loadAudio(key, item.audioId);
  if (!audio) return;
  const remaining = audio.itemIds.filter((id) => id !== item.id);
  if (remaining.length === 0) await getDb().audio.delete(audio.id);
  else await saveAudio(key, { ...audio, itemIds: remaining });
}

// --- Audio ------------------------------------------------------------------

type AudioMeta = Omit<Audio, "blob">;

export async function saveAudio(key: CryptoKey, audio: Audio): Promise<void> {
  const { blob, ...meta } = audio;
  const encryptedMeta = await encryptJson(key, meta);
  const encryptedData = await encryptBytes(key, await blob.arrayBuffer());
  await getDb().audio.put({
    id: audio.id,
    ...encryptedMeta,
    dataIv: encryptedData.iv,
    data: encryptedData.ciphertext,
  });
}

export async function loadAudio(key: CryptoKey, id: string): Promise<Audio | null> {
  const row = await getDb().audio.get(id);
  if (!row) return null;
  const meta = await decryptJson<AudioMeta>(key, row);
  const data = await decryptBytes(key, { iv: row.dataIv, ciphertext: row.data });
  return { ...meta, blob: new Blob([data], { type: meta.mimeType }) };
}
