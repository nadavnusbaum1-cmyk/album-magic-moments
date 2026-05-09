// Host-only: rename or delete a "folder" (source_label) across an event's photos.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, from, to } = await req.json() as {
      eventId?: string; from?: string; to?: string | null;
    };
    if (!eventId || !from) return json({ error: "eventId and from required" }, 400);
    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const newVal = (typeof to === "string" && to.trim()) ? to.trim().slice(0, 60) : null;
    const supabase = svc();
    const { error, count } = await supabase
      .from("photos")
      .update({ source_label: newVal }, { count: "exact" })
      .eq("event_id", eventId)
      .eq("source_label", from);
    if (error) throw error;
    return json({ ok: true, updated: count || 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
