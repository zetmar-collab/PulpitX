import { invoke, isTauri } from "@tauri-apps/api/core";
import { buildIssues, candidates, type Issue, type Lang } from "./text";

export class SpellUnavailable extends Error {
  constructor() {
    super("Słownik działa w programie Pulpit X dla Windows.");
  }
}

let warming: Promise<void> | null = null;

/** Ładuje słowniki w Rust. Kolejne wywołania czekają na to samo ładowanie. */
export function warmSpellcheck(): Promise<void> {
  if (!isTauri()) return Promise.reject(new SpellUnavailable());
  if (!warming) {
    warming = invoke<void>("spell_warm").catch((error: unknown) => {
      warming = null;
      throw error instanceof Error ? error : new Error(String(error));
    });
  }
  return warming;
}

export async function checkSpelling(text: string, lang: Lang, personal: ReadonlySet<string>): Promise<Issue[]> {
  if (!isTauri()) throw new SpellUnavailable();
  const list = candidates(text, personal);
  const unique = [...new Set(list.map((item) => item.word.normalize("NFC")))];
  if (unique.length === 0) return [];
  const results = await invoke<(string[] | null)[]>("spell_check", { words: unique, lang });
  const verdicts = new Map<string, string[] | null>();
  unique.forEach((word, i) => verdicts.set(word, results[i] ?? null));
  return buildIssues(list, verdicts);
}
