// Host-only: merge multiple clusters into one (within the same event).
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { targetClusterId, sourceClusterIds } = await req.json() as { targetClusterId?: string; sourceClusterIds?: string[] };
    const sources = [...new Set(sourceClusterIds || [])].filter((id) => id && id !== targetClusterId);
    if (!targetClusterId || sources.length === 0) return json({ error: "Choose at least two folders" }, 400);

    const supabase = svc();
    const { data: target } = await supabase.from("face_clusters").select("id, event_id, representative_photo_id").eq("id", targetClusterId).maybeSingle();
    if (!target?.event_id) return json({ error: "Target not found" }, 404);
    const auth = await requireHost(req, target.event_id);
    if (auth.error) return json({ error: auth.error }, auth.status);

    // Ensure sources are in same event
    const { data: srcRows } = await supabase.from("face_clusters").select("id, event_id").in("id", sources);
    if ((srcRows || []).some((r) => r.event_id !== target.event_id)) {
      return json({ error: "Cannot merge across events" }, 400);
    }

    const { data: rows } = await supabase
      .from("cluster_photo_matches")
      .select("photo_id, similarity, bounding_box, face_id, event_id")
      .in("cluster_id", sources);
    if (rows?.length) {
      const merged = rows.map((r) => ({ ...r, cluster_id: targetClusterId }));
      await supabase.from("cluster_photo_matches").upsert(merged, { onConflict: "cluster_id,photo_id" });
    }
    if (!target.representative_photo_id) {
      const { data: cover } = await supabase.from("face_clusters")
        .select("representative_photo_id, representative_storage_path, representative_s3_key")
        .in("id", sources).not("representative_photo_id", "is", null).limit(1).maybeSingle();
      if (cover) await supabase.from("face_clusters").update(cover).eq("id", targetClusterId);
    }
    await supabase.from("guests").update({ cluster_id: targetClusterId }).in("cluster_id", sources);
    await supabase.from("cluster_photo_matches").delete().in("cluster_id", sources);
    await supabase.from("face_clusters").delete().in("id", sources);

    const { count } = await supabase.from("cluster_photo_matches").select("id", { count: "exact", head: true }).eq("cluster_id", targetClusterId);
    await supabase.from("face_clusters").update({ photo_count: count || 0 }).eq("id", targetClusterId);
    return json({ ok: true, merged: sources.length, photoCount: count || 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
