// Public: list photos for a cluster (person folder). Returns event slug for back-nav.
import { corsHeaders, json, svc } from "../_shared/auth.ts";

const PAGE_SIZE = 1000;

function proxiedPhotoUrl(req: Request, photoId: string) {
  const origin = new URL(req.url).origin;
  return `${origin}/functions/v1/photo-proxy?id=${encodeURIComponent(photoId)}`;
}

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

    let eventSlug: string | null = null;
    if (cluster.event_id) {
      const { data: ev } = await supabase.from("events").select("slug").eq("id", cluster.event_id).maybeSingle();
      eventSlug = ev?.slug || null;
    }

    const allMatches: any[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: matches, error } = await supabase
        .from("cluster_photo_matches")
        .select("photo_id, photos(content_type, media_type, created_at)")
        .eq("cluster_id", clusterId)
        .order("created_at", { foreignTable: "photos", ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      allMatches.push(...(matches || []));
      if (!matches || matches.length < PAGE_SIZE) break;
    }

    const photoRows = allMatches.flatMap((m: any) => {
      const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
      return p ? [{ id: m.photo_id, photo: p }] : [];
    });

    const photos = photoRows.map(({ id, photo }) => ({
      id,
      url: proxiedPhotoUrl(req, id),
      media_type: photo.media_type || "image",
    }));

    return json({ photos, count: photoRows.length, display_name: cluster.display_name || null, event_slug: eventSlug });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
