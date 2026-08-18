// Authenticated user picks a plan during onboarding (or upgrades later).
//   free      -> activated immediately on free-tier limits
//   paid plan -> recorded as plan_requested (pending manual approval); the user
//                starts on the active free tier until an admin approves.
// Also captures optional contact fields (useful for Google signups).
import { corsHeaders, getUser, json, svc } from "../_shared/auth.ts";
import { PLAN_LIMITS } from "../_shared/plan.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { plan, phone, event_date, marketing_opt_in } = await req.json() as {
      plan?: string; phone?: string; event_date?: string; marketing_opt_in?: boolean;
    };

    const update: Record<string, unknown> = { onboarded: true };
    if (phone !== undefined) update.phone = (phone || "").trim() || null;
    if (event_date !== undefined) update.event_date = event_date || null;
    if (marketing_opt_in !== undefined) update.marketing_opt_in = !!marketing_opt_in;

    let status = "active";
    if (!plan || plan === "free") {
      update.plan = "free";
      update.plan_status = "active";
      update.photo_limit = PLAN_LIMITS.free.photo;
      update.event_limit = PLAN_LIMITS.free.event;
      update.plan_requested = null;
    } else if (PLAN_LIMITS[plan]) {
      // Paid plan: request it (admin approves after payment). Start on free tier.
      update.plan_requested = plan;
      status = "requested";
    } else {
      return json({ error: "Unknown plan" }, 400);
    }

    const supabase = svc();
    const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
    if (error) throw error;
    return json({ ok: true, status });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
