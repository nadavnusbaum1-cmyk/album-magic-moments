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

    const { photoIds } = await req.json() as { photoIds: string[] };
    if (!photoIds?.length) {
      return new Response(JSON.stringify({ error: "photoIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: photos } = await supabase
      .from("photos")
      .select("id, storage_path, storage_provider, s3_key")
      .in("id", photoIds);

    const supabasePaths = (photos || []).filter((p) => p.storage_provider !== "s3").map((p) => p.storage_path);
    const s3Keys = (photos || []).filter((p) => p.storage_provider === "s3" && p.s3_key).map((p) => p.s3_key as string);

    if (supabasePaths.length) {
      await supabase.storage.from("event-photos").remove(supabasePaths);
    }

    // Delete S3 objects via gateway proxy
    if (s3Keys.length) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
      if (LOVABLE_API_KEY && AWS_S3_API_KEY) {
        await Promise.all(s3Keys.map(async (key) => {
          try {
            await fetch(`https://connector-gateway.lovable.dev/aws_s3/${key}`, {
              method: "DELETE",
              headers: {
                "Authorization": `Bearer ${LOVABLE_API_KEY}`,
                "X-Connection-Api-Key": AWS_S3_API_KEY,
              },
            });
          } catch (e) {
            console.error("S3 delete failed for", key, e);
          }
        }));
      }
    }

    // Find affected clusters BEFORE deleting matches
    const { data: affectedMatches } = await supabase
      .from("cluster_photo_matches")
      .select("cluster_id")
      .in("photo_id", photoIds);
    const affectedClusterIds = [...new Set((affectedMatches || []).map((m) => m.cluster_id))];

    // Delete matches
    await supabase.from("photo_matches").delete().in("photo_id", photoIds);
    await supabase.from("cluster_photo_matches").delete().in("photo_id", photoIds);
    await supabase.from("photos").delete().in("id", photoIds);

    // Recompute counts and delete empty clusters
    let removedClusters = 0;
    for (const cid of affectedClusterIds) {
      const { count } = await supabase
        .from("cluster_photo_matches")
        .select("*", { count: "exact", head: true })
        .eq("cluster_id", cid);
      if (!count || count === 0) {
        await supabase.from("face_clusters").delete().eq("id", cid);
        removedClusters++;
      } else {
        await supabase.from("face_clusters").update({ photo_count: count }).eq("id", cid);
      }
    }

    return new Response(JSON.stringify({ deleted: photoIds.length, removedClusters }), {
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
