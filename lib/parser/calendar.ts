// Calendar helpers working on plain "YYYY-MM-DD" strings.
// We calculate with UTC dates internally so daylight saving time can never
// shift a day; the only time zone question is "what is today", which is
// always answered for Europe/Amsterdam.

export const TIME_ZONE = "Europe/Amsterdam";

/** Today's date in Amsterdam as "YYYY-MM-DD". */
export function todayIso(now: Date = new Date(), timeZone: string = TIME_ZONE): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtc(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Builds a date, or returns null when it does not exist (e.g. 31 February). */
export function makeDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? toIso(date) : null;
}

export function addDays(iso: string, days: number): string {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Adds months; the day is clamped, so 31 January + 1 month = 28/29 February. */
export function addMonths(iso: string, months: number): string {
  const date = toUtc(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIso(date);
}

/** Day of the week with Monday = 0 ... Sunday = 6 (Dutch weeks start on Monday). */
export function weekdayIndex(iso: string): number {
  return (toUtc(iso).getUTCDay() + 6) % 7;
}

/** Monday of the week that contains the given date. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}
