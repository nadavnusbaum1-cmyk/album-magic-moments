// Host-only: approve guest photos in the moderation queue (pending/flagged) so
// they become publicly visible in the album. Clears the stored flag reason.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { photoIds } = await req.json() as { photoIds?: string[] };
    if (!Array.isArray(photoIds) || !photoIds.length) return json({ error: "photoIds required" }, 400);
    const supabase = svc();
    const { data: photos } = await supabase.from("photos").select("id, event_id").in("id", photoIds);
    if (!photos?.length) return json({ error: "Not found" }, 404);
    const eventIds = [...new Set(photos.map((p: any) => p.event_id))];
    if (eventIds.length !== 1) return json({ error: "All photos must be from the same event" }, 400);
    const auth = await requireHost(req, eventIds[0] as string);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const { error } = await supabase.from("photos")
      .update({ moderation_status: "approved", moderation_labels: null })
      .in("id", photoIds);
    if (error) throw error;
    return json({ ok: true, approved: photoIds.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
