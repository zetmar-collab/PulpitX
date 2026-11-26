import twitter from "twitter-text";

export type Lang = "pl" | "en" | "both";

export type Issue = {
  word: string;
  index: number;
  suggestions: string[];
};

export type Candidate = {
  word: string;
  index: number;
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

// \p{M} łączy litery z ogonkami zapisane jako znak + znak łączący (NFD).
const TOKEN = /\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu;
const LINK = /(?:https?:\/\/|www\.)[^\s]+/gi;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const HANDLE = /[@#＠][\p{L}\p{M}\p{N}_]+/gu;

type Range = [number, number];

function rangesOf(text: string, pattern: RegExp): Range[] {
  const ranges: Range[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    ranges.push([index, index + match[0].length]);
  }
  return ranges;
}

/** Fragmenty, których nie sprawdzamy: linki, adresy e-mail, @konta i #hashtagi. */
export function coveredRanges(text: string): Range[] {
  return [
    ...rangesOf(text, LINK),
    ...rangesOf(text, EMAIL),
    ...twitter.extractUrlsWithIndices(text).map((url) => url.indices as Range),
    ...rangesOf(text, HANDLE),
  ];
}

function inside(index: number, ranges: Range[]): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/** Długość posta tak, jak liczy ją X: link = 23, emoji = 2, większość liter = 1. */
export function postLength(text: string): number {
  if (!text) return 0;
  return twitter.parseTweet(text).weightedLength;
}

/** Słowa do sprawdzenia w słowniku, z pominięciem linków, kont, hashtagów i słów własnych. */
export function candidates(text: string, personal: ReadonlySet<string>): Candidate[] {
  const ranges = coveredRanges(text);
  const out: Candidate[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const word = match[0].normalize("NFC");
    const index = match.index ?? 0;
    if (match[0].length < 2 || [...word].length < 2) continue;
    if (inside(index, ranges)) continue;
    const key = word.toLocaleLowerCase("pl");
    if (personal.has(key) || SOCIAL.has(key)) continue;
    out.push({ word: match[0], index });
  }
  return out;
}

/** Składa wynik słownika (null = poprawne) w listę problemów. */
export function buildIssues(
  list: Candidate[],
  verdicts: ReadonlyMap<string, string[] | null>,
): Issue[] {
  const issues: Issue[] = [];
  for (const item of list) {
    const verdict = verdicts.get(item.word.normalize("NFC"));
    if (verdict == null) continue;
    issues.push({ word: item.word, index: item.index, suggestions: verdict.slice(0, 6) });
  }
  return issues;
}

/** Wersja synchroniczna (testy i proste użycia). */
export function findIssues(
  text: string,
  isCorrect: (word: string) => boolean,
  suggestionsFor: (word: string) => string[],
  personal: ReadonlySet<string>,
  limit = 12,
): Issue[] {
  const verdicts = new Map<string, string[] | null>();
  let suggested = 0;
  for (const item of candidates(text, personal)) {
    const word = item.word.normalize("NFC");
    if (verdicts.has(word)) continue;
    if (isCorrect(word)) {
      verdicts.set(word, null);
      continue;
    }
    verdicts.set(word, suggested < limit ? suggestionsFor(word).slice(0, 6) : []);
    suggested += 1;
  }
  return buildIssues(candidates(text, personal), verdicts);
}

export function replaceRange(text: string, index: number, length: number, next: string): string {
  return text.slice(0, index) + next + text.slice(index + length);
}

/**
 * Podmienia słowo tylko wtedy, gdy nadal stoi w tym samym miejscu.
 * Chroni przed podmianą złego fragmentu, gdy tekst zmienił się od ostatniego sprawdzenia.
 */
export function replaceWordAt(text: string, index: number, word: string, next: string): string | null {
  if (text.slice(index, index + word.length) !== word) return null;
  return replaceRange(text, index, word.length, next);
}

/**
 * Stosuje podpowiedź i przesuwa indeksy pozostałych problemów, żeby kolejne kliknięcia
 * (zanim słownik sprawdzi tekst ponownie) trafiały we właściwe miejsca.
 * Zwraca null, gdy słowo nie stoi już na swoim miejscu.
 */
export function applySuggestion(
  text: string,
  issues: Issue[],
  target: Issue,
  suggestion: string,
): { text: string; issues: Issue[] } | null {
  const next = replaceWordAt(text, target.index, target.word, suggestion);
  if (next === null) return null;
  const delta = suggestion.length - target.word.length;
  return {
    text: next,
    issues: issues
      .filter((issue) => issue !== target)
      .map((issue) => (issue.index > target.index ? { ...issue, index: issue.index + delta } : issue)),
  };
}
