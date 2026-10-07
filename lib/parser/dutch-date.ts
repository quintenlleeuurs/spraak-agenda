// Rule-based Dutch date/time parser (AI-02). Deterministic: the same text and
// the same "today" always give the same answer. Dates are never calculated by
// an AI model (AI-08).
//
// Recurrence ("elke dinsdag") is not handled yet: that is phase 6 (REC-02).
// The structure below (one pattern per kind of phrase) is designed so that
// recurrence patterns can be added as extra steps later.

import { addDays, addMonths, makeDate, startOfWeek, weekdayIndex } from "./calendar";

export type ParsedDateTime = {
  date: string | null; // "YYYY-MM-DD"
  time: string | null; // "HH:mm"
  /** Character ranges in the original text that were date/time phrases. */
  spans: [number, number][];
  /** Two different dates or times were mentioned (AI-06). */
  conflict: boolean;
  /** A date was found but it is imprecise, e.g. only "volgende week". */
  vague: boolean;
};

type Daypart = "ochtend" | "middag" | "avond" | "nacht";

// --- Vocabulary -------------------------------------------------------------

const BASE_NUMBERS: Record<string, number> = {
  een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10,
  elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17,
  achttien: 18, negentien: 19, twintig: 20, dertig: 30,
};

// Adds compound numbers like "eenentwintig" (21) and "tweeentwintig" (22, "tweeëntwintig"
// without the diacritic) up to 31, enough for days of the month.
const NUMBER_WORDS: Record<string, number> = { ...BASE_NUMBERS };
for (const [unit, value] of Object.entries(BASE_NUMBERS).slice(0, 9)) {
  for (const [tens, tensValue] of [["twintig", 20], ["dertig", 30]] as const) {
    if (tensValue + value <= 31) NUMBER_WORDS[`${unit}en${tens}`] = tensValue + value;
  }
}

// Longest words first, so "eenentwintig" wins over "een".
// NUM_ALTERNATIVES is used inside other groups; NUM captures the number itself.
const NUM_ALTERNATIVES = `\\d{1,2}|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")}`;
const NUM = `(${NUM_ALTERNATIVES})`;

const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const WEEKDAY = `(${WEEKDAYS.join("|")})`;

const MONTHS: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maart: 3, mrt: 3, april: 4, apr: 4, mei: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, augustus: 8, aug: 8, september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH = `(${Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|")})`;

const DAYPART_SUFFIX = "(ochtend|morgen|middag|avond|nacht)";

function toNumber(token: string): number {
  return /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
}

function toDaypart(word: string): Daypart {
  return (word === "morgen" ? "ochtend" : word) as Daypart;
}

// --- Normalisation ------------------------------------------------------------

/**
 * Lowercases, removes accents and rewrites "'s middags" / "smiddags" (a common
 * Whisper spelling) to a marker like "@middag". Every replacement keeps the
 * exact same length, so positions still match the original text.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[’‘`]/g, "'")
    .replace(/[,!?;]/g, " ")
    .replace(/(^|[^a-z])('?s[ -]?(ochtends|morgens|middags|avonds|nachts))\b/g, (_, before, phrase, part) => {
      const marker = `@${toDaypart(part.slice(0, -1))}`;
      return before + marker.padEnd(phrase.length, " ");
    });
}

// --- Time arithmetic ----------------------------------------------------------

/**
 * Turns a spoken hour into a 24-hour clock hour. Without a daypart we assume
 * 1–6 o'clock means the afternoon, because appointments at 2 at night are rare.
 */
function to24Hour(hour: number, daypart: Daypart | null): number {
  if (hour > 12) return hour; // already a 24-hour time, e.g. 14:00
  switch (daypart) {
    case "ochtend":
    case "nacht":
      return hour === 12 ? 0 : hour;
    case "middag":
    case "avond":
      return hour < 12 ? hour + 12 : hour;
    default:
      return hour >= 1 && hour <= 6 ? hour + 12 : hour;
  }
}

function formatTime(totalMinutes: number): string {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// --- Parser -------------------------------------------------------------------

export function parseDutchDateTime(text: string, today: string): ParsedDateTime {
  let working = normalize(text);
  const spans: [number, number][] = [];
  const dates: string[] = [];
  // A time is an "anchor" hour plus an offset in minutes:
  // "half drie" = 3 o'clock − 30 minutes, "kwart over tien" = 10 o'clock + 15.
  const times: { hour: number; offset: number }[] = [];
  let daypart: Daypart | null = null;
  let vague = false;

  /** Runs one pattern; every match is recorded and blanked out so later patterns skip it. */
  function scan(pattern: string, handle: (groups: string[], start: number) => boolean | void) {
    const regex = new RegExp(pattern, "g");
    for (const match of working.matchAll(regex)) {
      const start = match.index;
      if (handle(match.slice(1), start) === false) continue;
      const end = start + match[0].length;
      spans.push([start, end]);
      working = working.slice(0, start) + " ".repeat(end - start) + working.slice(end);
    }
  }

  const nextWeekday = (day: number, minimumDaysAhead: number) => {
    const ahead = (day - weekdayIndex(today) + 7) % 7;
    return addDays(today, ahead < minimumDaysAhead ? ahead + 7 : ahead);
  };

  // 1. "morgenochtend", "vanavond", "vanmorgen"
  scan(`\\b(morgen|van)${DAYPART_SUFFIX}\\b`, ([which, part]) => {
    dates.push(which === "morgen" ? addDays(today, 1) : today);
    daypart = toDaypart(part);
  });

  // 2. "vandaag", "overmorgen", "morgen"
  scan(`\\b(vandaag|overmorgen|morgen)\\b`, ([word]) => {
    dates.push(addDays(today, { vandaag: 0, morgen: 1, overmorgen: 2 }[word]!));
  });

  // 3. "over 3 dagen", "over twee weken", "over een maand"
  scan(`\\bover ${NUM} (dagen|dag|weken|week|maanden|maand)\\b`, ([amount, unit]) => {
    const n = toNumber(amount);
    if (unit.startsWith("dag")) dates.push(addDays(today, n));
    else if (unit.startsWith("we")) dates.push(addDays(today, 7 * n));
    else dates.push(addMonths(today, n));
  });

  // 4. "volgende week dinsdag", "volgende week op dinsdagavond"
  scan(`\\b(?:volgende|komende) week (?:op )?${WEEKDAY}${DAYPART_SUFFIX}?\\b`, ([day, part]) => {
    dates.push(addDays(startOfWeek(today), 7 + WEEKDAYS.indexOf(day)));
    if (part) daypart = toDaypart(part);
  });

  // 5. "volgende week" without a day: Monday of next week, flagged as vague.
  scan(`\\b(?:volgende|komende) week\\b`, () => {
    dates.push(addDays(startOfWeek(today), 7));
    vague = true;
  });

  // 6. "dinsdag", "deze vrijdag", "aanstaande maandag", "donderdagavond"
  scan(`\\b(?:(deze|volgende|aanstaande|komende) )?${WEEKDAY}${DAYPART_SUFFIX}?\\b`, ([modifier, day, part]) => {
    const index = WEEKDAYS.indexOf(day);
    if (modifier === "deze") {
      // The day in the current week; if it has passed, the next one.
      const inThisWeek = addDays(startOfWeek(today), index);
      dates.push(inThisWeek >= today ? inThisWeek : addDays(inThisWeek, 7));
    } else {
      // Always a future day: "woensdag" said on a Wednesday means next week.
      dates.push(nextWeekday(index, 1));
    }
    if (part) daypart = toDaypart(part);
  });

  // 7. "12 oktober", "3e januari 2027", "eenentwintig oktober"
  scan(`\\b${NUM}(?:ste|de|e)? ${MONTH}\\b(?: (\\d{4})\\b)?`, ([dayToken, monthToken, yearToken]) => {
    const day = toNumber(dayToken);
    const month = MONTHS[monthToken];
    const date = resolveDayMonth(day, month, yearToken ? Number(yearToken) : null, today);
    if (!date) return false;
    dates.push(date);
  });

  // 8. "12-10", "12/10/2026"
  scan(`\\b(\\d{1,2})[-/](\\d{1,2})(?:[-/](\\d{4}|\\d{2}))?\\b`, ([d, m, y]) => {
    const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : null;
    const date = resolveDayMonth(Number(d), Number(m), year, today);
    if (!date) return false;
    dates.push(date);
  });

  // 9. "14:00", "om 9.30 uur"
  scan(`\\b(?:om )?(\\d{1,2})[:.](\\d{2})(?: uur)?\\b`, ([h, m]) => {
    if (Number(h) > 23 || Number(m) > 59) return false;
    times.push({ hour: Number(h), offset: Number(m) });
  });

  // 10. "kwart over tien", "vijf voor half drie", "tien over half drie"
  scan(`\\b(?:om )?(kwart|${NUM_ALTERNATIVES})(?: minuten)? (over|voor) (half )?${NUM}(?: uur)?\\b`, ([amount, direction, half, h]) => {
    const minutes = amount === "kwart" ? 15 : toNumber(amount);
    const hour = toNumber(h);
    if (minutes > 29 || hour < 1 || hour > 12) return false;
    times.push({ hour, offset: (half ? -30 : 0) + (direction === "over" ? minutes : -minutes) });
  });

  // 11. "half drie" (= 2:30)
  scan(`\\b(?:om )?half ${NUM}(?: uur)?\\b`, ([h]) => {
    const hour = toNumber(h);
    if (hour < 1 || hour > 12) return false;
    times.push({ hour, offset: -30 });
  });

  // 12. "om 2 uur", "twee uur" (but not "over 2 uur", which is a duration)
  scan(`\\b(?:om )?${NUM} uur\\b`, ([h], start) => {
    const hour = toNumber(h);
    if (hour > 24 || /over\s*$/.test(working.slice(0, start))) return false;
    times.push({ hour, offset: 0 });
  });

  // 13. "om twee" without "uur"
  scan(`\\bom ${NUM}\\b`, ([h]) => {
    const hour = toNumber(h);
    if (hour < 1 || hour > 24) return false;
    times.push({ hour, offset: 0 });
  });

  // 14. Loose dayparts: "'s middags", "smiddags"
  scan(`@(ochtend|middag|avond|nacht)`, ([part]) => {
    daypart = part as Daypart;
  });

  const uniqueDates = [...new Set(dates)];
  const resolvedTimes = [...new Set(times.map((t) => formatTime(to24Hour(t.hour, daypart) * 60 + t.offset)))];

  return {
    date: dates[0] ?? null,
    time: resolvedTimes[0] ?? null,
    spans: spans.sort((a, b) => a[0] - b[0]),
    conflict: uniqueDates.length > 1 || resolvedTimes.length > 1,
    vague,
  };
}

/** A day + month without a year means the next time that date comes around. */
function resolveDayMonth(day: number, month: number, year: number | null, today: string): string | null {
  if (!month || month > 12) return null;
  if (year) return makeDate(year, month, day);
  const thisYear = Number(today.slice(0, 4));
  const candidate = makeDate(thisYear, month, day);
  if (!candidate) return null;
  return candidate >= today ? candidate : makeDate(thisYear + 1, month, day);
}
