// Accessibility statement (הצהרת נגישות). Route: /accessibility
// Content is editable in src/content/accessibility.ts.
import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { coordinator, lastUpdated, statement } from "@/content/accessibility";

export default function Accessibility() {
  const { lang, t } = useI18n();
  const L = (o: { en: string; he: string }) => o[lang];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingLanguageSwitcher />
      <main id="main-content" className="max-w-2xl mx-auto px-5 py-12 md:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("home")}
        </Link>

        <h1 className="font-serif text-3xl md:text-4xl mb-2">{L(statement.pageTitle)}</h1>
        <p className="text-xs text-muted-foreground mb-8">{lang === "he" ? "עודכן לאחרונה: " : "Last updated: "}{L(lastUpdated)}</p>

        <div className="space-y-8 leading-relaxed">
          <p className="text-muted-foreground">{L(statement.intro)}</p>

          <section>
            <h2 className="font-medium text-lg mb-2">{L(statement.standardTitle)}</h2>
            <p className="text-muted-foreground">{L(statement.standard)}</p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">{L(statement.featuresTitle)}</h2>
            <ul className="list-disc space-y-1.5 text-muted-foreground ps-5">
              {statement.features[lang].map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">{L(statement.browsersTitle)}</h2>
            <p className="text-muted-foreground">{L(statement.browsers)}</p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">{L(statement.limitationsTitle)}</h2>
            <p className="text-muted-foreground">{L(statement.limitations)}</p>
          </section>

          <section>
            <h2 className="font-medium text-lg mb-2">{L(statement.feedbackTitle)}</h2>
            <p className="text-muted-foreground">{L(statement.feedback)}</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-medium text-lg mb-2">{L(statement.contactTitle)}</h2>
            <p className="text-muted-foreground mb-4">{L(statement.contactIntro)}</p>
            <div className="space-y-2 text-sm">
              <div className="font-medium">{L(coordinator.role)}</div>
              {coordinator.email && (
                <a href={`mailto:${coordinator.email}`} className="flex items-center gap-2 text-primary hover:underline">
                  <Mail className="w-4 h-4" /> {coordinator.email}
                </a>
              )}
              {coordinator.phone && (
                <a href={`tel:${coordinator.phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 text-primary hover:underline" dir="ltr">
                  <Phone className="w-4 h-4" /> {coordinator.phone}
                </a>
              )}
              {!coordinator.email && !coordinator.phone && (
                <p className="text-muted-foreground">{L(statement.contactPending)}</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
