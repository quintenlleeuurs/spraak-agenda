// Layer 1 "AI": rules and keyword lists that turn a transcript into a card:
// type (AI-03), title (AI-01), date/time (AI-02), summary (AI-04) and
// whether the user should check the date (AI-06).

import { parseDutchDateTime } from "@/lib/parser/dutch-date";
import { cleanTranscript } from "./cleanup";
import { applyCorrections } from "./corrections";

export type ItemType = "afspraak" | "todo" | "idee" | "persoonlijk";

export type Analysis = {
  title: string;
  type: ItemType;
  date: string | null;
  time: string | null;
  summary: string;
  needsReview: boolean;
};

// --- Keyword lists (AI-03) ------------------------------------------------------

const IDEA_PATTERNS = [/\bidee\b/, /\bmisschien\b/, /\bzou (?:leuk|mooi|gaaf|tof|handig) zijn\b/, /\blater uitwerken\b/, /\bwat als\b/];

/** Words that point to an appointment. The value is the title we use for it. */
const APPOINTMENT_WORDS: Record<string, string> = {
  afspraak: "Afspraak", tandarts: "Tandarts", huisarts: "Huisarts", dokter: "Dokter", kapper: "Kapper",
  vergadering: "Vergadering", meeting: "Meeting", overleg: "Overleg", sollicitatie: "Sollicitatie",
  sollicitatiegesprek: "Sollicitatiegesprek", fysio: "Fysio", fysiotherapeut: "Fysiotherapeut",
  ziekenhuis: "Ziekenhuis", verjaardag: "Verjaardag", feest: "Feest", bioscoop: "Bioscoop",
  etentje: "Etentje", diner: "Diner", borrel: "Borrel", bruiloft: "Bruiloft", concert: "Concert",
  training: "Training", les: "Les", lunch: "Lunch",
};

/** Appointment words that can be combined with "controle" into one word. */
const CHECKUP_NOUNS = ["tandarts", "huisarts", "dokter", "ziekenhuis", "fysio"];

const TODO_PATTERNS = [
  /\bmoet(?:en)?\b/, /\bkopen\b/, /\bregelen\b/, /\bbellen\b/, /\bhalen\b/, /\bbetalen\b/, /\bmailen\b/,
  /\bsturen\b/, /\bopzeggen\b/, /\baanvragen\b/, /\binleveren\b/, /\bboodschappen\b/, /\bopruimen\b/,
  /\bafmaken\b/, /\brepareren\b/, /\bniet vergeten\b/, /\bvergeet niet\b/,
];

// --- Title (AI-01) ----------------------------------------------------------------

const MAX_TITLE_LENGTH = 40;

// Words at the start of a sentence that say nothing about the task itself.
const LEADING_PHRASES =
  /^(?:(?:een )?idee:?\s+|niet vergeten:?\s+(?:om\s+)?|vergeet niet:?\s+(?:om\s+)?|ik\s+(?:moet|wil|ga|zou|heb|kan)\s+|we\s+(?:moeten|willen|gaan)\s+|nog\s+|even\s+|om\s+)+/i;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function truncate(text: string): string {
  if (text.length <= MAX_TITLE_LENGTH) return text;
  // Cut at the last space within the limit, so no word is cut in half.
  const cut = text.slice(0, MAX_TITLE_LENGTH + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut.slice(0, MAX_TITLE_LENGTH)).trim() + "…";
}

function makeTitle(text: string, lower: string, spans: [number, number][]): string {
  // 1. "tandarts" + "controle" → "Tandartscontrole"
  const checkup = CHECKUP_NOUNS.find((noun) => lower.includes(noun));
  if (checkup && /\bcontrole\b/.test(lower)) return capitalize(`${checkup}controle`);

  // 2. "eten met Sanne" → "Eten met Sanne"
  const dinner = text.match(/\b(?:uit )?eten met ([A-Z][\p{L}-]*)/u);
  if (dinner) return `Eten met ${dinner[1]}`;

  // 3. An appointment word on its own → that word as title.
  const word = Object.keys(APPOINTMENT_WORDS).find((key) => new RegExp(`\\b${key}\\b`).test(lower));
  if (word) return APPOINTMENT_WORDS[word];

  // 4. Otherwise: the first part of the sentence without date phrases and filler.
  let rest = text;
  for (const [start, end] of [...spans].reverse()) rest = rest.slice(0, start) + rest.slice(end);
  rest = rest.replace(/\s+/g, " ").trim().replace(LEADING_PHRASES, "");
  rest = rest.split(/[.!?,;:]|\ben daarna\b/)[0].trim();
  return rest ? truncate(capitalize(rest)) : "Notitie";
}

// --- Main function ------------------------------------------------------------------

export function analyzeTranscript(raw: string, today: string): Analysis {
  const corrected = applyCorrections(raw).trim();
  const lower = corrected.toLowerCase();
  const parsed = parseDutchDateTime(corrected, today);

  const hasAppointmentWord =
    Object.keys(APPOINTMENT_WORDS).some((key) => new RegExp(`\\b${key}\\b`).test(lower)) ||
    /\b(?:uit )?eten met\b/.test(lower);

  let type: ItemType = "persoonlijk";
  if (IDEA_PATTERNS.some((pattern) => pattern.test(lower))) type = "idee";
  else if (parsed.time || hasAppointmentWord) type = "afspraak";
  else if (TODO_PATTERNS.some((pattern) => pattern.test(lower))) type = "todo";

  // AI-06: check the date when it is unclear or an appointment has no time.
  const needsReview = parsed.conflict || parsed.vague || (type === "afspraak" && !parsed.time);

  return {
    title: makeTitle(corrected, lower, parsed.spans),
    type,
    date: parsed.date,
    time: parsed.time,
    summary: cleanTranscript(raw),
    needsReview,
  };
}

// --- Split suggestion (AI-05) -------------------------------------------------------

const SPLIT_WORDS = /\s*,?\s+(?:[eé]n daarna|én|ook nog|verder)\s+/i;

/**
 * Splits "Tandarts om 2 uur én daarna boodschappen halen" into parts when it
 * contains connecting words. Returns one part when there is nothing to split.
 * The user always decides whether to split (AI-05); the UI follows in phase 4.
 */
export function splitTranscript(raw: string): string[] {
  return raw
    .split(SPLIT_WORDS)
    .map((part) => part.trim())
    .filter(Boolean);
}
