import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { eventId, ...patch } = body as { eventId: string; [k: string]: any };
    if (!eventId) return json({ error: "eventId required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const allowed = ["name", "event_date", "cover_image_url", "cover_photo_id", "show_people", "show_all_photos", "is_published", "allow_guest_uploads", "default_language", "extra_links"];
    const update: Record<string, unknown> = {};
    for (const k of allowed) if (k in patch) update[k] = patch[k];
    if (!Object.keys(update).length) return json({ error: "Nothing to update" }, 400);
    update.updated_at = new Date().toISOString();
    const supabase = svc();
    const { data, error } = await supabase.from("events").update(update).eq("id", eventId).select().single();
    if (error) throw error;
    return json({ event: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
