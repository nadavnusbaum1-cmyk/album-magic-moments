// Host-only: hide / set cover / rename / add or remove photos for a cluster.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { clusterId, hidden, coverPhotoId, displayName, addPhotoIds, removePhotoIds } = await req.json() as {
      clusterId?: string; hidden?: boolean; coverPhotoId?: string; displayName?: string | null;
      addPhotoIds?: string[]; removePhotoIds?: string[];
    };
    if (!clusterId) return json({ error: "clusterId required" }, 400);
    const supabase = svc();
    const { data: cluster } = await supabase.from("face_clusters").select("event_id, representative_face_id").eq("id", clusterId).maybeSingle();
    if (!cluster?.event_id) return json({ error: "Not found" }, 404);
    const auth = await requireHost(req, cluster.event_id);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const update: Record<string, unknown> = {};
    if (typeof hidden === "boolean") update.hidden = hidden;
    if (typeof displayName !== "undefined") update.display_name = displayName;
    if (coverPhotoId) {
      const { data: photo } = await supabase.from("photos").select("id, storage_path, storage_provider, s3_key").eq("id", coverPhotoId).single();
      if (!photo) return json({ error: "Cover photo not found" }, 404);
      update.representative_photo_id = photo.id;
      update.representative_storage_path = photo.storage_path;
      update.representative_s3_key = photo.storage_provider === "s3" ? photo.s3_key : null;
    }
    if (Object.keys(update).length) {
      const { error } = await supabase.from("face_clusters").update(update).eq("id", clusterId);
      if (error) throw error;
    }

    if (Array.isArray(addPhotoIds) && addPhotoIds.length) {
      // Validate they belong to the same event
      const { data: photos } = await supabase
        .from("photos").select("id").eq("event_id", cluster.event_id).in("id", addPhotoIds);
      const valid = (photos || []).map((p: any) => p.id);
      if (valid.length) {
        const rows = valid.map((pid) => ({
          cluster_id: clusterId,
          photo_id: pid,
          similarity: 100,
          face_id: cluster.representative_face_id || `manual-${pid}`,
          event_id: cluster.event_id,
        }));
        await supabase.from("cluster_photo_matches").upsert(rows, { onConflict: "cluster_id,photo_id" });
      }
    }
    if (Array.isArray(removePhotoIds) && removePhotoIds.length) {
      await supabase.from("cluster_photo_matches").delete().eq("cluster_id", clusterId).in("photo_id", removePhotoIds);
    }

    if ((addPhotoIds?.length || removePhotoIds?.length)) {
      const { count } = await supabase
        .from("cluster_photo_matches").select("id", { count: "exact", head: true }).eq("cluster_id", clusterId);
      await supabase.from("face_clusters").update({ photo_count: count || 0 }).eq("id", clusterId);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
