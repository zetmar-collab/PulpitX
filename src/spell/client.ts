import type { Issue, Lang } from "./text";

type Ready = { type: "ready" };
type Issues = { type: "issues"; id: number; issues: Issue[] };
type Failed = { type: "error"; id?: number; message: string };
type Outgoing = Ready | Issues | Failed;

type Job = {
  id: number;
  text: string;
  lang: Lang;
  personal: string[];
  sent: boolean;
  resolve: (issues: Issue[]) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let ready = false;
let failed = false;
let sequence = 0;
const queue: Job[] = [];
const readyWaiters: Array<() => void> = [];

function spawn(): Worker {
  if (worker) return worker;
  const next = new Worker(new URL("./spell.worker.ts", import.meta.url), { type: "module" });
  next.onmessage = (event: MessageEvent<Outgoing>) => {
    const message = event.data;
    if (message.type === "ready") {
      ready = true;
      for (const waiter of readyWaiters.splice(0)) waiter();
      flush();
      return;
    }
    if (message.type === "error") {
      if (message.id != null) {
        const index = queue.findIndex((job) => job.id === message.id);
        if (index !== -1) {
          const [job] = queue.splice(index, 1);
          job.reject(new Error(message.message));
        }
        return;
      }
      failed = true;
      const error = new Error(message.message);
      for (const job of queue.splice(0)) job.reject(error);
      for (const waiter of readyWaiters.splice(0)) waiter();
      return;
    }
    const index = queue.findIndex((job) => job.id === message.id);
    if (index === -1) return;
    const [job] = queue.splice(index, 1);
    job.resolve(message.issues);
  };
  next.onerror = () => {
    failed = true;
    const error = new Error("Słownik nie wstał.");
    for (const job of queue.splice(0)) job.reject(error);
    for (const waiter of readyWaiters.splice(0)) waiter();
  };
  next.postMessage({ type: "init" });
  worker = next;
  return next;
}

function flush() {
  if (!ready || !worker) return;
  for (const job of queue) {
    if (job.sent) continue;
    job.sent = true;
    worker.postMessage({
      type: "check",
      id: job.id,
      text: job.text,
      lang: job.lang,
      personal: job.personal,
    });
  }
}

export function warmSpellcheck(): Promise<void> {
  spawn();
  if (ready) return Promise.resolve();
  if (failed) return Promise.reject(new Error("Słownik nie wstał."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Słownik ładuje się zbyt długo.")), 30000);
    readyWaiters.push(() => {
      clearTimeout(timer);
      if (failed) reject(new Error("Słownik nie wstał."));
      else resolve();
    });
  });
}

export function checkSpelling(text: string, lang: Lang, personal: string[]): Promise<Issue[]> {
  spawn();
  sequence += 1;
  const id = sequence;
  return new Promise((resolve, reject) => {
    queue.push({ id, text, lang, personal, sent: false, resolve, reject });
    flush();
  });
}
