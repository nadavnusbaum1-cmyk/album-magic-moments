// Public: list visible clusters for an event slug. Or host: include hidden if logged-in host.
import { corsHeaders, eventBySlug, getUser, json, svc } from "../_shared/auth.ts";

function proxiedPhotoUrl(req: Request, photoId: string) {
  const origin = new URL(req.url).origin;
  return `${origin}/functions/v1/photo-proxy?id=${encodeURIComponent(photoId)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventSlug } = await req.json() as { eventSlug?: string };
    if (!eventSlug) return json({ error: "eventSlug required" }, 400);
    const event = await eventBySlug(eventSlug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);

    const user = await getUser(req);
    let isHost = false;
    if (user) {
      const supabase = svc();
      const { data } = await supabase.rpc("is_event_host", { _user_id: user.id, _event_id: event.id });
      isHost = !!data;
    }

    const supabase = svc();
    let q = supabase
      .from("face_clusters")
      .select("id, representative_photo_id, photo_count, display_name, hidden")
      .eq("event_id", event.id)
      .gt("photo_count", 0)
      .order("photo_count", { ascending: false })
      .limit(200);
    if (!isHost) q = q.eq("hidden", false);
    const { data: clusters, error } = await q;
    if (error) throw error;

    const items = await Promise.all((clusters || []).map(async (c) => {
      let cover_url: string | null = null;
      if (c.representative_photo_id) cover_url = proxiedPhotoUrl(req, c.representative_photo_id);
      if (!cover_url) {
        const { data: cmRows } = await supabase
          .from("cluster_photo_matches")
          .select("photo_id")
          .eq("cluster_id", c.id).limit(5);
        const cand = (cmRows || []).find((r: any) => r.photo_id);
        if (cand?.photo_id) cover_url = proxiedPhotoUrl(req, cand.photo_id);
      }
      return { id: c.id, photo_count: c.photo_count, display_name: c.display_name, hidden: c.hidden, cover_url };
    }));

    const filtered = items.filter((i) => !!i.cover_url);
    return json({ clusters: filtered, isHost });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
