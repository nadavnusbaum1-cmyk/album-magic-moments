// Plan selection / onboarding, shown after sign-up. Path: /plan
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSession, authedFetch } from "@/lib/auth";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import { plans, savingsPct } from "@/content/plans";
import { useCheckout } from "@/components/CheckoutModal";
import { toast } from "sonner";

export default function PlanSelection() {
  const { t, lang } = useI18n();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const { start: startCheckout, modal: checkoutModal } = useCheckout();

  useEffect(() => { if (!loading && !session) navigate("/auth"); }, [loading, session, navigate]);

  useEffect(() => {
    if (!session) return;
    supabase.from("profiles").select("phone, event_date, marketing_opt_in")
      .eq("id", session.user.id).maybeSingle()
      .then(({ data }) => {
        const p = data as unknown as { phone?: string | null; event_date?: string | null; marketing_opt_in?: boolean } | null;
        if (p?.phone) setPhone(p.phone);
        if (p?.event_date) setEventDate(p.event_date);
        if (typeof p?.marketing_opt_in === "boolean") setMarketing(p.marketing_opt_in);
      });
  }, [session]);

  const choose = async (plan: string) => {
    setSubmitting(plan);
    try {
      // Always persist onboarding + contact details first.
      const r = await authedFetch("select-plan", {
        method: "POST",
        body: JSON.stringify({ plan, phone, event_date: eventDate, marketing_opt_in: marketing }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");

      // Paid plans open the in-page checkout. On success, head to event creation.
      // If payments aren't enabled yet, fall back to the manual request flow above.
      if (plan === "small" || plan === "wedding") {
        const r = await startCheckout("plan", plan, () => navigate("/dashboard?new=1"));
        if (r === "started") { setSubmitting(null); return; }
        // r === "unconfigured" → fall through to the requested/manual flow
      }

      toast.success(j.status === "requested" ? t("plan_requested_done") : t("plan_free_done"));
      navigate("/dashboard");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); setSubmitting(null); }
  };

  if (loading || !session) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
      {checkoutModal}
      <div className="max-w-5xl mx-auto pt-8">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl md:text-4xl">{t("choose_plan_title")}</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">{t("choose_plan_subtitle")}</p>
        </div>

        {/* Optional contact details (captures info for Google signups too) */}
        <Card className="max-w-xl mx-auto p-5 mb-8 space-y-3">
          <div className="text-sm font-medium">{t("contact_details_title")}</div>
          <Input type="tel" placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div>
            <label className="text-xs text-muted-foreground">{t("event_date_label")}</label>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="accent-primary w-4 h-4" />
            {t("marketing_opt_in_label")}
          </label>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-stretch">
          {plans.map((p) => (
            <div key={p.key} className={`rounded-2xl border p-6 bg-background flex flex-col ${p.badge ? "border-primary ring-2 ring-primary/30 relative" : "border-border"}`}>
              {p.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs px-3 py-1">{p.badge[lang]}</span>}
              <h3 className="font-medium text-lg">{p.name[lang]}</h3>
              <div className="mt-3 mb-4 flex items-end flex-wrap gap-2">
                <span className="font-serif text-2xl">{p.price[lang]}</span>
                {p.oldPrice && <span className="text-sm text-muted-foreground line-through mb-1">{p.oldPrice[lang]}</span>}
                {savingsPct(p, lang) > 0 && (
                  <span className="mb-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-0.5">
                    {lang === "he" ? `חיסכון ${savingsPct(p, lang)}%` : `Save ${savingsPct(p, lang)}%`}
                  </span>
                )}
              </div>
              <ul className="space-y-2 text-sm flex-1">
                {p.features.map((f, i) => (
                  <li key={i} className={`flex items-center gap-2 ${f.included ? "" : "text-muted-foreground line-through"}`}>
                    {f.included ? <Check className="w-4 h-4 text-primary shrink-0" /> : <X className="w-4 h-4 text-muted-foreground shrink-0" />}
                    {f.text[lang]}
                  </li>
                ))}
              </ul>
              <Button className="w-full mt-5" variant={p.badge ? "default" : "outline"} disabled={!!submitting} onClick={() => choose(p.key)}>
                {submitting === p.key ? <Loader2 className="w-4 h-4 animate-spin" /> : p.key === "free" ? t("start_free") : t("choose")}
              </Button>
            </div>
          ))}
        </div>

        <div className="text-center mt-6">
          <button onClick={() => choose("free")} disabled={!!submitting} className="text-xs text-muted-foreground hover:text-primary">
            {t("skip_for_now")}
          </button>
        </div>
      </div>
    </div>
  );
}
