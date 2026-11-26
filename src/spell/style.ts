import { coveredRanges } from "./text";

/** Uwaga stylistyczna. `original` musi nadal stać na `index`, żeby poprawka się zastosowała. */
export type StyleIssue = {
  index: number;
  original: string;
  replacement?: string;
  message: string;
};

const LETTER = "\\p{L}\\p{M}";

// Spójniki, przed którymi w polszczyźnie zwykle stoi przecinek.
const CONJUNCTIONS = [
  "że",
  "żeby",
  "aby",
  "ponieważ",
  "gdyż",
  "który",
  "która",
  "które",
  "którego",
  "której",
  "których",
  "którym",
  "którymi",
  "którzy",
  "ale",
  "lecz",
];

// Słowa tworzące ze spójnikiem całość („mimo że”, „i że”) — wtedy przecinka nie wstawiamy między nie.
const COMPOUND = new Set([
  "mimo",
  "pomimo",
  "chyba",
  "tak",
  "tyle",
  "zwłaszcza",
  "tylko",
  "dlatego",
  "i",
  "oraz",
  "albo",
  "lub",
  "czy",
  "a",
  "ale",
  "bo",
  "niż",
  "jak",
  "aż",
  "to",
  "przy",
  "w",
  "z",
  "o",
  "na",
  "do",
  "od",
  "po",
  "dla",
  "przez",
  "bez",
  "nad",
  "pod",
  "przed",
  "za",
  "u",
  "we",
  "ze",
  "ku",
  "między",
  "pomiędzy",
  "wśród",
  "dzięki",
  "według",
  "wobec",
  "około",
  "poprzez",
  "nie",
  "no",
  "jeszcze",
  "nawet",
  "właśnie",
  "jedynie",
]);

const ABBREVIATIONS = new Set([
  "np",
  "itp",
  "itd",
  "tzn",
  "tj",
  "in",
  "ok",
  "ul",
  "nr",
  "wg",
  "godz",
  "r",
  "w",
  "zob",
  "prof",
  "dr",
  "mgr",
  "inż",
  "tzw",
  "pt",
  "ds",
  "br",
  "ang",
  "pol",
  "św",
  "al",
  "pl",
  "im",
  "tel",
  "min",
  "max",
  "vs",
  "etc",
]);

type Rule = (text: string) => StyleIssue[];

function each(text: string, pattern: RegExp, make: (match: RegExpMatchArray) => StyleIssue | null): StyleIssue[] {
  const out: StyleIssue[] = [];
  for (const match of text.matchAll(pattern)) {
    const issue = make(match);
    if (issue) out.push(issue);
  }
  return out;
}

const doubleSpace: Rule = (text) =>
  each(text, /(?<=\S)[ \t]{2,}(?=\S)/g, (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: " ",
    message: "Podwójna spacja.",
  }));

const spaceBeforePunctuation: Rule = (text) =>
  each(text, new RegExp(`(?<=[${LETTER}\\d])[ \\t]+([,.!?;:])(?=\\s|$)`, "gu"), (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: m[1],
    message: "Spacja przed znakiem interpunkcyjnym.",
  }));

const missingSpaceAfter: Rule = (text) => [
  ...each(text, new RegExp(`(?<=[${LETTER}])([,;!?])(?=[${LETTER}])`, "gu"), (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: `${m[1]} `,
    message: `Brak spacji po „${m[1]}”.`,
  })),
  ...each(text, /(?<=\p{Ll}{2})\.(?=\p{Lu}\p{Ll})/gu, (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: ". ",
    message: "Brak spacji po kropce.",
  })),
];

const repeatedWord: Rule = (text) =>
  each(text, new RegExp(`(?<![${LETTER}])([${LETTER}]+)\\s+\\1(?![${LETTER}])`, "giu"), (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: m[1],
    message: `Powtórzone słowo „${m[1]}”.`,
  }));

const repeatedMarks: Rule = (text) =>
  each(text, /([!?])\1+/g, (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: m[1],
    message: m[1] === "!" ? "Kilka wykrzykników z rzędu." : "Kilka znaków zapytania z rzędu.",
  }));

const trailingSpace: Rule = (text) =>
  each(text, /(?<=\S)[ \t]+$/gm, (m) => ({
    index: m.index ?? 0,
    original: m[0],
    replacement: "",
    message: "Spacja na końcu linii.",
  }));

const lowercaseSentence: Rule = (text) =>
  each(text, new RegExp(`([${LETTER}\\d]*)([.!?])([ \\t]+)(\\p{Ll})`, "gu"), (m) => {
    const before = m[1].toLocaleLowerCase("pl");
    const index = (m.index ?? 0) + m[1].length;
    if (m[2] === "." && (ABBREVIATIONS.has(before) || /^\d+$/.test(before) || text[index - 1] === ".")) return null;
    if (text.slice(Math.max(0, index - 2), index + 1).includes("..")) return null;
    return {
      index,
      original: `${m[2]}${m[3]}${m[4]}`,
      replacement: `${m[2]}${m[3]}${m[4].toLocaleUpperCase("pl")}`,
      message: "Zdanie zaczyna się małą literą.",
    };
  });

const missingComma: Rule = (text) =>
  each(
    text,
    new RegExp(`([${LETTER}]+)([ \\t]+)(${CONJUNCTIONS.join("|")})(?![${LETTER}])`, "giu"),
    (m) => {
      const previous = m[1].toLocaleLowerCase("pl");
      const conj = m[3].toLocaleLowerCase("pl");
      if (COMPOUND.has(previous) || CONJUNCTIONS.includes(previous)) return null;
      const index = (m.index ?? 0) + m[1].length;
      return {
        index,
        original: `${m[2]}${m[3]}`,
        replacement: `,${m[2]}${m[3]}`,
        message: `Przed „${conj}” zwykle stawia się przecinek.`,
      };
    },
  );

const RULES: Rule[] = [
  doubleSpace,
  spaceBeforePunctuation,
  missingSpaceAfter,
  repeatedWord,
  repeatedMarks,
  trailingSpace,
  lowercaseSentence,
  missingComma,
];

/** Proste, lokalne reguły stylu i interpunkcji. To podpowiedzi, nie pełna korekta gramatyczna. */
export function styleIssues(text: string, limit = 20): StyleIssue[] {
  if (!text.trim()) return [];
  const ranges = coveredRanges(text);
  const skip = (index: number) => ranges.some(([start, end]) => index >= start && index < end);
  const seen = new Set<string>();
  return RULES.flatMap((rule) => rule(text))
    .filter((issue) => !skip(issue.index))
    .sort((a, b) => a.index - b.index)
    .filter((issue) => {
      const key = `${issue.index}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function styleKey(issue: StyleIssue): string {
  return `${issue.message}|${issue.original.toLocaleLowerCase("pl")}`;
}
