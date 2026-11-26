# Pulpit X

Aplikacja Windows do prowadzenia własnego konta na X. Po lewej jest edytor posta ze sprawdzaniem pisowni i stylu, po prawej strona [x.com/home](https://x.com/home).

Logowanie odbywa się na stronie X. Hasło nie jest zapisywane przez Pulpit X. Gotowy tekst wstawiasz w pole posta przyciskiem **Wstaw do X** albo kopiujesz i wklejasz. Aplikacja nigdy nie publikuje za Ciebie.

## Co potrafi

- **Pisownia offline** – polski i angielski (Hunspell przez crate `spellbook` w Rust), własny słownik, „Ignoruj” do końca sesji.
- **Styl i interpunkcja** – lokalne reguły: podwójne spacje, spacja przed przecinkiem, brak spacji po znaku, powtórzone słowa, „!!!”, zdanie od małej litery, przecinek przed „że”, „który”, „ale”. To podpowiedzi, nie pełna korekta gramatyczna.
- **Licznik jak na X** – oficjalna biblioteka `twitter-text`: link = 23 znaki, emoji = 2.
- **Wątek** – dzieli długi tekst na posty (najchętniej po końcu zdania), opcjonalnie z numeracją `1/n`. Linia z samym `---` wymusza podział.
- **Wstaw do X** – wkleja tekst w pole posta w widoku X (Ctrl+Shift+Enter). Publikujesz sam.
- **Szkice z historią** – „Wyczyść” i wczytanie szkicu najpierw chowają bieżący tekst w szkicach, a baner „Cofnij” przywraca go jednym kliknięciem.
- **Szablony i hashtagi** – zapisane fragmenty wstawiane w miejscu kursora.
- **Przypomnienia** – powiadomienie systemowe o wybranej porze (gdy program jest włączony).
- **Kopia zapasowa** – szkice, słownik, szablony i przypomnienia w pliku JSON w folderze Pobrane. Wczytanie kopii niczego nie kasuje.
- **Regulowany panel** – przeciągnij krawędź edytora (dwuklik przywraca 440 px, strzałki też działają).
- Linki spoza x.com otwierają się w przeglądarce systemowej.

Skróty: Ctrl+Enter kopiuje, Ctrl+Shift+Enter wstawia do X, Ctrl+S zapisuje szkic.

## Bezpieczeństwo

- Widok x.com (`x-home`) nie ma żadnych uprawnień Tauri, a każda komenda aplikacji sprawdza, czy wywołał ją edytor (`main`).
- Widok X tworzy i układa Rust (`src-tauri/src/timeline.rs`); frontend nie ma uprawnień do tworzenia webview.
- Nawigacja poza x.com/twitter.com (oraz strony logowania Google i Apple) trafia do przeglądarki systemowej; schematy lokalne (np. `file:`) są blokowane.

## Uruchomienie

```bash
npm install
npm run check        # tsc + testy frontendu (Vitest) + testy Rust
npm run tauri dev
```

Przy pierwszym starcie Rust kompiluje program. Potem otwiera się okno Pulpit X.

Inne polecenia:

```bash
npm test             # testy frontendu
npm run test:rust    # testy Rust
npm run tauri build  # instalator NSIS w src-tauri/target/release/bundle/nsis/
```

Gotowe pliki `.exe` nie są trzymane w repozytorium (`release/` jest w `.gitignore`). Publikuj je jako GitHub Release.

## Słowniki

Słowniki są w `src-tauri/dictionaries/` i są wkompilowane w program: polski (Hunspell, licencja MPL-2.0 / LGPL-3.0 / GPL-3.0) i angielski (MIT / BSD). Teksty licencji leżą obok plików i trafiają do instalatora. Własne słowa, szkice i ustawienia zostają w tej aplikacji, na tym komputerze.
