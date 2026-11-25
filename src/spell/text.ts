export type Lang = "pl" | "en" | "both";

export type Issue = {
  word: string;
  index: number;
  suggestions: string[];
};

export const POST_LIMIT = 280;

const SOCIAL = new Set([
  "ok",
  "dm",
  "rt",
  "url",
  "api",
  "id",
  "tv",
  "ai",
  "css",
  "html",
  "js",
  "pl",
  "en",
  "www",
]);

const TOKEN = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
const URL = /(?:https?:\/\/|www\.)[^\s]+/gi;

type Range = [number, number];

function coveredRanges(text: string): Range[] {
  const ranges: Range[] = [];
  for (const match of text.matchAll(URL)) {
    const index = match.index ?? 0;
    ranges.push([index, index + match[0].length]);
  }
  return ranges;
}

function inside(index: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

export function postLength(text: string): number {
  let length = 0;
  let cursor = 0;
  for (const match of text.matchAll(URL)) {
    const index = match.index ?? 0;
    length += graphemes(text.slice(cursor, index));
    length += 23;
    cursor = index + match[0].length;
  }
  length += graphemes(text.slice(cursor));
  return length;
}

function graphemes(text: string): number {
  if (!text) return 0;
  let count = 0;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const _part of segmenter.segment(text)) count += 1;
  return count;
}

export function findIssues(
  text: string,
  isCorrect: (word: string) => boolean,
  suggestionsFor: (word: string) => string[],
  personal: ReadonlySet<string>,
  limit = 12,
): Issue[] {
  const ranges = coveredRanges(text);
  const issues: Issue[] = [];

  for (const match of text.matchAll(TOKEN)) {
    const word = match[0];
    const index = match.index ?? 0;
    if (word.length < 2) continue;
    if (inside(index, ranges)) continue;
    const previous = index > 0 ? text[index - 1] : "";
    if (previous === "@" || previous === "#") continue;
    const key = word.toLocaleLowerCase("pl");
    if (personal.has(key) || SOCIAL.has(key)) continue;
    if (/\d/.test(word)) continue;
    if (isCorrect(word)) continue;

    const suggestions = issues.length < limit ? suggestionsFor(word).slice(0, 6) : [];
    issues.push({ word, index, suggestions });
  }

  return issues;
}

export function replaceRange(text: string, index: number, length: number, next: string): string {
  return text.slice(0, index) + next + text.slice(index + length);
}
