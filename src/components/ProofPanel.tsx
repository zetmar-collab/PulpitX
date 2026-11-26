import type { Issue } from "../spell/text";
import type { StyleIssue } from "../spell/style";

export type DictionaryState = "loading" | "ready" | "error";

type Props = {
  dictionary: DictionaryState;
  dictionaryError: string;
  hasText: boolean;
  issues: Issue[];
  style: StyleIssue[];
  onRetry: () => void;
  onIgnore: (issue: Issue) => void;
  onAdd: (issue: Issue) => void;
  onSuggest: (issue: Issue, suggestion: string) => void;
  onStyleFix: (issue: StyleIssue) => void;
  onStyleSkip: (issue: StyleIssue) => void;
};

export function spellCount(count: number): string {
  if (count === 1) return "1 słowo do sprawdzenia.";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} słowa do sprawdzenia.`;
  }
  return `${count} słów do sprawdzenia.`;
}

function context(issue: StyleIssue): string {
  const shown = issue.original.replace(/ /g, "␣").replace(/\t/g, "⇥");
  return shown || "␣";
}

export function ProofPanel(props: Props) {
  const { dictionary, issues, style, hasText } = props;
  const status =
    dictionary === "loading"
      ? "Wczytuję słowniki polski i angielski…"
      : dictionary === "error"
        ? props.dictionaryError || "Słownik się nie załadował. Możesz pisać, ale bez podpowiedzi."
        : issues.length === 0
          ? hasText
            ? "Pisownia wygląda dobrze."
            : "Słownik gotowy."
          : spellCount(issues.length);

  return (
    <section className="proof" aria-live="polite">
      <h2>Pisownia</h2>
      <p className={dictionary === "error" ? "status bad" : "status"}>{status}</p>
      {dictionary === "error" && (
        <button type="button" className="ghost" onClick={props.onRetry}>
          Wczytaj słownik ponownie
        </button>
      )}
      {issues.length > 0 && (
        <ul className="issues">
          {issues.map((issue) => (
            <li key={`${issue.index}:${issue.word}`}>
              <div className="word-row">
                <strong>{issue.word}</strong>
                <span>
                  <button type="button" onClick={() => props.onIgnore(issue)}>
                    Ignoruj
                  </button>
                  <button type="button" onClick={() => props.onAdd(issue)}>
                    Dodaj
                  </button>
                </span>
              </div>
              {issue.suggestions.length > 0 ? (
                <div className="suggestions">
                  {issue.suggestions.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => props.onSuggest(issue, suggestion)}>
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

      {style.length > 0 && (
        <>
          <h3>Styl i interpunkcja</h3>
          <ul className="issues">
            {style.map((issue) => (
              <li key={`${issue.index}:${issue.message}`}>
                <div className="word-row">
                  <span className="style-msg">
                    {issue.message} <code>{context(issue)}</code>
                  </span>
                  <span>
                    {issue.replacement !== undefined && (
                      <button type="button" onClick={() => props.onStyleFix(issue)}>
                        Popraw
                      </button>
                    )}
                    <button type="button" onClick={() => props.onStyleSkip(issue)}>
                      Pomiń
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
