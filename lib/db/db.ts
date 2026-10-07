// The IndexedDB database (via Dexie). Every table stores only an id plus
// encrypted data, so nothing personal is readable on disk (SEC-04, §13).

import Dexie, { type EntityTable } from "dexie";

export type EncryptedRow = { id: string; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };

/** Audio: encrypted metadata plus the encrypted recording itself. */
export type EncryptedAudioRow = EncryptedRow & { dataIv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };

/** The vault: the salt for the PIN and an encrypted check value. */
export type VaultRow = { id: "vault"; salt: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };

export class AgendaDatabase extends Dexie {
  items!: EntityTable<EncryptedRow, "id">;
  audio!: EntityTable<EncryptedAudioRow, "id">;
  vault!: EntityTable<VaultRow, "id">;

  constructor() {
    super("spraak-agenda");
    // Only the id is indexed: an index on e.g. the date would be readable.
    this.version(1).stores({ items: "id", audio: "id", vault: "id" });
  }
}

let instance: AgendaDatabase | null = null;

/** Created on first use, because IndexedDB only exists in the browser. */
export function getDb(): AgendaDatabase {
  return (instance ??= new AgendaDatabase());
}
