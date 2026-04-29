// Admin-only: toggle hidden flag or set the representative cover photo for a cluster.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    const provided = req.headers.get("x-admin-password");
    if (!adminPassword || provided !== adminPassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clusterId, hidden, coverPhotoId } = await req.json() as {
      clusterId: string;
      hidden?: boolean;
      coverPhotoId?: string;
    };
    if (!clusterId) {
      return new Response(JSON.stringify({ error: "clusterId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const update: Record<string, unknown> = {};
    if (typeof hidden === "boolean") update.hidden = hidden;

    if (coverPhotoId) {
      const { data: photo, error: pErr } = await supabase
        .from("photos")
        .select("id, storage_path, storage_provider, s3_key")
        .eq("id", coverPhotoId)
        .single();
      if (pErr || !photo) throw new Error("Cover photo not found");
      update.representative_photo_id = photo.id;
      update.representative_storage_path = photo.storage_path;
      update.representative_s3_key = photo.storage_provider === "s3" ? photo.s3_key : null;
    }

    if (Object.keys(update).length === 0) {
      return new Response(JSON.stringify({ error: "Nothing to update" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase.from("face_clusters").update(update).eq("id", clusterId);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
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
