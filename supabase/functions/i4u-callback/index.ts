// Public: Invoice4U server-to-server payment callback (verify_jwt=false). The
// provider POSTs form field `Data` = JSON (all string values) after a charge.
// The callback is NOT signed, so we authenticate it by matching the unguessable
// OrderIdClientUsage to a pending payment row AND the amount, then fulfil the
// entitlement idempotently (an atomic pending->paid claim guards duplicates).
// Always returns 200 so the provider doesn't retry-storm.
import { corsHeaders, json, svc } from "../_shared/auth.ts";
import { PLAN_LIMITS } from "../_shared/plan.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Parse the callback payload (form-encoded `Data`, or JSON as a fallback).
    let data: Record<string, string> = {};
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const d = (body as { Data?: unknown }).Data ?? body;
      data = typeof d === "string" ? JSON.parse(d) : (d as Record<string, string>);
    } else {
      const form = await req.formData();
      const raw = form.get("Data");
      data = raw ? JSON.parse(String(raw)) : Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    }

    const orderId = data.OrderIdClientUsage;
    if (!orderId) return json({ ok: false, error: "missing order id" });

    const supabase = svc();
    const { data: pay } = await supabase.from("payments").select("*").eq("order_id", orderId).maybeSingle();
    if (!pay) return json({ ok: false, error: "unknown order" });
    if (pay.status === "paid") return json({ ok: true, already: true }); // idempotent

    const success = String(data.Success).toLowerCase() === "true";
    const amountOk = Math.abs(Number(data.Amount) - Number(pay.amount)) < 0.01;

    if (!success || !amountOk) {
      if (!amountOk && success) console.error("i4u-callback amount mismatch", orderId, data.Amount, pay.amount);
      await supabase.from("payments").update({ status: "failed", raw_callback: data }).eq("id", pay.id);
      return json({ ok: !success, status: "failed" });
    }

    // Atomic claim: only the caller that flips pending->paid fulfils the entitlement.
    const { data: claimed } = await supabase.from("payments")
      .update({
        status: "paid", paid_at: new Date().toISOString(),
        payment_id: data.PaymentId || pay.payment_id,
        document_number: data.DocumentNumber || null,
        document_id: data.DocumentId || null,
        raw_callback: data,
      })
      .eq("id", pay.id).eq("status", "pending").select("id").maybeSingle();
    if (!claimed) return json({ ok: true, already: true });

    try {
      if (pay.kind === "plan") {
        const lim = PLAN_LIMITS[pay.plan as string] || PLAN_LIMITS.free;
        await supabase.from("profiles").update({
          plan: pay.plan, plan_status: "active",
          photo_limit: lim.photo, event_limit: lim.event, storage_days: lim.storage,
          plan_requested: null, plan_updated_at: new Date().toISOString(),
        }).eq("id", pay.user_id);
      } else if (pay.kind === "extra_event") {
        const { data: prof } = await supabase.from("profiles").select("event_limit").eq("id", pay.user_id).maybeSingle();
        const cur = prof?.event_limit ?? 1;
        await supabase.from("profiles").update({ event_limit: cur + 1, plan_updated_at: new Date().toISOString() }).eq("id", pay.user_id);
      }
    } catch (fulfilErr) {
      // Payment is real and recorded 'paid'; entitlement update failed — log loudly
      // for manual reconciliation rather than losing the paid state.
      console.error("i4u-callback FULFILMENT FAILED for paid order", orderId, fulfilErr);
    }

    return json({ ok: true, status: "paid" });
  } catch (e) {
    console.error("i4u-callback error", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unknown" });
  }
});
