import { describe, expect, it } from "vitest";
import { analyzeTranscript, splitTranscript } from "./classify";
import { cleanTranscript } from "./cleanup";
import { applyCorrections } from "./corrections";

const TODAY = "2026-10-07"; // Wednesday

describe("correction list", () => {
  it.each([
    ["om twee uur smiddags", "om twee uur 's middags"],
    ["om acht uur s avonds", "om acht uur 's avonds"],
    ["naar de Tant Arts", "naar de tandarts"],
    ["naar de tand arts", "naar de tandarts"],
    ["naar de huis arts", "naar de huisarts"],
    ["'s middags blijft goed", "'s middags blijft goed"],
  ])("%s → %s", (input, expected) => {
    expect(applyCorrections(input)).toBe(expected);
  });
});

describe("cleanup (AI-04)", () => {
  it("removes filler words, fixes spacing and adds capitals and a full stop", () => {
    expect(cleanTranscript("eh ik moet ehm morgen  brood kopen")).toBe("Ik moet morgen brood kopen.");
  });

  it("applies the correction list", () => {
    expect(cleanTranscript("naar de Tant Arts om twee uur smiddags")).toBe("Naar de tandarts om twee uur 's middags.");
  });
});

describe("analyzeTranscript", () => {
  it("handles the iPhone test sentence from phase 0 (whisper-small output)", () => {
    const raw =
      "Ik moet volgende week dinsdag om twee uur smiddags naar de Tant Arts voor een controle. Vergeet niet mijn verzekeringspas mee te nemen.";
    expect(analyzeTranscript(raw, TODAY)).toMatchObject({
      title: "Tandartscontrole",
      type: "afspraak",
      date: "2026-10-13",
      time: "14:00",
      needsReview: false,
    });
  });

  it.each([
    ["Ik moet morgen brood kopen", "todo", "Brood kopen", "2026-10-08"],
    ["Mama bellen", "todo", "Mama bellen", null],
    ["Idee: een app voor recepten", "idee", "Een app voor recepten", null],
    ["Misschien zou het leuk zijn om naar Rome te gaan", "idee", "Misschien zou het leuk zijn om naar Rome…", null],
    ["Vrijdag om zeven uur eten met Sanne", "afspraak", "Eten met Sanne", "2026-10-09"],
    ["Morgen om 10 uur vergadering", "afspraak", "Vergadering", "2026-10-08"],
    ["Ik voel me vandaag goed", "persoonlijk", "Ik voel me goed", "2026-10-07"],
  ])("%s → %s, %s", (raw, type, title, date) => {
    expect(analyzeTranscript(raw, TODAY)).toMatchObject({ type, title, date });
  });

  it("marks an appointment without a time for review (AI-06)", () => {
    expect(analyzeTranscript("Morgen naar de kapper", TODAY)).toMatchObject({
      type: "afspraak",
      title: "Kapper",
      needsReview: true,
    });
  });

  it("keeps items without a date undated (they go to 'Vergeten dingen')", () => {
    expect(analyzeTranscript("Boek over Rome lezen", TODAY).date).toBeNull();
  });
});

describe("splitTranscript (AI-05)", () => {
  it("splits on connecting words", () => {
    expect(splitTranscript("Tandarts om 2 uur én daarna even boodschappen halen")).toEqual([
      "Tandarts om 2 uur",
      "even boodschappen halen",
    ]);
  });

  it("keeps a single sentence whole", () => {
    expect(splitTranscript("Morgen brood kopen")).toEqual(["Morgen brood kopen"]);
  });
});
