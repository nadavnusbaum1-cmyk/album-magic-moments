// Blog index. Route: /blog
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { FloatingLanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { Seo } from "@/components/Seo";
import { posts } from "@/content/blog";

export default function Blog() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Seo title="בלוג HeyMori — טיפים לשיתוף תמונות מאירועים" description="מדריכים וטיפים לשיתוף תמונות מאירועים, זיהוי פנים חכם, ואיך נותנים לכל אורח את התמונות שלו." path="/blog" />
      <FloatingLanguageSwitcher />
      <main id="main-content" className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("home")}
          </Link>
          <Link to="/" aria-label="HeyMori"><BrandMark className="text-lg" /></Link>
        </div>

        <h1 className="font-serif text-3xl md:text-4xl mb-2">הבלוג של HeyMori</h1>
        <p className="text-muted-foreground mb-10">טיפים ומדריכים לשיתוף תמונות מאירועים.</p>

        <div className="space-y-5">
          {posts.map((p) => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="block rounded-2xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow">
              <div className="flex flex-col sm:flex-row">
                {p.cover && (
                  <div className="sm:w-48 shrink-0 aspect-video sm:aspect-auto bg-muted overflow-hidden">
                    <img src={p.cover} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-5">
                  <h2 className="font-medium text-lg">{p.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{p.description}</p>
                  {p.date && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
                      <CalendarDays className="w-3.5 h-3.5" /> {new Date(p.date).toLocaleDateString("he-IL")}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
          {posts.length === 0 && <p className="text-muted-foreground text-center py-12">בקרוב יעלו כאן פוסטים חדשים ✨</p>}
        </div>
      </main>
    </div>
  );
}
