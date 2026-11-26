import { useRef } from "react";
import { DEFAULT_SIDEBAR, MIN_SIDEBAR } from "../desktop";

type Props = {
  width: number;
  max: number;
  onResize: (width: number) => void;
  onCommit: (width: number) => void;
};

/** Uchwyt do zmiany szerokości panelu edytora (mysz, klawiatura, dwuklik = domyślna). */
export function Splitter({ width, max, onResize, onCommit }: Props) {
  const drag = useRef<{ startX: number; startWidth: number; last: number } | null>(null);

  function step(delta: number) {
    const next = width + delta;
    onResize(next);
    onCommit(next);
  }

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Szerokość panelu edytora"
      aria-valuemin={MIN_SIDEBAR}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(width)}
      tabIndex={0}
      title="Przeciągnij, aby zmienić szerokość. Dwuklik przywraca domyślną."
      style={{ left: `${width - 6}px` }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width, last: width };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const next = drag.current.startWidth + event.clientX - drag.current.startX;
        drag.current.last = next;
        onResize(next);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        const last = drag.current.last;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onCommit(last);
      }}
      onDoubleClick={() => {
        onResize(DEFAULT_SIDEBAR);
        onCommit(DEFAULT_SIDEBAR);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-20);
        else if (event.key === "ArrowRight") step(20);
        else return;
        event.preventDefault();
      }}
    />
  );
}
