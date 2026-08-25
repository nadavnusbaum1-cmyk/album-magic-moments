// Google Photos Picker API proxy. The browser gets a short-lived OAuth token via
// Google Identity Services (photospicker.mediaitems.readonly scope) and passes it
// here; we proxy to Google server-side to avoid browser CORS and keep the token
// out of cross-origin requests. Actions:
//   create_session -> { id, pickerUri, pollInterval }
//   poll           -> { mediaItemsSet }
//   list           -> { items: [{ id, baseUrl, mimeType, filename }] }
//   download       -> raw image/video bytes (baseUrl + "=d"), streamed back
// Docs: https://developers.google.com/photos/picker/guides/get-started-picker
import { corsHeaders } from "../_shared/auth.ts";

const PICKER = "https://photospicker.googleapis.com/v1";

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Only allow downloading from Google's own photo hosts.
function allowedMediaHost(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h.endsWith(".googleusercontent.com") || h.endsWith(".googleapis.com") || h.endsWith(".google.com");
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { action, accessToken, sessionId, baseUrl } = await req.json() as {
      action?: string; accessToken?: string; sessionId?: string; baseUrl?: string;
    };
    if (!accessToken) return j({ error: "accessToken required" }, 401);
    const authH = { Authorization: `Bearer ${accessToken}` };

    if (action === "create_session") {
      const r = await fetch(`${PICKER}/sessions`, { method: "POST", headers: { ...authH, "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!r.ok) return j({ error: d?.error?.message || "create_session failed" }, r.status);
      const pollInterval = Number(String(d.pollingConfig?.pollInterval || "3s").replace(/[^\d.]/g, "")) || 3;
      return j({ id: d.id, pickerUri: d.pickerUri, mediaItemsSet: !!d.mediaItemsSet, pollInterval });
    }

    if (action === "poll") {
      if (!sessionId) return j({ error: "sessionId required" }, 400);
      const r = await fetch(`${PICKER}/sessions/${encodeURIComponent(sessionId)}`, { headers: authH });
      const d = await r.json();
      if (!r.ok) return j({ error: d?.error?.message || "poll failed" }, r.status);
      return j({ mediaItemsSet: !!d.mediaItemsSet });
    }

    if (action === "list") {
      if (!sessionId) return j({ error: "sessionId required" }, 400);
      const items: { id: string; baseUrl: string; mimeType: string; filename: string }[] = [];
      let pageToken = "";
      do {
        const url = new URL(`${PICKER}/mediaItems`);
        url.searchParams.set("sessionId", sessionId);
        url.searchParams.set("pageSize", "100");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const r = await fetch(url.toString(), { headers: authH });
        const d = await r.json();
        if (!r.ok) return j({ error: d?.error?.message || "list failed" }, r.status);
        for (const m of d.mediaItems || []) {
          const f = m.mediaFile || {};
          if (f.baseUrl) items.push({ id: m.id, baseUrl: f.baseUrl, mimeType: f.mimeType || "image/jpeg", filename: f.filename || `${m.id}.jpg` });
        }
        pageToken = d.nextPageToken || "";
      } while (pageToken && items.length < 2000);
      return j({ items });
    }

    if (action === "download") {
      if (!baseUrl || !allowedMediaHost(baseUrl)) return j({ error: "invalid baseUrl" }, 400);
      // "=d" downloads the full-resolution bytes.
      const r = await fetch(`${baseUrl}=d`, { headers: authH });
      if (!r.ok) return j({ error: `download failed ${r.status}` }, r.status);
      const ct = r.headers.get("content-type") || "application/octet-stream";
      return new Response(r.body, { status: 200, headers: { ...corsHeaders, "Content-Type": ct } });
    }

    return j({ error: "unknown action" }, 400);
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
