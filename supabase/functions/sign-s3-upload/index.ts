// Returns pre-signed S3 PUT URLs so the browser can upload directly to S3,
// then registers a row in `photos` with storage_provider='s3' so the
// background processor can pick it up.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_URL = "https://connector-gateway.lovable.dev";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AWS_S3_API_KEY = Deno.env.get("AWS_S3_API_KEY");
    if (!LOVABLE_API_KEY || !AWS_S3_API_KEY) {
      throw new Error("S3 connector not configured");
    }

    const { files, uploadedBy } = await req.json() as {
      files: { name: string; contentType: string }[];
      uploadedBy?: string;
    };
    if (!files?.length) {
      return new Response(JSON.stringify({ error: "files required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const uploader = (uploadedBy || "").trim().slice(0, 60) || null;

    const results: { photoId: string; uploadUrl: string; key: string }[] = [];

    for (const f of files) {
      const id = crypto.randomUUID();
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
      const key = `event-photos/${id}.${ext}`;

      // Get pre-signed PUT URL
      const signRes = await fetch(`${API_URL}/api/v1/sign_storage_url?provider=aws_s3&mode=write`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": AWS_S3_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ object_path: key }),
      });
      if (!signRes.ok) {
        throw new Error(`Sign failed [${signRes.status}]: ${await signRes.text()}`);
      }
      const { url: uploadUrl } = await signRes.json();

      // Pre-create the photo row so we can show progress and pick it up later
      const { data: photoRow, error: insErr } = await supabase
        .from("photos")
        .insert({
          storage_path: key,
          s3_key: key,
          storage_provider: "s3",
          source: "upload",
          processed: false,
          uploaded_by: uploader,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      results.push({ photoId: photoRow.id, uploadUrl, key });
    }

    return new Response(JSON.stringify({ uploads: results }), {
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
