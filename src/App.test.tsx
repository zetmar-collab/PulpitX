import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { findIssues } from "./spell/text";

const known = new Set(["i", "ab", "cd", "kot", "jest", "xx"]);
const fixes: Record<string, string[]> = { krakuf: ["Kraków"], warszafa: ["Warszawa"] };

vi.mock("./spell/client", () => ({
  warmSpellcheck: () => Promise.resolve(),
  checkSpelling: (text: string, _lang: string, personal: ReadonlySet<string>) =>
    Promise.resolve(
      findIssues(text, (w) => known.has(w.toLocaleLowerCase("pl")), (w) => fixes[w] ?? [], personal),
    ),
}));

vi.mock("./desktop", async (original) => ({
  ...(await original<typeof import("./desktop")>()),
  runningOnDesktop: () => false,
}));

const { default: App } = await import("./App");

function editor(): HTMLTextAreaElement {
  return screen.getByLabelText("Treść posta") as HTMLTextAreaElement;
}

function type(value: string) {
  fireEvent.change(editor(), { target: { value } });
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("App", () => {
  test("dwie podpowiedzi kliknięte po sobie trafiają we właściwe słowa", async () => {
    render(<App />);
    type("krakuf i warszafa");
    await screen.findByRole("button", { name: "Warszawa" });
    fireEvent.click(screen.getByRole("button", { name: "Kraków" }));
    fireEvent.click(screen.getByRole("button", { name: "Warszawa" }));
    expect(editor().value).toBe("Kraków i Warszawa");
  });

  test("podpowiedź nie psuje tekstu, który zmienił się od sprawdzenia", async () => {
    render(<App />);
    type("ab krakuf cd");
    await screen.findByRole("button", { name: "Kraków" });
    type("XX ab krakuf cd");
    fireEvent.click(screen.getByRole("button", { name: "Kraków" }));
    expect(editor().value).toBe("XX ab krakuf cd");
    expect(screen.getByText(/Tekst zmienił się od sprawdzenia/)).toBeTruthy();
  });

  test("zignorowane słowo nie wraca po edycji wcześniejszego tekstu", async () => {
    render(<App />);
    type("krakuf kot");
    await screen.findByRole("button", { name: "Kraków" });
    fireEvent.click(screen.getByRole("button", { name: "Ignoruj" }));
    type("jest krakuf kot");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole("button", { name: "Kraków" })).toBeNull();
  });

  test("Wyczyść zapisuje tekst w szkicach i pozwala cofnąć", async () => {
    render(<App />);
    type("ważny tekst");
    fireEvent.click(screen.getByRole("button", { name: "Wyczyść" }));
    expect(editor().value).toBe("");
    expect(screen.getByText(/ważny tekst/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cofnij" }));
    expect(editor().value).toBe("ważny tekst");
  });

  test("wczytanie szkicu nie gubi bieżącego tekstu", async () => {
    render(<App />);
    type("pierwszy");
    fireEvent.click(screen.getByRole("button", { name: "Zachowaj szkic" }));
    type("drugi, niezapisany");
    fireEvent.click(screen.getByRole("button", { name: /^pierwszy/ }));
    expect(editor().value).toBe("pierwszy");
    expect(screen.getByRole("button", { name: /^drugi, niezapisany/ })).toBeTruthy();
  });

  test("tryb wątku dzieli długi tekst", async () => {
    render(<App />);
    type("Zdanie numer jeden jest tutaj. ".repeat(20));
    fireEvent.click(screen.getByRole("button", { name: "Wątek" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /Wątek: 3 posty/ })).toBeTruthy());
    expect(screen.getAllByRole("button", { name: "Kopiuj" })).toHaveLength(3);
  });

  test("szablon wstawia się w miejscu kursora", async () => {
    render(<App />);
    type("Ala kota");
    fireEvent.click(screen.getByText(/Szablony i hashtagi/));
    fireEvent.change(screen.getByLabelText("Nowy szablon"), { target: { value: "ma" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Dodaj" }).at(-1)!);
    editor().setSelectionRange(3, 3);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ma" }));
    });
    expect(editor().value).toBe("Ala ma kota");
  });

  test("licznik pokazuje długość jak na X", () => {
    render(<App />);
    type("👍 https://example.com");
    expect(screen.getByText("26 / 280")).toBeTruthy();
  });

  test("poprawka stylu wstawia przecinek", async () => {
    render(<App />);
    type("Myślę że kot");
    fireEvent.click(await screen.findByRole("button", { name: "Popraw" }));
    expect(editor().value).toBe("Myślę, że kot");
  });
});
