// Google Photos import via the Picker API (the only sanctioned path since Google
// retired the Library API in 2025). The browser gets a short-lived OAuth token
// through Google Identity Services, the user picks photos in Google's own picker,
// and we pull the selected items through our gphotos proxy — returning File[]
// that flow into the normal upload pipeline (renditions, HEIC, face matching).
//
// Requires VITE_GOOGLE_CLIENT_ID (a Google OAuth Web client) and the
// photospicker.mediaitems.readonly scope. Inert until the client id is set.
import { authedFetch } from "@/lib/auth";

const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
const GIS_SRC = "https://accounts.google.com/gsi/client";

export const googlePhotosEnabled = () => !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

// deno-lint-ignore no-explicit-any
declare global { interface Window { google?: any } }

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GIS_SRC; s.async = true; s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

async function getAccessToken(): Promise<string> {
  await loadGis();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  return new Promise<string>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp?.access_token) resolve(resp.access_token);
        else reject(new Error(resp?.error || "Google authorization was cancelled"));
      },
    });
    client.requestAccessToken();
  });
}

async function proxy<T>(body: Record<string, unknown>): Promise<T> {
  const r = await authedFetch("gphotos", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Google Photos request failed");
  return j as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface GPhotosProgress { phase: "auth" | "picking" | "downloading"; done?: number; total?: number }

// Runs the full flow. Opens the Google picker (must be called from a user click),
// waits for the selection, then downloads the chosen items as File[].
export async function importFromGooglePhotos(onProgress?: (p: GPhotosProgress) => void): Promise<File[]> {
  onProgress?.({ phase: "auth" });
  const accessToken = await getAccessToken();

  const session = await proxy<{ id: string; pickerUri: string; pollInterval: number }>({ action: "create_session", accessToken });
  onProgress?.({ phase: "picking" });
  const win = window.open(session.pickerUri, "gphotos_picker", "width=480,height=760");

  // Poll until the user finishes selecting (or a timeout).
  const started = Date.now();
  const intervalMs = Math.max(2, session.pollInterval || 3) * 1000;
  let picked = false;
  while (Date.now() - started < 5 * 60 * 1000) {
    await sleep(intervalMs);
    const { mediaItemsSet } = await proxy<{ mediaItemsSet: boolean }>({ action: "poll", accessToken, sessionId: session.id });
    if (mediaItemsSet) { picked = true; break; }
    if (win && win.closed) {
      // One more check in case they finished right before closing.
      const again = await proxy<{ mediaItemsSet: boolean }>({ action: "poll", accessToken, sessionId: session.id });
      if (again.mediaItemsSet) { picked = true; }
      break;
    }
  }
  try { win?.close(); } catch { /* ignore */ }
  if (!picked) return [];

  const { items } = await proxy<{ items: { id: string; baseUrl: string; mimeType: string; filename: string }[] }>({ action: "list", accessToken, sessionId: session.id });
  const files: File[] = [];
  let done = 0;
  onProgress?.({ phase: "downloading", done, total: items.length });
  // Sequential download keeps memory + the proxy load sane on mobile.
  for (const it of items) {
    try {
      const r = await authedFetch("gphotos", { method: "POST", body: JSON.stringify({ action: "download", accessToken, baseUrl: it.baseUrl }) });
      if (r.ok) {
        const blob = await r.blob();
        files.push(new File([blob], it.filename, { type: it.mimeType || blob.type || "image/jpeg" }));
      }
    } catch { /* skip a failed item */ }
    done++;
    onProgress?.({ phase: "downloading", done, total: items.length });
  }
  return files;
}
