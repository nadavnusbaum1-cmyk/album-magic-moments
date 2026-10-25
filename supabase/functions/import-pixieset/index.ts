// Pixieset "overlay" import. Pixieset sits behind Cloudflare, which blocks
// server-side reads of a gallery, so the gallery is enumerated in the
// photographer's OWN browser (a bookmarklet on the gallery page, where they're
// logged in and past Cloudflare). The bookmarklet POSTs a manifest of photos here
// with a short-lived signed token. We create rows that REFERENCE Pixieset's CDN
// (storage_provider="pixieset", source_url=base) — nothing is re-hosted; the
// processing cron later pulls each image from the (open) CDN to index faces and
// cache a small thumbnail. Each Pixieset set becomes a folder (source_label).
//
// Actions:
//   token    (owner JWT)   -> a signed token the bookmarklet carries
//   manifest (token)       -> create queued rows from the posted photo list
//   status   (owner JWT)   -> { total, processed, pending } for the progress bar
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";
import { getAccount } from "../_shared/plan.ts";

const INLINE_BATCH = 10;
const INLINE_TIME_BUDGET_MS = 25_000;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2h

function tokenSecret(): string {
  return Deno.env.get("IMPORT_TOKEN_SECRET") || Deno.env.get("CRON_SECRET") || "";
}
async function hmacHex(msg: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeToken(eventId: string): Promise<string> {
  const body = `${eventId}.${Date.now() + TOKEN_TTL_MS}`;
  return `${body}.${await hmacHex(body, tokenSecret())}`;
}
async function verifyToken(token: string): Promise<string | null> {
  const parts = (token || "").split("."); // eventId is a UUID (no dots), exp digits, sig hex
  if (parts.length !== 3) return null;
  const [eventId, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const good = await hmacHex(`${eventId}.${exp}`, tokenSecret());
  if (good.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? eventId : null;
}

// deno-lint-ignore no-explicit-any
async function countPixieset(supabase: any, eventId: string, extra?: (q: any) => any) {
  let q = supabase.from("photos").select("id", { count: "exact", head: true })
    .eq("event_id", eventId).eq("storage_provider", "pixieset").is("deleted_at", null);
  if (extra) q = extra(q);
  const { count } = await q;
  return count || 0;
}

type ManifestPhoto = { id: string; base: string; name?: string; setName?: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const bodyIn = await req.json() as {
      action?: string; eventId?: string; token?: string; photos?: ManifestPhoto[];
    };
    const action = bodyIn.action || "manifest";

    // ---- Generate a bookmarklet token (owner only) ----
    if (action === "token") {
      if (!bodyIn.eventId) return json({ error: "eventId required" }, 400);
      const auth = await requireHost(req, bodyIn.eventId);
      if (auth.error) return json({ error: auth.error }, auth.status);
      return json({ token: await makeToken(bodyIn.eventId) });
    }

    // ---- Progress poll (owner only) ----
    if (action === "status") {
      if (!bodyIn.eventId) return json({ error: "eventId required" }, 400);
      const auth = await requireHost(req, bodyIn.eventId);
      if (auth.error) return json({ error: auth.error }, auth.status);
      const supabase = svc();
      const total = await countPixieset(supabase, bodyIn.eventId);
      const pending = await countPixieset(supabase, bodyIn.eventId, (q) => q.in("processing_status", ["queued", "processing"]));
      return json({ total, processed: total - pending, pending });
    }

    // ---- Manifest from the bookmarklet (token-authorized) ----
    if (action === "manifest") {
      const eventId = await verifyToken(bodyIn.token || "");
      if (!eventId) return json({ error: "Invalid or expired import token" }, 401);
      const photos = (bodyIn.photos || []).filter((p) => p && p.id && p.base);
      if (!photos.length) return json({ error: "No photos in manifest" }, 400);

      const supabase = svc();

      // Dedupe against already-imported photos (idempotent re-runs).
      const clientIds = photos.map((p) => `pixieset:${p.id}`);
      const existing = new Set<string>();
      for (let i = 0; i < clientIds.length; i += 500) {
        const { data } = await supabase.from("photos").select("client_upload_id")
          .eq("event_id", eventId).in("client_upload_id", clientIds.slice(i, i + 500));
        for (const r of data || []) existing.add(r.client_upload_id);
      }
      let toImport = photos.filter((p) => !existing.has(`pixieset:${p.id}`));

      // Respect the event owner's per-event photo quota.
      const { data: ev } = await supabase.from("events").select("owner_id, album_tabs").eq("id", eventId).maybeSingle();
      let capped = false;
      if (ev?.owner_id) {
        const account = await getAccount(ev.owner_id);
        if (account.photo_limit != null) {
          const { count } = await supabase.from("photos").select("id", { count: "exact", head: true })
            .eq("event_id", eventId).is("deleted_at", null);
          const remaining = Math.max(0, account.photo_limit - (count || 0));
          if (toImport.length > remaining) { toImport = toImport.slice(0, remaining); capped = true; }
        }
      }

      const now = new Date().toISOString();
      const rows = toImport.map((p) => ({
        id: crypto.randomUUID(),
        event_id: eventId,
        storage_path: `pixieset/${p.id}.jpg`, // synthetic ref (ends .jpg → processable)
        storage_provider: "pixieset",
        source_url: p.base,
        s3_key: null,
        source: "pixieset_import",
        source_label: (p.setName || "").toString().trim().slice(0, 60) || null,
        upload_status: "uploaded",
        upload_confirmed_at: now,
        processing_status: "queued",
        moderation_status: "approved",
        media_type: "image",
        content_type: "image/jpeg",
        mime_type: "image/jpeg",
        client_upload_id: `pixieset:${p.id}`,
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("photos").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }

      // More than one Pixieset set → show folder tabs on the album.
      const setNames = new Set(photos.map((p) => (p.setName || "").trim()).filter(Boolean));
      if (setNames.size > 1 && ev && !ev.album_tabs) {
        await supabase.from("events").update({ album_tabs: true }).eq("id", eventId);
      }

      // Process a first batch inline so faces start appearing; the cron drains the rest.
      const { data: firstBatch } = await supabase.from("photos")
        .select("id, event_id, s3_key, s3_key_medium, s3_key_thumbnail, storage_path, storage_provider, source_url, content_type, media_type, source, moderation_checked")
        .eq("event_id", eventId).eq("storage_provider", "pixieset").eq("processing_status", "queued")
        .limit(INLINE_BATCH);
      let processed = 0;
      if (firstBatch?.length) {
        await ensureCollection(collectionFor(eventId));
        const start = Date.now();
        for (const p of firstBatch) {
          if (Date.now() - start > INLINE_TIME_BUDGET_MS) break;
          const { data: claimed } = await supabase.from("photos")
            .update({ processing_status: "processing" })
            .eq("id", p.id).eq("processing_status", "queued").select("id").maybeSingle();
          if (!claimed) continue;
          try { await processPhoto(supabase, p); processed++; }
          catch (e) {
            await supabase.from("photos").update({
              processing_status: "queued", processing_error: e instanceof Error ? e.message : "Unknown",
            }).eq("id", p.id);
          }
        }
      }

      const total = await countPixieset(supabase, eventId);
      return json({ created: rows.length, alreadyImported: photos.length - toImport.length, capped, processedInline: processed, total });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
