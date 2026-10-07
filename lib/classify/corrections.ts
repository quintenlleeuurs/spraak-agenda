// Correction list for known Whisper mistakes. Each line: what Whisper writes →
// what it should be. Add new mistakes here when you find them on the iPhone;
// add a test for each one in classify.test.ts ("correction list").

export const CORRECTIONS: [pattern: RegExp, replacement: string][] = [
  // "'s middags" is often written as one word or without apostrophe (phase 0 test).
  [/(^|[^a-z'])'?s[ -]?(ochtends|morgens|middags|avonds|nachts)\b/gi, "$1's $2"],
  // "tandarts" split in two (phase 0 test: "Tant Arts").
  [/\btant[ -]?arts\b/gi, "tandarts"],
  [/\btand arts\b/gi, "tandarts"],
  [/\bhuis arts\b/gi, "huisarts"],
];

export function applyCorrections(text: string): string {
  return CORRECTIONS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}
