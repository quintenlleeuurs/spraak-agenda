import "fake-indexeddb/auto"; // an in-memory IndexedDB for tests
import { beforeEach, describe, expect, it } from "vitest";
import { deriveKey, newSalt } from "@/lib/crypto/crypto";
import { getDb } from "./db";
import { deleteItem, loadAudio, loadItems, saveAudio, saveItem } from "./repository";
import type { Item } from "./types";

const key = await deriveKey("123456", newSalt());

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    title: "Tandartscontrole",
    type: "afspraak",
    date: "2026-10-13",
    time: "14:00",
    summary: "Controle bij de tandarts.",
    transcript: "ik moet naar de tandarts",
    audioId: null,
    completed: false,
    archived: false,
    status: "ready",
    typeSetManually: false,
    generatedFields: ["title", "type", "summary"],
    generatedBy: "rules",
    inPhoneCalendar: false,
    recurrence: null,
    createdAt: "2026-10-07T12:00:00Z",
    updatedAt: "2026-10-07T12:00:00Z",
    ...overrides,
  };
}

beforeEach(async () => {
  await getDb().items.clear();
  await getDb().audio.clear();
});

describe("items", () => {
  it("saves and loads an item", async () => {
    const item = makeItem();
    await saveItem(key, item);
    expect(await loadItems(key)).toEqual([item]);
  });

  it("stores only the id readable; the title is encrypted (§13)", async () => {
    await saveItem(key, makeItem());
    const [row] = await getDb().items.toArray();
    expect(Object.keys(row).sort()).toEqual(["ciphertext", "id", "iv"]);
    expect(new TextDecoder().decode(row.ciphertext)).not.toContain("Tandarts");
  });
});

describe("audio (SEC-13)", () => {
  it("saves and loads a recording", async () => {
    await saveAudio(key, {
      id: "a1",
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mp4" }),
      mimeType: "audio/mp4",
      durationSec: 3,
      createdAt: "2026-10-07T12:00:00Z",
      itemIds: ["x"],
    });
    const audio = await loadAudio(key, "a1");
    expect(new Uint8Array(await audio!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("keeps shared audio until the last card is deleted", async () => {
    const first = makeItem({ audioId: "shared" });
    const second = makeItem({ audioId: "shared" });
    await saveItem(key, first);
    await saveItem(key, second);
    await saveAudio(key, {
      id: "shared",
      blob: new Blob([new Uint8Array([9])]),
      mimeType: "audio/mp4",
      durationSec: 1,
      createdAt: "2026-10-07T12:00:00Z",
      itemIds: [first.id, second.id],
    });

    await deleteItem(key, first);
    expect(await loadAudio(key, "shared")).not.toBeNull();

    await deleteItem(key, second);
    expect(await loadAudio(key, "shared")).toBeNull();
    expect(await loadItems(key)).toEqual([]);
  });
});
