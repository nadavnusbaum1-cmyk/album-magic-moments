// Public: list photos for a cluster (person folder).
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const clusterId = url.searchParams.get("id");
    if (!clusterId) return json({ error: "id required" }, 400);
    const supabase = svc();
    const { data: cluster } = await supabase
      .from("face_clusters").select("display_name, event_id").eq("id", clusterId).maybeSingle();
    if (!cluster) return json({ error: "Not found" }, 404);

    const { data: matches } = await supabase
      .from("cluster_photo_matches")
      .select("photo_id, photos(storage_path, storage_provider, s3_key, content_type, media_type, created_at)")
      .eq("cluster_id", clusterId)
      .order("created_at", { foreignTable: "photos", ascending: false });

    const photos = await Promise.all((matches || []).flatMap((m: any) => {
      const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
      return p ? [{ id: m.photo_id, photo: p }] : [];
    }).map(async ({ id, photo }) => ({
      id,
      url: await resolvePhotoUrl(photo),
      media_type: photo.media_type || "image",
    })));

    return json({ photos, count: photos.length, display_name: cluster.display_name || null });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
