import { describe, expect, it } from "vitest";
import { todayIso } from "./calendar";
import { parseDutchDateTime } from "./dutch-date";

// Fixed "today" so the tests give the same result every day: Wednesday 7 October 2026.
const TODAY = "2026-10-07";
const parse = (text: string) => parseDutchDateTime(text, TODAY);

describe("relative days", () => {
  it.each([
    ["vandaag", "2026-10-07"],
    ["morgen", "2026-10-08"],
    ["overmorgen", "2026-10-09"],
    ["over 3 dagen", "2026-10-10"],
    ["over twee weken", "2026-10-21"],
    ["over een maand", "2026-11-07"],
  ])("%s → %s", (text, date) => {
    expect(parse(text).date).toBe(date);
  });
});

describe("weekdays", () => {
  it.each([
    ["vrijdag", "2026-10-09"],
    ["woensdag", "2026-10-14"], // today is Wednesday, so the next one
    ["deze vrijdag", "2026-10-09"],
    ["deze maandag", "2026-10-12"], // this week's Monday has passed
    ["volgende maandag", "2026-10-12"],
    ["aanstaande zondag", "2026-10-11"],
    ["volgende week dinsdag", "2026-10-13"],
    ["volgende week op vrijdag", "2026-10-16"],
  ])("%s → %s", (text, date) => {
    expect(parse(text).date).toBe(date);
  });

  it("marks 'volgende week' without a day as vague", () => {
    expect(parse("volgende week boodschappen doen")).toMatchObject({ date: "2026-10-12", vague: true });
  });
});

describe("calendar dates", () => {
  it.each([
    ["12 oktober", "2026-10-12"],
    ["3 januari", "2027-01-03"], // already passed this year
    ["eenentwintig oktober", "2026-10-21"],
    ["1e november", "2026-11-01"],
    ["12-10", "2026-10-12"],
    ["5/1/2027", "2027-01-05"],
    ["12 oktober 2027", "2027-10-12"],
  ])("%s → %s", (text, date) => {
    expect(parse(text).date).toBe(date);
  });

  it("ignores dates that do not exist", () => {
    expect(parse("31 februari").date).toBeNull();
  });
});

describe("times", () => {
  it.each([
    ["om 2 uur", "14:00"],
    ["om twee uur 's middags", "14:00"],
    ["om twee uur smiddags", "14:00"], // Whisper's spelling from the iPhone test
    ["half drie", "14:30"],
    ["kwart over tien", "10:15"],
    ["kwart voor tien", "09:45"],
    ["tien over half drie", "14:40"],
    ["vijf voor half drie", "14:25"],
    ["14:00", "14:00"],
    ["om 9.30 uur", "09:30"],
    ["om acht uur 's avonds", "20:00"],
    ["om 8 uur 's ochtends", "08:00"],
    ["'s ochtends om half acht", "07:30"],
    ["om twaalf uur 's middags", "12:00"],
    ["om twee", "14:00"],
  ])("%s → %s", (text, time) => {
    expect(parse(text).time).toBe(time);
  });

  it("does not read 'over 2 uur' as two o'clock", () => {
    expect(parse("over 2 uur bellen").time).toBeNull();
  });
});

describe("combined phrases", () => {
  it("handles the example from the requirements (§13)", () => {
    const text =
      "Ik moet volgende week dinsdag om twee uur 's middags naar de tandarts voor een controle, vergeet niet mijn verzekeringspasje mee te nemen";
    expect(parse(text)).toMatchObject({ date: "2026-10-13", time: "14:00", conflict: false, vague: false });
  });

  it.each([
    ["morgenochtend om negen uur", "2026-10-08", "09:00"],
    ["vanavond om zeven uur", "2026-10-07", "19:00"],
    ["donderdagavond om acht uur", "2026-10-08", "20:00"],
    ["morgen om half drie", "2026-10-08", "14:30"],
  ])("%s → %s %s", (text, date, time) => {
    expect(parse(text)).toMatchObject({ date, time });
  });

  it("returns the positions of the date phrases", () => {
    const text = "Morgen om 2 uur tandarts";
    const result = parse(text);
    expect(result.spans.map(([start, end]) => text.slice(start, end))).toEqual(["Morgen", "om 2 uur"]);
  });

  it("finds nothing in text without a date", () => {
    expect(parse("brood kopen")).toMatchObject({ date: null, time: null, spans: [] });
  });

  it("flags two different dates as a conflict (AI-06)", () => {
    expect(parse("morgen of vrijdag naar de kapper").conflict).toBe(true);
  });

  it("does not flag the same date mentioned twice", () => {
    expect(parse("vrijdag 9 oktober").conflict).toBe(false);
  });
});

describe("todayIso", () => {
  it("uses Amsterdam time, not UTC", () => {
    // 23:30 UTC on 7 October is already 8 October in Amsterdam (UTC+2 in summer time).
    expect(todayIso(new Date("2026-10-07T23:30:00Z"))).toBe("2026-10-08");
  });
});
