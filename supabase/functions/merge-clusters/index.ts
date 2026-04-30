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

    const { targetClusterId, sourceClusterIds } = await req.json() as {
      targetClusterId?: string;
      sourceClusterIds?: string[];
    };
    const sources = [...new Set(sourceClusterIds || [])].filter((id) => id && id !== targetClusterId);
    if (!targetClusterId || sources.length === 0) {
      return new Response(JSON.stringify({ error: "Choose at least two folders to unify" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: target, error: targetErr } = await supabase
      .from("face_clusters")
      .select("id, representative_photo_id, representative_storage_path, representative_s3_key")
      .eq("id", targetClusterId)
      .single();
    if (targetErr || !target) throw new Error("Target folder not found");

    const { data: rows, error: rowsErr } = await supabase
      .from("cluster_photo_matches")
      .select("photo_id, similarity, bounding_box, face_id")
      .in("cluster_id", sources);
    if (rowsErr) throw rowsErr;

    if (rows?.length) {
      const mergedRows = rows.map((row) => ({ ...row, cluster_id: targetClusterId }));
      const { error: upsertErr } = await supabase
        .from("cluster_photo_matches")
        .upsert(mergedRows, { onConflict: "cluster_id,photo_id" });
      if (upsertErr) throw upsertErr;
    }

    if (!target.representative_photo_id) {
      const { data: sourceCover } = await supabase
        .from("face_clusters")
        .select("representative_photo_id, representative_storage_path, representative_s3_key")
        .in("id", sources)
        .not("representative_photo_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (sourceCover) {
        await supabase.from("face_clusters").update(sourceCover).eq("id", targetClusterId);
      }
    }

    await supabase.from("guests").update({ cluster_id: targetClusterId }).in("cluster_id", sources);
    await supabase.from("cluster_photo_matches").delete().in("cluster_id", sources);
    await supabase.from("face_clusters").delete().in("id", sources);

    const { count } = await supabase
      .from("cluster_photo_matches")
      .select("id", { count: "exact", head: true })
      .eq("cluster_id", targetClusterId);
    await supabase.from("face_clusters").update({ photo_count: count || 0 }).eq("id", targetClusterId);

    return new Response(JSON.stringify({ ok: true, merged: sources.length, photoCount: count || 0 }), {
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