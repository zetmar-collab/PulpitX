import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkSpelling, warmSpellcheck } from "./spell/client";
import { POST_LIMIT, postLength, replaceRange, type Issue, type Lang } from "./spell/text";
import {
  loadCurrent,
  loadDrafts,
  loadLang,
  loadPersonal,
  saveCurrent,
  saveDrafts,
  saveLang,
  savePersonal,
  type Draft,
} from "./storage";
import { HOME_URL, openTimeline, runningOnDesktop, showHome } from "./timeline";
import "./App.css";

const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "pl", label: "Polski" },
  { id: "en", label: "English" },
  { id: "both", label: "Oba" },
];

function issueKey(issue: Issue): string {
  return `${issue.index}:${issue.word.toLocaleLowerCase("pl")}`;
}

function spellCount(count: number): string {
  if (count === 1) return "1 słowo do sprawdzenia.";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} słowa do sprawdzenia.`;
  }
  return `${count} słów do sprawdzenia.`;
}

export default function App() {
  const desktop = runningOnDesktop();
  const [text, setText] = useState(loadCurrent);
  const [lang, setLang] = useState<Lang>(loadLang);
  const [personal, setPersonal] = useState<string[]>(loadPersonal);
  const [drafts, setDrafts] = useState<Draft[]>(loadDrafts);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [dictionary, setDictionary] = useState<"loading" | "ready" | "error">("loading");
  const [notice, setNotice] = useState("");
  const [timeline, setTimeline] = useState<"loading" | "ready" | "error" | "browser">(
    desktop ? "loading" : "browser",
  );
  const [timelineError, setTimelineError] = useState("");

  const known = useMemo(
    () => new Set(personal.map((word) => word.toLocaleLowerCase("pl"))),
    [personal],
  );
  const visibleIssues = issues.filter((issue) => !ignored.includes(issueKey(issue)));
  const length = postLength(text);
  const overLimit = length > POST_LIMIT;

  useEffect(() => {
    saveCurrent(text);
  }, [text]);

  useEffect(() => {
    saveLang(lang);
  }, [lang]);

  useEffect(() => {
    let alive = true;
    warmSpellcheck()
      .then(() => {
        if (alive) setDictionary("ready");
      })
      .catch(() => {
        if (alive) setDictionary("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    openTimeline()
      .then(() => {
        if (alive) setTimeline("ready");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setTimeline("error");
        setTimelineError(error instanceof Error ? error.message : "Nie udało się otworzyć X.");
      });
    return () => {
      alive = false;
    };
  }, [desktop]);

  useEffect(() => {
    if (dictionary !== "ready") return;
    let alive = true;
    const timer = window.setTimeout(() => {
      checkSpelling(text, lang, [...known])
        .then((next) => {
          if (alive) setIssues(next);
        })
        .catch(() => {
          if (alive) setNotice("Nie udało się sprawdzić tego tekstu.");
        });
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [text, lang, known, dictionary]);

  async function copyPost() {
    if (!text.trim()) {
      setNotice("Najpierw napisz post.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Skopiowano. Wklej tekst w polu posta na X (Ctrl+V).");
    } catch {
      setNotice("Nie udało się skopiować. Zaznacz tekst i użyj Ctrl+C.");
    }
  }

  function keepDraft() {
    if (!text.trim()) {
      setNotice("Pusty szkic nie został zapisany.");
      return;
    }
    const next = [
      { id: crypto.randomUUID(), text, updatedAt: Date.now() },
      ...drafts.filter((draft) => draft.text !== text),
    ].slice(0, 12);
    setDrafts(next);
    saveDrafts(next);
    setNotice("Szkic zapisany na tym komputerze.");
  }

  function addWord(word: string) {
    const key = word.toLocaleLowerCase("pl");
    if (known.has(key)) return;
    const next = [...personal, key];
    setPersonal(next);
    savePersonal(next);
  }

  function forgetWord(word: string) {
    const next = personal.filter((item) => item !== word);
    setPersonal(next);
    savePersonal(next);
  }

  async function goHome() {
    if (!desktop) {
      window.open(HOME_URL, "_blank", "noopener");
      return;
    }
    setTimeline("loading");
    setTimelineError("");
    try {
      await showHome();
      setTimeline("ready");
    } catch (error) {
      setTimeline("error");
      setTimelineError(error instanceof Error ? error.message : "Nie udało się wrócić na stronę główną.");
    }
  }

  async function openOutside() {
    if (desktop) {
      await openUrl(HOME_URL);
      return;
    }
    window.open(HOME_URL, "_blank", "noopener");
  }

  const spellStatus =
    dictionary === "loading"
      ? "Wczytuję słowniki polski i angielski…"
      : dictionary === "error"
        ? "Słownik się nie załadował. Możesz pisać, ale bez podpowiedzi."
        : visibleIssues.length === 0
          ? text.trim()
            ? "Pisownia wygląda dobrze."
            : "Słownik gotowy."
        : spellCount(visibleIssues.length);

  return (
    <div className="app">
      <section className="desk">
        <header className="mast">
          <p className="mark">Pulpit X</p>
          <h1>Post z korektą</h1>
          <p className="lede">
            Piszesz tutaj. Pisownia sprawdza się lokalnie. Na X logujesz się sam, a gotowy tekst wklejasz w pole posta.
          </p>
        </header>

        <div className="lang" role="group" aria-label="Język słownika">
          {LANGUAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === lang ? "on" : ""}
              onClick={() => setLang(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="paper">
          <span className="sr">Treść posta</span>
          <textarea
            value={text}
            lang={lang === "en" ? "en" : "pl"}
            spellCheck
            placeholder="O czym chcesz napisać?"
            onChange={(event) => {
              setText(event.target.value);
              setNotice("");
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                void copyPost();
              }
            }}
          />
        </label>

        <div className="meter">
          <p className={overLimit ? "count hot" : "count"}>
            {length} / {POST_LIMIT}
          </p>
          <p className="hint">
            {overLimit
              ? "Ponad 280 znaków. Zwykłe konto X może nie przyjąć całości. Dłuższe posty działają na kontach Premium."
              : "Link liczy się jako 23 znaki, tak jak na X."}
          </p>
        </div>

        <div className="actions">
          <button type="button" className="primary" onClick={() => void copyPost()}>
            Kopiuj post
          </button>
          <button type="button" onClick={keepDraft}>
            Zachowaj szkic
          </button>
          <button
            type="button"
            onClick={() => {
              setText("");
              setIssues([]);
              setNotice("");
            }}
          >
            Wyczyść
          </button>
        </div>
        <p className="notice" role="status">
          {notice || "Ctrl+Enter kopiuje post."}
        </p>

        <section className="proof" aria-live="polite">
          <h2>Pisownia</h2>
          <p className={dictionary === "error" ? "status bad" : "status"}>{spellStatus}</p>
          {visibleIssues.length > 0 && (
            <ul className="issues">
              {visibleIssues.map((issue) => (
                <li key={issueKey(issue)}>
                  <div className="word-row">
                    <strong>{issue.word}</strong>
                    <span>
                      <button type="button" onClick={() => setIgnored((current) => [...current, issueKey(issue)])}>
                        Ignoruj
                      </button>
                      <button type="button" onClick={() => addWord(issue.word)}>
                        Dodaj
                      </button>
                    </span>
                  </div>
                  {issue.suggestions.length > 0 ? (
                    <div className="suggestions">
                      {issue.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() =>
                            setText((current) => replaceRange(current, issue.index, issue.word.length, suggestion))
                          }
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="quiet">Brak podpowiedzi.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {personal.length > 0 && (
          <section className="personal">
            <h2>Twój słownik</h2>
            <ul>
              {personal.map((word) => (
                <li key={word}>
                  <span>{word}</span>
                  <button type="button" onClick={() => forgetWord(word)}>
                    Usuń
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {drafts.length > 0 && (
          <section className="drafts">
            <h2>Szkice</h2>
            <ul>
              {drafts.map((draft) => (
                <li key={draft.id}>
                  <button type="button" className="draft" onClick={() => setText(draft.text)}>
                    {draft.text.replace(/\s+/g, " ").slice(0, 84)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = drafts.filter((item) => item.id !== draft.id);
                      setDrafts(next);
                      saveDrafts(next);
                    }}
                  >
                    Usuń
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="site-actions">
          <button type="button" onClick={() => void goHome()}>
            Strona główna X
          </button>
          <button type="button" onClick={() => void openOutside()}>
            Otwórz w przeglądarce
          </button>
        </div>
      </section>

      <section className="stage">
        {timeline === "browser" && (
          <div className="stage-copy">
            <h2>Oś czasu jest w aplikacji</h2>
            <p>Uruchom Pulpit X jako program Windows. Po prawej otworzy się x.com/home, a logowanie zostanie w tej aplikacji.</p>
          </div>
        )}
        {timeline === "loading" && (
          <div className="stage-copy">
            <h2>Otwieram X</h2>
            <p>Za chwilę zobaczysz stronę główną. Zaloguj się raz — sesja zostaje na tym komputerze, w Pulpit X.</p>
          </div>
        )}
        {timeline === "error" && (
          <div className="stage-copy">
            <h2>X się nie otworzyło</h2>
            <p>{timelineError}</p>
            <button type="button" onClick={() => void goHome()}>
              Spróbuj ponownie
            </button>
          </div>
        )}
        {timeline === "ready" && <div className="stage-live" />}
      </section>
    </div>
  );
}
