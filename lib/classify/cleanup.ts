// Layer 1 summary (AI-04): a tidied-up version of the transcript. The exact
// Whisper text is stored separately and never changed.

import { applyCorrections } from "./corrections";

// Filler words like "eh", "ehm", "uhm" (with an optional comma after them).
const FILLERS = /\b(?:e+h+m*|u+h+m*|euh|hm+)\b[,.]?\s*/gi;

export function cleanTranscript(raw: string): string {
  let text = applyCorrections(raw);
  text = text.replace(FILLERS, "");
  text = text.replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  // Capital letter at the start of every sentence.
  text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
  if (text && !/[.!?]$/.test(text)) text += ".";
  return text;
}
