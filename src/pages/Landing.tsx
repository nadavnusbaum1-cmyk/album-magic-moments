// Public marketing landing page. Shown at "/" for logged-out visitors.
import { Link } from "react-router-dom";
import { Camera, Sparkles, Users, Heart, QrCode, Upload, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

export default function Landing() {
  const { t } = useI18n();

  const pillars = [
    { icon: Camera, title: t("pillar_official_title"), desc: t("pillar_official_desc") },
    { icon: Sparkles, title: t("pillar_personal_title"), desc: t("pillar_personal_desc") },
    { icon: Users, title: t("pillar_guest_title"), desc: t("pillar_guest_desc") },
  ];
  const steps = [
    { icon: Camera, title: t("step1_title"), desc: t("step1_desc") },
    { icon: Upload, title: t("step2_title"), desc: t("step2_desc") },
    { icon: QrCode, title: t("step3_title"), desc: t("step3_desc") },
    { icon: Heart, title: t("step4_title"), desc: t("step4_desc") },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingLanguageSwitcher />

      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur bg-background/80 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary fill-current" />
            <span className="font-serif text-xl">{t("brand")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground px-3 py-2">{t("nav_signin")}</Link>
            <Button asChild size="sm"><Link to="/auth?mode=signup">{t("get_started")}</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-soft)" }}>
        <div className="max-w-4xl mx-auto px-5 py-20 md:py-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs text-muted-foreground mb-6">
            <Sparkles className="w-3.5 h-3.5 text-primary" /> {t("hero_badge")}
          </div>
          <h1 className="font-serif text-4xl md:text-6xl leading-tight">{t("hero_title")}</h1>
          <p className="mt-5 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">{t("hero_subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2"><Link to="/auth?mode=signup">{t("get_started")} <ArrowRight className="w-4 h-4 rtl:rotate-180" /></Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how">{t("hero_cta_secondary")}</a></Button>
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="max-w-6xl mx-auto px-5 py-16 md:py-24">
        <h2 className="font-serif text-3xl text-center mb-3">{t("pillars_title")}</h2>
        <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-10">{t("pillars_subtitle")}</p>
        <div className="grid gap-5 md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-soft)" }}>
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <p.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-medium text-lg">{p.title}</h3>
              <p className="text-sm text-muted-foreground mt-2">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-secondary/40 border-y border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-16 md:py-24">
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
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-5 py-20 md:py-28 text-center">
        <h2 className="font-serif text-3xl md:text-4xl">{t("final_title")}</h2>
        <p className="mt-4 text-muted-foreground">{t("final_subtitle")}</p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button asChild size="lg" className="gap-2"><Link to="/auth?mode=signup">{t("get_started")} <ArrowRight className="w-4 h-4 rtl:rotate-180" /></Link></Button>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-primary" /> {t("bullet_1")}</span>
            <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-primary" /> {t("bullet_2")}</span>
            <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-primary" /> {t("bullet_3")}</span>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary fill-current" /> {t("brand")}</div>
          <div>© {t("footer_rights")}</div>
        </div>
      </footer>
    </div>
  );
}
