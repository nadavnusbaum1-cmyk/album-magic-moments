// Synchronous per-photo face processing — called by the browser right after
// each S3 upload completes so users see "X matches" immediately without
// waiting for the cron job. The cron job remains as a safety net.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { photoId } = await req.json() as { photoId?: string };
    if (!photoId) {
      return new Response(JSON.stringify({ error: "photoId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: photo, error } = await supabase
      .from("photos")
      .select("id, s3_key, storage_path, storage_provider, processed, content_type, media_type")
      .eq("id", photoId)
      .single();
    if (error || !photo) throw new Error("Photo not found");
    if (photo.processed) {
      return new Response(JSON.stringify({ already: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await ensureCollection();
    const result = await processPhoto(supabase, photo);

    return new Response(JSON.stringify({ ok: true, ...result }), {
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
