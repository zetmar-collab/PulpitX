# Pulpit X

Aplikacja Windows do prowadzenia własnego konta na X. Po lewej jest edytor posta ze sprawdzaniem pisowni, po prawej strona [x.com/home](https://x.com/home).

Logowanie odbywa się na stronie X. Hasło nie jest zapisywane przez Pulpit X. Gotowy tekst kopiujesz i wklejasz w pole posta. Aplikacja nie publikuje za Ciebie.

Słowniki działają offline: polski (Hunspell, licencja MPL-2.0 / LGPL-3.0 / GPL-3.0) i angielski (MIT / BSD). Własne słowa i szkice zostają w tej aplikacji, na tym komputerze.

## Uruchomienie

```bash
npm install
npm test
npm run tauri dev
```

Przy pierwszym starcie Rust kompiluje program. Potem otwiera się okno Pulpit X.

Gotowy program dla Windows jest w `release/Pulpit X.exe`. Instalator: `release/Pulpit X-setup.exe`.
