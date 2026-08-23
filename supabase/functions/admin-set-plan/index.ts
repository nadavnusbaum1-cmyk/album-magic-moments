// Super-admin: set a user's plan / status / limits (approve, change plan, suspend).
import { corsHeaders, json, requireSuperAdmin, svc } from "../_shared/auth.ts";
import { PLAN_LIMITS } from "../_shared/plan.ts";
import { planApprovedEmail, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireSuperAdmin(req);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const { userId, plan, plan_status, photo_limit, event_limit, storage_days, note } = await req.json() as {
      userId?: string; plan?: string; plan_status?: string;
      photo_limit?: number | null; event_limit?: number | null; storage_days?: number | null; note?: string;
    };
    if (!userId) return json({ error: "userId required" }, 400);

    const update: Record<string, unknown> = { plan_updated_at: new Date().toISOString() };
    if (plan) {
      if (!PLAN_LIMITS[plan]) return json({ error: "Unknown plan" }, 400);
      update.plan = plan;
      // Apply the plan's default limits unless explicit overrides were passed.
      update.photo_limit = photo_limit !== undefined ? photo_limit : PLAN_LIMITS[plan].photo;
      update.event_limit = event_limit !== undefined ? event_limit : PLAN_LIMITS[plan].event;
      update.storage_days = storage_days !== undefined ? storage_days : PLAN_LIMITS[plan].storage;
      update.plan_requested = null; // clear any pending request once the plan is set
    } else {
      if (photo_limit !== undefined) update.photo_limit = photo_limit;
      if (event_limit !== undefined) update.event_limit = event_limit;
      if (storage_days !== undefined) update.storage_days = storage_days;
    }
    if (plan_status) {
      if (!["active", "pending", "suspended"].includes(plan_status)) return json({ error: "Bad status" }, 400);
      update.plan_status = plan_status;
    }
    if (note !== undefined) update.plan_note = note;

    const supabase = svc();
    const { data, error } = await supabase.from("profiles").update(update).eq("id", userId).select().maybeSingle();
    if (error) throw error;

    // Email the user when this action approves/activates a paid plan (Approve or
    // Activate in the admin panel). Best-effort — never fail the action on email.
    const activated = plan_status === "active" || (!!plan && plan_status !== "suspended");
    const effectivePlan = (data?.plan as string | undefined);
    if (activated && effectivePlan && effectivePlan !== "free") {
      try {
        const { data: u } = await supabase.auth.admin.getUserById(userId);
        const email = u?.user?.email;
        if (email) {
          const t = planApprovedEmail(effectivePlan);
          await sendEmail({ to: email, subject: t.subject, html: t.html });
        }
      } catch (mailErr) {
        console.error("[admin-set-plan] email failed", mailErr);
      }
    }

    return json({ ok: true, profile: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
