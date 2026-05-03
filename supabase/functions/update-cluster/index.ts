// Host-only: hide / set cover for a cluster.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { clusterId, hidden, coverPhotoId } = await req.json() as {
      clusterId?: string; hidden?: boolean; coverPhotoId?: string;
    };
    if (!clusterId) return json({ error: "clusterId required" }, 400);
    const supabase = svc();
    const { data: cluster } = await supabase.from("face_clusters").select("event_id").eq("id", clusterId).maybeSingle();
    if (!cluster?.event_id) return json({ error: "Not found" }, 404);
    const auth = await requireHost(req, cluster.event_id);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const update: Record<string, unknown> = {};
    if (typeof hidden === "boolean") update.hidden = hidden;
    if (coverPhotoId) {
      const { data: photo } = await supabase.from("photos").select("id, storage_path, storage_provider, s3_key").eq("id", coverPhotoId).single();
      if (!photo) return json({ error: "Cover photo not found" }, 404);
      update.representative_photo_id = photo.id;
      update.representative_storage_path = photo.storage_path;
      update.representative_s3_key = photo.storage_provider === "s3" ? photo.s3_key : null;
    }
    if (!Object.keys(update).length) return json({ error: "Nothing to update" }, 400);
    const { error } = await supabase.from("face_clusters").update(update).eq("id", clusterId);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
