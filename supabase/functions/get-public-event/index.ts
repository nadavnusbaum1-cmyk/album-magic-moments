// Public: fetch event metadata by slug. Used by guest landing page.
import { corsHeaders, eventBySlug, json } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return json({ error: "slug required" }, 400);
    const event = await eventBySlug(slug);
    if (!event || !event.is_published) return json({ error: "Event not found" }, 404);
    return json({ event });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
