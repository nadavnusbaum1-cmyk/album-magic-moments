import { corsHeaders, svc } from "../_shared/auth.ts";
import { resolvePhotoAssets } from "../_shared/storage.ts";

const allowedHost = (host: string) => {
  const supabaseHost = new URL(Deno.env.get("SUPABASE_URL")!).host;
  return host === supabaseHost || host.endsWith(".amazonaws.com") || host === "s3.amazonaws.com";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const params = new URL(req.url).searchParams;
    const photoId = params.get("id");
    const size = (params.get("size") || "full") as "thumb" | "medium" | "full";
    let url = params.get("url");

    if (photoId) {
      const supabase = svc();
      const { data: photo, error } = await supabase
        .from("photos")
        .select("storage_path, storage_provider, s3_key, s3_key_thumbnail, s3_key_medium, deleted_at")
        .eq("id", photoId)
        .maybeSingle();
      if (error) throw error;
      if (!photo || photo.deleted_at) return new Response("photo not found", { status: 404, headers: corsHeaders });
      const assets = await resolvePhotoAssets(photo);
      url = size === "thumb" ? assets.thumb : size === "medium" ? assets.medium : assets.full;
    }

    if (!url) return new Response("url or id required", { status: 400, headers: corsHeaders });

    const target = new URL(url);
    if (target.protocol !== "https:" || !allowedHost(target.host)) {
      return new Response("unsupported photo source", { status: 400, headers: corsHeaders });
    }

    const upstreamHeaders = new Headers();
    const range = req.headers.get("Range");
    if (range) upstreamHeaders.set("Range", range);
    const upstream = await fetch(target.toString(), { headers: upstreamHeaders });
    if (!upstream.ok || !upstream.body) {
      return new Response("photo fetch failed", { status: upstream.status || 502, headers: corsHeaders });
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "image/jpeg");
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Access-Control-Expose-Headers", "Content-Type, Content-Length, Content-Range, Accept-Ranges");
    const length = upstream.headers.get("Content-Length");
    if (length) headers.set("Content-Length", length);
    const contentRange = upstream.headers.get("Content-Range");
    if (contentRange) headers.set("Content-Range", contentRange);
    const acceptRanges = upstream.headers.get("Accept-Ranges");
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "failed", { status: 500, headers: corsHeaders });
  }
});