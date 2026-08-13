// Host-only: delete photos within an event. Soft-marks first (so they vanish
// from galleries immediately), then hard-cleans S3 + Rekognition + DB via the
// shared cleanup routine. Anything whose S3 delete fails stays `deleting` and is
// retried by the cleanup-deleted cron — never leaving an orphaned object.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { hardDeletePhotos, type CleanupPhoto } from "../_shared/cleanupPhotos.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoIds } = await req.json() as { photoIds?: string[] };
    if (!photoIds?.length) return json({ error: "photoIds required" }, 400);

    const supabase = svc();
    const { data: photos } = await supabase
      .from("photos")
      .select("id, event_id, storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium")
      .in("id", photoIds);
    if (!photos?.length) return json({ deleted: 0 });

    const eventIds = [...new Set(photos.map((p) => p.event_id).filter(Boolean) as string[])];
    for (const eid of eventIds) {
      const auth = await requireHost(req, eid);
      if (auth.error) return json({ error: auth.error }, auth.status);
    }

    // Soft-mark so the UI reflects deletion instantly even if hard-cleanup lags.
    await supabase.from("photos").update({
      upload_status: "deleting", visibility: "hidden", deleted_at: new Date().toISOString(),
    }).in("id", photos.map((p) => p.id));

    const result = await hardDeletePhotos(supabase, photos as CleanupPhoto[]);
    return json({ deleted: result.hardDeleted, pendingRetry: result.kept, ...result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
