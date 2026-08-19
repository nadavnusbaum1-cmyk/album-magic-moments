// Public marketing landing page. Shown at "/" for logged-out visitors.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera, Sparkles, Users, Heart, QrCode, Upload, ArrowRight, Check, X,
  ShieldCheck, Smartphone, FolderTree, Download, ChevronDown,
  PartyPopper, Building2, Medal, GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { Mori } from "@/components/Mori";
import { useI18n } from "@/lib/i18n";
import { landingContent } from "@/content/landing";
import { plans as planTiers } from "@/content/plans";

export default function Landing() {
  const { lang } = useI18n();
  // All landing copy lives in src/content/landing.ts (English + Hebrew side by side).
  const t = (k: string) => landingContent[k]?.[lang] ?? landingContent[k]?.en ?? k;
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const trust = [
    { icon: Sparkles, label: t("trust_ai") },
    { icon: ShieldCheck, label: t("trust_secure") },
    { icon: Smartphone, label: t("trust_noapp") },
    { icon: Users, label: t("trust_unlimited") },
  ];
  const pillars = [
    { icon: Camera, title: t("pillar_official_title"), desc: t("pillar_official_desc") },
    { icon: Sparkles, title: t("pillar_personal_title"), desc: t("pillar_personal_desc") },
    { icon: Users, title: t("pillar_guest_title"), desc: t("pillar_guest_desc") },
  ];
  const useCases = [
    { icon: Heart, label: t("uc_wedding") },
    { icon: Building2, label: t("uc_corporate") },
    { icon: Medal, label: t("uc_race") },
    { icon: GraduationCap, label: t("uc_school") },
    { icon: PartyPopper, label: t("uc_party") },
    { icon: Sparkles, label: t("uc_festival") },
  ];
  const steps = [
    { icon: Camera, title: t("step1_title"), desc: t("step1_desc") },
    { icon: Upload, title: t("step2_title"), desc: t("step2_desc") },
    { icon: QrCode, title: t("step3_title"), desc: t("step3_desc") },
    { icon: Heart, title: t("step4_title"), desc: t("step4_desc") },
  ];
  const features = [
    { icon: Sparkles, title: t("feat_face_title"), desc: t("feat_face_desc") },
    { icon: Users, title: t("feat_guest_title"), desc: t("feat_guest_desc") },
    { icon: FolderTree, title: t("feat_folder_title"), desc: t("feat_folder_desc") },
    { icon: Download, title: t("feat_download_title"), desc: t("feat_download_desc") },
  ];
  const testimonials = [
    { quote: t("testi_1_quote"), role: t("testi_1_role") },
    { quote: t("testi_2_quote"), role: t("testi_2_role") },
    { quote: t("testi_3_quote"), role: t("testi_3_role") },
  ];
  const faqs = [
    { q: t("faq_q1"), a: t("faq_a1") }, { q: t("faq_q2"), a: t("faq_a2") },
    { q: t("faq_q3"), a: t("faq_a3") }, { q: t("faq_q4"), a: t("faq_a4") },
    { q: t("faq_q5"), a: t("faq_a5") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingLanguageSwitcher />

      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <BrandMark avatar avatarSize={40} className="text-xl" />
          <div className="flex items-center gap-2">
            <a href="#pricing" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground px-3 py-2">{t("nav_pricing")}</a>
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">{t("nav_signin")}</Link>
            <Button asChild size="sm"><Link to="/auth?mode=signup">{t("get_started")}</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-soft)" }}>
        <div className="max-w-4xl mx-auto px-5 py-20 md:py-28 text-center">
          <Mori expression="waving" size={128} className="mx-auto mb-4" />
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground mb-6"><Sparkles className="w-3.5 h-3.5 text-primary" /> {t("hero_badge")}</div>
          <h1 className="font-serif text-4xl md:text-6xl leading-tight">{t("hero_title")}</h1>
          <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">{t("hero_subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2"><Link to="/auth?mode=signup">{t("get_started")} <ArrowRight className="w-4 h-4 rtl:rotate-180" /></Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how">{t("hero_cta_secondary")}</a></Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {trust.map((x) => (
              <span key={x.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><x.icon className="w-4 h-4 text-primary" /> {x.label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="max-w-6xl mx-auto px-5 py-16 md:py-24">
        <h2 className="font-serif text-3xl text-center mb-3">{t("pillars_title")}</h2>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10">{t("pillars_subtitle")}</p>
        <div className="grid gap-5 md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4"><p.icon className="w-5 h-5 text-primary" /></div>
              <h3 className="font-medium text-lg">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-2">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-secondary/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-14">
          <h2 className="font-serif text-2xl md:text-3xl text-center mb-2">{t("uc_title")}</h2>
          <p className="text-center text-muted-foreground mb-8">{t("uc_subtitle")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {useCases.map((u) => (
              <div key={u.label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-4 text-center">
                <u.icon className="w-6 h-6 text-primary" /><span className="text-sm">{u.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-16 md:py-24">
        <Mori expression="searching" size={96} className="mx-auto mb-3" />
        <h2 className="font-serif text-3xl text-center mb-10">{t("how_title")}</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="text-center">
              <div className="relative w-14 h-14 mx-auto rounded-2xl bg-background border border-border flex items-center justify-center">
                <s.icon className="w-6 h-6 text-primary" />
                <span className="absolute -top-2 -end-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{i + 1}</span>
              </div>
              <h3 className="font-medium mt-4">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature deep-dive */}
      <section className="bg-secondary/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <Mori expression="phone" size={96} className="mx-auto mb-3" />
          <h2 className="font-serif text-3xl text-center mb-3">{t("feat_title")}</h2>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10">{t("feat_subtitle")}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="flex gap-4 rounded-2xl border border-border bg-background p-6">
                <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center"><f.icon className="w-5 h-5 text-primary" /></div>
                <div><h3 className="font-medium">{f.title}</h3><p className="text-sm text-muted-foreground mt-1">{f.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-5 py-16 md:py-24">
        <h2 className="font-serif text-3xl text-center mb-10">{t("testi_title")}</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((tm, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="flex gap-0.5 text-primary mb-3">{Array.from({ length: 5 }).map((_, j) => <Sparkles key={j} className="w-4 h-4 fill-current" />)}</div>
              <p className="text-sm">{tm.quote}</p>
              <p className="text-xs text-muted-foreground mt-4">— {tm.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-secondary/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
          <h2 className="font-serif text-3xl text-center mb-3">{t("pricing_title")}</h2>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10">{t("pricing_subtitle")}</p>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 items-start">
            {planTiers.map((p) => (
              <div key={p.key} className={`rounded-2xl border p-6 bg-background ${p.badge ? "border-primary ring-2 ring-primary/30 relative" : "border-border"}`}>
                {p.badge && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs px-3 py-1">{p.badge[lang]}</span>}
                <h3 className="font-medium text-lg">{p.name[lang]}</h3>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-serif text-3xl">{p.price[lang]}</span>
                  {p.oldPrice && <span className="text-sm text-muted-foreground line-through mb-1.5">{p.oldPrice[lang]}</span>}
                </div>
                <ul className="mt-5 space-y-2">
                  {p.features.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 text-sm ${f.included ? "" : "text-muted-foreground line-through"}`}>
                      {f.included ? <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />} {f.text[lang]}
                    </li>
                  ))}
                </ul>
                <Button asChild className="w-full mt-6" variant={p.badge ? "default" : "outline"}><Link to="/auth?mode=signup">{t("get_started")}</Link></Button>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-6">{t("pricing_note")}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-5 py-16 md:py-24">
        <h2 className="font-serif text-3xl text-center mb-10">{t("faq_title")}</h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-3 p-4 text-start">
                <span className="font-medium text-sm">{f.q}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && <p className="px-4 pb-4 text-sm text-muted-foreground">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-5 py-20 text-center">
        <Mori expression="celebrating" size={128} className="mx-auto mb-4" />
        <h2 className="font-serif text-3xl md:text-4xl">{t("final_title")}</h2>
        <p className="mt-4 text-muted-foreground">{t("final_subtitle")}</p>
        <div className="mt-8"><Button asChild size="lg" className="gap-2"><Link to="/auth?mode=signup">{t("get_started")} <ArrowRight className="w-4 h-4 rtl:rotate-180" /></Link></Button></div>
      </section>

      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <BrandMark avatar avatarSize={32} className="text-lg" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link to="/legal" className="hover:text-foreground underline">{lang === "he" ? "תנאי שימוש ופרטיות" : "Terms & Privacy"}</Link>
            <Link to="/accessibility" className="hover:text-foreground underline">{lang === "he" ? "הצהרת נגישות" : "Accessibility"}</Link>
            <span>© {t("footer_rights")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
