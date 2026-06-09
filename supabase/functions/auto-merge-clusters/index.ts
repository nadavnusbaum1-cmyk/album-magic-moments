// Host-only: auto-merge over-fragmented face clusters within an event.
// Walks clusters in batches and uses Rekognition SearchFaces on each cluster's
// representative face to find other clusters that represent the same person.
// Designed to be idempotent and resumable — call repeatedly until { done: true }.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";
import { rekognition, collectionFor } from "../_shared/rekognition.ts";

const MERGE_THRESHOLD = 90; // strict — only merge clearly-same-person clusters
const BATCH_SIZE = 80;      // clusters processed per invocation

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, cursor } = await req.json() as { eventId?: string; cursor?: string | null };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const supabase = svc();
    const COLLECTION = collectionFor(eventId);

    // Page through clusters by id (stable order) — skip ones already deleted via merging.
    let q = supabase
      .from("face_clusters")
      .select("id, representative_face_id, display_name")
      .eq("event_id", eventId)
      .not("representative_face_id", "is", null)
      .order("id", { ascending: true })
      .limit(BATCH_SIZE);
    if (cursor) q = q.gt("id", cursor);
    const { data: clusters } = await q;
    if (!clusters?.length) return json({ done: true, mergedGroups: 0, nextCursor: null });

    // Map face_id -> cluster_id for THIS event (we only merge inside the event).
    const { data: allClusters } = await supabase
      .from("face_clusters").select("id, representative_face_id, display_name")
      .eq("event_id", eventId).not("representative_face_id", "is", null);
    const faceToCluster = new Map<string, { id: string; name: string | null }>();
    for (const c of allClusters || []) {
      if (c.representative_face_id) faceToCluster.set(c.representative_face_id, { id: c.id, name: c.display_name });
    }

    const merged = new Set<string>();
    let mergedGroups = 0;
    let nextCursor: string | null = null;

    for (const c of clusters) {
      nextCursor = c.id;
      if (merged.has(c.id)) continue;
      const fid = c.representative_face_id as string;

      const search = await rekognition("SearchFaces", {
        CollectionId: COLLECTION,
        FaceId: fid,
        FaceMatchThreshold: MERGE_THRESHOLD,
        MaxFaces: 200,
      }).catch(() => ({ FaceMatches: [] }));

      const sourceIds: string[] = [];
      let preferredName: string | null = c.display_name;
      for (const m of (search.FaceMatches || [])) {
        const mfid = m.Face?.FaceId;
        if (!mfid) continue;
        const target = faceToCluster.get(mfid);
        if (!target) continue;
        if (target.id === c.id) continue;
        if (merged.has(target.id)) continue;
        sourceIds.push(target.id);
        merged.add(target.id);
        if (!preferredName && target.name) preferredName = target.name;
      }
      if (!sourceIds.length) continue;

      // Move all cluster_photo_matches from sources -> c.id
      const { data: rows } = await supabase
        .from("cluster_photo_matches")
        .select("photo_id, similarity, bounding_box, face_id, event_id")
        .in("cluster_id", sourceIds);
      if (rows?.length) {
        const moved = rows.map((r) => ({ ...r, cluster_id: c.id }));
        await supabase.from("cluster_photo_matches").upsert(moved, { onConflict: "cluster_id,photo_id" });
      }
      await supabase.from("guests").update({ cluster_id: c.id }).in("cluster_id", sourceIds);
      await supabase.from("cluster_photo_matches").delete().in("cluster_id", sourceIds);
      await supabase.from("face_clusters").delete().in("id", sourceIds);

      const { count } = await supabase.from("cluster_photo_matches")
        .select("id", { count: "exact", head: true }).eq("cluster_id", c.id);
      const update: Record<string, unknown> = { photo_count: count || 0 };
      if (preferredName && !c.display_name) update.display_name = preferredName;
      await supabase.from("face_clusters").update(update).eq("id", c.id);

      mergedGroups++;
    }

    return json({ done: clusters.length < BATCH_SIZE, mergedGroups, nextCursor, processed: clusters.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
