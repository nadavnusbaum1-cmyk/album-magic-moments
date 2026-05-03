// Public: get an album by guest magic token.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return json({ error: "token required" }, 400);

    const supabase = svc();
    const { data: guest } = await supabase
      .from("guests").select("id, name, event_id, photo_count")
      .eq("magic_token", token).maybeSingle();
    if (!guest) return json({ error: "Album not found" }, 404);

    let event: any = null;
    if (guest.event_id) {
      const { data } = await supabase.from("events").select("name, slug").eq("id", guest.event_id).maybeSingle();
      event = data;
    }

    const { data: matches } = await supabase
      .from("photo_matches")
      .select("photo_id, photos(storage_path, storage_provider, s3_key, media_type, content_type, created_at)")
      .eq("guest_id", guest.id)
      .order("created_at", { foreignTable: "photos", ascending: false });

    const photos = await Promise.all(
      (matches || []).flatMap((m: any) => {
        const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
        return p ? [p] : [];
      }).map(async (p: any) => ({
        url: await resolvePhotoUrl(p),
        media_type: p.media_type || "image",
      })),
    );

    return json({ guest: { name: guest.name }, event, photos, count: photos.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
