// Host-only: shorten an app URL (e.g. the guest upload link) via is.gd.
import { corsHeaders, json, requireHost } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { eventId, url } = await req.json() as { eventId?: string; url?: string };
    if (!eventId) return json({ error: "eventId required" }, 400);
    if (!url || !/^https:\/\/[^\s]+$/i.test(url)) return json({ error: "valid https url required" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
    const text = (await res.text()).trim();
    if (!res.ok || !/^https:\/\//.test(text)) return json({ error: text || "Shortening failed" }, 502);
    return json({ short: text });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
});
