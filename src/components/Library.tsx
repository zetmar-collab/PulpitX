import { useRef, useState } from "react";
import type { Draft, Reminder, Snippet } from "../storage";

const dateFormat = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(time: number): string {
  return dateFormat.format(new Date(time));
}

function preview(text: string, max = 84): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Wartość dla <input type="datetime-local"> w czasie lokalnym. */
export function localInputValue(time: number): string {
  const d = new Date(time);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --- Szkice ---

export function DraftsPanel({
  drafts,
  onLoad,
  onDelete,
}: {
  drafts: Draft[];
  onLoad: (draft: Draft) => void;
  onDelete: (draft: Draft) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <details className="panel" open>
      <summary>Szkice ({drafts.length})</summary>
      <ul className="list">
        {drafts.map((draft) => (
          <li key={draft.id}>
            <button type="button" className="draft" onClick={() => onLoad(draft)}>
              <span>{preview(draft.text)}</span>
              <small>
                {formatDate(draft.updatedAt)}
                {draft.auto ? " · zapisany automatycznie" : ""}
              </small>
            </button>
            <button type="button" onClick={() => onDelete(draft)} aria-label={`Usuń szkic: ${preview(draft.text, 30)}`}>
              Usuń
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

// --- Szablony ---

export function SnippetsPanel({
  snippets,
  selection,
  onInsert,
  onAdd,
  onDelete,
}: {
  snippets: Snippet[];
  selection: string;
  onInsert: (snippet: Snippet) => void;
  onAdd: (text: string) => void;
  onDelete: (snippet: Snippet) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <details className="panel">
      <summary>Szablony i hashtagi ({snippets.length})</summary>
      <p className="quiet">Kliknij szablon, aby wstawić go w miejscu kursora.</p>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          onAdd(draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="np. #AI #nowości albo podpis"
          aria-label="Nowy szablon"
        />
        <button type="submit">Dodaj</button>
      </form>
      {selection.trim() && (
        <button type="button" className="ghost" onClick={() => onAdd(selection)}>
          Zapisz zaznaczenie jako szablon
        </button>
      )}
      {snippets.length > 0 && (
        <ul className="list">
          {snippets.map((snippet) => (
            <li key={snippet.id}>
              <button type="button" className="draft" onClick={() => onInsert(snippet)}>
                <span>{preview(snippet.text, 60)}</span>
              </button>
              <button type="button" onClick={() => onDelete(snippet)} aria-label={`Usuń szablon: ${preview(snippet.text, 30)}`}>
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

// --- Przypomnienia ---

export function RemindersPanel({
  reminders,
  hasText,
  onAdd,
  onLoad,
  onDelete,
}: {
  reminders: Reminder[];
  hasText: boolean;
  onAdd: (at: number) => void;
  onLoad: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
}) {
  const [when, setWhen] = useState(() => localInputValue(Date.now() + 60 * 60 * 1000));
  const sorted = [...reminders].sort((a, b) => Number(a.done) - Number(b.done) || a.at - b.at);
  const upcoming = reminders.filter((r) => !r.done).length;
  return (
    <details className="panel">
      <summary>Przypomnienia ({upcoming})</summary>
      <p className="quiet">Powiadomienie pojawi się o wybranej porze, jeśli Pulpit X będzie wtedy włączony.</p>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const at = new Date(when).getTime();
          if (Number.isFinite(at)) onAdd(at);
        }}
      >
        <input
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          aria-label="Kiedy przypomnieć"
        />
        <button type="submit" disabled={!hasText}>
          Przypomnij o tym poście
        </button>
      </form>
      {sorted.length > 0 && (
        <ul className="list">
          {sorted.map((reminder) => (
            <li key={reminder.id} className={reminder.done ? "done" : ""}>
              <button type="button" className="draft" onClick={() => onLoad(reminder)}>
                <span>{preview(reminder.text, 60)}</span>
                <small>
                  {formatDate(reminder.at)}
                  {reminder.done ? " · minęło" : ""}
                </small>
              </button>
              <button type="button" onClick={() => onDelete(reminder)} aria-label="Usuń przypomnienie">
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

// --- Własny słownik ---

export function PersonalPanel({ words, onForget }: { words: string[]; onForget: (word: string) => void }) {
  if (words.length === 0) return null;
  return (
    <details className="panel">
      <summary>Twój słownik ({words.length})</summary>
      <ul className="chips">
        {words.map((word) => (
          <li key={word}>
            <span>{word}</span>
            <button type="button" onClick={() => onForget(word)} aria-label={`Usuń słowo ${word}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

// --- Kopia zapasowa ---

export function BackupPanel({
  onExport,
  onImport,
}: {
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <details className="panel">
      <summary>Kopia zapasowa</summary>
      <p className="quiet">
        Szkice, słownik, szablony i przypomnienia w jednym pliku JSON. Wczytanie kopii niczego nie kasuje, tylko dopisuje brakujące rzeczy.
      </p>
      <div className="actions">
        <button type="button" onClick={onExport}>
          Zapisz kopię
        </button>
        <button type="button" onClick={() => input.current?.click()}>
          Wczytaj kopię
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImport(file);
          }}
        />
      </div>
    </details>
  );
}
