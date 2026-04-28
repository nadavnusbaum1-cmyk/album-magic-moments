import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { signS3Read, supabasePublicUrl } from "../_shared/storage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: clusters, error } = await supabase
      .from("face_clusters")
      .select("id, representative_storage_path, representative_s3_key, photo_count, display_name, created_at")
      .gt("photo_count", 0)
      .order("photo_count", { ascending: false })
      .limit(200);
    if (error) throw error;

    const items = await Promise.all(
      (clusters || []).map(async (c) => {
        let cover_url: string | null = null;
        if (c.representative_s3_key) {
          try {
            cover_url = await signS3Read(c.representative_s3_key);
          } catch { /* ignore */ }
        } else if (c.representative_storage_path) {
          cover_url = supabasePublicUrl(c.representative_storage_path);
        }
        return {
          id: c.id,
          photo_count: c.photo_count,
          display_name: c.display_name,
          cover_url,
        };
      }),
    );

    return new Response(JSON.stringify({ clusters: items }), {
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
