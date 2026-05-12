import { corsHeaders } from "../_shared/auth.ts";

const allowedHost = (host: string) => {
  const supabaseHost = new URL(Deno.env.get("SUPABASE_URL")!).host;
  return host === supabaseHost || host.endsWith(".amazonaws.com") || host === "s3.amazonaws.com";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return new Response("url required", { status: 400, headers: corsHeaders });

    const target = new URL(url);
    if (target.protocol !== "https:" || !allowedHost(target.host)) {
      return new Response("unsupported photo source", { status: 400, headers: corsHeaders });
    }

    const upstream = await fetch(target.toString());
    if (!upstream.ok || !upstream.body) {
      return new Response("photo fetch failed", { status: upstream.status || 502, headers: corsHeaders });
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "image/jpeg");
    headers.set("Cache-Control", "private, max-age=300");
    headers.set("Access-Control-Expose-Headers", "Content-Type, Content-Length");
    const length = upstream.headers.get("Content-Length");
    if (length) headers.set("Content-Length", length);

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "failed", { status: 500, headers: corsHeaders });
  }
});