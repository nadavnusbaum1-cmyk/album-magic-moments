import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { resolvePhotoUrl } from "../_shared/storage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const provided = req.headers.get("x-admin-password");
    const isAdmin = !!adminPassword && provided === adminPassword;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let q = supabase
      .from("face_clusters")
      .select("id, representative_storage_path, representative_s3_key, photo_count, display_name, hidden, created_at")
      .gt("photo_count", 0)
      .order("photo_count", { ascending: false })
      .limit(200);
    if (!isAdmin) q = q.eq("hidden", false);
    const { data: clusters, error } = await q;
    if (error) throw error;

    const items = await Promise.all(
      (clusters || []).map(async (c) => {
        let cover_url: string | null = null;
        try {
          if (c.representative_s3_key || c.representative_storage_path) {
            cover_url = await resolvePhotoUrl({
              storage_provider: c.representative_s3_key ? "s3" : "supabase",
              s3_key: c.representative_s3_key,
              storage_path: c.representative_storage_path || "",
            });
          }
        } catch { /* ignore */ }

        if (!cover_url) {
          const { data: any } = await supabase
            .from("cluster_photo_matches")
            .select("photos(storage_path, storage_provider, s3_key)")
            .eq("cluster_id", c.id)
            .limit(1)
            .maybeSingle();
          const p = any?.photos as { storage_path: string; storage_provider?: string; s3_key?: string } | null;
          if (p) {
            try { cover_url = await resolvePhotoUrl(p); } catch { /* ignore */ }
          }
        }

        return {
          id: c.id,
          photo_count: c.photo_count,
          display_name: c.display_name,
          hidden: c.hidden,
          cover_url,
        };
      }),
    );

    return new Response(JSON.stringify({ clusters: items, isAdmin }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
