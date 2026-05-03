// Sync per-photo processing — host-only.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { ensureCollection, collectionFor } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoId } = await req.json() as { photoId?: string };
    if (!photoId) return json({ error: "photoId required" }, 400);

    const supabase = svc();
    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, event_id, s3_key, storage_path, storage_provider, processed, content_type, media_type")
      .eq("id", photoId)
      .single();
    if (error || !photo) return json({ error: "Photo not found" }, 404);
    if (!photo.event_id) return json({ error: "Photo missing event" }, 400);

    const auth = await requireHost(req, photo.event_id);
    if (auth.error) return json({ error: auth.error }, auth.status);

    if (photo.processed) return json({ already: true });

    await ensureCollection(collectionFor(photo.event_id));
    const result = await processPhoto(supabase, photo);
    return json({ ok: true, ...result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
