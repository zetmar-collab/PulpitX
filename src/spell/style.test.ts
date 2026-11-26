import { describe, expect, test } from "vitest";
import { replaceWordAt } from "./text";
import { styleIssues, type StyleIssue } from "./style";

const messages = (text: string) => styleIssues(text).map((issue) => issue.message);

function fixAll(text: string): string {
  // Poprawiamy od końca, żeby indeksy wcześniejszych uwag zostały aktualne.
  const issues = styleIssues(text).filter((i): i is StyleIssue & { replacement: string } => i.replacement !== undefined);
  return [...issues].reverse().reduce((acc, issue) => replaceWordAt(acc, issue.index, issue.original, issue.replacement) ?? acc, text);
}

describe("styleIssues", () => {
  test("pusty tekst nie ma uwag", () => {
    expect(styleIssues("")).toEqual([]);
  });

  test("podwójna spacja", () => {
    expect(messages("Ala  ma kota.")).toContain("Podwójna spacja.");
    expect(fixAll("Ala  ma kota.")).toBe("Ala ma kota.");
  });

  test("spacja przed przecinkiem i kropką", () => {
    expect(fixAll("Ala ma kota , psa .")).toBe("Ala ma kota, psa.");
  });

  test("emotikony nie są traktowane jak interpunkcja", () => {
    expect(styleIssues("Super :) dzięki")).toEqual([]);
  });

  test("brak spacji po przecinku", () => {
    expect(fixAll("Ala,Ola i Ela.")).toBe("Ala, Ola i Ela.");
  });

  test("liczby z przecinkiem i godziny nie są zgłaszane", () => {
    expect(styleIssues("Kosztuje 3,50 zł o 12:30.")).toEqual([]);
  });

  test("powtórzone słowo", () => {
    expect(fixAll("To jest jest test.")).toBe("To jest test.");
  });

  test("kilka wykrzykników", () => {
    expect(fixAll("Super!!!")).toBe("Super!");
  });

  test("zdanie od małej litery, ale nie po skrócie", () => {
    expect(fixAll("Koniec. dalej")).toBe("Koniec. Dalej");
    expect(styleIssues("Kupiłem np. jabłka")).toEqual([]);
    expect(styleIssues("Był to 3. raz")).toEqual([]);
    expect(styleIssues("No i... dalej")).toEqual([]);
  });

  test("przecinek przed „że” i „który”", () => {
    expect(fixAll("Myślę że to działa.")).toBe("Myślę, że to działa.");
    expect(fixAll("Kot który śpi.")).toBe("Kot, który śpi.");
  });

  test("bez przecinka w „mimo że”, „i że” i na początku zdania", () => {
    expect(messages("Mimo że pada, idę.")).toEqual([]);
    expect(messages("Wiem i że wiesz.")).toEqual([]);
    expect(messages("Że co?")).toEqual([]);
    expect(messages("Dom, przed którym stoję.")).toEqual([]);
  });

  test("linki i konta są pomijane", () => {
    expect(styleIssues("Zobacz https://x.com/a,b oraz @ala_ola")).toEqual([]);
  });
});
