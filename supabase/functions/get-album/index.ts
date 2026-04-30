import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { resolvePhotoUrl } from "../_shared/storage.ts";

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
      .select("photo_id, photos(storage_path, storage_provider, s3_key, media_type, content_type, created_at)")
      .eq("guest_id", guest.id)
      .order("created_at", { foreignTable: "photos", ascending: false });

    const photos = await Promise.all(
      (matches || []).flatMap((m: { photos: unknown }) => {
        const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
        if (!p) return [];
        return [p as { storage_path: string; storage_provider?: string; s3_key?: string; media_type?: string; content_type?: string }];
      }).map(async (p) => ({
        url: await resolvePhotoUrl(p),
        media_type: p.media_type || "image",
        content_type: p.content_type || null,
      })),
    );

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
