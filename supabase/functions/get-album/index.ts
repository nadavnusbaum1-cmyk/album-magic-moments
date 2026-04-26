import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: guest, error } = await supabase
      .from("guests")
      .select("id, name, photo_count")
      .eq("magic_token", token)
      .single();
    if (error || !guest) {
      return new Response(JSON.stringify({ error: "Album not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: matches } = await supabase
      .from("photo_matches")
      .select("photo_id, photos(storage_path, created_at)")
      .eq("guest_id", guest.id)
      .order("created_at", { foreignTable: "photos", ascending: false });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const photos = (matches || []).map((m: { photos: { storage_path: string } | null }) => ({
      url: `${supabaseUrl}/storage/v1/object/public/event-photos/${m.photos?.storage_path}`,
    }));

    return new Response(
      JSON.stringify({ guest: { name: guest.name }, photos, count: photos.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
