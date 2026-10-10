// A small in-memory log for troubleshooting on the iPhone, where we cannot
// open developer tools. It is never stored or sent anywhere, and it contains
// no transcripts: only steps, sizes and error messages.

export type LogEntry = { time: string; text: string };

const MAX_ENTRIES = 60;
let entries: LogEntry[] = [];
const listeners = new Set<() => void>();

export function logStep(text: string): void {
  const time = new Date().toLocaleTimeString("nl-NL");
  entries = [...entries, { time, text }].slice(-MAX_ENTRIES);
  listeners.forEach((listener) => listener());
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
