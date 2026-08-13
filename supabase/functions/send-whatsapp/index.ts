// Host-only: send WhatsApp messages via Twilio (direct REST API) to guest numbers.
// Requires Twilio secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// and optionally TWILIO_WHATSAPP_FROM (falls back to the `from` in the request).
import { corsHeaders, json, requireHost } from "../_shared/auth.ts";

function normalize(num: string): string | null {
  const trimmed = (num || "").trim().replace(/[\s\-()]/g, "");
  if (!trimmed) return null;
  if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) return null; // E.164
  return trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { eventId, from, message, numbers } = await req.json() as {
      eventId?: string; from?: string; message?: string; numbers?: string[];
    };

    if (!eventId) return json({ error: "eventId required" }, 400);
    if (!message || message.length > 1500) return json({ error: "message required (<=1500 chars)" }, 400);
    if (!Array.isArray(numbers) || numbers.length === 0) return json({ error: "numbers required" }, 400);
    if (numbers.length > 500) return json({ error: "Max 500 recipients per send" }, 400);

    const auth = await requireHost(req, eventId);
    if (auth.error) return json({ error: auth.error }, auth.status);

    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!ACCOUNT_SID || !AUTH_TOKEN) return json({ error: "Twilio is not connected (missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)" }, 500);

    const fromNum = normalize(from || Deno.env.get("TWILIO_WHATSAPP_FROM") || "");
    if (!fromNum) return json({ error: "Invalid 'from' number — must be E.164, e.g. +14155238886" }, 400);

    const basic = btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`);
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;

    const results: Array<{ to: string; ok: boolean; sid?: string; error?: string }> = [];
    let sent = 0, failed = 0, skipped = 0;

    for (const raw of numbers) {
      const to = normalize(raw);
      if (!to) { results.push({ to: raw, ok: false, error: "invalid" }); skipped++; continue; }
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: `whatsapp:${to}`,
            From: `whatsapp:${fromNum}`,
            Body: message,
          }),
        });
        const data = await res.json().catch(() => ({}));
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
      await new Promise((r) => setTimeout(r, 110)); // ~10/sec
    }

    return json({ sent, failed, skipped, results });
  } catch (e) {
    console.error("send-whatsapp error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
