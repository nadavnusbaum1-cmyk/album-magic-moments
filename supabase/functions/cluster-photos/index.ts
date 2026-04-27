import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const clusterId = url.searchParams.get("id");
    if (!clusterId) {
      return new Response(JSON.stringify({ error: "id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: matches } = await supabase
      .from("cluster_photo_matches")
      .select("photo_id, photos(storage_path, created_at)")
      .eq("cluster_id", clusterId)
      .order("created_at", { foreignTable: "photos", ascending: false });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const photos = (matches || []).flatMap((m: { photo_id: string; photos: unknown }) => {
      const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
      const path = (p as { storage_path?: string } | null)?.storage_path;
      return path
        ? [{
          id: m.photo_id,
          url: `${supabaseUrl}/storage/v1/object/public/event-photos/${path}`,
        }]
        : [];
    });

    return new Response(JSON.stringify({ photos, count: photos.length }), {
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
