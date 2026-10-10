// A small log for troubleshooting on the iPhone, where we cannot open
// developer tools. It contains no transcripts: only steps, sizes and errors.
//
// The log is kept in sessionStorage so it survives when iOS restarts the page
// (for example when memory runs out). sessionStorage is cleared when the app
// is closed, and it is never sent anywhere.

export type LogEntry = { time: string; text: string };

const MAX_ENTRIES = 60;
const STORAGE_KEY = "spraak-agenda.diagnostics";
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable: the log still works in memory.
  }
}

export function logStep(text: string): void {
  const time = new Date().toLocaleTimeString("nl-NL");
  entries = [...entries, { time, text }].slice(-MAX_ENTRIES);
  persist();
  listeners.forEach((listener) => listener());
}

/** Loads the log of the previous page load, if the page was restarted. */
export function restoreLog(): LogEntry | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as LogEntry[];
    entries = saved.slice(-MAX_ENTRIES);
    return saved.at(-1) ?? null;
  } catch {
    return null;
  }
}

export function subscribeLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLog(): LogEntry[] {
  return entries;
}

const EMPTY: LogEntry[] = [];
export function getEmptyLog(): LogEntry[] {
  return EMPTY;
}
