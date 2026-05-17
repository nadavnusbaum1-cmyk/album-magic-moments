// Sends WhatsApp messages via Twilio to a list of guest phone numbers.
import { corsHeaders, json, requireHost } from "../_shared/auth.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

function normalize(num: string): string | null {
  const trimmed = num.trim().replace(/[\s\-\(\)]/g, "");
  if (!trimmed) return null;
  // Must be E.164: +<digits>
  if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) return null;
  return trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { eventId, from, message, numbers } = body as {
      eventId?: string; from?: string; message?: string; numbers?: string[];
    };

    if (!eventId || typeof eventId !== "string") return json({ error: "eventId required" }, 400);
    if (!from || typeof from !== "string") return json({ error: "from required (your Twilio WhatsApp number, e.g. +14155238886)" }, 400);
    if (!message || typeof message !== "string" || message.length > 1500) return json({ error: "message required (<=1500 chars)" }, 400);
    if (!Array.isArray(numbers) || numbers.length === 0) return json({ error: "numbers required" }, 400);
    if (numbers.length > 500) return json({ error: "Max 500 recipients per send" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const fromNum = normalize(from);
    if (!fromNum) return json({ error: "Invalid 'from' number — must be E.164, e.g. +14155238886" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    if (!TWILIO_API_KEY) return json({ error: "Twilio is not connected" }, 500);

    const results: Array<{ to: string; ok: boolean; sid?: string; error?: string }> = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const raw of numbers) {
      const to = normalize(raw);
      if (!to) { results.push({ to: raw, ok: false, error: "invalid" }); skipped++; continue; }

      try {
        const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TWILIO_API_KEY,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: `whatsapp:${to}`,
            From: `whatsapp:${fromNum}`,
            Body: message,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          failed++;
          results.push({ to, ok: false, error: data?.message || `HTTP ${res.status}` });
        } else {
          sent++;
          results.push({ to, ok: true, sid: data.sid });
        }
      } catch (e) {
        failed++;
        results.push({ to, ok: false, error: e instanceof Error ? e.message : "send failed" });
      }
      // rate-limit ~10/sec
      await new Promise((r) => setTimeout(r, 110));
    }

    return json({ sent, failed, skipped, results });
  } catch (e) {
    console.error("send-whatsapp error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
