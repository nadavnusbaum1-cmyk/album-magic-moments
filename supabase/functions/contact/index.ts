// Public contact form → emails the submission to the HeyMori inbox via Resend.
// Recipient is CONTACT_EMAIL (defaults to info@heymori.co.il).
import { corsHeaders, json } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";

const CONTACT_TO = () => Deno.env.get("CONTACT_EMAIL") || "info@heymori.co.il";
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { name, email, phone, message } = await req.json() as { name?: string; email?: string; phone?: string; message?: string };
    const n = (name || "").trim();
    const e = (email || "").trim();
    const p = (phone || "").trim().slice(0, 40);
    const m = (message || "").trim();

    if (!n || !e || !m) return json({ error: "Missing fields" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ error: "Invalid email" }, 400);
    if (m.length > 5000) return json({ error: "Message too long" }, 400);

    const html = `<div style="font-family:Nunito,Arial,sans-serif;color:#2b2540;">
      <h2 style="margin:0 0 12px;">New contact form message</h2>
      <p style="margin:0 0 4px;"><b>Name:</b> ${esc(n)}</p>
      <p style="margin:0 0 4px;"><b>Email:</b> ${esc(e)}</p>
      ${p ? `<p style="margin:0 0 4px;"><b>Phone:</b> ${esc(p)}</p>` : ""}
      <p style="margin:12px 0 4px;"><b>Message:</b></p>
      <p style="margin:0;white-space:pre-wrap;background:#f5f4fb;border-radius:10px;padding:12px;">${esc(m)}</p>
    </div>`;

    await sendEmail({
      to: CONTACT_TO(),
      subject: `HeyMori contact: ${n}`,
      html,
      replyTo: e, // reply goes straight to the sender
    });

    return json({ ok: true });
  } catch (err) {
    console.error("[contact] failed", err);
    return json({ error: err instanceof Error ? err.message : "Failed" }, 500);
  }
});
