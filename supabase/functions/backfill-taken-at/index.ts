// Host-only: backfill `taken_at` from EXIF for an event's existing photos.
// Streams photos in batches, fetches the first ~256 KB of each image via S3 Range request,
// parses EXIF and updates the row. Safe to re-run.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { presignGet } from "../_shared/s3.ts";
// @ts-ignore - esm.sh
import exifr from "https://esm.sh/exifr@7.1.3";

const RANGE_BYTES = 256 * 1024; // 256 KB is enough for EXIF block in most JPEGs

async function readTakenAt(key: string): Promise<string | null> {
  try {
    const url = await presignGet(key, 300);
    const res = await fetch(url, { headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const data = await exifr.parse(buf, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
      translateValues: false,
    });
    const d: unknown = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d as string);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, batchSize, maxItems } = await req.json() as {
      eventId: string; batchSize?: number; maxItems?: number;
    };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    const limit = Math.min(Math.max(Number(maxItems) || 800, 1), 2000);
    const batch = Math.min(Math.max(Number(batchSize) || 20, 1), 40);

    // Only consider rows we haven't processed and that have an S3 key + are images.
    const { data: rows, error } = await supabase
      .from("photos")
      .select("id, s3_key, storage_path, content_type, media_type")
      .eq("event_id", eventId)
      .is("taken_at", null)
      .neq("media_type", "video")
      .limit(limit);
    if (error) throw error;

    const total = rows?.length || 0;
    let updated = 0;
    let scanned = 0;

    for (let i = 0; i < total; i += batch) {
      const slice = rows!.slice(i, i + batch);
      const results = await Promise.all(slice.map(async (p) => {
        const key = p.s3_key || p.storage_path;
        if (!key) return { id: p.id, takenAt: null as string | null };
        const takenAt = await readTakenAt(key);
        return { id: p.id, takenAt };
      }));
      scanned += slice.length;
      const updates = results.filter((r) => r.takenAt);
      // Batch updates one-by-one (small payload) — Postgres can handle it fast.
      await Promise.all(updates.map((u) =>
        supabase.from("photos").update({ taken_at: u.takenAt }).eq("id", u.id)
      ));
      updated += updates.length;
    }

    // Are there more rows still missing? Caller can re-invoke to continue.
    const { count: remaining } = await supabase
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .is("taken_at", null)
      .neq("media_type", "video");

    return json({ scanned, updated, remaining: remaining || 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
