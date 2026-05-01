// Returns pre-signed S3 PUT URLs so the browser can upload directly to S3,
// then registers a row in `photos` with storage_provider='s3'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_URL = "https://connector-gateway.lovable.dev";

// HEIC/HEIF intentionally excluded — browsers (and Rekognition) can't read them.
// Client must convert HEIC to JPEG before requesting a signed URL.
const ALLOWED = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|quicktime|webm|x-m4v|x-matroska))$/i;
const HEIC_RE = /\.(heic|heif)$/i;

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

    const results: { photoId: string; uploadUrl: string; key: string; contentType: string }[] = [];

    for (const f of files) {
      const id = crypto.randomUUID();
      const lower = (f.name || "").toLowerCase();
      const ext = (lower.split(".").pop() || "jpg").slice(0, 5);

      // Normalize content type — iPhone often sends empty MIME for HEIC
      let contentType = f.contentType || "";
      if (!contentType || !ALLOWED.test(contentType)) {
        if (lower.endsWith(".heic")) contentType = "image/heic";
        else if (lower.endsWith(".heif")) contentType = "image/heif";
        else if (lower.endsWith(".mp4")) contentType = "video/mp4";
        else if (lower.endsWith(".mov")) contentType = "video/quicktime";
        else if (lower.endsWith(".webm")) contentType = "video/webm";
        else if (lower.endsWith(".png")) contentType = "image/png";
        else if (lower.endsWith(".webp")) contentType = "image/webp";
        else contentType = "image/jpeg";
      }
      const isVideo = contentType.startsWith("video/");
      const mediaType = isVideo ? "video" : "image";

      const key = `event-photos/${id}.${ext}`;

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

      const { data: photoRow, error: insErr } = await supabase
        .from("photos")
        .insert({
          storage_path: key,
          s3_key: key,
          storage_provider: "s3",
          source: "upload",
          processed: false,
          uploaded_by: uploader,
          media_type: mediaType,
          content_type: contentType,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      results.push({ photoId: photoRow.id, uploadUrl, key, contentType });
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
