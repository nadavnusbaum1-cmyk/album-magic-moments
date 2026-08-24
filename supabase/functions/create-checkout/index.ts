// Authenticated: start an Invoice4U hosted-page checkout for a paid plan or an
// extra event. Prices come from the server-side PLAN_PRICES (never the client).
// Records a 'pending' payment row keyed by an unguessable OrderIdClientUsage,
// then returns the hosted-page ClearingRedirectUrl. Fulfilment happens later in
// i4u-callback. Returns code 'payments_unconfigured' (503) until the key is set,
// so the caller can fall back to the manual request flow pre-launch.
import { corsHeaders, getUser, json, svc } from "../_shared/auth.ts";
import { PLAN_PRICES } from "../_shared/plan.ts";
import { i4uConfig, processClearing } from "../_shared/invoice4u.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { kind, plan } = await req.json() as { kind?: string; plan?: string };
    if (kind !== "plan" && kind !== "extra_event") return json({ error: "Invalid kind" }, 400);
    if (plan !== "small" && plan !== "wedding") return json({ error: "Invalid plan" }, 400);
    const amount = PLAN_PRICES[plan];
    if (!amount) return json({ error: "Plan is not purchasable" }, 400);

    const cfg = i4uConfig();
    if (!cfg.configured) return json({ error: "Payments are not enabled yet", code: "payments_unconfigured" }, 503);

    const supabase = svc();
    const { data: profile } = await supabase.from("profiles").select("display_name, phone").eq("id", user.id).maybeSingle();

    const orderId = crypto.randomUUID();
    const { error: insErr } = await supabase.from("payments").insert({
      user_id: user.id, kind, plan, amount, currency: "NIS", status: "pending", order_id: orderId,
    });
    if (insErr) throw insErr;

    const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/+$/, "");
    const supaUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
    const desc = kind === "extra_event" ? `HeyMori — extra event (${plan})` : `HeyMori — ${plan} plan`;

    let result;
    try {
      result = await processClearing({
        Invoice4UUserApiKey: cfg.apiKey,
        Sum: amount,
        Currency: "NIS",
        Type: 1,
        CreditCardCompanyType: cfg.ccType,
        FullName: profile?.display_name || user.email || "HeyMori customer",
        Phone: profile?.phone || "",
        Email: user.email || "",
        IsAutoCreateCustomer: true,
        Description: desc,
        OrderIdClientUsage: orderId,
        IsDocCreate: true,
        DocHeadline: desc,
        DocLanguage: "he",
        // Sum is VAT-inclusive (the gross amount charged); tell Invoice4U the rate
        // so the tax invoice breaks out 18% VAT from it (net + VAT = Sum).
        TaxPercentage: cfg.vatPercent,
        ReturnUrl: `${appUrl}/checkout/complete`,
        CallBackUrl: `${supaUrl}/functions/v1/i4u-callback`,
        IsQaMode: cfg.qaMode,
      });
    } catch (clearErr) {
      await supabase.from("payments").update({ status: "failed" }).eq("order_id", orderId);
      throw clearErr;
    }

    if (!result.ClearingRedirectUrl) {
      await supabase.from("payments").update({ status: "failed" }).eq("order_id", orderId);
      return json({ error: "No redirect URL from provider" }, 502);
    }
    if (result.PaymentId) await supabase.from("payments").update({ payment_id: result.PaymentId }).eq("order_id", orderId);

    return json({ redirectUrl: result.ClearingRedirectUrl, orderId });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
