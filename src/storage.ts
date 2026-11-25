import type { Lang } from "./spell/text";

const CURRENT = "pulpitx.current";
const DRAFTS = "pulpitx.drafts";
const PERSONAL = "pulpitx.personal";
const LANG = "pulpitx.lang";

export type Draft = {
  id: string;
  text: string;
  updatedAt: number;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCurrent(): string {
  try {
    return localStorage.getItem(CURRENT) ?? "";
  } catch {
    return "";
  }
}

export function saveCurrent(text: string) {
  try {
    localStorage.setItem(CURRENT, text);
  } catch {
    // The draft stays in memory when storage is blocked.
  }
}

export function loadLang(): Lang {
  const value = readJson<string>(LANG, "both");
  return value === "pl" || value === "en" || value === "both" ? value : "both";
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG, JSON.stringify(lang));
  } catch {
    // Language falls back to the in-memory choice.
  }
}

export function loadPersonal(): string[] {
  const words = readJson<string[]>(PERSONAL, []);
  return Array.isArray(words) ? words.filter((word) => typeof word === "string" && word.length > 1) : [];
}

export function savePersonal(words: string[]) {
  try {
    localStorage.setItem(PERSONAL, JSON.stringify(words));
  } catch {
    // The added word still applies until the app closes.
  }
}

export function loadDrafts(): Draft[] {
  const drafts = readJson<Draft[]>(DRAFTS, []);
  return Array.isArray(drafts) ? drafts.filter((draft) => typeof draft?.text === "string") : [];
}

export function saveDrafts(drafts: Draft[]) {
  try {
    localStorage.setItem(DRAFTS, JSON.stringify(drafts.slice(0, 12)));
  } catch {
    // Draft list stays in memory.
  }
}
