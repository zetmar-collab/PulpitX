import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BackupPanel, DraftsPanel, PersonalPanel, RemindersPanel, SnippetsPanel, formatDate } from "./components/Library";
import { ProofPanel, type DictionaryState } from "./components/ProofPanel";
import { Splitter } from "./components/Splitter";
import { ThreadPanel } from "./components/ThreadPanel";
import {
  HOME_URL,
  MIN_STAGE,
  clampSidebar,
  exportBackup,
  goHome,
  insertIntoX,
  notify,
  openInBrowser,
  openTimeline,
  runningOnDesktop,
  setSidebar,
  type InsertStatus,
} from "./desktop";
import { checkSpelling, warmSpellcheck } from "./spell/client";
import { styleIssues, styleKey, type StyleIssue } from "./spell/style";
import { POST_LIMIT, applySuggestion, postLength, replaceWordAt, type Issue, type Lang } from "./spell/text";
import * as store from "./storage";
import type { Draft, Reminder, Snippet } from "./storage";
import { postsLabel, splitThread } from "./thread";
import "./App.css";

const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "pl", label: "Polski" },
  { id: "en", label: "English" },
  { id: "both", label: "Oba" },
];

const UNDO_MS = 10_000;
const REMINDER_TICK_MS = 15_000;
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const INSERT_MESSAGES: Record<InsertStatus, string> = {
  inserted: "Wstawiono w pole posta na X. Sprawdź tekst i opublikuj go sam.",
  opening: "Otwieram okno posta na X i wstawiam tekst…",
  missing: "Nie widzę pola posta. Zaloguj się na X i spróbuj ponownie.",
};

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

const wordKey = (word: string) => word.toLocaleLowerCase("pl");

export default function App() {
  const desktop = runningOnDesktop();

  const [text, setText] = useState(store.loadCurrent);
  const [lang, setLang] = useState<Lang>(store.loadLang);
  const [personal, setPersonal] = useState<string[]>(store.loadPersonal);
  const [drafts, setDrafts] = useState<Draft[]>(store.loadDrafts);
  const [snippets, setSnippets] = useState<Snippet[]>(store.loadSnippets);
  const [reminders, setReminders] = useState<Reminder[]>(store.loadReminders);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [skippedStyle, setSkippedStyle] = useState<string[]>([]);
  const [dictionary, setDictionary] = useState<DictionaryState>("loading");
  const [dictionaryError, setDictionaryError] = useState("");
  const [dictionaryAttempt, setDictionaryAttempt] = useState(0);

  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{ previous: string; label: string } | null>(null);
  const [threadMode, setThreadMode] = useState(false);
  const [numbering, setNumbering] = useState(true);
  const [selection, setSelection] = useState("");

  const [timeline, setTimeline] = useState<"loading" | "ready" | "error" | "browser">(
    desktop ? "loading" : "browser",
  );
  const [timelineError, setTimelineError] = useState("");
  const [sidebar, setSidebarWidth] = useState(store.loadSidebar);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  const textarea = useRef<HTMLTextAreaElement>(null);
  const sidebarLatest = useRef(sidebar);
  const sidebarFrame = useRef<number | null>(null);
  const remindersRef = useRef(reminders);
  const fired = useRef(new Set<string>());
  remindersRef.current = reminders;

  const known = useMemo(() => new Set(personal.map(wordKey)), [personal]);
  const visibleIssues = issues.filter((issue) => !ignored.includes(wordKey(issue.word)));
  const style = useMemo(
    () => styleIssues(text).filter((issue) => !skippedStyle.includes(styleKey(issue))),
    [text, skippedStyle],
  );
  const parts = useMemo(() => (threadMode ? splitThread(text, { numbering }) : []), [threadMode, text, numbering]);
  const length = postLength(text);
  const overLimit = length > POST_LIMIT;
  const effectiveSidebar = clampSidebar(sidebar, windowWidth);

  // --- zapis ---
  useEffect(() => store.saveCurrent(text), [text]);
  useEffect(() => store.saveLang(lang), [lang]);
  useEffect(() => store.savePersonal(personal), [personal]);
  useEffect(() => store.saveDrafts(drafts), [drafts]);
  useEffect(() => store.saveSnippets(snippets), [snippets]);
  useEffect(() => store.saveReminders(reminders), [reminders]);

  // --- słownik ---
  useEffect(() => {
    let alive = true;
    setDictionary("loading");
    warmSpellcheck()
      .then(() => {
        if (alive) setDictionary("ready");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setDictionary("error");
        setDictionaryError(errorText(error, "Słownik się nie załadował. Możesz pisać, ale bez podpowiedzi."));
      });
    return () => {
      alive = false;
    };
  }, [dictionaryAttempt]);

  useEffect(() => {
    if (dictionary !== "ready") return;
    let alive = true;
    const timer = window.setTimeout(() => {
      checkSpelling(text, lang, known)
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

  // --- widok X i szerokość panelu ---
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    openTimeline(sidebarLatest.current)
      .then(() => {
        if (alive) setTimeline("ready");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setTimeline("error");
        setTimelineError(errorText(error, "Nie udało się otworzyć X."));
      });
    return () => {
      alive = false;
    };
  }, [desktop]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // --- cofanie ---
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  // --- przypomnienia ---
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const due = remindersRef.current.filter((r) => !r.done && r.at <= now && !fired.current.has(r.id));
      if (due.length === 0) return;
      for (const reminder of due) {
        fired.current.add(reminder.id);
        const late = now - reminder.at > 5 * 60 * 1000;
        const body = reminder.text.replace(/\s+/g, " ").slice(0, 140);
        void notify(late ? "Przegapione przypomnienie o poście" : "Pora na post", body).catch(() => {});
      }
      setNotice(`Przypomnienie: pora na post (${formatDate(due[0].at)}). Znajdziesz go w „Przypomnieniach”.`);
      const ids = new Set(due.map((r) => r.id));
      setReminders((current) => current.map((r) => (ids.has(r.id) ? { ...r, done: true } : r)));
    };
    tick();
    const timer = window.setInterval(tick, REMINDER_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // --- akcje edytora ---

  /** Podmienia cały tekst, ale wcześniej chowa obecny jako szkic i pozwala cofnąć. */
  function replaceText(next: string, label: string) {
    if (next === text) return;
    if (text.trim()) {
      if (!drafts.some((draft) => draft.text === text)) {
        setDrafts(store.addDraft(drafts, text, true).drafts);
      }
      setUndo({ previous: text, label });
    }
    setText(next);
    setIssues([]);
  }

  function restore() {
    if (!undo) return;
    setText(undo.previous);
    setIssues([]);
    setUndo(null);
    setNotice("Przywrócono poprzedni tekst.");
  }

  async function copyText(value: string, ok = "Skopiowano. Wklej tekst w polu posta na X (Ctrl+V).") {
    if (!value.trim()) {
      setNotice("Najpierw napisz post.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice(ok);
    } catch {
      setNotice("Nie udało się skopiować. Zaznacz tekst i użyj Ctrl+C.");
    }
  }

  async function insert(value: string) {
    if (!value.trim()) {
      setNotice("Najpierw napisz post.");
      return;
    }
    if (timeline !== "ready") {
      setNotice("Widok X nie jest jeszcze otwarty.");
      return;
    }
    try {
      const status = await insertIntoX(value);
      setNotice(INSERT_MESSAGES[status] ?? INSERT_MESSAGES.inserted);
    } catch (error) {
      setNotice(errorText(error, "Nie udało się wstawić tekstu w X."));
    }
  }

  function keepDraft() {
    if (!text.trim()) {
      setNotice("Pusty szkic nie został zapisany.");
      return;
    }
    const { drafts: next, dropped } = store.addDraft(drafts, text);
    setDrafts(next);
    setNotice(
      dropped > 0
        ? `Szkic zapisany. Najstarszy szkic usunięto (limit ${store.MAX_DRAFTS}).`
        : "Szkic zapisany na tym komputerze.",
    );
  }

  function clearText() {
    replaceText("", "Wyczyszczono tekst.");
    setIgnored([]);
    setSkippedStyle([]);
    setNotice("");
  }

  function addWord(word: string) {
    const key = wordKey(word);
    if (known.has(key)) return;
    setPersonal([...personal, key]);
  }

  function suggest(issue: Issue, suggestion: string) {
    const result = applySuggestion(text, issues, issue, suggestion);
    if (!result) {
      setNotice("Tekst zmienił się od sprawdzenia. Sprawdzam go ponownie…");
      return;
    }
    setText(result.text);
    setIssues(result.issues);
  }

  function fixStyle(issue: StyleIssue) {
    const replacement = issue.replacement ?? issue.original;
    const next = replaceWordAt(text, issue.index, issue.original, replacement);
    if (next === null) {
      setNotice("Tekst zmienił się. Spróbuj jeszcze raz.");
      return;
    }
    const delta = replacement.length - issue.original.length;
    setText(next);
    setIssues((current) =>
      current.map((item) => (item.index > issue.index ? { ...item, index: item.index + delta } : item)),
    );
  }

  function insertSnippet(snippet: Snippet) {
    const el = textarea.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const tail = after && !/^\s/.test(after) ? " " : "";
    const head = before + lead + snippet.text;
    setText(head + tail + after);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(head.length, head.length);
    });
  }

  function addSnippet(value: string) {
    const clean = value.trim();
    if (!clean) return;
    if (snippets.some((snippet) => snippet.text === clean)) {
      setNotice("Taki szablon już jest.");
      return;
    }
    setSnippets([{ id: store.newId(), text: clean }, ...snippets].slice(0, store.MAX_SNIPPETS));
    setNotice("Szablon zapisany.");
  }

  function addReminder(at: number) {
    if (!text.trim()) {
      setNotice("Najpierw napisz post.");
      return;
    }
    if (at <= Date.now()) {
      setNotice("Wybierz godzinę w przyszłości.");
      return;
    }
    setReminders([...reminders, { id: store.newId(), at, text, done: false }]);
    setNotice(`Przypomnę ${formatDate(at)}. Pulpit X musi być wtedy włączony.`);
  }

  // --- kopia zapasowa ---

  function snapshot(): store.BackupState {
    return { current: text, lang, drafts, personal, snippets, reminders };
  }

  async function exportData() {
    const json = JSON.stringify(store.buildBackup(snapshot()), null, 2);
    const name = `pulpitx-kopia-${store.fileStamp()}.json`;
    if (!desktop) {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`Pobrano ${name}.`);
      return;
    }
    try {
      const path = await exportBackup(json, store.fileStamp());
      setNotice(`Kopia zapisana: ${path}`);
    } catch (error) {
      setNotice(errorText(error, "Nie udało się zapisać kopii."));
    }
  }

  async function importData(file: File) {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Plik jest za duży.");
      const theirs = store.parseBackup(await file.text());
      const mine = snapshot();
      const merged = store.mergeBackup(mine, theirs);
      setText(merged.current);
      setDrafts(merged.drafts);
      setPersonal(merged.personal);
      setSnippets(merged.snippets);
      setReminders(merged.reminders);
      setNotice(
        `Wczytano kopię: szkiców +${Math.max(0, merged.drafts.length - mine.drafts.length)}, ` +
          `słów +${merged.personal.length - mine.personal.length}, ` +
          `szablonów +${merged.snippets.length - mine.snippets.length}, ` +
          `przypomnień +${merged.reminders.length - mine.reminders.length}.`,
      );
    } catch (error) {
      setNotice(errorText(error, "Nie udało się wczytać kopii."));
    }
  }

  // --- widok X ---

  async function home() {
    if (!desktop) {
      window.open(HOME_URL, "_blank", "noopener");
      return;
    }
    setTimeline("loading");
    setTimelineError("");
    try {
      await goHome();
      setTimeline("ready");
    } catch (error) {
      setTimeline("error");
      setTimelineError(errorText(error, "Nie udało się wrócić na stronę główną."));
    }
  }

  async function outside() {
    try {
      await openInBrowser();
    } catch (error) {
      setNotice(errorText(error, "Nie udało się otworzyć przeglądarki."));
    }
  }

  function resizeSidebar(width: number) {
    const next = clampSidebar(width, window.innerWidth);
    sidebarLatest.current = next;
    setSidebarWidth(next);
    if (!desktop || sidebarFrame.current !== null) return;
    sidebarFrame.current = requestAnimationFrame(() => {
      sidebarFrame.current = null;
      void setSidebar(sidebarLatest.current).catch(() => {});
    });
  }

  function commitSidebar(width: number) {
    const next = clampSidebar(width, window.innerWidth);
    sidebarLatest.current = next;
    setSidebarWidth(next);
    store.saveSidebar(next);
    if (desktop) void setSidebar(next).catch(() => {});
  }

  const appStyle = { "--sidebar": `${effectiveSidebar}px` } as CSSProperties;

  return (
    <div className="app" style={appStyle}>
      <section className="desk">
        <header className="mast">
          <p className="mark">Pulpit X</p>
          <h1>Post z korektą</h1>
          <p className="lede">
            Piszesz tutaj. Pisownia i styl sprawdzają się lokalnie. Gotowy tekst wstawiasz do X albo kopiujesz, a publikujesz sam.
          </p>
        </header>

        <div className="toolbar">
          <div className="lang" role="group" aria-label="Język słownika">
            {LANGUAGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === lang ? "on" : ""}
                aria-pressed={item.id === lang}
                onClick={() => setLang(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="lang" role="group" aria-label="Tryb">
            <button type="button" className={!threadMode ? "on" : ""} aria-pressed={!threadMode} onClick={() => setThreadMode(false)}>
              Post
            </button>
            <button type="button" className={threadMode ? "on" : ""} aria-pressed={threadMode} onClick={() => setThreadMode(true)}>
              Wątek
            </button>
          </div>
        </div>

        <label className="paper">
          <span className="sr">Treść posta</span>
          <textarea
            ref={textarea}
            value={text}
            lang={lang === "en" ? "en" : "pl"}
            spellCheck
            placeholder="O czym chcesz napisać?"
            onChange={(event) => {
              setText(event.target.value);
              setNotice("");
            }}
            onSelect={(event) => {
              const el = event.currentTarget;
              setSelection(el.value.slice(el.selectionStart, el.selectionEnd));
            }}
            onKeyDown={(event) => {
              const mod = event.ctrlKey || event.metaKey;
              if (mod && event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) void insert(threadMode ? (parts[0] ?? "") : text);
                else void copyText(threadMode ? (parts[0] ?? "") : text);
              } else if (mod && (event.key === "s" || event.key === "S")) {
                event.preventDefault();
                keepDraft();
              }
            }}
          />
        </label>

        <div className="meter">
          <p className={overLimit && !threadMode ? "count hot" : "count"}>
            {length} / {POST_LIMIT}
            {threadMode && parts.length > 1 ? ` · wątek: ${postsLabel(parts.length)}` : ""}
          </p>
          <p className="hint">
            {overLimit && !threadMode
              ? "Ponad 280 znaków. Przełącz na „Wątek”, żeby podzielić tekst, albo publikuj z konta Premium."
              : "Licznik liczy jak X: link to 23 znaki, emoji 2."}
          </p>
        </div>

        {!threadMode && (
          <div className="actions">
            <button type="button" className="primary" onClick={() => void copyText(text)}>
              Kopiuj post
            </button>
            {desktop && (
              <button type="button" className="primary soft" onClick={() => void insert(text)} disabled={timeline !== "ready"}>
                Wstaw do X
              </button>
            )}
            <button type="button" onClick={keepDraft}>
              Zachowaj szkic
            </button>
            <button type="button" onClick={clearText}>
              Wyczyść
            </button>
          </div>
        )}
        {threadMode && (
          <div className="actions">
            <button type="button" onClick={keepDraft}>
              Zachowaj szkic
            </button>
            <button type="button" onClick={clearText}>
              Wyczyść
            </button>
          </div>
        )}

        {undo && (
          <div className="undo" role="status">
            <span>{undo.label} Poprzedni tekst jest też w szkicach.</span>
            <button type="button" onClick={restore}>
              Cofnij
            </button>
          </div>
        )}
        <p className="notice" role="status">
          {notice || (desktop ? "Ctrl+Enter kopiuje, Ctrl+Shift+Enter wstawia do X, Ctrl+S zapisuje szkic." : "Ctrl+Enter kopiuje post.")}
        </p>

        {threadMode && (
          <ThreadPanel
            parts={parts}
            numbering={numbering}
            desktop={desktop && timeline === "ready"}
            onNumbering={setNumbering}
            onCopy={(value, label) => void copyText(value, label)}
            onInsert={(value) => void insert(value)}
          />
        )}

        <ProofPanel
          dictionary={dictionary}
          dictionaryError={dictionaryError}
          hasText={Boolean(text.trim())}
          issues={visibleIssues}
          style={style}
          onRetry={() => setDictionaryAttempt((n) => n + 1)}
          onIgnore={(issue) => setIgnored((current) => [...current, wordKey(issue.word)])}
          onAdd={(issue) => addWord(issue.word)}
          onSuggest={suggest}
          onStyleFix={fixStyle}
          onStyleSkip={(issue) => setSkippedStyle((current) => [...current, styleKey(issue)])}
        />

        <DraftsPanel
          drafts={drafts}
          onLoad={(draft) => replaceText(draft.text, "Wczytano szkic.")}
          onDelete={(draft) => setDrafts(drafts.filter((item) => item.id !== draft.id))}
        />
        <SnippetsPanel
          snippets={snippets}
          selection={selection}
          onInsert={insertSnippet}
          onAdd={addSnippet}
          onDelete={(snippet) => setSnippets(snippets.filter((item) => item.id !== snippet.id))}
        />
        <RemindersPanel
          reminders={reminders}
          hasText={Boolean(text.trim())}
          onAdd={addReminder}
          onLoad={(reminder) => replaceText(reminder.text, "Wczytano post z przypomnienia.")}
          onDelete={(reminder) => setReminders(reminders.filter((item) => item.id !== reminder.id))}
        />
        <PersonalPanel words={personal} onForget={(word) => setPersonal(personal.filter((item) => item !== word))} />
        <BackupPanel onExport={() => void exportData()} onImport={(file) => void importData(file)} />

        <div className="site-actions">
          <button type="button" onClick={() => void home()} disabled={timeline === "loading"}>
            Strona główna X
          </button>
          <button type="button" onClick={() => void outside()}>
            Otwórz w przeglądarce
          </button>
        </div>
      </section>

      <Splitter
        width={effectiveSidebar}
        max={Math.max(effectiveSidebar, windowWidth - MIN_STAGE)}
        onResize={resizeSidebar}
        onCommit={commitSidebar}
      />

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
            <p>Za chwilę zobaczysz stronę główną. Zaloguj się raz. Sesja zostaje na tym komputerze, w Pulpit X.</p>
          </div>
        )}
        {timeline === "error" && (
          <div className="stage-copy">
            <h2>X się nie otworzyło</h2>
            <p>{timelineError}</p>
            <button type="button" onClick={() => void home()}>
              Spróbuj ponownie
            </button>
          </div>
        )}
        {timeline === "ready" && <div className="stage-live" />}
      </section>
    </div>
  );
}
