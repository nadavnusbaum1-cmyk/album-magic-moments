import { corsHeaders, getUser, json, svc } from "../_shared/auth.ts";
import { getAccount } from "../_shared/plan.ts";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { name, event_date, cover_image_url, slug: rawSlug } = await req.json();
    if (!name || !String(name).trim()) return json({ error: "name required" }, 400);
    const supabase = svc();

    // Plan gating: account must be active, and under its event limit.
    const account = await getAccount(user.id);
    if (account.plan_status !== "active") {
      return json({ error: "Your account is pending approval — you'll be able to create events once it's activated.", code: "plan_pending" }, 403);
    }
    if (account.event_limit != null) {
      const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
      if ((count || 0) >= account.event_limit) {
        return json({ error: `Your plan allows ${account.event_limit} event(s). Upgrade to create more.`, code: "event_limit" }, 403);
      }
    }

    let slug = slugify(rawSlug || name);
    // ensure unique
    for (let i = 0; i < 5; i++) {
      const { data: dup } = await supabase.from("events").select("id").ilike("slug", slug).maybeSingle();
      if (!dup) break;
      slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { data, error } = await supabase.from("events").insert({
      owner_id: user.id,
      name: String(name).trim().slice(0, 120),
      slug,
      event_date: event_date || null,
      cover_image_url: cover_image_url || null,
    }).select().single();
    if (error) throw error;
    return json({ event: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
