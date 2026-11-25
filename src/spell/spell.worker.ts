import nspell from "nspell";
import plAff from "../../node_modules/dictionary-pl/index.aff?raw";
import plDic from "../../node_modules/dictionary-pl/index.dic?raw";
import enAff from "../../node_modules/dictionary-en/index.aff?raw";
import enDic from "../../node_modules/dictionary-en/index.dic?raw";
import { findIssues, type Issue, type Lang } from "./text";

type Spell = {
  correct(word: string): boolean;
  suggest(word: string): string[];
};

type Incoming =
  | { type: "init" }
  | { type: "check"; id: number; text: string; lang: Lang; personal: string[] };

let polish: Spell | null = null;
let english: Spell | null = null;

function engines(): { polish: Spell; english: Spell } {
  if (!polish || !english) {
    polish = nspell(plAff, plDic);
    english = nspell(enAff, enDic);
  }
  return { polish, english };
}

function isCorrect(word: string, lang: Lang): boolean {
  const { polish: pl, english: en } = engines();
  if (lang === "pl") return pl.correct(word);
  if (lang === "en") return en.correct(word);
  return pl.correct(word) || en.correct(word);
}

function suggestionsFor(word: string, lang: Lang): string[] {
  const { polish: pl, english: en } = engines();
  const lists = lang === "pl" ? [pl.suggest(word)] : lang === "en" ? [en.suggest(word)] : [pl.suggest(word), en.suggest(word)];
  const unique: string[] = [];
  for (const list of lists) {
    for (const suggestion of list) {
      if (!unique.some((item) => item.toLocaleLowerCase("pl") === suggestion.toLocaleLowerCase("pl"))) {
        unique.push(suggestion);
      }
      if (unique.length >= 6) return unique;
    }
  }
  return unique;
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      engines();
      self.postMessage({ type: "ready" });
      return;
    }

    const personal = new Set(message.personal.map((word) => word.toLocaleLowerCase("pl")));
    const issues: Issue[] = findIssues(
      message.text,
      (word) => isCorrect(word, message.lang),
      (word) => suggestionsFor(word, message.lang),
      personal,
    );
    self.postMessage({ type: "issues", id: message.id, issues });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Nie udało się sprawdzić pisowni.";
    if (message.type === "check") {
      self.postMessage({ type: "error", id: message.id, message: detail });
      return;
    }
    self.postMessage({ type: "error", message: detail });
  }
};
