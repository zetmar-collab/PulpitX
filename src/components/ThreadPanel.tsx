import { POST_LIMIT, postLength } from "../spell/text";
import { postsLabel } from "../thread";

type Props = {
  parts: string[];
  numbering: boolean;
  desktop: boolean;
  onNumbering: (value: boolean) => void;
  onCopy: (text: string, label: string) => void;
  onInsert: (text: string) => void;
};

export function ThreadPanel({ parts, numbering, desktop, onNumbering, onCopy, onInsert }: Props) {
  return (
    <section className="thread" aria-label="Wątek">
      <div className="thread-head">
        <h2>Wątek: {postsLabel(parts.length)}</h2>
        <label className="check">
          <input type="checkbox" checked={numbering} onChange={(event) => onNumbering(event.target.checked)} />
          Numeracja 1/n
        </label>
      </div>
      <p className="quiet">Linia z samym „---” wymusza podział w tym miejscu.</p>
      {parts.length === 0 ? (
        <p className="quiet">Napisz tekst, a podzielę go na posty.</p>
      ) : (
        <ol className="thread-parts">
          {parts.map((part, index) => {
            const length = postLength(part);
            return (
              <li key={`${index}:${part.slice(0, 24)}`}>
                <p className="part-text">{part}</p>
                <div className="part-row">
                  <span className={length > POST_LIMIT ? "count hot" : "count"}>
                    {length} / {POST_LIMIT}
                  </span>
                  <span>
                    <button type="button" onClick={() => onCopy(part, `Skopiowano post ${index + 1}.`)}>
                      Kopiuj
                    </button>
                    {desktop && (
                      <button type="button" onClick={() => onInsert(part)}>
                        Wstaw do X
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
