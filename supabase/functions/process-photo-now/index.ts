// Sync per-photo processing — host-only (admin "process now" / re-index).
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoId, force } = await req.json() as { photoId?: string; force?: boolean };
    if (!photoId) return json({ error: "photoId required" }, 400);

    const supabase = svc();
    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, event_id, s3_key, storage_path, storage_provider, upload_status, processing_status, content_type, media_type")
      .eq("id", photoId)
      .single();
    if (error || !photo) return json({ error: "Photo not found" }, 404);
    if (!photo.event_id) return json({ error: "Photo missing event" }, 400);

    const auth = await requireHost(req, photo.event_id);
    if (auth.error) return json({ error: auth.error }, auth.status);

    if (photo.upload_status !== "uploaded") return json({ error: "Photo not uploaded yet", state: photo.upload_status }, 409);
    if (photo.processing_status === "ready" && !force) return json({ already: true });

    // Claim (or force re-claim) to avoid racing the cron.
    const { data: claimed } = await supabase
      .from("photos").update({ processing_status: "processing" })
      .eq("id", photo.id).in("processing_status", force ? ["queued", "ready", "failed"] : ["queued", "failed"])
      .select("id").maybeSingle();
    if (!claimed) return json({ already: true });

    await ensureCollection(collectionFor(photo.event_id));
    try {
      const result = await processPhoto(supabase, photo);
      return json({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown";
      await supabase.from("photos").update({ processing_status: "failed", processing_error: msg }).eq("id", photo.id);
      return json({ error: msg }, 500);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
