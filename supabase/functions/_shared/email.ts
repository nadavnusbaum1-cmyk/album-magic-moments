// Transactional email via Resend. Bilingual (Hebrew + English) HeyMori templates.
//
// Secrets (set with `supabase secrets set ...`):
//   RESEND_API_KEY   – required to actually send (without it, sends are skipped).
//   EMAIL_FROM       – e.g. "HeyMori <noreply@heymori.co.il>" (once the domain is
//                      verified in Resend). Defaults to Resend's test sender.
//   APP_URL          – e.g. "https://heymori.co.il" (for links). Defaults to it.
//   ADMIN_EMAIL      – optional; gets a heads-up when a user requests a paid plan.

const FROM = () => Deno.env.get("EMAIL_FROM") || "HeyMori <onboarding@resend.dev>";
const APP = () => (Deno.env.get("APP_URL") || "https://heymori.co.il").replace(/\/$/, "");

export async function sendEmail(opts: { to: string | string[]; subject: string; html: string }) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.warn("[email] RESEND_API_KEY not set — skipping send:", opts.subject); return { skipped: true }; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: opts.to, subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend error", res.status, body);
    throw new Error(`Email send failed: ${res.status}`);
  }
  return await res.json();
}

// Plan display names (backend keys → bilingual labels). Mirrors src/content/plans.ts.
const PLAN_NAMES: Record<string, { he: string; en: string }> = {
  free: { he: "דמו", en: "Demo" },
  small: { he: "אירוע קטן", en: "Small event" },
  wedding: { he: "חתונה", en: "Wedding" },
  business: { he: "צלם / עסק", en: "Photographer / Business" },
};
const planName = (k: string) => PLAN_NAMES[k] || { he: k, en: k };

function shell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f4fb;font-family:'Nunito',Segoe UI,Arial,sans-serif;color:#2b2540;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="text-align:center;padding:12px 0 18px;">
      <span style="font-size:26px;font-weight:800;letter-spacing:-0.5px;"><span style="color:#2b2540;">Hey</span><span style="color:#7c5cd3;">Mori</span></span>
    </div>
    <div style="background:#ffffff;border-radius:16px;padding:28px;box-shadow:0 6px 22px -6px rgba(124,92,211,0.16);">
      ${inner}
    </div>
    <p style="text-align:center;color:#8b86a0;font-size:12px;margin-top:18px;">HeyMori — ${new Date().getFullYear()}</p>
  </div></body></html>`;
}

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#7c5cd3;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;">${label}</a>`;

const divider = `<hr style="border:none;border-top:1px solid #ece9f6;margin:22px 0;">`;
const enP = (t: string) => `<p style="font-size:13px;color:#6b6680;line-height:1.6;margin:0;" dir="ltr">${t}</p>`;

export function planApprovedEmail(plan: string) {
  const p = planName(plan);
  return {
    subject: `התוכנית שלך ב-HeyMori פעילה · Your HeyMori plan is active`,
    html: shell(`
      <div dir="rtl" style="text-align:right;">
        <h1 style="font-size:22px;margin:0 0 10px;">התוכנית שלך פעילה 🎉</h1>
        <p style="line-height:1.7;margin:0 0 18px;">שדרגנו את החשבון שלך לתוכנית <b>${p.he}</b>. אפשר להתחיל להעלות תמונות וליצור את האירוע שלך.</p>
        <div style="margin:6px 0 4px;">${btn(`${APP()}/dashboard`, "לניהול האירועים")}</div>
      </div>
      ${divider}
      <div style="text-align:left;">
        <p style="font-size:14px;font-weight:700;margin:0 0 6px;" dir="ltr">Your plan is active 🎉</p>
        ${enP(`Your HeyMori account is now on the <b>${p.en}</b> plan. You're all set — head to your dashboard to create your event.`)}
      </div>`),
  };
}

export function planRequestedEmail(plan: string) {
  const p = planName(plan);
  return {
    subject: `קיבלנו את הבקשה שלך · We got your HeyMori request`,
    html: shell(`
      <div dir="rtl" style="text-align:right;">
        <h1 style="font-size:22px;margin:0 0 10px;">קיבלנו את הבקשה שלך 💜</h1>
        <p style="line-height:1.7;margin:0 0 8px;">קיבלנו את בקשתך לתוכנית <b>${p.he}</b>. נאשר אותה בהקדם — בינתיים אפשר כבר להתחיל בתוכנית הדמו.</p>
      </div>
      ${divider}
      <div style="text-align:left;">
        <p style="font-size:14px;font-weight:700;margin:0 0 6px;" dir="ltr">We got your request 💜</p>
        ${enP(`We received your request for the <b>${p.en}</b> plan. We'll confirm it shortly — meanwhile you can start on the Demo tier.`)}
      </div>`),
  };
}

export function adminNewRequestEmail(userEmail: string, plan: string) {
  const p = planName(plan);
  return {
    subject: `New plan request: ${p.en} — ${userEmail}`,
    html: shell(`<div style="text-align:left;" dir="ltr">
      <h1 style="font-size:20px;margin:0 0 10px;">New plan request</h1>
      ${enP(`<b>${userEmail}</b> requested the <b>${p.en}</b> plan. Review and approve in the admin panel.`)}
      <div style="margin-top:16px;">${btn(`${APP()}/admin`, "Open admin")}</div>
    </div>`),
  };
}
