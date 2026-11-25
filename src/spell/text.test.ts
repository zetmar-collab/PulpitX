import assert from "node:assert/strict";
import test from "node:test";
import { findIssues, postLength, replaceRange } from "./text.ts";

const known = new Set(["jest", "kot", "na"]);

function correct(word: string): boolean {
  return known.has(word.toLocaleLowerCase("pl"));
}

function suggestions(word: string): string[] {
  return word === "krakuf" ? ["Kraków"] : [];
}

test("skips links, mentions, tags and known words", () => {
  const text = "Jest krakuf na https://x.com/home @marek #tag kot";
  const issues = findIssues(text, correct, suggestions, new Set());
  assert.deepEqual(
    issues.map((issue) => issue.word),
    ["krakuf"],
  );
  assert.equal(text[issues[0].index], "k");
  assert.deepEqual(issues[0].suggestions, ["Kraków"]);
});

test("personal dictionary hides a word", () => {
  const issues = findIssues("krakuf", correct, suggestions, new Set(["krakuf"]));
  assert.equal(issues.length, 0);
});

test("links count as 23 characters", () => {
  assert.equal(postLength("https://example.com"), 23);
  assert.equal(postLength("kot"), 3);
  assert.equal(postLength("kot https://example.com"), 27);
});

test("replaceRange swaps the flagged word", () => {
  assert.equal(replaceRange("ab krakuf cd", 3, 6, "Kraków"), "ab Kraków cd");
});
