import { beforeEach, describe, expect, test } from "vitest";
import * as store from "./storage";

beforeEach(() => localStorage.clear());

const empty: store.BackupState = { current: "", lang: "both", drafts: [], personal: [], snippets: [], reminders: [] };

describe("odczyt z localStorage", () => {
  test("uszkodzony JSON daje wartości domyślne", () => {
    localStorage.setItem("pulpitx.drafts", "{nie json");
    localStorage.setItem("pulpitx.personal", '"tekst"');
    localStorage.setItem("pulpitx.lang", '"de"');
    localStorage.setItem("pulpitx.sidebar", '"szeroko"');
    expect(store.loadDrafts()).toEqual([]);
    expect(store.loadPersonal()).toEqual([]);
    expect(store.loadLang()).toBe("both");
    expect(store.loadSidebar()).toBe(440);
  });

  test("złe elementy list są odfiltrowane", () => {
    localStorage.setItem("pulpitx.drafts", JSON.stringify([{ text: "ok", id: "1", updatedAt: 5 }, { text: 3 }, null, { text: "  " }]));
    localStorage.setItem("pulpitx.personal", JSON.stringify(["Kot", "kot", "a", 7]));
    expect(store.loadDrafts()).toEqual([{ id: "1", text: "ok", updatedAt: 5 }]);
    expect(store.loadPersonal()).toEqual(["kot"]);
  });

  test("zapis i odczyt szablonów i przypomnień", () => {
    store.saveSnippets([{ id: "s", text: "#AI" }]);
    store.saveReminders([{ id: "r", at: 10, text: "post", done: false }]);
    expect(store.loadSnippets()).toEqual([{ id: "s", text: "#AI" }]);
    expect(store.loadReminders()).toEqual([{ id: "r", at: 10, text: "post", done: false }]);
  });
});

describe("addDraft", () => {
  test("dodaje na początek i usuwa duplikat treści", () => {
    const first = store.addDraft([], "a", false, 1).drafts;
    const second = store.addDraft(first, "b", false, 2).drafts;
    const again = store.addDraft(second, "a", true, 3).drafts;
    expect(again.map((d) => d.text)).toEqual(["a", "b"]);
    expect(again[0].auto).toBe(true);
  });

  test("zgłasza szkice usunięte przez limit", () => {
    let drafts: store.Draft[] = [];
    for (let i = 0; i < store.MAX_DRAFTS; i += 1) drafts = store.addDraft(drafts, `d${i}`).drafts;
    const result = store.addDraft(drafts, "nowy");
    expect(result.drafts).toHaveLength(store.MAX_DRAFTS);
    expect(result.dropped).toBe(1);
  });
});

describe("kopia zapasowa", () => {
  test("eksport i import zachowują dane", () => {
    const state: store.BackupState = {
      current: "tekst",
      lang: "pl",
      drafts: [{ id: "1", text: "szkic", updatedAt: 1 }],
      personal: ["kotek"],
      snippets: [{ id: "s", text: "#AI" }],
      reminders: [{ id: "r", at: 5, text: "post", done: true }],
    };
    const raw = JSON.stringify(store.buildBackup(state, new Date(0)));
    expect(store.parseBackup(raw)).toEqual(state);
  });

  test("obcy plik jest odrzucany", () => {
    expect(() => store.parseBackup("{}")).toThrow("To nie jest plik kopii Pulpit X.");
    expect(() => store.parseBackup("nie json")).toThrow();
  });

  test("scalanie niczego nie kasuje", () => {
    const mine: store.BackupState = {
      ...empty,
      current: "mój tekst",
      drafts: [{ id: "1", text: "wspólny", updatedAt: 1 }],
      personal: ["kot"],
      snippets: [{ id: "a", text: "#A" }],
    };
    const theirs: store.BackupState = {
      ...empty,
      current: "ich tekst",
      drafts: [
        { id: "2", text: "wspólny", updatedAt: 1 },
        { id: "3", text: "nowy", updatedAt: 9 },
      ],
      personal: ["pies", "kot"],
      snippets: [{ id: "b", text: "#A" }, { id: "c", text: "#B" }],
      reminders: [{ id: "r", at: 5, text: "x", done: false }],
    };
    const merged = store.mergeBackup(mine, theirs);
    expect(merged.current).toBe("mój tekst");
    expect(merged.drafts.map((d) => d.text).sort()).toEqual(["ich tekst", "nowy", "wspólny"]);
    expect(merged.personal).toEqual(["kot", "pies"]);
    expect(merged.snippets.map((s) => s.text)).toEqual(["#A", "#B"]);
    expect(merged.reminders).toHaveLength(1);
  });

  test("pusty edytor dostaje tekst z kopii", () => {
    expect(store.mergeBackup(empty, { ...empty, current: "z kopii" }).current).toBe("z kopii");
  });

  test("znacznik czasu do nazwy pliku", () => {
    expect(store.fileStamp(new Date(2026, 10, 26, 9, 5))).toBe("2026-11-26_0905");
  });
});
