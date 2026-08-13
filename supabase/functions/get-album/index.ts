// Public: get an album by guest magic token (paginated).
import { corsHeaders, json, svc } from "../_shared/auth.ts";

function proxiedPhotoUrl(photoId: string, size: "thumb" | "medium" | "full" = "full") {
  const base = Deno.env.get("SUPABASE_URL")!;
  return `${base}/functions/v1/photo-proxy?id=${encodeURIComponent(photoId)}&size=${size}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 80), 1), 200);
    if (!token) return json({ error: "token required" }, 400);

    const supabase = svc();
    const { data: guest } = await supabase
      .from("guests").select("id, name, event_id, photo_count")
      .eq("magic_token", token).maybeSingle();
    if (!guest) return json({ error: "Album not found" }, 404);

    let event: { name?: string; slug?: string; extra_links?: any } | null = null;
    if (guest.event_id) {
      const { data } = await supabase.from("events").select("name, slug, extra_links").eq("id", guest.event_id).maybeSingle();
      event = data;
    }

    // Order by the match's own sort_at (denormalized from the photo's capture
    // date) — reliable, unlike ordering the parent by an embedded column.
    let mq = supabase
      .from("photo_matches")
      .select("photo_id, sort_at, photos!inner(media_type, deleted_at)")
      .eq("guest_id", guest.id)
      .is("photos.deleted_at", null)
      .order("sort_at", { ascending: true })
      .limit(limit);
    const cursor = after || before;
    if (cursor) mq = mq.gt("sort_at", cursor);
    const { data: matches } = await mq;

    const photos = (matches || []).flatMap((m: any) => {
        const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
        return p ? [{ photoId: m.photo_id, sortAt: m.sort_at, mediaType: p.media_type }] : [];
      }).map(({ photoId, sortAt, mediaType }: any) => ({
        url: proxiedPhotoUrl(photoId, "full"),
        thumbUrl: proxiedPhotoUrl(photoId, "thumb"),
        mediumUrl: proxiedPhotoUrl(photoId, "medium"),
        id: photoId,
        media_type: mediaType || "image",
        sort_at: sortAt,
      }));

    const nextCursor = photos.length === limit ? photos[photos.length - 1].sort_at : null;
    return json({ guest: { name: guest.name }, event, photos, count: guest.photo_count || photos.length, nextCursor });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
