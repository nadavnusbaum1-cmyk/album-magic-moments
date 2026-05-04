// Public: fetch event metadata by slug. Used by guest landing page.
import { corsHeaders, eventBySlug, json, svc } from "../_shared/auth.ts";
import { resolvePhotoUrl } from "../_shared/storage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "slug required" }, 400);
    const event = await eventBySlug(slug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);

    // Resolve cover from selected photo if set
    let cover_image_url = event.cover_image_url || null;
    if (event.cover_photo_id) {
      const supabase = svc();
      const { data: p } = await supabase.from("photos")
        .select("storage_path, storage_provider, s3_key")
        .eq("id", event.cover_photo_id).maybeSingle();
      if (p) cover_image_url = await resolvePhotoUrl(p);
    }

    return json({ event: { ...event, cover_image_url } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
