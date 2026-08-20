// Host-only: shorten an app URL (e.g. the guest upload link).
// Tries TinyURL first, then cleanuri as a fallback (is.gd/v.gd are unreliable).
import { corsHeaders, json, requireHost } from "../_shared/auth.ts";

async function tinyurl(url: string): Promise<string | null> {
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    const text = (await res.text()).trim();
    return res.ok && /^https:\/\//.test(text) ? text : null;
  } catch { return null; }
}

async function cleanuri(url: string): Promise<string | null> {
  try {
    const res = await fetch("https://cleanuri.com/api/v1/shorten", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `url=${encodeURIComponent(url)}`,
    });
    const data = await res.json().catch(() => ({}));
    return typeof data.result_url === "string" ? data.result_url : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, url } = await req.json() as { eventId?: string; url?: string };
    if (!eventId) return json({ error: "eventId required" }, 400);
    if (!url || !/^https:\/\/[^\s]+$/i.test(url)) return json({ error: "valid https url required" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const short = (await tinyurl(url)) || (await cleanuri(url));
    if (!short) return json({ error: "Shortening service unavailable" }, 502);
    return json({ short });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
});
