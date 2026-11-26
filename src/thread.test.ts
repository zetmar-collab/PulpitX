import { describe, expect, test } from "vitest";
import { POST_LIMIT, postLength } from "./spell/text";
import { postsLabel, splitThread } from "./thread";

const sentence = "To jest zdanie testowe, które ma kilka słów i kończy się kropką. ";
const long = sentence.repeat(14).trim();

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

describe("splitThread", () => {
  test("krótki tekst to jeden post bez numeracji", () => {
    expect(splitThread("Krótki post.", { numbering: true })).toEqual(["Krótki post."]);
  });

  test("pusty tekst to brak postów", () => {
    expect(splitThread("   ", { numbering: true })).toEqual([]);
  });

  test("każdy post mieści się w limicie, razem z numeracją", () => {
    const parts = splitThread(long, { numbering: true });
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(postLength(part)).toBeLessThanOrEqual(POST_LIMIT);
    expect(parts[0].endsWith(` 1/${parts.length}`)).toBe(true);
  });

  test("bez numeracji tekst po złożeniu jest taki sam", () => {
    const parts = splitThread(long, { numbering: false });
    expect(normalize(parts.join(" "))).toBe(normalize(long));
  });

  test("tnie po końcu zdania, gdy to możliwe", () => {
    const parts = splitThread(long, { numbering: false });
    for (const part of parts.slice(0, -1)) expect(part.endsWith(".")).toBe(true);
  });

  test("linia --- wymusza podział", () => {
    expect(splitThread("Pierwszy.\n---\nDrugi.", { numbering: false })).toEqual(["Pierwszy.", "Drugi."]);
  });

  test("bardzo długi ciąg bez spacji jest cięty", () => {
    const parts = splitThread("a".repeat(700), { numbering: false });
    expect(parts.join("")).toBe("a".repeat(700));
    for (const part of parts) expect(postLength(part)).toBeLessThanOrEqual(POST_LIMIT);
  });

  test("link liczy się jako 23 znaki przy podziale", () => {
    const link = `https://example.com/${"x".repeat(400)}`;
    expect(splitThread(`Zobacz ${link}`, { numbering: false })).toEqual([`Zobacz ${link}`]);
  });
});

test("odmiana liczby postów", () => {
  expect([1, 2, 5, 12, 22, 25].map(postsLabel)).toEqual(["1 post", "2 posty", "5 postów", "12 postów", "22 posty", "25 postów"]);
});
