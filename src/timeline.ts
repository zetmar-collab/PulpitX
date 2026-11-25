import { isTauri } from "@tauri-apps/api/core";

export const SIDEBAR_PX = 440;
export const HOME_URL = "https://x.com/home";

const LABEL = "x-home";

type WebviewHandle = import("@tauri-apps/api/webview").Webview;

let current: Promise<WebviewHandle> | null = null;

export function runningOnDesktop(): boolean {
  return isTauri();
}

async function clientBounds() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
  const win = getCurrentWindow();
  const physical = await win.innerSize();
  const scale = await win.scaleFactor();
  const logical = physical.toLogical(scale);
  return {
    win,
    x: SIDEBAR_PX,
    y: 0,
    width: Math.max(280, Math.round(logical.width - SIDEBAR_PX)),
    height: Math.max(280, Math.round(logical.height)),
    LogicalPosition,
    LogicalSize,
  };
}

async function createTimeline(): Promise<WebviewHandle> {
  const { Webview } = await import("@tauri-apps/api/webview");
  const bounds = await clientBounds();
  const webview = new Webview(bounds.win, LABEL, {
    url: HOME_URL,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    focus: false,
    dragDropEnabled: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Widok X nie odpowiedział.")), 20000);
    webview.once("tauri://created", () => {
      window.clearTimeout(timer);
      resolve();
    });
    webview.once("tauri://error", (event) => {
      window.clearTimeout(timer);
      const payload = event.payload;
      const message = typeof payload === "string" ? payload : "Nie udało się otworzyć X.";
      reject(new Error(message));
    });
  });

  await bounds.win.onResized(async ({ payload }) => {
    const scale = await bounds.win.scaleFactor();
    const logical = payload.toLogical(scale);
    await webview.setPosition(new bounds.LogicalPosition(SIDEBAR_PX, 0));
    await webview.setSize(
      new bounds.LogicalSize(
        Math.max(280, Math.round(logical.width - SIDEBAR_PX)),
        Math.max(280, Math.round(logical.height)),
      ),
    );
  });

  return webview;
}

function track(promise: Promise<WebviewHandle>): Promise<WebviewHandle> {
  const tracked = promise.catch((error: unknown) => {
    if (current === tracked) current = null;
    throw error;
  });
  current = tracked;
  return tracked;
}

export async function openTimeline(): Promise<void> {
  if (!isTauri()) return;
  if (!current) track(createTimeline());
  await current;
}

export async function showHome(): Promise<void> {
  if (!isTauri()) return;
  const existing = current;
  current = null;
  if (existing) {
    try {
      const webview = await existing;
      await webview.close();
    } catch {
      // The previous view is already gone.
    }
  }
  await track(createTimeline());
}
