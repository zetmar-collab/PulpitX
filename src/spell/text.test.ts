import { describe, expect, test } from "vitest";
import { applySuggestion, candidates, findIssues, postLength, replaceRange, replaceWordAt } from "./text";

const known = new Set(["jest", "kot", "na", "pisz", "hej", "zażółć"]);

function correct(word: string): boolean {
  return known.has(word.toLocaleLowerCase("pl"));
}

function suggestions(word: string): string[] {
  if (word === "krakuf") return ["Kraków"];
  if (word === "warszafa") return ["Warszawa"];
  return [];
}

const words = (text: string) => findIssues(text, correct, suggestions, new Set()).map((issue) => issue.word);

describe("findIssues", () => {
  test("pomija linki, konta, hashtagi i znane słowa", () => {
    const text = "Jest krakuf na https://x.com/home @marek #tag kot";
    const issues = findIssues(text, correct, suggestions, new Set());
    expect(issues.map((issue) => issue.word)).toEqual(["krakuf"]);
    expect(text[issues[0].index]).toBe("k");
    expect(issues[0].suggestions).toEqual(["Kraków"]);
  });

  test("własny słownik ukrywa słowo", () => {
    expect(findIssues("krakuf", correct, suggestions, new Set(["krakuf"]))).toHaveLength(0);
  });

  test("konto z podkreśleniem nie jest zgłaszane w częściach", () => {
    expect(words("@jan_kowalskiq hej")).toEqual([]);
  });

  test("adres e-mail i domena bez https nie są sprawdzane", () => {
    expect(words("pisz na jan@firma.com")).toEqual([]);
    expect(words("kot example.com")).toEqual([]);
  });

  test("tekst w postaci NFD nie rozbija słów z ogonkami", () => {
    expect(words("zażółć".normalize("NFD"))).toEqual([]);
  });

  test("hashtag z cyframi i podkreśleniem jest pomijany", () => {
    expect(words("#AI_2026 kot")).toEqual([]);
  });

  test("każde wystąpienie słowa ma swój indeks", () => {
    const issues = findIssues("krakuf kot krakuf", correct, suggestions, new Set());
    expect(issues.map((issue) => issue.index)).toEqual([0, 11]);
  });

  test("candidates nie zwraca słów z własnego słownika", () => {
    expect(candidates("Krakuf kot", new Set(["krakuf"]))).toEqual([{ word: "kot", index: 7 }]);
  });
});

describe("postLength liczy jak X", () => {
  test("link to 23 znaki", () => {
    expect(postLength("https://example.com")).toBe(23);
    expect(postLength("kot")).toBe(3);
    expect(postLength("kot https://example.com")).toBe(27);
  });

  test("domena bez https też jest linkiem", () => {
    expect(postLength("zobacz example.com")).toBe(30);
  });

  test("kropka po linku nie należy do linku", () => {
    expect(postLength("https://x.com.")).toBe(24);
  });

  test("emoji liczy się jako 2", () => {
    expect(postLength("👍")).toBe(2);
    expect(postLength("👨‍👩‍👧")).toBe(2);
  });

  test("polskie litery liczą się jako 1", () => {
    expect(postLength("zażółć")).toBe(6);
    expect(postLength("")).toBe(0);
  });
});

describe("podmiana słów", () => {
  test("replaceRange podmienia zakres", () => {
    expect(replaceRange("ab krakuf cd", 3, 6, "Kraków")).toBe("ab Kraków cd");
  });

  test("replaceWordAt odmawia, gdy słowo się przesunęło", () => {
    expect(replaceWordAt("ab krakuf cd", 3, "krakuf", "Kraków")).toBe("ab Kraków cd");
    expect(replaceWordAt("XX ab krakuf cd", 3, "krakuf", "Kraków")).toBeNull();
  });

  test("applySuggestion przesuwa indeksy kolejnych problemów", () => {
    const text = "krakuf i warszafa";
    const issues = findIssues(text, correct, suggestions, new Set());
    const first = applySuggestion(text, issues, issues[0], "Kraków");
    expect(first).not.toBeNull();
    const second = applySuggestion(first!.text, first!.issues, first!.issues[0], "Warszawa");
    expect(second?.text).toBe("Kraków i Warszawa");
    expect(second?.issues).toEqual([]);
  });
});
