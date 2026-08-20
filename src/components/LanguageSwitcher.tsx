import { useI18n, Lang } from "@/lib/i18n";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border bg-background/90 backdrop-blur px-1.5 py-1 text-xs shadow-sm ${className}`}>
      <Globe className="w-3.5 h-3.5 text-muted-foreground mx-1" />
      <button
        type="button"
        onClick={() => setLang("en")}
        className={`px-2 py-0.5 rounded-full transition-colors ${lang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("he" as Lang)}
        className={`px-2 py-0.5 rounded-full transition-colors ${lang === "he" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        עב
      </button>
    </div>
  );
}

export function FloatingLanguageSwitcher() {
  return (
    <div className="fixed top-3 right-3 z-50">
      <LanguageSwitcher />
    </div>
  );
}
