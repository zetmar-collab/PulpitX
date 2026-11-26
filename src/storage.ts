import { DEFAULT_SIDEBAR } from "./desktop";
import type { Lang } from "./spell/text";

const CURRENT = "pulpitx.current";
const DRAFTS = "pulpitx.drafts";
const PERSONAL = "pulpitx.personal";
const LANG = "pulpitx.lang";
const SNIPPETS = "pulpitx.snippets";
const REMINDERS = "pulpitx.reminders";
const SIDEBAR = "pulpitx.sidebar";

export const MAX_DRAFTS = 30;
export const MAX_SNIPPETS = 40;

export type Draft = {
  id: string;
  text: string;
  updatedAt: number;
  /** Zapisany automatycznie przed nadpisaniem tekstu. */
  auto?: boolean;
};

export type Snippet = {
  id: string;
  text: string;
};

export type Reminder = {
  id: string;
  at: number;
  text: string;
  done: boolean;
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Zablokowany localStorage: dane zostają w pamięci do zamknięcia programu.
  }
}

function readJson(key: string): unknown {
  const raw = read(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function newId(): string {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export { newId };

// --- walidacja (wspólna dla localStorage i importu kopii) ---

export function cleanLang(value: unknown): Lang {
  return value === "pl" || value === "en" || value === "both" ? value : "both";
}

export function cleanWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const word of value) {
    if (typeof word !== "string") continue;
    const key = word.trim().toLocaleLowerCase("pl");
    if (key.length > 1 && key.length <= 64 && !out.includes(key)) out.push(key);
  }
  return out;
}

export function cleanDrafts(value: unknown): Draft[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((d): d is Draft => typeof d?.text === "string" && d.text.trim() !== "")
    .map((d) => ({
      id: typeof d.id === "string" && d.id ? d.id : newId(),
      text: d.text,
      updatedAt: Number.isFinite(d.updatedAt) ? d.updatedAt : Date.now(),
      ...(d.auto ? { auto: true } : {}),
    }))
    .slice(0, MAX_DRAFTS);
}

export function cleanSnippets(value: unknown): Snippet[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Snippet => typeof s?.text === "string" && s.text.trim() !== "")
    .map((s) => ({ id: typeof s.id === "string" && s.id ? s.id : newId(), text: s.text }))
    .slice(0, MAX_SNIPPETS);
}

export function cleanReminders(value: unknown): Reminder[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Reminder => Number.isFinite(r?.at) && typeof r?.text === "string")
    .map((r) => ({
      id: typeof r.id === "string" && r.id ? r.id : newId(),
      at: r.at,
      text: r.text,
      done: r.done === true,
    }));
}

// --- odczyt i zapis ---

export const loadCurrent = (): string => read(CURRENT) ?? "";
export const saveCurrent = (text: string) => write(CURRENT, text);

export const loadLang = (): Lang => cleanLang(readJson(LANG));
export const saveLang = (lang: Lang) => write(LANG, JSON.stringify(lang));

export const loadPersonal = (): string[] => cleanWords(readJson(PERSONAL));
export const savePersonal = (words: string[]) => write(PERSONAL, JSON.stringify(words));

export const loadDrafts = (): Draft[] => cleanDrafts(readJson(DRAFTS));
export const saveDrafts = (drafts: Draft[]) => write(DRAFTS, JSON.stringify(drafts.slice(0, MAX_DRAFTS)));

export const loadSnippets = (): Snippet[] => cleanSnippets(readJson(SNIPPETS));
export const saveSnippets = (snippets: Snippet[]) => write(SNIPPETS, JSON.stringify(snippets.slice(0, MAX_SNIPPETS)));

export const loadReminders = (): Reminder[] => cleanReminders(readJson(REMINDERS));
export const saveReminders = (reminders: Reminder[]) => write(REMINDERS, JSON.stringify(reminders));

export function loadSidebar(): number {
  const value = readJson(SIDEBAR);
  return typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_SIDEBAR;
}
export const saveSidebar = (width: number) => write(SIDEBAR, JSON.stringify(Math.round(width)));

// --- szkice ---

/**
 * Dodaje szkic na początek listy (bez duplikatów treści).
 * Zwraca nową listę i liczbę szkiców usuniętych przez limit.
 */
export function addDraft(drafts: Draft[], text: string, auto = false, now = Date.now()): { drafts: Draft[]; dropped: number } {
  const rest = drafts.filter((draft) => draft.text !== text);
  const all = [{ id: newId(), text, updatedAt: now, ...(auto ? { auto: true } : {}) }, ...rest];
  return { drafts: all.slice(0, MAX_DRAFTS), dropped: Math.max(0, all.length - MAX_DRAFTS) };
}

// --- kopia zapasowa ---

export type Backup = {
  app: "pulpitx";
  version: 1;
  exportedAt: string;
  current: string;
  lang: Lang;
  drafts: Draft[];
  personal: string[];
  snippets: Snippet[];
  reminders: Reminder[];
};

export type BackupState = Omit<Backup, "app" | "version" | "exportedAt">;

export function buildBackup(state: BackupState, now = new Date()): Backup {
  return { app: "pulpitx", version: 1, exportedAt: now.toISOString(), ...state };
}

export function parseBackup(raw: string): BackupState {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("To nie jest plik kopii Pulpit X.");
  }
  if (typeof data !== "object" || data === null || (data as { app?: unknown }).app !== "pulpitx") {
    throw new Error("To nie jest plik kopii Pulpit X.");
  }
  const d = data as Record<string, unknown>;
  return {
    current: typeof d.current === "string" ? d.current : "",
    lang: cleanLang(d.lang),
    drafts: cleanDrafts(d.drafts),
    personal: cleanWords(d.personal),
    snippets: cleanSnippets(d.snippets),
    reminders: cleanReminders(d.reminders),
  };
}

/**
 * Scala kopię z obecnymi danymi, niczego nie kasując:
 * słowa i szablony są sumowane, szkice dopisywane bez duplikatów,
 * a tekst z kopii trafia do edytora tylko wtedy, gdy edytor jest pusty
 * (w przeciwnym razie zostaje zapisany jako szkic).
 */
export function mergeBackup(mine: BackupState, theirs: BackupState): BackupState {
  const texts = new Set(mine.drafts.map((d) => d.text));
  const extraDrafts = theirs.drafts.filter((d) => !texts.has(d.text));
  let drafts = [...mine.drafts, ...extraDrafts].sort((a, b) => b.updatedAt - a.updatedAt);
  let current = mine.current;
  if (theirs.current.trim()) {
    if (!mine.current.trim()) current = theirs.current;
    else if (theirs.current !== mine.current && !drafts.some((d) => d.text === theirs.current)) {
      drafts = [{ id: newId(), text: theirs.current, updatedAt: Date.now(), auto: true }, ...drafts];
    }
  }
  const snippetTexts = new Set(mine.snippets.map((s) => s.text));
  const reminderIds = new Set(mine.reminders.map((r) => r.id));
  return {
    current,
    lang: mine.lang,
    drafts: drafts.slice(0, MAX_DRAFTS),
    personal: cleanWords([...mine.personal, ...theirs.personal]),
    snippets: [...mine.snippets, ...theirs.snippets.filter((s) => !snippetTexts.has(s.text))].slice(0, MAX_SNIPPETS),
    reminders: [...mine.reminders, ...theirs.reminders.filter((r) => !reminderIds.has(r.id))],
  };
}

/** Znacznik czasu do nazwy pliku: 2026-11-26_1430. */
export function fileStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}
