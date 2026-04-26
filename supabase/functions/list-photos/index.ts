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

    const { data: photos, error } = await supabase
      .from("photos")
      .select("id, storage_path, face_count, processed, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;

    const items = (photos || []).map((p) => {
      const { data } = supabase.storage.from("event-photos").getPublicUrl(p.storage_path);
      return {
        id: p.id,
        url: data.publicUrl,
        face_count: p.face_count,
        processed: p.processed,
        created_at: p.created_at,
      };
    });

    return new Response(JSON.stringify({ photos: items }), {
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
