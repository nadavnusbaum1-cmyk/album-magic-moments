// Cron safety net — process confirmed-but-unprocessed photos across all events.
// Claims each row (queued → processing) so concurrent runs never collide, and
// retries transient failures up to MAX_ATTEMPTS instead of excluding them forever.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Gate: this endpoint runs with service-role privileges, so require the cron
  // secret when one is configured (prevents anonymous Rekognition-spend triggers).
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    const supabase = svc();
    const { data: pending } = await supabase
      .from("photos")
      .select("id, event_id, s3_key, s3_key_medium, storage_path, storage_provider, content_type, media_type, processing_attempts")
      .eq("upload_status", "uploaded")
      .eq("processing_status", "queued")
      .lt("processing_attempts", MAX_ATTEMPTS)
      .not("event_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!pending?.length) return json({ processed: 0 });

    const seenCollections = new Set<string>();
    let processed = 0;
    for (const photo of pending) {
      // Claim the row so a concurrent invocation can't grab it too.
      const { data: claimed } = await supabase
        .from("photos").update({ processing_status: "processing" })
        .eq("id", photo.id).eq("processing_status", "queued")
        .select("id").maybeSingle();
      if (!claimed) continue;

      try {
        const col = collectionFor(photo.event_id);
        if (!seenCollections.has(col)) { await ensureCollection(col); seenCollections.add(col); }
        await processPhoto(supabase, photo);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        const attempts = (photo.processing_attempts || 0) + 1;
        await supabase.from("photos").update({
          processing_status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          processing_attempts: attempts,
          processing_error: msg,
        }).eq("id", photo.id);
      }
    }
    return json({ processed, batch: pending.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
