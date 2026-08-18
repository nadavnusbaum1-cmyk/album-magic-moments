// Plan selection / onboarding, shown after sign-up. Path: /plan
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useSession, authedFetch } from "@/lib/auth";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export default function PlanSelection() {
  const { t } = useI18n();
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [marketing, setMarketing] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

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

  const plans = [
    { key: "free", name: t("plan_free_name"), price: t("free_price"), photos: t("photos_up_to", { n: "50" }), events: t("one_event"), badge: null as string | null },
    { key: "small", name: t("plan_small_name"), price: t("plan_small_price"), photos: t("photos_up_to", { n: "1,000" }), events: t("one_event"), badge: null },
    { key: "wedding", name: t("plan_wedding_name"), price: t("plan_wedding_price"), photos: t("photos_up_to", { n: "10,000" }), events: t("one_event"), badge: t("most_popular") },
    { key: "business", name: t("plan_business_name"), price: t("custom_price"), photos: t("unlimited_photos"), events: t("unlimited_events"), badge: null },
  ];

  const choose = async (plan: string) => {
    setSubmitting(plan);
    try {
      const r = await authedFetch("select-plan", {
        method: "POST",
        body: JSON.stringify({ plan, phone, event_date: eventDate, marketing_opt_in: marketing }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast.success(j.status === "requested" ? t("plan_requested_done") : t("plan_free_done"));
      navigate("/dashboard");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); setSubmitting(null); }
  };

  if (loading || !session) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--gradient-soft)" }}>
      <FloatingLanguageSwitcher />
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-start">
          {plans.map((p) => (
            <div key={p.key} className={`rounded-2xl border p-6 bg-background flex flex-col ${p.badge ? "border-primary ring-2 ring-primary/30 relative" : "border-border"}`}>
              {p.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs px-3 py-1">{p.badge}</span>}
              <h3 className="font-medium text-lg">{p.name}</h3>
              <div className="mt-3 mb-4 font-serif text-2xl">{p.price}</div>
              <ul className="space-y-2 text-sm flex-1">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-primary shrink-0" /> {p.photos}</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-primary shrink-0" /> {p.events}</li>
                <li className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary shrink-0" /> {t("feature_face_short")}</li>
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
