// Shared helpers: validate Supabase user JWT and event-host ownership.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email || undefined };
}

export async function requireHost(req: Request, eventId: string) {
  const user = await getUser(req);
  if (!user) return { error: "Unauthorized", status: 401 as const, user: null };
  const supabase = svc();
  const { data, error } = await supabase.rpc("is_event_host", { _user_id: user.id, _event_id: eventId });
  if (error) return { error: "Auth check failed", status: 500 as const, user };
  if (!data) return { error: "Forbidden", status: 403 as const, user };
  return { user, error: null, status: 200 as const };
}

export async function eventBySlug(slug: string) {
  const supabase = svc();
  const { data } = await supabase
    .from("events")
    .select("id, name, slug, event_date, cover_image_url, home_bg_url, cover_photo_id, show_people, show_all_photos, is_published, allow_guest_uploads, default_language, extra_links")
    .ilike("slug", slug)
    .maybeSingle();
  return data;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
