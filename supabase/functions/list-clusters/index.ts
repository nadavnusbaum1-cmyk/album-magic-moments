import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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
      .select("id, representative_storage_path, photo_count, display_name, created_at")
      .gt("photo_count", 0)
      .order("photo_count", { ascending: false })
      .limit(200);
    if (error) throw error;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const items = (clusters || []).map((c) => ({
      id: c.id,
      photo_count: c.photo_count,
      display_name: c.display_name,
      cover_url: c.representative_storage_path
        ? `${supabaseUrl}/storage/v1/object/public/event-photos/${c.representative_storage_path}`
        : null,
    }));

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
