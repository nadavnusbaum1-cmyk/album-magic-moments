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

    const { data: cluster } = await supabase
      .from("face_clusters")
      .select("display_name")
      .eq("id", clusterId)
      .maybeSingle();

    const { data: matches } = await supabase
      .from("cluster_photo_matches")
      .select("photo_id, photos(storage_path, storage_provider, s3_key, content_type, media_type, created_at)")
      .eq("cluster_id", clusterId)
      .order("created_at", { foreignTable: "photos", ascending: false });

    const photos = await Promise.all(
      (matches || []).flatMap((m: { photo_id: string; photos: unknown }) => {
        const p = Array.isArray(m.photos) ? m.photos[0] : m.photos;
        if (!p) return [];
        return [{ id: m.photo_id, photo: p as { storage_path: string; storage_provider?: string; s3_key?: string; content_type?: string; media_type?: string } }];
      }).map(async ({ id, photo }) => ({
        id,
        url: await resolvePhotoUrl(photo),
        media_type: photo.media_type || "image",
        content_type: photo.content_type || null,
      })),
    );

    return new Response(
      JSON.stringify({ photos, count: photos.length, display_name: cluster?.display_name || null }),
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
