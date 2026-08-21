// Contact page. Route: /contact
import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { Mori } from "@/components/Mori";
import { ContactForm } from "@/components/ContactForm";

export default function Contact() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <FloatingLanguageSwitcher />
      <main id="main-content" className="max-w-md mx-auto px-5 py-12 md:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("home")}
        </Link>

        <div className="text-center mb-8">
          <Mori expression="waving" size={96} className="mx-auto mb-2" />
          <h1 className="font-serif text-3xl">{t("contact_title")}</h1>
          <p className="text-muted-foreground mt-2">{t("contact_subtitle")}</p>
        </div>

        <ContactForm />

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <a href="mailto:info@heymori.co.il" className="inline-flex items-center gap-2 hover:text-primary">
            <Mail className="w-4 h-4" /> info@heymori.co.il
          </a>
        </div>

        <div className="flex justify-center mt-12">
          <Link to="/" aria-label="HeyMori"><BrandMark className="text-lg" /></Link>
        </div>
      </main>
    </div>
  );
}
