import { POST_LIMIT, postLength } from "./spell/text";

export type ThreadOptions = {
  numbering: boolean;
  limit?: number;
};

const SEPARATOR = /^[ \t]*-{3,}[ \t]*$/m;
const SENTENCE_END = /(?:[.!?…]["”»)]*\s*$|\n\s*$)/u;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Tnie bardzo długie „słowo” (np. ciąg bez spacji) na kawałki mieszczące się w limicie. */
function hardSplit(word: string, budget: number): string[] {
  const pieces: string[] = [];
  let piece = "";
  for (const { segment } of segmenter.segment(word)) {
    if (piece && postLength(piece + segment) > budget) {
      pieces.push(piece);
      piece = "";
    }
    piece += segment;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function packSegment(text: string, budget: number): string[] {
  const words = text.match(/\S+\s*/g) ?? [];
  const parts: string[] = [];
  let chunk: string[] = [];
  const size = (list: string[]) => postLength(list.join("").trim());
  const flush = (list: string[]) => {
    const part = list.join("").trim();
    if (part) parts.push(part);
  };

  for (const word of words) {
    if (size([word]) > budget) {
      flush(chunk);
      const pieces = hardSplit(word.trim(), budget);
      pieces.slice(0, -1).forEach((piece) => parts.push(piece));
      chunk = [pieces[pieces.length - 1] + word.slice(word.trimEnd().length)];
      continue;
    }
    if (size([...chunk, word]) <= budget) {
      chunk.push(word);
      continue;
    }
    // Wolimy ciąć po końcu zdania lub akapitu, jeśli jest w drugiej połowie fragmentu.
    let cut = -1;
    for (let i = chunk.length - 1; i >= Math.ceil(chunk.length / 2); i -= 1) {
      if (SENTENCE_END.test(chunk[i - 1] ?? "")) {
        cut = i;
        break;
      }
    }
    if (cut > 0 && size([...chunk.slice(cut), word]) <= budget) {
      flush(chunk.slice(0, cut));
      chunk = [...chunk.slice(cut), word];
    } else {
      flush(chunk);
      chunk = [word];
    }
  }
  flush(chunk);
  return parts;
}

/**
 * Dzieli tekst na posty wątku. Linia z samym „---” wymusza podział.
 * Przy numeracji każdy post dostaje dopisek „ 1/3”, a limit uwzględnia jego długość.
 */
export function splitThread(text: string, { numbering, limit = POST_LIMIT }: ThreadOptions): string[] {
  const reserve = numbering ? postLength(" 99/99") : 0;
  const budget = Math.max(20, limit - reserve);
  const segments = text.split(SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const parts = segments.flatMap((segment) => packSegment(segment, budget));
  if (!numbering || parts.length < 2) return parts;
  return parts.map((part, i) => `${part} ${i + 1}/${parts.length}`);
}

/** „1 post”, „3 posty”, „5 postów”, „22 posty”. */
export function postsLabel(count: number): string {
  if (count === 1) return "1 post";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} posty`;
  return `${count} postów`;
}
