import { beforeEach, describe, expect, test, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args), isTauri: () => true }));

beforeEach(() => {
  invoke.mockReset();
  vi.resetModules();
});

describe("klient pisowni", () => {
  test("wysyła unikalne słowa w NFC i składa wynik", async () => {
    const { checkSpelling } = await import("./client");
    invoke.mockResolvedValueOnce([null, ["Kraków"]]);
    const issues = await checkSpelling("kot krakuf kot", "pl", new Set());
    expect(invoke).toHaveBeenCalledWith("spell_check", { words: ["kot", "krakuf"], lang: "pl" });
    expect(issues).toEqual([{ word: "krakuf", index: 4, suggestions: ["Kraków"] }]);
  });

  test("tekst bez słów nie woła Rust", async () => {
    const { checkSpelling } = await import("./client");
    expect(await checkSpelling("https://x.com @ala", "both", new Set())).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  test("po błędzie słownik można wczytać ponownie", async () => {
    const { warmSpellcheck } = await import("./client");
    invoke.mockRejectedValueOnce("Słownik polski: błąd");
    await expect(warmSpellcheck()).rejects.toThrow("Słownik polski: błąd");
    invoke.mockResolvedValueOnce(undefined);
    await expect(warmSpellcheck()).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  test("równoczesne ładowanie woła Rust raz", async () => {
    const { warmSpellcheck } = await import("./client");
    invoke.mockResolvedValue(undefined);
    await Promise.all([warmSpellcheck(), warmSpellcheck()]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("szerokość panelu", () => {
  test("ta sama reguła co w Rust", async () => {
    const { clampSidebar } = await import("../desktop");
    expect(clampSidebar(440, 1360)).toBe(440);
    expect(clampSidebar(100, 1360)).toBe(360);
    expect(clampSidebar(5000, 1360)).toBe(940);
    expect(clampSidebar(Number.NaN, 1360)).toBe(440);
    expect(clampSidebar(500, 600)).toBe(360);
  });
});
