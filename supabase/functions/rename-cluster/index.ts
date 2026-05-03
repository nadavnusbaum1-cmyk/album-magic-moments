// Host-only: rename a cluster.
import { corsHeaders, json, requireHost, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { id, name } = await req.json() as { id?: string; name?: string };
    if (!id) return json({ error: "id required" }, 400);
    const supabase = svc();
    const { data: cluster } = await supabase.from("face_clusters").select("event_id").eq("id", id).maybeSingle();
    if (!cluster?.event_id) return json({ error: "Not found" }, 404);
    const auth = await requireHost(req, cluster.event_id);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const trimmed = (name || "").trim().slice(0, 60);
    const { error } = await supabase.from("face_clusters").update({ display_name: trimmed || null }).eq("id", id);
    if (error) throw error;
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
