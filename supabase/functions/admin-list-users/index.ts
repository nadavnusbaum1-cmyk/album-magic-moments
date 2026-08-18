// Super-admin: list all users with plan/status/usage + global metrics.
import { corsHeaders, json, requireSuperAdmin, svc } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireSuperAdmin(req);
    if (auth.error) return json({ error: auth.error }, auth.status);
    const supabase = svc();

    const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUsers = authData?.users || [];

    const { data: profiles } = await supabase.from("profiles")
      .select("id, display_name, plan, plan_status, plan_requested, photo_limit, event_limit, plan_note, plan_updated_at");
    const profById = new Map((profiles || []).map((p: any) => [p.id, p]));

    const { data: roles } = await supabase.from("user_roles").select("user_id, role").eq("role", "super_admin");
    const superIds = new Set((roles || []).map((r: any) => r.user_id));

    const { data: stats } = await supabase.rpc("admin_user_stats");
    const statById = new Map((stats || []).map((s: any) => [s.owner_id, s]));

    const users = authUsers.map((u: any) => {
      const p: any = profById.get(u.id) || {};
      const s: any = statById.get(u.id) || {};
      return {
        id: u.id,
        email: u.email || null,
        created_at: u.created_at,
        display_name: p.display_name || null,
        plan: p.plan || "free",
        plan_status: p.plan_status || "active",
        plan_requested: p.plan_requested || null,
        plan_note: p.plan_note || null,
        photo_limit: p.photo_limit ?? null,
        event_limit: p.event_limit ?? null,
        is_super_admin: superIds.has(u.id),
        event_count: Number(s.event_count || 0),
        photo_count: Number(s.photo_count || 0),
        storage_bytes: Number(s.storage_bytes || 0),
      };
    });

    const metrics = {
      users: users.length,
      events: users.reduce((a, r) => a + r.event_count, 0),
      photos: users.reduce((a, r) => a + r.photo_count, 0),
      storage_bytes: users.reduce((a, r) => a + r.storage_bytes, 0),
      pending: users.filter((r) => r.plan_status === "pending").length,
      paid_active: users.filter((r) => r.plan !== "free" && r.plan_status === "active").length,
    };

    return json({ users, metrics });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
