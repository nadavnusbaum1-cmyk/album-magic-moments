// Public: list visible clusters for an event slug. Or host: include hidden if logged-in host.
import { corsHeaders, eventBySlug, getUser, json, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

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
      .select("id, representative_storage_path, representative_s3_key, photo_count, display_name, hidden")
      .eq("event_id", event.id)
      .gt("photo_count", 0)
      .order("photo_count", { ascending: false })
      .limit(200);
    if (!isHost) q = q.eq("hidden", false);
    const { data: clusters, error } = await q;
    if (error) throw error;

    const items = await Promise.all((clusters || []).map(async (c) => {
      let cover_url: string | null = null;
      try {
        if (c.representative_s3_key || c.representative_storage_path) {
          cover_url = await resolvePhotoUrl({
            storage_provider: c.representative_s3_key ? "s3" : "supabase",
            s3_key: c.representative_s3_key,
            storage_path: c.representative_storage_path || "",
          });
        }
      } catch { /* ignore */ }
      if (!cover_url) {
        const { data: cmRows } = await supabase
          .from("cluster_photo_matches")
          .select("photos(storage_path, storage_provider, s3_key)")
          .eq("cluster_id", c.id).limit(5);
        const cand = (cmRows || []).find((r: any) => r.photos);
        const p = cand ? (Array.isArray(cand.photos) ? cand.photos[0] : cand.photos) : null;
        if (p) try { cover_url = await resolvePhotoUrl(p); } catch { /* ignore */ }
      }
      return { id: c.id, photo_count: c.photo_count, display_name: c.display_name, hidden: c.hidden, cover_url };
    }));

    const filtered = items.filter((i) => !!i.cover_url);
    return json({ clusters: filtered, isHost });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
