import { invoke, isTauri } from "@tauri-apps/api/core";

export const HOME_URL = "https://x.com/home";
export const DEFAULT_SIDEBAR = 440;
export const MIN_SIDEBAR = 360;
export const MIN_STAGE = 420;

export type InsertStatus = "inserted" | "opening" | "missing";

export function runningOnDesktop(): boolean {
  return isTauri();
}

function message(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error) return new Error(error);
  return new Error(fallback);
}

async function call<T>(command: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw message(error, fallback);
  }
}

/** Szerokość panelu mieszcząca się w oknie (ta sama reguła co w Rust). */
export function clampSidebar(requested: number, windowWidth: number): number {
  const max = Math.max(MIN_SIDEBAR, windowWidth - MIN_STAGE);
  const wanted = Number.isFinite(requested) ? requested : DEFAULT_SIDEBAR;
  return Math.min(max, Math.max(MIN_SIDEBAR, wanted));
}

export function openTimeline(sidebar: number): Promise<number> {
  return call("open_timeline", { sidebar }, "Nie udało się otworzyć X.");
}

export function goHome(): Promise<void> {
  return call("go_home", {}, "Nie udało się wrócić na stronę główną.");
}

export function setSidebar(width: number): Promise<number> {
  return call("set_sidebar", { width }, "Nie udało się zmienić szerokości panelu.");
}

export function insertIntoX(text: string): Promise<InsertStatus> {
  return call("insert_into_x", { text }, "Nie udało się wstawić tekstu w X.");
}

export async function openInBrowser(): Promise<void> {
  if (!isTauri()) {
    window.open(HOME_URL, "_blank", "noopener");
    return;
  }
  await call("open_in_browser", {}, "Nie udało się otworzyć przeglądarki.");
}

export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  await call("notify", { title, body }, "Nie udało się pokazać powiadomienia.");
}

export function exportBackup(json: string, stamp: string): Promise<string> {
  return call("export_backup", { json, stamp }, "Nie udało się zapisać kopii.");
}
