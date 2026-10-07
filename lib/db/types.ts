// The data model from §10 of requirements.md, in decrypted form.
// On disk everything except the id is encrypted (see repository.ts).

export type ItemType = "afspraak" | "todo" | "idee" | "persoonlijk";

export type ItemStatus = "processing" | "ready" | "needsReview" | "error";

export interface Item {
  id: string; // uuid
  title: string;
  type: ItemType;
  date: string | null; // "YYYY-MM-DD"; null = Persoonlijk / Vergeten dingen
  time: string | null; // "HH:mm"
  durationMinutes?: number;
  summary: string;
  transcript: string; // exact Whisper text, never changed
  audioId: string | null;
  completed: boolean;
  completedAt?: string;
  archived: boolean;
  status: ItemStatus;
  confidence?: number;
  typeSetManually: boolean;
  generatedFields: string[]; // e.g. ["title", "summary", "type"] (AI-09)
  generatedBy: "rules" | "model";
  inPhoneCalendar: boolean; // REM-08
  // REC-09: recurrence rule, e.g. "FREQ=WEEKLY;BYDAY=TU". Present from phase 1
  // so no migration is needed; the functionality follows in phase 6.
  recurrence: string | null;
  exceptions?: { date: string; action: "skip" | "moved" | "done"; movedTo?: string }[];
  lastReminderAt?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export interface Audio {
  id: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
  createdAt: string;
  itemIds: string[]; // split cards share one recording (AI-05)
}
