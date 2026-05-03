// Returns events the logged-in user owns or co-hosts.
import { corsHeaders, getUser, json, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const supabase = svc();
    const { data: owned } = await supabase
      .from("events").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    const { data: memberRows } = await supabase
      .from("event_members").select("event_id").eq("user_id", user.id);
    const memberIds = (memberRows || []).map((m) => m.event_id);
    let memberEvents: any[] = [];
    if (memberIds.length) {
      const { data } = await supabase.from("events").select("*").in("id", memberIds);
      memberEvents = data || [];
    }
    const all = [...(owned || []), ...memberEvents];
    const dedup = Array.from(new Map(all.map((e) => [e.id, e])).values());
    // Counts
    const counts: Record<string, number> = {};
    if (dedup.length) {
      for (const e of dedup) {
        const { count } = await supabase
          .from("photos").select("id", { count: "exact", head: true }).eq("event_id", e.id);
        counts[e.id] = count || 0;
      }
    }
    return json({ events: dedup.map((e) => ({ ...e, photo_count: counts[e.id] || 0 })) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
