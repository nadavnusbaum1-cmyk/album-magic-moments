// Cron safety net — process unprocessed photos in batches across all events.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = svc();
    const { data: pending } = await supabase
      .from("photos")
      .select("id, event_id, s3_key, storage_path, storage_provider, content_type, media_type")
      .eq("processed", false)
      .is("processing_error", null)
      .not("event_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!pending?.length) return json({ processed: 0 });

    const seenCollections = new Set<string>();
    let processed = 0;
    for (const photo of pending) {
      try {
        const col = collectionFor(photo.event_id);
        if (!seenCollections.has(col)) { await ensureCollection(col); seenCollections.add(col); }
        await processPhoto(supabase, photo);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        await supabase.from("photos").update({ processing_error: msg }).eq("id", photo.id);
      }
    }
    return json({ processed, batch: pending.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
