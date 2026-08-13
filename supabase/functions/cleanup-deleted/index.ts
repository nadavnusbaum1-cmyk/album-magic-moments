// Cron: retry hard-deletion of photos left in `deleting` (their S3 delete failed
// earlier) so no orphaned objects or half-deleted rows linger. Cron-secret gated.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { hardDeletePhotos, type CleanupPhoto } from "../_shared/cleanupPhotos.ts";

const BATCH = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return json({ error: "Forbidden" }, 403);

  try {
    const supabase = svc();
    const { data: photos } = await supabase
      .from("photos")
      .select("id, event_id, storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium")
      .eq("upload_status", "deleting")
      .limit(BATCH);
    if (!photos?.length) return json({ cleaned: 0 });

    const r = await hardDeletePhotos(supabase, photos as CleanupPhoto[]);
    return json({ cleaned: r.hardDeleted, stillPending: r.kept, ...r });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
