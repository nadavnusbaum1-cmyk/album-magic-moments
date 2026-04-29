// Background processor: picks up unprocessed photos and processes them in batches.
// Designed to be called every minute by pg_cron — acts as a safety-net in case
// the synchronous per-photo processing during upload fails or times out.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { ensureCollection } from "../_shared/rekognition.ts";
import { processPhoto } from "../_shared/processPhoto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await ensureCollection();

    const { data: pending } = await supabase
      .from("photos")
      .select("id, s3_key, storage_path, storage_provider")
      .eq("processed", false)
      .is("processing_error", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (!pending?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const photo of pending) {
      try {
        await processPhoto(supabase, photo);
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown";
        console.error(`Photo ${photo.id} failed:`, msg);
        await supabase.from("photos").update({ processing_error: msg }).eq("id", photo.id);
      }
    }

    return new Response(JSON.stringify({ processed, batch: pending.length }), {
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
